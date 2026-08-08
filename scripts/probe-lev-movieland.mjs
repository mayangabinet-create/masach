/**
 * גשש סבב 7 — לב, ניסיון אחרון: כל 5 תבניות-השעה שנמצאו בסבב 4
 * התבררו כפולס-פוזיטיב גמור (datePublished מטא-דאטה, Google Analytics
 * snippet, הערת LiteSpeed Cache) — העמוד הזה הוא עמוד וורדפרס סטטי
 * לגמרי (מוגש ע"י LiteSpeed Cache), בלי שום נתון הקרנות אמיתי. מערכת
 * ההזמנה בטח יושבת בדומיין/פלטפורמה נפרדת שנטענת רק בלחיצה על
 * "הזמנת כרטיסים". כאן: מחפשים בעמוד כל קישור/iframe שקשור לכרטיסים
 * כדי לדעת אם יש בכלל לאן להמשיך.
 *
 * כותב: data/probe-lev5.md
 */

import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

async function main() {
  const out = [`# גשש לב 5 — ${new Date().toISOString()}`];
  const res = await fetch("https://www.lev.co.il/location/telaviv", {
    headers: {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "he-IL,he;q=0.9,en;q=0.8",
    },
  });
  const html = await res.text();
  out.push(`סטטוס: ${res.status} · אורך: ${html.length}`);

  const linkRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,80}?)<\/a>/gi;
  const hits = [];
  let m;
  while ((m = linkRe.exec(html))) {
    const [, href, text] = m;
    if (/ticket|booking|order|buy|כרטיס|הזמנ/i.test(href) || /כרטיס|הזמנ/i.test(text)) {
      hits.push(`${href}  ::  ${text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()}`);
    }
  }
  out.push(`\nקישורי כרטיסים/הזמנה שנמצאו (${hits.length}):`);
  out.push([...new Set(hits)].join("\n"));

  const iframes = [...html.matchAll(/<iframe[^>]*src="([^"]+)"/gi)].map((m2) => m2[1]);
  out.push(`\niframes בעמוד (${iframes.length}):`);
  out.push(iframes.join("\n"));

  // גם לחפש כל דומיין חיצוני שמוזכר בעמוד (חוץ מגוגל/פייסבוק/קלאודפלר) — רמז לפלטפורמת כרטוס
  const domains = [...new Set(
    [...html.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)]
      .map((m3) => m3[1].toLowerCase())
      .filter((d) => !/lev\.co\.il|google|facebook|gstatic|cloudflare|w3\.org|schema\.org|googleapis|wp\.com|litespeed/.test(d))
  )];
  out.push(`\nדומיינים חיצוניים אחרים שהוזכרו בעמוד: ${domains.join(", ") || "(none)"}`);

  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev5.md", out.join("\n"));
  console.log("נכתב data/probe-lev5.md —", out.length, "שורות");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev5.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
