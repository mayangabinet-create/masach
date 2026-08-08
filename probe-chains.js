constconst fs=require("fs");
const H={"user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1","accept-language":"he-IL,he;q=0.9"};
const O=["# probe v4 "+new Date().toISOString()];
const g=async u=>(await fetch(u,{headers:H})).text();
async function scan(u,label){
  try{
    const t=await g(u);
    O.push("\n=== "+label+"  ("+t.length+")");
    const hits=new Set();
    const pats=[/url\s*:\s*["'`]([^"'`]{3,110})["'`]/gi,/\$\.(?:get|post|ajax|getJSON)\s*\(\s*["'`]([^"'`]{3,110})["'`]/gi,/fetch\s*\(\s*["'`]([^"'`]{3,110})["'`]/gi,/axios\.\w+\(\s*["'`]([^"'`]{3,110})["'`]/gi,/["'`](\/[A-Za-z0-9_\-\/\?=&{}]*(?:Grid|Event|Show|Session|Movie|Time|Book|Order|Api|Perform)[A-Za-z0-9_\-\/\?=&{}]*)["'`]/g];
    for(const p of pats){let m;while((m=p.exec(t)))hits.add(m[1]);}
    O.push([...hits].slice(0,60).map(x=>"  "+x).join("\n")||"  (none)");
  }catch(e){O.push(label+" ERR "+e.message);}
}
(async()=>{
  await scan("https://hotcinema.co.il/theater/1","HOT theater page");
  await scan("https://hotcinema.co.il/ShowingNow","HOT ShowingNow");
  await scan("https://www.planetcinema.co.il/whatson","PLANET whatson");
  await scan("https://www.rav-hen.co.il/cinemas/givatayim/1058","RAVHEN cinema page");
  fs.mkdirSync("data",{recursive:true});
  fs.writeFileSync("data/probe.md",O.join("\n"));
})();
