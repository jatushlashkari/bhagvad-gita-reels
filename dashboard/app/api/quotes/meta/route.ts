import { getBackend } from '../../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../../lib/assert-local-origin.ts';
import { REF_PATTERN } from '../../../../../shared/custom-quotes.ts';

export async function POST(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { ref, favorite } = (body ?? {}) as { ref?: unknown; favorite?: unknown };
  if (typeof ref !== 'string' || !REF_PATTERN.test(ref) || typeof favorite !== 'boolean') {
    return Response.json({ error: 'ref must be a known ref and favorite a boolean' }, { status: 400 });
  }
  try {
    await getBackend().setFavorite(ref, favorite);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'invalid ref' }, { status: 400 });
  }
}
