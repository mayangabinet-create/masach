/**
 * גשש סבב 12 — לב, אחרון: כתובות כל 6 הסניפים (לצורך קואורדינטות
 * למרחק באפליקציה). כל עמוד סניף מציג בלוק "כתובת" (נראה בצילום
 * המסך של סבב 6). שולפים את הטקסט הסמוך לכותרת הזו מכל 6 העמודים.
 *
 * כותב: data/probe-lev10.md
 */

import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const SLUGS = ["telaviv", "even-yehuda", "smadar", "raanana", "omer", "daniel"];

async function main() {
  const out = [`# גשש לב 10 — ${new Date().toISOString()}`];
  for (const slug of SLUGS) {
    const res = await fetch(`https://www.lev.co.il/location/${slug}`, {
      headers: {
        "user-agent": UA,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "he-IL,he;q=0.9,en;q=0.8",
      },
    });
    const html = await res.text();
    out.push(`\n=== ${slug} (${html.length} תווים) ===`);
    const i = html.indexOf(">כתובת<");
    if (i > -1) {
      out.push(html.slice(i, i + 400).replace(/\s+/g, " "));
    } else {
      out.push("(לא נמצאה כותרת 'כתובת')");
      // ניסיון גיבוי: לחפש שם רחוב/עיר בקרבת "location" meta
      const m = html.match(/"streetAddress"\s*:\s*"([^"]+)"[\s\S]{0,200}?"addressLocality"\s*:\s*"([^"]+)"/);
      if (m) out.push(`JSON-LD address: ${m[1]} · ${m[2]}`);
    }
  }
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev10.md", out.join("\n"));
  console.log("נכתב data/probe-lev10.md");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev10.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
