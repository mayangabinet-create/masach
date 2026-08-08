/**
 * גשש סבב 6 — לב: הניסיון הקודם (סבב 5) עם UA מזהה-עצמי
 * ("masach-showtimes/1.0") קיבל תשובה מצומצמת (11,949 תווים, 0
 * תבניות-שעה) — שונה לגמרי מדוח הגשש הראשון (data/probe.md), ששלף
 * את אותו עמוד בדיוק עם UA של דפדפן אמיתי (Chrome/125) וקיבל 94,993
 * תווים + 5 תבניות-שעה + 73 רמזי-הזמנה. כלומר האתר (וורדפרס, קרוב
 * לוודאי עם פלאגין קאשינג/אבטחה כמו Wordfence) מבחין בין UA "אמיתי"
 * ל-UA מזהה-עצמי ומגיש דף מצומצם לשני. כאן: חוזרים עם UA/כותרות של
 * דפדפן אמיתי (בדיוק כמו ב-probe-chains.js שכבר הוכיח שזה עובד) כדי
 * לתפוס את ההקשר האמיתי סביב תבניות-השעה ולבנות פרסר.
 *
 * כותב: data/probe-lev4.md
 */

import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

async function fetchPage(slug) {
  const res = await fetch(`https://www.lev.co.il/location/${slug}`, {
    headers: {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "accept-language": "he-IL,he;q=0.9,en;q=0.8",
    },
  });
  return { status: res.status, html: await res.text() };
}

async function main() {
  const out = [`# גשש לב 4 — ${new Date().toISOString()}`];
  const { status, html } = await fetchPage("telaviv");
  out.push(`סטטוס: ${status} · אורך: ${html.length}`);

  const timeRe = /\b([01]?\d|2[0-3]):[0-5]\d\b/g;
  let m, i = 0;
  const seen = new Set();
  while ((m = timeRe.exec(html)) && i < 6) {
    const start = Math.max(0, m.index - 500);
    const ctx = html.slice(start, m.index + 500).replace(/\s+/g, " ");
    if (seen.has(ctx)) continue;
    seen.add(ctx);
    out.push(`\n--- הקשר שעה #${++i} סביב אינדקס ${m.index} ---\n${ctx}`);
  }

  if (i === 0) {
    out.push("\n(שוב 0 תבניות-שעה — מדפיסים 3000 תווים ראשונים לבדיקה ידנית)");
    out.push(html.slice(0, 3000));
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev4.md", out.join("\n"));
  console.log("נכתב data/probe-lev4.md —", out.length, "שורות");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev4.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
