import { setTimeout as sleep } from 'node:timers/promises';
import { instagramCaption } from './captions.ts';
import type { Verse } from '../shared/types.ts';

export const IG_GRAPH = 'https://graph.instagram.com/v23.0';

export type InstagramEnv = { userId: string; accessToken: string };

export function reelContainerParams(caption: string, videoUrl: string): URLSearchParams {
  return new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: 'true',
  });
}

async function igFetch(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Instagram API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export async function postInstagram(
  v: Verse,
  videoUrl: string,
  env: InstagramEnv,
  caption?: string,
): Promise<string> {
  const params = reelContainerParams(caption ?? instagramCaption(v), videoUrl);
  params.set('access_token', env.accessToken);
  const container = await igFetch(`${IG_GRAPH}/${env.userId}/media`, { method: 'POST', body: params });
  const containerId = String(container.id ?? '');
  if (!containerId) throw new Error(`no container id in ${JSON.stringify(container)}`);

  // Instagram processes the video asynchronously; publish only once it reports FINISHED.
  let status = 'IN_PROGRESS';
  for (let i = 0; i < 30 && status !== 'FINISHED'; i++) {
    await sleep(10_000);
    const check = await igFetch(
      `${IG_GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(env.accessToken)}`,
    );
    status = String(check.status_code ?? 'IN_PROGRESS');
    if (status === 'ERROR') throw new Error(`Instagram container failed: ${JSON.stringify(check)}`);
  }
  if (status !== 'FINISHED') throw new Error(`Instagram container not ready after 5 minutes (status ${status})`);

  const publish = await igFetch(`${IG_GRAPH}/${env.userId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: containerId, access_token: env.accessToken }),
  });
  const mediaId = String(publish.id ?? '');
  if (!mediaId) throw new Error(`no media id in ${JSON.stringify(publish)}`);
  return mediaId;
}

export async function refreshIgToken(current: string): Promise<{ token: string; expiresInSec: number }> {
  const body = await igFetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`,
  );
  const token = String(body.access_token ?? '');
  const expiresInSec = Number(body.expires_in ?? 0);
  if (!token) throw new Error(`refresh returned no token: ${JSON.stringify(body)}`);
  if (expiresInSec < 7 * 86_400)
    throw new Error(`refreshed token expires in ${expiresInSec}s — refresh is not sticking, re-authenticate`);
  return { token, expiresInSec };
}
