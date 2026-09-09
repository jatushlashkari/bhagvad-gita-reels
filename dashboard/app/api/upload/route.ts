import { getBackend, InvalidAudioError, InvalidImageError } from '../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../lib/assert-local-origin.ts';

export async function POST(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  const form = await req.formData();
  const f = form.get('file');
  if (!(f instanceof File)) return Response.json({ error: 'no file' }, { status: 400 });

  if (/\.mp3$/i.test(f.name)) {
    if (f.size > 20 * 1024 * 1024) return Response.json({ error: 'max 20 MB' }, { status: 400 });
    try {
      const saved = await getBackend().saveAudio(f.name, Buffer.from(await f.arrayBuffer()));
      return Response.json(saved);
    } catch (e) {
      if (e instanceof InvalidAudioError) return Response.json({ error: e.message }, { status: 400 });
      throw e;
    }
  }

  if (!/\.(jpe?g|png|webp)$/i.test(f.name)) return Response.json({ error: 'jpg/png/webp/mp3 only' }, { status: 400 });
  if (f.size > 15 * 1024 * 1024) return Response.json({ error: 'max 15 MB' }, { status: 400 });
  try {
    const saved = await getBackend().saveImage(f.name, Buffer.from(await f.arrayBuffer()));
    return Response.json(saved);
  } catch (e) {
    if (e instanceof InvalidImageError) return Response.json({ error: 'not a valid image' }, { status: 400 });
    throw e;
  }
}
