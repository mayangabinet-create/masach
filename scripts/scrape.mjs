/**
 * מסך. — סקרייפר סינמה סיטי
 *
 * שלושה שלבים:
 *   1. קטלוג הסרטים שרצים עכשיו           (/movies)
 *   2. פרטי כל סרט — פוסטר, ז'אנר, אורך…   (/movie/{id})
 *   3. לוח ההקרנות בכל מתחם                (/timehour)
 *
 * כותב: data/showtimes.json  ו-  data/movies.json
 *
 * הרצה:             node scripts/scrape.mjs
 * שמירת HTML גולמי:  DEBUG=1 node scripts/scrape.mjs
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";

const BASE  = "https://www.cinema-city.co.il";
const CHAIN = "סינמה סיטי";
const UA    = "Mozilla/5.0 (compatible; masach-showtimes/1.0)";
const PAUSE = 1200;                       // מנומס לשרת שלהם

const VENUES = [
  { id:"cc-gl", theaterId:1170, pageId:1,  name:"סינמה סיטי גלילות",  city:"רמת השרון",   lat:32.147, lng:34.805 },
  { id:"cc-rl", theaterId:1173, pageId:2,  name:"סינמה סיטי ראשל\"צ", city:"ראשון לציון", lat:31.972, lng:34.772 },
  { id:"cc-jm", theaterId:1174, pageId:3,  name:"סינמה סיטי ירושלים", city:"ירושלים",     lat:31.782, lng:35.203 },
  { id:"cc-ks", theaterId:1175, pageId:4,  name:"סינמה סיטי כפר סבא", city:"כפר סבא",     lat:32.177, lng:34.918 },
  { id:"cc-nt", theaterId:1176, pageId:5,  name:"סינמה סיטי נתניה",   city:"נתניה",       lat:32.280, lng:34.860 },
  { id:"cc-hd", theaterId:1350, pageId:13, name:"סינמה סיטי חדרה",    city:"חדרה",        lat:32.430, lng:34.920 },
  { id:"cc-bs", theaterId:1178, pageId:17, name:"סינמה סיטי באר שבע", city:"באר שבע",     lat:31.244, lng:34.812 },
  { id:"cc-as", theaterId:1181, pageId:25, name:"סינמה סיטי אשדוד",   city:"אשדוד",       lat:31.790, lng:34.640 },
];

/* =================== עזרים =================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* סינמה סיטי שולחים עברית כישויות מספריות (&#x5E4;) — חייבים לפענח */
const decodeEntities = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

const stripTags = html =>
  decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();

/* השם מופיע פעמיים ברצף בתוך קישור ההקרנה — מנקים */
const dedupe = t => {
  const h = Math.floor(t.length / 2);
  const a = t.slice(0, h).trim(), b = t.slice(h).trim();
  return a && a === b ? a : t;
};

/* מפתח להתאמה בין השם בלוח ההקרנות לשם בקטלוג */
const norm = t => t.replace(/[\s"'׳״\-–—:,.()]/g, "").toLowerCase();

const toMin = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

async function get(url, tag) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "he-IL,he;q=0.9" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (process.env.DEBUG && tag) {
    await mkdir("debug", { recursive: true });
    await writeFile(`debug/${tag}.html`, html);
  }
  return html;
}

/* =================== 1. קטלוג =================== */
function parseCatalog(html) {
  const found = new Map();

  /* הרשת הראשית: <div class="movie-thumb" data-linkmobile="/movie/6117"> … <img alt="שם"> … <h2>שם</h2> */
  const grid = /data-linkmobile="[^"]*\/movie\/(\d+)"([\s\S]{0,1600})/gi;
  let m;
  while ((m = grid.exec(html)) !== null) {
    const [, id, chunk] = m;
    const h2  = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const alt = chunk.match(/alt="([^"]*?)(?:\s*poster)?"/i);
    const title = stripTags(h2 ? h2[1] : (alt ? alt[1] : ""));
    if (title) found.set(id, { ccId: id, title });
  }

  /* גיבוי: קישורים בתפריט, עם השם ב-alt של הפוסטר */
  const links = /<a[^>]*href="[^"]*\/movie\/(\d+)"[^>]*>([\s\S]{0,600}?)<\/a>/gi;
  while ((m = links.exec(html)) !== null) {
    const [, id, inner] = m;
    if (found.has(id)) continue;
    const nm  = inner.match(/class="movie-name"[^>]*>([\s\S]*?)<\/span>/i);
    const alt = inner.match(/alt="([^"]*?)(?:\s*poster)?"/i);
    const title = stripTags(nm ? nm[1] : (alt ? alt[1] : inner));
    if (title && !/^מעבר לדף/.test(title)) found.set(id, { ccId: id, title });
  }

  return [...found.values()];
}

/* =================== 2. פרטי סרט =================== */
function parseMovie(html, ccId) {
  const text = stripTags(html);

  // הכותרת בפורמט "שם עברי/ENGLISH NAME"
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const full = h1 ? stripTags(h1[1]) : "";
  const slash = full.indexOf("/");
  const he = slash > -1 ? full.slice(0, slash).trim() : full.trim();
  const en = slash > -1 ? full.slice(slash + 1).trim() : null;

  /* השדות יושבים בבלוק אחד: <div class="... sivug"><p><span>תווית</span>&nbsp;ערך</p>… */
  const block = html.match(/<div[^>]*class="[^"]*sivug[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const fields = {};
  if (block) {
    const p = /<p>\s*<span>\s*([^<]+?)\s*<\/span>\s*([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = p.exec(block[1])) !== null) {
      fields[decodeEntities(m[1]).trim()] = stripTags(m[2]);
    }
  }

  /* הפוסטר: ה-src מופיע לפני ה-alt, אז תופסים את שני הסדרים */
  const poster =
    (html.match(/<img[^>]*src="([^"]+)"[^>]*alt="פוסטר"/i) ||
     html.match(/<img[^>]*alt="פוסטר"[^>]*src="([^"]+)"/i) ||
     html.match(/src="(https:\/\/cdn\.modulus\.co\.il\/[^"]*w_505[^"]*)"/i) ||
     [])[1] || null;

  const yt = (html.match(/youtube\.com\/embed\/([\w-]{6,})/i) || [])[1] || null;

  /* התקציר: הפסקה שאחרי הכותרת "תקציר הסרט" */
  const tak = html.match(/<div[^>]*class="[^"]*\btak\b[^"]*"[^>]*>\s*<div>\s*<p>([\s\S]*?)<\/p>/i);
  const synopsis = tak ? stripTags(tak[1]).slice(0, 1200) : null;

  const runtime = Number((fields["אורך בדקות"] || "").match(/\d{2,3}/)?.[0]) || null;

  return {
    ccId,
    title:       he || null,
    titleEn:     en || null,
    genre:       fields["סיווג"] || null,
    runtime,
    releaseDate: fields["תאריך בכורה"] || null,
    rating:      fields["הגבלת צפיה"] || null,
    synopsis,
    poster:      poster && poster.startsWith("/") ? BASE + poster : poster,
    trailer:     yt ? `https://www.youtube.com/watch?v=${yt}` : null,
    url:         `${BASE}/movie/${ccId}`,
  };
}

/* =================== 3. הקרנות =================== */
function parseScreenings(html, venue) {
  const out = [];
  /* המבנה האמיתי: <a href="/order/?eventID=..."> … <span class="movie-name">שם</span>
     … <span class="movie-hour">18:00</span> … </a>  */
  const re = /<a[^>]*href="([^"]*\/order\/?\?[^"]*eventID=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, href, eventId, inner] = m;
    const nameM = inner.match(/class="movie-name"[^>]*>([\s\S]*?)<\/span>/i);
    const hourM = inner.match(/class="movie-hour"[^>]*>\s*([0-2]?\d:[0-5]\d)/i);
    if (!nameM || !hourM) continue;
    const title = stripTags(nameM[1]);
    if (!title) continue;
    out.push({
      eventId, title, min: toMin(hourM[1]), cinemaId: venue.id, hall: null,
      url: href.startsWith("http") ? href : BASE + (href.startsWith("/") ? "" : "/") + href,
    });
  }
  return out;
}

/* הדף מציג 12 הקרנות בלבד; השאר נטענות דרך MoviesGridTime, עמוד אחר עמוד.
   הדפדוף ממשיך גם לימים הבאים — אין תווית תאריך בכרטיסים, אבל הרשימה
   מסודרת כרונולוגית, אז נפילה גדולה בשעה = מעבר ליום הבא. */
const MAX_DAYS  = 7;
const MAX_PAGES = 60;

async function fetchAllScreenings(v) {
  const seen = new Set(), rows = [];
  let dayOffset = 0, lastAbs = -1;

  const add = list => {
    for (const r of list) {
      if (seen.has(r.eventId)) continue;
      seen.add(r.eventId);
      let abs = dayOffset * 1440 + r.min;
      if (abs < lastAbs) {
        if (lastAbs - abs > 300) { dayOffset++; abs += 1440; }  // מעבר יום
        else abs = lastAbs;                                     // רעש קטן בסדר
      }
      lastAbs = abs;
      rows.push({ ...r, dayOffset });
    }
  };

  const first = await get(
    `${BASE}/timehour?theathereid=${v.theaterId}&id=${v.pageId}&vid=1`, v.id);
  add(parseScreenings(first, v));
  let more = first.includes("ShowMore");

  for (let page = 2; more && page <= MAX_PAGES && dayOffset <= MAX_DAYS; page++) {
    await sleep(250);
    let chunk;
    try {
      chunk = await get(
        `${BASE}/home/MoviesGridTime?page=${page}&theathereid=${v.theaterId}` +
        `&id=${v.pageId}&venueId=1`, null);
    } catch { break; }

    const before = rows.length;
    add(parseScreenings(chunk, v));
    if (rows.length === before) break;
    more = chunk.includes("ShowMore");
  }

  return rows.filter(r => r.dayOffset <= MAX_DAYS);
}

/* =================== ראשי =================== */
async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const log = [];

  /* --- 0. בדיקה: שמירת קוד ה-JS כדי לאתר את נקודת הקצה של "הצג נוספים" --- */
  if (process.env.DEBUG) {
    for (const f of ["site", "common", "init", "ticketsNew2"]) {
      try { await get(`${BASE}/js/${f}.js`, `js-${f}`); } catch {}
    }
  }

  /* --- 1. קטלוג --- */
  let catalog = [];
  try {
    catalog = parseCatalog(await get(`${BASE}/movies`, "catalog"));
    log.push(`✓ קטלוג: ${catalog.length} סרטים`);
  } catch (e) {
    log.push(`✗ קטלוג: ${e.message}`);
  }

  /* --- 2. פרטים, עם מטמון (פרטי סרט כמעט לא משתנים) --- */
  let cache = {};
  try { cache = JSON.parse(await readFile("data/movies.json", "utf8")).byId || {}; } catch {}

  const movies = {};
  let fetched = 0, cachedN = 0, failed = 0;
  for (const c of catalog) {
    if (cache[c.ccId]?.genre) { movies[c.ccId] = cache[c.ccId]; cachedN++; continue; }
    try {
      const mv = parseMovie(await get(`${BASE}/movie/${c.ccId}`, `movie-${c.ccId}`), c.ccId);
      if (!mv.title) mv.title = c.title;
      movies[c.ccId] = mv;
      fetched++;
      await sleep(PAUSE);
    } catch {
      movies[c.ccId] = { ccId: c.ccId, title: c.title, url: `${BASE}/movie/${c.ccId}` };
      failed++;
    }
  }
  log.push(`✓ פרטי סרטים: ${fetched} נמשכו · ${cachedN} מהמטמון · ${failed} נכשלו`);

  const byTitle = new Map();
  for (const m of Object.values(movies)) if (m.title) byTitle.set(norm(m.title), m.ccId);

  /* --- 3. הקרנות --- */
  const screenings = [];
  const unmatched = new Set();
  for (const v of VENUES) {
    try {
      const rows = await fetchAllScreenings(v);
      for (const s of rows) {
        let mid = byTitle.get(norm(s.title));
        if (!mid) {                                  // רץ בלוח אבל לא בקטלוג
          mid = `x-${norm(s.title)}`;
          unmatched.add(s.title);
          if (!movies[mid]) movies[mid] = { ccId: mid, title: s.title };
        }
        const d = new Date();
        d.setDate(d.getDate() + (s.dayOffset || 0));
        screenings.push({
          movieId: mid, cinemaId: v.id,
          date: d.toISOString().slice(0, 10),
          min: s.min, hall: s.hall, url: s.url,
        });
      }
      const days = new Set(rows.map(r => r.dayOffset)).size;
      log.push(`${rows.length ? "✓" : "⚠"} ${v.name}: ${rows.length} הקרנות · ${days} ימים`);
    } catch (e) {
      log.push(`✗ ${v.name}: ${e.message}`);
    }
    await sleep(PAUSE);
  }

  console.log(log.join("\n"));
  if (unmatched.size) {
    console.log(`\n⚠ ${unmatched.size} שמות בלוח ההקרנות בלי התאמה בקטלוג:`);
    console.log([...unmatched].map(t => "  · " + t).join("\n"));
  }

  if (!screenings.length) {
    console.error("\nלא נמצאה אף הקרנה — כנראה מבנה ה-HTML השתנה.");
    console.error("הרץ עם DEBUG=1 ובדוק את התיקייה debug/.");
    process.exit(1);
  }

  /* --- כתיבה --- */
  await mkdir("data", { recursive: true });

  await writeFile("data/movies.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), byId: movies }, null, 2));

  await writeFile("data/showtimes.json", JSON.stringify({
    updatedAt: new Date().toISOString(),
    date: today,
    chain: CHAIN,
    cinemas: VENUES.map(v => ({
      id: v.id, chain: CHAIN, name: v.name, city: v.city, lat: v.lat, lng: v.lng,
    })),
    movies: Object.values(movies).map(m => ({
      id: m.ccId, title: m.title,
      titleEn: m.titleEn ?? null, genre: m.genre ?? null,
      runtime: m.runtime ?? null, rating: m.rating ?? null,
      poster: m.poster ?? null, trailer: m.trailer ?? null,
      synopsis: m.synopsis ?? null, url: m.url ?? null,
    })),
    screenings,
  }, null, 2));

  const rich = Object.values(movies).filter(m => m.genre).length;
  console.log(`\nנשמר: ${screenings.length} הקרנות · ${Object.keys(movies).length} סרטים (${rich} עם ז'אנר ופוסטר)`);
}

main().catch(e => { console.error(e); process.exit(1); });
