/* flatten groups + levels into an index */
const PLAYABLE=LEVELS.filter(x=>!x.group);
let curIdx=0;
const done=new Set();

function loadLevel(i){
  curIdx=i; const lv=PLAYABLE[i];
  S.lines=lv.buf.slice(); S.cursor={...lv.cur}; S.mode="normal"; S.anchor=null;
  S.reg=lv.preReg?{...lv.preReg}:{text:"",linewise:false};
  S.sysclip=""; S.pending="";S.awaitLeader=false;S.leaderBuf="";S.cmd=null;
  S.lastSearch="";S.undo=[];S.keyLog=[];S.keys=0;S.enteredInsert=false;S.won=false;S.cmp=null;
  clampCursor();
  document.getElementById("lvTitle").textContent=`Level ${i+1} / ${PLAYABLE.length} · ${lv.title}`;
  document.getElementById("lvGoal").textContent=lv.goal;
  document.getElementById("lesson").innerHTML=lv.lesson;
  const pw=document.getElementById("parWrap");
  if(lv.par){pw.style.display="inline";document.getElementById("par").textContent=lv.par;}else pw.style.display="none";
  document.getElementById("win").classList.remove("show");
  closePop();
  buildSidebar();
  render();
  document.getElementById("buf").focus();
}

function checkWin(){
  if(S.won)return;
  const lv=PLAYABLE[curIdx];
  let ok=false; try{ ok=lv.check(); }catch(e){ ok=false; }
  if(ok){
    S.won=true; done.add(curIdx); buildSidebar();
    const wp=document.getElementById("winPar");
    if(lv.par){ const good=S.keys<=lv.par;
      wp.textContent=`${S.keys} keystrokes · par ${lv.par} ${good?"— 🏌 under par!":""}`; }
    else wp.textContent=`${S.keys} keystrokes`;
    document.getElementById("winTitle").textContent = curIdx===PLAYABLE.length-1?"🎓 Config mastered!":"Level clear!";
    document.getElementById("winMsg").textContent = curIdx===PLAYABLE.length-1
      ? "You've learned ThePrimeagen's init.lua end to end." : lv.goal;
    const nb=document.getElementById("nextBtn");
    nb.textContent = curIdx===PLAYABLE.length-1?"↺ play again":"next level →";
    setTimeout(()=>document.getElementById("win").classList.add("show"),260);
  }
}

/* ---------- sidebar ---------- */
function buildSidebar(){
  const side=document.getElementById("side");
  let html=`<div class="brand"><h1>Prime<span class="v">Motions</span></h1>
    <p>learn ThePrimeagen's init.lua</p></div>`;
  let pi=0;
  for(const item of LEVELS){
    if(item.group){ html+=`<div class="grp">${item.group}</div>`; continue; }
    const i=pi++; const cls=(i===curIdx?"active ":"")+(done.has(i)?"done ":"");
    html+=`<div class="lv ${cls}" data-i="${i}"><span class="num">${i+1}</span>
      <span class="dot"></span><span class="t">${esc(item.title)}</span></div>`;
  }
  side.innerHTML=html;
  side.querySelectorAll(".lv").forEach(el=>el.addEventListener("click",()=>loadLevel(+el.dataset.i)));
}

/* ---------- wiring ---------- */
document.addEventListener("keydown",onKey);
document.getElementById("resetBtn").addEventListener("click",()=>loadLevel(curIdx));
document.getElementById("nextBtn").addEventListener("click",()=>{
  if(curIdx===PLAYABLE.length-1) loadLevel(0);
  else loadLevel(curIdx+1);
});
document.getElementById("buf").addEventListener("click",()=>document.getElementById("buf").focus());
loadLevel(0);
