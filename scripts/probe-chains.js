/* גשש חד-פעמי: מגלה איך כל רשת קולנוע מגישה את לוח ההקרנות שלה.
   רץ ב-GitHub Actions, כותב דוח ל-data/probe.md. לא נוגע בשום נתון קיים.
   נכתב כ-CommonJS בכוונה כדי שיעבוד בכל מקרה, גם בשם .js */

const fs = require("fs");

const OUT = [];
const log = (...a) => OUT.push(a.join(" "));

const UA = { "user-agent":
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36" };

async function get(url, extra) {
  const r = await fetch(url, { headers: Object.assign({}, UA, extra || {}), redirect: "follow" });
  const text = await r.text();
  return { status: r.status, ct: r.headers.get("content-type") || "", text };
}

const HINT = /(grid|event|showtime|screening|session|movie|performance|feed|api)/i;

async function findEndpoints(base, page) {
  log("\n### קובצי JS");
  let html = "";
  try { html = (await get(base + page)).text; }
  catch (e) { log("לא הצלחתי לטעון את העמוד:", e.message); return; }

  const srcs = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let s = m[1];
    if (/google|gtm|facebook|doubleclick|cloudflare|jquery|bootstrap|angular\.min/i.test(s)) continue;
    if (!/^https?:/.test(s)) s = base + (s[0] === "/" ? "" : "/") + s;
    srcs.push(s);
  }
  log("נמצאו", srcs.length, "קבצים");

  const found = new Set();
  for (const s of srcs.slice(0, 25)) {
    try {
      const js = (await get(s)).text;
      const pr = /["'](\/[A-Za-z0-9_\-\/]{4,60})["']/g;
      let p;
      while ((p = pr.exec(js))) {
        const path = p[1];
        if (HINT.test(path) && !/\.(js|css|png|jpg|svg|gif|woff)/i.test(path)) found.add(path);
      }
    } catch (e) { log("  שגיאה:", s.slice(-45), e.message); }
  }
  const list = Array.from(found);
  log("נתיבים חשודים:", list.slice(0, 40).join("  ") || "(לא נמצאו)");

  log("\n### ניסיון קריאה ישירה");
  for (const p of list.slice(0, 12)) {
    for (const q of ["", "?theaterId=1", "?theathereid=1&id=1&venueId=1"]) {
      try {
        const r = await get(base + p + q, {
          "x-requested-with": "XMLHttpRequest",
          accept: "application/json, text/html",
        });
        const body = r.text.trim();
        if (r.status === 200 && body.length > 80 && !/^<!DOCTYPE/i.test(body.slice(0, 60))) {
          log("V " + p + q + "  [" + r.status + " " + r.ct.split(";")[0] + " " + body.length + " תווים]");
          log("   דוגמה:", body.slice(0, 220).replace(/\s+/g, " "));
        }
      } catch (e) {}
    }
  }
}

async function venues(base, ids, label) {
  log("\n## " + label + " — סניפים (שם | קואורדינטות | כתובת)");
  for (const id of ids) {
    try {
      const html = (await get(base + "/theater/" + id)).text;
      const name = (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1];
      const geo = html.match(/maps\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      const addr = (html.match(/כתובת<\/[^>]+>\s*([^<]{4,80})/) || [])[1];
      log(id + " | " + (name ? name.trim() : "?") +
          " | " + (geo ? geo[1] + "," + geo[2] : "אין") +
          " | " + (addr ? addr.trim() : "-"));
    } catch (e) { log(id + " | שגיאה: " + e.message); }
  }
}

async function main() {
  log("# דוח גשש —", new Date().toISOString());

  log("\n## HOT CINEMA");
  await venues("https://hotcinema.co.il", [16, 14, 1, 17, 9, 2, 15, 6, 8, 5, 3], "HOT");
  await findEndpoints("https://hotcinema.co.il", "/theater/1");

  log("\n## מובילנד");
  await findEndpoints("https://www.movieland.co.il", "/theater/1290");

  log("\n## פלאנט");
  await findEndpoints("https://www.planetcinema.co.il", "/whatson");

  log("\n## רב חן");
  await findEndpoints("https://www.rav-hen.co.il", "/cinemas/givatayim/1058");

  log("\n## קולנוע לב");
  await findEndpoints("https://www.lev.co.il", "/location/telaviv");

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/probe.md", OUT.join("\n"));
  console.log("נכתב data/probe.md —", OUT.length, "שורות");
}

main().catch(e => {
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/probe.md", OUT.join("\n") + "\n\n!! קריסה: " + e.stack);
  console.error(e);
});
