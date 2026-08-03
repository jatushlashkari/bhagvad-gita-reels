import { createReadStream } from 'node:fs';
import { google } from 'googleapis';
import { youtubeTitle, youtubeDescription } from './captions.ts';
import type { Verse } from '../shared/types.ts';

export type YoutubeEnv = { clientId: string; clientSecret: string; refreshToken: string };

export function buildYoutubeRequest(v: Verse, credits: string[] = []) {
  const description = credits.length
    ? `${youtubeDescription(v)}\n\n${credits.join('\n')}`
    : youtubeDescription(v);
  return {
    snippet: {
      title: youtubeTitle(v),
      description,
      tags: ['bhagavad gita', 'gita', 'krishna', 'shorts', 'hindi'],
      categoryId: '22',
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  };
}

export async function postYoutube(
  v: Verse,
  filePath: string,
  env: YoutubeEnv,
  credits: string[] = [],
): Promise<string> {
  const oauth2 = new google.auth.OAuth2(env.clientId, env.clientSecret);
  oauth2.setCredentials({ refresh_token: env.refreshToken });
  const yt = google.youtube({ version: 'v3', auth: oauth2 });
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: buildYoutubeRequest(v, credits),
    media: { body: createReadStream(filePath) },
  });
  if (!res.data.id) throw new Error('YouTube upload returned no video id');
  return res.data.id;
}
