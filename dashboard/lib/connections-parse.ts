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
