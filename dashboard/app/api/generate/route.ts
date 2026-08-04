import { generateStream } from '../../../lib/local-backend.ts';

export async function POST(req: Request) {
  const { ref, background } = await req.json();
  const stream = generateStream(ref, background || undefined);
  if (stream === 'locked') return Response.json({ error: 'render already in progress' }, { status: 409 });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
