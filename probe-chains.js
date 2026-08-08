/* גשש סבב 3 — קורא את קובצי ה-JS הספציפיים של כל אתר ומחפש בתוכם
   את הכתובת שממנה נמשכות השעות. */

const fs = require("fs");
const OUT = [];
const log = (...a) => OUT.push(a.join(" "));

const BROWSER = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "he-IL,he;q=0.9,en;q=0.8",
};

async function get(url, extra) {
  const r = await fetch(url, { headers: Object.assign({}, BROWSER, extra || {}), redirect: "follow" });
  return { status: r.status, ct: r.headers.get("content-type") || "", text: await r.text() };
}

/* מחפש בקובץ JS כל דבר שנראה כמו קריאת רשת */
async function grepJs(url, label) {
  try {
    const { status, text } = await get(url);
    log(`\n--- ${label} [${status}] ${text.length} תווים`);
    if (status !== 200) return;
    const hits = new Set();
    const pats = [
      /url\s*:\s*["'`]([^"'`]{4,90})["'`]/gi,
      /\$\.(get|post|ajax|getJSON)\s*\(\s*["'`]([^"'`]{4,90})["'`]/gi,
      /fetch\s*\(\s*["'`]([^"'`]{4,90})["'`]/gi,
      /axios\.\w+\s*\(\s*["'`]([^"'`]{4,90})["'`]/gi,
      /["'`](\/[A-Za-z0-9_\-\/]*(?:Grid|Event|Show|Session|Movie|Time|Book|Order|Feed|Api)[A-Za-z0-9_\-\/]*)["'`]/g,
    ];
    for (const p of pats) {
      let m;
      while ((m = p.exec(text))) {
        const v = m[2] || m[1];
        if (v && !/\.(png|jpg|svg|gif|css|woff)/i.test(v)) hits.add(v);
      }
    }
    const list = [...hits].slice(0, 45);
    log(list.length ? list.map(x => "  " + x).join("\n") : "  (כלום)");
  } catch (e) { log(`${label} שגיאה: ${e.message}`); }
}

async function main() {
  log("# דוח גשש 3 —", new Date().toISOString());

  log("\n## HOT — קובצי הליבה");
  for (const f of ["/js/init.js", "/js/common.js", "/js/sidemenu2.js"])
    await grepJs("https://hotcinema.co.il" + f, "HOT " + f);

  log("\n## פלאנט — כל קובצי הסקריפט בעמוד");
  try {
    const html = (await get("https://www.planetcinema.co.il/whatson")).text;
    const re = /<script[^>]+src=["']([^"']+)["']/gi;
    const all = [];
    let m;
    while ((m = re.exec(html))) all.push(m[1]);
    log("סה\"כ:", all.length);
    all.forEach(s => log("  " + s));
    /* בודק את הקבצים שנראים כמו קוד האפליקציה עצמה */
    const app = all.filter(s => /app|main|site|whatson|film|cinema|bundle|widget/i.test(s)).slice(0, 6);
    for (const s of app)
      await grepJs(s.startsWith("http") ? s : "https://www.planetcinema.co.il" + (s[0] === "/" ? "" : "/") + s, "פלאנט " + s.slice(-40));
  } catch (e) { log("פלאנט שגיאה:", e.message); }

  log("\n## לב — קובץ התבנית");
  await grepJs("https://www.lev.co.il/wp-content/themes/lev/js/script.js?ver=3.9.5", "לב script.js");
  log("\n## לב — האם השעות ב-HTML");
  try {
    const t = (await get("https://www.lev.co.il/location/telaviv")).text;
    const i = t.indexOf("</head>");
    const body = t.slice(i);
    const times = body.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || [];
    log("שעות בגוף העמוד:", times.length, times.slice(0, 20).join(" "));
    const j = body.search(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    if (j > -1) log("הקשר:", body.slice(Math.max(0, j - 400), j + 400).replace(/\s+/g, " "));
  } catch (e) { log("לב שגיאה:", e.message); }

  log("\n## מובילנד — ניסיון עם כותרות דפדפן מלאות");
  for (const u of ["https://www.movieland.co.il/", "https://movieland.co.il/"]) {
    try {
      const r = await get(u, { referer: "https://www.google.com/" });
      log(`[${r.status}] ${u} — ${r.text.length} תווים`);
      if (r.status === 200) {
        const re = /<script[^>]+src=["']([^"']+)["']/gi;
        let m; const l = [];
        while ((m = re.exec(r.text))) l.push(m[1]);
        l.slice(0, 20).forEach(s => log("  " + s));
      }
    } catch (e) { log(u, "שגיאה:", e.message); }
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/probe.md", OUT.join("\n"));
  console.log("נכתב —", OUT.length, "שורות");
}

main().catch(e => {
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/probe.md", OUT.join("\n") + "\n\n!! קריסה: " + e.stack);
  console.error(e);
});
