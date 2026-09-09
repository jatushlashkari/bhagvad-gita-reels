'use client';
import { useCallback, useEffect, useState } from 'react';

type Asset = { file: string; rel: string; kind: 'clip' | 'image' | 'music'; license: string };

export function Library() {
  const [assets, setAssets] = useState<Asset[]>([]);

  // /api/assets also carries the mp3 pool (the Studio's music picker needs it); this panel is the
  // *background* library, so music is dropped at the door rather than tiled as a broken <video>.
  const load = useCallback(() => {
    fetch('/api/assets')
      .then((r) => r.json())
      .then((all: Asset[]) => setAssets(all.filter((a) => a.kind !== 'music')))
      .catch(() => {});
  }, []);

  // UploadZone fires 'assets-changed' after each successful upload — no shared store needed
  // for two sibling panels that never otherwise talk to each other.
  useEffect(() => {
    load();
    window.addEventListener('assets-changed', load);
    return () => window.removeEventListener('assets-changed', load);
  }, [load]);

  const clips = assets.filter((a) => a.kind === 'clip').length;
  const images = assets.length - clips;

  return (
    <section className="rounded-xl bg-[#161028] p-4 ring-1 ring-white/5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#a89f8d]">Background library</h2>
        <p className="text-xs text-[#a89f8d]">
          {clips} clip{clips === 1 ? '' : 's'} · {images} image{images === 1 ? '' : 's'}
        </p>
      </div>

      {assets.length === 0 ? (
        <p className="mt-4 text-sm text-[#a89f8d]">No backgrounds yet — upload an image above.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {assets.map((a) => (
            <li key={a.rel}>
              <figure>
                <div className="relative">
                  {a.kind === 'image' ? (
                    // plain <img>, not next/image: these live in the repo's public/assets, outside
                    // dashboard/public, so they're only reachable through the /api/media route.
                    <img
                      src={`/api/media/public/${a.rel}`}
                      alt={a.file}
                      loading="lazy"
                      className="aspect-[9/16] w-full rounded-lg object-cover ring-1 ring-white/5"
                    />
                  ) : (
                    <video
                      src={`/api/media/public/${a.rel}`}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                      className="aspect-[9/16] w-full rounded-lg object-cover ring-1 ring-white/5"
                    />
                  )}
                  {a.kind === 'clip' && (
                    <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-[#0d0817]/80 px-1 text-[9px] text-[#e8c874]">
                      ▶
                    </span>
                  )}
                </div>
                <figcaption className="mt-1 text-[10px] text-[#a89f8d]">
                  <span className="block truncate text-[#f5efe0]" title={a.file}>
                    {a.file}
                  </span>
                  <span className="block truncate" title={a.license}>
                    {a.license}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
