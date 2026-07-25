#!/usr/bin/env node
/**
 * Visual + timing harness for term-crunch's MP reward animation (MasteryBlock in
 * apps/term-crunch/src/components/ChallengePanel.tsx + the mp-* keyframes in
 * globals.css).
 *
 * The animation is a two-beat choreography — the "+N MP" chip tallies the award
 * alone, then the total and the progress bar count up in lockstep — and every
 * defect it has had was a *timing* defect invisible in a still: a bar trailing
 * the counter by a CSS transition, a shimmer with nowhere to travel, two numbers
 * moving at once. So this captures frames AND reads the live DOM alongside each
 * frame, then asserts the beats actually land where they should.
 *
 * Three passes:
 *   mp-reward/frame-NNN.png   fresh save, one first clear (+50 MP)
 *   mp-reward/lvl-NNN.png     save seeded at 470 MP, so the same clear crosses
 *                             the 500 MP threshold and fires the level-up pause
 *                             (that branch is otherwise never exercised)
 *   mp-reward/rm-NNN.png      the same, under prefers-reduced-motion: everything
 *                             must snap, but the level-up callout is
 *                             informational and has to survive
 * plus a timing-<pass>.json each. Assemble a scrubbable animation with libwebp
 * (homebrew ffmpeg ships with its webp encoder disabled):
 *   cd screenshots/mp-reward && img2webp -loop 0 -d 100 frame-*.png -o after.webp
 *
 * Usage:
 *   npm run screenshot:mp-reward                  # defaults: localhost:3001
 *   TT_URL=http://localhost:3000/ npm run screenshot:mp-reward
 *   node scripts/visual/mp-reward.mjs <url> <outDir>
 *
 * Requires a dev server already running (npm run dev / npm run dev:crunch).
 */
import { chromium } from "playwright";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const URL = process.argv[2] || process.env.TT_URL || "http://localhost:3001/";
const OUT = resolve(process.argv[3] || process.env.TT_OUT || "screenshots/mp-reward");
const SCALE = Number(process.env.TT_SCALE || 2);

// ~100ms x 25 covers the whole reward with room to spare (it should finish well
// inside 1.6s); the level-up pass needs longer for the 600ms threshold hold.
const FRAME_MS = 100;
const FRAMES = 25;
const LVL_FRAMES = 32;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

await mkdir(OUT, { recursive: true });
// Stale frames from a longer previous run would read as part of this capture.
for (const f of await readdir(OUT)) {
  if (/^(frame|lvl|rm)-\d+\.png$/.test(f)) await rm(`${OUT}/${f}`);
}

const browser = await chromium.launch();

/**
 * Read the MasteryBlock's live values. Selected structurally, not by class: the
 * panel has no data attributes, and the header row is the only element whose
 * first child is a "<n> MP" span. The bar is always the row's next sibling, and
 * the fill is its first child.
 *
 * Installed into the page as window.__mpProbe so the same reader serves both the
 * per-screenshot samples and the in-page every-frame recorder.
 */
const PROBE = () => {
  const isTotal = (el) => el?.tagName === "SPAN" && /^[\d,]+ MP$/.test(el.textContent || "");
  const row = [...document.querySelectorAll("aside div")].find((el) => isTotal(el.firstElementChild));
  if (!row) return null;
  const fill = row.nextElementSibling?.firstElementChild;
  const panel = document.querySelector("aside")?.textContent || "";
  return {
    total: Number((row.firstElementChild.textContent || "").replace(/[^\d]/g, "")),
    chip: row.querySelector(".mp-gain")?.textContent ?? null,
    chipFading: row.querySelector(".mp-gain-out") !== null,
    width: parseFloat(fill?.style.width || "0"),
    counting: row.querySelector(".mp-counting") !== null,
    sweeping: row.nextElementSibling?.querySelector(".mp-bar-sweep") !== null,
    levelUp: panel.includes("▲ Level up"),
  };
};

/**
 * Boot a fresh context (optionally with a seeded save), solve git-first-commit,
 * and capture frames + a DOM sample per frame across the reward.
 */
async function capturePass({ label, frames, seedMp, reduced }) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: SCALE,
    ...(reduced ? { reducedMotion: "reduce" } : {}),
  });
  await ctx.addInitScript(`window.__mpProbe = ${PROBE.toString()}`);
  if (seedMp !== undefined) {
    // The store deep-merges persisted `mastery` over initialMastery(), so an
    // mp-only save hydrates as a valid MasteryState.
    await ctx.addInitScript(
      ([mp]) => {
        localStorage.setItem("term-crunch-progress", JSON.stringify({ state: { mastery: { mp } }, version: 1 }));
      },
      [seedMp]
    );
  }
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector(".xterm-rows", { timeout: 30000 });

  const termText = () => page.evaluate(() => document.querySelector(".xterm-rows")?.innerText || "");
  for (let i = 0; i < 60; i++) {
    if ((await termText()).length > 20) break;
    await sleep(500);
  }
  // Coordinate-click .xterm-screen: it intercepts pointer events, so a locator
  // click on .xterm-rows never lands.
  const box = await page.locator(".xterm-screen").first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(300);

  const type = async (line) => {
    await page.keyboard.type(line);
    await page.keyboard.press("Enter");
    await sleep(600);
  };
  // The git track puts git-first-commit at 1/5; a fresh boot starts on a pane
  // challenge, which would need chords.
  await type("track git");
  await type("git add README.md");

  const before = await page.evaluate(() => window.__mpProbe());
  check(before !== null, `${label}: MasteryBlock not found in the panel`);
  const aside = await page.locator("aside").first().boundingBox();
  const clip = { x: Math.round(aside.x), y: Math.round(aside.y), width: Math.round(aside.width), height: Math.round(aside.height) };

  // Queue the winning command, then start capturing the moment Enter lands. The
  // in-page recorder samples EVERY animation frame: a one-frame glitch (the bar
  // flashing empty as it re-bases at a level threshold) is invisible at the
  // 100ms screenshot cadence.
  await page.keyboard.type('git commit -m "init"');
  await page.evaluate((ms) => {
    window.__mpTrace = [];
    const t0 = performance.now();
    const step = () => {
      window.__mpTrace.push({ ms: Math.round(performance.now() - t0), ...window.__mpProbe() });
      if (performance.now() - t0 < ms) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, frames * FRAME_MS);
  const t0 = Date.now();
  await page.keyboard.press("Enter");

  const trace = [];
  for (let i = 0; i < frames; i++) {
    const name = `${label}-${String(i).padStart(3, "0")}.png`;
    await page.screenshot({ path: `${OUT}/${name}`, clip });
    trace.push({ frame: i, ms: Date.now() - t0, ...(await page.evaluate(() => window.__mpProbe())) });
    const next = t0 + (i + 1) * FRAME_MS - Date.now();
    if (next > 0) await sleep(next);
  }
  const fine = await page.evaluate(() => window.__mpTrace);
  await writeFile(
    `${OUT}/timing-${label}.json`,
    JSON.stringify({ label, seedMp: seedMp ?? 0, frames: trace.length, frameMs: FRAME_MS, trace, fine }, null, 2)
  );
  await ctx.close();
  return { before, trace, fine };
}

// Frames where the fill shrank — legitimate only when a level threshold releases
// its 100% hold into the next band.
const dips = (fine) => fine.filter((f, i) => i > 0 && f.width < fine[i - 1].width - 0.01);

// ── Pass 1: a plain first clear ────────────────────────────────────────
const { before, trace, fine } = await capturePass({ label: "frame", frames: FRAMES });
const startMp = before?.total ?? 0;
const finalMp = trace[trace.length - 1].total;
const finalWidth = trace[trace.length - 1].width;
const award = Math.max(...trace.map((f) => Number((f.chip || "0").replace(/[^\d]/g, ""))));

const at = (pred) => trace.findIndex(pred);
const chipFull = at((f) => f.chip !== null && Number(f.chip.replace(/[^\d]/g, "")) === award);
const counterMoved = at((f) => f.total > startMp);
const counterDone = at((f) => f.total === finalMp);
const barDone = at((f) => Math.abs(f.width - finalWidth) < 0.05);
const chipGone = at((f) => f.frame > chipFull && f.chip === null);

console.log(`\n=== pass 1: +${award} MP (${startMp} → ${finalMp}), bar → ${finalWidth}% ===`);
for (const f of trace) {
  if (f.ms > (chipGone < 0 ? Infinity : trace[chipGone].ms + 300)) break;
  console.log(
    `  ${String(f.ms).padStart(4)}ms  total=${String(f.total).padStart(4)}  chip=${(f.chip ?? "-").padEnd(8)}` +
      `  bar=${f.width.toFixed(2).padStart(6)}%${f.counting ? "  counting" : ""}${f.sweeping ? "  sweep" : ""}${f.chipFading ? "  fading" : ""}`
  );
}
console.log(
  `  chip full @f${chipFull}  counter starts @f${counterMoved}  counter lands @f${counterDone}  bar lands @f${barDone}  chip gone @f${chipGone}`
);

// Per-animation-frame checks (the coarse frames above are the visual record).
const fineMs = (pred) => fine.find(pred)?.ms;
const fCounter = fineMs((f) => f.total === finalMp);
const fBar = fineMs((f) => Math.abs(f.width - finalWidth) < 0.01);
console.log(`  every-frame trace (${fine.length} frames): counter lands ${fCounter}ms, bar lands ${fBar}ms`);

check(award > 0, "pass1: no +N MP chip ever appeared");
check(finalMp > startMp, "pass1: the total never rose");
check(
  fCounter !== undefined && fBar !== undefined && Math.abs(fBar - fCounter) <= 40,
  `pass1: counter landed at ${fCounter}ms, bar at ${fBar}ms — more than a frame or two apart`
);
// One band, so the fill can only grow.
check(dips(fine).length === 0, `pass1: the bar went backwards at ${dips(fine).map((d) => d.ms + "ms").join(", ")}`);
// Beat separation: the chip must have finished tallying before the total moves.
check(
  chipFull >= 0 && counterMoved >= chipFull,
  `pass1: the total started moving (f${counterMoved}) before the chip finished tallying (f${chipFull}) — the two beats overlap`
);
// The regression this harness exists for: a CSS width transition left the bar a
// transition behind the rAF-driven counter.
check(
  barDone >= 0 && counterDone >= 0 && Math.abs(barDone - counterDone) <= 1,
  `pass1: counter landed at f${counterDone} but the bar landed at f${barDone} — they must land together`
);
check(chipGone > 0, "pass1: the +N MP chip never left the DOM (it pollutes select-by-text panel reads)");
check(
  chipGone > 0 && trace[chipGone].ms < 1900,
  `pass1: the whole reward should be over inside ~1.9s, took ${chipGone > 0 ? trace[chipGone].ms : "?"}ms`
);
check(
  trace.some((f) => f.sweeping),
  "pass1: the bar's arrival sweep never mounted"
);
// The sweep is an arrival accent; during the fill it has nowhere to travel.
check(
  !trace.some((f) => f.sweeping && f.total < finalMp),
  "pass1: the sweep fired while the total was still counting — it must fire on arrival"
);
check(
  trace.some((f) => f.counting),
  "pass1: the counter never got its .mp-counting pulse"
);

// ── Pass 2: the same clear, crossing the 500 MP level threshold ────────
const lvl = await capturePass({ label: "lvl", frames: LVL_FRAMES, seedMp: 470 });
const lvlTrace = lvl.trace;
console.log(`\n=== pass 2: seeded 470 MP, clear crosses 500 (Curious → Learner) ===`);
for (const f of lvlTrace) {
  console.log(
    `  ${String(f.ms).padStart(4)}ms  total=${String(f.total).padStart(4)}  chip=${(f.chip ?? "-").padEnd(8)}` +
      `  bar=${f.width.toFixed(2).padStart(6)}%${f.counting ? "  counting" : ""}${f.levelUp ? "  LEVEL-UP" : ""}`
  );
}
check(lvl.before?.total === 470, `pass2: seeded save did not hydrate (started at ${lvl.before?.total} MP, wanted 470)`);
check(
  lvlTrace.some((f) => f.total === 500 && f.width > 99),
  "pass2: the bar never held at 100% of the old band while paused at the threshold"
);
// The text is rounded and the bar is not, so round(499.6) reading 500 must NOT be
// what re-bases the bar to the new band — that flashed it empty for one frame.
const cross = lvl.fine.findIndex((f) => f.total >= 500);
check(
  cross >= 0 && lvl.fine[cross].width > 99,
  `pass2: the frame the total first read 500 showed the bar at ${lvl.fine[cross]?.width}% — it must stay pinned full for the hold`
);
check(
  dips(lvl.fine).length === 1,
  `pass2: expected exactly one bar re-base (the 100% hold releasing into the new band), saw ${dips(lvl.fine).length}` +
    ` at ${dips(lvl.fine).map((d) => d.ms + "ms").join(", ")}`
);
check(
  lvlTrace.some((f) => f.levelUp),
  "pass2: crossing 500 MP never showed the ▲ Level up callout"
);
check(
  lvlTrace[lvlTrace.length - 1].total === 520,
  `pass2: expected 470 + 50 = 520 MP, ended at ${lvlTrace[lvlTrace.length - 1].total}`
);

// ── Pass 3: prefers-reduced-motion ────────────────────────────────────
// Seeded at the threshold too: the level-up callout is informational, so it must
// still appear when every animation is off.
const noMo = await capturePass({ label: "rm", frames: 10, seedMp: 470, reduced: true });
const noMoTotals = [...new Set(noMo.fine.map((f) => f.total))];
console.log(`\n=== pass 3: prefers-reduced-motion (seeded 470 MP) ===`);
console.log(`  totals seen: ${noMoTotals.join(" → ")}`);
console.log(
  `  chip: ${[...new Set(noMo.fine.map((f) => f.chip ?? "-"))].join(" → ")}   level-up: ${noMo.fine.some((f) => f.levelUp)}`
);
check(noMoTotals.length <= 2 && noMoTotals[noMoTotals.length - 1] === 520, `pass3: the total should snap 470 → 520, saw ${noMoTotals.join(", ")}`);
check(!noMo.fine.some((f) => f.counting), "pass3: the counter pulse ran under reduced motion");
check(!noMo.fine.some((f) => f.sweeping), "pass3: the bar sweep ran under reduced motion");
check(
  noMo.fine.some((f) => f.chip === "+50 MP"),
  "pass3: the award should still be stated (chip present, just unanimated)"
);
check(noMo.fine[noMo.fine.length - 1].chip === null, "pass3: the chip never left the DOM under reduced motion");
check(
  noMo.fine.some((f) => f.levelUp),
  "pass3: the level-up callout is informational and must survive reduced motion"
);

await browser.close();

console.log("\n" + "=".repeat(40));
if (failures.length) {
  console.log(`FAIL (${failures.length}):`);
  for (const f of failures) console.log("  - " + f);
  console.log(`Frames + timing in ${OUT}`);
  process.exit(1);
}
console.log(`PASS — frames + timing in ${OUT}`);
