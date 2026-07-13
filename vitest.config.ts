import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/main/**/*.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
      },
    },
  },
});
