import { chromium } from '@playwright/test';

const URL = process.env.TMA_URL || 'http://localhost:5173/tma.html';

const PROBE = `(function () {
  var root = document.documentElement;
  var cs = getComputedStyle(root);
  function pick(sel) {
    var el = document.querySelector(sel);
    if (!el) return { sel: sel, missing: true };
    var s = getComputedStyle(el);
    return { sel: sel, color: s.color, background: s.backgroundColor, border: s.borderTopColor, font: s.fontFamily };
  }
  return {
    htmlClass: root.className,
    tokens: {
      cream: cs.getPropertyValue('--cream').trim(),
      ink: cs.getPropertyValue('--ink').trim(),
      ink2: cs.getPropertyValue('--ink2').trim(),
      muted: cs.getPropertyValue('--muted').trim(),
      border: cs.getPropertyValue('--border').trim(),
      surface: cs.getPropertyValue('--surface').trim(),
      g700: cs.getPropertyValue('--g700').trim(),
      g800: cs.getPropertyValue('--g800').trim()
    },
    bodyBg: getComputedStyle(document.body).backgroundColor,
    shell: pick('.telegram-mini-app-shell'),
    header: pick('header'),
    headerTitle: pick('header .font-heading'),
    h1: pick('main h1'),
    card: pick('main ul li'),
    bottomNav: pick('nav')
  };
})()`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 850 } });

await page.addInitScript(`
  var btn = { setText: function(){}, onClick: function(){}, offClick: function(){}, show: function(){}, hide: function(){}, showProgress: function(){}, hideProgress: function(){}, enable: function(){}, disable: function(){}, isVisible: false };
  window.Telegram = { WebApp: {
    initData: 'query_id=T&user=%7B%22id%22%3A1%7D&hash=abc',
    initDataUnsafe: { user: { id: 1, first_name: 'Test', username: 'test' } },
    version: '8.0', platform: 'android', colorScheme: 'light', themeParams: {},
    MainButton: btn, BackButton: btn, SecondaryButton: btn,
    HapticFeedback: { impactOccurred: function(){}, notificationOccurred: function(){}, selectionChanged: function(){} },
    ready: function(){}, expand: function(){}, onEvent: function(){}, offEvent: function(){}, openLink: function(){}, openTelegramLink: function(){}
  }};
`);

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=For you', { timeout: 20000 });

async function probe(label: string) {
  const data: any = await page.evaluate(PROBE);
  console.log(`\n===== ${label} =====`);
  console.log('html class :', data.htmlClass);
  console.log('body bg    :', data.bodyBg);
  console.log('tokens     :', JSON.stringify(data.tokens));
  for (const k of ['shell', 'header', 'headerTitle', 'h1', 'card', 'bottomNav']) {
    const d = data[k];
    if (d.missing) console.log(`${k.padEnd(12)}: MISSING`);
    else console.log(`${k.padEnd(12)}: color=${d.color} bg=${d.background} border=${d.border}`);
  }
}

await probe('LIGHT');

await page.getByRole('button', { name: /switch to dark theme/i }).click();
await page.waitForTimeout(800);

await probe('DARK');

await browser.close();