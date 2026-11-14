import { describe, it, expect } from 'vitest';
import { parseMcpBody, unwrapToolResult, callTool, McpError } from '../src/mcp.js';

describe('mcp client', () => {
  it('parses JSON and SSE bodies and unwraps text content', () => {
    const rpc = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"a":1}' }] } };
    expect(unwrapToolResult(parseMcpBody(JSON.stringify(rpc)))).toEqual({ a: 1 });
    expect(unwrapToolResult(parseMcpBody(`event: message\ndata: ${JSON.stringify(rpc)}\n\n`, 'text/event-stream'))).toEqual({ a: 1 });
  });
  it('throws on rpc error and tool error', () => {
    expect(() => unwrapToolResult({ error: { code: -1, message: 'bad' } })).toThrow(McpError);
    expect(() => unwrapToolResult({ result: { isError: true, content: [] } })).toThrow(McpError);
  });
  it('refuses to call without token, treats 429 as recoverable, redacts token in errors', async () => {
    await expect(callTool({ url: 'http://x', token: '', authHeader: 'Authorization', authScheme: 'Bearer' }, 'whoami')).rejects.toThrow('AQ_TOKEN');
    const cfg = { url: 'http://x', token: 'SECRET123', authHeader: 'Authorization', authScheme: 'Bearer' };
    const f429 = (async () => new Response('slow down', { status: 429 })) as typeof fetch;
    await expect(callTool(cfg, 'whoami', {}, f429)).rejects.toMatchObject({ recoverable: true });
    const f400 = (async () => new Response('bad SECRET123', { status: 400 })) as typeof fetch;
    await expect(callTool(cfg, 'whoami', {}, f400)).rejects.toThrow(/\*\*\*/);
  });
});
