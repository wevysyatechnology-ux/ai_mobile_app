// Vapi Custom Function tool: search members by profession/business category, city,
// and/or capability keyword ("What I Can Help With").
// Deploy with: supabase functions deploy search-members
// Register in Vapi dashboard as a Custom Function named "search_members" with
// parameters { profession?: string, location?: string, keyword?: string }.
//
// Calls the same search_eligible_members() RPC that services/memberSearchService.ts
// calls (supabase/migrations/20260827120200_create_search_eligible_members_rpc.sql),
// so the eligibility rule (approval_status, membership_status, is_suspended,
// mobile_app_access) lives in exactly one place instead of being duplicated here.
// SECURITY DEFINER functions are callable by the service-role client same as any
// other role with EXECUTE granted (granted to service_role in that migration).

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

// Vapi sends { message: { toolCalls: [{ id, function: { name, arguments } }] } }
// and expects back { results: [{ toolCallId, result: "<string>" }] }.
function extractToolCalls(payload: any): Array<{ id: string; args: any }> {
  const calls = payload?.message?.toolCalls || payload?.message?.toolCallList || [];
  return calls.map((c: any) => ({
    id: c.id,
    args: c.function?.arguments || c.arguments || {},
  }));
}

async function searchMembers(profession?: string, location?: string, keyword?: string): Promise<string> {
  const { data, error } = await supabase.rpc('search_eligible_members', {
    p_query: null,
    p_profession: profession ?? null,
    p_location: location ?? null,
    p_keyword: keyword ?? null,
    p_limit: 10,
  });

  if (error) return `Sorry, the member search failed: ${error.message}`;
  if (!data || data.length === 0) return 'No members found matching that search.';

  // No phone_number in the spoken response — this is a voice tool response, not
  // the in-app directory UI, and reciting phone numbers aloud isn't useful. The
  // RPC returns phone_number (used by the in-app path) but it's simply never
  // included below. Direct the user to the app for contact details.

  const preview = data
    .slice(0, 5)
    .map((m: any) => `${m.full_name} (${m.business_category || 'business'}, ${m.city || 'location unknown'})`)
    .join('; ');
  return `Found ${data.length} member${data.length === 1 ? '' : 's'}: ${preview}. Open the Discover tab to see full contact details.`;
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
        result: await searchMembers(call.args?.profession, call.args?.location, call.args?.keyword),
      }))
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('search-members error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
