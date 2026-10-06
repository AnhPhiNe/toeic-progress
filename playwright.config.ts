import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3100 --strictPort',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_API_URL: '' },
    timeout: 60_000
  }
});
