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
      const memberships = await supabase.from('server_members').select('server_id').eq('user_id', user.id);
      if (memberships.error) throw memberships.error;
      const ids = memberships.data.map((item) => item.server_id);
      if (!ids.length) return res.status(200).json([]);
      const { data, error } = await supabase.from('servers').select('*').in('id', ids).order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { name, description } = req.body;
      const created = await supabase
        .from('servers')
        .insert({ name, description, owner_id: user.id })
        .select()
        .single();
      if (created.error) throw created.error;
      const membership = await supabase.from('server_members').insert({ server_id: created.data.id, user_id: user.id, role: 'owner' });
      if (membership.error) throw membership.error;
      return res.status(201).json(created.data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
