/**
 * גשש סבב 11 — לב, ווידוא אחרון: סבב 10 הוכיח שהקריאה
 * wp-content/themes/lev/ajax_data.php?action=movie_on_location_new
 * &loc={שם}&date={YYYY-MM-DD} מחזירה HTML עם *כל* ההקרנות של אותו
 * קולנוע+תאריך (סרט, שעה, pcode/loc-id להזמנה, קישור לעמוד הסרט) —
 * זה בדיוק מה שצריך לסקרייפר. נשאר לוודא את מחרוזת ה-loc המדויקת
 * לכל אחד מ-6 הסניפים (לא רק תל אביב). כל עמוד סניף מכיל <select>
 * עם <option selected> לסניף שלו עצמו — שם בודקים.
 *
 * כותב: data/probe-lev9.md
 */

import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const SLUGS = ["telaviv", "ramat-hasharon", "even-yehuda", "smadar", "raanana", "omer", "daniel"];
const TEST_DATE = "2026-08-11"; // יום שלישי — אמצע שבוע, לא "עוד לא מוכן"

async function getPage(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "he-IL,he;q=0.9,en;q=0.8",
    },
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  const out = [`# גשש לב 9 — ${new Date().toISOString()}`];

  for (const slug of SLUGS) {
    out.push(`\n=== ${slug} ===`);
    const { status, text } = await getPage(`https://www.lev.co.il/location/${slug}`);
    if (status !== 200) { out.push(`  סטטוס עמוד: ${status} — מדלגים`); continue; }

    // לחפש <option ... selected...>שם</option> בתוך select של הווידג'ט
    const selMatch = text.match(/<option[^>]*value="([^"]+)"[^>]*selected[^>]*>/i) ||
                      text.match(/<option[^>]*selected[^>]*value="([^"]+)"[^>]*>/i);
    out.push(`  option נבחר (ניחוש ראשון): ${selMatch ? selMatch[1] : "(לא נמצא)"}`);

    // גם לחפש כל data-loc / value בסמוך למילה "select-location" וכו'
    const locVarMatch = text.match(/(?:currentLoc|current_location|selectedLoc|data-loc)\s*[:=]\s*["']([^"']+)["']/i);
    out.push(`  משתנה loc אפשרי: ${locVarMatch ? locVarMatch[1] : "(לא נמצא)"}`);

    if (status !== 200) continue;
  }

  // עכשיו לבדוק ישירות מול ה-AJAX לכל שם מועמד (השמות שכבר ידועים משדה ה-select
  // הגלובלי מסבב קודם + ניחושים סבירים לסניפים החסרים)
  const CANDIDATE_LOCS = [
    "לב תל אביב", "לב רמת השרון", "לב אבן יהודה", "לב סמדר",
    "לב רעננה", "לב עומר", "לב דניאל",
  ];
  out.push(`\n\n=== בדיקת AJAX ישירה לכל שם מועמד (תאריך ${TEST_DATE}) ===`);
  for (const loc of CANDIDATE_LOCS) {
    const url = `https://www.lev.co.il/wp-content/themes/lev/ajax_data.php?clang=he&action=movie_on_location_new&loc=${encodeURIComponent(loc)}&date=${TEST_DATE}`;
    try {
      const { status, text } = await getPage(url);
      const liCount = (text.match(/<li>/g) || []).length;
      const hasNotReady = /עדיין לא מוכנה|לא מתעדכנת/.test(text);
      out.push(`  ${loc}: [${status}] אורך=${text.length} <li>=${liCount} ${hasNotReady ? "(הודעת-המתנה)" : ""}`);
    } catch (e) {
      out.push(`  ${loc}: שגיאה — ${e.message}`);
    }
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev9.md", out.join("\n"));
  console.log("נכתב data/probe-lev9.md —", out.length, "שורות");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev9.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
