import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { DurableObject } from 'cloudflare:workers';
import PostalMime from 'postal-mime';
import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

// --- Durable Object: Real-time Mailbox ---
export class Mailbox extends DurableObject<Env> {
	sessions = new Set<WebSocket>();

	async fetch(request: Request) {
		if (request.url.endsWith('/websocket')) {
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Expected Upgrade: websocket', { status: 426 });
			}

			const webSocketPair = new WebSocketPair();
			const [client, server] = Object.values(webSocketPair);

			this.ctx.acceptWebSocket(server);
			this.sessions.add(server);

			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		}
		return new Response('Mailbox DO Active', { status: 200 });
	}

	async webSocketMessage(ws: WebSocket, message: string) {
		// Handle client messages if needed (e.g. "ping")
	}

	async webSocketClose(ws: WebSocket) {
		this.sessions.delete(ws);
	}

	// Method called by the Worker when new email arrives
	async broadcastEmail(emailData: any) {
		const message = JSON.stringify({ type: 'NEW_EMAIL', data: emailData });
		this.ctx.getWebSockets().forEach((ws) => {
			try {
				ws.send(message);
			} catch (e) {
				// Handle disconnected sockets
			}
		});
	}
}

// --- Hono API ---
const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());

// 1. Generate New Identity
app.post('/api/generate', async (c) => {
	const username = Math.random().toString(36).substring(2, 10);
	const password = crypto.randomUUID().substring(0, 12); // Stronger auto-gen password
	const address = `${username}@${c.env.DOMAIN}`;

	await c.env.DB.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
		.bind(username, password)
		.run();

	return c.json({ username, address, password });
});

// 2. Login (for returning users)
app.post('/api/login', async (c) => {
	const { username, password } = await c.req.json();
	const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND password = ?')
		.bind(username, password)
		.first();

	if (!user) return c.json({ error: 'Invalid credentials' }, 401);
	return c.json({ success: true, username, address: `${username}@${c.env.DOMAIN}` });
});

// 3. List Emails
app.get('/api/emails/:username', async (c) => {
	const username = c.req.param('username');
	const { results } = await c.env.DB.prepare(
		'SELECT id, sender, subject, snippet, has_attachments, is_read, ai_summary, created_at FROM emails WHERE username = ? ORDER BY created_at DESC'
	)
		.bind(username)
		.all();
	return c.json(results);
});

// 4. Get Email Detail
app.get('/api/email/:id', async (c) => {
	const id = c.req.param('id');
	const meta = await c.env.DB.prepare('SELECT * FROM emails WHERE id = ?').bind(id).first();
	
	if (!meta) return c.json({ error: 'Not found' }, 404);

	// Mark as read
	if (!meta.is_read) {
		await c.env.DB.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').bind(id).run();
	}

	// Fetch raw content from R2
	let content = "";
	if (meta.raw_r2_key) {
		const obj = await c.env.MAIL_STORAGE.get(meta.raw_r2_key as string);
		if (obj) content = await obj.text();
	}

	return c.json({ ...meta, raw_content: content });
});

// 5. Reply to Email
app.post('/api/reply', async (c) => {
	const { username, replyTo, subject, body } = await c.req.json();
	
	const msg = createMimeMessage();
	msg.setSender({ name: username, addr: `${username}@${c.env.DOMAIN}` });
	msg.setRecipient(replyTo);
	msg.setSubject(`Re: ${subject}`);
	msg.addMessage({ contentType: 'text/plain', data: body });

	const emailMessage = new EmailMessage(
		`${username}@${c.env.DOMAIN}`,
		replyTo,
		msg.asRaw()
	);

	try {
		await c.env.EMAIL_SENDER.send(emailMessage);
		return c.json({ success: true });
	} catch (e: any) {
		return c.json({ error: e.message }, 500);
	}
});

// 6. WebSocket Upgrade Route
app.get('/api/ws', async (c) => {
	const username = c.req.query('username');
	if (!username) return c.text('Missing username', 400);

	const id = c.env.MAILBOX_DO.idFromName(username);
	const stub = c.env.MAILBOX_DO.get(id);
	
	return stub.fetch(c.req.raw);
});

// --- Worker Export ---
export default {
	...app, // API handlers

	// Email Handler (Cloudflare Email Routing)
	async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
		const parser = new PostalMime();
		const rawEmail = await new Response(message.raw).arrayBuffer();
		const parsed = await parser.parse(rawEmail);

		const toAddress = message.to;
		const username = toAddress.split('@')[0];
		
		// Validate user exists
		const user = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
		if (!user) {
			message.setReject("User does not exist");
			return;
		}

		const emailId = crypto.randomUUID();
		const r2Key = `${username}/${emailId}.json`;

		// 1. AI Analysis
		let aiSummary = "Processing AI summary...";
		try {
			const textBody = parsed.text?.substring(0, 1500) || parsed.html?.substring(0, 1500) || "";
			const prompt = `Analyze this email. Provide a brief 2-sentence summary and list any attachment types if mentioned. Email: ${textBody}`;
			
			const aiRes = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
				messages: [{ role: 'user', content: prompt }]
			}) as any;
			
			if (aiRes?.response) aiSummary = aiRes.response;
		} catch (e) {
			console.error("AI Error:", e);
			aiSummary = "AI Summary unavailable.";
		}

		// 2. Store Data
		// We store the parsed JSON in R2 for easy frontend rendering without re-parsing
		await env.MAIL_STORAGE.put(r2Key, JSON.stringify(parsed));

		await env.DB.prepare(
			`INSERT INTO emails (id, username, sender, subject, snippet, raw_r2_key, has_attachments, ai_summary) 
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			emailId,
			username,
			parsed.from.address,
			parsed.subject || "(No Subject)",
			(parsed.text || "").substring(0, 150),
			r2Key,
			parsed.attachments && parsed.attachments.length > 0 ? 1 : 0,
			aiSummary
		).run();

		// 3. Notify Durable Object (Real-time)
		const doId = env.MAILBOX_DO.idFromName(username);
		const stub = env.MAILBOX_DO.get(doId);
		
		// Use RPC if configured, or simple fetch triggering
		// Here we trigger the DO to broadcast via a fetch call or internal method if using RPC
		// For compat, we won't use direct RPC syntax in this block without configuring it, so we rely on the DO instance knowing.
		// Actually, let's just assume the client polls OR we add a specific 'internal' fetch endpoint to the DO.
		// In a production RPC setup: await stub.broadcastEmail({...});
		// Since we defined the class above, we can cast:
		await (stub as any).broadcastEmail({
			id: emailId,
			sender: parsed.from.address,
			subject: parsed.subject,
			ai_summary: aiSummary
		});
	}
};
