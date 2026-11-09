import { z } from 'zod';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  exportSchema,
  fullParcelSchema,
  settingsSchema,
  nextRefresh,
  type Parcel,
} from '../../../../packages/shared/src/index.js';
import { Store } from '../persistence/database.js';
import { TrackingEngine } from '../tracking/engine.js';

export function registerData(app: FastifyInstance, store: Store, engine: TrackingEngine) {
  app.get('/api/export', async (_request, reply) =>
    reply.header('Content-Disposition', 'attachment; filename="parcelhub-export.json"').send({
      format: 'parcelhub-v1',
      exportedAt: new Date().toISOString(),
      parcels: store.list(),
      settings: store.settings(),
    }),
  );
  app.post('/api/import', async (request, reply) => {
    const data = exportSchema.parse(request.body);
    let imported = 0,
      skipped = 0;
    store.transaction(() => {
      for (const p of data.parcels) {
        if (store.get(p.id) || store.find(p.trackingNumber, p.carrierCode)) {
          skipped++;
          continue;
        }
        p.nextRefreshAt = nextRefresh(p.status, !!p.archivedAt, store.settings(), Date.now());
        store.put(p as Parcel, true);
        imported++;
      }
    });
    return reply.send({ imported, skipped });
  });
  app.get('/api/backup', async (_request, reply) => {
    const bytes = await store.backup();
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', 'attachment; filename="parcelhub-backup.sqlite"')
      .send(bytes);
  });
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 20 * 1024 * 1024 },
    (_r, body, done) => done(null, body),
  );
  app.post('/api/restore', async (request, reply) => {
    if (request.headers['x-confirm-restore'] !== 'replace-all')
      return reply.code(400).send({ error: 'Restore requires explicit confirmation.' });
    store.maintenance = true;
    try {
      await engine.drain();
      let raw: ReturnType<Store['readBackup']>;
      try {
        raw = store.readBackup(request.body as Buffer);
      } catch {
        return reply
          .code(400)
          .send({ error: 'Invalid or incompatible SQLite backup. Current data was preserved.' });
      }
      const parcels = z.array(fullParcelSchema).max(10000).parse(raw.parcels),
        settings = settingsSchema.parse(raw.settings);
      const usage = z
        .array(
          z.object({
            id: z.uuid(),
            provider_id: z.string().max(100),
            parcel_id: z.uuid().nullable(),
            request_time: z.iso.datetime(),
            success: z.number().int().min(0).max(1),
            estimated_cost: z.number().min(0),
            error_category: z.string().max(100).nullable(),
          }),
        )
        .parse(raw.usage);
      const notices = z
        .array(
          z.object({
            id: z.string().max(100),
            parcelId: z.uuid(),
            title: z.string().max(100),
            status: z.enum([
              'OUT_FOR_DELIVERY',
              'DELIVERED',
              'DELIVERY_ATTEMPT_FAILED',
              'EXCEPTION',
              'RETURNED',
            ]),
            synthetic: z.boolean(),
            createdAt: z.iso.datetime(),
          }),
        )
        .parse(raw.notices);
      const states = z
        .array(
          z.object({
            id: z.string().max(100),
            disabled_reason: z.string().max(2000).nullable(),
            failures: z.number().int().min(0),
            open_until: z.iso.datetime().nullable(),
          }),
        )
        .parse(raw.states);
      // Restore canonical validated records, never schema/SQL/triggers from an uploaded database.
      const safety = await store.backup();
      const safetyDirectory = join(store.directory, 'backups');
      mkdirSync(safetyDirectory, { recursive: true });
      const safetyFile = `before-restore-${Date.now()}-${randomUUID()}.sqlite`;
      writeFileSync(join(safetyDirectory, safetyFile), safety, { flag: 'wx', mode: 0o600 });
      store.transaction(() => {
        store.db.exec(
          'DELETE FROM notification_history; DELETE FROM api_usage; DELETE FROM tracking_events; DELETE FROM parcels; DELETE FROM providers;',
        );
        for (const p of parcels) store.put(p as Parcel, true);
        store.saveSettings(settings);
        for (const u of usage)
          store.db
            .prepare('INSERT INTO api_usage VALUES(?,?,?,?,?,?,?)')
            .run(
              u.id,
              u.provider_id,
              u.parcel_id,
              u.request_time,
              u.success,
              u.estimated_cost,
              u.error_category,
            );
        for (const n of notices) store.addNotice(n);
        for (const s of states) store.setState(s.id, s.disabled_reason, s.failures, s.open_until);
      });
      // Return the prior snapshot so the UI can offer an immediate undo download.
      return { restored: parcels.length, previousBackup: safety.toString('base64'), safetyFile };
    } finally {
      store.maintenance = false;
    }
  });
}
