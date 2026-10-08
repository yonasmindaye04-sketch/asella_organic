import { chromium } from '@playwright/test';

const URL = 'http://localhost:5173/tma.html';
const OUT = 'C:/Users/Yonas/AppData/Local/Temp/opencode';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 1000 } });

const failed: string[] = [];
page.on('requestfailed', (r) => failed.push(`${r.url()} :: ${r.failure()?.errorText}`));

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
await page.waitForTimeout(2500); // let the webfont settle

const fonts = await page.evaluate(`(function () { return document.fonts.ready.then(function () { return Array.prototype.slice.call(document.fonts).map(function (f) { return f.family + ' ' + f.style + ' ' + f.weight + ' = ' + f.status; }); }); })()`);
console.log('WEBFONTS:', JSON.stringify(fonts, null, 2));

const icons = await page.evaluate(`(function () {
  var nodes = Array.prototype.slice.call(document.querySelectorAll('i.fa-solid'));
  var report = [];
  var missing = 0;
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var cs = getComputedStyle(el);
    var cls = (el.className || '').replace('fa-solid', '').trim();
    var w = el.getBoundingClientRect().width;
    if (w < 4) missing++;
    if (report.length < 30) {
      report.push({ icon: cls, font: cs.fontFamily.split(',')[0], size: cs.fontSize, width: Math.round(w) });
    }
  }
  return { total: nodes.length, zeroWidth: missing, sample: report };
})()`);
console.log('ICON COUNT:', icons.total, '| zero-width:', icons.zeroWidth);
console.log('SAMPLE:', JSON.stringify(icons.sample, null, 2));

console.log('FAILED REQUESTS:', failed.length ? failed.join('\n') : 'none');

await page.screenshot({ path: `${OUT}/fa-store.png` });
await page.getByRole('button', { name: /^Discover$/ }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/fa-discover.png`, fullPage: true });

await browser.close();