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

const stripTags = html =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, " ").trim();

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
  const re = /<a\b[^>]*href="[^"]*\/movie\/(\d+)"[^>]*>([\s\S]{0,600}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, id, inner] = m;
    if (found.has(id)) continue;
    const alt = inner.match(/alt="([^"]*?)(?:\s*poster)?"/i);
    const title = (alt ? alt[1] : stripTags(inner)).trim();
    if (title) found.set(id, { ccId: id, title });
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

  const grab = (label, pat) => {
    const m = text.match(new RegExp(label + "\\s*" + pat));
    return m ? m[1].trim() : null;
  };

  const poster =
    (html.match(/<img[^>]*alt="פוסטר"[^>]*src="([^"]+)"/i) ||
     html.match(/src="(https:\/\/cdn\.modulus\.co\.il\/[^"]*w_505[^"]*)"/i) ||
     [])[1] || null;

  const yt = (html.match(/youtube\.com\/embed\/([\w-]{6,})/i) || [])[1] || null;

  return {
    ccId,
    title:       he || null,
    titleEn:     en || null,
    genre:       grab("סיווג", "([^\\d]{2,30}?)\\s*אורך בדקות"),
    runtime:     Number(grab("אורך בדקות", "(\\d{2,3})")) || null,
    releaseDate: grab("תאריך בכורה", "(\\d{2}\\/\\d{2}\\/\\d{4})"),
    rating:      grab("הגבלת צפיה", "([^\\n]{2,25}?)\\s*(?:חייבים|הזמנת)"),
    synopsis:    (text.match(/תקציר הסרט\s+([\s\S]{20,1200}?)\s+סיווג/) || [])[1] || null,
    poster,
    trailer:     yt ? `https://www.youtube.com/watch?v=${yt}` : null,
    url:         `${BASE}/movie/${ccId}`,
  };
}

/* =================== 3. הקרנות =================== */
function parseScreenings(html, venue) {
  const out = [];
  const re = /<a\b[^>]*href="([^"]*\/order\/?\?[^"]*eventID=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, href, eventId, inner] = m;
    const text = stripTags(inner);
    const tm = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (!tm) continue;
    const time = tm[0];
    const title = dedupe(
      text.replace(time, " ").replace(/לרכישה/g, " ").replace(/\s+/g, " ").trim()
    );
    if (!title) continue;
    out.push({
      eventId, title, min: toMin(time), cinemaId: venue.id, hall: null,
      url: href.startsWith("http") ? href : BASE + (href.startsWith("/") ? "" : "/") + href,
    });
  }
  return out;
}

/* =================== ראשי =================== */
async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const log = [];

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
      const rows = parseScreenings(
        await get(`${BASE}/timehour?theathereid=${v.theaterId}&id=${v.pageId}&vid=1`, v.id), v);
      for (const s of rows) {
        let mid = byTitle.get(norm(s.title));
        if (!mid) {                                  // רץ בלוח אבל לא בקטלוג
          mid = `x-${norm(s.title)}`;
          unmatched.add(s.title);
          if (!movies[mid]) movies[mid] = { ccId: mid, title: s.title };
        }
        screenings.push({
          movieId: mid, cinemaId: v.id, date: today,
          min: s.min, hall: s.hall, url: s.url,
        });
      }
      log.push(`${rows.length ? "✓" : "⚠"} ${v.name}: ${rows.length} הקרנות`);
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

