import { describe, it, expect } from 'vitest';
import { parseSecretNames, parseWorkflowStates, platformRow } from '../dashboard/lib/connections-parse.ts';
import { secretsFor } from '../pipeline/schedule-io.ts';

// The three keys pipeline/schedule-io.ts requires for YouTube, in its own order. Repeated
// here on purpose: SECRET_KEYS is private to that module, and these assertions are about the
// exact list a card would print.
const YT = ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN'];

describe('gh output parsing', () => {
  it('reads secret names, ignoring blank lines and padding', () => {
    const names = parseSecretNames('YT_CLIENT_ID\n  IG_USER_ID  \n\n');
    expect([...names].sort()).toEqual(['IG_USER_ID', 'YT_CLIENT_ID']);
    expect(parseSecretNames('').size).toBe(0);
  });

  it('reads workflow states and leaves anything unseen unknown', () => {
    const stdout = 'ci\tactive\t1\ndaily-reel\tdisabled_manually\t2\npublisher\tactive\t3';
    expect(parseWorkflowStates(stdout, ['daily-reel', 'publisher'])).toEqual({ 'daily-reel': 'disabled', publisher: 'active' });
    expect(parseWorkflowStates('', ['daily-reel', 'publisher'])).toEqual({ 'daily-reel': 'unknown', publisher: 'unknown' });
    expect(parseWorkflowStates('publisher\t\t3', ['publisher'])).toEqual({ publisher: 'unknown' });
  });
});

describe('platformRow', () => {
  it('reports every required key as missing on an empty environment', () => {
    const row = platformRow('youtube', {}, secretsFor);
    expect(row.local).toBe(false);
    expect(row.missingLocal).toEqual(YT);
    expect(row.secrets).toEqual(YT);
  });

  // The case the card exists for, and the one the inline version got wrong: two of three keys
  // set and the operator part-way through the OAuth flow was told all three were missing.
  it('names only the keys this machine is short of when the environment is partly populated', () => {
    const row = platformRow('youtube', { YT_CLIENT_ID: 'a', YT_CLIENT_SECRET: 'b' }, secretsFor);
    expect(row.local).toBe(false);
    expect(row.missingLocal).toEqual(['YT_REFRESH_TOKEN']);
    // …while `secrets` still names the whole list — see below for why that matters.
    expect(row.secrets).toEqual(YT);
  });

  // Guards the regression the obvious one-line fix would introduce. getConnections does
  // `platforms[p].secrets.every((k) => names.has(k))` against `gh secret list`; if `secrets`
  // narrowed to the *local* misses it would be empty here, `[].every(...)` is `true`, and the
  // GitHub Actions column would claim "present" without checking a single secret.
  it('keeps `secrets` whole even when the local environment is complete', () => {
    const row = platformRow('youtube', { YT_CLIENT_ID: 'a', YT_CLIENT_SECRET: 'b', YT_REFRESH_TOKEN: 'c' }, secretsFor);
    expect(row.local).toBe(true);
    expect(row.missingLocal).toEqual([]);
    expect(row.secrets).toEqual(YT);
    expect(row.secrets.every((k) => new Set(['YT_CLIENT_ID']).has(k))).toBe(false);
  });

  it('answers for every platform, not just youtube', () => {
    expect(platformRow('instagram', { IG_USER_ID: 'a' }, secretsFor)).toEqual({
      local: false,
      secrets: ['IG_USER_ID', 'IG_ACCESS_TOKEN'],
      missingLocal: ['IG_ACCESS_TOKEN'],
    });
    expect(platformRow('facebook', {}, secretsFor).secrets).toEqual(['FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN']);
  });
});
