/* גשש סבב 2 — בדיקה ממוקדת של נקודות קצה אפשריות לכל רשת.
   ההיגיון: HOT בנויה על אותה פלטפורמה כמו סינמה סיטי (Modulus), ולכן
   סביר שאותן כתובות עובדות. פלאנט ורב חן שייכות ל-Cineworld, שלה יש
   API ידוע בשם quickbook. מובילנד רצה על BiggerPicture.
   בנוסף: בודק לכל עמוד אם השעות בכלל קיימות ב-HTML (כלומר ניתן לגרד
   ישירות) או שהן נטענות אחר כך. */

const fs = require("fs");
const OUT = [];
const log = (...a) => OUT.push(a.join(" "));
const UA = { "user-agent":
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36" };

async function get(url, extra) {
  const r = await fetch(url, { headers: Object.assign({}, UA, extra || {}), redirect: "follow" });
  return { status: r.status, ct: r.headers.get("content-type") || "", text: await r.text() };
}

const today = new Date().toISOString().slice(0, 10);

/* האם השעות מוגשות כבר ב-HTML? */
async function serverRendered(url, label) {
  try {
    const { text, status } = await get(url);
    const times = (text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || []).length;
    const links = (text.match(/(order|buy|tickets|booking|session|event)/gi) || []).length;
    log(`${label} [${status}] אורך=${text.length} שעות-ב-HTML=${times} רמזי-הזמנה=${links}`);
    if (times > 15) {
      const i = text.search(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
      log("   הקשר:", text.slice(Math.max(0, i - 260), i + 260).replace(/\s+/g, " "));
    }
  } catch (e) { log(`${label} שגיאה: ${e.message}`); }
}

async function tryUrls(label, urls) {
  log(`\n### ${label} — ניסיון נקודות קצה`);
  for (const u of urls) {
    try {
      const r = await get(u, { "x-requested-with": "XMLHttpRequest", accept: "application/json,text/html,*/*" });
      const b = r.text.trim();
      const json = /json/i.test(r.ct);
      const flag = r.status === 200 && b.length > 60 ? "V" : "x";
      log(`${flag} [${r.status} ${r.ct.split(";")[0]} ${b.length}] ${u}`);
      if (flag === "V") log("    ", b.slice(0, 260).replace(/\s+/g, " "));
    } catch (e) { log(`x ${u} — ${e.message}`); }
  }
}

async function main() {
  log("# דוח גשש 2 —", new Date().toISOString(), "| תאריך בדיקה:", today);

  log("\n## HOT CINEMA — האם מוגש בשרת");
  await serverRendered("https://hotcinema.co.il/theater/1", "theater/1");
  await serverRendered("https://hotcinema.co.il/ShowingNow", "ShowingNow");
  await tryUrls("HOT (תבנית סינמה סיטי)", [
    "https://hotcinema.co.il/home/MoviesGridTime?page=1&theathereid=1&id=1&venueId=1",
    "https://hotcinema.co.il/home/MoviesGridTime?page=1&theaterId=1",
    "https://hotcinema.co.il/timehour?theathereid=1&id=1&vid=1",
    "https://hotcinema.co.il/Home/GetEvents?theaterId=1",
    "https://hotcinema.co.il/home/GetShowTimes?theaterId=1",
    "https://hotcinema.co.il/api/events?theaterId=1",
  ]);

  log("\n## פלאנט / רב חן (Cineworld quickbook)");
  await tryUrls("פלאנט", [
    `https://www.planetcinema.co.il/api/quickbook/cinemas`,
    `https://www.planetcinema.co.il/api/quickbook/films`,
    `https://www.planetcinema.co.il/api/quickbook/10108/film-events/in-cinema/1058/at-date/${today}?attr=&lang=he_IL`,
    `https://www.planetcinema.co.il/api/cinemas`,
  ]);
  await tryUrls("רב חן", [
    `https://www.rav-hen.co.il/api/quickbook/cinemas`,
    `https://www.rav-hen.co.il/api/quickbook/10108/film-events/in-cinema/1058/at-date/${today}?attr=&lang=he_IL`,
  ]);
  await serverRendered("https://www.rav-hen.co.il/cinemas/givatayim/1058", "רב חן גבעתיים");

  log("\n## מובילנד");
  await serverRendered("https://www.movieland.co.il/theater/1290", "movieland theater/1290");
  await serverRendered("https://www.movieland.co.il/", "movieland home");

  log("\n## קולנוע לב");
  await serverRendered("https://www.lev.co.il/location/telaviv", "lev telaviv");

  /* רשימת קובצי ה-JS המלאה — כדי שאפשר יהיה לבדוק אותם ידנית */
  log("\n## קובצי JS לבדיקה ידנית");
  for (const [name, url] of [
    ["HOT", "https://hotcinema.co.il/theater/1"],
    ["פלאנט", "https://www.planetcinema.co.il/whatson"],
    ["מובילנד", "https://www.movieland.co.il/theater/1290"],
    ["לב", "https://www.lev.co.il/location/telaviv"],
  ]) {
    try {
      const html = (await get(url)).text;
      const re = /<script[^>]+src=["']([^"']+)["']/gi;
      const list = [];
      let m;
      while ((m = re.exec(html))) list.push(m[1]);
      log(`\n${name}:`);
      list.filter(s => !/google|gtm|facebook|doubleclick|hotjar|clarity/i.test(s))
          .slice(0, 20).forEach(s => log("  " + s));
    } catch (e) { log(name, "שגיאה:", e.message); }
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
