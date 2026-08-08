/**
 * גשש סבב 5 — לב: הקריאה ל-on.aws/events התבררה כלא-קשורה (Facebook
 * Conversions API — event_name:"PageView", fb.pixel_id — טעות זיהוי
 * מסבב קודם כי "events" תאם לרג'קס בטעות). לב הוא אתר וורדפרס רגיל,
 * ודוח הגשש הראשון (data/probe.md) מצא 5 תבניות-שעה ו-73 רמזי-הזמנה
 * *ישירות ב-HTML הסטטי* של lev.co.il/location/telaviv — כלומר סביר
 * שהלוח מוגש בצד השרת (כמו סינמה סיטי), לא נטען ב-API נפרד.
 * כאן: שולפים HTML גולמי (fetch רגיל, בלי דפדפן) ומדפיסים כל האזורים
 * סביב תבניות-שעה + כל <script> מוטמע עם JSON, כדי לראות את המבנה.
 *
 * כותב: data/probe-lev3.md
 */

import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (compatible; masach-showtimes/1.0)";

async function main() {
  const out = [`# גשש לב 3 — ${new Date().toISOString()}`];
  const res = await fetch("https://www.lev.co.il/location/telaviv", {
    headers: { "user-agent": UA, "accept-language": "he-IL,he;q=0.9" },
  });
  const html = await res.text();
  out.push(`סטטוס: ${res.status} · אורך: ${html.length}`);

  // כל האזורים סביב תבניות שעה (HH:MM)
  const timeRe = /\b([01]?\d|2[0-3]):[0-5]\d\b/g;
  let m, i = 0;
  const seen = new Set();
  while ((m = timeRe.exec(html)) && i < 8) {
    const start = Math.max(0, m.index - 300);
    const ctx = html.slice(start, m.index + 300).replace(/\s+/g, " ");
    if (seen.has(ctx)) continue;
    seen.add(ctx);
    out.push(`\n--- הקשר שעה #${++i} סביב אינדקס ${m.index} ---\n${ctx}`);
  }

  // סקריפטים עם JSON מוטמע (window.X = {...}, application/ld+json, data-page וכו')
  out.push(`\n\n=== סקריפטים מוטמעים מעניינים ===`);
  const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let sm, si = 0;
  while ((sm = scriptRe.exec(html)) && si < 400) {
    const attrs = sm[1], body = sm[2].trim();
    if (!body || body.length < 30) continue;
    const isInteresting = /ld\+json/i.test(attrs) ||
      /(movie|film|session|showtime|screening|theater|cinema|booking|schedule)/i.test(body);
    if (!isInteresting) continue;
    si++;
    out.push(`\n--- script #${si} attrs="${attrs.trim()}" (${body.length} תווים) ---\n${body.slice(0, 2000)}`);
  }

  // תגיות עם class/id רלוונטי
  out.push(`\n\n=== data-* / class רלוונטיים ===`);
  const classHits = [...html.matchAll(/class="([^"]*(?:movie|film|session|showtime|screening|schedule)[^"]*)"/gi)]
    .slice(0, 15).map(m2 => m2[1]);
  out.push(JSON.stringify([...new Set(classHits)]));

  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev3.md", out.join("\n"));
  console.log("נכתב data/probe-lev3.md —", out.length, "שורות");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev3.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
