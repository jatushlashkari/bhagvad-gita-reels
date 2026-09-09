import { AbsoluteFill } from 'remotion';
import type { ReelStyle } from '../../shared/reel-style.ts';

export const RadialScrim: React.FC<{ style: ReelStyle }> = ({ style }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 85% 55% at 50% 52%, rgba(0,0,0,${style.scrimStrength}) 0%, rgba(0,0,0,${style.scrimStrength * 0.62}) 55%, rgba(0,0,0,0) 100%)`,
    }}
  />
);
