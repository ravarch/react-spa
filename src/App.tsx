import React, { useState, useEffect, useRef } from 'react';
import { 
  Mail, RefreshCw, Copy, Send, Zap, Shield, Inbox, 
  FileText, ChevronRight, LogOut, Paperclip, User, Lock 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = '/api';

export default function App() {
  const [session, setSession] = useState<{username: string, address: string, password?: string} | null>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'login' | 'inbox'>('login');
  
  // Login State
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);

  const generateIdentity = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/generate`, { method: 'POST' });
      const data = await res.json();
      setSession(data);
      setView('inbox');
      connectWs(data.username);
    } catch (e) {
      alert('Error generating identity');
    }
    setLoading(false);
  };

  const login = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login`, { 
        method: 'POST',
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSession(data);
      setView('inbox');
      connectWs(data.username);
    } catch (e) {
      alert('Invalid credentials');
    }
    setLoading(false);
  };

  const connectWs = (username: string) => {
    if (wsRef.current) wsRef.current.close();
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}${API_BASE}/ws?username=${username}`);
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'NEW_EMAIL') {
        fetchEmails(username);
        // Optional: Show notification toast
      }
    };
    wsRef.current = ws;
  };

  const fetchEmails = async (username: string) => {
    const res = await fetch(`${API_BASE}/emails/${username}`);
    const data = await res.json();
    setEmails(data);
  };

  useEffect(() => {
    if (session) fetchEmails(session.username);
  }, [session]);

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20">
             <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]" />
             <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-4xl w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl p-8 z-10 grid md:grid-cols-2 gap-12"
        >
          <div className="flex flex-col justify-center space-y-6">
            <div className="space-y-2">
              <div className="w-12 h-12 bg-gradient-to-tr from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
                <Shield className="text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-white">
                AI Secure Mail
              </h1>
              <p className="text-slate-400">
                Professional, ephemeral email service powered by Cloudflare AI.
              </p>
            </div>
            
            <button
              onClick={generateIdentity}
              disabled={loading}
              className="group w-full py-4 bg-white text-slate-950 rounded-xl font-bold text-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-3"
            >
              {loading ? <RefreshCw className="animate-spin" /> : <Zap className="text-blue-600" />}
              Generate New Identity
            </button>

            <div className="flex items-center gap-4 text-slate-600">
              <div className="h-px bg-slate-800 flex-1" />
              <span className="text-sm">OR ACCESS EXISTING</span>
              <div className="h-px bg-slate-800 flex-1" />
            </div>

            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Username" 
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
              />
              <input 
                type="password" 
                placeholder="Password" 
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
              />
              <button 
                onClick={login}
                className="w-full py-3 bg-slate-800 text-blue-400 font-semibold rounded-lg hover:bg-slate-700 transition-colors"
              >
                Access Inbox
              </button>
            </div>
          </div>

          <div className="hidden md:flex flex-col justify-center items-center text-center space-y-8 bg-gradient-to-br from-slate-800/50 to-transparent rounded-2xl p-8 border border-slate-800/50">
            <div className="relative">
               <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 rounded-full" />
               <Mail size={80} className="text-blue-400 relative z-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-white">AI-Powered Summaries</h3>
              <p className="text-slate-400 text-sm">
                Incoming emails are automatically analyzed by Llama-3 to give you instant context without reading headers.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                <Lock className="w-6 h-6 text-emerald-400 mb-2 mx-auto" />
                <div className="text-xs font-medium">End-to-End Secure</div>
              </div>
              <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                <Zap className="w-6 h-6 text-amber-400 mb-2 mx-auto" />
                <div className="text-xs font-medium">Real-time Socket</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- Inbox View ---
  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden font-sans text-slate-900">
      {/* Sidebar */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-sm z-20">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 font-bold text-xl text-slate-800">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            AI Mail
          </div>
        </div>
        
        <div className="p-4 space-y-4">
           {/* Credentials Card */}
           <div className="bg-slate-900 text-slate-300 p-4 rounded-xl shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Shield size={60} />
              </div>
              <div className="mb-3">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Current Identity</p>
                <div className="flex items-center gap-2 text-white font-mono text-sm font-medium">
                  <User size={14} className="text-blue-400"/> {session?.username}
                </div>
              </div>
              <div className="bg-black/30 rounded-lg p-2 flex items-center justify-between border border-white/10">
                <span className="text-xs truncate font-mono text-slate-400 w-full">{session?.address}</span>
                <button 
                  onClick={() => navigator.clipboard.writeText(session?.address || '')}
                  className="hover:text-white transition-colors pl-2"
                >
                  <Copy size={14}/>
                </button>
              </div>
              {session?.password && (
                 <div className="mt-2 bg-black/30 rounded-lg p-2 flex items-center justify-between border border-white/10">
                   <span className="text-xs truncate font-mono text-slate-400 w-full">Pass: {session.password}</span>
                   <button 
                     onClick={() => navigator.clipboard.writeText(session?.password || '')}
                     className="hover:text-white transition-colors pl-2"
                   >
                     <Copy size={14}/>
                   </button>
                 </div>
              )}
           </div>

           <nav className="space-y-1">
             <button 
               onClick={() => setSelectedEmail(null)}
               className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                 !selectedEmail 
                 ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' 
                 : 'text-slate-600 hover:bg-slate-50'
               }`}
             >
               <Inbox size={18} /> Inbox 
               <span className="ml-auto bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs font-bold">
                 {emails.length}
               </span>
             </button>
           </nav>
        </div>

        <div className="mt-auto p-4 border-t border-slate-100">
          <button onClick={() => setView('login')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-500 transition-colors w-full px-2 py-2">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50">
        {!selectedEmail ? (
          <div className="flex-1 overflow-y-auto">
             <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-5 flex justify-between items-center z-10">
                <h2 className="text-2xl font-bold text-slate-800">Incoming Messages</h2>
                <button 
                  onClick={() => session && fetchEmails(session.username)}
                  className="p-2 bg-white border border-slate-200 shadow-sm rounded-full text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all"
                >
                  <RefreshCw size={18} />
                </button>
             </header>

             <div className="p-8 space-y-3 max-w-5xl mx-auto">
               <AnimatePresence>
                 {emails.map((email) => (
                   <motion.div
                     key={email.id}
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     onClick={() => setSelectedEmail(email)}
                     className={`group bg-white p-5 rounded-2xl border transition-all cursor-pointer flex gap-5 items-start
                       ${!email.is_read 
                         ? 'border-blue-200 shadow-lg shadow-blue-900/5 ring-1 ring-blue-50' 
                         : 'border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md'
                       }`}
                   >
                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 shadow-inner
                       ${!email.is_read ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                       {email.sender[0].toUpperCase()}
                     </div>
                     
                     <div className="flex-1 min-w-0">
                       <div className="flex justify-between items-start mb-1">
                         <h3 className={`font-semibold truncate pr-4 text-lg ${!email.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                           {email.sender}
                         </h3>
                         <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                           {new Date(email.created_at * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                         </span>
                       </div>
                       
                       <p className="text-slate-800 font-medium truncate mb-2">{email.subject}</p>
                       
                       {/* AI Summary Badge inside row */}
                       {email.ai_summary && (
                         <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                           <Zap size={12} className="text-amber-500 mt-0.5 shrink-0" />
                           <span className="line-clamp-2">{email.ai_summary}</span>
                         </div>
                       )}
                     </div>

                     <ChevronRight className="self-center text-slate-300 group-hover:text-blue-400 transition-colors" />
                   </motion.div>
                 ))}
               </AnimatePresence>

               {emails.length === 0 && (
                 <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                   <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                     <Inbox size={40} className="opacity-20" />
                   </div>
                   <h3 className="text-lg font-semibold text-slate-600">Your inbox is empty</h3>
                   <p className="max-w-xs text-center mt-2">Emails sent to your secure address will appear here instantly via WebSocket.</p>
                 </div>
               )}
             </div>
          </div>
        ) : (
          <EmailDetail 
            email={selectedEmail} 
            onBack={() => setSelectedEmail(null)} 
            username={session?.username}
          />
        )}
      </main>
    </div>
  );
}

// --- Detail Component ---
function EmailDetail({ email, onBack, username }: any) {
  const [fullEmail, setFullEmail] = useState<any>(null);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/email/${email.id}`).then(r => r.json()).then(setFullEmail);
  }, [email.id]);

  const handleReply = async () => {
    await fetch(`${API_BASE}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        username,
        replyTo: email.sender,
        subject: email.subject,
        body: replyBody
      })
    });
    setReplying(false);
    setReplyBody("");
    alert('Reply Sent Successfully');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white animate-in slide-in-from-right-10 duration-300">
      {/* Detail Header */}
      <div className="h-16 border-b border-slate-100 px-6 flex items-center justify-between bg-white/80 backdrop-blur">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors">
            <ChevronRight className="rotate-180" size={20} />
          </button>
          <div className="h-6 w-px bg-slate-200" />
          <h2 className="font-semibold text-slate-800 truncate max-w-md">{email.subject}</h2>
        </div>
        <div className="text-sm text-slate-400 font-mono">
          ID: {email.id.substring(0,8)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
           
           {/* AI Insight Card */}
           <motion.div 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             className="mb-8 p-6 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden"
           >
             <div className="absolute top-0 right-0 p-4 opacity-5">
               <Zap size={120} />
             </div>
             <div className="flex items-center gap-2 text-blue-700 font-bold mb-3 uppercase text-xs tracking-wider">
               <Zap size={14} /> AI Analysis
             </div>
             <p className="text-slate-700 leading-relaxed font-medium relative z-10">
               {email.ai_summary || "Analyzing content..."}
             </p>
           </motion.div>

           {/* Sender Info */}
           <div className="flex items-center justify-between mb-8 pb-8 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-xl font-bold text-slate-600 border border-slate-200">
                  {email.sender[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-lg">{email.sender}</div>
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    To: <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">Me</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-slate-900">
                  {new Date(email.created_at * 1000).toLocaleDateString()}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(email.created_at * 1000).toLocaleTimeString()}
                </div>
              </div>
           </div>

           {/* Content Body */}
           <div className="prose prose-slate max-w-none">
             {fullEmail ? (
               fullEmail.raw_content ? (
                 // Render parsed JSON content. For safety, we use text or sanitized HTML if available
                 // Assuming parsed structure has .html or .text
                 <div className="bg-white rounded-xl text-slate-800 leading-relaxed whitespace-pre-wrap">
                   {/* In a real app, render safe HTML here. For now, display text */}
                   {JSON.parse(fullEmail.raw_content).text || JSON.parse(fullEmail.raw_content).html}
                   
                   {/* Attachments Section */}
                   {JSON.parse(fullEmail.raw_content).attachments?.length > 0 && (
                     <div className="mt-8 pt-8 border-t border-slate-100">
                       <h4 className="flex items-center gap-2 font-bold text-slate-800 mb-4">
                         <Paperclip size={18} /> Attachments
                       </h4>
                       <div className="grid grid-cols-2 gap-4">
                         {JSON.parse(fullEmail.raw_content).attachments.map((att: any, i: number) => (
                           <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3">
                             <FileText className="text-slate-400" />
                             <div className="truncate text-sm font-medium">{att.filename}</div>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>
               ) : <div className="text-slate-400 italic">Content unavailable</div>
             ) : (
               <div className="space-y-4 animate-pulse">
                 <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                 <div className="h-4 bg-slate-100 rounded w-full"></div>
                 <div className="h-4 bg-slate-100 rounded w-5/6"></div>
               </div>
             )}
           </div>
        </div>
      </div>

      {/* Reply Box */}
      <div className="border-t border-slate-200 bg-slate-50 p-6 z-10">
        <AnimatePresence>
          {!replying ? (
            <motion.button 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={() => setReplying(true)}
              className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-300 shadow-sm rounded-xl text-slate-700 font-bold hover:bg-white hover:border-blue-400 hover:text-blue-600 transition-all"
            >
              <Send size={18} /> Reply
            </motion.button>
          ) : (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-4 max-w-4xl mx-auto"
            >
              <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden focus-within:ring-2 ring-blue-500/20 transition-all">
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  className="w-full h-40 p-4 resize-none outline-none text-slate-800 placeholder:text-slate-300"
                  placeholder="Type your secure reply here..."
                  autoFocus
                />
                <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-t border-slate-100">
                  <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                    <Shield size={10} /> ENCRYPTED TRANSMISSION
                  </span>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setReplying(false)}
                      className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleReply}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                    >
                      <Send size={14} /> Send Reply
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
