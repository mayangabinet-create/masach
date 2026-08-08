/**
 * גשש סבב 4 — לב בלבד: לצפות בגוף המלא של קריאת events ובכותרות
 * הבקשה שלה, ולראות מאיפה מגיע הסינון לפי סניף כשכל הסניפים קוראים
 * לאותה כתובת בדיוק (m6-....on.aws/events?cee=no — ראו data/probe-lev.md
 * מהסבב הקודם: אותה כתובת בדיוק בכל 6 הסניפים, בלי פרמטר מיקום).
 * ההשערה: הסינון קורה לפי Referer/Origin בצד השרת, או שיש עוד קריאה
 * (אחרי לחיצה על תאריך) שכן ממוקדת-מיקום. גם מחפשים config מוטמע ב-HTML.
 *
 * מובילנד לא כלול כאן — הסבב הקודם (data/probe-movieland.md) כבר הראה
 * חסימת Cloudflare מלאה גם עם דפדפן אמיתי ו-12 שניות המתנה (title
 * נשאר "רק רגע...", 403 חוזר על theater/1290). לא ממשיכים לנסות לעקוף.
 *
 * כותב: data/probe-lev2.md
 */

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

const SLUGS = ["telaviv", "even-yehuda"];

async function main() {
  const out = [`# גשש לב 2 — ${new Date().toISOString()}`];
  const browser = await chromium.launch();

  for (const slug of SLUGS) {
    out.push(`\n=== סניף: ${slug}`);
    const page = await browser.newPage({ userAgent: UA, locale: "he-IL" });

    const reqs = [];
    page.on("request", (req) => {
      if (/on\.aws/i.test(req.url())) {
        reqs.push({ url: req.url(), method: req.method(), headers: req.headers(), postData: req.postData() });
      }
    });
    const bodies = [];
    page.on("response", async (res) => {
      if (!/on\.aws/i.test(res.url())) return;
      let text = null, error = null;
      try { text = await res.text(); } catch (e) { error = e.message; }
      bodies.push({ url: res.url(), status: res.status(), headers: res.headers(), text, error });
    });

    try {
      await page.goto(`https://www.lev.co.il/location/${slug}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4000);

      // לחפש config מוטמע ב-HTML (מזהה סניף, מספר location וכו')
      const html = await page.content();
      const idHints = [...html.matchAll(/(location[_-]?id|branch[_-]?id|cinema[_-]?id|siteId|venueId)["' :=]+["']?([\w-]{1,20})/gi)]
        .slice(0, 10).map(m => `${m[1]}=${m[2]}`);
      out.push(`  רמזי-מזהה ב-HTML: ${idHints.join(" | ") || "(none)"}`);

      // לנסות ללחוץ על טאב תאריך אם יש, לראות אם יוצאת קריאה נוספת
      const dateTab = await page.$("[class*=date], [class*=day], button:has-text('מחר')");
      if (dateTab) {
        await dateTab.click().catch(() => {});
        await page.waitForTimeout(2500);
      }
    } catch (e) {
      out.push(`  ניווט נכשל: ${e.message}`);
    }

    out.push(`  בקשות ל-on.aws (${reqs.length}):`);
    for (const r of reqs) {
      out.push(`    ${r.method} ${r.url}`);
      out.push(`    headers: ${JSON.stringify(r.headers)}`);
      if (r.postData) out.push(`    body: ${r.postData}`);
    }
    out.push(`  תשובות מ-on.aws (${bodies.length}):`);
    for (const b of bodies) {
      out.push(`    [${b.status}] ${b.url}`);
      if (b.error) out.push(`    שגיאת קריאה: ${b.error}`);
      if (b.text) out.push(`    גוף (${b.text.length} תווים): ${b.text.slice(0, 8000)}`);
    }

    await page.close();
  }

  await browser.close();
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev2.md", out.join("\n"));
  console.log("נכתב data/probe-lev2.md —", out.length, "שורות");
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
