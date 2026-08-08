/**
 * מסך. — סקרייפר קולנוע לב
 *
 * לב הוא אתר וורדפרס (לא Cineworld/Modulus כמו שאר הרשתות). לוח
 * ההקרנות לא נטען מ-JSON API אלא מקובץ תבנית ישיר בתוך התֶמה:
 *   wp-content/themes/lev/ajax_data.php?action=movie_on_location_new
 *   &loc={שם הסניף בעברית}&date=YYYY-MM-DD
 * שמחזיר שברי HTML (<li> לכל הקרנה, לא JSON) — נמצא ע"י מעקב אחר
 * בקשות רשת אמיתיות תוך אינטראקציה עם ה-<select> של "הזמנת כרטיסים"
 * (ראו data/probe-lev7.md, probe-lev8.md, probe-lev9.md). הקריאה
 * הראשונה שנראתה חשודה (m6-*.on.aws/events) התבררה כפיקסל פייסבוק
 * לא-קשור (data/probe-lev2.md) — טעות שתוקנה.
 *
 * מזהה "loc" חייב להיות בדיוק המחרוזת שמופיעה כ-<option selected>
 * בעמוד הסניף עצמו, לא כל שם תצוגה — אומת ידנית לכל 6 הסניפים
 * (data/probe-lev9.md). כתובות הסניפים מתוך בלוק "כתובת" בעמוד כל
 * סניף (data/probe-lev10.md, probe-lev11.md); קואורדינטות ברמת דיוק
 * עיר/שכונה, כמו בשאר הסקרייפרים.
 *
 * פרטי סרט (פוסטר/תקציר) — מתוך תגיות og: שמייצר פלאגין ה-SEO
 * (AIOSEO) בעמוד כל סרט; ייתכן שחלק חסרים ונשארים null.
 *
 * רץ אחרי scrape.mjs + scrape-ravhen.mjs + scrape-hot.mjs +
 * scrape-planet.mjs, ומוסיף את עצמו לאותם קבצים בלי לדרוס (מזהי "lev-").
 *
 * כותב: data/movies.json  ו-  data/showtimes.json
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";

const BASE = "https://www.lev.co.il";
const CHAIN = "לב";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const PAUSE = 500;
const DAYS_AHEAD = 5;

/* loc = המחרוזת המדויקת שהאתר מצפה לה (אומת ב-data/probe-lev9.md).
   קואורדינטות ברמת דיוק שכונה/עיר (כתובות מלאות ב-data/probe-lev10.md,
   probe-lev11.md). */
const BRANCHES = [
  { id: "telaviv", loc: "לב תל אביב", name: "לב תל אביב (דיזנגוף סנטר)", city: "תל אביב", lat: 32.0748, lng: 34.7738 },
  { id: "even-yehuda", loc: "לב אבן יהודה", name: "לב אבן יהודה", city: "אבן יהודה", lat: 32.2725, lng: 34.8868 },
  { id: "smadar", loc: "לב סמדר", name: "לב סמדר (המושבה הגרמנית)", city: "ירושלים", lat: 31.7643, lng: 35.2215 },
  { id: "raanana", loc: "לב רעננה", name: "לב רעננה", city: "רעננה", lat: 32.1860, lng: 34.8678 },
  { id: "omer", loc: "לב עומר", name: "לב עומר", city: "עומר", lat: 31.2659, lng: 34.8476 },
  { id: "daniel", loc: "לב דניאל", name: "לב דניאל (הרצליה פיתוח)", city: "הרצליה", lat: 32.1670, lng: 34.7960 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "he-IL,he;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const decodeEntities = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

const stripTags = html => decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const toIso = d => d.toISOString().slice(0, 10);
const toMin = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/* מוציא slug של סרט מתוך /movies/{slug}/ (מפוענח, לשימוש כמזהה יציב —
   ללב אין מזהה מספרי לסרט עצמו, רק "pcode" שהוא לכל שילוב סרט+שעה+קולנוע). */
function movieSlugFromUrl(url) {
  const m = url.match(/\/movies\/([^/]+)\/?/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/* פרסור שבר ה-HTML שמחזיר ajax_data.php: <li> אחד לכל הקרנה, עם
   כפילות מוערת-החוצה (<!--...-->) אחרי כל אחד — צריך להסיר קודם
   (ראו data/probe-lev8.md). */
function parseScreenings(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const out = [];
  const liRe = /<li>([\s\S]*?)<\/li>/g;
  let li;
  while ((li = liRe.exec(clean))) {
    const block = li[1];
    const head = block.match(
      /<a href="([^"]+)"\s+class="topmenua"\s+data-pcode="([^"]*)"\s+data-siteid="([^"]*)">([\s\S]*?)<span>(\d{1,2}:\d{2})<\/span>/);
    if (!head) continue;
    const movieLink = block.match(/<a href="([^"]+)"\s+class="smovielink">/);
    const [, orderUrl, pcode, siteId, rawTitle, time] = head;
    const title = stripTags(rawTitle);
    if (!title) continue;
    out.push({
      title, time, pcode, siteId,
      orderUrl: decodeEntities(orderUrl),
      movieUrl: movieLink ? decodeEntities(movieLink[1]) : null,
    });
  }
  return out;
}

function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = html.match(re) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

/* לפעמים lev.co.il מגיש (קאשינג/הגבלת-קצב בצד שרת) גרסה מצומצמת של
   העמוד בלי תוכן/תמונות אמיתיים (~12k תווים, לעומת ~95k בגרסה המלאה —
   ראו data/probe.md). מזהים לפי אורך ומנסים שוב אחרי המתנה. */
async function parseMovie(url, fallbackTitle) {
  let html = await getHtml(url);
  if (html.length < 20000) {
    await sleep(2500);
    html = await getHtml(url);
  }
  const ogTitle = metaContent(html, "og:title");
  const title = (ogTitle ? ogTitle.split("|")[0].trim() : null) || fallbackTitle;
  return {
    title,
    titleEn: null,
    genre: null, runtime: null, releaseDate: null, rating: null,
    synopsis: metaContent(html, "og:description"),
    poster: metaContent(html, "og:image"),
    trailer: null,
    url,
  };
}

async function main() {
  const log = [];
  let movies = {};
  try { movies = JSON.parse(await readFile("data/movies.json", "utf8")).byId || {}; } catch {}

  const screenings = [];
  const movieUrlBySlug = new Map();

  for (const b of BRANCHES) {
    let count = 0;
    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      const isoDate = toIso(d);
      await sleep(PAUSE);
      try {
        const url = `${BASE}/wp-content/themes/lev/ajax_data.php?clang=he&action=movie_on_location_new&loc=${encodeURIComponent(b.loc)}&date=${isoDate}`;
        const html = await getHtml(url);
        for (const s of parseScreenings(html)) {
          if (!s.movieUrl) continue;
          const slug = movieSlugFromUrl(s.movieUrl);
          if (!slug) continue;
          const movieId = `lev-${slug}`;
          movieUrlBySlug.set(slug, { url: s.movieUrl, title: s.title });
          screenings.push({
            movieId, cinemaId: `lev-${b.id}`,
            date: isoDate, min: toMin(s.time), hall: null,
            url: s.orderUrl,
          });
          count++;
        }
      } catch (e) {
        log.push(`  · ${b.name} ${isoDate}: ${e.message}`);
      }
    }
    log.push(`${count ? "✓" : "⚠"} ${b.name}: ${count} הקרנות`);
  }

  let fetched = 0, failed = 0;
  for (const [slug, info] of movieUrlBySlug) {
    const key = `lev-${slug}`;
    if (movies[key]?.poster) continue;
    try {
      movies[key] = { ccId: key, ...(await parseMovie(info.url, info.title)) };
      fetched++;
      await sleep(PAUSE);
    } catch {
      movies[key] = { ccId: key, title: info.title, titleEn: null, url: info.url };
      failed++;
    }
  }
  log.push(`✓ פרטי סרטים לב: ${fetched} נמשכו · ${failed} נכשלו`);

  console.log(log.join("\n"));
  if (!screenings.length) {
    console.error("\nלא נמצאה אף הקרנה של לב — כנראה מבנה ה-endpoint השתנה.");
    process.exit(1);
  }

  /* מיזוג: שומרים כל מה שאינו לב מהקבצים הקיימים */
  let existing = { cinemas: [], screenings: [] };
  try { existing = JSON.parse(await readFile("data/showtimes.json", "utf8")); } catch {}

  const keepCinemas = (existing.cinemas || []).filter(c => !c.id.startsWith("lev-"));
  const keepScreenings = (existing.screenings || []).filter(s => !s.cinemaId.startsWith("lev-"));
  const allCinemas = [
    ...keepCinemas,
    ...BRANCHES.map(b => ({ id: `lev-${b.id}`, chain: CHAIN, name: b.name, city: b.city, lat: b.lat, lng: b.lng })),
  ];
  const allScreenings = [...keepScreenings, ...screenings];

  const referenced = new Set(allScreenings.map(s => s.movieId));
  for (const id of Object.keys(movies)) if (!referenced.has(id)) delete movies[id];

  await mkdir("data", { recursive: true });
  await writeFile("data/movies.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), byId: movies }, null, 2));

  await writeFile("data/showtimes.json", JSON.stringify({
    updatedAt: new Date().toISOString(),
    date: toIso(new Date()),
    chain: [...new Set(allCinemas.map(c => c.chain))].join(", "),
    cinemas: allCinemas,
    movies: Object.values(movies).map(m => ({
      id: m.ccId,
      title: m.title,
      titleEn: m.titleEn ?? null, genre: m.genre ?? null,
      runtime: m.runtime ?? null, rating: m.rating ?? null,
      poster: m.poster ?? null, trailer: m.trailer ?? null,
      synopsis: m.synopsis ?? null, url: m.url ?? null,
    })),
    screenings: allScreenings,
  }, null, 2));

  console.log(`\nנשמר: ${screenings.length} הקרנות לב · סה"כ ${allScreenings.length} הקרנות בקובץ`);
}

main().catch(e => { console.error(e); process.exit(1); });
