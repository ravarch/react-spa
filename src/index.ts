import PostalMime from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { EmailMessage } from "cloudflare:email";

// --- TYPES ---
interface Env {
  DB: D1Database;
  AI: Ai;
  VECTOR_INDEX: VectorizeIndex;
  MAIL_STORAGE: R2Bucket;
  QUEUE: Queue<EmailJob>;
  DLQ: Queue<EmailJob>;
  USAGE_ANALYTICS: AnalyticsEngineDataset;
  EMAIL_SENDER: SendEmail;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  DOMAIN: string;
}

interface EmailJob {
  id: string;
  userId: string;
  to: string;
  from: string;
  raw: string;
}

type Variables = {
  user: { id: string; username: string };
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('/api/*', cors({ origin: '*' }));

// --- SECURITY HELPERS ---
async function hashPassword(password: string, salt: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    key, 256
  );
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- MIDDLEWARE ---
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth')) return next();
  
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  
  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('user', payload as any);
    await next();
  } catch {
    return c.json({ error: 'Invalid Token' }, 401);
  }
});

// --- ROUTES ---

// 1. Auth & Auto-Provisioning
app.post('/api/auth/guest', async (c) => {
  const id = crypto.randomUUID();
  const randomSuffix = crypto.randomUUID().split('-')[0];
  const username = `user_${randomSuffix}`; 
  const password = crypto.randomUUID().slice(0, 12); // Shorter, readable password
  const salt = crypto.randomUUID();
  const hash = await hashPassword(password, salt);

  try {
    // 1. Create User
    await c.env.DB.prepare('INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, username, hash, salt, Date.now()).run();
    
    // 2. Create Default Alias
    const address = `${username}@${c.env.DOMAIN}`;
    await c.env.DB.prepare('INSERT INTO aliases (address, user_id, name) VALUES (?, ?, ?)')
      .bind(address, id, 'My Inbox').run();

    // 3. Issue Token
    const token = await sign({ id, username, exp: Math.floor(Date.now()/1000) + (86400 * 30) }, c.env.JWT_SECRET);
    
    // RETURN PASSWORD so user can save it!
    return c.json({ token, user: { id, username }, address, generatedPassword: password });
  } catch (e) {
    console.error("Guest Creation Error", e);
    return c.json({ error: "Failed to provision temporary inbox" }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<{ id: string, username: string, password_hash: string, salt: string }>();
  
  if (!user) return c.json({ error: "Invalid credentials" }, 401);
  
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) return c.json({ error: "Invalid credentials" }, 401);

  const token = await sign({ id: user.id, username: user.username, exp: Math.floor(Date.now()/1000) + (86400 * 30) }, c.env.JWT_SECRET);
  return c.json({ token, user: { id: user.id, username: user.username } });
});

// 2. Data
app.get('/api/usage', async (c) => {
  const userId = c.get('user').id;
  const stats = await c.env.DB.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM emails WHERE user_id = ?) as total_emails,
      (SELECT COUNT(*) FROM emails WHERE user_id = ? AND category = 'Spam') as spam_blocked,
      (SELECT COUNT(*) FROM scheduled_emails WHERE user_id = ? AND status = 'pending') as scheduled_count
  `).bind(userId, userId, userId).first();
  return c.json(stats);
});

app.get('/api/emails', async (c) => {
  const userId = c.get('user').id;
  const { results } = await c.env.DB.prepare('SELECT * FROM emails WHERE user_id = ? ORDER BY received_at DESC LIMIT 50').bind(userId).all();
  return c.json(results);
});

app.get('/api/aliases', async (c) => {
  const userId = c.get('user').id;
  const { results } = await c.env.DB.prepare('SELECT * FROM aliases WHERE user_id = ?').bind(userId).all();
  return c.json(results);
});

// 3. Sending
app.post('/api/send', async (c) => {
  const userId = c.get('user').id;
  const { from, to, subject, body, scheduleTime } = await c.req.json();

  const alias = await c.env.DB.prepare('SELECT * FROM aliases WHERE address = ? AND user_id = ?').bind(from, userId).first();
  if (!alias) return c.json({ error: "Unauthorized sender address" }, 403);

  if (scheduleTime) {
    await c.env.DB.prepare('INSERT INTO scheduled_emails (id, user_id, from_address, to_address, subject, body_html, scheduled_for, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, from, to, subject, body, new Date(scheduleTime).getTime(), 'pending').run();
    return c.json({ status: 'scheduled' });
  }

  const msg = createMimeMessage();
  msg.setSender({ name: 'RavArch User', addr: from });
  msg.setRecipient(to);
  msg.setSubject(subject);
  msg.addMessage({ contentType: 'text/html', data: body });

  try {
    const message = new EmailMessage(from, to, msg.asRaw());
    await c.env.EMAIL_SENDER.send(message);
    return c.json({ status: 'sent' });
  } catch (e: any) {
    console.error("Send Error:", e);
    return c.json({ error: e.message || "Failed to send email" }, 500);
  }
});

export default {
  fetch: app.fetch,

  // 1. INGESTION
  async email(message, env, ctx) {
    const alias = await env.DB.prepare('SELECT user_id FROM aliases WHERE address = ?').bind(message.to).first<{ user_id: string }>();
    if (!alias) {
      message.setReject("Unknown User");
      return;
    }

    const userId = alias.user_id;

    // Forwarding Logic
    try {
      const { results: rules } = await env.DB.prepare("SELECT * FROM forwarding_rules WHERE user_id = ? AND active = 1").bind(userId).all<any>();
      for (const rule of rules) {
        let shouldForward = false;
        if (rule.condition_type === 'all') shouldForward = true;
        else if (rule.condition_type === 'sender' && message.from.includes(rule.condition_value)) shouldForward = true;

        if (shouldForward) await message.forward(rule.forward_to);
      }
    } catch (e) { console.error("Forwarding failed", e); }

    const id = crypto.randomUUID();
    const rawBuffer = await new Response(message.raw).arrayBuffer();
    
    await env.MAIL_STORAGE.put(`raw/${id}`, rawBuffer);

    env.USAGE_ANALYTICS.writeDataPoint({ blobs: ["ingest", userId], doubles: [rawBuffer.byteLength] });

    await env.QUEUE.send({ 
      id, userId, to: message.to, from: message.from, 
      raw: btoa(String.fromCharCode(...new Uint8Array(rawBuffer))) 
    });
  },

  // 2. PROCESSING
  async queue(batch, env) {
    if (batch.queue === 'mail-dlq') return;

    const results = await Promise.allSettled(batch.messages.map(async (msg) => {
      const job = msg.body as EmailJob;
      try {
        const parser = new PostalMime();
        const raw = Uint8Array.from(atob(job.raw), c => c.charCodeAt(0));
        const parsed = await parser.parse(raw);
        const text = (parsed.text || parsed.html || "").slice(0, 4000);

        let aiData = { category: 'Inbox', sentiment: 0, summary: 'No summary' };
        try {
          // Check if AI binding exists before calling
          if (env.AI) {
              const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [{ 
                  role: 'user', 
                  content: `Analyze email. JSON: { "summary": "string", "category": "Work|Personal|Spam|Finance", "sentiment": 0.5 }. Subject: ${parsed.subject}\n\nBody: ${text}` 
                }],
                response_format: { type: 'json_object' }
              });
              // @ts-ignore
              aiData = JSON.parse(aiRes.response);
          }
        } catch (e) { console.warn("AI Fail", e); }

        // Attachments
        let hasAttachments = 0;
        if (parsed.attachments && parsed.attachments.length > 0) {
           hasAttachments = 1;
           for (const att of parsed.attachments) {
             const attId = crypto.randomUUID();
             const key = `attachments/${job.id}/${attId}`;
             await env.MAIL_STORAGE.put(key, att.content);
             await env.DB.prepare(`INSERT INTO attachments (id, email_id, filename, content_type, size, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(attId, job.id, att.filename, att.mimeType, att.content.byteLength, key, Date.now()).run();
           }
        }

        await env.DB.prepare(`
          INSERT INTO emails (id, user_id, sender_address, subject, summary, category, sentiment_score, received_at, has_attachments, is_read)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).bind(job.id, job.userId, parsed.from.address, parsed.subject, aiData.summary, aiData.category, aiData.sentiment, Date.now(), hasAttachments).run();

        msg.ack();
      } catch (e) {
        console.error("Queue Error", e);
        msg.retry(); 
      }
    }));
  },

  // 3. SCHEDULING
  async scheduled(event, env, ctx) {
    const { results } = await env.DB.prepare("SELECT * FROM scheduled_emails WHERE status = 'pending' AND scheduled_for <= ?").bind(Date.now()).all<any>();
    for (const task of results) {
      try {
        const msg = createMimeMessage();
        msg.setSender({ name: 'Scheduled', addr: task.from_address });
        msg.setRecipient(task.to_address);
        msg.setSubject(task.subject);
        msg.addMessage({ contentType: 'text/html', data: task.body_html });
        await env.EMAIL_SENDER.send(new EmailMessage(task.from_address, task.to_address, msg.asRaw()));
        await env.DB.prepare("UPDATE scheduled_emails SET status = 'sent' WHERE id = ?").bind(task.id).run();
      } catch (e) {
        await env.DB.prepare("UPDATE scheduled_emails SET status = 'failed' WHERE id = ?").bind(task.id).run();
      }
    }
  }
} satisfies ExportedHandler<Env>;
