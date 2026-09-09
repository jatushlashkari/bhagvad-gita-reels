import { getBackend } from '../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../lib/assert-local-origin.ts';

// Same shape the backend enforces (see local-backend.ts's isValidBackgroundName) — checked here
// too so a bad value gets a precise 400 before ever reaching the backend/lock, matching the
// existing double-check pattern used for media paths (route checks first, backend re-checks).
function isValidBackground(background: unknown): background is string | undefined {
  return (
    background === undefined ||
    (typeof background === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(background) && !background.startsWith('-'))
  );
}

// Same shape the backend enforces (see local-backend.ts's generateStream) — checked here too so a
// bad value gets a precise 400 before ever reaching the backend/lock, matching the background
// validation above.
function isValidFormat(format: unknown): format is 'classic' | 'cinema' | undefined {
  return format === undefined || format === 'classic' || format === 'cinema';
}

export async function POST(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { ref, background: rawBackground, format: rawFormat } = (body ?? {}) as {
    ref?: unknown;
    background?: unknown;
    format?: unknown;
  };
  // '' (the UI's Auto option) means "no override", same as omitting the field entirely — only a
  // truthy value needs to pass the filename/format check.
  const background = rawBackground || undefined;
  const format = rawFormat || undefined;
  if (!isValidBackground(background)) return Response.json({ error: 'invalid background' }, { status: 400 });
  if (!isValidFormat(format)) return Response.json({ error: 'invalid format' }, { status: 400 });
  try {
    const stream = getBackend().generate(ref as string, background, format);
    if (stream === 'locked') return Response.json({ error: 'render already in progress' }, { status: 409 });
    return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
}
