import supabase from './_supabase.js';

async function getUserFromToken(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const memberships = await supabase.from('conversation_members').select('conversation_id').eq('user_id', user.id);
      if (memberships.error) throw memberships.error;
      const ids = memberships.data.map((item) => item.conversation_id);
      if (!ids.length) return res.status(200).json([]);
      const calls = await supabase
        .from('call_logs')
        .select('id, call_type, status, started_at, ended_at, conversation_id')
        .in('conversation_id', ids)
        .order('started_at', { ascending: false })
        .limit(10);
      if (calls.error) throw calls.error;
      const peers = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id, profiles!conversation_members_user_id_fkey(username)')
        .in('conversation_id', calls.data.map((item) => item.conversation_id));
      if (peers.error) throw peers.error;
      const mapped = calls.data.map((call) => ({
        ...call,
        peer_username: peers.data.find((peer) => peer.conversation_id === call.conversation_id && peer.user_id !== user.id)?.profiles?.username || 'unknown',
      }));
      return res.status(200).json(mapped);
    }

    if (req.method === 'POST') {
      const { conversation_id, call_type } = req.body;
      const membership = await supabase.from('conversation_members').select('id').eq('conversation_id', conversation_id).eq('user_id', user.id).maybeSingle();
      if (!membership.data) return res.status(401).json({ error: 'Unauthorized conversation access' });
      const started_at = new Date().toISOString();
      const ended_at = new Date(Date.now() + 1000 * 60 * 12).toISOString();
      const { data, error } = await supabase
        .from('call_logs')
        .insert({ conversation_id, initiated_by: user.id, call_type, status: 'saved', started_at, ended_at })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
