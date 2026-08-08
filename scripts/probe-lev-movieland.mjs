/**
 * גשש סבב 3 — חקירה ממוקדת לשתי הרשתות שנותרו: קולנוע לב ומובילנד.
 *
 * לב: probe-network.md כבר מצא קריאת רשת יחידה ל-
 *   m6-211026f8a25b42c08fc190458268b30e.ecs.us-east-2.on.aws/events?cee=no
 * אבל רק מסניף אחד (תל אביב) ובלי לדעת אם המזהה הזה גלובלי או פר-סניף,
 * ובלי לראות את תוכן ה-JSON המלא. כאן: מוצאים את כל סניפי לב מהניווט
 * באתר, פותחים כל סניף, ותופסים את מלוא גוף התשובה של events.
 *
 * מובילנד: מוגן ע"י Cloudflare (403 עם fetch רגיל). דפדפן אמיתי
 * (Playwright, לא headless חשוד) לפעמים עובר challenge אוטומטי בלי
 * אינטראקציה. בודקים את זה עם המתנה ארוכה, ותופסים גם כאן את כל בקשות
 * הרשת המעניינות כדי לראות אם יש API הקרנות אמיתי מתחתיו.
 *
 * כותב: data/probe-lev.md , data/probe-movieland.md
 */

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

async function probeLev(browser) {
  const out = [`# גשש לב — ${new Date().toISOString()}`];
  const page = await browser.newPage({ userAgent: UA, locale: "he-IL" });

  // שלב 1: לגלות סניפים מהניווט של דף הבית
  let slugs = [];
  try {
    await page.goto("https://www.lev.co.il/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    const hrefs = await page.$$eval("a[href*='/location/']", els => els.map(e => e.getAttribute("href")));
    slugs = [...new Set(hrefs
      .map(h => (h.match(/\/location\/([a-z0-9-]+)/i) || [])[1])
      .filter(Boolean))];
    out.push(`סניפים שנמצאו בניווט: ${slugs.join(", ") || "(אף אחד)"}`);
  } catch (e) {
    out.push(`ניווט לדף הבית נכשל: ${e.message}`);
  }
  if (!slugs.length) slugs = ["telaviv"]; // נופלים חזרה למה שכבר ידוע שעובד

  // שלב 2: לכל סניף — לפתוח את דף המיקום ולתפוס כל קריאת events
  for (const slug of slugs) {
    out.push(`\n=== סניף: ${slug}`);
    const hits = [];
    const onResp = async (res) => {
      const url = res.url();
      if (!/events|showtime|session|film|movie/i.test(url)) return;
      let body = "";
      try {
        const ct = res.headers()["content-type"] || "";
        if (/json|text/i.test(ct)) body = await res.text();
      } catch {}
      hits.push({ url, status: res.status(), body });
    };
    page.on("response", onResp);
    try {
      await page.goto(`https://www.lev.co.il/location/${slug}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(5000);
    } catch (e) {
      out.push(`  ניווט נכשל: ${e.message}`);
    }
    page.off("response", onResp);
    if (!hits.length) out.push("  (לא נתפסו קריאות events)");
    for (const h of hits) {
      out.push(`  [${h.status}] ${h.url}`);
      if (h.body) out.push(`      ${h.body.slice(0, 6000)}`);
    }
  }

  await page.close();
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev.md", out.join("\n"));
  console.log("נכתב data/probe-lev.md —", out.length, "שורות");
}

async function probeMovieland(browser) {
  const out = [`# גשש מובילנד — ${new Date().toISOString()}`];
  const page = await browser.newPage({ userAgent: UA, locale: "he-IL" });
  const hits = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (/cloudflare|challenge|gtm|google|facebook|doubleclick|hotjar|clarity|\.css|\.woff|\.png|\.jpg|\.svg|\.gif/i.test(url)) return;
    let body = "";
    try {
      const ct = res.headers()["content-type"] || "";
      if (/json/i.test(ct)) body = await res.text();
    } catch {}
    hits.push({ url, status: res.status(), ct: res.headers()["content-type"] || "", body });
  });

  try {
    await page.goto("https://www.movieland.co.il/theater/1290", { waitUntil: "domcontentloaded", timeout: 45000 });
    // נותנים הרבה זמן ל-challenge (אם קיים) להתיישב לבד
    await page.waitForTimeout(12000);
    const title = await page.title().catch(() => "");
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || "").catch(() => "");
    out.push(`כותרת עמוד אחרי המתנה: ${title}`);
    out.push(`תחילת טקסט הגוף: ${bodyText.replace(/\s+/g, " ")}`);
    const times = (bodyText.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || []).length;
    out.push(`מספר תבניות-שעה שנמצאו בטקסט הנראה: ${times}`);
  } catch (e) {
    out.push(`ניווט נכשל: ${e.message}`);
  }

  out.push(`\nבקשות רשת שנתפסו (${hits.length}):`);
  for (const h of hits) {
    out.push(`  [${h.status} ${h.ct.split(";")[0]}] ${h.url}`);
    if (h.body) out.push(`      ${h.body.slice(0, 2000)}`);
  }

  await page.close();
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-movieland.md", out.join("\n"));
  console.log("נכתב data/probe-movieland.md —", out.length, "שורות");
}

async function main() {
  const browser = await chromium.launch();
  try {
    await probeLev(browser);
    await probeMovieland(browser);
  } finally {
    await browser.close();
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
