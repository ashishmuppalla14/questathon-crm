import fs from 'node:fs';
import path from 'node:path';

/** Tiny JSON file store. Writes are atomic (tmp + rename). */
export class Store {
  constructor(public dir: string) { fs.mkdirSync(dir, { recursive: true }); }
  private p(name: string) { return path.join(this.dir, `${name.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`); }
  read<T>(name: string): T | null {
    try { return JSON.parse(fs.readFileSync(this.p(name), 'utf8')) as T; } catch { return null; }
  }
  write(name: string, value: unknown) {
    const tmp = this.p(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, this.p(name));
  }
  has(name: string) { return fs.existsSync(this.p(name)); }
}

export interface CachedCall { key: string; tool: string; args: Record<string, unknown>; fetchedAt: string; data: unknown }
