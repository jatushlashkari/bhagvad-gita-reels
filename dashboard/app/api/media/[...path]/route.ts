import { createReadStream, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { Readable } from 'node:stream';
import { getBackend } from '../../../../lib/backend.ts';

const ALLOWED = ['public/assets/backgrounds/', 'public/assets/images/', 'out/reel.mp4'];
const TYPES: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = normalize((await params).path.join('/'));
  if (!ALLOWED.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)))) return new Response('forbidden', { status: 403 });
  const abs = join(getBackend().repoRoot(), rel);
  let size: number;
  try { size = statSync(abs).size; } catch { return new Response('not found', { status: 404 }); }
  const type = TYPES[rel.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.get('range')?.match(/bytes=(\d+)-(\d*)/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : size - 1;
    return new Response(Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream, {
      status: 206,
      headers: { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream, {
    headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' },
  });
}
