import { describe, it, expect } from 'vitest';
import { REF_PATTERN, customQuoteProblem, placeholderVerse, slugId, validateCustomQuote } from './custom-quotes.ts';

describe('custom quotes', () => {
  it('fills defaults, mints a slug id and stamps createdAt', () => {
    const q = validateCustomQuote({ lines: ['Do the work.', 'Release the outcome.'] }, [], new Date('2026-09-09T00:00:00Z'));
    expect(q.attribution).toBe('श्रीकृष्ण');
    expect(q.kicker).toBe('श्रीकृष्ण कहते हैं');
    expect(q.prompt).toBe('');
    expect(q.id).toMatch(/^do-the-work-[a-z0-9]{4}$/);
    expect(q.createdAt).toBe('2026-09-09T00:00:00.000Z');
  });
  it('whitespace-only attribution/kicker fall back to the defaults, and customQuoteProblem agrees', () => {
    const q = validateCustomQuote({ lines: ['a.', 'b.'], attribution: '   ', kicker: '  ' }, []);
    expect(q.attribution).toBe('श्रीकृष्ण');
    expect(q.kicker).toBe('श्रीकृष्ण कहते हैं');
    expect(customQuoteProblem({ lines: ['a.', 'b.'], attribution: '   ', kicker: '  ', prompt: '' })).toBeNull();
  });
  it('rejects rule violations with the rule in the message', () => {
    expect(() => validateCustomQuote({ lines: ['only one.'] }, [])).toThrow(/2-6/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b 🙏.'] }, [])).toThrow(/emoji/);
    expect(() => validateCustomQuote({ lines: ['a.', 'x'.repeat(91)] }, [])).toThrow(/90/);
    expect(() => validateCustomQuote({ lines: ['a.', ' '] }, [])).toThrow(/empty/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b.'], attribution: 'x'.repeat(61) }, [])).toThrow(/60/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b.'], kicker: 'x'.repeat(31) }, [])).toThrow(/30/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b.'], prompt: 'x'.repeat(301) }, [])).toThrow(/300/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b.'], attribution: 'ॐ 🙏' }, [])).toThrow(/emoji/);
    expect(() => validateCustomQuote(null, [])).toThrow(/object/);
  });
  it('keeps a provided valid id, rejects a bad id, refuses duplicates', () => {
    expect(validateCustomQuote({ id: 'my-quote-1', lines: ['a.', 'b.'] }, []).id).toBe('my-quote-1');
    expect(() => validateCustomQuote({ id: 'My Quote', lines: ['a.', 'b.'] }, [])).toThrow(/id/);
    expect(() => validateCustomQuote({ id: 'my-quote-1', lines: ['a.', 'b.'] }, ['my-quote-1'])).toThrow(/exists/);
  });
  it('slugId handles Devanagari-only and long first lines', () => {
    expect(slugId('कर्म करो', 'ab12')).toBe('quote-ab12');
    expect(slugId('Do the work. Release the outcome. Stay steady.', 'zz99')).toBe('do-the-work-release-the-outcome-zz99');
  });
  it('customQuoteProblem mirrors the rules without throwing', () => {
    expect(customQuoteProblem({ lines: ['a.', 'b.'], attribution: 'x', kicker: 'k', prompt: '' })).toBeNull();
    expect(customQuoteProblem({ lines: ['a.'], attribution: 'x', kicker: 'k', prompt: '' })).toMatch(/2/);
    expect(customQuoteProblem({ lines: ['a.', 'b.'], attribution: 'x'.repeat(61), kicker: 'k', prompt: '' })).toMatch(/60/);
  });
  it('placeholderVerse shape and REF_PATTERN', () => {
    const v = placeholderVerse(validateCustomQuote({ id: 'abc-123', lines: ['a.', 'b.'], attribution: 'Meera' }, []));
    expect(v).toMatchObject({ book: 'custom', ref: 'custom:abc-123', chapter: 0, verse: 0, sanskrit: ['Meera'], english: 'a. b.' });
    expect(v.attribution.english).toBe('custom quote');
    expect(REF_PATTERN.test('gita:2:47')).toBe(true);
    expect(REF_PATTERN.test('custom:abc-123')).toBe(true);
    expect(REF_PATTERN.test('custom:..')).toBe(false);
    expect(REF_PATTERN.test('custom:ab')).toBe(false);
    expect(REF_PATTERN.test('Custom:abc')).toBe(false);
  });
});
