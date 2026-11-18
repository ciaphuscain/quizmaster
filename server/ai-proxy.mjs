// Optional local AI proxy for Quizmaster Studio.
// Keeps the Anthropic API key on your machine (never shipped to the browser).
//
//   ANTHROPIC_API_KEY=sk-ant-... npm run ai-proxy
//
// Then in Settings → AI assistant choose "Claude (local proxy)" with URL http://localhost:8787
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:4173').split(',');
const client = new Anthropic(); // reads ANTHROPIC_API_KEY (or an `ant auth login` profile) from the environment

function send(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? '';
  if (req.method === 'OPTIONS') return send(res, 204, {}, origin);
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true }, origin);
  if (req.method !== 'POST' || req.url !== '/generate') return send(res, 404, { error: 'Not found' }, origin);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 200_000) return send(res, 413, { error: 'Request too large' }, origin); }
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'Invalid JSON' }, origin); }
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) return send(res, 400, { error: 'prompt is required' }, origin);
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Server-side fallback: if a safety classifier declines, the API retries on a suitable model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: typeof body.system === 'string' ? body.system : undefined,
      messages: [{ role: 'user', content: body.prompt }],
    });
    if (response.stop_reason === 'refusal') return send(res, 422, { error: 'The model declined this request.' }, origin);
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return send(res, 200, { text }, origin);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'Invalid or missing ANTHROPIC_API_KEY on the proxy' }, origin);
    if (error instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'Rate limited — try again shortly' }, origin);
    if (error instanceof Anthropic.APIError) return send(res, 502, { error: `API error ${error.status}: ${error.message}` }, origin);
    return send(res, 502, { error: String(error?.message ?? error) }, origin);
  }
}).listen(PORT, () => console.log(`Quizmaster AI proxy listening on http://localhost:${PORT}`));
