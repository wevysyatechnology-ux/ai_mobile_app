// Supabase Edge Function to summarize a voice note / meeting transcript
// Deploy with: supabase functions deploy summarize-text
// Environment variables needed: OPENAI_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

if (!openaiApiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: transcript field is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (transcript.length > 20000) {
      return new Response(
        JSON.stringify({ error: 'Transcript too long (max 20000 characters)' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You summarize voice notes and meeting transcripts for the WeVysya business network app.

Respond with a short summary (2-4 sentences) and a list of concrete action items (if any are mentioned or implied — otherwise an empty array). Keep the summary factual and specific, not generic. Preserve names, numbers, dates and commitments mentioned in the transcript.

RESPOND ONLY with valid JSON (no markdown, no extra text):
{
  "summary": "<2-4 sentence summary>",
  "action_items": ["<action item 1>", "<action item 2>"]
}`,
          },
          {
            role: 'user',
            content: transcript,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      let errorMessage = `OpenAI API error: ${openaiResponse.status}`;

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage = `${openaiResponse.status} - ${errorData.error.message}`;
        }
      } catch {
        if (errorText) errorMessage = `${openaiResponse.status} - ${errorText}`;
      }

      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: openaiResponse.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const data = await openaiResponse.json();

    if (
      !data ||
      !Array.isArray(data.choices) ||
      data.choices.length === 0 ||
      !data.choices[0].message?.content
    ) {
      console.error('Invalid OpenAI response structure:', data);
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI: missing message content' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    let result;
    try {
      result = JSON.parse(data.choices[0].message.content);
    } catch {
      console.error('Failed to parse JSON response:', data.choices[0].message.content);
      return new Response(
        JSON.stringify({ error: 'Failed to parse summary response' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({
        summary: result.summary || '',
        action_items: Array.isArray(result.action_items) ? result.action_items : [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('Summarize-text error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
