const fs=require("fs");
const H={"user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1","accept-language":"he-IL,he;q=0.9"};
const O=["# probe v5 "+new Date().toISOString()];
const g=async u=>(await fetch(u,{headers:H})).text();
async function scan(u,label,keys){
  try{
    const t=await g(u);
    O.push("\n=== "+label+"  ("+t.length+")");
    for(const k of keys){
      const n=(t.split(k).length-1);
      O.push("  "+k+" : "+n);
      if(n>0){
        const i=t.indexOf(k);
        O.push("    "+t.slice(Math.max(0,i-300),i+500).replace(/\s+/g," "));
      }
    }
  }catch(e){O.push(label+" ERR "+e.message);}
}
(async()=>{
  await scan("https://hotcinema.co.il/ShowingNow","HOT ShowingNow",["MovieName","EventId","\"Hour\"","Sessions","showtimes"]);
  await scan("https://www.planetcinema.co.il/whatson","PLANET",["sessions","showtime","filmId","businessDay"]);
  fs.mkdirSync("data",{recursive:true});
  fs.writeFileSync("data/probe.md",O.join("\n"));
})();
