/* ---------- command execution ---------- */
function setMode(m){ S.mode=m; if(m==="insert")S.enteredInsert=true; }

function handleNormal(key,e){
  // pending operators / multi-key (g, d, y, c)
  if(S.pending){
    const op=S.pending; S.pending="";
    if(op==="g"){ if(key==="g"){motion("gg");log("gg");} return; }
    // treesitter text object: pending like "da"/"di"/"ca"/"yi" awaiting the object char (f = @function)
    if(/^[dyc][ai]$/.test(op)){ if(key==="f") execTextObject(op[0],op[1]); return; }
    if(op==="d"||op==="y"||op==="c"){
      if(key==="a"||key==="i"){ S.pending=op+key; return; } // start a text object (af/if)
      // linewise double (dd/yy/cc) or simple motions
      if(key===op){
        snapshot();
        if(op==="y"){S.reg={text:curLine(),linewise:true};log("yy");}
        else{ S.reg={text:curLine(),linewise:true};
          S.lines.splice(S.cursor.row,1); if(!S.lines.length)S.lines=[""];
          clampCursor(); if(op==="c"){S.lines.splice(S.cursor.row,0,"");setMode("insert");S.cursor.col=0;log("cc");}else log("dd"); }
        return;
      }
      if(["w","e","$","0","^","b"].includes(key)){
        snapshot(); const start={...S.cursor}; motion(key); const end={...S.cursor};
        let lo=start,hi=end; if(end.col<start.col){lo=end;hi=start;}
        const line=S.lines[lo.row];
        const cut=line.slice(lo.col, key==="$"?undefined:(key==="e"?hi.col+1:hi.col));
        const rest=line.slice(0,lo.col)+(key==="$"?"":line.slice(key==="e"?hi.col+1:hi.col));
        if(op==="y"){S.reg={text:cut,linewise:false};S.cursor={...start};}
        else{S.reg={text:cut,linewise:false};S.lines[lo.row]=rest;S.cursor={...lo};
          if(op==="c")setMode("insert");}
        clampCursor(); log(op+key); return;
      }
      return;
    }
  }

  // leader sequence
  if(S.awaitLeader){
    S.leaderBuf+=key;
    if(resolveLeader(S.leaderBuf)){ S.awaitLeader=false; S.leaderBuf=""; }
    else if(!leaderHasPrefix(S.leaderBuf)){ S.awaitLeader=false; S.leaderBuf=""; }
    return;
  }

  // jklñ movement remap
  { const d=remapDir(key);
    if(d===""){ toast("Use j k l ñ — h is unmapped!"); shake(); return; }
    if(d!==null) key=d; }

  switch(key){
    case" ": S.awaitLeader=true; S.leaderBuf=""; return;     // <leader>
    case"h":case"j":case"k":case"l":case"w":case"b":case"e":
    case"0":case"$":case"^": motion(key); log(key); return;
    case"g": S.pending="g"; return;
    case"G": motion("G"); log("G"); return;
    case"d":case"y":case"c": S.pending=key; return;
    case"x": snapshot(); { const l=curLine(); if(l.length){S.reg={text:l[S.cursor.col]||"",linewise:false};
              S.lines[S.cursor.row]=l.slice(0,S.cursor.col)+l.slice(S.cursor.col+1);clampCursor();} } log("x"); return;
    // swapped: i appends (after char), a inserts (before char) — inverse of stock vim
    case"i": setMode("insert"); S.cursor.col=Math.min(curLine().length,S.cursor.col+1); log("i"); return;
    case"a": setMode("insert"); log("a"); return;
    case"A": setMode("insert"); S.cursor.col=curLine().length; log("A"); return;
    case"o": snapshot(); S.lines.splice(S.cursor.row+1,0,""); S.cursor={row:S.cursor.row+1,col:0}; setMode("insert"); log("o"); return;
    case"O": snapshot(); S.lines.splice(S.cursor.row,0,""); S.cursor.col=0; setMode("insert"); log("O"); return;
    case"v": setMode("visual"); S.anchor={...S.cursor}; log("v"); return;
    case"V": setMode("vline"); S.anchor={...S.cursor}; log("V"); return;
    case"J": snapshot(); { const r=S.cursor.row; if(r<S.lines.length-1){
              const keepCol=S.cursor.col; const merged=S.lines[r].replace(/\s+$/,"")+" "+S.lines[r+1].replace(/^\s+/,"");
              S.lines.splice(r,2,merged); S.cursor.col=keepCol; clampCursor(); } } log("J"); return; // mzJ`z keeps cursor
    case"p": snapshot(); pasteReg(true); log("p"); return;
    case"P": snapshot(); pasteReg(false); log("P"); return;
    case"u": if(S.undo.length){const st=S.undo.pop();S.lines=st.lines;S.cursor=st.cursor;clampCursor();} log("u"); return;
    case"n": if(doSearch(S.lastSearch,S.searchDir,true)){centerCursor();} log("n"); return;
    case"N": if(doSearch(S.lastSearch,-S.searchDir,true)){centerCursor();} log("N"); return;
    case"/": S.cmd={type:"search",text:""}; setMode("cmd"); return;
    case"Q": toast("Q is <nop> in this config — recording disabled on purpose"); log("Q"); return;
  }
}

/* treesitter @function text object (af/if), lazy/treesitter.lua */
function findFunction(row){
  let os=-1;
  for(let r=row;r>=0;r--){ if(/\bfunction\b/.test(S.lines[r])){ os=r; break; } }
  if(os<0) return null;
  let oe=-1;
  for(let r=os+1;r<S.lines.length;r++){ if(/^\s*end\b/.test(S.lines[r])){ oe=r; break; } }
  if(oe<0) for(let r=os+1;r<S.lines.length;r++){ if(/^\s*}/.test(S.lines[r])){ oe=r; break; } }
  if(oe<0) return null;
  return {os,oe,is:os+1,ie:oe-1};
}
function execTextObject(op,scope){ // op: d/y/c ; scope: a (outer) | i (inner)
  const f=findFunction(S.cursor.row);
  if(!f){ toast("no @function under the cursor"); return; }
  snapshot();
  const r0=scope==="a"?f.os:f.is, r1=scope==="a"?f.oe:f.ie;
  if(r1>=r0){ S.reg={text:S.lines.slice(r0,r1+1).join("\n"),linewise:true}; }
  if(op==="y"){ S.cursor={row:r0,col:0}; }
  else{
    if(r1>=r0){ S.lines.splice(r0,r1-r0+1); if(!S.lines.length)S.lines=[""]; }
    if(op==="c"){ S.lines.splice(r0,0,""); S.cursor={row:r0,col:0}; setMode("insert"); }
    else S.cursor={row:clamp(r0,0,S.lines.length-1),col:0};
  }
  clampCursor(); log(op+scope+"f");
  toast(`${op}${scope}f → ${scope==="a"?"around":"inner"} @function`);
}

function pasteReg(after){
  const {text,linewise}=S.reg; if(text===""&&!linewise&&S.reg.text==="")return;
  if(linewise){ const idx=S.cursor.row+(after?1:0); const ls=text.split("\n");
    S.lines.splice(idx,0,...ls); S.cursor={row:idx,col:0}; }
  else{ const l=curLine(); const at=S.cursor.col+(after?1:0);
    S.lines[S.cursor.row]=l.slice(0,at)+text+l.slice(at); S.cursor.col=at+text.length-1; }
  clampCursor();
}

/* ---- leader maps (this config's signature) ---- */
const LEADER_NORMAL=["pv","pf","ps","pws","pWs","vh","u","gs","tt","zz","zZ","s","x"," ","k","j","a","A","1","2","3","4"];
function leaderHasPrefix(buf){ return LEADER_NORMAL.some(m=>m.startsWith(buf)); }
function resolveLeader(buf){
  const map={
    "pv":()=>{openPop("netrw");toast("<leader>pv → :Ex (netrw)");},
    "pf":()=>{openPop("files");toast("<leader>pf → Telescope find_files");},
    "ps":()=>{openPop("grep");toast("<leader>ps → live grep");},
    "pws":()=>{openPop("grep");toast("<leader>pws → grep word under cursor");},
    "pWs":()=>{openPop("grep");toast("<leader>pWs → grep WORD under cursor");},
    "vh":()=>{openPop("files");toast("<leader>vh → help tags");},
    "u":()=>{openPop("undo");toast("<leader>u → UndoTree");},
    "gs":()=>{openPop("git_status");toast("<leader>gs → fugitive :Git");},
    "tt":()=>{openPop("trouble");toast("<leader>tt → Trouble");},
    "zz":()=>toast("<leader>zz → Zen Mode (90 cols, keep numbers)"),
    "zZ":()=>toast("<leader>zZ → Zen Mode (80 cols, no numbers)"),
    "x":()=>toast("<leader>x → :!chmod +x %  (make file executable)"),
    "k":()=>toast("<leader>k → :lnext  (location list)"),
    "j":()=>toast("<leader>j → :lprev  (location list)"),
    " ":()=>toast("<leader><leader> → :so  (re-source config)"),
    "a":()=>toast("<leader>a → harpoon: add this file to the list"),
    "A":()=>toast("<leader>A → harpoon: prepend file to the list"),
    "1":()=>toast("<leader>1 → harpoon: jump to file 1"),
    "2":()=>toast("<leader>2 → harpoon: jump to file 2"),
    "3":()=>toast("<leader>3 → harpoon: jump to file 3"),
    "4":()=>toast("<leader>4 → harpoon: jump to file 4"),
    "s":()=>{ const w=wordUnderCursor();
        S.cmd={type:"subst",word:w,text:""}; setMode("cmd"); },
  };
  if(map[buf]){ const wasInsertSearch=buf==="s"; map[buf](); log("<leader>"+buf);
    if(!wasInsertSearch && buf!=="s") {} return true; }
  return false;
}
function wordUnderCursor(){
  const l=curLine(); let s=S.cursor.col,e=S.cursor.col;
  while(s>0&&/\w/.test(l[s-1]))s--; while(e<l.length&&/\w/.test(l[e]))e++;
  return l.slice(s,e);
}

/* ---- visual-mode leader maps ---- */
function handleVisual(key,e){
  if(S.awaitLeader){
    S.awaitLeader=false; const k=key; const buf=k;
    if(buf==="p"){ // greatest remap: "_dP — paste over, keep register
      snapshot(); const reg={...S.reg};
      const {lo}=visualRange();                 // insertion point = where selection started
      const row=lo.row, at=lo.col;
      deleteSelection();
      const l=S.lines[row];
      S.lines[row]=l.slice(0,at)+reg.text+l.slice(at);
      S.cursor={row,col:at+Math.max(0,reg.text.length-1)}; S.reg=reg; clampCursor();
      log("<leader>p"); toast('<leader>p → "_dP  (paste, keep your yank!)'); return;
    }
    if(buf==="y"){ const sel=selectedText(); S.sysclip=sel.text; S.reg=sel; S.mode="normal";S.anchor=null;
      log("<leader>y"); toast('<leader>y → "+y  (yank to SYSTEM clipboard)'); return; }
    if(buf==="d"){ snapshot(); const reg={...S.reg}; deleteSelection(); S.reg=reg;
      log("<leader>d"); toast('<leader>d → "_d  (delete to black hole, yank kept)'); return; }
    toast("no visual <leader>"+buf); return;
  }
  // jklñ movement remap
  { const d=remapDir(key);
    if(d===""){ toast("Use j k l ñ — h is unmapped!"); shake(); return; }
    if(d!==null) key=d; }
  switch(key){
    case" ": S.awaitLeader=true; return;
    case"h":case"j":case"k":case"l":case"w":case"b":case"e":case"0":case"$":case"^":case"G":
      motion(key);log(key);return;
    case"g": S.pending="g"; return;
    case"o": { const t=S.anchor; S.anchor={...S.cursor}; S.cursor=t; return; } // swap ends
    case"d":case"x": snapshot(); S.reg=selectedText(); deleteSelection(); log("d"); return;
    case"y": S.reg=selectedText(); S.cursor={...visualRange().lo}; S.mode="normal";S.anchor=null; log("y"); return;
    case"c": snapshot(); S.reg=selectedText(); deleteSelection(); setMode("insert"); log("c"); return;
    case"J": snapshot(); moveLines(1); log("J"); return;   // visual line move down
    case"K": snapshot(); moveLines(-1); log("K"); return;  // visual line move up
    case"v":case"V": S.mode="normal";S.anchor=null; return;
  }
  if(S.pending==="g"&&key==="g"){S.pending="";motion("gg");log("gg");}
}
function moveLines(dir){
  const {lo,hi}=visualRange();
  if(dir>0){ if(hi.row>=S.lines.length-1)return;
    const moved=S.lines.splice(hi.row+1,1)[0]; S.lines.splice(lo.row,0,moved);
  }else{ if(lo.row<=0)return;
    const moved=S.lines.splice(lo.row-1,1)[0]; S.lines.splice(hi.row,0,moved);
  }
  S.cursor.row=clamp(S.cursor.row+dir,0,S.lines.length-1);
  S.anchor.row=clamp(S.anchor.row+dir,0,S.lines.length-1);
  clampCursor();
}

/* ---- insert mode ---- */
function openCmp(){
  const l=curLine(); let s=S.cursor.col;
  while(s>0&&/\w/.test(l[s-1]))s--;
  const prefix=l.slice(s,S.cursor.col);
  const pool=["compute","computed","comparison","complete","config","callback","capacity","require","return","results"];
  let items=pool.filter(x=>x.startsWith(prefix)&&x!==prefix);
  if(!items.length) items=pool.slice(0,6);
  S.cmp={open:true,items,sel:0,start:s,prefix};
}
function cmpConfirm(){
  if(!S.cmp)return; snapshot();
  const item=S.cmp.items[S.cmp.sel], l=curLine();
  S.lines[S.cursor.row]=l.slice(0,S.cmp.start)+item+l.slice(S.cursor.col);
  S.cursor.col=S.cmp.start+item.length; S.cmp.open=false;
}
function handleInsert(key,e){
  // nvim-cmp completion menu (lazy/lsp.lua)
  if(S.cmp&&S.cmp.open){
    if(key==="<C-n>"){ S.cmp.sel=(S.cmp.sel+1)%S.cmp.items.length; log("<C-n>"); return; }
    if(key==="<C-p>"){ S.cmp.sel=(S.cmp.sel-1+S.cmp.items.length)%S.cmp.items.length; log("<C-p>"); return; }
    if(key==="<C-y>"){ cmpConfirm(); log("<C-y>"); toast('<C-y> → confirm completion'); return; }
    if(key==="<C-Space>"){ openCmp(); log("<C-Space>"); return; }
    if(key==="Escape"||key==="<C-c>"){ S.cmp.open=false; log(key==="<C-c>"?"<C-c>":"Esc"); return; }
    S.cmp.open=false; // any other key dismisses the menu, then types normally
  }
  if(key==="<C-Space>"){ openCmp(); log("<C-Space>"); toast('<C-Space> → trigger completion'); return; }
  if(key==="Escape"||key==="<C-c>"){ setMode("normal");
    S.cursor.col=Math.max(0,S.cursor.col-1); clampCursor(); log(key==="<C-c>"?"<C-c>":"Esc"); return; }
  if(key==="Backspace"){ snapshot(); const l=curLine();
    if(S.cursor.col>0){S.lines[S.cursor.row]=l.slice(0,S.cursor.col-1)+l.slice(S.cursor.col);S.cursor.col--;}
    else if(S.cursor.row>0){const prev=S.lines[S.cursor.row-1];S.cursor.col=prev.length;
      S.lines[S.cursor.row-1]=prev+l;S.lines.splice(S.cursor.row,1);S.cursor.row--;} return; }
  if(key==="Enter"){ snapshot(); const l=curLine();
    const head=l.slice(0,S.cursor.col),tail=l.slice(S.cursor.col);
    S.lines[S.cursor.row]=head; S.lines.splice(S.cursor.row+1,0,tail);
    S.cursor={row:S.cursor.row+1,col:0}; return; }
  if(key.length===1){ snapshot(); const l=curLine();
    S.lines[S.cursor.row]=l.slice(0,S.cursor.col)+key+l.slice(S.cursor.col); S.cursor.col++; }
}

/* ---- command line (search & substitute) ---- */
function handleCmd(key){
  if(key==="Escape"||key==="<C-c>"){ S.cmd=null; setMode("normal"); return; }
  if(key==="Enter"){
    if(S.cmd.type==="search"){ S.lastSearch=S.cmd.text; S.searchDir=1; S.mode="normal";
      if(doSearch(S.lastSearch,1,false))centerCursor(); S.cmd=null; log("/"+ S.lastSearch); }
    else if(S.cmd.type==="subst"){ const w=S.cmd.word, rep=S.cmd.text; S.mode="normal";
      if(w){ snapshot(); const re=new RegExp("\\b"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","g");
        S.lines=S.lines.map(l=>l.replace(re,rep)); } clampCursor(); S.cmd=null; toast(`:%s/${w}/${rep}/gI`); }
    return;
  }
  if(key==="Backspace"){ S.cmd.text=S.cmd.text.slice(0,-1); return; }
  if(key.length===1) S.cmd.text+=key;
}
