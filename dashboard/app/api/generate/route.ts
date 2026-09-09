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

type GenerateOverrides = { beats?: string[]; style?: unknown; music?: string | null };

// Light shape check only: an array of at most 6 strings for beats, a string-or-null for music, a
// plain object for style. Per-beat length/emoji rules and music-pool membership are pipeline/
// run.ts's job (resolveCinemaInputs) — see local-backend.ts's isValidOverridesShape, which
// enforces the same shape again as the backend's own defense-in-depth copy.
function isValidOverrides(overrides: unknown): overrides is GenerateOverrides | undefined {
  if (overrides === undefined) return true;
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) return false;
  const o = overrides as Record<string, unknown>;
  if ('beats' in o && o.beats !== undefined) {
    if (!Array.isArray(o.beats) || o.beats.length > 6 || !o.beats.every((b) => typeof b === 'string')) return false;
  }
  if ('music' in o && o.music !== undefined && o.music !== null && typeof o.music !== 'string') return false;
  if ('style' in o && o.style !== undefined) {
    if (typeof o.style !== 'object' || o.style === null || Array.isArray(o.style)) return false;
  }
  return true;
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
  const { ref, background: rawBackground, format: rawFormat, overrides } = (body ?? {}) as {
    ref?: unknown;
    background?: unknown;
    format?: unknown;
    overrides?: unknown;
  };
  // '' (the UI's Auto option) means "no override", same as omitting the field entirely — only a
  // truthy value needs to pass the filename/format check.
  const background = rawBackground || undefined;
  const format = rawFormat || undefined;
  if (!isValidBackground(background)) return Response.json({ error: 'invalid background' }, { status: 400 });
  if (!isValidFormat(format)) return Response.json({ error: 'invalid format' }, { status: 400 });
  if (!isValidOverrides(overrides)) return Response.json({ error: 'invalid overrides' }, { status: 400 });
  try {
    const stream = getBackend().generate(ref as string, background, format, overrides);
    if (stream === 'locked') return Response.json({ error: 'render already in progress' }, { status: 409 });
    return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
}
