// Vapi Custom Function tool: personal dashboard stats (links/deals/i2we counts).
// Deploy with: supabase functions deploy vapi-tools --no-verify-jwt
// Backs the "get_user_dashboard" Custom Function tool in the Vapi dashboard.
//
// Replaces a broken previous deployment that referenced undefined variables
// (accessToken/userId/toolCallList) left over from an incomplete edit — every
// call threw a ReferenceError, which is why asking about personal stats during
// a live Vapi call always ejected the call.
//
// Query logic mirrors services/activityQueryService.ts (used by the Voice OS
// engine for the same stats) so both engines report consistent numbers.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// Reuses the same shared secret already configured for search-members/query-events —
// Vapi's tool-call webhooks can't send a Supabase JWT, so --no-verify-jwt deploy +
// this header is the auth gate (see those two functions for the identical pattern).
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

// Vapi echoes the whole assistantOverrides object (sent from vapiService.ts at
// call start) back under message.call.assistantOverrides on every tool-call
// webhook request — NOT flattened onto message.call.metadata directly (confirmed
// via a live payload dump). That's the authoritative source for "which user."
// Falls back to a tool-argument `id` in case the tool is ever configured to pass
// it as an LLM-filled parameter instead.
function extractUserId(payload: any, call: { args: any }): string | null {
  const overrides = payload?.message?.call?.assistantOverrides;
  return overrides?.metadata?.userId || overrides?.variableValues?.userId || call.args?.id || null;
}

async function getLinkStats(uid: string) {
  const { data, error } = await supabase
    .from('core_links')
    .select('status, from_user_id, to_user_id')
    .or(`from_user_id.eq.${uid},to_user_id.eq.${uid}`);

  if (error) throw error;
  const rows = data || [];
  return {
    total: rows.length,
    sent: rows.filter((r: any) => r.from_user_id === uid).length,
    received: rows.filter((r: any) => r.to_user_id === uid).length,
    open: rows.filter((r: any) => r.status === 'open').length,
    closed: rows.filter((r: any) => r.status === 'closed').length,
  };
}

async function getDealStats(uid: string) {
  const { data: ownDeals, error: ownError } = await supabase
    .from('core_deals')
    .select('id, status, creator_id')
    .or(`creator_id.eq.${uid},from_member_id.eq.${uid},to_member_id.eq.${uid}`);

  if (ownError) throw ownError;

  const { data: partDeals } = await supabase
    .from('deal_participants')
    .select('deal_id')
    .eq('user_id', uid);

  const ownIds = new Set((ownDeals || []).map((d: any) => d.id));
  const partCount = (partDeals || []).filter((p: any) => !ownIds.has(p.deal_id)).length;
  const rows = ownDeals || [];

  return {
    total: rows.length + partCount,
    open: rows.filter((r: any) => r.status === 'open').length,
    in_progress: rows.filter((r: any) => r.status === 'in_progress').length,
    completed: rows.filter((r: any) => r.status === 'completed').length,
    closed: rows.filter((r: any) => r.status === 'closed').length,
    as_creator: rows.filter((r: any) => r.creator_id === uid).length,
    as_participant: partCount,
  };
}

async function getI2weStats(uid: string) {
  const { data, error } = await supabase
    .from('core_i2we')
    .select('status')
    .or(`member_1_id.eq.${uid},member_2_id.eq.${uid}`);

  if (error) throw error;
  const rows = data || [];
  return {
    total: rows.length,
    scheduled: rows.filter((r: any) => r.status === 'scheduled').length,
    completed: rows.filter((r: any) => r.status === 'completed').length,
    cancelled: rows.filter((r: any) => r.status === 'cancelled').length,
  };
}

async function handleDashboardQuery(userId: string | null, entityType: string): Promise<string> {
  if (!userId) {
    return "I couldn't verify your account for that. Please try again after logging in.";
  }

  try {
    if (entityType === 'links') {
      const s = await getLinkStats(userId);
      return `You have ${s.total} links total: ${s.sent} sent, ${s.received} received. ${s.open} are open and ${s.closed} are closed.`;
    }
    if (entityType === 'deals') {
      const s = await getDealStats(userId);
      return `You have ${s.total} deals total: ${s.open} open, ${s.in_progress} in progress, ${s.completed} completed, and ${s.closed} closed.`;
    }
    if (entityType === 'i2We') {
      const s = await getI2weStats(userId);
      return `You have ${s.total} i2We meetings total: ${s.scheduled} scheduled, ${s.completed} completed, and ${s.cancelled} cancelled.`;
    }
    return `Sorry, I don't know how to look up "${entityType}" yet.`;
  } catch (error) {
    console.error('vapi-tools dashboard query failed:', error);
    return "Sorry, I couldn't fetch that information right now.";
  }
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
      toolCalls.map(async (call) => {
        const userId = extractUserId(payload, call);
        const entityType = call.args?.entityType;
        return { toolCallId: call.id, result: await handleDashboardQuery(userId, entityType) };
      })
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('vapi-tools error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
