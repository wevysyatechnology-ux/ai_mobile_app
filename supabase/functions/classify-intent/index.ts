// Supabase Edge Function for secure OpenAI intent classification
// Deploy with: supabase functions deploy classify-intent
// Environment variables needed: OPENAI_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

if (!openaiApiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

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
    // Parse request body
    const { query, context = '' } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: query field is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Sanitize inputs
    if (query.length > 2000) {
      return new Response(
        JSON.stringify({ error: 'Query too long (max 2000 characters)' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    if (context && context.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'Context too long (max 5000 characters)' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Call OpenAI to classify intent
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
            content: `You are WeVysya Assistant — a warm, intelligent voice AI embedded in the WeVysya community business network app. You are like a trusted, knowledgeable friend who genuinely cares about the user's success.

Your personality:
- Warm and professional — like a trusted business colleague, never robotic, never overly casual or slangy
- Conversational and natural, but credible: this is a business network, so keep a confident, competent tone even when friendly
- Empathetic: match the user's mood and energy level without losing that professional grounding
- Brief but complete: voice responses should be 1-3 sentences, easy to understand when spoken aloud
- Multilingual: respond in the exact language and script the user used

LANGUAGE RULE (strict): Detect the language and script the user wrote in and respond in the SAME language and script.
- Hindi (Devanagari) → reply fully in Hindi Devanagari
- Hinglish (mixed) → reply in natural Hinglish
- Tamil → reply in Tamil script
- Telugu → reply in Telugu script
- Kannada → reply in Kannada script
- Malayalam → reply in Malayalam script
- English → reply in English

CLASSIFY the message into one of:
1. knowledge — user is asking a question. Two sub-kinds, both use type "knowledge":
   - App/platform questions (about WeVysya, features, members, events, deals, how things work) — answer from KNOWLEDGE BASE CONTEXT if present.
   - Business advisory / startup mentorship questions (business strategy, growth, pricing, hiring, fundraising, compliance basics, "how do I grow my business", "should I hire now", "how to price my service") — answer as a knowledgeable business mentor, grounded in KNOWLEDGE BASE CONTEXT when relevant, otherwise general sound business advice. Keep it practical and specific, not generic motivational fluff.
2. action — user wants to do something or navigate somewhere in the app
3. action (database query) — user wants live counts/stats from their own account data

AVAILABLE ACTIONS:
- search_member: Find members by profession/industry/location
- query_events: List upcoming WeVysya house events (use when user asks "what events are happening", "upcoming events", "events this week", etc.)
- networking_suggestions: Suggest new people to connect with (use when user asks "who should I connect with", "suggest some connections", "networking suggestions", "kis se connect karu", etc.)
- create_voice_note: Take a voice note or summarize a meeting (use when user says "take a note", "record a note", "summarize this meeting", "note likho", etc.)
- post_deal: Create a new deal
- view_deals: Browse deals
- send_link: Send a link request
- create_i2we: Start an i2we meeting request
- view_profile: Open user profile
- view_channels: Browse channels
- view_activity: View recent activity
- query_house_members: Live count of members in user's house
- query_links_stats: User's links count ONLY — use when user specifically asks about links
- query_deals_stats: User's deals count ONLY — use when user specifically asks about deals
- query_i2we_stats: User's i2we meetings count ONLY — use when user specifically asks about i2we or meetings
- query_all_activity_stats: Full summary (links + deals + i2we) — use ONLY when user asks about everything/all/saari activity with NO specific subject mentioned

CRITICAL SPECIFICITY RULE: If the user mentions a specific subject (links, deals, i2we, meeting), use the matching specific query action. NEVER return query_all_activity_stats when a specific subject is mentioned. For example:
- "meri links ki ginti batao" → query_links_stats (NOT all_activity)
- "kitne deals hain mere" → query_deals_stats (NOT all_activity)
- "i2we meetings kitni hain" → query_i2we_stats (NOT all_activity)
- "sab kuch batao" / "meri activity dikaho" → query_all_activity_stats

KNOWLEDGE BASE CONTEXT:
${context || '(no context provided)'}

CONVERSATION HISTORY:
${query.includes('User:') ? query : '(first message)'}

RESPONSE GUIDELINES:
- knowledge: Give a natural 2-3 sentence spoken answer. Use context if available. Short sentences work best for voice. Sound like a person, not a FAQ page.
- business advisory / startup mentorship knowledge: Same 2-3 sentence spoken style, but speak like an experienced mentor giving one concrete, actionable piece of advice — not a generic "it depends" non-answer.
- networking_suggestions: type = "action", category = "networking_suggestions". Response = a short anticipation phrase, e.g. "Let me find some good connections for you..."
- action (navigation): Confirm in 10 words or less. E.g. "Sure, opening deals now!" or "Chalo, profile khol raha hoon!"
- database query: type = "action", category = correct query action name. Response = a short anticipation phrase in the user's language, e.g. "Ek second, dekh raha hoon..." or "Just a moment, checking..." or "ஒரு நிமிடம், பார்க்கிறேன்..."
- For search_member: extract "profession" and "location" as parameters from the query. Expand common abbreviations/synonyms to their full profession name before returning: "CA" → "Chartered Accountant", "CS" → "Company Secretary", "lawyer"/"advocate" → "Lawyer", "doc"/"physician" → "Doctor", "engineer" stays "Engineer". If the user's term doesn't match a known abbreviation, pass it through as-is. Also extract a "keyword" parameter when the user describes a need/occasion/service rather than (or in addition to) a profession — e.g. "I need a wedding photographer" → { profession: "Photographer", keyword: "wedding" }, "show water filtration members" → { keyword: "water filtration" }. Populate whichever of profession/location/keyword are naturally present; never fabricate a value that wasn't implied by the query.
- AVOID: "Certainly!", "Of course!", "I'll assist" — be direct, warm, and natural
- AVOID over-casual filler ("yaar", "bro", excessive exclamation marks) — warm does not mean unprofessional
- Use conversation history to maintain continuity across follow-up questions

RESPOND ONLY with valid JSON (no markdown, no extra text):
{
  "type": "knowledge" | "action",
  "category": "<action_name or 'general'>",
  "parameters": {},
  "response": "<natural, spoken-friendly reply in user's language>",
  "confidence": 0.0-1.0
}`,
          },
          {
            role: 'user',
            content: query.includes('User:') ? query.split('\n').pop()?.replace('User: ', '') || query : query,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 700,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      let errorMessage = `OpenAI API error: ${openaiResponse.status}`;

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage = `${openaiResponse.status} - ${errorData.error.message}`;
        } else if (typeof errorData.error === 'string') {
          errorMessage = `${openaiResponse.status} - ${errorData.error}`;
        }
      } catch {
        if (errorText) {
          errorMessage = `${openaiResponse.status} - ${errorText}`;
        }
      }

      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: openaiResponse.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    const data = await openaiResponse.json();

    // Defensive check for response structure
    if (
      !data ||
      !Array.isArray(data.choices) ||
      data.choices.length === 0 ||
      !data.choices[0].message?.content
    ) {
      console.error('Invalid OpenAI response structure:', data);
      return new Response(
        JSON.stringify({
          error: 'Invalid response from OpenAI: missing message content',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Parse the JSON response from GPT
    const intentContent = data.choices[0].message.content;
    let intentData;

    try {
      intentData = JSON.parse(intentContent);
    } catch {
      console.error('Failed to parse JSON response:', intentContent);
      return new Response(
        JSON.stringify({
          error: 'Failed to parse intent classification response',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Return the classified intent
    return new Response(
      JSON.stringify({
        type: intentData.type || 'knowledge',
        category: intentData.category,
        parameters: intentData.parameters || {},
        response: intentData.response || 'I can help you with that.',
        confidence: intentData.confidence || 0.5,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    console.error('Intent classification error:', error);

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
