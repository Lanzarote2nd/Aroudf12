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
      const memberships = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);
      if (memberships.error) throw memberships.error;

      const ids = memberships.data.map((item) => item.conversation_id);
      if (!ids.length) return res.status(200).json([]);

      const memberRows = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id, profiles!conversation_members_user_id_fkey(username, full_name, avatar_url)')
        .in('conversation_id', ids);
      if (memberRows.error) throw memberRows.error;

      const conversations = await supabase
        .from('conversations')
        .select('id, updated_at, last_message')
        .in('id', ids)
        .order('updated_at', { ascending: false });
      if (conversations.error) throw conversations.error;

      const mapped = conversations.data.map((conversation) => {
        const peer = memberRows.data.find((row) => row.conversation_id === conversation.id && row.user_id !== user.id);
        return {
          conversation_id: conversation.id,
          username: peer?.profiles?.username || 'unknown',
          full_name: peer?.profiles?.full_name || null,
          avatar_url: peer?.profiles?.avatar_url || null,
          last_message: conversation.last_message,
          updated_at: conversation.updated_at,
        };
      });

      return res.status(200).json(mapped);
    }

    if (req.method === 'POST') {
      const { recipient_id } = req.body;
      if (!recipient_id) return res.status(400).json({ error: 'recipient_id is required' });

      const myMemberships = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);
      if (myMemberships.error) throw myMemberships.error;

      const ids = myMemberships.data.map((item) => item.conversation_id);
      if (ids.length) {
        const peerMemberships = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', recipient_id)
          .in('conversation_id', ids);
        if (peerMemberships.error) throw peerMemberships.error;
        if (peerMemberships.data.length) {
          return res.status(200).json({ id: peerMemberships.data[0].conversation_id });
        }
      }

      const created = await supabase.from('conversations').insert({ created_by: user.id, last_message: null }).select().single();
      if (created.error) throw created.error;

      const membershipInsert = await supabase.from('conversation_members').insert([
        { conversation_id: created.data.id, user_id: user.id },
        { conversation_id: created.data.id, user_id: recipient_id },
      ]);
      if (membershipInsert.error) throw membershipInsert.error;

      return res.status(201).json(created.data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
