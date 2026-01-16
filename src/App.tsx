import React, { useState, useEffect } from 'react';
import { 
  Inbox, Send, Menu, X, Plus, Calendar, 
  LogOut, User, Shield, Paperclip, ChevronRight, Search
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// --- TYPES ---
interface User { id: string; username: string; }
interface Email { id: string; subject: string; summary: string; sender_address: string; received_at: number; is_read: number; category: string; }
interface Alias { address: string; name: string; }

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

  const logout = () => {
    localStorage.removeItem('jwt');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return { token, user, login, logout };
};

export default function App() {
  const { token, user, login, logout } = useAuth();
  if (!token || !user) return <AuthScreen onLogin={login} />;
  return <Dashboard token={token} user={user} onLogout={logout} />;
}

// --- AUTH SCREEN ---
function AuthScreen({ onLogin }: { onLogin: (t: string, u: User) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Request failed');
      
      if (isRegister) {
        setIsRegister(false);
        setError('Account created! Please login.');
      } else {
        onLogin(data.token, data.user);
      }
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">RavArch</h1>
        <p className="text-zinc-500 text-center mb-8">Secure AI-Powered Mailbox</p>
        
        {error && <div className={`p-3 rounded text-sm mb-4 ${error.includes('created') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase ml-1">Username</label>
            <input className="w-full bg-black/50 border border-zinc-700 rounded-lg p-3 text-white focus:border-indigo-500 outline-none transition" 
              value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase ml-1">Password</label>
            <input type="password" className="w-full bg-black/50 border border-zinc-700 rounded-lg p-3 text-white focus:border-indigo-500 outline-none transition" 
              value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
          </div>
          <button disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-lg font-bold text-white transition disabled:opacity-50">
            {loading ? 'Processing...' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button onClick={() => setIsRegister(!isRegister)} className="text-sm text-zinc-400 hover:text-white transition">
            {isRegister ? 'Already have an account? Login' : 'Create new account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- DASHBOARD ---
function Dashboard({ token, user, onLogout }: { token: string, user: User, onLogout: () => void }) {
  const [view, setView] = useState<'inbox' | 'compose'>('inbox');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [currentAlias, setCurrentAlias] = useState('');

  useEffect(() => {
    fetch('/api/aliases', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setAliases(data);
        if (data.length) setCurrentAlias(data[0].address);
      });
  }, [token]);

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      
      {/* MOBILE HEADER */}
      <div className="md:hidden fixed top-0 w-full h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 z-50">
        <span className="font-bold text-lg">RavArch</span>
        <button onClick={() => setMobileOpen(!mobileOpen)}><Menu /></button>
      </div>

      {/* SIDEBAR */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-72 bg-[#0c0c0e] border-r border-white/5 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static flex flex-col
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 mt-16 md:mt-0 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/20">
              <span className="font-bold text-lg">{user.username[0].toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <div className="font-bold truncate">{user.username}</div>
              <div className="text-xs text-zinc-500 truncate">{currentAlias}</div>
            </div>
          </div>

          <button onClick={() => { setView('compose'); setMobileOpen(false); }} className="w-full flex items-center justify-center gap-2 bg-zinc-100 text-zinc-900 py-3 rounded-xl font-semibold hover:bg-white transition mb-6">
            <Plus size={18} /> Compose
          </button>

          <nav className="space-y-1 flex-1">
            <SidebarItem icon={<Inbox />} label="Inbox" active={view === 'inbox'} onClick={() => setView('inbox')} />
            <SidebarItem icon={<Send />} label="Sent" onClick={() => {}} />
            <SidebarItem icon={<Shield />} label="Aliases" onClick={() => {}} />
          </nav>

          <div className="mt-4 border-t border-white/5 pt-4">
             <div className="text-xs font-bold text-zinc-500 uppercase mb-3 px-3">Identities</div>
             <div className="space-y-1 max-h-32 overflow-y-auto">
               {aliases.map(a => (
                 <button key={a.address} onClick={() => setCurrentAlias(a.address)} className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate flex items-center justify-between ${currentAlias === a.address ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:text-white'}`}>
                   {a.address}
                   {currentAlias === a.address && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>}
                 </button>
               ))}
             </div>
          </div>
          
          <button onClick={onLogout} className="mt-6 flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-red-400 transition w-full">
            <LogOut size={16}/> Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col pt-16 md:pt-0 relative w-full">
        {view === 'inbox' ? (
          <InboxView token={token} />
        ) : (
          <Composer token={token} fromAddress={currentAlias} onClose={() => setView('inbox')} />
        )}
      </main>

      {mobileOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setMobileOpen(false)} />}
    </div>
  );
}

const SidebarItem = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all font-medium ${active ? 'bg-indigo-600/10 text-indigo-400' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'}`}>
    {React.cloneElement(icon, { size: 18 })}
    {label}
  </button>
);

// --- INBOX VIEW ---
function InboxView({ token }: { token: string }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/emails', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setEmails(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Inbox</h2>
        <div className="bg-white/5 border border-white/10 rounded-lg p-2 flex items-center text-zinc-400 w-64">
          <Search size={16} className="mr-2" />
          <input placeholder="Search..." className="bg-transparent outline-none text-sm w-full" />
        </div>
      </div>
      
      {loading ? (
        <div className="text-zinc-500">Loading mailbox...</div>
      ) : (
        <div className="space-y-2">
          {emails.map(email => (
            <div key={email.id} className={`group border p-4 rounded-xl transition-all cursor-pointer relative overflow-hidden ${email.is_read ? 'bg-transparent border-white/5 opacity-80' : 'bg-white/[0.02] border-white/10 hover:border-indigo-500/30'}`}>
              <div className="flex justify-between items-start mb-1">
                <span className={`text-sm font-medium ${!email.is_read ? 'text-white' : 'text-zinc-400'}`}>{email.sender_address}</span>
                <span className="text-xs text-zinc-600 whitespace-nowrap ml-2">{formatDistanceToNow(email.received_at)} ago</span>
              </div>
              <div className={`text-sm mb-1 ${!email.is_read ? 'text-zinc-200 font-semibold' : 'text-zinc-500'}`}>{email.subject}</div>
              <div className="text-xs text-zinc-500 truncate pr-8">{email.summary}</div>
              {email.category && (
                <span className="absolute top-4 right-4 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-white/10 bg-white/5 text-zinc-400">
                  {email.category}
                </span>
              )}
            </div>
          ))}
          {emails.length === 0 && <div className="text-center text-zinc-600 mt-20">No messages found.</div>}
        </div>
      )}
    </div>
  );
}

// --- COMPOSER ---
function Composer({ token, fromAddress, onClose }: any) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [schedule, setSchedule] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle');

  const handleSend = async () => {
    setStatus('sending');
    await fetch('/api/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromAddress, to, subject, body, scheduleTime: schedule || undefined })
    });
    setStatus('success');
    setTimeout(onClose, 1000);
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 max-w-4xl mx-auto w-full h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <div className="w-2 h-8 bg-indigo-500 rounded-full"></div> New Message
        </h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition"><X size={20} /></button>
      </div>

      <div className="flex-1 flex flex-col bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 space-y-4 border-b border-white/5">
           <div className="flex items-center gap-3 text-sm">
             <span className="text-zinc-500 w-16">From:</span>
             <span className="text-white font-mono bg-white/5 px-2 py-1 rounded">{fromAddress}</span>
           </div>
           <div className="flex items-center gap-3 text-sm">
             <span className="text-zinc-500 w-16">To:</span>
             <input className="flex-1 bg-transparent outline-none text-white placeholder-zinc-700" placeholder="recipient@example.com" value={to} onChange={e => setTo(e.target.value)} />
           </div>
           <div className="flex items-center gap-3 text-sm">
             <span className="text-zinc-500 w-16">Subject:</span>
             <input className="flex-1 bg-transparent outline-none text-white placeholder-zinc-700 font-medium" placeholder="Meeting update..." value={subject} onChange={e => setSubject(e.target.value)} />
           </div>
        </div>

        <textarea className="flex-1 bg-transparent p-6 outline-none text-zinc-300 resize-none font-sans leading-relaxed" placeholder="Type your message..." value={body} onChange={e => setBody(e.target.value)} />

        <div className="p-4 border-t border-white/5 bg-zinc-900 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <button className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition"><Paperclip size={18} /></button>
             <div className="h-6 w-px bg-white/10 mx-2"></div>
             <input type="datetime-local" className="bg-transparent text-xs text-zinc-500 outline-none" value={schedule} onChange={e => setSchedule(e.target.value)} />
           </div>
           <button onClick={handleSend} disabled={status !== 'idle'} className={`px-6 py-2 rounded-lg font-bold text-white transition flex items-center gap-2 ${status === 'success' ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
             {status === 'sending' ? 'Sending...' : status === 'success' ? 'Sent!' : (schedule ? 'Schedule' : 'Send')}
             {status === 'idle' && <Send size={16} />}
           </button>
        </div>
      </div>
    </div>
  );
}
