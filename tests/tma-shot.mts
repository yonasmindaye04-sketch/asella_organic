import { chromium } from '@playwright/test';

const URL = 'http://localhost:5173/tma.html';
const OUT = 'C:/Users/Yonas/AppData/Local/Temp/opencode';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });

await page.addInitScript(`
  var btn = { setText: function(){}, onClick: function(){}, offClick: function(){}, show: function(){}, hide: function(){}, showProgress: function(){}, hideProgress: function(){}, enable: function(){}, disable: function(){}, isVisible: false };
  window.Telegram = { WebApp: {
    initData: 'query_id=T&user=%7B%22id%22%3A1%7D&hash=abc',
    initDataUnsafe: { user: { id: 1, first_name: 'Test', username: 'test' } },
    version: '8.0', platform: 'android', colorScheme: 'light', themeParams: {},
    MainButton: btn, BackButton: btn, SecondaryButton: btn,
    HapticFeedback: { impactOccurred: function(){}, notificationOccurred: function(){}, selectionChanged: function(){} },
    ready: function(){}, expand: function(){}, onEvent: function(){}, offEvent: function(){}
  }};
`);

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=For you', { timeout: 20000 });
await page.waitForTimeout(1200);

await page.screenshot({ path: `${OUT}/tma-light.png` });

// Sort control geometry, compared against the Filters pill.
const geometry = await page.evaluate(`(function () {
  function box(sel) {
    var el = document.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  }
  var sort = document.querySelector('select[aria-label="Sort products"]');
  var sortPill = sort ? sort.closest('label') : null;
  var filters = null;
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.trim() === 'Filters') { filters = btns[i]; break; }
  }
  var s = sortPill ? getComputedStyle(sortPill) : null;
  return {
    sortPill: box('select[aria-label="Sort products"]') && sortPill ? { w: Math.round(sortPill.getBoundingClientRect().width), h: Math.round(sortPill.getBoundingClientRect().height) } : null,
    sortSelectBg: sort ? getComputedStyle(sort).backgroundColor : null,
    sortSelectBorder: sort ? getComputedStyle(sort).borderTopWidth : null,
    pillRadius: s ? s.borderRadius : null,
    pillBg: s ? s.backgroundColor : null,
    filters: filters ? { w: Math.round(filters.getBoundingClientRect().width), h: Math.round(filters.getBoundingClientRect().height) } : null,
  };
})()`);

console.log('sort control geometry:', JSON.stringify(geometry, null, 2));

await page.getByRole('button', { name: /switch to dark theme/i }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/tma-dark.png` });

const dark = await page.evaluate(`(function () {
  function pick(sel) {
    var el = document.querySelector(sel);
    if (!el) return 'MISSING';
    var s = getComputedStyle(el);
    return s.color + ' | bg ' + s.backgroundColor;
  }
  return {
    body: getComputedStyle(document.body).backgroundColor,
    header: pick('header'),
    h1: pick('main h1'),
    card: pick('main ul li'),
    nav: pick('nav'),
    option: getComputedStyle(document.querySelector('select option')).backgroundColor,
  };
})()`);
console.log('dark check:', JSON.stringify(dark, null, 2));

await browser.close();