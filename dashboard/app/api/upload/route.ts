import { getBackend, InvalidImageError } from '../../../lib/backend.ts';

export async function POST(req: Request) {
  const form = await req.formData();
  const f = form.get('file');
  if (!(f instanceof File)) return Response.json({ error: 'no file' }, { status: 400 });
  if (!/\.(jpe?g|png|webp)$/i.test(f.name)) return Response.json({ error: 'jpg/png/webp only' }, { status: 400 });
  if (f.size > 15 * 1024 * 1024) return Response.json({ error: 'max 15 MB' }, { status: 400 });
  try {
    const saved = await getBackend().saveImage(f.name, Buffer.from(await f.arrayBuffer()));
    return Response.json(saved);
  } catch (e) {
    if (e instanceof InvalidImageError) return Response.json({ error: 'not a valid image' }, { status: 400 });
    throw e;
  }
}
