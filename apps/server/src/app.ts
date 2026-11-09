import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { settingsSchema, nextRefresh } from '../../../packages/shared/src/index.js';
import { Store } from './persistence/database.js';
import { TrackingEngine } from './tracking/engine.js';
import { Scheduler } from './scheduler/scheduler.js';
import { registerSecurity } from './security.js';
import { registerParcels } from './modules/parcels.js';
import { registerData } from './modules/data.js';
import { ProviderError, type TrackingProvider } from './providers/types.js';

export async function createApp(
  options: {
    directory?: string;
    host?: string;
    token?: string;
    scheduler?: boolean;
    webRoot?: string;
    providers?: TrackingProvider[];
    now?: () => Date;
  } = {},
) {
  if (process.env.KLIKRESI_BASE_URL && process.env.KLIKRESI_BASE_URL !== 'https://klikresi.com')
    throw new Error('Custom outbound provider URLs are disabled.');
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024 });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, { max: 300, timeWindow: 60000 });
  registerSecurity(app, options.host ?? '127.0.0.1', options.token);
  const store = new Store(options.directory ?? resolve('data'));
  const engine = new TrackingEngine(store, options.providers, options.now);
  const scheduler = new Scheduler(engine);
  app.addHook('preHandler', async (request, reply) => {
    if (store.maintenance && !['GET', 'HEAD'].includes(request.method))
      return reply
        .code(503)
        .send({ error: 'Database restoration is in progress. Retry shortly; local edits are preserved.' });
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: 'Please check the input.',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    if (error instanceof ProviderError)
      return reply
        .code(error.category === 'COOLDOWN' ? 429 : 422)
        .send({ error: error.message, category: error.category });
    const status = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 500;
    if (status < 500)
      return reply.code(status).send({ error: error instanceof Error ? error.message : 'Request failed' });
    return reply
      .code(500)
      .send({ error: 'The operation could not be completed. Your saved data has been preserved.' });
  });
  app.get('/api/health', async () => ({ ok: true }));
  registerParcels(app, store, engine);
  registerData(app, store, engine);
  app.get('/api/settings', async () => store.settings());
  app.put('/api/settings', async (request) => {
    const settings = settingsSchema.parse(request.body);
    store.transaction(() => {
      store.saveSettings(settings);
      for (const p of store.list()) {
        p.nextRefreshAt = nextRefresh(p.status, !!p.archivedAt, settings, Date.now());
        store.put(p);
      }
    });
    return settings;
  });
  app.get('/api/providers', async () => engine.info());
  app.post('/api/providers/:id/reset', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!engine.providers.some((p) => p.id === id))
      return reply.code(404).send({ error: 'Provider not found' });
    store.setState(id, null, 0, null);
    for (const p of store.list()) {
      if (p.errorCategory === 'AUTH') {
        p.error = null;
        p.errorCategory = null;
        p.nextRefreshAt = nextRefresh(p.status, !!p.archivedAt, store.settings(), Date.now());
        store.put(p);
      }
    }
    return { ok: true };
  });
  app.post('/api/providers/:id/test', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const p = engine.providers.find((x) => x.id === id);
    if (!p) return reply.code(404).send({ error: 'Provider not found' });
    if (!p.configured)
      return reply
        .code(422)
        .send({ error: 'API key is absent. Configure the backend environment and restart.' });
    if (!p.testConnection)
      return {
        ok: true,
        level: 'configuration',
        message:
          'API key is present. Live access is verified by refreshing a saved parcel, subject to budgets.',
      };
    await p.testConnection();
    return {
      ok: true,
      level: 'live-account',
      message:
        'Provider account authentication succeeded. Individual courier access still depends on your account.',
    };
  });
  app.get('/api/usage', async () => engine.usage());
  app.get('/api/notifications', async () => store.notices());
  app.get('/api/carriers', async () => {
    const { carriers } = await import('../../../packages/shared/src/index.js');
    return carriers;
  });
  const webRoot = options.webRoot ?? resolve('apps/web/dist');
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'API route not found' })
        : reply.sendFile('index.html'),
    );
  }
  if (options.scheduler !== false) scheduler.start();
  app.addHook('onClose', async () => {
    await scheduler.stop();
    store.close();
  });
  return { app, store, engine, scheduler };
}
