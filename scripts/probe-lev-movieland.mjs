/**
 * גשש סבב 13 — לב, בדיקה ממוקדת אחת בלבד: הסבב הקודם קיבל שוב את
 * הגרסה המצומצמת (12.3k תווים) מכל 6 העמודים בבת אחת — כנראה סימן
 * ל-caching/rate-limit צד-שרת אחרי הרבה בקשות רצופות. במקום עוד באטש
 * מלא, בדיקה יחידה וממוקדת רק לסניף "דניאל" (היחיד שהמיקום שלו לא
 * ידוע ממקור אחר) — כדי לא להעמיס יותר על האתר.
 *
 * כותב: data/probe-lev11.md
 */

import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

async function main() {
  const out = [`# גשש לב 11 — ${new Date().toISOString()}`];
  const res = await fetch("https://www.lev.co.il/location/daniel", {
    headers: {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "he-IL,he;q=0.9,en;q=0.8",
    },
  });
  const html = await res.text();
  out.push(`אורך: ${html.length}`);

  const i = html.indexOf(">כתובת<");
  if (i > -1) out.push(html.slice(i, i + 400).replace(/\s+/g, " "));
  else out.push("(לא נמצאה כותרת 'כתובת')");

  const jsonLd = html.match(/"streetAddress"\s*:\s*"([^"]+)"[\s\S]{0,300}?"addressLocality"\s*:\s*"([^"]+)"/);
  out.push(`JSON-LD: ${jsonLd ? jsonLd[1] + " · " + jsonLd[2] : "(none)"}`);

  const title = html.match(/<title>([^<]+)<\/title>/i);
  out.push(`title: ${title ? title[1] : "(none)"}`);

  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev11.md", out.join("\n"));
  console.log("נכתב data/probe-lev11.md");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev11.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
