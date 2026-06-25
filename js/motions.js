/* ---------- motions ---------- */
function motion(m){
  const c=S.cursor;
  if(m==="w") m="b"; else if(m==="b") m="w";   // user swap: w → left, b → right
  switch(m){
    case"h":c.col=clamp(c.col-1,0,maxCol());break;
    case"l":c.col=clamp(c.col+1,0,maxCol());break;
    case"j":if(c.row<S.lines.length-1){c.row++;c.col=clamp(c.col,0,maxCol());}break;
    case"k":if(c.row>0){c.row--;c.col=clamp(c.col,0,maxCol());}break;
    case"0":c.col=0;break;
    case"$":c.col=maxCol();break;
    case"^":{const i=curLine().search(/\S/);c.col=i<0?0:i;}break;
    case"w":{const t=tokens().find(x=>after(x,c));if(t){c.row=t.row;c.col=t.c0;}break;}
    case"b":{const t=tokens().filter(x=>before(x,c)).pop();if(t){c.row=t.row;c.col=t.c0;}break;}
    case"e":{const t=tokens().find(x=>x.row>c.row||(x.row===c.row&&x.c1>c.col));if(t){c.row=t.row;c.col=t.c1;}break;}
    case"gg":c.row=0;{const i=curLine().search(/\S/);c.col=i<0?0:i;}break;
    case"G":c.row=S.lines.length-1;{const i=curLine().search(/\S/);c.col=i<0?0:i;}break;
  }
  clampCursor();
}

/* ---------- search ---------- */
function doSearch(pat,dir,fromNext){
  if(!pat)return false;
  const N=S.lines.length; let {row,col}=S.cursor;
  for(let i=0;i<=N;i++){
    if(dir>0){
      let start=(i===0&&!fromNext)?col:0; let r=(S.cursor.row+i)%N;
      if(i>0)start=0; const idx=S.lines[r].indexOf(pat,(i===0?col+(fromNext?1:0):0));
      if(idx>=0){S.cursor.row=r;S.cursor.col=idx;clampCursor();return true;}
    }else{
      let r=(S.cursor.row-i+N*2)%N;
      const hay=S.lines[r]; let lim=(i===0)?col-1:hay.length;
      const idx=hay.lastIndexOf(pat,lim);
      if(idx>=0&&!(i===0&&idx>=col)){S.cursor.row=r;S.cursor.col=idx;clampCursor();return true;}
    }
  }
  return false;
}

/* ---------- visual range ---------- */
function visualRange(){
  let a=S.anchor, b=S.cursor;
  let lo,hi;
  if(a.row<b.row||(a.row===b.row&&a.col<=b.col)){lo=a;hi=b;}else{lo=b;hi=a;}
  return {lo:{...lo},hi:{...hi}};
}
function isSelected(r,col){
  if(S.mode!=="visual"&&S.mode!=="vline")return false;
  const {lo,hi}=visualRange();
  if(S.mode==="vline")return r>=lo.row&&r<=hi.row;
  if(r<lo.row||r>hi.row)return false;
  if(r===lo.row&&r===hi.row)return col>=lo.col&&col<=hi.col;
  if(r===lo.row)return col>=lo.col;
  if(r===hi.row)return col<=hi.col;
  return true;
}
function selectedText(){
  const {lo,hi}=visualRange();
  if(S.mode==="vline"){ return {text:S.lines.slice(lo.row,hi.row+1).join("\n"),linewise:true}; }
  if(lo.row===hi.row) return {text:S.lines[lo.row].slice(lo.col,hi.col+1),linewise:false};
  let out=[S.lines[lo.row].slice(lo.col)];
  for(let r=lo.row+1;r<hi.row;r++)out.push(S.lines[r]);
  out.push(S.lines[hi.row].slice(0,hi.col+1));
  return {text:out.join("\n"),linewise:false};
}
function deleteSelection(){
  const {lo,hi}=visualRange();
  if(S.mode==="vline"){
    S.lines.splice(lo.row,hi.row-lo.row+1);
    if(S.lines.length===0)S.lines=[""];
    S.cursor={row:clamp(lo.row,0,S.lines.length-1),col:0};
  }else if(lo.row===hi.row){
    const l=S.lines[lo.row];
    S.lines[lo.row]=l.slice(0,lo.col)+l.slice(hi.col+1);
    S.cursor={row:lo.row,col:lo.col};
  }else{
    const head=S.lines[lo.row].slice(0,lo.col);
    const tail=S.lines[hi.row].slice(hi.col+1);
    S.lines.splice(lo.row,hi.row-lo.row+1,head+tail);
    S.cursor={row:lo.row,col:lo.col};
  }
  S.mode="normal";S.anchor=null;clampCursor();
}
