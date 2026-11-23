// Supabase Edge Function for secure OpenAI Whisper transcription
// Deploy with: supabase functions deploy transcribe --no-verify-jwt
// Environment variables needed: OPENAI_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const openAiApiKey = Deno.env.get('OPENAI_API_KEY');

// CORS headers for browser clients
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Map our language codes to BCP-47 codes that Whisper understands
const languageMap: Record<string, string> = {
  en: 'en',
  hi: 'hi',
  ta: 'ta',
  te: 'te',
  kn: 'kn',
  ml: 'ml',
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

    // Get multipart form data
    const formData = await req.formData();
    const audioFile = formData.get('file');
    const language = (formData.get('language') || 'en') as string;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: file field is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Validate language
    if (language.length > 10) {
      return new Response(
        JSON.stringify({ error: 'Invalid language parameter' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Build OpenAI Whisper request
    const whisperForm = new FormData();
    whisperForm.append('file', audioFile as Blob, 'audio.m4a');
    whisperForm.append('model', 'whisper-1');

    // Pass language hint to Whisper (improves accuracy and speed)
    const whisperLang = languageMap[language] || language;
    whisperForm.append('language', whisperLang);

    // Call OpenAI Whisper API
    const openAiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
      },
      body: whisperForm,
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      return new Response(
        JSON.stringify({ error: `OpenAI Whisper error: ${openAiResponse.status} - ${errorText}` }),
        {
          status: openAiResponse.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    const data = await openAiResponse.json();

    // Return in same format as before for frontend compatibility
    return new Response(
      JSON.stringify({ text: data.text || '' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    console.error('Transcribe function error:', error);

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
