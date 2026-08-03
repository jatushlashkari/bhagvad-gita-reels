import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, type ReelProps } from '../shared/types.ts';
import './fonts.ts';
import { Background } from './components/Background.tsx';
import { TitleCard } from './components/TitleCard.tsx';
import { Shloka } from './components/Shloka.tsx';
import { Meaning } from './components/Meaning.tsx';
import { Outro } from './components/Outro.tsx';

export const GitaReel: React.FC<ReelProps> = (p) => {
  const frame = useCurrentFrame();
  const s = (sec: number) => Math.round(sec * FPS);

  const musicVolume = (f: number) => {
    const t = f / FPS;
    const inVoice =
      (t >= p.timings.introAudioStartSec && t <= p.timings.introAudioStartSec + 4) ||
      (t >= p.timings.meaningAudioStartSec && t <= p.timings.englishStartSec);
    const target = inVoice ? 0.1 : 0.28; // duck under narration
    const fadeOut = interpolate(t, [p.timings.totalSec - 2, p.timings.totalSec], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return target * fadeOut;
  };

  const blackout = interpolate(
    frame / FPS,
    [p.timings.totalSec - 0.7, p.timings.totalSec],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0817' }}>
      <Background media={p.media} />
      <TitleCard verse={p.verse} timings={p.timings} />
      <Sequence from={s(p.timings.shlokaStartSec)} durationInFrames={s(p.timings.shlokaSec)}>
        <Shloka lines={p.verse.sanskrit} timings={p.timings} />
      </Sequence>
      <Sequence from={s(p.timings.meaningStartSec)}>
        <Meaning verse={p.verse} timings={p.timings} />
      </Sequence>
      <Sequence from={s(p.timings.outroStartSec)}>
        <Outro brand={p.brand} timings={p.timings} />
      </Sequence>
      {p.media.music && <Audio src={staticFile(p.media.music)} volume={musicVolume} loop />}
      {p.audio.introFile && (
        <Sequence from={s(p.timings.introAudioStartSec)}>
          <Audio src={staticFile(p.audio.introFile)} />
        </Sequence>
      )}
      {p.audio.meaningFile && (
        <Sequence from={s(p.timings.meaningAudioStartSec)}>
          <Audio src={staticFile(p.audio.meaningFile)} />
        </Sequence>
      )}
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: blackout, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
