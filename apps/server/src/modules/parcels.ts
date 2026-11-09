import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { parcelInput, editInput, nextRefresh } from '../../../../packages/shared/src/index.js';
import { Store } from '../persistence/database.js';
import { TrackingEngine } from '../tracking/engine.js';
const idOf = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
export function registerParcels(app: FastifyInstance, store: Store, engine: TrackingEngine) {
  app.get('/api/parcels', async () => ({
    parcels: await store.listTyped(),
    serverTime: new Date().toISOString(),
  }));
  app.get('/api/parcels/:id', async (request, reply) => {
    const p = store.get(idOf(request.params));
    return p ?? reply.code(404).send({ error: 'Parcel not found' });
  });
  app.post('/api/parcels', async (request, reply) => {
    const input = parcelInput.parse(request.body);
    const byId = input.id ? store.get(input.id) : undefined;
    if (byId) {
      if (byId.trackingNumber === input.trackingNumber && byId.carrierCode === input.carrierCode) return byId;
      return reply.code(409).send({ error: 'This identifier belongs to a different parcel.' });
    }
    if (store.find(input.trackingNumber, input.carrierCode))
      return reply.code(409).send({ error: 'This tracking number is already saved for this courier.' });
    const p = store.create(input);
    return reply.code(201).send(await engine.refresh(p.id));
  });
  app.patch('/api/parcels/:id', async (request, reply) => {
    const id = idOf(request.params),
      patch = editInput.parse(request.body),
      p = store.get(id);
    if (!p) return reply.code(404).send({ error: 'Parcel not found' });
    if (p.version !== patch.expectedVersion)
      return reply
        .code(409)
        .send({ error: 'This parcel changed on the server. Your edit is preserved for review.', current: p });
    if (
      (patch.trackingNumber && patch.trackingNumber !== p.trackingNumber) ||
      (patch.carrierCode && patch.carrierCode !== p.carrierCode)
    )
      return reply.code(400).send({
        error: 'Save a new parcel to change the tracking identity; existing tracking history is retained.',
      });
    const { expectedVersion: _expected, ...changes } = patch;
    if (patch.trackingMode && patch.trackingMode !== p.trackingMode) {
      p.status = 'UNKNOWN';
      p.rawStatus = '';
      p.providerId = null;
      p.lastSuccessfulRefresh = null;
      p.location = null;
      p.origin = null;
      p.destination = null;
      p.service = null;
      p.deliveredAt = null;
    }
    Object.assign(p, changes);
    p.updatedAt = new Date().toISOString();
    p.version++;
    p.error = null;
    p.errorCategory = null;
    p.nextRefreshAt = nextRefresh(p.status, !!p.archivedAt, store.settings(), Date.now());
    store.put(p);
    return p;
  });
  app.delete('/api/parcels/:id', async (request, reply) => {
    const id = idOf(request.params),
      p = store.get(id);
    if (!p) return { ok: true };
    const version = z.coerce
      .number()
      .int()
      .parse((request.query as Record<string, unknown>).version);
    if (p.version !== version)
      return reply
        .code(409)
        .send({ error: 'This parcel changed before deletion. Review the current version.', current: p });
    store.remove(id);
    return { ok: true };
  });
  app.post(
    '/api/parcels/:id/refresh',
    { config: { rateLimit: { max: 30, timeWindow: 60000 } } },
    async (request, reply) => {
      const id = idOf(request.params);
      if (!store.get(id)) return reply.code(404).send({ error: 'Parcel not found' });
      return engine.refresh(id, true);
    },
  );
  app.post('/api/archive-delivered', async () => {
    let count = 0;
    for (const p of store.list()) {
      if (p.status === 'DELIVERED' && !p.archivedAt) {
        p.archivedAt = new Date().toISOString();
        p.nextRefreshAt = null;
        p.updatedAt = p.archivedAt;
        p.version++;
        store.put(p);
        count++;
      }
    }
    return { archived: count };
  });
  app.post('/api/demo', async () => {
    let count = 0;
    const names = [
      'A little desk upgrade',
      'Weekend essentials',
      'Coffee, finally.',
      'Something for home',
      'Running shoes',
      'A good read',
    ];
    const codes = ['jne', 'jnt', 'spx', 'sicepat', 'anteraja', 'ninja'] as const;
    const ages = [2, 3, 0, 4, 1, 2];
    for (let i = 0; i < names.length; i++) {
      const number = `DEMO-${10001 + i}`;
      if (store.find(number, codes[i])) continue;
      const p = store.create(
        parcelInput.parse({
          trackingNumber: number,
          carrierCode: codes[i],
          nickname: names[i],
          storeName: ['Tokopedia', 'Shopee', 'Shopee', 'Local shop', 'Tokopedia', 'Gramedia'][i],
          trackingMode: 'mock',
          tags: ['Demo'],
        }),
        new Date(Date.now() - ages[i] * 60000).toISOString(),
      );
      await engine.refresh(p.id);
      count++;
    }
    return { created: count };
  });
}
