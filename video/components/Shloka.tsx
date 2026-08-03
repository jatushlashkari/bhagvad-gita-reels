import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS, type Timings } from '../../shared/types.ts';
import { DEVANAGARI } from '../fonts.ts';

export const Shloka: React.FC<{ lines: string[]; timings: Timings }> = ({ lines, timings }) => {
  const t = useCurrentFrame() / FPS; // relative to sequence start

  const sectionFade = interpolate(
    t,
    [timings.shlokaSec - 0.7, timings.shlokaSec],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const revealWindow = (timings.shlokaSec * 0.6) / lines.length;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 96px' }}>
      <div style={{ textAlign: 'center', opacity: sectionFade }}>
        {lines.map((line, i) => {
          const start = i * revealWindow;
          const opacity = interpolate(t, [start, start + 0.6], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          });
          const y = interpolate(t, [start, start + 0.6], [24, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          });
          const isSpeaker = line.endsWith('उवाच');
          return (
            <div
              key={i}
              style={{
                fontFamily: DEVANAGARI,
                fontWeight: 400,
                fontSize: isSpeaker ? 44 : 60,
                color: isSpeaker ? '#cbb87a' : '#f5efe0',
                lineHeight: 1.7,
                marginBottom: isSpeaker ? 24 : 0,
                opacity,
                transform: `translateY(${y}px)`,
                textShadow: '0 2px 24px rgba(0,0,0,0.8)',
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
