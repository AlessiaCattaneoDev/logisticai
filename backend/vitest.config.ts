import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/globalSetup.ts'],
    testTimeout: 15_000,
  },
});
