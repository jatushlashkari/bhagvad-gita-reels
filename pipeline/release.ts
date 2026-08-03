import { basename } from 'node:path';
import { execa } from 'execa';

export function releaseTag(ref: string): string {
  return `reel-${ref.replace(/:/g, '-')}`;
}

export function assetUrl(repo: string, tag: string, file: string): string {
  return `https://github.com/${repo}/releases/download/${tag}/${file}`;
}

async function repoSlug(): Promise<string> {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const { stdout } = await execa('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  return stdout.trim();
}

// Publishes the day's MP4 as a GitHub Release asset. The release doubles as a permanent
// public archive, and its download URL is what the Instagram Graph API fetches.
// Note: Instagram must follow the 302 redirect GitHub serves for release assets; if a
// post ever fails with a media-download error, post that day's reel manually from the
// workflow artifact and check the release URL in a browser.
export async function publishReleaseAsset(ref: string, filePath: string, repo?: string): Promise<string> {
  const slug = repo ?? (await repoSlug());
  const tag = releaseTag(ref);
  try {
    await execa('gh', ['release', 'create', tag, filePath, '--title', tag, '--notes', `Daily reel for ${ref}`]);
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (!/already exists/i.test(msg)) throw e;
    await execa('gh', ['release', 'upload', tag, filePath, '--clobber']);
  }
  return assetUrl(slug, tag, basename(filePath));
}
