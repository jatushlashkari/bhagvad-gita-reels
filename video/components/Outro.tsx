import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS, type ReelProps, type Timings } from '../../shared/types.ts';
import { DEVANAGARI } from '../fonts.ts';

export const Outro: React.FC<{ brand: ReelProps['brand']; timings: Timings }> = ({ brand, timings }) => {
  const t = useCurrentFrame() / FPS; // relative to outroStartSec

  const fadeIn = interpolate(t, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const scale = interpolate(t, [0, timings.outroSec], [1, 1.04], {
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 96px' }}>
      <div style={{ textAlign: 'center', opacity: fadeIn, transform: `scale(${scale})` }}>
        <div
          style={{
            fontFamily: DEVANAGARI,
            fontWeight: 700,
            fontSize: 64,
            color: '#f5efe0',
            textShadow: '0 2px 24px rgba(0,0,0,0.8)',
          }}
        >
          रोज़ एक श्लोक 🙏
        </div>
        <div
          style={{
            fontFamily: DEVANAGARI,
            fontWeight: 400,
            fontSize: 44,
            color: '#e8c874',
            marginTop: 32,
            textShadow: '0 2px 24px rgba(0,0,0,0.8)',
          }}
        >
          Follow करें • {brand.handle}
        </div>
      </div>
    </AbsoluteFill>
  );
};
