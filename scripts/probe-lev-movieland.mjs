/**
 * גשש סבב 8 — לב, בדיקה חזותית אחרונה: 5 סבבים של גישוש טקסטואלי לא
 * מצאו שום מסלול לנתוני הקרנות אמיתיים (לא ב-HTML הסטטי, לא ב-API
 * נפרד, לא iframe, לא קישור כרטיסים). יתכן שיש כפתור/רכיב "רכישת
 * כרטיסים" שנטען כ-JS אחרי גלילה/אינטראקציה שלא תפסנו. כאן: פותחים
 * בדפדפן אמיתי, גוללים לתחתית העמוד, מצלמים מסך מלא, ומוציאים את כל
 * הטקסט של כל הכפתורים/קישורים הנראים לעין — כדי לראות בעין את מה
 * שמשתמש אמיתי היה רואה, ולא לנחש סלקטורים.
 *
 * כותב: data/probe-lev-screenshot.png , data/probe-lev6.md
 */

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

async function main() {
  const out = [`# גשש לב 6 — ${new Date().toISOString()}`];
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: UA, locale: "he-IL", viewport: { width: 1280, height: 2400 } });

  await page.goto("https://www.lev.co.il/location/telaviv", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(1500);

  await mkdir("data", { recursive: true });
  await page.screenshot({ path: "data/probe-lev-screenshot.png", fullPage: true });

  const clickable = await page.$$eval("a, button", els =>
    els.map(e => (e.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean));
  out.push(`טקסטים של כל הקישורים/כפתורים בעמוד (${clickable.length}):`);
  out.push([...new Set(clickable)].join("\n"));

  await browser.close();
  await writeFile("data/probe-lev6.md", out.join("\n"));
  console.log("נכתב data/probe-lev6.md + data/probe-lev-screenshot.png");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev6.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
