const { defineConfig } = require('@playwright/test');
const { existsSync } = require('node:fs');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', launchOptions: { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] }, screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'node scripts/build-site.js && python3 -m http.server 4173 --bind 127.0.0.1 --directory public', url: 'http://127.0.0.1:4173', env: { VERCEL_ENV: 'development' } },
});
