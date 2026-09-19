import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@planmo\/([a-z-]+)$/,
        replacement: (match: string) =>
          `${root}packages/${match.slice('@planmo/'.length)}/src/index.ts`,
      },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
