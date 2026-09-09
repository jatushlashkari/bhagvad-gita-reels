import { Config } from '@remotion/cli/config';
import { webpack } from '@remotion/bundler';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Heavy VP9 background decode can starve tabs; give delayRender (fonts, video) headroom.
Config.setDelayRenderTimeoutInMilliseconds(120000);

// video/components/Background.tsx imports the pure IMAGE_EXT/kenBurnsVariant exports straight
// from shared/background-kind.ts (not the fs-backed shared/backgrounds.ts) since that module was
// split out precisely so the browser bundle (Studio Player + the render's headless Chrome) never
// pulls in node:fs. This override is now defense-in-depth: a safety net in case some future
// change reintroduces an fs-backed import into that browser graph, rather than a dependency the
// split currently relies on. The browser bundle target has no handler for the `node:` URI scheme,
// and that scheme is detected before resolve.alias/fallback ever run, so a plain fallback can't
// reach it — rewrite node:fs/node:path to their bare specifiers first (beforeResolve, same stage
// IgnorePlugin uses), then let resolve.fallback resolve those bare specifiers to webpack's
// built-in empty module.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    fallback: {
      ...config.resolve?.fallback,
      fs: false,
      path: false,
    },
  },
  plugins: [
    ...(config.plugins ?? []),
    new webpack.NormalModuleReplacementPlugin(/^node:(fs|path)$/, (resource) => {
      resource.request = resource.request.replace(/^node:/, '');
    }),
  ],
}));
