// Screenshots for "Sóc đa dạng hơn" (design/previews/mock-soc-variety.html), taken on a local dev server:
//   cd frontend && VITE_GUIDE_TIPS=off npx vite --port 3225     then     node design/previews/shots-soc-variety.mjs [which]
// Saves design/previews/img/build-soc-*.png.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.SHOT_URL ?? 'http://127.0.0.1:3225';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'img');
const only = process.argv[2];
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 800 };
const NOW = new Date('2026-11-18T09:00:00');

/** Opens the app with `opts` passed to demo() (null: a brand-new learner). */
async function open(browser, size, opts, now = NOW) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await page.clock.install({ time: now });
  await page.goto(BASE + '/');
  await page.evaluate(opts ? `(${demo.toString()})(${JSON.stringify(opts)})` : 'localStorage.clear()');
  await page.reload();
  await page.waitForTimeout(900);
  return page;
}
const demo = async ({ coat, name, patch } = {}) => {
  localStorage.clear();
  (await import('/src/shared/data/storage.ts')).loadDemoData();
  const key = 'toeic_progress_bundle_v3';
  const data = JSON.parse(localStorage.getItem(key));
  if (coat) data.profile.socCoat = coat;
  if (name) data.profile.socName = name;
  // Demo study days end on 2026-09-13; with no shields the streak breaks on 09-15 and Sóc dozes off from 09-16.
  if (patch) { data.shieldDays = []; data.profile.streakFreezes = 0; data.profile.shieldAllowance = 0; }
  localStorage.setItem(key, JSON.stringify(data));
  localStorage.setItem('rd_welcome_seen_v1:guest', '1');
};

const shots = {
  async grid(browser) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    await page.goto(BASE + '/');
    await page.evaluate(async () => {
      const { socMoodSvg } = await import('/src/shared/ui/soc/socSvg.ts');
      const { SOC_COATS } = await import('/src/shared/ui/soc/socCoat.ts');
      await import('/src/shared/ui/soc/soc.css');
      const faces = [['idle', 'Vui'], ['proud', 'Tự hào'], ['surprised', 'Ngạc nhiên'], ['focus', 'Tập trung'], ['sad', 'Buồn nhẹ'], ['zzz', 'Ngủ gật']];
      document.body.innerHTML = `<div id="g" style="font-family:Nunito,sans-serif;padding:24px;background:#fff;display:grid;grid-template-columns:110px repeat(6,1fr);gap:10px;align-items:center;width:1130px">
        <span></span>${faces.map(f => `<b style="text-align:center;font-weight:900">${f[1]}</b>`).join('')}
        ${SOC_COATS.map(c => `<b style="font-weight:900">${c.label}</b>${faces.map(f => `<span class="soc" style="width:140px;margin:0 auto;background:#fbfaf7;border-radius:18px;padding:6px">${socMoodSvg(f[0], [], c.id)}</span>`).join('')}`).join('')}
      </div>`;
    });
    await page.waitForTimeout(300);
    await page.locator('#g').screenshot({ path: path.join(OUT, 'build-soc-grid.png') });
    await page.close();
  },
  async welcome(browser) {
    for (const [tag, size] of [['phone', PHONE], ['desktop', DESK]]) {
      const page = await open(browser, size, null);
      await page.mouse.click(5, 5);
      await page.waitForTimeout(400);
      if (tag === 'phone') {
        await page.getByRole('button', { name: '700', exact: true }).click();
        await page.getByRole('button', { name: 'Xong, mục tiêu 700' }).click();
      } else {
        await page.getByRole('button', { name: '700', exact: true }).click();
        await page.getByRole('button', { name: 'Xong', exact: true }).click();
      }
      await page.getByRole('radio', { name: 'Xám tro' }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `build-soc-welcome-${tag}.png`) });
      await page.close();
    }
  },
  async wardrobe(browser) {
    for (const [tag, size] of [['phone', PHONE], ['desktop', DESK]]) {
      const page = await open(browser, size, { coat: 'soco', name: 'Bắp Rang' });
      if (tag === 'phone') {
        await page.getByRole('button', { name: /Hồ sơ của bạn/ }).click();
        await page.getByRole('button', { name: /Thành tích/ }).click();
        await page.getByRole('button', { name: '👕 Đồ cho Sóc' }).click();
      } else {
        await page.getByRole('button', { name: /Mở Thành tích/ }).click();
        await page.getByRole('button', { name: '👕 Đổi đồ cho Sóc' }).click();
      }
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `build-soc-wardrobe-${tag}.png`) });
      await page.close();
    }
  },
  async today(browser) {
    for (const [tag, size] of [['phone', PHONE], ['desktop', DESK]]) {
      const page = await open(browser, size, { coat: 'dau' }, new Date('2026-09-13T10:00:00'));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `build-soc-today-${tag}.png`) });
      await page.close();
    }
  },
  async moods(browser) {
    for (const patch of ['broke', 'idle']) {
      for (const [tag, size] of [['phone', PHONE], ['desktop', DESK]]) {
        const pg = await open(browser, size, { coat: 'xam', patch }, new Date(patch === 'broke' ? '2026-09-15T10:00:00' : '2026-09-17T10:00:00'));
        await pg.waitForTimeout(1500);
        await pg.screenshot({ path: path.join(OUT, `build-soc-${patch === 'broke' ? 'streak-broke' : 'idle'}-${tag}.png`) });
        await pg.close();
      }
    }
  }
};

const browser = await chromium.launch();
try {
  for (const [name, run] of Object.entries(shots)) if (!only || only === name) await run(browser);
} finally {
  await browser.close();
}
