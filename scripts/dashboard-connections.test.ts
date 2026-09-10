import { describe, it, expect } from 'vitest';
import { parseSecretNames, parseWorkflowStates } from '../dashboard/lib/connections-parse.ts';

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
