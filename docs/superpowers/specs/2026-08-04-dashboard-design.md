# Reels Dashboard — Design Spec

**Date:** 2026-08-04
**Status:** Approved pending user review
**Goal:** A local-first Next.js dashboard to upload custom background images and generate/preview reels from a UI, with a clean seam for a future cloud version. Uploaded images join the daily automation's background rotation after a one-click GitHub sync.

## 1. Decisions already made (with user)

- **Local now, cloud later.** The dashboard runs on the user's Mac (`http://localhost:4000`, reachable from phone over home WiFi). Every mutation goes through a thin backend interface so a cloud backend (GitHub-API based) can be swapped in later without UI changes.
- **Rotation + manual pick.** Uploaded images automatically join the deterministic background rotation used by daily automation, AND the dashboard's Generate panel allows hand-picking the exact background for a one-off render.
- **One canonical render path.** The dashboard shells out to the same command CI runs (`tsx pipeline/run.ts --verse … --dry-run [--background …]`). It never re-implements rendering.

## 2. UX (single page, dark indigo + gold theme matching the reels)

- **Background library:** thumbnail grid of licensed clips (`public/assets/backgrounds/*.mp4`) and uploaded images (`public/assets/images/*`), each labeled with its license.
- **Upload:** drag-drop / tap-to-pick; accepts jpg/png/webp up to 15 MB; server resizes to 1080×1920 cover (sharp), saves to `public/assets/images/<slug>.jpg`, appends a manifest entry `{ file, license: "User-provided", source: "dashboard upload" }`. The UI states the user is responsible for rights to uploaded images.
- **Generate:** chapter + verse selectors with verse text preview (from `sources/gita.json`); background dropdown (**Auto** = rotation, or a specific asset); Generate button → live progress log (streamed) → inline video player of `out/reel.mp4` + download link. Concurrent generates are refused with a friendly "already rendering" message.
- **Status bar:** last posted ref + links (from `state.json`), next verse, workflow-enabled hint, and **Sync to GitHub** (commits `public/assets/images/` + manifest, pushes; surfaces git errors verbatim with a "pull first" hint on conflicts — never force-pushes).

## 3. Architecture

```
dashboard/                    # Next.js App Router app, own package.json (isolated deps)
  app/page.tsx                # the single page (client components for upload/generate)
  app/api/assets/route.ts     # GET  → { backgrounds, images } with license labels
  app/api/upload/route.ts     # POST multipart → resize → save + manifest append
  app/api/generate/route.ts   # POST { ref, background? } → spawn pipeline, stream stdout (SSE-style chunked text)
  app/api/state/route.ts      # GET  → state.json summary + next ref
  app/api/sync/route.ts       # POST → git add/commit/push images + manifest
  app/api/media/[...path]/route.ts  # serves repo files (thumbnails, out/reel.mp4) outside dashboard/public
  lib/backend.ts              # THE SEAM: interface { listAssets, uploadImage, generate, getState, sync }
  lib/local-backend.ts        # today's implementation (fs + child_process + git), runs with cwd = repo root
```

- Root `package.json` gains `"dashboard": "npm run dev --prefix dashboard"` (port 4000, `-H 0.0.0.0` for phone access).
- The dashboard process must be started from the repo (backend resolves repo root as `..` from `dashboard/`).

## 4. Pipeline changes (shared with daily automation)

1. **Images in the rotation:** `pipeline/run.ts` background pool = `public/assets/backgrounds/*.(mp4|webm)` ∪ `public/assets/images/*.(jpg|jpeg|png|webp)`; single `pickAsset` call over the combined sorted list keeps determinism. `ReelProps.media.background` may now be an image path.
2. **Ken Burns for stills:** `video/components/Background.tsx` gains an image branch — `<Img>` with slow zoom (scale 1.06 → 1.16 over the reel) and a gentle pan whose direction (4 variants) derives from an fnv-1a hash of the background filename + verse ref. Same dark overlay as clips.
3. **Manual override:** `pipeline/run.ts` accepts `--background <file>` (basename under either asset dir); invalid names fail with the available list printed.
4. **Manifest:** new `images` section, entries added by the dashboard; `scripts/fetch-assets.ts` ignores it for downloads (images are committed to the repo — they're small post-resize) but the credit/licensing record pattern stays uniform. CI needs no changes: checkout brings the images.

## 5. Error handling

- Generate stream ends with an explicit `EXIT <code>` line; non-zero shows the real stderr in the log panel.
- Upload rejects wrong type/oversize with specific messages; slug collisions get `-2` suffixes; a failed resize never leaves partial files.
- Sync: `git push` failure surfaces stdout/stderr verbatim; conflict → instruct "pull on the repo first" (dashboard never rebases or force-pushes).
- One render at a time: a lockfile (`out/.render-lock`) guards `generate`; stale locks (>15 min) are reclaimed.

## 6. Testing

- Unit (vitest, root suite): combined-pool listing + `--background` validation in `pipeline/run.ts` helpers; Ken Burns direction hash; manifest append/slugging logic (extracted pure into `dashboard/lib` or shared).
- The Background image branch is verified with a rendered still (same technique as previous visual checks).
- End-to-end: upload one image → generate 2:47 with it manually picked → watch inline; then Auto-generate and confirm rotation includes the upload.
- Existing CI unchanged and must stay green (pipeline tests cover the pool change).

## 7. Out of scope

Cloud deployment (seam only), auth (localhost/LAN only for now), posting controls, analytics, Krishna Vaani v2 format (separate upcoming feature — uploaded images will serve it too), video uploads (images only for now).
