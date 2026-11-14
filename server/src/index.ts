import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app.js';
import { Store } from './store.js';
import { RequestQueue } from './queue.js';

const store = new Store(path.resolve(process.env.DATA_DIR ?? './data'));
const minInterval = Math.max(Number(process.env.MIN_INTERVAL_SECONDS ?? 65), 65) * 1000;
const queue = new RequestQueue({ store, minIntervalMs: minInterval });
const { app, sync } = createApp({
  store, queue,
  cfg: { url: process.env.MCP_URL ?? 'https://questathon.aihackerscollective.com/api/public/mcp', token: process.env.AQ_TOKEN ?? '', authHeader: process.env.MCP_AUTH_HEADER ?? 'Authorization', authScheme: process.env.MCP_AUTH_SCHEME ?? 'Bearer' },
  adminKey: process.env.ADMIN_KEY, origins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  refreshSeconds: Number(process.env.REFRESH_SECONDS ?? 0) || undefined,
});
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`CRM API listening on :${port} (MCP token ${process.env.AQ_TOKEN ? 'present' : 'MISSING'})`);
  if (process.env.AUTO_SYNC_ON_BOOT === '1' && !sync.cached('get_my_accounts')) void sync.run();
  const every = Number(process.env.REFRESH_SECONDS ?? 0);
  if (every >= 65) setInterval(() => void sync.run({ only: 'signals' }), every * 1000); // signals only, floor 65s
});
