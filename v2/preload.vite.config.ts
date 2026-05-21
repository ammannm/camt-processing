import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'node20',
    ssr: true,
    outDir: 'dist/preload',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron'],
      input: { index: path.resolve(__dirname, 'src/preload/index.ts') },
      output: { entryFileNames: '[name].js', format: 'cjs' }
    },
    lib: {
      entry: path.resolve(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    }
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
});
