import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types.ts';
import type { ReelStyle } from '../../shared/reel-style.ts';
import { kickerFamilyFor } from '../../shared/font-map.ts';

export const Kicker: React.FC<{ text: string; inSec: number; handle: string; style: ReelStyle }> = ({
  text, inSec, handle, style,
}) => {
  const t = useCurrentFrame() / FPS;
  const opacity = interpolate(t, [0.2, 0.2 + inSec], [0, 1], {
    extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  if (!style.showKicker && !style.showHandle) return null;
  return (
    <>
      {style.showKicker && (
        <div style={{
          position: 'absolute', top: 150, width: '100%', textAlign: 'center', opacity,
          fontFamily: kickerFamilyFor(style.kickerFont), fontSize: 34, letterSpacing: 14, color: style.accentColor,
          textShadow: '0 2px 18px rgba(0,0,0,0.85)',
        }}>
          {text}
        </div>
      )}
      {style.showHandle && (
        <div style={{
          position: 'absolute', top: 70, width: '100%', textAlign: 'center', opacity: opacity * 0.75,
          fontFamily: kickerFamilyFor(style.kickerFont), fontSize: 22, letterSpacing: 6, color: '#f5efe0',
          textShadow: '0 2px 14px rgba(0,0,0,0.85)',
        }}>
          {handle}
        </div>
      )}
    </>
  );
};
