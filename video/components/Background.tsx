import { AbsoluteFill, Img, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FPS, type ReelProps } from '../../shared/types.ts';
import { IMAGE_EXT, kenBurnsVariant } from '../../shared/backgrounds.ts';

// Every background is normalized to exactly 12s/30fps at fetch time (scripts/fetch-assets.ts).
const BG_CLIP_FRAMES = 12 * FPS;

export const Background: React.FC<{ media: ReelProps['media']; seed: string }> = ({ media, seed }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const isImage = media.background ? IMAGE_EXT.test(media.background) : false;

  return (
    <AbsoluteFill>
      {media.background && isImage ? (
        <KenBurnsImage src={staticFile(media.background)} seed={seed} />
      ) : media.background ? (
        // OffthreadVideo: frames are extracted by ffmpeg outside the browser —
        // render tabs never decode video (in-browser decode starved 2-core CI runners).
        <Loop durationInFrames={BG_CLIP_FRAMES}>
          <OffthreadVideo
            src={staticFile(media.background)}
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Loop>
      ) : (
        <AbsoluteFill
          style={{
            background: `linear-gradient(${170 + interpolate(t % 40, [0, 40], [0, 20])}deg, #1a1033 0%, #2a0f2e 55%, #3d0f1e 100%)`,
          }}
        >
          <AbsoluteFill
            style={{
              background:
                'radial-gradient(ellipse 80% 45% at 50% 12%, rgba(232,200,116,0.16), transparent 70%)',
              opacity: interpolate(Math.sin((t / 9) * Math.PI * 2), [-1, 1], [0.7, 1]),
            }}
          />
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.75) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

const KenBurnsImage: React.FC<{ src: string; seed: string }> = ({ src, seed }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const v = kenBurnsVariant(seed);
  const t = interpolate(frame, [0, durationInFrames], [0, 1]);
  const scale = v === 2 ? 1.16 - 0.1 * t : 1.06 + 0.1 * t; // variant 2 zooms out
  const tx = v === 0 ? -2.5 * t : v === 1 ? 2.5 * t : 0;    // % of width
  const ty = v === 3 ? -2.0 * t : v === 2 ? 1.5 * t : 0;    // % of height
  return (
    <Img
      src={src}
      style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
      }}
    />
  );
};
