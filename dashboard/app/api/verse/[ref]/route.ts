import { getBackend } from '../../../../lib/backend.ts';

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const verse = await getBackend().getVerse(decodeURIComponent(ref));
  if (!verse) return new Response('not found', { status: 404 });
  return Response.json(verse);
}
