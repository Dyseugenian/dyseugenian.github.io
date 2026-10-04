import { defineConfig, type Plugin } from 'vite';
import glsl from 'vite-plugin-glsl';
import { palette } from './src/core/palette.ts';

export default defineConfig(({ command }) => ({
  plugins: [paletteAsCssVariables(), glsl({ minify: command === 'build' })],
  build: {
    chunkSizeWarningLimit: 800,
  },
}));

function paletteAsCssVariables(): Plugin {
  const toKebabCase = (name: string) => name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  const variables = Object.entries(palette)
    .map(([name, color]) => `--${toKebabCase(name)}: ${color};`)
    .join(' ');

  return {
    name: 'palette-as-css-variables',
    transformIndexHtml: () => [
      { tag: 'meta', injectTo: 'head', attrs: { name: 'theme-color', content: palette.bg } },
      { tag: 'style', injectTo: 'head', children: `:root { ${variables} }` },
    ],
  };
}
