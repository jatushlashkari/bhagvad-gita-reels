import { AbsoluteFill, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, type ReelProps } from '../../shared/types.ts';

// Every background is normalized to exactly 12s/30fps at fetch time (scripts/fetch-assets.ts).
const BG_CLIP_FRAMES = 12 * FPS;

export const Background: React.FC<{ media: ReelProps['media'] }> = ({ media }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  return (
    <AbsoluteFill>
      {media.background ? (
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
