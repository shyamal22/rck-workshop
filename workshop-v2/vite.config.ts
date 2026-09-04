import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './' keeps every asset path relative, so the same build serves from
// GitHub Pages under /rck-workshop/workshop-v2/ or from any other folder.
export default defineConfig({
  plugins: [preact()],
  base: './',
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['src/**/*.test.ts'] }
});
