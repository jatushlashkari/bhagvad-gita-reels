import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { validateSources, cleanTranslation, sanskritLines } from './build-sources.ts';

describe('sources/gita.json', () => {
  it('is complete, contiguous, attributed', () => {
    const data = JSON.parse(readFileSync('sources/gita.json', 'utf8'));
    expect(() => validateSources(data)).not.toThrow();
  });

  it('validator rejects a broken dataset', () => {
    expect(() => validateSources({ book: 'gita', verses: [] })).toThrow(/18 chapters/);
  });
});

describe('cleanTranslation', () => {
  it('strips verse markers and footnote references without leaving stray spaces', () => {
    expect(
      cleanTranslation('।।2.47।। कर्तव्य-कर्म करनेमें ही तेरा अधिकार है (टिप्पणी प0 2.4), फलोंमें कभी नहीं।\n '),
    ).toBe('कर्तव्य-कर्म करनेमें ही तेरा अधिकार है, फलोंमें कभी नहीं।');
  });

  it('strips combined-verse range markers', () => {
    expect(cleanTranslation('।।1.16 -- 1.18।। Some combined text.')).toBe('Some combined text.');
  });

  it('collapses internal whitespace', () => {
    expect(cleanTranslation('a\n\nb  c')).toBe('a b c');
  });
});

describe('sanskritLines', () => {
  it('splits lines, drops empties, keeps the closing danda without the number', () => {
    expect(sanskritLines('कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\n\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि।।2.47।।\n ')).toEqual([
      'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।',
      'मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि।।',
    ]);
  });

  it('keeps the speaker line', () => {
    expect(sanskritLines('धृतराष्ट्र उवाच\n\nधर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः।\n\nमामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय।।1.1।।\n ')[0]).toBe('धृतराष्ट्र उवाच');
  });
});
