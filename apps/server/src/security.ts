import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
export function secureEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function registerSecurity(app: FastifyInstance, host: string, token?: string) {
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!loopback && (!token || token.length < 24))
    throw new Error('Non-loopback binding requires PARCELHUB_AUTH_TOKEN of at least 24 characters.');
  const sign = (value: string) =>
    createHmac('sha256', token ?? '')
      .update(value)
      .digest('hex');
  const validSession = (cookie: string) => {
    const [expires, signature] = cookie.split('.');
    return !!expires && !!signature && Number(expires) > Date.now() && secureEqual(sign(expires), signature);
  };
  app.addHook('onRequest', async (request, reply) => {
    if (loopback && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? ''))
      return reply.code(403).send({ error: 'Untrusted Host header' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin) {
      const origin = request.headers.origin;
      const allowed = [`http://${request.headers.host}`, `https://${request.headers.host}`];
      if (loopback) allowed.push('http://127.0.0.1:5173', 'http://localhost:5173');
      if (!allowed.includes(origin)) return reply.code(403).send({ error: 'Untrusted request origin' });
    }
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (['/api/health', '/api/session'].includes(request.url.split('?')[0])) return;
    if (token) {
      const session =
        (request.headers.cookie ?? '')
          .split(';')
          .map((s) => s.trim())
          .find((s) => s.startsWith('parcelhub_session='))
          ?.slice(18) ?? '';
      const bearer = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (!validSession(session) && !secureEqual(token, bearer))
        return reply.code(401).send({ error: 'Sign in to access your parcels.' });
    }
  });
  app.get('/api/session', async () => ({ required: !!token }));
  app.post<{ Body: { token?: unknown } }>(
    '/api/session',
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (request, reply) => {
      if (!token) return { ok: true };
      const candidate = request.body?.token;
      if (typeof candidate !== 'string' || !secureEqual(token, candidate))
        return reply.code(401).send({ error: 'Invalid access token' });
      const expiry = String(Date.now() + 24 * 3600000);
      reply.header(
        'Set-Cookie',
        `parcelhub_session=${expiry}.${sign(expiry)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${request.protocol === 'https' ? '; Secure' : ''}`,
      );
      return { ok: true };
    },
  );
  app.delete('/api/session', async (_request, reply) => {
    reply.header('Set-Cookie', 'parcelhub_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return { ok: true };
  });
}
