import { isAllowedMediaPath } from '../../../../../shared/media-path.ts';
import { getBackend } from '../../../../lib/backend.ts';

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join('/');
  if (!isAllowedMediaPath(rel)) return new Response('forbidden', { status: 403 });
  const media = getBackend().openMedia(rel);
  if (!media) return new Response('not found', { status: 404 });
  const range = req.headers.get('range')?.match(/bytes=(\d+)-(\d*)/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : media.size - 1;
    return new Response(media.stream(start, end), {
      status: 206,
      headers: {
        'content-type': media.type,
        'content-range': `bytes ${start}-${end}/${media.size}`,
        'accept-ranges': 'bytes',
        'content-length': String(end - start + 1),
      },
    });
  }
  return new Response(media.stream(), {
    headers: { 'content-type': media.type, 'content-length': String(media.size), 'accept-ranges': 'bytes' },
  });
}
