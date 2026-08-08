/**
 * גשש סבב 9 — לב, הכרעה: הצילום מסך (סבב 6) חשף widget "הזמנת
 * כרטיסים" עם dropdown-ים מדורגים (קולנוע → סרט → סוג → תאריך → שעה).
 * זה כנראה טופס וורדפרס שמדבר עם wp-admin/admin-ajax.php — קריאה
 * שהגששים הקודמים לא חיפשו במפורש (חיפשו רק URLs עם "events" וכו').
 * כאן: בוחרים סרט מה-dropdown השני ("בחר סרט") ותופסים *כל* בקשת
 * רשת (לא מסוננת) שיוצאת בעקבות זה, כדי לזהות את ה-AJAX האמיתי.
 *
 * כותב: data/probe-lev7.md
 */

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

async function main() {
  const out = [`# גשש לב 7 — ${new Date().toISOString()}`];
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: UA, locale: "he-IL" });

  const calls = [];
  page.on("request", (req) => {
    if (req.url().includes("lev.co.il") && (req.method() === "POST" || /ajax|admin-ajax/i.test(req.url()))) {
      calls.push({ phase: "req", url: req.url(), method: req.method(), postData: req.postData() });
    }
  });
  page.on("response", async (res) => {
    if (res.url().includes("lev.co.il") && (res.request().method() === "POST" || /ajax|admin-ajax/i.test(res.url()))) {
      let text = null;
      try { text = await res.text(); } catch {}
      calls.push({ phase: "res", url: res.url(), status: res.status(), text });
    }
  });

  await page.goto("https://www.lev.co.il/location/telaviv", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);

  // ה-select-ים בתוך widget "הזמנת כרטיסים" — לפי הצילום: select ראשון
  // = קולנוע (כבר ממולא), שני = סרט. מנסים לבחור ערך שני בכל select.
  const selects = await page.$$("select");
  out.push(`מספר <select> בעמוד: ${selects.length}`);
  for (let idx = 0; idx < selects.length; idx++) {
    const opts = await selects[idx].$$eval("option", os => os.map(o => ({ value: o.value, text: o.textContent.trim() })));
    out.push(`  select[${idx}] opts: ${JSON.stringify(opts.slice(0, 6))}`);
  }

  // לנסות לבחור את ה-select השני (בדרך כלל "בחר סרט") לערך הלא-ריק הראשון שלו
  if (selects.length > 1) {
    const opts1 = await selects[1].$$eval("option", os => os.map(o => o.value));
    const real = opts1.find(v => v && v !== "");
    if (real) {
      await selects[1].selectOption(real).catch(e => out.push(`בחירה נכשלה: ${e.message}`));
      await page.waitForTimeout(3000);
    } else {
      out.push("אין ערך אמיתי לבחור ב-select[1]");
    }
  }

  out.push(`\nקריאות שנתפסו (${calls.length}):`);
  for (const c of calls) {
    if (c.phase === "req") {
      out.push(`  → ${c.method} ${c.url}`);
      if (c.postData) out.push(`     body: ${c.postData.slice(0, 1000)}`);
    } else {
      out.push(`  ← [${c.status}] ${c.url}`);
      if (c.text) out.push(`     resp: ${c.text.slice(0, 3000)}`);
    }
  }

  await browser.close();
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev7.md", out.join("\n"));
  console.log("נכתב data/probe-lev7.md —", out.length, "שורות");
}

main().catch(async (e) => {
  await mkdir("data", { recursive: true });
  await writeFile("data/probe-lev7.md", "!! קריסה: " + e.stack);
  console.error(e);
  process.exit(1);
});
