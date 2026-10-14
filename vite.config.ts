import { defineConfig, type Plugin, type Rollup } from 'vite';
import glsl from 'vite-plugin-glsl';
import { palette } from './src/core/palette.ts';

const SITE = 'https://dyseugenian.github.io/';
const LANGUAGES = ['en', 'ru'] as const;
const RUSSIAN_SPEAKING = /^(ru|be|kk)\b/i;

type Language = (typeof LANGUAGES)[number];

export default defineConfig(({ command }) => ({
  plugins: [paletteAsCssVariables(), languagePages(), glsl({ minify: command === 'build' })],
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
      { tag: 'style', injectTo: 'head', children: `:root { ${variables} background: var(--bg); }` },
    ],
  };
}

function languagePages(): Plugin {
  return {
    name: 'language-pages',
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, { server, originalUrl = '/' }) => {
        if (!server) return html;
        const language = /^\/(en|ru)(?=[/?#]|$)/.exec(originalUrl)?.[1] as Language | undefined;
        return localize(html, language ?? null);
      },
    },
    generateBundle(_, bundle) {
      const index = bundle['index.html'] as Rollup.OutputAsset;
      const html = String(index.source);
      for (const language of LANGUAGES) {
        this.emitFile({
          type: 'asset',
          fileName: `${language}/index.html`,
          source: localize(html, language),
        });
      }
      index.source = localize(html, null);
    },
  };
}

function localize(html: string, language: Language | null): string {
  const shown = language ?? 'en';
  const page = html
    .replace(/\s*<li data-only="(\w+)">.*?<\/li>/g, (item, only) =>
      only === shown ? item.replace(` data-only="${only}"`, '') : '',
    )
    .replace(
      `<link rel="canonical" href="${SITE}" />`,
      `<link rel="canonical" href="${SITE}${shown}/" />`,
    )
    .replace(`property="og:url" content="${SITE}"`, `property="og:url" content="${SITE}${shown}/"`);
  if (language) return page;
  const redirect = `location.replace((${RUSSIAN_SPEAKING}.test(navigator.language) ? '/ru/' : '/en/') + location.search + location.hash);`;
  return page.replace(
    '<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n    <script>${redirect}</script>`,
  );
}
