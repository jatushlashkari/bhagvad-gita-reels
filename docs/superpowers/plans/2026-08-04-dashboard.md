# Reels Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local Next.js dashboard (upload custom background images, generate/preview reels, sync images to GitHub) plus pipeline support for image backgrounds with Ken Burns motion.

**Architecture:** `dashboard/` is a self-contained Next.js App Router app (own `package.json`, port 4000) whose API routes call a thin `Backend` interface; today's `local-backend` uses fs/child_process/git with the repo root resolved as `..`. Rendering is never re-implemented: generate shells out to the same `tsx pipeline/run.ts` command CI runs. Pipeline gains a combined clip+image background pool, a `--background` override, and an image branch in the Remotion `Background` component. Spec: `docs/superpowers/specs/2026-08-04-dashboard-design.md`.

**Tech Stack:** Next.js ^16 (App Router, Turbopack), React ^19, Tailwind CSS ^4 (`@tailwindcss/postcss`), sharp ^0.34, existing root toolchain (tsx, vitest, Remotion, execa).

## Global Constraints

- Dashboard binds `-p 4000 -H 0.0.0.0` (phone access on LAN); repo root resolved as `path.resolve(process.cwd(), '..')` and sanity-checked for `sources/gita.json` — fail loudly otherwise.
- One canonical render path: generate spawns `npx tsx pipeline/run.ts --verse <ref> --dry-run [--background <file>]` with `cwd = repo root` and `PATH` extended with `~/.local/bin` (edge-tts lives there).
- Uploaded images: jpg/png/webp in, ≤ 15 MB, stored as 1080×1920 cover-cropped JPEG (quality 82) in `public/assets/images/`, committed to the repo, recorded in `public/assets/manifest.json` under `images` as `{ file, license: "User-provided", source: "dashboard upload" }`.
- Sync never rebases or force-pushes; git errors are surfaced verbatim.
- One render at a time via `out/.render-lock` (JSON `{ pid, startedAt }`); locks older than 15 min are reclaimed.
- Root TS remains strict/ESM with `.ts`-extension imports; dashboard tsconfig mirrors that (`moduleResolution: "bundler"`, `allowImportingTsExtensions: true`).
- Theme tokens: background `#0d0817`, panel `#161028`, gold `#e8c874`, ivory `#f5efe0`, muted `#a89f8d`.
- All existing root tests stay green; CI workflows unchanged.

## File Structure

```
shared/backgrounds.ts            # NEW pure: pool listing, override resolution, Ken Burns variant hash
shared/assets-store.ts           # NEW pure: image slugging + manifest append (used by dashboard upload)
pipeline/run.ts                  # MOD: combined pool, --background flag
pipeline/run.test.ts             # MOD: parseArgs --background cases
video/GitaReel.tsx               # MOD: pass seed to Background
video/components/Background.tsx  # MOD: image branch with Ken Burns
public/assets/manifest.json      # MOD: add "images" section
scripts/fetch-assets.ts          # MOD: Manifest type gains images (fetch loop untouched)
dashboard/
  package.json  next.config.ts  tsconfig.json  postcss.config.mjs
  app/layout.tsx  app/globals.css  app/page.tsx
  app/components/{StatusBar,Library,UploadZone,GeneratePanel}.tsx
  app/api/{assets,upload,generate,state,sync}/route.ts
  app/api/verse/[ref]/route.ts
  app/api/media/[...path]/route.ts
  lib/backend.ts                 # interface (the cloud seam)
  lib/local-backend.ts           # fs/spawn/git implementation + repo-root resolution + render lock
package.json                     # MOD: add "dashboard" script
README.md                        # MOD: dashboard section
```

---

### Task 1: Combined background pool + `--background` override (root pipeline)

**Files:**
- Create: `shared/backgrounds.ts`, `shared/backgrounds.test.ts`
- Modify: `pipeline/run.ts`, `pipeline/run.test.ts`, `public/assets/manifest.json` (add `"images": []`), `scripts/fetch-assets.ts` (type only)

**Interfaces:**
- Consumes: `pickAsset(ref, files)` from `pipeline/pick.ts` (unchanged).
- Produces:
  - `type PoolEntry = { file: string; rel: string; kind: 'clip' | 'image' }` (`rel` like `assets/backgrounds/x.mp4` / `assets/images/y.jpg`)
  - `listBackgroundPool(root?: string): PoolEntry[]` (sorted by `rel`; missing dirs → just skipped)
  - `resolveBackground(name: string, pool: PoolEntry[]): PoolEntry` (matches by `file` basename; throws listing available files)
  - `parseArgs` now returns `{ verse?: string; dryRun: boolean; background?: string }`
  - `IMAGE_EXT = /\.(jpe?g|png|webp)$/i` exported from `shared/backgrounds.ts`

- [ ] **Step 1: Failing tests**

```ts
// shared/backgrounds.test.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listBackgroundPool, resolveBackground } from './backgrounds.ts';

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pool-'));
  mkdirSync(join(root, 'public/assets/backgrounds'), { recursive: true });
  mkdirSync(join(root, 'public/assets/images'), { recursive: true });
  for (const f of ['b.mp4', 'a.mp4', 'skip.txt']) writeFileSync(join(root, 'public/assets/backgrounds', f), '');
  for (const f of ['k.jpg', 'z.webp', 'skip.mov']) writeFileSync(join(root, 'public/assets/images', f), '');
  return root;
}

describe('listBackgroundPool', () => {
  it('merges clips and images, sorted by rel, filtering junk', () => {
    const pool = listBackgroundPool(fixtureRoot());
    expect(pool.map((p) => p.rel)).toEqual([
      'assets/backgrounds/a.mp4',
      'assets/backgrounds/b.mp4',
      'assets/images/k.jpg',
      'assets/images/z.webp',
    ]);
    expect(pool[2].kind).toBe('image');
    expect(pool[0].kind).toBe('clip');
  });

  it('missing dirs → empty contribution', () => {
    expect(listBackgroundPool(mkdtempSync(join(tmpdir(), 'empty-')))).toEqual([]);
  });
});

describe('resolveBackground', () => {
  it('finds by basename', () => {
    const pool = listBackgroundPool(fixtureRoot());
    expect(resolveBackground('k.jpg', pool).rel).toBe('assets/images/k.jpg');
  });
  it('throws with the available list', () => {
    const pool = listBackgroundPool(fixtureRoot());
    expect(() => resolveBackground('nope.jpg', pool)).toThrow(/available: .*a\.mp4/);
  });
});
```

Add to `pipeline/run.test.ts`:

```ts
  it('parses a background override', () => {
    expect(parseArgs(['--background', 'krishna.jpg'])).toEqual({ dryRun: false, background: 'krishna.jpg' });
  });
```

- [ ] **Step 2: Run → FAIL** (`npm test`; module missing / parseArgs shape).

- [ ] **Step 3: Implement `shared/backgrounds.ts`**

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type PoolEntry = { file: string; rel: string; kind: 'clip' | 'image' };

export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const CLIP_EXT = /\.(mp4|webm)$/i;

function list(dir: string, ext: RegExp): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => ext.test(f)) : [];
}

export function listBackgroundPool(root = '.'): PoolEntry[] {
  const clips = list(join(root, 'public/assets/backgrounds'), CLIP_EXT).map((file) => ({
    file, rel: `assets/backgrounds/${file}`, kind: 'clip' as const,
  }));
  const images = list(join(root, 'public/assets/images'), IMAGE_EXT).map((file) => ({
    file, rel: `assets/images/${file}`, kind: 'image' as const,
  }));
  return [...clips, ...images].sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

export function resolveBackground(name: string, pool: PoolEntry[]): PoolEntry {
  const hit = pool.find((p) => p.file === name);
  if (!hit) throw new Error(`background "${name}" not found; available: ${pool.map((p) => p.file).join(', ') || '(none)'}`);
  return hit;
}
```

- [ ] **Step 4: Wire into `pipeline/run.ts`**

In `parseArgs`, after the `--verse` handling:

```ts
  const bi = argv.indexOf('--background');
  const background = bi === -1 ? undefined : argv[bi + 1];
  if (bi !== -1 && !background) throw new Error('--background needs a file name');
  return { verse, dryRun, background };
```

(adjust both return statements to include `background`). Replace the background-listing block (the `listAssets`/`bgs` lines) with:

```ts
  const pool = listBackgroundPool();
  const tracks = listAssets('public/assets/music', /\.mp3$/i);
  if (pool.length === 0) console.warn('no backgrounds — using gradient (run: npm run assets)');
  if (tracks.length === 0) console.warn('no music — rendering silent (run: npm run assets)');
  const bgEntry = args.background
    ? resolveBackground(args.background, pool)
    : pool.length
      ? resolveBackground(pickAsset(verse.ref, pool.map((p) => p.file)), pool)
      : null;
  const musicFile = tracks.length ? pickAsset(verse.ref, tracks) : null;
```

and use `bgEntry?.rel ?? null` for `props.media.background`, `bgEntry?.file` in the rendered log line and manifest credit lookup (`manifest.backgrounds.find((e) => e.file === bgEntry?.file)`). Import `listBackgroundPool, resolveBackground` from `../shared/backgrounds.ts`.

- [ ] **Step 5: Manifest + type** — add `"images": []` to `public/assets/manifest.json`; in `scripts/fetch-assets.ts` change `Manifest` to `{ backgrounds: AssetEntry[]; music: AssetEntry[]; fonts: AssetEntry[]; images: AssetEntry[] }` (download loop still iterates only `['backgrounds', 'music']`).

- [ ] **Step 6: Run** `npm test && npm run typecheck` → all green (existing `toEqual` parseArgs tests tolerate the extra optional key).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: combined clip+image background pool with --background override"`

---

### Task 2: Ken Burns image backgrounds (Remotion)

**Files:**
- Modify: `shared/backgrounds.ts` (+`kenBurnsVariant`), `shared/backgrounds.test.ts`, `video/components/Background.tsx`, `video/GitaReel.tsx`
- Create: `public/assets/images/sample-gradient.jpg` (generated test asset + manifest entry)

**Interfaces:**
- Consumes: `IMAGE_EXT` from Task 1; `FPS` from `shared/types.ts`.
- Produces: `kenBurnsVariant(seed: string): 0 | 1 | 2 | 3` (fnv-1a hash mod 4); `Background` component prop change: `{ media: ReelProps['media']; seed: string }`; GitaReel passes `seed={`${p.verse.ref}:${p.media.background ?? ''}`}`.

- [ ] **Step 1: Failing test** (append to `shared/backgrounds.test.ts`)

```ts
import { kenBurnsVariant } from './backgrounds.ts';

describe('kenBurnsVariant', () => {
  it('is deterministic and in range', () => {
    const v = kenBurnsVariant('gita:2:47:assets/images/k.jpg');
    expect(v).toBe(kenBurnsVariant('gita:2:47:assets/images/k.jpg'));
    expect([0, 1, 2, 3]).toContain(v);
  });
  it('varies across seeds', () => {
    const vs = new Set(Array.from({ length: 40 }, (_, i) => kenBurnsVariant(`gita:1:${i}:x.jpg`)));
    expect(vs.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: FAIL → implement** in `shared/backgrounds.ts`:

```ts
export function kenBurnsVariant(seed: string): 0 | 1 | 2 | 3 {
  let h = 0x811c9dc5;
  for (const c of seed) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h % 4) as 0 | 1 | 2 | 3;
}
```

- [ ] **Step 3: Background image branch** — in `Background.tsx` add props `seed: string`, and before the clip branch:

```tsx
const isImage = media.background ? IMAGE_EXT.test(media.background) : false;
```

Image branch (replaces nothing; new conditional above the `<Loop>` clip branch):

```tsx
{media.background && isImage ? (
  <KenBurnsImage src={staticFile(media.background)} seed={seed} />
) : media.background ? (
  /* existing <Loop><OffthreadVideo …/></Loop> branch unchanged */
) : ( /* existing gradient branch unchanged */ )}
```

`KenBurnsImage` (same file, uses `useVideoConfig().durationInFrames`):

```tsx
const KenBurnsImage: React.FC<{ src: string; seed: string }> = ({ src, seed }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const v = kenBurnsVariant(seed);
  const t = interpolate(frame, [0, durationInFrames], [0, 1]);
  const scale = v === 2 ? 1.16 - 0.1 * t : 1.06 + 0.1 * t; // variant 2 zooms out
  const tx = v === 0 ? -2.5 * t : v === 1 ? 2.5 * t : 0;    // % of width
  const ty = v === 3 ? -2.0 * t : v === 2 ? 1.5 * t : 0;    // % of height
  return (
    <Img
      src={src}
      style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
      }}
    />
  );
};
```

Imports: `Img, useVideoConfig` from `remotion`; `IMAGE_EXT, kenBurnsVariant` from `../../shared/backgrounds.ts`. In `GitaReel.tsx`: `<Background media={p.media} seed={`${p.verse.ref}:${p.media.background ?? ''}`} />`.

- [ ] **Step 4: Generate the sample image + manifest entry**

```bash
npx tsx -e "
const p = require('ffmpeg-static');
require('node:child_process').execFileSync(p, ['-y','-f','lavfi','-i','gradients=s=1080x1920:c0=#1a1033:c1=#3d0f1e:type=linear','-frames:v','1','public/assets/images/sample-gradient.jpg']);
console.log('written');"
```

Add to `manifest.json` `images`: `{ "file": "sample-gradient.jpg", "url": "", "license": "Generated test asset", "source": "scripts (ffmpeg gradient)" }`.

- [ ] **Step 5: Visual check** — `npm test && npm run typecheck`, then render a still with the image forced:

```bash
export PATH="$HOME/.local/bin:$PATH"
npm run generate -- --verse gita:2:47 --dry-run --background sample-gradient.jpg
npx remotion still video/index.ts GitaReel out/still-kb.png --frame=300 --props=out/props.json
```

Inspect `out/still-kb.png`: gradient background, text legible, no letterboxing.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: ken burns image backgrounds"`

---

### Task 3: Dashboard scaffold (Next 16 + Tailwind 4, themed shell)

**Files:**
- Create: `dashboard/package.json`, `dashboard/next.config.ts`, `dashboard/tsconfig.json`, `dashboard/postcss.config.mjs`, `dashboard/app/layout.tsx`, `dashboard/app/globals.css`, `dashboard/app/page.tsx` (placeholder), `dashboard/.gitignore`
- Modify: root `package.json` (script)

**Interfaces:**
- Produces: `npm run dashboard` (from repo root) serves the themed shell at `http://localhost:4000`.

- [ ] **Step 1: Files**

`dashboard/package.json`:
```json
{
  "name": "gita-reels-dashboard",
  "private": true,
  "scripts": { "dev": "next dev -p 4000 -H 0.0.0.0", "build": "next build", "typecheck": "tsc --noEmit" },
  "dependencies": { "next": "^16", "react": "^19", "react-dom": "^19", "sharp": "^0.34", "execa": "^9" },
  "devDependencies": { "typescript": "^5", "@types/react": "^19", "@types/node": "^22", "tailwindcss": "^4", "@tailwindcss/postcss": "^4" }
}
```

`dashboard/next.config.ts`:
```ts
import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
};
export default config;
```

`dashboard/postcss.config.mjs`: `export default { plugins: { '@tailwindcss/postcss': {} } };`

`dashboard/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "esnext"], "module": "esnext",
    "moduleResolution": "bundler", "allowImportingTsExtensions": true, "resolveJsonModule": true,
    "jsx": "preserve", "strict": true, "noEmit": true, "skipLibCheck": true, "esModuleInterop": true,
    "plugins": [{ "name": "next" }], "types": ["node"]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`dashboard/app/globals.css`:
```css
@import 'tailwindcss';
:root { color-scheme: dark; }
body { background: #0d0817; color: #f5efe0; }
```

`dashboard/app/layout.tsx`:
```tsx
import './globals.css';
export const metadata = { title: 'Gita Reels Dashboard' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body className="min-h-screen antialiased">{children}</body></html>
  );
}
```

`dashboard/app/page.tsx` (placeholder for now):
```tsx
export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-[#e8c874]">गीता Reels — Dashboard</h1>
      <p className="mt-2 text-sm text-[#a89f8d]">shell ok</p>
    </main>
  );
}
```

`dashboard/.gitignore`: `node_modules/`, `.next/`, `next-env.d.ts`

Root `package.json` scripts: add `"dashboard": "npm run dev --prefix dashboard"`.

- [ ] **Step 2: Install & verify** — `npm install --prefix dashboard`, then `npm run dashboard` (background), fetch `http://localhost:4000` → HTML contains "Dashboard"; stop server. `npm run typecheck --prefix dashboard` → 0.

- [ ] **Step 3: Commit** — `git add dashboard package.json && git commit -m "feat: dashboard scaffold (next 16, tailwind 4, port 4000)"`

---

### Task 4: Assets store + read/upload APIs

**Files:**
- Create: `shared/assets-store.ts`, `shared/assets-store.test.ts`, `dashboard/lib/backend.ts`, `dashboard/lib/local-backend.ts`, `dashboard/app/api/assets/route.ts`, `dashboard/app/api/upload/route.ts`, `dashboard/app/api/state/route.ts`, `dashboard/app/api/verse/[ref]/route.ts`, `dashboard/app/api/media/[...path]/route.ts`

**Interfaces:**
- Consumes: `listBackgroundPool` (Task 1), manifest shape (Task 1), `pickNext/readState/verseOrder` from `pipeline/select.ts`.
- Produces (used by Task 5–6):
  - `shared/assets-store.ts`: `slugifyImageName(original: string, existing: string[]): string` (kebab basename, `.jpg` forced, `-2`/`-3`… on collision); `appendImageEntry(manifest: Manifest, file: string): Manifest` (pure; entry `{ file, url: '', license: 'User-provided', source: 'dashboard upload' }`; no duplicate entries).
  - `dashboard/lib/backend.ts`:
    ```ts
    export type AssetInfo = { file: string; rel: string; kind: 'clip' | 'image'; license: string };
    export type StateSummary = { lastPosted: { ref: string; youtube?: string; instagram?: string } | null; nextRef: string | null; totalPosted: number; chapters: number[] };
    export interface Backend {
      repoRoot(): string;
      listAssets(): Promise<AssetInfo[]>;
      saveImage(name: string, data: Buffer): Promise<AssetInfo>;
      getState(): Promise<StateSummary>;
      getVerse(ref: string): Promise<{ sanskrit: string[]; hindi: string; english: string } | null>;
      sync(): Promise<{ ok: boolean; output: string }>;
    }
    export function getBackend(): Backend; // returns the local backend singleton
    ```
  - `local-backend.ts` resolves `REPO_ROOT = path.resolve(process.cwd(), '..')`, throws at import if `sources/gita.json` missing. `saveImage` = sharp resize 1080×1920 `fit: 'cover', position: 'attention'` → jpeg q82 → write → manifest append (read-modify-write `public/assets/manifest.json`).
  - Media route serves whitelisted repo files with Range support: prefixes `public/assets/backgrounds/`, `public/assets/images/`, `out/reel.mp4` only.

- [ ] **Step 1: Failing tests** (root suite)

```ts
// shared/assets-store.test.ts
import { describe, it, expect } from 'vitest';
import { slugifyImageName, appendImageEntry } from './assets-store.ts';

describe('slugifyImageName', () => {
  it('kebabs and forces .jpg', () => {
    expect(slugifyImageName('Shri Krishna ART (1).PNG', [])).toBe('shri-krishna-art-1.jpg');
  });
  it('suffixes on collision', () => {
    expect(slugifyImageName('k.png', ['k.jpg'])).toBe('k-2.jpg');
    expect(slugifyImageName('k.png', ['k.jpg', 'k-2.jpg'])).toBe('k-3.jpg');
  });
});

describe('appendImageEntry', () => {
  const base = { backgrounds: [], music: [], fonts: [], images: [] };
  it('appends a user-provided entry once', () => {
    const m1 = appendImageEntry(base as never, 'k.jpg');
    expect(m1.images[0]).toEqual({ file: 'k.jpg', url: '', license: 'User-provided', source: 'dashboard upload' });
    expect(appendImageEntry(m1, 'k.jpg').images).toHaveLength(1);
  });
});
```

- [ ] **Step 2: FAIL → implement `shared/assets-store.ts`**

```ts
import type { Manifest } from '../scripts/fetch-assets.ts';

export function slugifyImageName(original: string, existing: string[]): string {
  const stem = original.replace(/\.[^.]+$/, '').toLowerCase()
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  let name = `${stem}.jpg`;
  for (let i = 2; existing.includes(name); i++) name = `${stem}-${i}.jpg`;
  return name;
}

export function appendImageEntry(manifest: Manifest, file: string): Manifest {
  if (manifest.images.some((e) => e.file === file)) return manifest;
  return {
    ...manifest,
    images: [...manifest.images, { file, url: '', license: 'User-provided', source: 'dashboard upload' }],
  };
}
```

Run `npm test` → PASS.

- [ ] **Step 3: Backend interface + local implementation** — code as specified in Interfaces; `listAssets()` maps `listBackgroundPool(REPO_ROOT)` and joins license from manifest (`backgrounds` by file, `images` by file, default `'—'`). `getState()` reads `state.json`, `config.json`, `sources/gita.json`; `nextRef` via `pickNext(verseOrder(verses, startRef), state, platforms)?.ref`; `chapters` = per-chapter verse counts array (index 0 = chapter 1). `getVerse` looks up by ref. `sync()` runs `git add public/assets/images public/assets/manifest.json` + `git commit -m "feat: add custom background images via dashboard"` (tolerate "nothing to commit" → ok:true, note in output) + `git push` via execa, cwd REPO_ROOT, capturing stdout+stderr into `output`; any throw → `{ ok: false, output }`.

- [ ] **Step 4: Routes**

`app/api/assets/route.ts`: `export async function GET() { return Response.json(await getBackend().listAssets()); }`

`app/api/upload/route.ts`:
```ts
import { getBackend } from '../../../lib/backend.ts';
export async function POST(req: Request) {
  const form = await req.formData();
  const f = form.get('file');
  if (!(f instanceof File)) return Response.json({ error: 'no file' }, { status: 400 });
  if (!/\.(jpe?g|png|webp)$/i.test(f.name)) return Response.json({ error: 'jpg/png/webp only' }, { status: 400 });
  if (f.size > 15 * 1024 * 1024) return Response.json({ error: 'max 15 MB' }, { status: 400 });
  const saved = await getBackend().saveImage(f.name, Buffer.from(await f.arrayBuffer()));
  return Response.json(saved);
}
```

`app/api/state/route.ts` / `app/api/verse/[ref]/route.ts`: thin `Response.json(await backend…)`; verse route 404s on null (ref arrives URL-encoded — decode before lookup).

`app/api/media/[...path]/route.ts` (Range-capable, whitelist enforced):
```ts
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
```

- [ ] **Step 5: Verify with curl** (server running): upload the sample gradient (`curl -F file=@public/assets/images/sample-gradient.jpg http://localhost:4000/api/upload` → 200 json with `-2` suffixed slug — then delete that duplicate file + manifest entry to keep the library clean: it was only an API check), `GET /api/assets` lists clips+images with licenses, `GET /api/state` shows `nextRef: "gita:1:1"`, `GET /api/media/public/assets/images/sample-gradient.jpg` → 200 image, `GET /api/media/../../secret` → 403.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: dashboard backend seam, upload/read APIs with range-capable media"`

---

### Task 5: Generate (streaming + lock) and sync routes

**Files:**
- Create: `dashboard/app/api/generate/route.ts`, `dashboard/app/api/sync/route.ts`
- Modify: `dashboard/lib/local-backend.ts` (add `generateStream` + lock helpers)

**Interfaces:**
- Consumes: Task 4 backend; `pipeline/run.ts --background` (Task 1).
- Produces: `POST /api/generate` body `{ ref: string, background?: string }` → `text/plain` chunked stream of pipeline output ending with `\nEXIT <code>\n`; 409 `{ error: 'render already in progress' }` when locked. `POST /api/sync` → `{ ok, output }`. Backend gains `generateStream(ref: string, background?: string): ReadableStream<Uint8Array> | 'locked'`.

- [ ] **Step 1: Lock + spawn in `local-backend.ts`**

```ts
const LOCK = () => join(REPO_ROOT, 'out/.render-lock');

function acquireLock(): boolean {
  mkdirSync(join(REPO_ROOT, 'out'), { recursive: true });
  try {
    const { startedAt } = JSON.parse(readFileSync(LOCK(), 'utf8'));
    if (Date.now() - startedAt < 15 * 60 * 1000) return false; // fresh lock → busy
  } catch { /* absent or corrupt → claimable */ }
  writeFileSync(LOCK(), JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
  return true;
}
const releaseLock = () => { try { unlinkSync(LOCK()); } catch { /* already gone */ } };

export function generateStream(ref: string, background?: string): ReadableStream<Uint8Array> | 'locked' {
  if (!/^[a-z]+:\d+:\d+$/.test(ref)) throw new Error('bad ref');
  if (!acquireLock()) return 'locked';
  const args = ['tsx', 'pipeline/run.ts', '--verse', ref, '--dry-run', ...(background ? ['--background', background] : [])];
  const proc = spawn('npx', args, {
    cwd: REPO_ROOT,
    env: { ...process.env, PATH: `${process.env.PATH}:${join(homedir(), '.local/bin')}` },
  });
  return new ReadableStream({
    start(c) {
      const push = (d: Buffer) => c.enqueue(new Uint8Array(d));
      proc.stdout.on('data', push);
      proc.stderr.on('data', push);
      proc.on('close', (code) => {
        releaseLock();
        c.enqueue(new TextEncoder().encode(`\nEXIT ${code ?? 1}\n`));
        c.close();
      });
      proc.on('error', (e) => { releaseLock(); c.enqueue(new TextEncoder().encode(`\n${e.message}\nEXIT 1\n`)); c.close(); });
    },
    cancel() { proc.kill('SIGTERM'); releaseLock(); },
  });
}
```

- [ ] **Step 2: Routes**

`app/api/generate/route.ts`:
```ts
import { generateStream } from '../../../lib/local-backend.ts';
export async function POST(req: Request) {
  const { ref, background } = await req.json();
  const stream = generateStream(ref, background || undefined);
  if (stream === 'locked') return Response.json({ error: 'render already in progress' }, { status: 409 });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
```

`app/api/sync/route.ts`: `export async function POST() { return Response.json(await getBackend().sync()); }`

- [ ] **Step 3: Verify with curl** — `curl -N -X POST -H 'content-type: application/json' -d '{"ref":"gita:2:47","background":"sample-gradient.jpg"}' http://localhost:4000/api/generate` → streams pipeline logs live, ends `EXIT 0`, `out/reel.mp4` refreshed; a second concurrent curl gets 409; `out/.render-lock` gone afterwards.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: streaming generate with render lock, git sync route"`

---

### Task 6: Dashboard UI

**Files:**
- Create: `dashboard/app/components/StatusBar.tsx`, `Library.tsx`, `UploadZone.tsx`, `GeneratePanel.tsx`
- Modify: `dashboard/app/page.tsx`

**Interfaces:**
- Consumes: every Task 4/5 route exactly as specified. All four components are `'use client'`.

- [ ] **Step 1: `page.tsx`** — server component shell:

```tsx
import { StatusBar } from './components/StatusBar.tsx';
import { UploadZone } from './components/UploadZone.tsx';
import { Library } from './components/Library.tsx';
import { GeneratePanel } from './components/GeneratePanel.tsx';

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold text-[#e8c874]">गीता Reels</h1>
        <p className="text-sm text-[#a89f8d]">daily shloka automation — control room</p>
      </header>
      <StatusBar />
      <GeneratePanel />
      <UploadZone />
      <Library />
    </main>
  );
}
```

- [ ] **Step 2: `StatusBar.tsx`** — on mount `GET /api/state`; render three stat chips (last posted ref with ✔ marks per platform, next verse, total posted) + Sync button: `POST /api/sync`, show returned `output` in a collapsible `<pre>`, red border when `ok: false`. Panel styling token (shared by all cards): `rounded-xl bg-[#161028] p-4 ring-1 ring-white/5`.

- [ ] **Step 3: `UploadZone.tsx`** — `<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>` + a dashed drop area (`border-2 border-dashed border-[#e8c874]/30`, hover highlight, drop + click handlers). Each file → `POST /api/upload` FormData; show per-file success (slug) or error text; on success call `window.dispatchEvent(new Event('assets-changed'))`. Note under the zone: *"Upload only images you have the right to use — they're recorded as user-provided in the licensing manifest."*

- [ ] **Step 4: `Library.tsx`** — fetch `/api/assets` on mount and on `'assets-changed'`; grid `grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3`; images → `<img src={`/api/media/public/${a.rel}`}>`, clips → `<video muted preload="metadata" src={…}>`; caption = file + license (`text-[10px] text-[#a89f8d]`); 9:16 tiles (`aspect-[9/16] object-cover rounded-lg`).

- [ ] **Step 5: `GeneratePanel.tsx`** — the busiest component; core logic:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

export function GeneratePanel() {
  const [chapters, setChapters] = useState<number[]>([]);
  const [ch, setCh] = useState(1);
  const [vs, setVs] = useState(1);
  const [assets, setAssets] = useState<{ file: string; kind: string }[]>([]);
  const [bg, setBg] = useState(''); // '' = Auto
  const [preview, setPreview] = useState<{ hindi: string } | null>(null);
  const [log, setLog] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<null | boolean>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => { fetch('/api/state').then((r) => r.json()).then((s) => setChapters(s.chapters)); }, []);
  useEffect(() => { fetch('/api/assets').then((r) => r.json()).then(setAssets); }, []);
  useEffect(() => {
    fetch(`/api/verse/${encodeURIComponent(`gita:${ch}:${vs}`)}`).then((r) => (r.ok ? r.json() : null)).then(setPreview);
  }, [ch, vs]);

  async function generate() {
    setRunning(true); setLog(''); setDone(null);
    const res = await fetch('/api/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref: `gita:${ch}:${vs}`, background: bg || undefined }),
    });
    if (res.status === 409) { setLog('A render is already in progress.'); setRunning(false); setDone(false); return; }
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let all = '';
    for (;;) {
      const { value, done: d } = await reader.read();
      if (d) break;
      all += dec.decode(value, { stream: true });
      setLog(all);
      logRef.current?.scrollTo(0, 1e9);
    }
    setRunning(false);
    setDone(/\nEXIT 0\n?$/.test(all));
  }
  /* render: chapter select 1..18, verse select 1..chapters[ch-1], preview line,
     background select (Auto + assets by file, images first), Generate button,
     <pre ref={logRef}> log panel, and when done === true:
     <video controls src={`/api/media/out/reel.mp4?t=${Date.now()}`} className="aspect-[9/16] w-64 rounded-xl" />
     + <a href={same} download>Download</a>; done === false → red "failed — log above" note. */
}
```

(The commented render block is the contract: implement it with the shared panel styling; selects are plain `<select>` with `bg-[#0d0817]` and gold focus rings.)

- [ ] **Step 6: Verify in browser** — `npm run dashboard`; on `http://localhost:4000`: library shows 6 clips + sample gradient; upload a jpg from Finder → appears in grid; generate 2:47 with the uploaded image → live log → video plays inline; second Generate while running shows the 409 message; Sync pushes and shows git output. Phone check optional: same URL with Mac's LAN IP.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: dashboard ui — library, upload, generate with live log, sync"`

---

### Task 7: End-to-end proof + docs

**Files:**
- Modify: `README.md` (Dashboard section), `SETUP.md` (one line pointing to it)

**Interfaces:** none new.

- [ ] **Step 1: Full-loop test (scripted, from repo root, server running)**

```bash
export PATH="$HOME/.local/bin:$PATH"
# 1. upload
curl -sf -F file=@public/assets/images/sample-gradient.jpg http://localhost:4000/api/upload | tee /tmp/up.json
SLUG=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/up.json')).file)")
# 2. generate with it
curl -sfN -X POST -H 'content-type: application/json' \
  -d "{\"ref\":\"gita:12:15\",\"background\":\"$SLUG\"}" http://localhost:4000/api/generate | tail -3
# expect: ✔ rendered … bg=$SLUG … EXIT 0
# 3. auto-rotation includes images (pool check)
npx tsx -e "import('./shared/backgrounds.ts').then(m => console.log(m.listBackgroundPool().map(p => p.rel)))"
# 4. cleanup the duplicate test upload (file + manifest entry), keep library tidy
```

Then `npm test && npm run typecheck` (root) + `npm run typecheck --prefix dashboard` → green.

- [ ] **Step 2: Visual confirmation** — render one still from the last generate's props (`npx remotion still video/index.ts GitaReel out/still-dash.png --frame=300 --props=out/props.json`), inspect: uploaded image + Ken Burns crop look right behind text.

- [ ] **Step 3: Docs** — README gains a "Dashboard" section: start command, port, phone-on-WiFi note, upload licensing note, Sync explanation (images ride into daily rotation after push). SETUP.md gets one pointer line.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "docs: dashboard usage; e2e verified"`
