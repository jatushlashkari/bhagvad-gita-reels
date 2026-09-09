import { getBackend } from '../../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../../lib/assert-local-origin.ts';

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const result = await getBackend().getBeats(decodeURIComponent(ref));
  if (!result) return new Response('not found', { status: 404 });
  return Response.json(result);
}

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  const { ref } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { beats } = (body ?? {}) as { beats?: unknown };
  if (!Array.isArray(beats) || !beats.every((b) => typeof b === 'string')) {
    return Response.json({ error: 'beats must be an array of strings' }, { status: 400 });
  }
  try {
    await getBackend().saveBeats(decodeURIComponent(ref), beats);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'invalid beats' }, { status: 400 });
  }
}
