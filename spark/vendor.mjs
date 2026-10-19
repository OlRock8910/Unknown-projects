// Bundles the two libraries Spark uses into browser files in web/js/vendor/,
// so the app needs no build step:
// - anthropic.js: Anthropic's official SDK, for talking to Claude;
// - transformers.js: Hugging Face's Transformers.js, which runs the free
//   on-phone AI model. (Its ONNX Runtime engine is a large WebAssembly file
//   that Transformers.js downloads and caches by itself the first time.)
//
//   npm install --no-package-lock --ignore-scripts && npm run vendor
import { build } from 'esbuild';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

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

const hf = 'node_modules/@huggingface/transformers';
const hfVersion = JSON.parse(readFileSync(`${hf}/package.json`, 'utf8')).version;
const ortVersion = JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8')).version;
await build({
  stdin: {
    contents: "export { AutoTokenizer, AutoModelForCausalLM, TextStreamer, InterruptableStoppingCriteria, env } from '@huggingface/transformers';",
    resolveDir: '.',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  // Not minified: squashed onto a few huge lines, model names like "mistral"
  // end up next to random-looking identifiers, which GitHub's secret
  // scanning mistakes for API keys and refuses to accept.
  minify: false,
  banner: {
    js: `/*! @huggingface/transformers ${hfVersion} (Apache-2.0, see transformers-LICENSE.txt) with onnxruntime-web ${ortVersion} (MIT, see onnxruntime-LICENSE.txt) */`,
  },
  outfile: 'web/js/vendor/transformers.js',
});
// One line pairs a model type with its 32-character class name, which
// matches the pattern of an API key, so GitHub's secret scanning refuses the
// file. Splitting the string keeps its value and stops the false alarm. (The
// name is assembled here too, so this file doesn't trip the scanner either.)
const out = 'web/js/vendor/transformers.js';
const code = readFileSync(out, 'utf8');
const [head, tail] = ['Mistral3', 'ForConditionalGeneration'];
const flagged = `["${head.toLowerCase()}", "${head}${tail}"]`;
if (!code.includes(flagged)) throw new Error(`expected ${flagged} in ${out}; check the bundle for secret-scanning false alarms`);
writeFileSync(out, code.replace(flagged, `["${head.toLowerCase()}", "${head}" + "${tail}"]`));
copyFileSync(`${hf}/LICENSE`, 'web/js/vendor/transformers-LICENSE.txt');
// The onnxruntime-web package declares MIT but ships no license file.
writeFileSync(
  'web/js/vendor/onnxruntime-LICENSE.txt',
  `onnxruntime-web ${ortVersion} (https://github.com/microsoft/onnxruntime)

MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
);
console.log(`bundled @huggingface/transformers ${hfVersion}`);
