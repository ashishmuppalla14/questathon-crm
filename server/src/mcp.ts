/**
 * MCP-over-HTTP client (JSON-RPC 2.0, "tools/call").
 * PROTOCOL NOTE: this follows the standard MCP streamable-HTTP shape. The Questathon CONNECT page
 * is the source of truth - if it differs (header name, initialize handshake), change ONLY this file.
 * The token is read from env on the server and never leaves it.
 */
export interface McpConfig { url: string; token: string; authHeader: string; authScheme: string }

export class McpError extends Error {
  constructor(msg: string, public recoverable: boolean, public status?: number) { super(msg); }
}

export function parseMcpBody(text: string, contentType = ''): any {
  if (contentType.includes('text/event-stream') || text.trimStart().startsWith('event:') || text.trimStart().startsWith('data:')) {
    const datas = text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
    for (const d of datas.reverse()) { try { const j = JSON.parse(d); if (j.result || j.error) return j; } catch { /* next */ } }
    throw new McpError('No JSON-RPC message found in event stream', true);
  }
  try { return JSON.parse(text); } catch { throw new McpError('Response was not JSON', true); }
}

export function unwrapToolResult(rpc: any): unknown {
  if (rpc.error) throw new McpError(`MCP error ${rpc.error.code ?? ''}: ${rpc.error.message ?? 'unknown'}`, false);
  const result = rpc.result;
  if (result?.isError) throw new McpError(`Tool error: ${JSON.stringify(result.content).slice(0, 300)}`, false);
  const text = result?.content?.find?.((c: any) => c.type === 'text')?.text;
  if (typeof text === 'string') { try { return JSON.parse(text); } catch { return text; } }
  return result?.structuredContent ?? result;
}

let rpcId = 1;
export async function callTool(cfg: McpConfig, tool: string, args: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  if (!cfg.token) throw new McpError('AQ_TOKEN is not set on the server', false);
  let res: Response;
  try {
    res = await fetchImpl(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        [cfg.authHeader]: cfg.authScheme ? `${cfg.authScheme} ${cfg.token}` : cfg.token,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name: tool, arguments: args } }),
    });
  } catch (e) { throw new McpError(`Network error: ${(e as Error).message}`, true); }
  const text = await res.text();
  if (res.status === 429 || res.status >= 500) throw new McpError(`HTTP ${res.status} (rate limited or server error)`, true, res.status);
  if (!res.ok) throw new McpError(`HTTP ${res.status}: ${text.slice(0, 200).replaceAll(cfg.token, '***')}`, false, res.status);
  return unwrapToolResult(parseMcpBody(text, res.headers.get('content-type') ?? ''));
}
