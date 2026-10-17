import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: true, port: 5174 },
  build: { outDir: 'dist', target: 'es2020', sourcemap: false },
});
