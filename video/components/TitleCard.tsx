import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS, type Timings, type Verse } from '../../shared/types.ts';
import { DEVANAGARI } from '../fonts.ts';

export const TitleCard: React.FC<{ verse: Verse; timings: Timings }> = ({ verse, timings }) => {
  const t = useCurrentFrame() / FPS;

  const appear = interpolate(t, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const rise = interpolate(t, [0, 0.7], [30, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // After the title moment, dock as a compact header at the top.
  const dock = interpolate(t, [timings.shlokaStartSec - 0.3, timings.shlokaStartSec + 0.7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const fadeOut = interpolate(
    t,
    [timings.outroStartSec - 0.7, timings.outroStartSec],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const translateY = rise + dock * -700;
  const scale = 1 - dock * 0.55;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          textAlign: 'center',
          opacity: appear * fadeOut,
          transform: `translateY(${translateY}px) scale(${scale})`,
        }}
      >
        <div
          style={{
            fontFamily: DEVANAGARI,
            fontWeight: 700,
            fontSize: 88,
            color: '#e8c874',
            textShadow: '0 2px 24px rgba(0,0,0,0.8)',
            letterSpacing: 1,
          }}
        >
          श्रीमद्भगवद्गीता
        </div>
        <div
          style={{
            fontFamily: DEVANAGARI,
            fontWeight: 400,
            fontSize: 48,
            color: '#f5efe0',
            marginTop: 28,
            textShadow: '0 2px 24px rgba(0,0,0,0.8)',
          }}
        >
          अध्याय {verse.chapter} • श्लोक {verse.verse}
        </div>
      </div>
    </AbsoluteFill>
  );
};
