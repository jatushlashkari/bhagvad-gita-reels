import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types.ts';
import type { ReelStyle } from '../../shared/reel-style.ts';
import { fontFamilyFor } from '../../shared/font-map.ts';

export const BeatCard: React.FC<{ text: string; durSec: number; fadeSec: number; style: ReelStyle }> = ({
  text, durSec, fadeSec, style,
}) => {
  const t = useCurrentFrame() / FPS;
  const opacity =
    interpolate(t, [0, fadeSec], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) }) *
    interpolate(t, [durSec - fadeSec, durSec], [1, 0], { extrapolateLeft: 'clamp', easing: Easing.in(Easing.quad) });
  const rise = interpolate(t, [0, fadeSec], [14, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 110px', opacity, transform: `translateY(${rise}px)`,
    }}>
      <div style={{
        fontFamily: fontFamilyFor(style.beatFont), fontSize: style.beatSizePx, lineHeight: 1.28,
        color: style.textColor, textAlign: 'center',
        textTransform: 'none', textShadow: '0 3px 28px rgba(0,0,0,0.9)',
      }}>
        {text}
      </div>
    </div>
  );
};
