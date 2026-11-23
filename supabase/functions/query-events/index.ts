// Vapi Custom Function tool: list upcoming WeVysya house events.
// Deploy with: supabase functions deploy query-events
// Register in Vapi dashboard as a Custom Function named "query_events" with no required parameters.
//
// Reuses the same query shape as services/eventsService.ts (kept in sync manually —
// edge functions are a separate Deno runtime and can't import the RN app's TS services).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// Shared secret configured on the Vapi Custom Function ("Server > Secret" field),
// sent back as the x-vapi-secret header on every call. This function is deployed
// with --no-verify-jwt (Vapi can't send a Supabase JWT), so this is the only auth gate.
const vapiToolSecret = Deno.env.get('VAPI_TOOL_SECRET');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable');
}
if (!vapiToolSecret) {
  throw new Error('Missing VAPI_TOOL_SECRET environment variable');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function extractToolCalls(payload: any): Array<{ id: string; args: any }> {
  const calls = payload?.message?.toolCalls || payload?.message?.toolCallList || [];
  return calls.map((c: any) => ({
    id: c.id,
    args: c.function?.arguments || c.arguments || {},
  }));
}

async function queryEvents(): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('events')
    .select('title, event_date')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(5);

  if (error) return `Sorry, I couldn't fetch upcoming events: ${error.message}`;
  if (!data || data.length === 0) return 'There are no upcoming events scheduled right now.';

  const preview = data.map((e: any) => `${e.title || 'an event'} on ${e.event_date}`).join(', ');
  return `You have ${data.length} upcoming event${data.length === 1 ? '' : 's'}: ${preview}.`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.headers.get('x-vapi-secret') !== vapiToolSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  try {
    const payload = await req.json();
    const toolCalls = extractToolCalls(payload);

    const results = await Promise.all(
      toolCalls.map(async (call) => ({
        toolCallId: call.id,
        result: await queryEvents(),
      }))
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('query-events error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
