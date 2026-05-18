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

function fallbackUsername(email) {
  return (email || 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) || `user${Math.floor(Math.random() * 1000)}`;
}

async function buildUniqueUsername(base, userId) {
  const sanitized = (base || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) || 'user';
  let candidate = sanitized;
  let attempt = 0;

  while (attempt < 20) {
    const { data, error } = await supabase.from('profiles').select('id').eq('username', candidate).maybeSingle();
    if (error) throw error;
    if (!data || data.id === userId) return candidate;
    attempt += 1;
    candidate = `${sanitized.slice(0, Math.max(1, 18 - String(attempt).length))}${attempt}`;
  }

  return `${sanitized.slice(0, 14)}${Date.now().toString().slice(-4)}`;
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
      let { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (error) throw error;

      if (!data) {
        const username = await buildUniqueUsername(fallbackUsername(user.email), user.id);
        const created = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            username,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
            avatar_url: user.user_metadata?.avatar_url || null,
          })
          .select()
          .single();
        if (created.error) throw created.error;
        data = created.data;
      }

      return res.status(200).json({ profile: data });
    }

    if (req.method === 'PUT') {
      const { username, full_name } = req.body;
      if (!username) return res.status(400).json({ error: 'username is required' });
      const nextUsername = await buildUniqueUsername(username, user.id);
      const { data, error } = await supabase
        .from('profiles')
        .update({ username: nextUsername, full_name })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
