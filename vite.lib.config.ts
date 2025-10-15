import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NeuroEngine',
      formats: ['es', 'iife'],
      fileName: (format) => `engine.${format}.js`,
    },
    rollupOptions: {
      external: ['three','cannon-es','meshoptimizer','tweakpane'],
      output: {
        globals: {
          'three': 'THREE',
          'cannon-es': 'CANNON',
          'tweakpane': 'Tweakpane'
        }
      }
    }
  }
});
