import { WorkerEntrypoint } from "cloudflare:workers";
import PostalMime from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';

// --- TYPES ---
interface Env {
  DB: D1Database;
  AI: Ai;
  VECTOR_INDEX: VectorizeIndex;
  MAIL_STORAGE: R2Bucket;
  QUEUE: Queue;
  EMAIL_SENDER: SendEmail;
  ASSETS: Fetcher;
  JWT_SECRET: string; // Set via `wrangler secret put JWT_SECRET`
}

const JWT_SECRET = "CHANGE_THIS_TO_A_REAL_SECRET_IN_PROD"; 
const DOMAIN = "drkingbd.cc";

const app = new Hono<{ Bindings: Env }>();

// Global Middleware
app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE']
}));

// --- AUTH MIDDLEWARE ---
async function authMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return c.json({ error: 'Unauthorized' }, 401);
  
  const token = authHeader.split(' ')[1];
  try {
    const payload = await verify(token, c.env.JWT_SECRET || JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch (e) {
    return c.json({ error: 'Invalid Token' }, 401);
  }
}

// --- 1. AUTHENTICATION ---

app.post('/api/auth/register', async (c) => {
  const { username, password } = await c.req.json();
  
  // Basic validation
  if (username.length < 3 || password.length < 6) return c.json({ error: "Invalid input" }, 400);

  const id = crypto.randomUUID();
  // IN PROD: Use bcrypt/argon2. For demo, we hash simply (DO NOT DO THIS IN REAL BANKING APPS)
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  try {
    await c.env.DB.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').bind(id, username, passwordHash, Date.now()).run();
    
    // Create Primary Alias
    const primaryAlias = `${username}@${DOMAIN}`;
    await c.env.DB.prepare('INSERT INTO aliases (address, user_id, name, is_primary) VALUES (?, ?, ?, 1)').bind(primaryAlias, id, username).run();
    
    return c.json({ success: true, message: "Account created" });
  } catch (e) {
    return c.json({ error: "Username taken" }, 409);
  }
});

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json();
  
  // Hash & Compare
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const passwordHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?').bind(username, passwordHash).first();
  
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  // Generate JWT
  // @ts-ignore
  const token = await sign({ id: user.id, username: user.username, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 }, c.env.JWT_SECRET || JWT_SECRET);
  
  return c.json({ token, user: { id: user.id, username: user.username } });
});

// --- 2. MAILBOX OPERATIONS (Protected) ---

app.get('/api/emails', authMiddleware, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  const folder = c.req.query('folder') || 'inbox';
  const limit = 50;
  
  const { results } = await c.env.DB.prepare(
    `SELECT id, sender_name, sender_address, subject, summary, category, sentiment_score, received_at, is_read, has_attachments 
     FROM emails 
     WHERE user_id = ? AND folder = ? 
     ORDER BY received_at DESC LIMIT ?`
  ).bind(userId, folder, limit).all();
  
  return c.json(results);
});

app.get('/api/emails/:id', authMiddleware, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  const id = c.req.param('id');
  
  const email = await c.env.DB.prepare('SELECT * FROM emails WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!email) return c.json({ error: 'Not found' }, 404);

  // Mark Read
  c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').bind(id).run());

  // Fetch Attachments & Body
  const [attachments, r2Object] = await Promise.all([
    c.env.DB.prepare('SELECT id, filename, size, content_type FROM attachments WHERE email_id = ?').bind(id).all(),
    c.env.MAIL_STORAGE.get(`raw/${id}`)
  ]);

  let body_html = "";
  if (r2Object) {
    const rawBuffer = await r2Object.arrayBuffer();
    const parser = new PostalMime();
    const parsed = await parser.parse(rawBuffer);
    body_html = parsed.html || parsed.text || "";
  }

  return c.json({ ...email, body_html, attachments: attachments.results });
});

// --- 3. SENDING & SCHEDULING ---

app.post('/api/send', authMiddleware, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  const { from, to, subject, body, scheduleTime } = await c.req.json();

  // Security: Verify user owns 'from' address
  const alias = await c.env.DB.prepare('SELECT address FROM aliases WHERE address = ? AND user_id = ?').bind(from, userId).first();
  if (!alias) return c.json({ error: "You do not own this email address" }, 403);

  if (scheduleTime) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO scheduled_emails (id, user_id, from_address, to_address, subject, body_html, scheduled_for, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, userId, from, to, subject, body, new Date(scheduleTime).getTime(), Date.now()).run();
    return c.json({ status: 'scheduled' });
  }

  // Immediate Send
  try {
    const msg = createMimeMessage();
    msg.setSender({ name: 'RavArch User', addr: from });
    msg.setRecipient(to);
    msg.setSubject(subject);
    msg.addMessage({ contentType: 'text/html', data: body });

    // Using Cloudflare Email Routing Binding
    // NOTE: Sending *raw* MIME via binding requires compatible configuration. 
    // If not supported in your specific plan, fall back to simple object:
    /*
    await c.env.EMAIL_SENDER.send({
      from: { email: from },
      to: [{ email: to }],
      subject: subject,
      content: [{ type: "text/html", value: body }]
    });
    */
    
    // Attempting Raw Send (for MIME correctness)
    // @ts-ignore - The types sometimes lag behind capabilities
    await c.env.EMAIL_SENDER.send(new Request('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'content-type': 'message/rfc822' },
        body: msg.asRaw()
    }));

    // Save to Sent Folder
    const sentId = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO emails (id, user_id, sender_address, recipient_address, subject, body_html, folder, received_at, is_read)
      VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, 1)
    `).bind(sentId, userId, from, to, subject, body, Date.now()).run();

    return c.json({ status: 'sent' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- 4. ALIAS MANAGEMENT ---

app.post('/api/aliases', authMiddleware, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  const { name } = await c.req.json();
  const address = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@${DOMAIN}`;
  
  try {
    await c.env.DB.prepare('INSERT INTO aliases (address, user_id, name) VALUES (?, ?, ?)').bind(address, userId, name).run();
    return c.json({ address });
  } catch(e) { return c.json({ error: "Alias taken" }, 409); }
});

app.get('/api/aliases', authMiddleware, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  const { results } = await c.env.DB.prepare('SELECT * FROM aliases WHERE user_id = ?').bind(userId).all();
  return c.json(results);
});


// --- WORKER EXPORT ---
export default {
  fetch: app.fetch,

  // 1. INCOMING MAIL HANDLER
  async email(message, env, ctx) {
    const id = crypto.randomUUID();
    
    // Routing Logic: Find User ID from Recipient Alias
    const alias = await env.DB.prepare('SELECT user_id FROM aliases WHERE address = ?').bind(message.to).first();
    
    if (!alias) {
      message.setReject("User unknown");
      return;
    }
    
    // Save Raw
    const rawBuffer = await new Response(message.raw).arrayBuffer();
    await env.MAIL_STORAGE.put(`raw/${id}`, rawBuffer);

    // Enqueue
    const rawBase64 = btoa(String.fromCharCode(...new Uint8Array(rawBuffer)));
    await env.QUEUE.send({ 
      id, 
      userId: alias.user_id,
      to: message.to,
      from: message.from,
      raw: rawBase64 
    });
  },

  // 2. BACKGROUND PROCESSOR (AI + Rules)
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const job = msg.body as any;
      try {
        const parser = new PostalMime();
        const rawString = atob(job.raw);
        const parsed = await parser.parse(rawString);
        const text = (parsed.text || parsed.html || "").slice(0, 4000);

        // A. Forwarding Rules
        const rules = await env.DB.prepare('SELECT * FROM forwarding_rules WHERE user_id = ? AND active = 1').bind(job.userId).all();
        for (const rule of rules.results) {
          let shouldForward = false;
          if (rule.condition_type === 'all') shouldForward = true;
          if (rule.condition_type === 'sender' && parsed.from.address.includes(rule.condition_value as string)) shouldForward = true;
          
          if (shouldForward) {
             // Forward Logic Here (Construct new MIME)
             // Simplified for brevity:
             // await env.EMAIL_SENDER.forward(job.to, rule.forward_to, ...);
          }
        }

        // B. AI Analysis
        let aiData = { summary: "", category: "Inbox", sentiment: 0, action_items: [] };
        try {
          const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{ 
              role: 'system', 
              content: 'Analyze email. Return JSON: { "summary": "string", "category": "Work|Finance|Personal|Spam", "sentiment": number, "action_items": string[] }' 
            }, { 
              role: 'user', 
              content: `Subject: ${parsed.subject}\n\n${text}` 
            }],
            response_format: { type: 'json_object' }
          });
          // @ts-ignore
          aiData = JSON.parse(aiRes.response);
        } catch (e) { console.error("AI Fail", e); }

        // C. Save to DB
        await env.DB.prepare(`
          INSERT INTO emails (id, user_id, sender_name, sender_address, recipient_address, subject, summary, category, sentiment_score, action_items, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          job.id, job.userId, parsed.from.name, parsed.from.address, job.to, parsed.subject,
          aiData.summary, aiData.category, aiData.sentiment, JSON.stringify(aiData.action_items), Date.now()
        ).run();
        
        // D. Handle Attachments
        if (parsed.attachments && parsed.attachments.length > 0) {
           for (const att of parsed.attachments) {
             const attId = crypto.randomUUID();
             const key = `attachments/${job.id}/${att.filename}`;
             await env.MAIL_STORAGE.put(key, att.content);
             await env.DB.prepare('INSERT INTO attachments (id, email_id, filename, content_type, size, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(attId, job.id, att.filename, att.mimeType, att.content.byteLength, key, Date.now()).run();
           }
        }

        msg.ack();
      } catch (e) {
        console.error("Queue Error", e);
        msg.retry();
      }
    }
  },

  // 3. SCHEDULER
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const { results } = await env.DB.prepare("SELECT * FROM scheduled_emails WHERE status = 'pending' AND scheduled_for <= ?").bind(now).all();
    
    for (const email of results) {
      try {
        // Send
        const msg = createMimeMessage();
        msg.setSender({ name: 'Scheduled', addr: email.from_address as string });
        msg.setRecipient(email.to_address as string);
        msg.setSubject(email.subject as string);
        msg.addMessage({ contentType: 'text/html', data: email.body_html as string });
        
        // @ts-ignore
        await env.EMAIL_SENDER.send(new Request('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: { 'content-type': 'message/rfc822' },
            body: msg.asRaw()
        }));

        await env.DB.prepare("UPDATE scheduled_emails SET status = 'sent' WHERE id = ?").bind(email.id).run();
      } catch (e) {
        console.error("Schedule Fail", e);
        await env.DB.prepare("UPDATE scheduled_emails SET status = 'failed' WHERE id = ?").bind(email.id).run();
      }
    }
  }

} satisfies ExportedHandler<Env>;
