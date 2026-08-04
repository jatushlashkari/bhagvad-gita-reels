import { describe, it, expect } from 'vitest';
import { parseArgs } from './run.ts';

describe('parseArgs', () => {
  it('parses verse override and dry-run flag', () => {
    expect(parseArgs(['--verse', 'gita:2:47', '--dry-run'])).toEqual({ verse: 'gita:2:47', dryRun: true });
  });

  it('defaults to no override, live mode', () => {
    expect(parseArgs([])).toEqual({ dryRun: false });
  });

  it('rejects malformed verse refs', () => {
    expect(() => parseArgs(['--verse', '2.47'])).toThrow(/format/);
  });

  it('parses a background override', () => {
    expect(parseArgs(['--background', 'krishna.jpg'])).toEqual({ dryRun: false, background: 'krishna.jpg' });
  });
});
