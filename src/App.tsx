import React, { useState, useEffect } from 'react';
import { 
  Inbox, Send, Plus, Activity, X, LogOut, Loader2, Calendar, Paperclip, Copy, Shield, Key
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { TelegramBanner } from './components/TelegramBanner';

// --- TYPES ---
interface User { id: string; username: string; }
interface Email { id: string; subject: string; summary: string; sender_address: string; received_at: number; is_read: number; category: string; has_attachments?: number; }
interface Alias { address: string; name: string; }
interface Stats { total_emails: number; spam_blocked: number; scheduled_count: number; }

// --- AUTH HOOK ---
const useAuth = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt'));
  const [user, setUser] = useState<User | null>(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null);

  const login = (jwt: string, usr: User) => {
    localStorage.setItem('jwt', jwt);
    localStorage.setItem('user', JSON.stringify(usr));
    setToken(jwt);
    setUser(usr);
  };
  const logout = () => { localStorage.clear(); setToken(null); setUser(null); };
  return { token, user, login, logout };
};

// --- MAIN APP ---
export default function App() {
  const { token, user, login, logout } = useAuth();
  
  if (token && user) {
    return <Dashboard token={token} user={user} onLogout={logout} />;
  }

  return <AuthScreen onLogin={login} />;
}

// --- AUTH SCREENS ---
function AuthScreen({ onLogin }: { onLogin: (t: string, u: User) => void }) {
  const [mode, setMode] = useState<'welcome' | 'login'>('welcome');
  const [loading, setLoading] = useState(false);
  const [newCreds, setNewCreds] = useState<{username:string, password:string} | null>(null);
  
  // Login Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const createGuest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      const data = await res.json();
      if (data.token) {
        // Don't auto-login immediately; show credentials first
        setNewCreds({ username: data.user.username, password: data.generatedPassword });
        // Store temp for the "Continue" button
        window.tempAuth = { token: data.token, user: data.user };
      }
    } catch (e) {
      console.error(e);
      setError("Failed to create inbox");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        const res = await fetch('/api/auth/login', { 
            method: 'POST', 
            body: JSON.stringify({ username, password }) 
        });
        const data = await res.json();
        if (data.token) onLogin(data.token, data.user);
        else setError(data.error || 'Login failed');
    } catch {
        setError("Network error");
    } finally {
        setLoading(false);
    }
  };

  if (newCreds) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/10 max-w-md w-full shadow-2xl">
            <div className="flex justify-center mb-6"><div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center"><Key size={24}/></div></div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">Inbox Created</h2>
            <p className="text-zinc-400 text-center mb-6 text-sm">Save these credentials to access your inbox later.</p>
            
            <div className="bg-black/50 p-4 rounded-lg space-y-3 mb-6 border border-white/5">
                <div className="flex justify-between items-center">
                    <span className="text-zinc-500 text-sm">Username</span>
                    <span className="text-white font-mono select-all">{newCreds.username}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-zinc-500 text-sm">Password</span>
                    <span className="text-white font-mono select-all">{newCreds.password}</span>
                </div>
            </div>

            <button 
                onClick={() => onLogin(window.tempAuth.token, window.tempAuth.user)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors"
            >
                Access Inbox
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center text-white p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#09090b] to-[#09090b] -z-10"></div>
      
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
            <div className="inline-block p-3 rounded-2xl bg-indigo-500/10 mb-4 border border-indigo-500/20">
                <Shield className="text-indigo-400 w-8 h-8" />
            </div>
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-400 mb-2">RavArch</h1>
            <p className="text-zinc-500">Secure, ephemeral, AI-powered email.</p>
        </div>

        {mode === 'welcome' ? (
             <div className="space-y-4">
                <button onClick={createGuest} disabled={loading} className="w-full bg-white text-black hover:bg-zinc-200 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    {loading ? <Loader2 className="animate-spin"/> : <Plus size={20}/>}
                    Create Temporary Inbox
                </button>
                <button onClick={() => setMode('login')} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-xl border border-white/5 transition-colors">
                    Login to Existing
                </button>
             </div>
        ) : (
            <form onSubmit={handleLogin} className="space-y-4 bg-[#1a1a1a] p-6 rounded-2xl border border-white/10">
                {error && <div className="text-red-400 text-sm text-center bg-red-500/10 p-2 rounded">{error}</div>}
                <div>
                    <label className="text-xs text-zinc-500 uppercase font-bold tracking-wider ml-1">Username</label>
                    <input value={username} onChange={e=>setUsername(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 mt-1 text-white focus:border-indigo-500 outline-none transition-colors" placeholder="user_..." />
                </div>
                <div>
                    <label className="text-xs text-zinc-500 uppercase font-bold tracking-wider ml-1">Password</label>
                    <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 mt-1 text-white focus:border-indigo-500 outline-none transition-colors" placeholder="••••••••" />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg mt-2 transition-colors flex justify-center">
                    {loading ? <Loader2 className="animate-spin"/> : 'Login'}
                </button>
                <button type="button" onClick={() => setMode('welcome')} className="w-full text-zinc-500 text-sm hover:text-zinc-300">Cancel</button>
            </form>
        )}
      </div>
      
      <div className="mt-12 opacity-80 scale-75">
         <TelegramBanner />
      </div>
    </div>
  );
}

declare global { interface Window { tempAuth: any; } }

// --- DASHBOARD (Unchanged mostly, just ensure usage) ---
function Dashboard({ token, user, onLogout }: { token: string, user: User, onLogout: () => void }) {
  const [view, setView] = useState('inbox');
  const [showUsage, setShowUsage] = useState(false);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [currentAlias, setCurrentAlias] = useState('');

  useEffect(() => {
    fetch('/api/aliases', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { 
        if(Array.isArray(d)) {
            setAliases(d); 
            if(d.length > 0) setCurrentAlias(d[0].address); 
        }
      })
      .catch(console.error);
  }, [token]);

  const copyAddress = () => {
    navigator.clipboard.writeText(currentAlias);
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      <aside className="w-64 bg-[#0c0c0e] border-r border-white/5 flex flex-col p-4 hidden md:flex">
        <div className="font-bold mb-8 text-xl px-2 text-indigo-400">RavArch</div>
        
        <div className="mb-6 bg-zinc-900 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Your Address</div>
            <div className="flex items-center gap-2 text-sm font-mono text-white truncate mb-2">
                {currentAlias || 'Loading...'}
            </div>
            <button onClick={copyAddress} className="w-full bg-white/5 hover:bg-white/10 text-xs py-1.5 rounded flex items-center justify-center gap-2 transition-colors">
                <Copy size={12} /> Copy Address
            </button>
        </div>

        <button onClick={() => setView('compose')} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium mb-6 flex items-center justify-center gap-2 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"><Plus size={18}/> Compose</button>
        
        <nav className="space-y-1 flex-1">
          <button onClick={() => setView('inbox')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${view === 'inbox' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:text-white'}`}><Inbox size={18}/> Inbox</button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white cursor-not-allowed opacity-50"><Send size={18}/> Sent</button>
        </nav>
        
        <div className="mt-4 pt-4 border-t border-white/5">
           <button onClick={() => setShowUsage(true)} className="w-full flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-white text-sm transition-colors"><Activity size={16}/> Usage</button>
           <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-red-400 text-sm transition-colors"><LogOut size={16}/> Logout</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative">
        {view === 'inbox' ? <InboxView token={token} /> : <Composer token={token} from={currentAlias} close={() => setView('inbox')} />}
        {showUsage && <UsageModal token={token} close={() => setShowUsage(false)} />}
        <div className="absolute bottom-4 right-4">
             {/* Removed banner from dashboard to keep it clean, added to Auth screen */}
        </div>
      </main>
    </div>
  );
}

function InboxView({ token }: { token: string }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/emails', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setEmails(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-zinc-500"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <h2 className="text-2xl font-bold mb-6">Inbox</h2>
      {emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-20 text-zinc-500 gap-4">
           <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center"><Inbox size={32} /></div>
           <p>Waiting for incoming emails...</p>
        </div>
      ) : 
      emails.map(e => (
        <div key={e.id} className="border-b border-white/5 p-4 hover:bg-white/5 cursor-pointer transition-colors group">
          <div className="flex justify-between text-sm mb-1">
            <span className={e.is_read ? 'text-zinc-500' : 'text-white font-medium group-hover:text-indigo-300'}>{e.sender_address}</span>
            <span className="flex items-center gap-2 text-zinc-600">
               {e.has_attachments === 1 && <Paperclip size={14} className="text-zinc-400" />}
               <span>{formatDistanceToNow(e.received_at)} ago</span>
            </span>
          </div>
          <div className={`mb-1 ${e.is_read ? 'text-zinc-500' : 'text-zinc-200'}`}>{e.subject || "(No Subject)"}</div>
          <div className="text-xs text-zinc-600 truncate flex gap-2 items-center">
            <span className="bg-zinc-800 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider text-zinc-400">{e.category}</span>
            {e.summary}
          </div>
        </div>
      ))}
    </div>
  );
}

function UsageModal({ token, close }: { token: string, close: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setStats); }, [token]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] p-6 rounded-2xl w-96 border border-white/10 relative shadow-2xl">
        <button onClick={close} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"><X size={20}/></button>
        <h3 className="font-bold mb-4 flex items-center gap-2"><Activity className="text-indigo-500"/> Usage Analytics</h3>
        {stats ? (
          <div className="space-y-4">
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Total Emails</span><span className="font-bold">{stats.total_emails}</span></div>
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Spam Blocked</span><span className="font-bold text-red-400">{stats.spam_blocked || 0}</span></div>
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Scheduled</span><span className="font-bold text-blue-400">{stats.scheduled_count || 0}</span></div>
          </div>
        ) : <div className="flex justify-center p-4"><Loader2 className="animate-spin text-zinc-500"/></div>}
      </div>
    </div>
  );
}

function Composer({ token, from, close }: { token: string, from: string, close: () => void }) {
  const [form, setForm] = useState({ to: '', subject: '', body: '', scheduleTime: '' });
  const [status, setStatus] = useState('idle');

  const send = async () => {
    setStatus('sending');
    try {
        const res = await fetch('/api/send', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, from, scheduleTime: form.scheduleTime || undefined })
        });
        if (!res.ok) throw new Error();
        setStatus('sent'); 
        setTimeout(close, 1000);
    } catch {
        setStatus('error');
    }
  };

  return (
    <div className="flex-1 p-8 flex flex-col max-w-3xl mx-auto h-full">
      <div className="flex justify-between mb-6"><h2 className="font-bold text-xl">New Message</h2><button onClick={close} className="hover:text-red-400 transition-colors"><X/></button></div>
      <div className="bg-zinc-900 border border-white/5 rounded-xl flex-1 flex flex-col p-4 overflow-hidden shadow-xl">
        <div className="mb-4 space-y-2 text-sm border-b border-white/5 pb-4">
          <div className="flex gap-2 items-center"><span className="w-16 text-zinc-500">From:</span><span className="text-indigo-400 font-mono bg-indigo-500/10 px-2 rounded">{from}</span></div>
          <div className="flex gap-2 items-center"><span className="w-16 text-zinc-500">To:</span><input className="bg-transparent outline-none flex-1 text-white border-b border-transparent focus:border-zinc-700 transition-colors" placeholder="recipient@example.com" onChange={e => setForm({...form, to: e.target.value})}/></div>
          <div className="flex gap-2 items-center"><span className="w-16 text-zinc-500">Subject:</span><input className="bg-transparent outline-none flex-1 text-white border-b border-transparent focus:border-zinc-700 transition-colors" placeholder="Subject" onChange={e => setForm({...form, subject: e.target.value})}/></div>
        </div>
        <textarea className="flex-1 bg-transparent outline-none resize-none text-zinc-300 font-sans leading-relaxed" placeholder="Type message..." onChange={e => setForm({...form, body: e.target.value})}/>
        <div className="border-t border-white/5 pt-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-zinc-500"/>
            <input type="datetime-local" className="bg-transparent text-xs text-zinc-500 outline-none" onChange={e => setForm({...form, scheduleTime: e.target.value})}/>
          </div>
          <button onClick={send} disabled={status === 'sending'} className={`px-6 py-2 rounded-lg font-bold text-white transition-colors ${status === 'sent' ? 'bg-green-600' : status === 'error' ? 'bg-red-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
            {status === 'sending' ? <Loader2 className="animate-spin" size={18}/> : status === 'sent' ? 'Sent!' : status === 'error' ? 'Failed' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
