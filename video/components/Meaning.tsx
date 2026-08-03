import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS, type Timings, type Verse } from '../../shared/types.ts';
import { DEVANAGARI, LATIN } from '../fonts.ts';

export const Meaning: React.FC<{ verse: Verse; timings: Timings }> = ({ verse, timings }) => {
  const t = useCurrentFrame() / FPS; // relative to meaningStartSec

  const sectionEnd = timings.outroStartSec - timings.meaningStartSec;
  const englishAt = timings.englishStartSec - timings.meaningStartSec;

  const fadeIn = interpolate(t, [0, 0.7], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(t, [sectionEnd - 0.7, sectionEnd], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const englishIn = interpolate(t, [englishAt, englishAt + 0.7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', padding: '0 96px', opacity: fadeOut }}
    >
      <div style={{ textAlign: 'center', opacity: fadeIn }}>
        <div
          style={{
            fontFamily: DEVANAGARI,
            fontWeight: 700,
            fontSize: 40,
            color: '#e8c874',
            letterSpacing: 2,
            marginBottom: 40,
            textShadow: '0 2px 24px rgba(0,0,0,0.8)',
          }}
        >
          अर्थ
        </div>
        <div
          style={{
            fontFamily: DEVANAGARI,
            fontWeight: 400,
            fontSize: 52,
            color: '#f5efe0',
            lineHeight: 1.65,
            textShadow: '0 2px 24px rgba(0,0,0,0.8)',
          }}
        >
          {verse.hindi}
        </div>
        <div
          style={{
            fontFamily: LATIN,
            fontWeight: 400,
            fontSize: 40,
            color: '#d8d2c4',
            lineHeight: 1.55,
            marginTop: 48,
            opacity: englishIn,
            textShadow: '0 2px 24px rgba(0,0,0,0.8)',
          }}
        >
          {verse.english}
        </div>
      </div>
    </AbsoluteFill>
  );
};
