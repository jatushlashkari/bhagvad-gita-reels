import { AbsoluteFill } from 'remotion';
export const RadialScrim: React.FC = () => (
  <AbsoluteFill
    style={{
      background: 'radial-gradient(ellipse 85% 55% at 50% 52%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 100%)',
    }}
  />
);
