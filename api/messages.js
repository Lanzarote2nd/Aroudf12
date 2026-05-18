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

async function canAccessConversation(userId, conversationId) {
  const membership = await supabase.from('conversation_members').select('id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle();
  return !!membership.data;
}

async function canAccessServer(userId, serverId) {
  const membership = await supabase.from('server_members').select('id').eq('server_id', serverId).eq('user_id', userId).maybeSingle();
  return !!membership.data;
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
      const conversationId = req.query.conversation_id ? Number(req.query.conversation_id) : null;
      const serverId = req.query.server_id ? Number(req.query.server_id) : null;

      if (conversationId) {
        const allowed = await canAccessConversation(user.id, conversationId);
        if (!allowed) return res.status(401).json({ error: 'Unauthorized conversation access' });
        const { data, error } = await supabase
          .from('messages')
          .select('id, content, created_at, sender_id, conversation_id, profiles!messages_sender_id_fkey(username, full_name)')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return res.status(200).json(data.map((item) => ({ ...item, username: item.profiles?.username, full_name: item.profiles?.full_name })));
      }

      if (serverId) {
        const allowed = await canAccessServer(user.id, serverId);
        if (!allowed) return res.status(401).json({ error: 'Unauthorized server access' });
        const { data, error } = await supabase
          .from('messages')
          .select('id, content, created_at, sender_id, server_id, profiles!messages_sender_id_fkey(username, full_name)')
          .eq('server_id', serverId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return res.status(200).json(data.map((item) => ({ ...item, username: item.profiles?.username, full_name: item.profiles?.full_name })));
      }

      return res.status(400).json({ error: 'conversation_id or server_id is required' });
    }

    if (req.method === 'POST') {
      const { content, conversation_id, server_id } = req.body;
      if (!content) return res.status(400).json({ error: 'content is required' });

      if (conversation_id) {
        const allowed = await canAccessConversation(user.id, conversation_id);
        if (!allowed) return res.status(401).json({ error: 'Unauthorized conversation access' });
        const created = await supabase.from('messages').insert({ content, conversation_id, sender_id: user.id }).select().single();
        if (created.error) throw created.error;
        const updatedConversation = await supabase.from('conversations').update({ last_message: content, updated_at: new Date().toISOString() }).eq('id', conversation_id);
        if (updatedConversation.error) throw updatedConversation.error;
        return res.status(201).json(created.data);
      }

      if (server_id) {
        const allowed = await canAccessServer(user.id, server_id);
        if (!allowed) return res.status(401).json({ error: 'Unauthorized server access' });
        const created = await supabase.from('messages').insert({ content, server_id, sender_id: user.id }).select().single();
        if (created.error) throw created.error;
        return res.status(201).json(created.data);
      }

      return res.status(400).json({ error: 'conversation_id or server_id is required' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
