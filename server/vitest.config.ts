import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false, // all files share one database
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/lucky_test',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
      BUY_CUTOFF_SECONDS: '30',
      PACKAGES_CACHE_MS: '0',
      OTP_RESEND_SECONDS: '0',
      ADMIN_USERNAME: '9999999999',
      ADMIN_PASSWORD: 'Admin@12345',
      TRUST_PROXY: '0', // the server's real .env (behind Caddy) sets 1; tests must not inherit it
    },
  },
});
