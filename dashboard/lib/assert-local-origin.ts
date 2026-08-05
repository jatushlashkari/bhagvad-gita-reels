// Dev-only CSRF guard for the dashboard's mutating routes (upload/generate/sync). The dashboard
// has no auth of its own — by design it's reached from localhost or a phone on the same LAN (see
// README's "Dashboard" section) — so the only thing standing between it and some other page in
// the same browser silently POSTing to it is this check. Browsers attach an `Origin` header to
// cross-origin state-changing requests (fetch/XHR/form POST) but never let script fake it, so
// "Origin present and not local" reliably identifies a cross-origin request without needing any
// session/token machinery. Requests with no Origin header (curl, other server-side tooling, and
// same-origin requests in most browsers) pass through untouched.

const PRIVATE_LAN_HOST =
  /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;

/** Pure host check, factored out of assertLocalOrigin so it's exercisable without constructing a
 *  Request. `host` is a bare hostname — no scheme, port, or path — which callers get for free
 *  from `new URL(origin).hostname` (that also normalizes case and strips IPv6 brackets). */
export function isAllowedOriginHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || PRIVATE_LAN_HOST.test(h);
}

/** Call first in every mutating route handler. Returns a 403 Response when `req` carries an
 *  `Origin` header naming a host that isn't localhost/LAN — meaning some other origin loaded in
 *  the same browser is driving this request — so the caller can `return` it as-is. Returns null
 *  ("proceed") when the header is absent or names an allowed host. */
export function assertLocalOrigin(req: Request): Response | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    // Unparseable Origin (e.g. the literal "null" some sandboxed/opaque contexts send): fail
    // closed rather than let a value that isn't recognizably local slip through.
    return Response.json({ error: 'cross-origin request rejected' }, { status: 403 });
  }
  if (isAllowedOriginHost(host)) return null;
  return Response.json({ error: 'cross-origin request rejected' }, { status: 403 });
}
