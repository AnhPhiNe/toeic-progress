import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets several runs (e.g. parallel agents) use their own dev server.
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    // VITE_GUIDE_TIPS=off: first-visit page tips stay hidden; guide.spec.ts turns them on with window.__GUIDE_TIPS__.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_API_URL: '', VITE_GUIDE_TIPS: 'off' },
    timeout: 60_000
  }
});
