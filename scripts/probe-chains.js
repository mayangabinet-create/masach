/* גשש חד-פעמי: מגלה איך כל רשת מגישה את לוח ההקרנות שלה.
   רץ ב-GitHub Actions (שם יש גישה לאינטרנט), כותב דוח ל-data/probe.md.
   אינו נוגע בשום קובץ נתונים קיים. */

const OUT = [];
const log = (...a) => OUT.push(a.join(" "));

const UA = { "user-agent":
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36" };

async function get(url, extra = {}) {
  const r = await fetch(url, { headers: { ...UA, ...extra }, redirect: "follow" });
  const text = await r.text();
  return { status: r.status, ct: r.headers.get("content-type") || "", text, url: r.url };
}

/* מחפש בקובצי ה-JS של האתר כתובות שנראות כמו נקודת קצה של הקרנות */
const HINT = /(grid|event|showtime|screening|session|movie|performance|feed|api)/i;
async function findEndpoints(base, page) {
  const html = (await get(base + page)).text;
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map(m => m[1])
    .filter(s => !/google|gtm|facebook|doubleclick|cloudflare|jquery|angular\.min|bootstrap/i.test(s))
    .map(s => (s.startsWith("http") ? s : base + (s.startsWith("/") ? "" : "/") + s));

  log(`\n### קובצי JS (${srcs.length})`);
  const found = new Set();
  for (const s of srcs.slice(0, 25)) {
    try {
      const js = (await get(s)).text;
      for (const m of js.matchAll(/["'](\/[A-Za-z0-9_\-\/]{4,60})["']/g)) {
        const p = m[1];
        if (HINT.test(p) && !/\.(js|css|png|jpg|svg|gif|woff)/i.test(p)) found.add(p);
      }
    } catch (e) { log("  שגיאה בקריאת", s.slice(-40), e.message); }
  }
  log("נתיבים חשודים:", [...found].slice(0, 40).join("  ") || "(לא נמצאו)");

  /* ניסיון ישיר על מועמדים נפוצים בפלטפורמה הזו */
  log("\n### ניסיון קריאה ישירה");
  const cands = [...found].slice(0, 12);
  for (const p of cands) {
    for (const q of ["", "?theaterId=1", "?theathereid=1&id=1&venueId=1"]) {
      try {
        const r = await get(base + p + q, { "x-requested-with": "XMLHttpRequest", accept: "application/json, text/html" });
        const body = r.text.trim();
        if (r.status === 200 && body.length > 80 && !/<!DOCTYPE/i.test(body.slice(0, 60))) {
          log(`✔ ${p}${q}  [${r.status} ${r.ct.split(";")[0]} ${body.length} תווים]`);
          log("   דוגמה:", body.slice(0, 220).replace(/\s+/g, " "));
        }
      } catch {}
    }
  }
}

/* קואורדינטות וכתובת של כל סניף — מתוך קישור המפה שבעמוד */
async function venues(base, ids, label) {
  log(`\n## ${label} — סניפים`);
  for (const id of ids) {
    try {
      const html = (await get(`${base}/theater/${id}`)).text;
      const name = (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1]?.trim();
      const geo = html.match(/maps\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      log(`${id} | ${name || "?"} | ${geo ? geo[1] + "," + geo[2] : "אין קואורדינטות"}`);
    } catch (e) { log(`${id} | שגיאה: ${e.message}`); }
  }
}

log("# דוח גשש —", new Date().toISOString());

log("\n## HOT CINEMA");
await venues("https://hotcinema.co.il", [16,14,1,17,9,2,15,6,8,5,3], "HOT");
await findEndpoints("https://hotcinema.co.il", "/theater/1");

log("\n## מובילנד");
await findEndpoints("https://www.movieland.co.il", "/theater/1290");

log("\n## פלאנט");
await findEndpoints("https://www.planetcinema.co.il", "/whatson");

log("\n## רב חן");
await findEndpoints("https://www.rav-hen.co.il", "/cinemas/givatayim/1058");

log("\n## קולנוע לב");
await findEndpoints("https://www.lev.co.il", "/location/telaviv");

const fs = await import("node:fs");
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/probe.md", OUT.join("\n"));
console.log("נכתב data/probe.md —", OUT.length, "שורות");
