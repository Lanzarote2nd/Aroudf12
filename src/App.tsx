import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Bell, Camera, Hash, LoaderCircle, LogOut, MessageSquare, Mic, Phone, Plus, Save, Search, Send, Settings, Shield, UserPlus, Video, Wifi } from 'lucide-react';
import supabase from './lib/supabase';
import { signInWithGoogle } from './lib/googleAuth';

type AuthView = 'signin' | 'signup';
type UserProfile = {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Server = {
  id: number;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
};

type DirectConversation = {
  conversation_id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  last_message: string | null;
  updated_at: string;
};

type Message = {
  id: number;
  content: string;
  created_at: string;
  sender_id: string;
  conversation_id?: number;
  server_id?: number;
  username?: string;
  full_name?: string | null;
};

type SearchResult = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

type CallLog = {
  id: number;
  call_type: 'voice' | 'video';
  status: string;
  started_at: string;
  ended_at: string | null;
  peer_username: string;
};

type ViewMode = 'dm' | 'server' | 'settings';

const inputClass = 'w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-400/60 focus:bg-white/10';
const glassClass = 'rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/20';

const formatError = (fallback: string, error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

function App() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [authView, setAuthView] = useState<AuthView>('signin');
  const [email, setEmail] = useState('demo@aroudf12.app');
  const [password, setPassword] = useState('password123');
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState('');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [activeType, setActiveType] = useState<ViewMode>('dm');
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeServerId, setActiveServerId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingApp, setLoadingApp] = useState(true);
  const [messageDraft, setMessageDraft] = useState('');
  const [serverName, setServerName] = useState('');
  const [serverDescription, setServerDescription] = useState('');
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [actionMessage, setActionMessage] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [settingsUsername, setSettingsUsername] = useState('');
  const [settingsFullName, setSettingsFullName] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [messageSending, setMessageSending] = useState(false);
  const [serverCreating, setServerCreating] = useState(false);
  const [callLoading, setCallLoading] = useState<'voice' | 'video' | null>(null);

  const token = session?.access_token ?? '';

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profiles', { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setProfile(data.profile);
        setSettingsUsername(data.profile?.username || '');
        setSettingsFullName(data.profile?.full_name || '');
      } else {
        setActionMessage(data.error || 'Failed to load profile.');
      }
    } catch (error) {
      setActionMessage(formatError('Failed to load profile.', error));
    }
  };

  const fetchServers = async () => {
    try {
      const res = await fetch('/api/servers', { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setServers(data);
        if (!activeServerId && data.length) setActiveServerId(data[0].id);
      } else {
        setActionMessage(data.error || 'Failed to load servers.');
      }
    } catch (error) {
      setActionMessage(formatError('Failed to load servers.', error));
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations', { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setConversations(data);
        if (!activeConversationId && data.length) setActiveConversationId(data[0].conversation_id);
      } else {
        setActionMessage(data.error || 'Failed to load conversations.');
      }
    } catch (error) {
      setActionMessage(formatError('Failed to load conversations.', error));
    }
  };

  const fetchCallLogs = async () => {
    try {
      const res = await fetch('/api/calls', { headers: authHeaders });
      const data = await res.json();
      if (res.ok) setCallLogs(data);
      else setActionMessage(data.error || 'Failed to load call history.');
    } catch (error) {
      setActionMessage(formatError('Failed to load call history.', error));
    }
  };

  const fetchMessages = async () => {
    if (!token) return;
    if (activeType === 'settings') {
      setMessages([]);
      return;
    }
    const query = activeType === 'dm' ? `conversation_id=${activeConversationId ?? ''}` : `server_id=${activeServerId ?? ''}`;
    if ((activeType === 'dm' && !activeConversationId) || (activeType === 'server' && !activeServerId)) {
      setMessages([]);
      return;
    }
    try {
      const res = await fetch(`/api/messages?${query}`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) setMessages(data);
      else setActionMessage(data.error || 'Failed to load messages.');
    } catch (error) {
      setActionMessage(formatError('Failed to load messages.', error));
    }
  };

  const loadApp = async () => {
    if (!token) return;
    setLoadingApp(true);
    try {
      await Promise.all([fetchProfile(), fetchServers(), fetchConversations(), fetchCallLogs()]);
    } finally {
      setLoadingApp(false);
    }
  };

  useEffect(() => {
    if (token) loadApp();
  }, [token]);

  useEffect(() => {
    if (token) fetchMessages();
  }, [token, activeType, activeConversationId, activeServerId]);

  const handleEmailAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthMessage('');
    const action = authView === 'signin'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });
    const { error } = await action;
    if (error) setAuthMessage(error.message);
    else setAuthMessage(authView === 'signup' ? 'Account created. Check your inbox if confirmation is enabled.' : 'Welcome back to Aroudf12.');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setServers([]);
    setConversations([]);
    setMessages([]);
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!settingsUsername.trim()) {
      setActionMessage('Username is required.');
      return;
    }
    setSavingProfile(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/profiles', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ username: settingsUsername.trim().toLowerCase(), full_name: settingsFullName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data);
        setSettingsUsername(data.username || '');
        setSettingsFullName(data.full_name || '');
        setActionMessage('Settings saved successfully.');
      } else {
        setActionMessage(data.error || 'Failed to save settings.');
      }
    } catch (error) {
      setActionMessage(formatError('Failed to save settings.', error));
    }
    setSavingProfile(false);
  };

  const sendMessage = async () => {
    if (!messageDraft.trim()) return;
    setMessageSending(true);
    setActionMessage('');
    const payload = activeType === 'dm'
      ? { content: messageDraft, conversation_id: activeConversationId }
      : { content: messageDraft, server_id: activeServerId };
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setMessageDraft('');
        await fetchMessages();
        await fetchConversations();
      } else {
        setActionMessage(data.error || 'Failed to send message.');
      }
    } catch (error) {
      setActionMessage(formatError('Failed to send message.', error));
    }
    setMessageSending(false);
  };

  const createServer = async (event: FormEvent) => {
    event.preventDefault();
    if (!serverName.trim()) {
      setActionMessage('Server name is required.');
      return;
    }
    setServerCreating(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: serverName, description: serverDescription }),
      });
      const data = await res.json();
      if (res.ok) {
        setServerName('');
        setServerDescription('');
        setActionMessage('Server created successfully.');
        await fetchServers();
        setActiveType('server');
        setActiveServerId(data.id);
      } else {
        setActionMessage(data.error || 'Failed to create server.');
      }
    } catch (error) {
      setActionMessage(formatError('Failed to create server.', error));
    }
    setServerCreating(false);
  };

  const searchUsers = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!searchUsername.trim()) {
      setSearchResults([]);
      setActionMessage('Write a username to search for people.');
      return;
    }
    setSearchLoading(true);
    setActionMessage('');
    try {
      const res = await fetch(`/api/users/search?username=${encodeURIComponent(searchUsername.trim())}`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setSearchResults(data);
        setActionMessage(data.length ? `Found ${data.length} user${data.length > 1 ? 's' : ''}.` : 'No users found with that username.');
      } else {
        setSearchResults([]);
        setActionMessage(data.error || 'Search failed.');
      }
    } catch (error) {
      setSearchResults([]);
      setActionMessage(formatError('Search failed.', error));
    }
    setSearchLoading(false);
  };

  const startConversation = async (recipientId: string) => {
    setActionMessage('');
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ recipient_id: recipientId }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage('Private chat opened.');
        setSearchResults([]);
        setSearchUsername('');
        await fetchConversations();
        setActiveType('dm');
        setActiveConversationId(data.id);
      } else {
        setActionMessage(data.error || 'Failed to open private chat.');
      }
    } catch (error) {
      setActionMessage(formatError('Failed to open private chat.', error));
    }
  };

  const logCall = async (callType: 'voice' | 'video') => {
    if (!activeConversationId) return;
    setCallLoading(callType);
    setActionMessage('');
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ conversation_id: activeConversationId, call_type: callType }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`${callType === 'voice' ? 'Voice' : 'Video'} call session saved.`);
        await fetchCallLogs();
      } else {
        setActionMessage(data.error || 'Failed to save call session.');
      }
    } catch (error) {
      setActionMessage(formatError('Failed to save call session.', error));
    }
    setCallLoading(null);
  };

  const clearNotifications = () => {
    setActionMessage('Notifications cleared.');
  };

  const handlePremiumClick = () => {
    setActionMessage('Aroudf12 premium feel is active in this build.');
  };

  const activeTitle = activeType === 'settings'
    ? 'Settings'
    : activeType === 'dm'
      ? conversations.find((item) => item.conversation_id === activeConversationId)?.username ?? 'Choose a chat'
      : servers.find((item) => item.id === activeServerId)?.name ?? 'Choose a server';

  if (authLoading) {
    return <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Loading Aroudf12…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(135deg,#020617,#0f172a,#111827)] text-white">
        <div className="mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
          <section className="flex flex-col justify-center gap-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Wifi size={16} />
              Aroudf12 • made by abdullah ahmed abdelaleem
            </div>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-black leading-tight sm:text-6xl">
                Aroudf12 is built to feel faster, richer, and more personal than traditional chat platforms.
              </h1>
              <p className="max-w-2xl text-lg text-slate-300">
                Private conversations, server communities, voice and video call logging, username discovery, and cloud-saved activity powered by Google sign-in.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Private Chats', 'Encrypted-feel interface for direct messaging that persists through your account.'],
                ['Servers', 'Create focused spaces for teams, gaming, creators, or close friend groups.'],
                ['Voice + Video', 'Save every call session to your timeline so activity stays with your profile.'],
              ].map(([title, body]) => (
                <div key={title} className={`${glassClass} p-5`}>
                  <h3 className="mb-2 font-semibold text-white">{title}</h3>
                  <p className="text-sm text-slate-300">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={`${glassClass} my-auto p-6 sm:p-8`}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Enter Aroudf12</h2>
                <p className="text-sm text-slate-400">Use email or Google to keep every action saved.</p>
              </div>
              <Shield className="text-cyan-300" />
            </div>
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
              <button className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300" type="submit">
                {authView === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
            <div className="my-4 text-center text-sm text-slate-400">or</div>
            <button type="button" onClick={() => signInWithGoogle('Aroudf12')} className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 font-medium transition hover:bg-white/15">
              Sign in with Google
            </button>
            <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
              <span>{authView === 'signin' ? 'Need an account?' : 'Already have an account?'}</span>
              <button type="button" onClick={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')} className="font-semibold text-cyan-300">
                {authView === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
            {authMessage && <p className="mt-4 text-sm text-cyan-200">{authMessage}</p>}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 p-4 lg:p-6">
        <aside className={`${glassClass} hidden w-24 flex-col items-center gap-4 p-4 lg:flex`}>
          <div className="grid h-14 w-14 place-items-center rounded-3xl bg-cyan-400 text-slate-950 font-black">A12</div>
          <button onClick={() => setActiveType('dm')} className={`grid h-14 w-14 place-items-center rounded-2xl transition ${activeType === 'dm' ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-white'}`}><MessageSquare size={20} /></button>
          <button onClick={() => setActiveType('server')} className={`grid h-14 w-14 place-items-center rounded-2xl transition ${activeType === 'server' ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-white'}`}><Hash size={20} /></button>
          <div className="mt-auto flex flex-col gap-3">
            <button className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5"><Bell size={18} /></button>
            <button onClick={handleSignOut} className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/20 text-rose-200"><LogOut size={18} /></button>
          </div>
        </aside>

        <aside className={`${glassClass} w-full max-w-sm p-5`}>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Aroudf12</p>
              <h2 className="text-2xl font-bold">{profile?.username || user.email}</h2>
              <p className="text-sm text-slate-400">made by abdullah ahmed abdelaleem</p>
            </div>
            <button type="button" onClick={() => setActiveType('settings')} className={`rounded-2xl p-2 transition ${activeType === 'settings' ? 'bg-cyan-400/20 text-cyan-300' : 'text-slate-400 hover:bg-white/10'}`}>
              <Settings className="text-current" />
            </button>
          </div>

          <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-300"><Search size={16} /> Find people by username</div>
            <form onSubmit={searchUsers} className="flex gap-2">
              <input className={inputClass} value={searchUsername} onChange={(e) => setSearchUsername(e.target.value)} placeholder="Search username" />
              <button type="submit" disabled={searchLoading} className="rounded-2xl bg-cyan-400 px-4 text-slate-950 disabled:opacity-70">{searchLoading ? <LoaderCircle className="animate-spin" size={18} /> : <Search size={18} />}</button>
            </form>
            {!!searchResults.length && (
              <div className="mt-3 space-y-2">
                {searchResults.map((result) => (
                  <div key={result.id} className="flex items-center justify-between rounded-2xl bg-white/5 p-3">
                    <div>
                      <p className="font-medium">@{result.username}</p>
                      <p className="text-xs text-slate-400">{result.full_name || 'Aroudf12 member'}</p>
                    </div>
                    <button type="button" onClick={() => startConversation(result.id)} className="rounded-xl bg-white/10 px-3 py-2 text-sm">
                      Chat
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-1">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-200">Direct messages</h3>
                <UserPlus size={16} className="text-slate-400" />
              </div>
              <div className="space-y-2">
                {conversations.map((chat) => (
                  <button key={chat.conversation_id} onClick={() => { setActiveType('dm'); setActiveConversationId(chat.conversation_id); }} className={`w-full rounded-2xl p-3 text-left transition ${activeType === 'dm' && activeConversationId === chat.conversation_id ? 'bg-cyan-400/20 border border-cyan-400/40' : 'bg-white/5'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">@{chat.username}</p>
                        <p className="truncate text-xs text-slate-400">{chat.last_message || 'No messages yet'}</p>
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">DM</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-200">Servers</h3>
                <Plus size={16} className="text-slate-400" />
              </div>
              <div className="space-y-2">
                {servers.map((server) => (
                  <button key={server.id} onClick={() => { setActiveType('server'); setActiveServerId(server.id); }} className={`w-full rounded-2xl p-3 text-left transition ${activeType === 'server' && activeServerId === server.id ? 'bg-cyan-400/20 border border-cyan-400/40' : 'bg-white/5'}`}>
                    <p className="font-medium">{server.name}</p>
                    <p className="truncate text-xs text-slate-400">{server.description || 'Community server'}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={createServer} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-300"><Plus size={16} /> Create server</div>
            <input className={inputClass} value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="Server name" />
            <input className={inputClass} value={serverDescription} onChange={(e) => setServerDescription(e.target.value)} placeholder="Description" />
            <button type="submit" disabled={serverCreating} className="w-full rounded-2xl bg-white/10 px-4 py-3 font-medium disabled:opacity-70">{serverCreating ? 'Creating...' : 'Launch server'}</button>
          </form>
        </aside>

        <main className={`${glassClass} flex min-w-0 flex-1 flex-col overflow-hidden`}>
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Live space</p>
              <h1 className="text-2xl font-bold">{activeTitle}</h1>
            </div>
            <div className="flex items-center gap-3">
              {activeType === 'dm' && (
                <>
                  <button type="button" disabled={callLoading !== null} onClick={() => logCall('voice')} className="rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10 disabled:opacity-70">{callLoading === 'voice' ? <LoaderCircle className="animate-spin" size={18} /> : <Phone size={18} />}</button>
                  <button type="button" disabled={callLoading !== null} onClick={() => logCall('video')} className="rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10 disabled:opacity-70">{callLoading === 'video' ? <LoaderCircle className="animate-spin" size={18} /> : <Video size={18} />}</button>
                </>
              )}
              {activeType !== 'settings' && <button type="button" onClick={handlePremiumClick} className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950">Premium feel enabled</button>}
            </div>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_320px]">
            <section className="flex min-h-0 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {activeType === 'settings' ? (
                  <form onSubmit={saveSettings} className="mx-auto max-w-2xl space-y-5">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                      <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Profile settings</p>
                      <h2 className="mt-2 text-3xl font-bold">Customize your Aroudf12 identity</h2>
                      <p className="mt-2 text-slate-400">Update your username so people can find you in search, and save your public display name.</p>
                    </div>
                    <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm text-slate-300">Username</span>
                        <input className={inputClass} value={settingsUsername} onChange={(e) => setSettingsUsername(e.target.value)} placeholder="username" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm text-slate-300">Full name</span>
                        <input className={inputClass} value={settingsFullName} onChange={(e) => setSettingsFullName(e.target.value)} placeholder="Your full name" />
                      </label>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300 md:col-span-2">
                        Your account is persistent. Messages, servers, chats, and call history stay saved to your signed-in Google or email account.
                      </div>
                      <button type="submit" disabled={savingProfile} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-70 md:col-span-2">
                        {savingProfile ? <LoaderCircle className="animate-spin" size={18} /> : <Save size={18} />}
                        Save settings
                      </button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                        <MessageSquare className="mb-3 text-cyan-300" />
                        <h3 className="font-semibold">Private chats</h3>
                        <p className="mt-2 text-sm text-slate-400">Your direct chats stay tied to your account history.</p>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                        <Phone className="mb-3 text-cyan-300" />
                        <h3 className="font-semibold">Voice calls</h3>
                        <p className="mt-2 text-sm text-slate-400">Saved sessions are listed in your sidebar activity.</p>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                        <Camera className="mb-3 text-cyan-300" />
                        <h3 className="font-semibold">Video calls</h3>
                        <p className="mt-2 text-sm text-slate-400">Video sessions are recorded to your private history log.</p>
                      </div>
                    </div>
                  </form>
                ) : loadingApp ? (
                  <div className="text-slate-400">Loading your saved world…</div>
                ) : messages.length ? (
                  messages.map((message) => (
                    <div key={message.id} className={`max-w-xl rounded-3xl px-5 py-4 ${message.sender_id === user.id ? 'ml-auto bg-cyan-400 text-slate-950' : 'bg-white/5 text-white'}`}>
                      <div className="mb-1 text-xs uppercase tracking-[0.2em] opacity-70">{message.username || message.full_name || 'Member'}</div>
                      <p>{message.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="grid h-full place-items-center text-center text-slate-400">
                    <div>
                      <Mic className="mx-auto mb-4 text-cyan-300" size={32} />
                      <p className="text-lg text-white">Start the first conversation in this space.</p>
                      <p className="text-sm">Everything you send is saved to your Aroudf12 account.</p>
                    </div>
                  </div>
                )}
              </div>

              {activeType !== 'settings' && (
                <div className="border-t border-white/10 p-5">
                  <div className="flex gap-3">
                    <input className={inputClass} value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} placeholder={activeType === 'dm' ? 'Message privately…' : 'Send a server message…'} />
                    <button type="button" disabled={messageSending} onClick={sendMessage} className="rounded-2xl bg-cyan-400 px-5 text-slate-950 disabled:opacity-70">{messageSending ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}</button>
                  </div>
                </div>
              )}
            </section>

            <aside className="border-l border-white/10 bg-white/5 p-5">
              <div className="mb-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Cloud profile</p>
                <h3 className="mt-2 text-xl font-bold">@{profile?.username}</h3>
                <p className="mt-1 text-sm text-slate-400">{profile?.full_name || profile?.email}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/5 p-3">
                    <div className="text-slate-400">Servers</div>
                    <div className="text-xl font-bold">{servers.length}</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-3">
                    <div className="text-slate-400">DMs</div>
                    <div className="text-xl font-bold">{conversations.length}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm text-slate-300"><Phone size={16} /> Saved call activity</div>
                <div className="space-y-3">
                  {callLogs.length ? callLogs.map((log) => (
                    <div key={log.id} className="rounded-2xl bg-white/5 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{log.call_type} call</span>
                        <span className="text-xs text-slate-400">{log.status}</span>
                      </div>
                      <p className="mt-1 text-slate-300">with @{log.peer_username}</p>
                    </div>
                  )) : <p className="text-sm text-slate-400">No calls yet. Start one from a private chat.</p>}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={clearNotifications} className="rounded-xl bg-white/10 px-3 py-2 text-xs text-slate-300">Clear notice</button>
                {actionMessage && <p className="text-sm text-cyan-200">{actionMessage}</p>}
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
