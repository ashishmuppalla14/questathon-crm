import { RequestQueue } from './queue.js';
import { Store } from './store.js';
import type { CachedCall } from './store.js';

import { callTool } from './mcp.js';
import type { McpConfig } from './mcp.js';

export interface SyncStatus {
  running: boolean;
  step: string | null;
  completed: string[];
  errors: {
    step: string;
    message: string;
  }[];
  startedAt?: string;
  finishedAt?: string;
  lastSuccessAt?: string;
}

export function extractAccountIds(
  data: any
): { id: string; name?: string }[] {
  const list: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.accounts)
      ? data.accounts
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return list
    .map((account: any) => {
      if (typeof account === 'string') {
        return { id: account };
      }

      return {
        id: String(
          account?.id ??
          account?.account ??
          account?.slug ??
          ''
        ),
        name: account?.name ?? account?.title
      };
    })
    .filter((account) => account.id.length > 0);
}

export class SyncService {
  status: SyncStatus = {
    running: false,
    step: null,
    completed: [],
    errors: []
  };

  constructor(
    private store: Store,
    private queue: RequestQueue,
    private cfg: McpConfig,
    private fetchImpl: typeof fetch = fetch
  ) {
    const savedStatus =
      this.store.read<SyncStatus>('sync-status');

    if (savedStatus) {
      this.status = {
        ...savedStatus,
        running: false,
        step: null
      };
    }
  }

  cached(key: string) {
    return this.store.read<CachedCall>(`call-${key}`);
  }

  keyOf(
    tool: string,
    args: Record<string, unknown>
  ): string {
    const values = Object.values(args);

    return tool + (
      values.length > 0
        ? ':' + values.join(':')
        : ''
    );
  }

  async fetchTool(
    tool: string,
    args: Record<string, unknown> = {},
    force = false
  ): Promise<any> {
    const key = this.keyOf(tool, args);

    const cachedResult = this.cached(key);

    if (cachedResult && !force) {
      return cachedResult.data;
    }

    const data = await this.queue.enqueue(
      { key },
      () => callTool(
        this.cfg,
        tool,
        args,
        this.fetchImpl
      )
    );

    const cachedCall: CachedCall = {
      key,
      tool,
      args,
      fetchedAt: new Date().toISOString(),
      data
    };

    this.store.write(`call-${key}`, cachedCall);

    return data;
  }

  async run(
    opts: {
      force?: boolean;
      only?: 'signals';
    } = {}
  ): Promise<SyncStatus> {
    if (this.status.running) {
      return this.status;
    }

    const force = Boolean(opts.force);

    this.status = {
      running: true,
      step: null,
      completed: [],
      errors: [],
      startedAt: new Date().toISOString(),
      lastSuccessAt: this.status.lastSuccessAt
    };

    const save = (): void => {
      this.store.write('sync-status', this.status);
    };

    const step = async (
      name: string,
      tool: string,
      args: Record<string, unknown> = {},
      forceThis = force
    ): Promise<any> => {
      this.status.step = name;
      save();

      try {
        const result = await this.fetchTool(
          tool,
          args,
          forceThis
        );

        this.status.completed.push(name);

        return result;
      } catch (error) {
        this.status.errors.push({
          step: name,
          message:
            error instanceof Error
              ? error.message
              : String(error)
        });

        return undefined;
      } finally {
        save();
      }
    };

    try {
      if (opts.only === 'signals') {
        await step(
          'get_signals',
          'get_signals',
          {},
          true
        );
      } else {
        await step('whoami', 'whoami');

        const accounts = await step(
          'get_my_accounts',
          'get_my_accounts'
        );

        await step(
          'get_data_format',
          'get_data_format'
        );

        const accountIds = extractAccountIds(accounts);

        for (const account of accountIds.slice(0, 2)) {
          await step(
            `get_all_paperwork:${account.id}`,
            'get_all_paperwork',
            { account: account.id }
          );
        }

        // Correct MCP tool name
        await step(
          'get_flytbase_team',
          'get_flytbase_team'
        );

        await step(
          'get_feature_requests',
          'get_feature_requests'
        );

        await step(
          'get_release_notes',
          'get_release_notes'
        );

        await step(
          'get_signals',
          'get_signals',
          {},
          true
        );
      }

      if (this.status.errors.length === 0) {
        this.status.lastSuccessAt =
          new Date().toISOString();
      }
    } finally {
      this.status.running = false;
      this.status.step = null;
      this.status.finishedAt =
        new Date().toISOString();

      save();
    }

    return this.status;
  }
}