import { describe, it, expect } from 'vitest';
import { ttsArgs, VOICE } from './tts.ts';

describe('ttsArgs', () => {
  it('builds edge-tts args with default rate', () => {
    expect(ttsArgs('नमस्ते', '/tmp/a.mp3')).toEqual([
      '--voice', VOICE, '--rate', '+0%', '--text', 'नमस्ते', '--write-media', '/tmp/a.mp3',
    ]);
  });

  it('accepts a rate override', () => {
    expect(ttsArgs('x', 'o.mp3', { rate: '+15%' })).toContain('+15%');
  });
});
