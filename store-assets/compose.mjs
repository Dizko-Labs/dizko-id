// Store images in Dizko's look: near-black ground, Instrument Sans, one caption, the real panel render
import { chromium } from '/Users/zakkrevitt/code/AgroFloresta/agrofloresta-identifier/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const css = `@font-face{font-family:I;src:url(font.woff2)}*{margin:0;box-sizing:border-box}body{background:#080808;color:#F0F0EC;font-family:I,sans-serif;-webkit-font-smoothing:antialiased}`;
// [file, panel render, offset into it (css px), caption, line]
const shots = [
  ['screenshot-1-tracks', 'p-mix.png', 580, 'Every track in the mix', 'Read from the tracklist, or heard in the mix itself.'],
  ['screenshot-2-dj-dates', 'p-dj.png', 0, 'Where the DJ plays next', 'Their upcoming dates, from Dizko.'],
  ['screenshot-3-cart', 'p-mix.png', 340, 'Straight to your cart', 'Tick the tracks, add them to Beatport or Bandcamp.'],
  ['screenshot-4-section', 'p-choice.png', 0, 'Just the part you want', 'Listen to the whole mix, or only a section of it.'],
  ['screenshot-5-saved', 'p-library.png', 0, 'Every track you pick, saved', 'With the mix it came from.'],
];
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
for (const [name, img, offset, title, sub] of shots) {
  writeFileSync(`${name}.html`, `<!doctype html><style>${css}
    body{width:1280px;height:800px;display:grid;grid-template-columns:1fr 432px;align-items:center;padding:0 120px 0 112px;gap:64px;overflow:hidden}
    h1{font-size:60px;line-height:1.02;font-weight:600;letter-spacing:-0.035em;max-width:9.5em;text-wrap:balance}
    p{margin-top:22px;font-size:22px;line-height:1.35;color:#A7A7A1;max-width:20em;text-wrap:pretty}
    .mark{display:flex;align-items:center;gap:12px;margin-bottom:56px;font-size:22px;font-weight:600;letter-spacing:-0.02em}
    .mark img{width:34px}
    .panel{height:740px;align-self:end;border:1px solid #2D2D2B;border-bottom:0;border-radius:16px 16px 0 0;overflow:hidden}
    .panel img{width:430px;display:block}
  </style><body><div><div class="mark"><img src="mark.svg" alt="">Dizko ID</div><h1>${title}</h1><p>${sub}</p></div><div class="panel"><img src="${img}" alt="" style="margin-top:-${offset}px"></div></body>`);
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(`file://${process.cwd()}/${name}.html`); await p.waitForTimeout(300);
  await p.screenshot({ path: `screenshots/${name}.png` }); await p.close();
}
writeFileSync('promo.html', `<!doctype html><style>${css}
  body{width:440px;height:280px;padding:36px 34px;display:flex;flex-direction:column;justify-content:space-between}
  .mark{display:flex;align-items:center;gap:12px;font-size:30px;font-weight:600;letter-spacing:-0.025em}.mark img{width:46px}
  p{font-size:20px;line-height:1.25;color:#A7A7A1;max-width:16em}
</style><body><div class="mark"><img src="mark.svg" alt="">Dizko ID</div><p>Find every track in a SoundCloud DJ mix, and fill your cart.</p></body>`);
const p = await b.newPage({ viewport: { width: 440, height: 280 } });
await p.goto(`file://${process.cwd()}/promo.html`); await p.waitForTimeout(300); await p.screenshot({ path: 'promo-440x280.png' });
await b.close();
