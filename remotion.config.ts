import { Config } from '@remotion/cli/config';
import { webpack } from '@remotion/bundler';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Heavy VP9 background decode can starve tabs; give delayRender (fonts, video) headroom.
Config.setDelayRenderTimeoutInMilliseconds(120000);

// shared/backgrounds.ts is shared between the Node.js pipeline (fs-based pool listing)
// and the browser-bundled Background.tsx (which only uses the pure IMAGE_EXT/kenBurnsVariant
// exports). The browser bundle target has no handler for the `node:` URI scheme, and that
// scheme is detected before resolve.alias/fallback ever run, so a plain fallback can't reach
// it — rewrite node:fs/node:path to their bare specifiers first (beforeResolve, same stage
// IgnorePlugin uses), then let resolve.fallback resolve those bare specifiers to webpack's
// built-in empty module. The fs-backed functions are never called from browser code.
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
