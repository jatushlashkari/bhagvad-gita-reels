import { getBackend } from '../../../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../../../lib/assert-local-origin.ts';
import { ITEM_ID } from '../../../../../../shared/schedule.ts';

// deleteItem throws exactly three shapes, and each is a different answer: an unknown id is a 404,
// a row that has already published something is a 409 the UI shows as "can't delete", and a
// publisher run holding the render lock is a 409 the UI shows as "try again in a minute".
function statusFor(e: unknown): number {
  if (!(e instanceof Error)) return 400;
  if (/no calendar item/.test(e.message)) return 404;
  if (/has published posts|publisher running/.test(e.message)) return 409;
  return 400;
}

/** Re-render: a fresh video, release asset and thumbnail for an existing row, keeping its id and
 *  every hand-edited post (pipeline/publisher.ts re-reads the calendar after the render, so a
 *  caption edited meanwhile survives). Streams the log like every other render. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  const id = decodeURIComponent((await params).id);
  if (!ITEM_ID.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  // One named action rather than a bare POST: this endpoint will grow siblings, and a typo'd
  // action must be a 400 rather than silently re-rendering.
  if ((body as { action?: unknown } | null)?.action !== 'rerender') {
    return Response.json({ error: "action must be 'rerender'" }, { status: 400 });
  }
  try {
    const stream = getBackend().calendarCommand(['--rerender', id]);
    if (stream === 'locked') return Response.json({ error: 'render already in progress' }, { status: 409 });
    return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  const id = decodeURIComponent((await params).id);
  if (!ITEM_ID.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });
  try {
    await getBackend().deleteItem(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'delete failed' }, { status: statusFor(e) });
  }
}
