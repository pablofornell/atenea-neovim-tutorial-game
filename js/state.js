/* =======================================================================
   Prime Motions — a tiny Neovim emulator that teaches ThePrimeagen's
   init.lua keymaps. Pure vanilla JS, no deps.
   ======================================================================= */
"use strict";

/* ---------- editor state ---------- */
const S = {
  lines:["~"], cursor:{row:0,col:0}, mode:"normal", anchor:null,
  reg:{text:"",linewise:false}, sysclip:"",
  pending:"", awaitLeader:false, leaderBuf:"",
  cmd:null, lastSearch:"", searchDir:1,
  undo:[], keyLog:[], keys:0, enteredInsert:false,
  popOpen:false, popKind:null, won:false, cmp:null,
};

/* ---------- helpers ---------- */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const curLine=()=>S.lines[S.cursor.row];
const maxCol=()=>{ const l=curLine().length; return S.mode==="insert"?l:Math.max(0,l-1); };
function clampCursor(){ S.cursor.row=clamp(S.cursor.row,0,S.lines.length-1);
  S.cursor.col=clamp(S.cursor.col,0,maxCol()); }
function snapshot(){ S.undo.push({lines:S.lines.slice(),cursor:{...S.cursor}});
  if(S.undo.length>200)S.undo.shift(); }
function log(k){ S.keyLog.push(k); }

/* word tokenisation for w/b/e */
function tokens(){
  const t=[]; const re=/\w+|[^\w\s]+/g;
  for(let r=0;r<S.lines.length;r++){ let m; re.lastIndex=0;
    while((m=re.exec(S.lines[r]))) t.push({row:r,c0:m.index,c1:m.index+m[0].length-1}); }
  return t;
}
const after=(a,b)=> a.row>b.row || (a.row===b.row && a.c0> b.col);
const before=(a,b)=> a.row<b.row || (a.row===b.row && a.c0< b.col);

/* User remaps movement to j k l ñ (hjkl shifted one key right on a Spanish
   keyboard): j=left, k=down, l=up, ñ=right.  Translate a pressed key into the
   canonical h/j/k/l motion. Returns "" for the now-unmapped h (scold), or null
   when the key isn't a movement key. */
function remapDir(key){
  switch(key){
    case"ñ":case"Ñ": return "l"; // right
    case"j": return "h";         // left
    case"k": return "j";         // down
    case"l": return "k";         // up
    case"h": return "";          // unmapped on purpose
  }
  return null;
}
