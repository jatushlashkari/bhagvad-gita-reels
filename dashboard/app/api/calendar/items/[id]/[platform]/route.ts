import { getBackend, type PostPatch } from '../../../../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../../../../lib/assert-local-origin.ts';
import { ITEM_ID, PLATFORMS, type Platform } from '../../../../../../../shared/schedule.ts';

// Rule violations from applyPostPatch (bad time, over-long caption, illegal transition, an edit to
// a published post) are all 400s — the request itself was wrong. An unknown row is a 404, and the
// render lock is a 409, since retrying that same request in a minute will work.
function statusFor(e: unknown): number {
  if (!(e instanceof Error)) return 400;
  if (/no calendar item/.test(e.message)) return 404;
  if (/publisher running/.test(e.message)) return 409;
  return 400;
}

/** Edits one platform's post on one row and answers with the whole updated item, so the table can
 *  re-render the row (status badge, times, credits) from one response. Only the four editable
 *  fields are forwarded; the backend validates their values and the status transition. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; platform: string }> }) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  const { id: rawId, platform: rawPlatform } = await params;
  const id = decodeURIComponent(rawId);
  const platform = decodeURIComponent(rawPlatform);
  if (!ITEM_ID.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });
  if (!PLATFORMS.includes(platform as Platform)) return Response.json({ error: 'invalid platform' }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'body must be an object' }, { status: 400 });
  }
  // Picked key by key rather than passed through: a patch is applied onto the stored record, and
  // whatever else the body carried (`status: 'published'`, an `id` from some platform) must not
  // reach it. `in` rather than a truthiness test, because `at: null` and `caption: ''` are both
  // meaningful values the UI sends.
  const b = body as Record<string, unknown>;
  const patch = Object.fromEntries(
    (['at', 'caption', 'title', 'status'] as const).filter((k) => k in b).map((k) => [k, b[k]]),
  ) as PostPatch;
  try {
    return Response.json(await getBackend().updatePost(id, platform as Platform, patch));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'invalid patch' }, { status: statusFor(e) });
  }
}
