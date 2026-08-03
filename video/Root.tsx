import { Composition } from 'remotion';
import { GitaReel } from './GitaReel.tsx';
import { FPS, HEIGHT, WIDTH, type ReelProps } from '../shared/types.ts';
import fixture from '../fixtures/props-2-47.json';

export const Root: React.FC = () => (
  <Composition
    id="GitaReel"
    component={GitaReel}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={30 * 35}
    defaultProps={fixture as ReelProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.round(props.timings.totalSec * FPS),
    })}
  />
);
