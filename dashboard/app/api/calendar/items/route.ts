import { getBackend } from '../../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../../lib/assert-local-origin.ts';
import { REF_PATTERN } from '../../../../../shared/custom-quotes.ts';

// The same YYYY-MM-DD shape pipeline/publisher.ts's --date accepts. A local calendar day, not an
// instant: the publisher turns it into per-platform times using config.schedule's timezone.
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Adds one row: renders the reel, archives it, thumbnails it and prefills its captions — minutes
 *  of work, so the publisher's log is streamed back rather than awaited. `EXIT 0` means the CLI
 *  finished; the caller re-fetches /api/calendar to see the row it made. */
export async function POST(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { ref, date, format: rawFormat, fromLastRender } = (body ?? {}) as {
    ref?: unknown;
    date?: unknown;
    format?: unknown;
    fromLastRender?: unknown;
  };
  // '' (the UI's Auto option) means "no override" — config.json's format decides, same as the
  // generate route's handling of an empty background/format.
  const format = rawFormat || undefined;
  if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) return Response.json({ error: 'invalid ref' }, { status: 400 });
  if (typeof date !== 'string' || !YMD.test(date)) return Response.json({ error: 'invalid date' }, { status: 400 });
  if (format !== undefined && format !== 'classic' && format !== 'cinema') {
    return Response.json({ error: 'invalid format' }, { status: 400 });
  }
  if (fromLastRender !== undefined && typeof fromLastRender !== 'boolean') {
    return Response.json({ error: 'invalid fromLastRender' }, { status: 400 });
  }
  try {
    const stream = getBackend().calendarCommand([
      '--add',
      ref,
      '--date',
      date,
      ...(format ? ['--format', format] : []),
      // Reuses out/props.json when it is already this ref's render — what Studio's "Add to
      // calendar" uses after a preview render, turning minutes into seconds.
      ...(fromLastRender ? ['--from-last-render'] : []),
    ]);
    if (stream === 'locked') return Response.json({ error: 'render already in progress' }, { status: 409 });
    return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
}
