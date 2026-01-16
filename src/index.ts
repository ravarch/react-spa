import { WorkerEntrypoint } from "cloudflare:workers";
import PostalMime from 'postal-mime';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  DB: D1Database;
  AI: Ai;
  EMAIL_SENDER: SendEmail;
  ASSETS: Fetcher;
  QUEUE: Queue;
  VECTOR_INDEX: VectorizeIndex;
  MAIL_STORAGE: R2Bucket;
}

interface EmailJob {
  id: string;
  raw: string; // Base64 encoded
  from: string;
  to: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());

// --- 1. API ROUTES ---

// Get Inbox
app.get('/api/emails', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, sender_name, sender_address, subject, summary, category, sentiment_score, received_at, is_read 
     FROM emails WHERE is_archived = 0 ORDER BY received_at DESC LIMIT 50`
  ).all();
  return c.json(results);
});

// Get Single Email
app.get('/api/emails/:id', async (c) => {
  const id = c.req.param('id');
  
  // Fetch metadata
  const email = await c.env.DB.prepare('SELECT * FROM emails WHERE id = ?').bind(id).first();
  if (!email) return c.json({ error: 'Not found' }, 404);

  // Mark as read
  await c.env.DB.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').bind(id).run();
  
  // Try to fetch body from R2 (for full content), fallback to D1 or empty
  let body_html = "";
  try {
    const r2Object = await c.env.MAIL_STORAGE.get(`raw/${id}`);
    if (r2Object) {
      const rawBuffer = await r2Object.arrayBuffer();
      const parser = new PostalMime();
      const parsed = await parser.parse(rawBuffer);
      body_html = parsed.html || parsed.text || "";
    }
  } catch (e) {
    console.warn("Could not fetch from R2, using fallback if available");
  }

  return c.json({ ...email, body_html });
});

// Semantic Search
app.post('/api/search', async (c) => {
  const { query } = await c.req.json();
  
  // 1. Generate Embedding
  const embedding = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [query] });
  
  // 2. Query Vector Index
  // @ts-ignore
  const vectorResults = await c.env.VECTOR_INDEX.query(embedding.data[0], { topK: 10 });
  const ids = vectorResults.matches.map(m => m.id);
  
  if (ids.length === 0) return c.json([]);
  
  // 3. Fetch Details from D1
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM emails WHERE id IN (${placeholders})`
  ).bind(...ids).all();
  
  return c.json(results);
});

// Send Email
app.post('/api/send', async (c) => {
  const { to, subject, body } = await c.req.json();
  try {
    await c.env.EMAIL_SENDER.send({
      to: [{ email: to }],
      from: { email: "me@yourdomain.com", name: "RavArch AI" },
      subject: subject,
      content: [{ type: "text/plain", value: body }]
    });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- 2. WORKER HANDLERS ---

export default {
  // HTTP Handler (API)
  fetch: app.fetch,

  // EMAIL HANDLER (The Sentinel)
  // Accepts email, saves raw, and pushes to queue. Fast & Lightweight.
  async email(message, env, ctx) {
    const id = crypto.randomUUID();
    const rawBuffer = await new Response(message.raw).arrayBuffer();
    
    // 1. Store Raw immediately to R2 (Safekeeping)
    await env.MAIL_STORAGE.put(`raw/${id}`, rawBuffer);

    // 2. Offload Processing to Queue
    // We encode to Base64 to pass securely through the Queue
    const rawBase64 = btoa(String.fromCharCode(...new Uint8Array(rawBuffer)));
    
    await env.QUEUE.send({ 
      id, 
      raw: rawBase64, 
      from: message.from, 
      to: message.to 
    });
  },

  // QUEUE HANDLER (The Brain)
  // Processes heavy AI tasks without timing out the Email request.
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const job = msg.body as EmailJob;
      
      try {
        const parser = new PostalMime();
        // Decode raw email from Base64
        const rawString = atob(job.raw);
        const parsed = await parser.parse(rawString);

        // A. Extract Text for AI
        const bodyText = parsed.text || parsed.html || "";
        const cleanBody = bodyText.slice(0, 4000); 

        // B. AI Analysis (Llama 3.1)
        const systemPrompt = `
          Analyze this email. Return JSON:
          {
            "summary": "1 sentence summary",
            "category": "Work|Personal|Finance|Urgent|Spam",
            "sentiment": 0.0,
            "action_items": ["item1", "item2"],
            "suggested_reply": "draft reply"
          }
        `;
        
        const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Subject: ${parsed.subject}\n\n${cleanBody}` }
          ],
          response_format: { type: 'json_object' }
        });

        // @ts-ignore
        const aiData = JSON.parse(aiRes.response || "{}");

        // C. Generate Embedding (for Search)
        const vecRes = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: [`Subject: ${parsed.subject} \n ${cleanBody}`]
        });

        // D. Save to Vectorize
        await env.VECTOR_INDEX.upsert([{
          id: job.id,
          values: vecRes.data[0],
          metadata: { category: aiData.category }
        }]);

        // E. Save to D1
        await env.DB.prepare(`
          INSERT INTO emails (
            id, sender_name, sender_address, recipient_address, subject, 
            body_text, body_html, received_at, summary, category, 
            sentiment_score, action_items, suggested_reply
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          job.id, 
          parsed.from.name, 
          parsed.from.address, 
          job.to, 
          parsed.subject,
          parsed.text,
          parsed.html,
          Date.now(),
          aiData.summary,
          aiData.category,
          aiData.sentiment || 0,
          JSON.stringify(aiData.action_items || []),
          aiData.suggested_reply
        ).run();

        // Acknowledge success
        msg.ack();

      } catch (err) {
        console.error("Queue Processing Failed:", err);
        // Retrying can cause loops if error is permanent, so be careful
        // msg.retry(); 
      }
    }
  }
} satisfies ExportedHandler<Env>;
