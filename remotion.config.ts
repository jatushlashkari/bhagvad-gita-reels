import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Heavy VP9 background decode can starve tabs; give delayRender (fonts, video) headroom.
Config.setDelayRenderTimeoutInMilliseconds(120000);
