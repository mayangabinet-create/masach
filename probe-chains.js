const fs=require("fs");
const H={"user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"};
const O=["# probe v3 "+new Date().toISOString()];
const g=async u=>(await fetch(u,{headers:H})).text();
async function scan(u,label){
  try{
    const t=await g(u);
    O.push("\n--- "+label+"  ("+t.length+")");
    const hits=new Set();
    const pats=[/url\s*:\s*["'`]([^"'`]{4,90})["'`]/gi,/\$\.(?:get|post|ajax|getJSON)\s*\(\s*["'`]([^"'`]{4,90})["'`]/gi,/fetch\s*\(\s*["'`]([^"'`]{4,90})["'`]/gi,/["'`](\/[A-Za-z0-9_\-\/]*(?:Grid|Event|Show|Session|Movie|Time|Book|Order|Api)[A-Za-z0-9_\-\/]*)["'`]/g];
    for(const p of pats){let m;while((m=p.exec(t)))hits.add(m[1]);}
    O.push([...hits].slice(0,40).map(x=>"  "+x).join("\n")||"  (none)");
  }catch(e){O.push(label+" ERR "+e.message);}
}
(async()=>{
  await scan("https://hotcinema.co.il/js/init.js","HOT init.js");
  await scan("https://hotcinema.co.il/js/common.js","HOT common.js");
  await scan("https://www.planetcinema.co.il/xmedia/js/config.js","PLANET config.js");
  await scan("https://www.lev.co.il/wp-content/themes/lev/js/script.js","LEV script.js");
  fs.mkdirSync("data",{recursive:true});
  fs.writeFileSync("data/probe.md",O.join("\n"));
})();
