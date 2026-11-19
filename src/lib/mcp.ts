import { chatScopeParams, type AIConfig } from './ai';
import { camelizeKeys } from '../util/camelize';
import type { McpConnectOptions, McpConnection } from './types';

const messages = {
  not_found: 'This connection request is unknown, expired, or already used. Start connecting again.',
  feature_not_enabled: 'MCP connections are not enabled for this account.',
  verified_ai_access_required: 'MCP connections require a server-only key with verified AI access.',
  viewer_not_found: 'The member must exist as a Bold viewer first. Create or sync them using bold.viewers.',
  invalid_access: 'The collection access grants are invalid.',
  collection_not_found: 'An access collection was not found on this account.',
  invalid_continue_url: 'Bold returned an invalid MCP continuation URL.',
  api_error: 'The Bold MCP request failed.',
  handler_error: 'Unable to check this member’s MCP access. Please try again later.',
  missing_signing_secret: 'MCP connect requires signingSecret. Copy the connect signing secret from Bold.',
} as const;

/** Fixed messages only: upstream bodies and transport errors may contain credentials. */
export class McpAPIError extends Error {
  constructor(readonly status: number, readonly code: keyof typeof messages = 'api_error') {
    super(messages[code]);
    this.name = 'McpAPIError';
  }
}

function serverOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error('bold.mcp is server-only. Never expose the API key or signing secret to a browser.');
  }
}

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function plain(status: number, message: string): Response {
  return noStore(new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
}

function redirect(location: string): Response {
  return noStore(new Response(null, { status: 302, headers: { Location: location } }));
}

async function callCallback<Arg, Result>(callback: (arg: Arg) => Result | Promise<Result>, arg: Arg): Promise<Result> {
  try {
    return await callback(arg);
  } catch {
    throw new McpAPIError(500, 'handler_error');
  }
}

async function verifiedBody(req: Request, secret: string): Promise<ArrayBuffer | null> {
  const header = req.headers.get('Bold-Signature') ?? '';
  const match = /^t=([0-9]+),v1=([0-9a-f]{64})$/.exec(header);
  if (!match || match[0] !== header) return null;
  const timestamp = match[1]!;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return null;

  const raw = await req.arrayBuffer();
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + raw.byteLength);
  message.set(prefix);
  message.set(new Uint8Array(raw), prefix.length);
  const signature = Uint8Array.from(match[2]!.match(/../g)!, byte => parseInt(byte, 16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  // Web Crypto performs the MAC comparison; never compare digest strings in JS.
  return await crypto.subtle.verify('HMAC', key, signature, message) ? raw : null;
}

export function createMcp(config: AIConfig) {
  async function request<T>(path: string, method: 'GET' | 'PUT' | 'DELETE', body?: Record<string, unknown>): Promise<T> {
    serverOnly();
    try {
      const base = config.baseURL.endsWith('/') ? config.baseURL : `${config.baseURL}/`;
      const response = await fetch(new URL(path, base), {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...config.headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const code = data?.code ?? data?.error;
        // Only known API codes survive the trust boundary, never arbitrary server text.
        const known = ['not_found', 'feature_not_enabled', 'verified_ai_access_required',
          'viewer_not_found', 'invalid_access', 'collection_not_found'] as const;
        throw new McpAPIError(response.status, known.find(value => value === code));
      }
      if (response.status === 204) return undefined as T;
      return camelizeKeys(await response.json()) as T;
    } catch (error) {
      if (error instanceof McpAPIError) throw new McpAPIError(error.status, error.code);
      throw new McpAPIError(502);
    }
  }

  function connect(options: McpConnectOptions) {
    serverOnly();
    const { signingSecret } = options;
    const environment = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
    if (!signingSecret && environment === 'development') throw new McpAPIError(503, 'missing_signing_secret');
    let mcpHost: string;
    try {
      const mcp = new URL(options.mcpUrl ?? 'https://mcp.boldvideo.io');
      if (mcp.protocol !== 'https:' || mcp.username || mcp.password) throw new Error();
      mcpHost = mcp.host;
    } catch {
      throw new Error('mcpUrl must be an absolute HTTPS URL without credentials.');
    }

    async function GET(req: Request): Promise<Response> {
      if (!signingSecret) return plain(503, messages.missing_signing_secret);
      try {
        const url = new URL(req.url);
        const id = url.searchParams.get('request');
        if (!id || id.length > 512 || id === '.' || id === '..' || url.searchParams.getAll('request').length !== 1) {
          return plain(400, 'A valid connection request is required.');
        }
        const memberId = await callCallback(options.viewer, req);
        if (!memberId) {
          if (typeof options.signIn === 'function') return noStore(await callCallback(options.signIn, req));
          // Never let a network-path reference become a login return URL.
          const path = decodeURIComponent(url.pathname);
          if (/^\/[\\/]/.test(path) || /[\u0000-\u001f\u007f]/.test(path) || /%[0-9a-f]{2}/i.test(path)) {
            return plain(400, 'Invalid connection return path.');
          }
          const login = new URL(options.signIn, url.origin);
          if (!['http:', 'https:'].includes(login.protocol) || login.username || login.password) {
            throw new McpAPIError(500, 'handler_error');
          }
          login.searchParams.set('return_to', url.pathname + url.search);
          // A relative signIn stays relative: behind a proxy req.url can carry an internal origin.
          const relative = /^\/(?![\\/])/.test(options.signIn);
          return redirect(relative ? login.pathname + login.search + login.hash : login.href);
        }
        const access = await callCallback(options.access, memberId);
        if (access == null) {
          return options.denied ? noStore(await callCallback(options.denied, req)) : plain(403, 'This member may not connect to Bold.');
        }
        const result = await request<{ continueUrl: string }>(`mcp/connections/${encodeURIComponent(id)}`, 'PUT', {
          viewer: memberId, ...chatScopeParams({ access }),
        });
        let next: URL;
        try {
          next = new URL(result.continueUrl);
          if (next.protocol !== 'https:' || next.host !== mcpHost || next.username || next.password) throw new Error();
        } catch {
          throw new McpAPIError(502, 'invalid_continue_url');
        }
        return redirect(next.href);
      } catch (error) {
        const safe = error instanceof McpAPIError ? new McpAPIError(error.status, error.code) : new McpAPIError(500, 'handler_error');
        const status = safe.code === 'handler_error' ? 500 : safe.status >= 400 && safe.status < 500 ? safe.status : 502;
        const fallback = plain(status, safe.message);
        try {
          const custom = await options.onError?.(safe, req);
          if (custom) return noStore(custom);
        } catch { /* Keep the fixed fallback if the error page itself fails. */ }
        return fallback;
      }
    }

    async function POST(req: Request): Promise<Response> {
      if (!signingSecret) return plain(503, messages.missing_signing_secret);
      try {
        const raw = await verifiedBody(req, signingSecret);
        if (raw === null) return plain(401, 'Invalid Bold signature.');
        let data;
        try {
          data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        } catch {
          return plain(400, 'Invalid MCP access check body.');
        }
        if (!data || typeof data.viewer_id !== 'string' || !data.viewer_id ||
          (data.external_id != null && typeof data.external_id !== 'string')) {
          return plain(400, 'Invalid MCP access check body.');
        }
        const context = { viewerId: data.viewer_id, externalId: data.external_id ?? null };
        const access = await options.access(context.externalId ?? context.viewerId, context);
        if (access == null) return plain(404, 'This member may no longer use Bold MCP.');
        return noStore(Response.json(chatScopeParams({ access })));
      } catch {
        // Temporary lookup failures must never revoke a member's connection.
        return plain(500, messages.handler_error);
      }
    }

    return { GET, POST };
  }

  function viewerQuery(memberId: string): string {
    if (!memberId) throw new Error('Member ID is required');
    return `mcp/connections?${new URLSearchParams({ viewer: memberId })}`;
  }

  return {
    connect,
    connections: {
      async list(memberId: string): Promise<McpConnection[]> {
        return (await request<{ data: McpConnection[] }>(viewerQuery(memberId), 'GET')).data;
      },
      async revoke(memberId: string): Promise<void> {
        await request<void>(viewerQuery(memberId), 'DELETE');
      },
    },
  };
}
