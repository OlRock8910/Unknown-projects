// Bundles Anthropic's official SDK (the version in package.json) into one
// browser file, web/js/vendor/anthropic.js, so the app needs no build step.
//
//   npm install --no-package-lock && npm run vendor
import { build } from 'esbuild';
import { copyFileSync, readFileSync } from 'node:fs';

const sdk = 'node_modules/@anthropic-ai/sdk';
const { version } = JSON.parse(readFileSync(`${sdk}/package.json`, 'utf8'));

await build({
  stdin: { contents: "export { default, default as Anthropic } from '@anthropic-ai/sdk';", resolveDir: '.' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  banner: { js: `/*! @anthropic-ai/sdk ${version} | MIT License, Copyright 2023 Anthropic, PBC | see anthropic-LICENSE.txt */` },
  outfile: 'web/js/vendor/anthropic.js',
});
copyFileSync(`${sdk}/LICENSE`, 'web/js/vendor/anthropic-LICENSE.txt');
console.log(`bundled @anthropic-ai/sdk ${version}`);
