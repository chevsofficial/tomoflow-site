const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const pageErrors = new WeakMap();
test.afterEach(async ({ page }) => expect(pageErrors.get(page) || []).toEqual([]));
const clockStart = new Date('2026-11-06T12:00:00Z');
async function freeze(page) {
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
}
test.beforeEach(async ({ page }) => {
  pageErrors.set(page, []); page.on('pageerror', error => pageErrors.get(page).push(error.message));
  // Provider interactions are test doubles. Never create a real checkout or send mail.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4173') return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'No provider request is allowed in browser tests.' } });
    return route.continue();
  });
});
test('public pages fit the viewport and have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/', '/support.html', '/privacy.html', '/terms.html']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  }
});
test('Bitcoin support stays visible without exposing a placeholder payment address', async ({ page }) => {
  const qrRequests = [];
  page.on('request', request => { if (request.url().includes('qrserver.com')) qrRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('#tip')).toBeVisible();
  await page.locator('#tip summary').click();
  await expect(page.locator('#btcUnavailable')).toBeVisible();
  await expect(page.locator('#btcPayment')).toBeHidden();
  await expect(page.locator('#btcAddress')).toHaveText('');
  expect(await page.locator('#btcQr').getAttribute('src')).toBeNull();
  expect(qrRequests).toEqual([]);
});
test('timer paints once per second and preserves pause/settings progress', async ({ page }) => {
  await freeze(page); await page.goto('/');
  await page.locator('#cfgWork').fill('1'); await page.locator('#cfgWork').press('Tab');
  await page.locator('#btnStart').click();
  await page.evaluate(() => { window.paintCount = 0; new MutationObserver(() => window.paintCount++).observe(document.querySelector('#timerDisplay'), { childList: true }); });
  await page.clock.runFor(3000);
  await expect(page.locator('#timerDisplay')).toHaveText('00:57');
  expect(await page.evaluate(() => window.paintCount)).toBeLessThanOrEqual(4);
  await page.locator('#btnPause').click(); await page.clock.runFor(5000);
  await expect(page.locator('#timerDisplay')).toHaveText('00:57');
  await page.locator('#cfgBreak').fill('2'); await page.locator('#cfgBreak').press('Tab');
  await expect(page.locator('#timerDisplay')).toHaveText('00:57');
  await page.locator('#cfgWork').fill('2'); await page.locator('#cfgWork').press('Tab');
  await expect(page.locator('#timerDisplay')).toHaveText('02:00');
  await page.locator('#btnStart').click(); await page.clock.runFor(1000);
  await expect(page.locator('#timerDisplay')).toHaveText('01:59');
  await page.locator('#btnReset').click(); await expect(page.locator('#timerDisplay')).toHaveText('02:00');
});
test('returning after a suspended tab completes the overdue phase immediately', async ({ page }) => {
  await freeze(page); await page.goto('/');
  await page.locator('#cfgWork').fill('1'); await page.locator('#cfgWork').press('Tab');
  await page.locator('#btnStart').click();
  await page.clock.setSystemTime(new Date(clockStart.getTime() + 91000));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#modeLabel')).toHaveText('Short break');
  await expect(page.locator('#timerDisplay')).toHaveText('05:00');
  await expect(page.locator('#roundLabel')).toHaveText('Round 1 / 4');
});
test('hidden-tab rendering pauses, catches up on return, and work rounds reach a long break', async ({ page }) => {
  await freeze(page); await page.goto('/');
  await page.locator('#cfgWork').fill('1'); await page.locator('#cfgWork').press('Tab');
  await page.locator('#btnStart').click();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(10000);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#timerDisplay')).toHaveText('00:50');
  for (let round = 1; round <= 4; round++) {
    await page.locator('#btnSkip').click();
    await expect(page.locator('#roundLabel')).toHaveText(`Round ${round} / 4`);
    if (round < 4) await page.locator('#btnSkip').click();
  }
  await expect(page.locator('#modeLabel')).toHaveText('Long break');
});
test('free/Pro pickers and verified checkout/Restore UI work without provider calls', async ({ page }) => {
  await page.goto('/?pro=1&dev=1'); await expect(page.locator('#proBadge')).toBeHidden();
  await page.locator('#themeTrigger').click();
  await page.locator('[data-theme-id="sunset"]').click(); await expect(page.locator('#proBadge')).toBeHidden();
  await page.route('**/api/start-checkout', route => route.fulfill({ contentType: 'text/html', body: '<h1>Sandbox checkout test double</h1>' }));
  await page.locator('#btnUnlockPro').click();
  await expect(page.getByRole('heading')).toHaveText('Sandbox checkout test double');
  await page.route('**/api/unlock-pro', route => route.fulfill({ json: { unlocked: true } }));
  await page.goto('/?session_id=cs_test_browser');
  await expect(page.locator('#proBadge')).toBeVisible();
  await expect(page).not.toHaveURL(/session_id/);
  await page.locator('#themeTrigger').click(); await page.locator('[data-theme-id="sunset"]').click();
  await expect(page.locator('#themeTriggerName')).toHaveText('Sunset');
  await page.locator('#characterTrigger').click(); await page.locator('[data-character-id="moon"]').click();
  await expect(page.locator('#characterTriggerName')).toHaveText('Luna');
  await page.reload(); await expect(page.locator('#themeTriggerName')).toHaveText('Sunset');
  await page.evaluate(() => localStorage.clear()); await page.goto('/');
  await page.route('**/api/restore-pro', async route => {
    expect(route.request().postDataJSON()).toEqual({ email: 'buyer@example.test' });
    await route.fulfill({ json: { accepted: true, message: 'If a paid purchase matches, check your inbox.' } });
  });
  await page.locator('#restoreEmail').fill('buyer@example.test'); await page.locator('#btnRestorePro').click();
  await expect(page.locator('#toast')).toContainText('check your inbox');
  await page.goto('/#restore=browser-test-token');
  await expect(page.locator('#proBadge')).toBeHidden();
  await page.locator('#btnConfirmRestore').click(); await expect(page.locator('#proBadge')).toBeVisible();
});
test('picker keyboard navigation follows listbox conventions', async ({ page }) => {
  await page.goto('/'); await page.locator('#themeTrigger').click();
  await page.locator('#themeSearch').press('ArrowDown');
  await expect(page.locator('[data-theme-id="classic"]')).toBeFocused();
  await page.keyboard.press('End'); await expect(page.locator('[data-theme-id="neon"]')).toBeFocused();
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('#themeTriggerName')).toHaveText('Midnight');
  await expect(page.locator('#themeTrigger')).toBeFocused();
});
test('mobile menu is inert when closed, traps focus when open and returns focus on Escape', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/');
  expect(await page.locator('#drawer').evaluate(el => el.inert)).toBe(true);
  await page.locator('#navToggle').click(); await expect(page.locator('#drawerClose')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#drawerNav a').last()).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#drawerClose')).toBeFocused();
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.keyboard.press('Escape'); await expect(page.locator('#navToggle')).toBeFocused();
  await page.locator('#navToggle').click(); await page.locator('#drawerBackdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#navToggle')).toBeFocused();
  await page.locator('#navToggle').click(); await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('main').evaluate(el => el.inert)).toBe(false);
});
test('every theme and both expanded pickers meet contrast/ARIA checks', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => localStorage.setItem('tomoflow_pro', '1')); await page.reload();
  const ids = await page.evaluate(() => window.TOMOFLOW_THEMES.map(theme => theme.id));
  for (const id of ids) {
    await page.locator('#themeTrigger').click(); await page.locator(`[data-theme-id="${id}"]`).click();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.map(v => ({ id, rule: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  }
  await page.locator('#themeTrigger').click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape'); await page.locator('#characterTrigger').click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
test('confirmation and Restore HTML fit the viewport with centered text and readable buttons', async ({ page }) => {
  const fs = require('node:fs');
  const { restoreProEmail, purchaseConfirmationEmail } = require('../lib/email-brand');
  await page.route('https://www.tomoflow.app/assets/img/tomatoes/tomato-happy.png', route => route.fulfill({ contentType: 'image/png', body: fs.readFileSync('assets/img/tomatoes/tomato-happy.png') }));
  for (const mail of [restoreProEmail({ unlockUrl: 'https://www.tomoflow.app/#restore=render-test' }), purchaseConfirmationEmail({ session: { id: 'cs_test_render', amount_total: 2100, currency: 'usd', livemode: false } })]) {
    await page.setContent(mail.html);
    for (const paragraph of await page.locator('p').all()) await expect(paragraph).toHaveCSS('text-align', 'center');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  }
});
test('320px and 360px layouts do not overflow horizontally', async ({ page }) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 800 }); await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
