/**
 * גשש סבב 10 — לב, השלמת השרשרת: סבב 9 מצא את הקריאה האמיתית —
 * wp-content/themes/lev/ajax_data.php?action=movie_on_location_new
 * &loc={שם קולנוע}&date={YYYY-MM-DD} — אבל בחרנו תאריך של שבת
 * (היום) והתשובה הייתה רק הודעת "הרשימה עדיין לא מוכנה" (לא נתוני
 * סרטים אמיתיים). כאן: בוחרים תאריך אמצע-שבוע וממתינים לתשובה
 * האמיתית, ואז גם בודקים אם ה-select של "בחר סרט" מתמלא בעקבות זה
 * ומייצר אחריו קריאת המשך (שעות הקרנה בפועל).
 *
 * כותב: data/probe-lev8.md
 */

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

async function main() {
  const out = [`# גשש לב 8 — ${new Date().toISOString()}`];
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: UA, locale: "he-IL" });

  const calls = [];
  page.on("response", async (res) => {
    if (/ajax_data\.php/i.test(res.url())) {
      let text = null;
      try { text = await res.text(); } catch (e) { text = `<error: ${e.message}>`; }
      calls.push({ url: res.url(), status: res.status(), text });
    }
  });

  await page.goto("https://www.lev.co.il/location/telaviv", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);

  const selects = await page.$$("select");
  // select[1] = בחר תאריך (לפי קולנוע flow) — לפי סבב קודם. בוחרים יום שלישי (אמצע שבוע).
  const dateOpts = await selects[1].$$eval("option", os => os.map(o => o.value));
  const midweek = dateOpts.find(v => /2026-08-1[1-3]/.test(v)) || dateOpts[3] || dateOpts[dateOpts.length - 1];
  out.push(`בוחרים תאריך: ${midweek}`);
  await selects[1].selectOption(midweek);
  await page.waitForTimeout(3000);

  // אחרי בחירת תאריך, לבדוק אם select[3] ("בחר סרט") התמלא באפשרויות אמיתיות
  const movieOpts = await selects[3].$$eval("option", os => os.map(o => ({ value: o.value, text: o.textContent.trim() })));
  out.push(`select[3] (בחר סרט) אחרי בחירת תאריך: ${JSON.stringify(movieOpts.slice(0, 10))}`);

  if (movieOpts.length > 1) {
    const realMovie = movieOpts.find(o => o.value && o.value !== "בחר סרט" && o.value !== "0");
    if (realMovie) {
      out.push(`בוחרים סרט: ${realMovie.text} (${realMovie.value})`);
      await selects[3].selectOption(realMovie.value);
      await page.waitForTimeout(3000);
    }
  }

  out.push(`\nקריאות ajax_data.php שנתפסו (${calls.length}):`);
  for (const c of calls) {
    out.push(`\n[${c.status}] ${c.url}`);
    out.push(`resp: ${c.text ? c.text.slice(0, 4000) : "(none)"}`);
  }

  await browser.close();
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev8.md", out.join("\n"));
  console.log("נכתב data/probe-lev8.md —", out.length, "שורות");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev8.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
