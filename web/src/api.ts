import type { CrmState } from './types';
export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';
export interface Meta { hasData: boolean; lastSuccessAt: string | null; oldestFetch: string | null; dataSource: string }
export interface SyncInfo { status: { running: boolean; step: string | null; completed: string[]; errors: { step: string; message: string }[]; lastSuccessAt?: string }; queue: { nextAllowedAt: string | null; intervalSeconds: number; queued: number; executed: number; lastError: string | null }; refreshSeconds: number | null }
export const getAdminKey = () => sessionStorage.getItem('adminKey') ?? '';
export const setAdminKey = (k: string) => sessionStorage.setItem('adminKey', k);
async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey(), ...(init?.headers ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as any).error ?? `HTTP ${r.status}`);
  return body as T;
}
export const api = {
  state: () => j<{ state: CrmState; meta: Meta }>('/api/state'),
  sync: () => j<SyncInfo>('/api/sync/status'),
  startSync: (body: object) => j('/api/sync', { method: 'POST', body: JSON.stringify(body) }),
  preview: (b: object) => j<{ preview: { tool: string; args: Record<string, unknown> }; consumesApiCall: boolean; earliestWriteAt: string }>('/api/notes/preview', { method: 'POST', body: JSON.stringify(b) }),
  confirm: (b: object) => j<{ saved: { id: string } }>('/api/notes/confirm', { method: 'POST', body: JSON.stringify({ ...b, confirm: true }) }),
};
