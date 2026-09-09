import { getBackend } from '../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../lib/assert-local-origin.ts';

export async function GET() {
  return Response.json(await getBackend().getStyle());
}

// validateStyle never throws (junk fields are clamped/defaulted, per shared/reel-style.ts), so
// the only failure mode here is a body that isn't parseable JSON at all.
export async function POST(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  return Response.json(await getBackend().saveStyle(body));
}
