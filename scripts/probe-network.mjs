/**
 * גשש רשת — פותח כל אתר בדפדפן אמיתי (Playwright) ומאזין לכל בקשות
 * הרשת שהאתר עצמו שולח. כך מוצאים את נקודת הקצה האמיתית שממנה
 * נטענות ההקרנות, גם כשהיא בונה ב-JS אחרי הטעינה (כמו ב-HOT/פלאנט),
 * במקום לנחש כתובות אחת-אחת.
 *
 * כותב: data/probe-network.md
 */

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

const TARGETS = [
  { name: "HOT", url: "https://hotcinema.co.il/theater/1" },
  { name: "פלאנט", url: "https://www.planetcinema.co.il/whatson" },
  { name: "רב חן", url: "https://www.rav-hen.co.il/cinemas/givatayim/1058" },
  { name: "מובילנד", url: "https://www.movieland.co.il/theater/1290" },
  { name: "לב", url: "https://www.lev.co.il/location/telaviv" },
];

const INTERESTING =
  /(showtime|session|event|film|movie|grid|time|quickbook|booking|schedule|perform|screening)/i;
const NOISE =
  /(google|gtm|facebook|doubleclick|hotjar|clarity|cloudflare|turnstile|analytics|pixel|newsletter|\.css|\.woff|\.png|\.jpg|\.svg|\.gif)/i;

async function probeOne(browser, target) {
  const page = await browser.newPage({ userAgent: UA, locale: "he-IL" });
  const hits = [];

  page.on("response", (res) => {
    const url = res.url();
    if (url === target.url || NOISE.test(url) || !INTERESTING.test(url)) return;
    hits.push({ res, url });
  });

  const lines = [];
  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000); // לתת לקריאות ה-AJAX המאוחרות לצאת
  } catch (e) {
    lines.push(`  ניווט נכשל: ${e.message}`);
  }

  for (const { res, url } of hits) {
    const ct = res.headers()["content-type"] || "";
    let snippet = "";
    try {
      if (/json|text/i.test(ct)) {
        const body = await res.text();
        snippet = body.slice(0, 400).replace(/\s+/g, " ");
      }
    } catch {}
    lines.push(`  [${res.status()} ${ct.split(";")[0]}] ${url}`);
    if (snippet) lines.push(`      ${snippet}`);
  }

  await page.close();
  return lines.length ? lines : ["  (לא נתפסו בקשות רשת מעניינות)"];
}

async function main() {
  const out = [`# גשש רשת — ${new Date().toISOString()}`];
  const browser = await chromium.launch();
  for (const t of TARGETS) {
    out.push(`\n=== ${t.name}  (${t.url})`);
    try {
      out.push(...(await probeOne(browser, t)));
    } catch (e) {
      out.push(`  שגיאה: ${e.message}`);
    }
  }
  await browser.close();
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-network.md", out.join("\n"));
  console.log("נכתב data/probe-network.md —", out.length, "שורות");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-network.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
