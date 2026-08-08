/**
 * מסך. — סקרייפר HOT CINEMA
 *
 * לוח ההקרנות: tickets/TheaterEvents2 — JSON נקי לפי (סניף, תאריך),
 * נמצא ע"י מעקב אחר בקשות רשת אמיתיות (ראו data/probe-network.md).
 * רשימת הסניפים (מזהה+שם) חולצה מהמערך המוטמע בעמוד /theater/1.
 *
 * דף הסרט (/movie/{id}) הוא מבנה משלו (לא זהה לסינמה סיטי): כותרת
 * עברית ב-h1, אנגלית ב-h2, פוסטר = התמונה הראשונה תחת "movie-details",
 * תקציר בתוך div.desc1. ז'אנר/אורך/דירוג-גיל לא נמצא להם מיקום אמין
 * עדיין ונשארים null (ראו data/probe.md).
 *
 * רץ אחרי scrape.mjs + scrape-ravhen.mjs, ומוסיף את עצמו לאותם
 * קבצים בלי לדרוס (מזהי "hot-").
 *
 * כותב: data/movies.json  ו-  data/showtimes.json
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";

const BASE = "https://hotcinema.co.il";
const CHAIN = "HOT";
const UA = "Mozilla/5.0 (compatible; masach-showtimes/1.0)";
const PAUSE = 350;
const DAYS_AHEAD = 5;

/* ID + שם ("Name" בעברית) + עיר משוערכת + קואורדינטות עיר (רמת דיוק
   זהה לזו שכבר בשימוש ב-VENUES של scrape.mjs — מרכז עיר, לא הקניון
   המדויק). סניף 3 מגיע מהאתר עם שם ריק אבל NameRussian="Натания". */
const THEATERS = [
  { id: 16, name: "כפר סבא",   city: "כפר סבא",    lat: 32.177, lng: 34.918 },
  { id: 14, name: "פתח תקווה", city: "פתח תקווה",  lat: 32.090, lng: 34.887 },
  { id: 1,  name: "מודיעין",   city: "מודיעין",    lat: 31.898, lng: 35.011 },
  { id: 17, name: "רחובות",    city: "רחובות",     lat: 31.894, lng: 34.809 },
  { id: 9,  name: "חיפה",      city: "חיפה",       lat: 32.794, lng: 34.989 },
  { id: 2,  name: "קריון",     city: "קרית אתא",   lat: 32.812, lng: 35.093 },
  { id: 15, name: "כרמיאל",    city: "כרמיאל",     lat: 32.917, lng: 35.295 },
  { id: 6,  name: "נהריה",     city: "נהריה",      lat: 33.006, lng: 35.094 },
  { id: 8,  name: "אשקלון",    city: "אשקלון",     lat: 31.669, lng: 34.571 },
  { id: 5,  name: "אשדוד",     city: "אשדוד",      lat: 31.790, lng: 34.640 },
  { id: 3,  name: "נתניה",     city: "נתניה",      lat: 32.280, lng: 34.860 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

const decodeEntities = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

const stripTags = html => decodeEntities(
  html.replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
).replace(/\s+/g, " ").trim();

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "he-IL,he;q=0.9" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* פרטי סרט — HOT: <h1>שם עברי</h1><h2>שם אנגלי</h2>, פוסטר = התמונה
   הראשונה בתוך אזור "movie-details", תקציר בתוך div.desc1.
   ראו data/probe.md — "explore hot movie page markup". */
function parseMovie(html, movieId, fallbackTitle) {
  /* העמוד מכיל שני <h1> זהים (גרסת מובייל/דסקטופ) — רק זה שב"col
     left-side" מלווה מיד ב-<h2> עם השם האנגלי, אז מחפשים את הצמד. */
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  let title = null, titleEn = null;
  for (const m of h1s) {
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 500);
    const h2 = after.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (h2) { title = stripTags(m[1]); titleEn = stripTags(h2[1]); break; }
  }
  if (!title) title = h1s.length ? stripTags(h1s[0][1]) : (fallbackTitle || null);

  const di = html.indexOf("movie-details");
  const posterRaw = di > -1 ? (html.slice(di, di + 2000).match(/<img[^>]*src="([^"]+)"/i) || [])[1] : null;
  const poster = posterRaw ? decodeEntities(posterRaw) : null;

  const desc1 = html.match(/<div[^>]*class="[^"]*\bdesc1\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const synopsis = desc1 ? stripTags(desc1[1]).slice(0, 1200) : null;

  const yt = (html.match(/youtube\.com\/embed\/([\w-]{6,})/i) || [])[1] || null;

  return {
    ccId: `hot-${movieId}`, title, titleEn,
    genre: null, runtime: null, releaseDate: null, rating: null,
    synopsis, poster: poster && poster.startsWith("/") ? BASE + poster : poster,
    trailer: yt ? `https://www.youtube.com/watch?v=${yt}` : null,
    url: `${BASE}/movie/${movieId}`,
  };
}

const ddmmyyyy = d =>
  String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
const toMin = iso => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };

async function main() {
  const log = [];
  let movies = {};
  try { movies = JSON.parse(await readFile("data/movies.json", "utf8")).byId || {}; } catch {}

  const screenings = [];
  const movieNames = new Map();

  for (const t of THEATERS) {
    let count = 0;
    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      const dateStr = ddmmyyyy(d);
      const isoDate = d.toISOString().slice(0, 10);
      await sleep(PAUSE);
      try {
        const data = await getJson(
          `${BASE}/tickets/TheaterEvents2?movieid=undefined&date=${dateStr}&theatreid=${t.id}` +
          `&site=undefined&time=&type=undefined&lang=&kinorai=undefined&genreId=0&screentype=&subdub=&isnew=false`);
        for (const te of data.TheaterEvents || []) {
          movieNames.set(te.MovieId, te.MovieName);
          for (const dt of te.Dates || []) {
            screenings.push({
              movieId: `hot-${te.MovieId}`, cinemaId: `hot-${t.id}`,
              date: isoDate, min: toMin(dt.Date), hall: null,
              url: `${BASE}/order/?eventID=${dt.EventId}`,
            });
            count++;
          }
        }
      } catch (e) {
        log.push(`  · ${t.name} ${dateStr}: ${e.message}`);
      }
    }
    log.push(`${count ? "✓" : "⚠"} HOT ${t.name}: ${count} הקרנות`);
  }

  let fetched = 0, failed = 0;
  for (const [mid, name] of movieNames) {
    const key = `hot-${mid}`;
    if (movies[key]?.poster && movies[key]?.titleEn) continue;
    try {
      movies[key] = parseMovie(await get(`${BASE}/movie/${mid}`), mid, name);
      fetched++;
      await sleep(PAUSE);
    } catch {
      movies[key] = { ccId: key, title: name || movies[key]?.title || null, url: `${BASE}/movie/${mid}` };
      failed++;
    }
  }
  log.push(`✓ פרטי סרטים HOT: ${fetched} נמשכו · ${failed} נכשלו`);

  console.log(log.join("\n"));
  if (!screenings.length) {
    console.error("\nלא נמצאה אף הקרנה של HOT — כנראה מבנה ה-API השתנה.");
    process.exit(1);
  }

  /* מיזוג: שומרים כל מה שאינו HOT מהקבצים הקיימים */
  let existing = { cinemas: [], screenings: [] };
  try { existing = JSON.parse(await readFile("data/showtimes.json", "utf8")); } catch {}

  const keepCinemas = (existing.cinemas || []).filter(c => !c.id.startsWith("hot-"));
  const keepScreenings = (existing.screenings || []).filter(s => !s.cinemaId.startsWith("hot-"));
  const allCinemas = [
    ...keepCinemas,
    ...THEATERS.map(t => ({ id: `hot-${t.id}`, chain: CHAIN, name: `HOT ${t.name}`, city: t.city, lat: t.lat, lng: t.lng })),
  ];
  const allScreenings = [...keepScreenings, ...screenings];

  const referenced = new Set(allScreenings.map(s => s.movieId));
  for (const id of Object.keys(movies)) if (!referenced.has(id)) delete movies[id];

  await mkdir("data", { recursive: true });
  await writeFile("data/movies.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), byId: movies }, null, 2));

  await writeFile("data/showtimes.json", JSON.stringify({
    updatedAt: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    chain: [...new Set(allCinemas.map(c => c.chain))].join(", "),
    cinemas: allCinemas,
    movies: Object.values(movies).map(m => ({
      id: m.ccId, title: m.title,
      titleEn: m.titleEn ?? null, genre: m.genre ?? null,
      runtime: m.runtime ?? null, rating: m.rating ?? null,
      poster: m.poster ?? null, trailer: m.trailer ?? null,
      synopsis: m.synopsis ?? null, url: m.url ?? null,
    })),
    screenings: allScreenings,
  }, null, 2));

  console.log(`\nנשמר: ${screenings.length} הקרנות HOT · סה"כ ${allScreenings.length} הקרנות בקובץ`);
}

main().catch(e => { console.error(e); process.exit(1); });
