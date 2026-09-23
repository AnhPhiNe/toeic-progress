import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!url || !publicKey || !serviceKey) return Response.json({ error: 'Server configuration missing' }, { status: 500, headers: cors });
  if (!token) return Response.json({ error: 'Authentication required' }, { status: 401, headers: cors });

  const authClient = createClient(url, publicKey, { auth: { persistSession: false } });
  const { data, error: authError } = await authClient.auth.getUser(token);
  if (authError || !data.user) return Response.json({ error: 'Invalid session' }, { status: 401, headers: cors });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) return Response.json({ error: 'Could not delete account' }, { status: 500, headers: cors });
  return Response.json({ deleted: true }, { headers: cors });
});
