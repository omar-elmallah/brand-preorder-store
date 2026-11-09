// Optional browser integration test. Production has no npm dependencies.
// Requires Playwright and Chromium: npm install --no-save playwright
// Start a fresh isolated preview automatically; no Google connection or real orders.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { console.error('Optional check requires Playwright: npm install --no-save playwright && npx playwright install chromium'); process.exit(1); }

async function main() {
  const preview = spawn(process.execPath, [path.join(__dirname, 'preview.cjs')], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', ...(process.argv.includes('--ready')?{BRAND_STORE_SOURCE_DIR:path.join(__dirname,'../apps-script-ready')}:{}) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  try {
    const base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Preview startup timed out.')), 10000);
      preview.stdout.on('data', chunk => {
        output += String(chunk);
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      preview.stderr.on('data', chunk => { output += String(chunk); });
      preview.once('error', error => { clearTimeout(timer); reject(error); });
      preview.once('exit', code => { clearTimeout(timer); reject(new Error('Preview exited (' + code + '): ' + output)); });
    });
    const launch = { headless: true, args: ['--no-sandbox'] };
    const installedBrowser = process.env.CHROMIUM_EXECUTABLE || ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(file => fs.existsSync(file));
    if (installedBrowser) launch.executablePath = installedBrowser;
    browser = await chromium.launch(launch);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.storeEvents = [];
      window.addEventListener('store:analytics', event => window.storeEvents.push(event.detail));
    });
    const payloads = [];
    let lostResponse = false;
    let catalog;
    await page.route('**/rpc', async route => {
      const request = route.request().postDataJSON();
      if (request.name === 'getCatalog') {
        const response = await route.fetch();
        catalog = (await response.json()).data;
        return route.fulfill({ response });
      }
      if (request.name === 'submitOrder') {
        payloads.push(request.payload);
        if (!lostResponse) {
          lostResponse = true;
          // Commit on the real local .gs engine, then deliberately discard its response.
          await route.fetch();
          return route.abort('failed');
        }
      }
      return route.continue();
    });
    await page.goto(base + '/?utm_source=browser-check&utm_campaign=retry-check');
    await page.waitForFunction(() => !document.getElementById('orderFields').disabled);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'No horizontal mobile overflow');
    assert.equal(Number(await page.locator('#quantity').getAttribute('max')), Number(catalog.checkout.max_order_qty || 5));
    if (process.env.BRAND_STORE_SCREENSHOTS) {
      const directory = path.resolve(process.env.BRAND_STORE_SCREENSHOTS);
      fs.mkdirSync(directory, { recursive: true });
      await page.screenshot({ path: path.join(directory, 'storefront-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1050 });
      await page.screenshot({ path: path.join(directory, 'storefront-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.getByRole('button', { name: 'برجندي', exact: true }).click();
    await page.getByRole('button', { name: 'مقاس M', exact: true }).click();
    await page.locator('#quantity').fill('2');
    await page.locator('#customerName').fill('اختبار إعادة الإرسال');
    await page.locator('#phone').fill('01022220004');
    await page.locator('#governorate').selectOption('demo-cairo');
    await page.locator('#city').fill('مدينة تجريبية');
    await page.locator('#address').fill('عنوان غير حقيقي لاختبار المتجر');
    assert.match(await page.locator('#total').innerText(), /١٬٣٦٠/);
    // The token's minimum form age is a real anti-abuse check, not disabled for this test.
    await page.waitForTimeout((Number(catalog.checkout.min_seconds) || 3) * 1000 + 100);
    await page.locator('#submitOrder').click();
    await page.locator('#retryOrder').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#orderFields').evaluate(node => node.disabled), true, 'Uncertain retry locks original payload');
    await page.locator('#retryOrder').click();
    await page.locator('#successPanel').waitFor({ state: 'visible' });
    const orderId = await page.locator('#successOrderId').innerText();
    assert.match(orderId, /^ORD-/);
    assert.equal(payloads.length, 2);
    assert.deepEqual(payloads[0], payloads[1], 'Retry keeps original idempotency key and payload');
    assert.equal(payloads[0].utm.source, 'browser-check');
    assert.equal(payloads[0].utm.campaign, 'retry-check');
    assert.equal(payloads[0].items[0].variant_id, 'demo-burgundy-M');
    assert.equal(payloads[0].items[0].quantity, 2);
    assert.equal(Object.hasOwn(payloads[0], 'total_minor'), false, 'Browser sends choices, not authoritative prices');
    async function rpc(name, payload) {
      const response = await page.request.post(base + '/rpc', { data: { name, payload } });
      const result = await response.json();
      assert.equal(result.ok, true, name + ' should succeed');
      return result.data;
    }
    const dashboard = await rpc('getAdminDashboard', { mode: 'demo' });
    assert.equal(dashboard.orders.length, 1, 'One order is committed after lost-response retry');
    assert.equal(dashboard.orders.filter(order => order.id === orderId).length, 1);
    const detail = await rpc('adminGetOrder', orderId);
    assert.equal(detail.order.mode, 'demo');
    assert.equal(detail.order.payment_status, 'unpaid');
    assert.equal(detail.order.total_minor, 136000);
    assert.equal(detail.items.length, 1);
    assert.equal(detail.items[0].quantity, 2);
    assert.equal(detail.items[0].color, 'burgundy');
    const events = await page.evaluate(() => window.storeEvents);
    assert.deepEqual(events.map(event => event.event), ['view_item', 'begin_checkout', 'order_submitted']);
    const analytics = JSON.stringify(events);
    assert.equal(analytics.includes('01022220004'), false);
    assert.equal(analytics.includes('اختبار إعادة الإرسال'), false);
    assert.equal(analytics.includes('عنوان غير حقيقي'), false);
    assert.deepEqual(errors, []);

    // Incomplete production catalog must remain viewable and block checkout.
    const blocked = await browser.newPage({ viewport: { width: 390, height: 844 } });
    blocked.on('pageerror', error => errors.push(error.message));
    await blocked.route('**/rpc', async route => {
      const request = route.request().postDataJSON();
      if (request.name !== 'getCatalog') return route.continue();
      const response = await route.fetch();
      const result = await response.json();
      result.data.product = null;
      result.data.variants = [];
      result.data.settings.test_mode = false;
      result.data.settings.orders_open = true;
      result.data.readiness = { ready: false, issues: ['المنتج غير جاهز.'] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await blocked.goto(base + '/');
    await blocked.locator('#launchNotice').waitFor({ state: 'visible' });
    assert.match(await blocked.locator('#launchNotice').innerText(), /المنتج قيد الإعداد/);
    assert.equal(await blocked.locator('#orderFields').evaluate(node => node.disabled), true);
    assert.equal(await blocked.locator('#submitOrder').isDisabled(), true);
    assert.equal(await blocked.evaluate(() => document.documentElement.scrollWidth), 390);
    assert.deepEqual(errors, []);
    console.log('Browser check passed: actual .gs demo checkout, accurate total, lost-response retry saved once, admin visibility, campaign parameters, no tracking PII, mobile layout, incomplete catalog blocked.');
  } finally {
    if (browser) await browser.close();
    preview.kill('SIGTERM');
    await new Promise(resolve => { if (preview.exitCode !== null) return resolve(); preview.once('exit', resolve); setTimeout(resolve, 3000).unref(); });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
