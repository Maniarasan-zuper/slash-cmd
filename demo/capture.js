"use strict";
const path = require("path");
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");
const GIFEncoder = require("gif-encoder-2");
const fs = require("fs");

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 760;
const H = 880;
const OUT = path.join(__dirname, "..", "demo.gif");

// Sequence of (state, hold-in-ms). Holds become repeated frames at 100ms each.
const SEQ = [
  ["idle", 900],
  ["slash", 2200],
  ["filter", 1500],
  ["done", 2200],
];
const FRAME_MS = 100; // 10 fps

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--force-color-profile=srgb"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "demo.html"));

  const encoder = new GIFEncoder(W, H, "neuquant", true);
  encoder.setDelay(FRAME_MS);
  encoder.setRepeat(0); // loop forever
  encoder.setQuality(10);
  encoder.start();

  let total = 0;
  for (const [state, hold] of SEQ) {
    await page.evaluate((s) => window.render(s), state);
    await new Promise((r) => setTimeout(r, 120)); // let layout settle
    const buf = await page.screenshot({ type: "png" });
    const png = PNG.sync.read(buf);
    const frames = Math.max(1, Math.round(hold / FRAME_MS));
    for (let i = 0; i < frames; i++) encoder.addFrame(png.data);
    total += frames;
    console.log(`state=${state} frames=${frames}`);
  }

  encoder.finish();
  fs.writeFileSync(OUT, encoder.out.getData());
  await browser.close();
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`\nwrote ${OUT} (${total} frames, ${kb} KB)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
