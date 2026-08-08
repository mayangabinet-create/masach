/**
 * מסך. — כיבוד robots.txt
 *
 * נטען פעם אחת לכל origin (עם מטמון), בוחר את קבוצת הכללים שתואמת
 * ל-User-Agent שלנו (או "*" כגיבוי), ומאפשר לבדוק לפי path אם מותר
 * לגשת, וכן לקרוא Crawl-delay אם הוגדר. אם robots.txt לא קיים או
 * שהבקשה נכשלת — מתייחסים כאילו הכל מותר (fail-open, כמו רוב הכלים).
 */

const cache = new Map();

function parse(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) { current = { agents: [], rules: [], crawlDelay: null }; groups.push(current); }
      current.agents.push(val.toLowerCase());
    } else if ((key === "disallow" || key === "allow") && current) {
      current.rules.push({ type: key, path: val });
    } else if (key === "crawl-delay" && current) {
      current.crawlDelay = Number(val) || null;
    }
  }
  return groups;
}

/* קבוצה עם שם ספציפי שמופיע ב-UA שלנו גוברת; אחרת נופלים ל-"*". */
function pickGroup(groups, uaToken) {
  return groups.find(g => g.agents.some(a => a !== "*" && uaToken.includes(a)))
      || groups.find(g => g.agents.includes("*"))
      || null;
}

async function load(origin, ua) {
  if (cache.has(origin)) return cache.get(origin);
  let groups = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": ua } });
    if (res.ok) groups = parse(await res.text());
  } catch { /* אין robots.txt / שגיאת רשת — ברירת מחדל: הכל מותר */ }
  const uaToken = (ua.match(/^[^/\s(]+/)?.[0] || "*").toLowerCase();
  const group = pickGroup(groups, uaToken);
  const info = { rules: group?.rules || [], crawlDelay: group?.crawlDelay ?? null };
  cache.set(origin, info);
  return info;
}

/* כלל התאמת ה-path הארוך ביותר מנצח (התנהגות סטנדרטית של robots.txt). */
function isAllowed(info, pathname) {
  let best = null;
  for (const r of info.rules) {
    if (!r.path) continue; // "Disallow:" ריק = מותר הכל
    if (pathname.startsWith(r.path) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.type === "allow";
}

/** בודק אם מותר לגרד url נתון; מחזיר גם crawl-delay בשניות אם הוגדר. */
export async function checkRobots(url, ua) {
  const u = new URL(url);
  const info = await load(u.origin, ua);
  return { allowed: isAllowed(info, u.pathname), crawlDelay: info.crawlDelay };
}
