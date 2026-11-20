import { test, expect } from '@playwright/test';

test('phone layout, rhythm controls, accents and help', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your pocket.' })).toBeVisible();
  await page.locator('#faster').click();
  await expect(page.locator('#bpm')).toHaveValue('81');
  await page.locator('#signature').selectOption('6/8');
  await expect(page.locator('.beat')).toHaveCount(6);
  await page.locator('[data-sub="4"]').click();
  await expect(page.locator('[data-sub="4"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.beat').first().click();
  await expect(page.locator('.beat').first()).toHaveClass(/muted/);
  await page.locator('#help').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.locator('#got-it').click();
  await expect(page.locator('#help-dialog')).not.toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/home-${test.info().project.name}.png`, fullPage: true });
});

test('metronome starts, progresses, ramps and stops', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows Playwright WebKit is built without Web Audio.');
  await page.goto('/');
  await page.locator('#listen').uncheck();
  await page.locator('#bpm').fill('230');
  await page.locator('#bpm').blur();
  await page.locator('#signature').selectOption('2/4');
  await page.locator('#ramp').check();
  await page.locator('#ramp-amount').fill('10');
  await page.locator('#ramp-bars').fill('1');
  await page.locator('#ramp-target').fill('240');
  await page.locator('#ramp-target').blur();
  await page.locator('#start').click();
  await expect(page.locator('#start')).toContainText('Stop practice');
  await expect.poll(async () => Number((await page.locator('#transport-status').textContent()).match(/BAR (\d+)/)?.[1] || 0), { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#bpm')).toHaveValue('240');
  await expect(page.locator('#signature')).toBeDisabled();
  await page.locator('#start').click();
  await expect(page.locator('#start')).toContainText('Start practice');
  await expect(page.locator('#signature')).toBeEnabled();
  await expect(page.locator('.beat.active')).toHaveCount(0);
});

test('microphone denial preserves metronome playback', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows Playwright WebKit is built without Web Audio.');
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#notice')).toContainText('Microphone access was not allowed');
  await expect(page.locator('#start')).toContainText('Stop practice');
  await expect(page.locator('#mic-status')).toContainText('microphone off');
  await page.locator('#start').click();
});

test('cancel during permission request cleans up and allows another start', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows Playwright WebKit is built without Web Audio.');
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve, reject) => {
      window.rejectMic = () => reject(new DOMException('Denied', 'NotAllowedError'));
    });
  });
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#mic-status')).toContainText('Allow microphone');
  await page.locator('#start').click();
  await expect(page.locator('#start')).toBeDisabled();
  await page.evaluate(() => window.rejectMic());
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#start')).toContainText('Start practice');
  await page.locator('#listen').uncheck();
  await page.locator('#start').click();
  await expect(page.locator('#start')).toContainText('Stop practice');
  await page.locator('#start').click();
});

test('installed shell loads offline including hit detector and icons', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows WebKit runner fails offline navigation with an internal error; verify this on physical iOS.');
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#start')).toContainText('Start practice');
  const statuses = await page.evaluate(async () => Promise.all(['/hit-worklet.js', '/onset-detector.js', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'].map(async url => (await fetch(url)).status)));
  expect(statuses).toEqual([200, 200, 200, 200, 200]);
  await page.locator('#listen').uncheck();
  await page.locator('#start').click();
  await expect(page.locator('#start')).toContainText('Stop practice');
  await page.locator('#start').click();
});

test('real worklet detects synthetic microphone strokes and releases the track', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic MediaStream destination is validated in Chromium; physical Safari capture needs device testing.');
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      window.syntheticTrack = dest.stream.getAudioTracks()[0];
      window.syntheticContext = ctx;
      for (let i = 0; i < 12; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const time = ctx.currentTime + 0.5 + i * 0.5;
        osc.frequency.value = 1800;
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
        osc.connect(gain).connect(dest);
        osc.start(time); osc.stop(time + 0.04);
      }
      return dest.stream;
    };
  });
  await page.goto('/');
  await page.locator('#bpm').fill('120');
  await page.locator('#bpm').blur();
  await page.locator('#start').click();
  await expect(page.locator('#mic-status')).toContainText('Listening to your pad');
  await expect.poll(async () => Number(await page.locator('#hits-stat').textContent()), { timeout: 8000 }).toBeGreaterThan(2);
  await expect(page.locator('#hit-marker')).toBeVisible();
  if (test.info().project.name === 'chromium-mobile') {
    const box = await page.locator('#result-label').boundingBox();
    expect(box.y + box.height).toBeLessThan(page.viewportSize().height);
    await page.screenshot({ path: 'test-results/live-mobile.png', fullPage: true });
  }
  await page.locator('#start').click();
  expect(await page.evaluate(() => window.syntheticTrack.readyState)).toBe('ended');
  await page.evaluate(() => window.syntheticContext.close());
});

test('service worker pre-caches the complete application', async ({ page }) => {
  await page.goto('/');
  const paths = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const name = (await caches.keys()).find(key => key.startsWith('pocket-time-'));
    return (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname);
  });
  for (const path of ['/', '/hit-worklet.js', '/onset-detector.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']) expect(paths).toContain(path);
  expect(paths.some(path => path.endsWith('.css'))).toBe(true);
  expect(paths.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true);
});

test('unsupported audio is explained without leaving transport locked', async ({ page }) => {
  await page.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#notice')).toContainText('does not support Web Audio');
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#signature')).toBeEnabled();
});
