import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, type ReelProps } from '../shared/types.ts';
import './fonts.ts';
import { Background } from './components/Background.tsx';
import { RadialScrim } from './components/RadialScrim.tsx';
import { Kicker } from './components/Kicker.tsx';
import { BeatCard } from './components/BeatCard.tsx';
import { ClosingCard } from './components/ClosingCard.tsx';

export const CinemaReel: React.FC<ReelProps> = (p) => {
  const frame = useCurrentFrame();
  const c = p.cinema!;
  const s = (sec: number) => Math.round(sec * FPS);

  const musicVolume = (f: number) => {
    const t = f / FPS;
    return (
      interpolate(t, [0, 1.2], [0, 0.30], { extrapolateRight: 'clamp' }) *
      interpolate(t, [c.timings.totalSec - 2.2, c.timings.totalSec], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    );
  };
  const blackout = interpolate(frame / FPS, [c.timings.totalSec - 0.5, c.timings.totalSec], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0817' }}>
      <Background media={p.media} seed={`${p.verse.ref}:${p.media.background ?? ''}`} />
      <RadialScrim />
      <Kicker text={c.kicker} inSec={c.timings.kickerInSec} handle={p.brand.handle} />
      {c.beats.map((b, i) => (
        <Sequence key={i} from={s(c.timings.beats[i].startSec)} durationInFrames={s(c.timings.beats[i].durSec)}>
          <BeatCard text={b} durSec={c.timings.beats[i].durSec} fadeSec={c.timings.crossfadeSec} />
        </Sequence>
      ))}
      <Sequence from={s(c.timings.closingStartSec)}>
        <ClosingCard verse={p.verse} handle={p.brand.handle} />
      </Sequence>
      {p.media.music && <Audio src={staticFile(p.media.music)} volume={musicVolume} loop />}
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: blackout, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
