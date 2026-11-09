import { resolve } from 'node:path';
import { createApp } from './app.js';
const host = process.env.HOST ?? '127.0.0.1';
// Resolve from monorepo root in npm workspace development and production.
const root = process.cwd().replace(/[\\/]apps[\\/]server$/, '');
const { app } = await createApp({
  host,
  token: process.env.PARCELHUB_AUTH_TOKEN,
  directory: resolve(root, process.env.DATA_DIR ?? 'data'),
  webRoot: resolve(root, 'apps/web/dist'),
});
await app.listen({ host, port: Number(process.env.PORT ?? 3001) });
console.log(`ParcelHub is running at http://${host}:${process.env.PORT ?? 3001}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
