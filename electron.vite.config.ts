import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'node20',
    ssr: true,
    outDir: 'dist/main',
    emptyOutDir: false,
    rollupOptions: {
      external: [
        'electron',
        'fs',
        'path',
        'os',
        'util',
        'zlib',
        'http',
        'https',
        'stream',
        'events'
      ],
      input: {
        index: path.resolve(__dirname, 'src/main/index.ts')
      },
      output: {
        entryFileNames: '[name].js',
        format: 'cjs'
      }
    },
    lib: {
      entry: path.resolve(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
