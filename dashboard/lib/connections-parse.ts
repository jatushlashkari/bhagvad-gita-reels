import type { Platform } from '../../shared/schedule.ts';

export type WorkflowState = 'active' | 'disabled' | 'unknown';

/** `gh secret list --json name -q '.[].name'` prints one name per line. */
export function parseSecretNames(stdout: string): Set<string> {
  return new Set(stdout.split('\n').map((s) => s.trim()).filter(Boolean));
}

/** `gh workflow list --all` prints tab-separated `name<TAB>state<TAB>id`. Anything we
 *  do not recognise stays 'unknown' rather than guessing "disabled" — the card says
 *  so, and nobody enables a workflow on a bad guess. */
export function parseWorkflowStates(stdout: string, names: readonly string[]): Record<string, WorkflowState> {
  const out: Record<string, WorkflowState> = {};
  for (const name of names) out[name] = 'unknown';
  for (const line of stdout.split('\n')) {
    const [name, state] = line.split('\t').map((s) => s.trim());
    if (!name || !names.includes(name)) continue;
    out[name] = state === 'active' ? 'active' : state ? 'disabled' : 'unknown';
  }
  return out;
}

/** The shape of pipeline/schedule-io.ts's `secretsFor`. Taken as a parameter rather than
 *  imported: that module reads node:fs at import time and this file sits on the browser
 *  module graph, which must stay free of node imports. */
export type SecretsCheck = (
  platform: Platform,
  env: NodeJS.ProcessEnv,
) => { ok: true } | { ok: false; missing: string[] };

/** One Connections row's local half — the whole reason it is a named, pure function is that
 *  the two key lists below are easy to confuse and only one of them belongs in each place:
 *
 *  - `secrets` is EVERY key the platform needs. getConnections tests this whole list against
 *    `gh secret list` for the GitHub Actions column; narrowing it would let a complete local
 *    `.env` empty the list, and `[].every(...)` is `true` — the card would report cloud
 *    secrets as present without having checked a single one.
 *  - `missingLocal` is only what THIS machine's environment is short of, which is what the
 *    card should name: someone who has set two of YouTube's three keys needs to be told about
 *    the third, not told all three are missing.
 *
 *  `secretsFor` over an empty env is what names the full list — SECRET_KEYS is private to
 *  pipeline/schedule-io.ts, and the dashboard has no business exporting it from there. */
export function platformRow(
  platform: Platform,
  env: NodeJS.ProcessEnv,
  secretsFor: SecretsCheck,
): { local: boolean; secrets: string[]; missingLocal: string[] } {
  const local = secretsFor(platform, env);
  // The cast is only for Next's global.d.ts, which augments NodeJS.ProcessEnv to require
  // NODE_ENV — root tsc has no such augmentation (pipeline/schedule-io.test.ts calls
  // secretsFor(p, {}) uncast), so this is a dashboard-typecheck-only wrinkle, not a real
  // environment requirement.
  const all = secretsFor(platform, {} as NodeJS.ProcessEnv);
  return {
    local: local.ok,
    secrets: all.ok ? [] : all.missing,
    missingLocal: local.ok ? [] : local.missing,
  };
}
