import { getBackend } from '../../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../../lib/assert-local-origin.ts';
import { ITEM_ID, PLATFORMS, type Platform } from '../../../../../shared/schedule.ts';

/** "Publish now" for one platform of one row: ignores the scheduled time and hands the job to the
 *  same CLI the hourly workflow runs. `EXIT 0` only means the publisher finished — whether the
 *  post went out, failed or was skipped is in the log's `✔ / ✖ / ↷ skipped` line, and the row's
 *  own status after a re-fetch of /api/calendar is the record. */
export async function POST(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { id, platform } = (body ?? {}) as { id?: unknown; platform?: unknown };
  if (typeof id !== 'string' || !ITEM_ID.test(id)) return Response.json({ error: 'invalid id' }, { status: 400 });
  if (typeof platform !== 'string' || !PLATFORMS.includes(platform as Platform)) {
    return Response.json({ error: 'invalid platform' }, { status: 400 });
  }

  let calendar;
  try {
    calendar = await getBackend().getCalendar();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'calendar unreadable' }, { status: 500 });
  }
  // Both checks are answered here rather than by the child, so a request that cannot possibly
  // publish never takes the render lock or spawns a process. Existence first: whether the row
  // exists is a fact about the request, while missing secrets are a fact about this machine, and
  // a bogus id deserves to hear about itself either way.
  if (!calendar.items.some((i) => i.id === id)) return Response.json({ error: `no calendar item ${id}` }, { status: 404 });
  // Without local credentials the child would run for a few seconds only to log
  // "↷ skipped … missing secrets" — a 400 that names the platform says the same thing at once,
  // and is what the UI's disabled "Publish now" button explains in its tooltip.
  if (!calendar.secrets[platform as Platform]) {
    return Response.json({ error: `no local secrets for ${platform} — it publishes from the cloud at its scheduled time` }, { status: 400 });
  }

  try {
    const stream = getBackend().calendarCommand(['--publish-item', id, '--platform', platform]);
    if (stream === 'locked') return Response.json({ error: 'render already in progress' }, { status: 409 });
    return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
}
