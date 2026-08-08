/**
 * מסך. — סקרייפר פלאנט
 *
 * פלאנט רץ על אותה פלטפורמת quickbook של Cineworld כמו רב חן
 * (siteId 10100), רק תחת נתיב "/il/" במקום "/rh/". ה-whatson הכללי
 * לא מפעיל את ה-API כלל — צריך URL עם קולנוע נבחר (hash route
 * buy-tickets-by-cinema) כדי לגרום לאתר לירות את הקריאות האמיתיות.
 * נמצא ע"י מעקב אחר בקשות רשת אמיתיות (ראו data/probe.md).
 *
 * רץ אחרי scrape-ravhen.mjs ומוסיף את עצמו לאותם קבצים בלי לדרוס —
 * קורא את data/movies.json + data/showtimes.json הקיימים, מסנן
 * החוצה רק את הרשומות של עצמו (מזהי "pl-"), וכותב מחדש.
 *
 * כותב: data/movies.json  ו-  data/showtimes.json
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";

const SITE_ID = "10100";
const BASE = "https://www.planetcinema.co.il/il/data-api-service/v1/quickbook";
const CHAIN = "פלאנט";
const UA = "Mozilla/5.0 (compatible; masach-showtimes/1.0)";
const PAUSE = 500;
const DAYS_AHEAD = 6;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* אותה טבלת attributeIds→עברית כמו רב חן (אותה פלטפורמה, אותה
   טקסונומיה) — ראו scripts/scrape-ravhen.mjs / data/probe.md */
const GENRE_HE = {
  action: "אקשן", adventure: "הרפתקה", animation: "אנימציה", classic: "קלאסי",
  comedy: "קומדיה", crime: "פשע", documentary: "תיעודי", drama: "דרמה",
  family: "משפחה", fantasy: "פנטזיה", foreign: "זר", history: "היסטוריה",
  horror: "אימה", israeli: "ישראלי", musical: "מיוזיקל", opera: "אופרה",
  romance: "רומנטי", "sci-fi": "מדע בדיוני", thriller: "מותחן", war: "מלחמה",
  western: "מערבון",
};
const RATING_HE = {
  all: "לכל", "9-plus": "9+", "10-plus": "10+", "12-plus": "12+",
  "14-plus": "14+", "16-plus": "16+", "18-plus": "18+", pg8: "8+", pg10: "10+",
};
const pickFrom = (table, ids) => { for (const id of ids || []) if (table[id]) return table[id]; return null; };

const toMin = iso => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const toDdMmYyyy = iso => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);

async function main() {
  const log = [];
  const far = new Date();
  far.setDate(far.getDate() + 60);
  const farISO = far.toISOString().slice(0, 10);

  const cinemasResp = await getJson(
    `${BASE}/${SITE_ID}/cinemas/with-event/until/${farISO}?attr=&lang=he_IL`);
  const cinemas = (cinemasResp.body?.cinemas || []).map(c => ({
    id: `pl-${c.id}`, rawId: c.id, chain: CHAIN, name: c.displayName,
    city: c.addressInfo?.city || null, lat: c.latitude ?? null, lng: c.longitude ?? null,
  }));

  let movies = {};
  try { movies = JSON.parse(await readFile("data/movies.json", "utf8")).byId || {}; } catch {}

  const screenings = [];
  for (const c of cinemas) {
    let dates = [];
    try {
      const d = await getJson(
        `${BASE}/${SITE_ID}/dates/in-cinema/${c.rawId}/until/${farISO}?attr=&lang=he_IL`);
      dates = (d.body?.dates || []).slice(0, DAYS_AHEAD);
    } catch (e) {
      log.push(`✗ ${c.name}: משיכת תאריכים נכשלה — ${e.message}`);
      continue;
    }

    let count = 0;
    for (const date of dates) {
      await sleep(PAUSE);
      try {
        const fe = await getJson(
          `${BASE}/${SITE_ID}/film-events/in-cinema/${c.rawId}/at-date/${date}?attr=&lang=he_IL`);
        for (const f of fe.body?.films || []) {
          const mid = `pl-${f.id}`;
          if (!movies[mid]) {
            movies[mid] = {
              ccId: mid, title: f.name, titleEn: null,
              genre: pickFrom(GENRE_HE, f.attributeIds), runtime: f.length || null,
              releaseDate: toDdMmYyyy(f.releaseDate), rating: pickFrom(RATING_HE, f.attributeIds),
              synopsis: null, poster: f.posterLink || null, trailer: f.videoLink || null,
              url: f.link || null,
            };
          }
        }
        for (const ev of fe.body?.events || []) {
          screenings.push({
            movieId: `pl-${ev.filmId}`, cinemaId: c.id,
            date: ev.businessDay || date, min: toMin(ev.eventDateTime),
            hall: ev.auditorium || null,
            url: ev.bookingRouterLaunchLink || ev.bookingLink || null,
          });
          count++;
        }
      } catch (e) {
        log.push(`  · ${c.name} ${date}: ${e.message}`);
      }
    }
    log.push(`${count ? "✓" : "⚠"} ${c.name}: ${count} הקרנות · ${dates.length} ימים`);
  }

  console.log(log.join("\n"));
  if (!screenings.length) {
    console.error("\nלא נמצאה אף הקרנה של פלאנט — כנראה מבנה ה-API השתנה.");
    process.exit(1);
  }

  /* מיזוג: שומרים כל מה שאינו פלאנט מהקבצים הקיימים, מחליפים את
     החלק של פלאנט בטרי, ומצמצמים את מאגר הסרטים למה שבאמת מוקרן. */
  let existing = { cinemas: [], screenings: [] };
  try { existing = JSON.parse(await readFile("data/showtimes.json", "utf8")); } catch {}

  const keepCinemas = (existing.cinemas || []).filter(c => !c.id.startsWith("pl-"));
  const keepScreenings = (existing.screenings || []).filter(s => !s.cinemaId.startsWith("pl-"));
  const allCinemas = [...keepCinemas, ...cinemas.map(({ rawId, ...c }) => c)];
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

  console.log(`\nנשמר: ${screenings.length} הקרנות פלאנט · סה"כ ${allScreenings.length} הקרנות בקובץ`);
}

main().catch(e => { console.error(e); process.exit(1); });
