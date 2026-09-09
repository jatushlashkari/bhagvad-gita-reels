import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS, type Verse } from '../../shared/types.ts';
import type { ReelStyle } from '../../shared/reel-style.ts';
import { kickerFamilyFor } from '../../shared/font-map.ts';
import { DEVANAGARI } from '../fonts.ts';

export const ClosingCard: React.FC<{ verse: Verse; handle: string; style: ReelStyle }> = ({ verse, handle, style }) => {
  const t = useCurrentFrame() / FPS;
  const opacity = interpolate(t, [0, 0.5], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const shlokaLine = verse.sanskrit.find((l) => !l.endsWith('उवाच')) ?? verse.sanskrit[0];
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '0 96px', opacity, textAlign: 'center',
    }}>
      <div style={{ fontFamily: DEVANAGARI, fontSize: 46, lineHeight: 1.7, color: '#f5efe0', textShadow: '0 2px 24px rgba(0,0,0,0.9)' }}>
        {shlokaLine}
      </div>
      <div style={{ fontFamily: kickerFamilyFor(style.kickerFont), fontSize: 30, letterSpacing: 8, color: style.accentColor, marginTop: 44, textShadow: '0 2px 18px rgba(0,0,0,0.85)' }}>
        BHAGAVAD GITA {verse.chapter}.{verse.verse}
      </div>
      {style.showHandle && (
        <div style={{ fontFamily: kickerFamilyFor(style.kickerFont), fontSize: 24, letterSpacing: 4, color: '#f5efe0', opacity: 0.8, marginTop: 20 }}>
          {handle}
        </div>
      )}
    </div>
  );
};
