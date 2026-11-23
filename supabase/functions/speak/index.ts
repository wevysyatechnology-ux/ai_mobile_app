// Supabase Edge Function for secure OpenAI Text-to-Speech
// Deploy with: supabase functions deploy speak --no-verify-jwt
// Environment variables needed: OPENAI_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const openAiApiKey = Deno.env.get('OPENAI_API_KEY');

// CORS headers for browser clients
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  try {
    if (!openAiApiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }

    const { text, voice = 'nova', model = 'tts-1' } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: text field is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Call OpenAI Text-to-Speech API
    // voice options: alloy, echo, fable, onyx, nova, shimmer
    // model: gpt-4o-mini-tts — best multilingual quality (Hindi + South Indian)
    const openAiResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: 'mp3',
      }),
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      return new Response(
        JSON.stringify({ error: `OpenAI TTS error: ${openAiResponse.status} - ${errorText}` }),
        {
          status: openAiResponse.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Stream the audio back to the client
    return new Response(openAiResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Speak function error:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
