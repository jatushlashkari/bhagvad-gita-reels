import { ConfigValidationError, getBackend } from '../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../lib/assert-local-origin.ts';

export async function GET() {
  try {
    return Response.json(await getBackend().getConfig());
  } catch (e) {
    // A malformed config.json is the source of truth being broken — say so loudly.
    return Response.json({ error: e instanceof Error ? e.message : 'could not read config.json' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    return Response.json(await getBackend().updateConfig(body));
  } catch (e) {
    if (e instanceof ConfigValidationError) return Response.json({ errors: e.errors }, { status: 400 });
    const message = e instanceof Error ? e.message : 'could not save';
    if (/publisher running/.test(message)) return Response.json({ error: 'publisher running' }, { status: 409 });
    return Response.json({ error: message }, { status: 400 });
  }
}
