/* ==== PART:8 ==== */
(function(CAD){
'use strict';
var T = CAD.text = CAD.text || {};
var DEG = Math.PI/180, CAPR = 72;           // altura de maiúscula = 72 unidades de layout (fonte de 100)
var ACI = {1:'#ff0000',2:'#d4a000',3:'#00a000',4:'#00a8a8',5:'#0000ff',6:'#ff00ff',7:'#000000'};
var SYM = {c:'Ø',C:'Ø',d:'°',D:'°',p:'±',P:'±','2':'²','3':'³','<':'≤','>':'≥','~':'≈','!':'≠','%':'%'};
var JUSTS_ALL = ['L','C','R','A','M','F','TL','TC','TR','ML','MC','MR','BL','BC','BR'];
var JUSTS_MT  = ['TL','TC','TR','ML','MC','MR','BL','BC','BR'];
var UNIT_H = {m:0.25,cm:25,mm:250,km:0.00025,ft:0.82,'in':9.84};

T.symbols = [
  {code:'%%c',ch:'Ø',name:'Diâmetro'},{code:'%%d',ch:'°',name:'Grau'},{code:'%%p',ch:'±',name:'Mais/menos'},
  {code:'%%2',ch:'²',name:'Ao quadrado'},{code:'%%3',ch:'³',name:'Ao cubo'},{code:'%%<',ch:'≤',name:'Menor ou igual'},
  {code:'%%>',ch:'≥',name:'Maior ou igual'},{code:'%%~',ch:'≈',name:'Aproximado'},{code:'%%!',ch:'≠',name:'Diferente'},
  {code:'',ch:'µ',name:'Micro'},{code:'',ch:'Δ',name:'Delta'},{code:'',ch:'Ω',name:'Ômega'},{code:'',ch:'π',name:'Pi'},
  {code:'',ch:'√',name:'Raiz'},{code:'',ch:'∞',name:'Infinito'},{code:'',ch:'½',name:'Meio'},{code:'',ch:'¼',name:'Um quarto'},{code:'',ch:'¾',name:'Três quartos'}
];
T.precision = 2;
T.lastH = 0;

/* ---------- utilidades ---------- */
function num(v,d){ v = +v; return isFinite(v) ? v : d; }
function copy(o){ return Object.assign({},o); }
function pt(x,y){ return {x:x,y:y,z:0}; }
function curSpace(){ var s = CAD.space; if(typeof s === 'function') s = s(); return s || 'model'; }
function kwv(r){ return typeof r === 'string' ? r : ((r && r.keyword) || ''); }
function fmt(v,p){ p = p == null ? T.precision : p; return (+v).toFixed(p).replace('.',','); }
function changed(){ try{ if(CAD.emit) CAD.emit('doc:changed',{what:'textstyle'}); if(CAD.render && CAD.render.request) CAD.render.request(); }catch(e){} }
function baseEnt(type){
  var c = (CAD.doc && CAD.doc.current) || {};
  return {type:type, layer:c.layer || '0', color:c.color == null ? null : c.color, lw:c.lw == null ? null : c.lw, ltype:c.ltype == null ? null : c.ltype, space:curSpace()};
}
T.defaultHeight = function(){ var u = CAD.doc && CAD.doc.units; return UNIT_H[u] || 2.5; };

/* ---------- estilos de texto ---------- */
function defStyle(){ return {font:'Arial',h:0,bold:false,italic:false,wf:1,oblique:0,upside:false,backwards:false}; }
function op(name,doFn,undoFn){
  var o = {name:name, do:function(){ doFn(); changed(); }, undo:function(){ undoFn(); changed(); }};
  if(CAD.history && CAD.history.run) CAD.history.run(o); else o.do();
}
function group(name,fn){
  var g = CAD.history && CAD.history.begin;
  if(g) CAD.history.begin(name);
  try{ fn(); } finally { if(g) CAD.history.end(); }
}
T.styles = {
  all:function(){ var d = CAD.doc; d.textstyles = d.textstyles || {}; if(!d.textstyles.Standard) d.textstyles.Standard = defStyle(); return d.textstyles; },
  names:function(){ return Object.keys(T.styles.all()); },
  add:function(name,def){
    var S = T.styles.all(); if(!name || S[name]) return false;
    op('Novo estilo de texto',function(){ S[name] = Object.assign(defStyle(),def||{}); },function(){ delete S[name]; });
    return true;
  },
  update:function(name,patch){
    var S = T.styles.all(); if(!S[name]) return false;
    var old = S[name];
    op('Modificar estilo de texto',function(){ S[name] = Object.assign({},old,patch); },function(){ S[name] = old; });
    return true;
  },
  remove:function(name){
    var S = T.styles.all(); if(name === 'Standard' || !S[name]) return false;
    var old = S[name];
    group('Excluir estilo de texto',function(){
      CAD.ents.query(function(e){ return e.style === name; }).forEach(function(e){ CAD.ents.update(e.id,{style:'Standard'}); });
      op('Excluir estilo',function(){ delete S[name]; },function(){ S[name] = old; });
    });
    if(CAD.doc.current && CAD.doc.current.tstyle === name) CAD.doc.current.tstyle = 'Standard';
    return true;
  },
  rename:function(a,b){
    var S = T.styles.all(); if(a === 'Standard' || !S[a] || !b || S[b]) return false;
    var old = S[a];
    group('Renomear estilo de texto',function(){
      CAD.ents.query(function(e){ return e.style === a; }).forEach(function(e){ CAD.ents.update(e.id,{style:b}); });
      op('Renomear estilo',function(){ S[b] = old; delete S[a]; },function(){ S[a] = old; delete S[b]; });
    });
    if(CAD.doc.current && CAD.doc.current.tstyle === a) CAD.doc.current.tstyle = b;
    return true;
  },
  setCurrent:function(name){ if(T.styles.all()[name]){ CAD.doc.current = CAD.doc.current || {}; CAD.doc.current.tstyle = name; } },
  current:function(){ var n = CAD.doc.current && CAD.doc.current.tstyle; return (n && T.styles.all()[n]) ? n : 'Standard'; }
};
T.style = function(name){ var S = T.styles.all(); return S[name] || S.Standard; };
function baseStyle(e){
  var s = T.style(e.style);
  return {font:e.font || s.font || 'Arial', bold:e.bold != null ? !!e.bold : !!s.bold, italic:e.italic != null ? !!e.italic : !!s.italic,
    under:false, over:false, strike:false, hm:1, wf:num(e.wf != null ? e.wf : s.wf,1) || 1, obl:num(e.obl != null ? e.obl : s.oblique,0), color:null};
}

/* ---------- fields ---------- */
T.fields = {
  _r:{},
  register:function(name,fn){ T.fields._r[name.toLowerCase()] = fn; }
};
function entById(a){ a = String(a).replace(/^#/,''); var e = CAD.ents.get(a); if(!e && /^\d+$/.test(a)) e = CAD.ents.get(+a); return e; }
function pad2(n){ return (n < 10 ? '0' : '') + n; }
(function(){
  var R = T.fields.register;
  R('date',function(){ var d = new Date(); return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1) + '/' + d.getFullYear(); });
  R('time',function(){ var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); });
  R('datetime',function(){ return T.fields._r.date() + ' ' + T.fields._r.time(); });
  R('filename',function(){ return (CAD.doc && (CAD.doc.name || CAD.doc.filename)) || 'Sem título'; });
  R('author',function(){ return (CAD.doc && CAD.doc.author) || ''; });
  R('units',function(){ return CAD.doc.units || ''; });
  R('count',function(){ return String(CAD.ents.query(function(){ return true; }).length); });
  R('var',function(a){ var v = CAD.doc.vars && CAD.doc.vars[a[0]]; return v == null ? '#N/D' : String(v); });
  R('layer',function(a){ var e = a[0] ? entById(a[0]) : null; return e ? e.layer : (CAD.doc.current && CAD.doc.current.layer) || '0'; });
  function measure1(kind){
    return function(a,prec){
      var e = entById(a[0] || ''); if(!e || !CAD.geom) return '#N/D';
      var v = kind === 'area' ? CAD.geom.area(e) : CAD.geom.length(e);
      return fmt(v,prec);
    };
  }
  R('len',measure1('len')); R('perim',measure1('len')); R('area',measure1('area'));
  R('x',function(a,prec){ var e = entById(a[0] || ''); return e && e.p ? fmt(e.p.x,prec) : '#N/D'; });
  R('y',function(a,prec){ var e = entById(a[0] || ''); return e && e.p ? fmt(e.p.y,prec) : '#N/D'; });
  R('prop',function(a){ var e = entById(a[0] || ''); if(!e) return '#N/D'; var v = e; (a[1] || '').split('.').forEach(function(k){ v = v == null ? v : v[k]; }); return v == null ? '#N/D' : String(v); });
})();
T.expandFields = function(str){
  if(str.indexOf('%<\\') < 0) return str;
  return str.replace(/%<\\([A-Za-z]+)([^>]*)>%/g,function(m,name,rest){
    var fn = T.fields._r[name.toLowerCase()]; if(!fn) return '#N/D';
    var args = rest.trim() ? rest.trim().split(/\s+/) : [], prec = T.precision;
    args = args.filter(function(a){ var q = /^p(\d)$/.exec(a); if(q){ prec = +q[1]; return false; } return true; });
    try{ return String(fn(args,prec)); }catch(e){ return '#N/D'; }
  });
};
T.setVar = function(name,val){
  var d = CAD.doc; d.vars = d.vars || {}; var had = Object.prototype.hasOwnProperty.call(d.vars,name), old = d.vars[name];
  op('Variável de campo',function(){ d.vars[name] = val; },function(){ if(had) d.vars[name] = old; else delete d.vars[name]; });
};

/* ---------- parser (códigos %% e códigos de MTEXT) ---------- */
function symText(s){ return s.replace(/%%([cCdDpP23<>~!%])/g,function(m,c){ return SYM[c]; }); }
function parse(str,base,o){
  var paras = [], cur = {align:null,atoms:[]}, st = copy(base), stack = [], buf = '', i = 0, n = str.length, ch, c, j;
  paras.push(cur);
  function flush(){ if(buf){ cur.atoms.push({k:'t',s:buf,st:copy(st)}); buf = ''; } }
  function para(){ flush(); cur = {align:cur.align,atoms:[]}; paras.push(cur); }
  function arg(){ j = str.indexOf(';',i); if(j < 0) j = n; var a = str.slice(i,j); i = j + 1; return a; }
  while(i < n){
    ch = str.charAt(i);
    if(ch === '\r'){ i++; continue; }
    if(ch === '\n'){ if(o.mt) para(); else buf += ' '; i++; continue; }
    if(o.mt && ch === '{'){ flush(); stack.push(copy(st)); i++; continue; }
    if(o.mt && ch === '}'){ flush(); if(stack.length) st = stack.pop(); i++; continue; }
    if(ch === '\\'){
      c = str.charAt(i+1);
      if(c === 'U' && str.charAt(i+2) === '+'){ buf += String.fromCharCode(parseInt(str.substr(i+3,4),16) || 63); i += 7; continue; }
      if(!o.mt){ buf += ch; i++; continue; }
      i += 2;
      var a, v, q;
      switch(c){
        case '\\': case '{': case '}': buf += c; break;
        case 'P': case 'N': para(); break;
        case '~': buf += '\u00a0'; break;
        case 'L': flush(); st.under = true; break;   case 'l': flush(); st.under = false; break;
        case 'O': flush(); st.over = true; break;    case 'o': flush(); st.over = false; break;
        case 'K': flush(); st.strike = true; break;  case 'k': flush(); st.strike = false; break;
        case 'B': flush(); st.bold = true; break;    case 'b': flush(); st.bold = false; break;   // extensão
        case 'I': flush(); st.italic = true; break;  case 'i': flush(); st.italic = false; break; // extensão
        case 'f': case 'F':
          flush(); a = arg().split('|'); if(a[0]) st.font = a[0];
          a.slice(1).forEach(function(x){ if(/^b\d/.test(x)) st.bold = x.charAt(1) === '1'; else if(/^i\d/.test(x)) st.italic = x.charAt(1) === '1'; });
          break;
        case 'H':
          flush(); a = arg(); v = parseFloat(a);
          if(isFinite(v)){ if(/x$/i.test(a)) st.hm *= v; else if(o.h > 0) st.hm = v / o.h; }
          break;
        case 'W': flush(); v = parseFloat(arg()); if(isFinite(v) && v > 0) st.wf = v; break;
        case 'Q': flush(); v = parseFloat(arg()); if(isFinite(v)) st.obl = v; break;
        case 'C': flush(); v = parseInt(arg(),10); st.color = ACI[v] || null; break;
        case 'T': case 'A': case 'c': case 'M': arg(); break;
        case 'p': a = arg(); q = /q([lcrj])/.exec(a); if(q) cur.align = q[1]; break;
        case 'S':
          flush(); a = arg();
          for(v = 0; v < a.length; v++){ if('/#^'.indexOf(a.charAt(v)) >= 0 && a.charAt(v-1) !== '\\') break; }
          var un = function(s){ return s.replace(/\\([\/#^])/g,'$1'); };
          if(v >= a.length) cur.atoms.push({k:'s',kind:'/',n:un(a),d:'',st:copy(st)});
          else cur.atoms.push({k:'s',kind:a.charAt(v),n:un(a.slice(0,v)),d:un(a.slice(v+1)),st:copy(st)});
          break;
        default: buf += c;
      }
      continue;
    }
    if(ch === '%' && str.charAt(i+1) === '%'){
      c = str.charAt(i+2);
      if(c === 'u' || c === 'U'){ flush(); st.under = !st.under; i += 3; continue; }
      if(c === 'o' || c === 'O'){ flush(); st.over = !st.over; i += 3; continue; }
      if(/^\d{3}$/.test(str.substr(i+2,3))){ buf += String.fromCharCode(+str.substr(i+2,3)); i += 5; continue; }
      if(Object.prototype.hasOwnProperty.call(SYM,c)){ buf += SYM[c]; i += 3; continue; }
      buf += '%%'; i += 2; continue;
    }
    buf += ch; i++;
  }
  flush();
  return paras;
}
T.parse = function(str,opts){
  opts = opts || {};
  return parse(T.expandFields(String(str)),{font:'Arial',bold:false,italic:false,under:false,over:false,strike:false,hm:1,wf:1,obl:0,color:null},{mt:opts.mt !== false,h:opts.h || 0});
};
T.plain = function(str,mt){
  return T.parse(str,{mt:mt !== false}).map(function(p){
    return p.atoms.map(function(a){ return a.k === 't' ? a.s : a.n + (a.d ? '/' + a.d : ''); }).join('');
  }).join('\n');
};

/* ---------- medição ---------- */
var _m = null, _tried = false, _mc = new Map();
function fam(f){ f = f || 'Arial'; return /[,"']/.test(f) ? f : ('"' + f + '", Arial, Helvetica, sans-serif'); }
function fontStr(st,px){ return (st.italic ? 'italic ' : '') + (st.bold ? 'bold ' : '') + px + 'px ' + fam(st.font); }
function estimate(s,st){
  var w = 0, i, c;
  for(i = 0; i < s.length; i++){
    c = s.charAt(i);
    if(' .,;:|!\'`'.indexOf(c) >= 0) w += 28; else if('ijl'.indexOf(c) >= 0) w += 24; else if('ftrI'.indexOf(c) >= 0) w += 34;
    else if('mwMW@'.indexOf(c) >= 0) w += 84; else if(c >= 'A' && c <= 'Z') w += 68; else if(c >= '0' && c <= '9') w += 56; else w += 53;
  }
  return w * (st.bold ? 1.06 : 1);
}
function measure(s,st){
  var key = (st.bold ? 'b' : '') + (st.italic ? 'i' : '') + '|' + st.font + '|' + s, w = _mc.get(key);
  if(w !== undefined) return w;
  if(!_tried){ _tried = true; try{ if(typeof document !== 'undefined') _m = document.createElement('canvas').getContext('2d'); }catch(e){ _m = null; } }
  if(_m){ _m.font = fontStr(st,100); w = _m.measureText(s).width; } else w = estimate(s,st);
  if(_mc.size > 6000) _mc.clear();
  _mc.set(key,w);
  return w;
}
T.measure = function(str,h,styleName){            // largura em unidades de mundo (linha única)
  var e = {type:'text',str:str,h:h,style:styleName}, g = geom(e); return g.L.w * g.k * g.sx;
};

/* ---------- layout ---------- */
function tokenize(p){
  var out = [];
  p.atoms.forEach(function(a){
    if(a.k === 't'){
      var re = / +|[^ ]+/g, m;
      while((m = re.exec(a.s))){ out.push({s:m[0],sp:m[0].charAt(0) === ' ',st:a.st,w:measure(m[0],a.st) * a.st.hm * a.st.wf,asc:72 * a.st.hm,desc:24 * a.st.hm}); }
    } else {
      var st = a.st, hm = st.hm, f = 0.7 * hm, n = symText(a.n), d = symText(a.d);
      var wn = measure(n,st) * f * st.wf, wd = measure(d,st) * f * st.wf;
      var w = a.kind === '#' ? wn + wd + 26 * hm : Math.max(wn,wd) + (a.kind === '/' ? 6 : 4) * hm;
      out.push({stack:true,kind:a.kind,n:n,d:d,wn:wn,wd:wd,st:st,w:w,asc:92.4 * hm,desc:38 * hm});
    }
  });
  return out;
}
function wrap(lines,toks,maxW,align){
  var line = {toks:[],w:0,align:align,last:false}, skipSp = false;
  function trim(l){ while(l.toks.length && l.toks[l.toks.length-1].sp){ l.w -= l.toks.pop().w; } }
  toks.forEach(function(t){
    var real = line.toks.some(function(x){ return !x.sp; });
    if(!t.sp && real && line.w + t.w > maxW){ trim(line); lines.push(line); line = {toks:[],w:0,align:align,last:false}; skipSp = true; }
    if(t.sp && skipSp) return;
    if(!t.sp) skipSp = false;
    line.toks.push(t); line.w += t.w;
  });
  trim(line); line.last = true; lines.push(line);
}
function runItem(s,x,y,st,hm,w){ return {t:'r',x:x,y:y,s:s,st:Object.assign({},st,{hm:hm}),w:w}; }
function stackItems(items,t,x,y){
  var hm = t.st.hm, c = t.st.color;
  if(t.kind === '#'){
    if(t.n) items.push(runItem(t.n,x,y - 42 * hm,t.st,hm * 0.7,t.wn));
    items.push({t:'l',x1:x + t.wn + 2 * hm,y1:y + 22 * hm,x2:x + t.wn + 24 * hm,y2:y - 88 * hm,lw:5 * hm,color:c});
    if(t.d) items.push(runItem(t.d,x + t.wn + 26 * hm,y + 20.4 * hm,t.st,hm * 0.7,t.wd));
  } else {
    var nx = t.kind === '/' ? x + (t.w - t.wn) / 2 : x, dx = t.kind === '/' ? x + (t.w - t.wd) / 2 : x;
    if(t.n) items.push(runItem(t.n,nx,y - 42 * hm,t.st,hm * 0.7,t.wn));
    if(t.d) items.push(runItem(t.d,dx,y + 20.4 * hm,t.st,hm * 0.7,t.wd));
    if(t.kind === '/') items.push({t:'l',x1:x + hm,y1:y - 36 * hm,x2:x + t.w - hm,y2:y - 36 * hm,lw:5 * hm,color:c});
  }
}
function buildLayout(str,st0,o){
  var paras = parse(str,st0,o), k = o.h / CAPR, maxW = o.w > 0 ? o.w / k : Infinity, lines = [], ls = o.ls || 1;
  paras.forEach(function(p){ wrap(lines,tokenize(p),maxW,p.align || 'l'); });
  var boxW = 0, prevY = 0, prevDesc = 0, items = [];
  lines.forEach(function(ln,i){
    var asc = 0, desc = 0, hmx = 0;
    ln.toks.forEach(function(t){ asc = Math.max(asc,t.asc); desc = Math.max(desc,t.desc); hmx = Math.max(hmx,t.st.hm); });
    if(!ln.toks.length){ asc = 72 * st0.hm; desc = 24 * st0.hm; hmx = st0.hm; }
    ln.y = i === 0 ? asc : Math.max(prevY + 120 * ls * hmx,prevY + prevDesc + asc + 4);
    ln.asc = asc; ln.desc = desc; prevY = ln.y; prevDesc = desc;
    boxW = Math.max(boxW,ln.w);
  });
  if(isFinite(maxW)) boxW = maxW;
  if(boxW < 1) boxW = 1;
  lines.forEach(function(ln){
    var x = 0, gap = 0, cur = null;
    if(ln.align === 'c') x = (boxW - ln.w) / 2; else if(ln.align === 'r') x = boxW - ln.w;
    else if(ln.align === 'j' && !ln.last && isFinite(maxW)){
      var ns = ln.toks.filter(function(t){ return t.sp; }).length; if(ns > 0) gap = (boxW - ln.w) / ns;
    }
    ln.toks.forEach(function(t){
      if(t.stack){ cur = null; stackItems(items,t,x,ln.y); x += t.w; return; }
      if(!gap && cur && cur.st === t.st){ cur.s += t.s; cur.w += t.w; }
      else { cur = {t:'r',x:x,y:ln.y,s:t.s,st:t.st,w:t.w + (t.sp ? gap : 0)}; items.push(cur); if(gap) cur = null; }
      x += t.w + (t.sp ? gap : 0);
    });
  });
  var deco = [];
  items.forEach(function(it){
    if(it.t !== 'r') return;
    var st = it.st, hm = st.hm;
    if(st.under) deco.push({t:'l',x1:it.x,y1:it.y + 12 * hm,x2:it.x + it.w,y2:it.y + 12 * hm,lw:6 * hm,color:st.color});
    if(st.over) deco.push({t:'l',x1:it.x,y1:it.y - 86 * hm,x2:it.x + it.w,y2:it.y - 86 * hm,lw:6 * hm,color:st.color});
    if(st.strike) deco.push({t:'l',x1:it.x,y1:it.y - 30 * hm,x2:it.x + it.w,y2:it.y - 30 * hm,lw:6 * hm,color:st.color});
  });
  var last = lines[lines.length-1];
  return {items:items.concat(deco),w:boxW,h:last.y + last.desc,base:lines[0].y,nlines:lines.length};
}
var _lc = new Map();
function cachedLayout(str,st,o){
  var key = [o.mt ? 1 : 0,o.h,o.w,o.ls,st.font,st.bold,st.italic,st.wf,st.obl,str].join('\u0001'), L = _lc.get(key);
  if(!L){ if(_lc.size > 3000) _lc.clear(); L = buildLayout(str,st,o); _lc.set(key,L); }
  return L;
}
function anchorOf(just,mt,L){
  var hj, vj;
  if(just.length === 2){ vj = just.charAt(0); hj = just.charAt(1); }
  else if(just === 'C'){ hj = 'C'; vj = 'S'; } else if(just === 'R'){ hj = 'R'; vj = 'S'; }
  else if(just === 'M'){ hj = 'C'; vj = 'M'; } else { hj = 'L'; vj = 'S'; }
  return {ax:hj === 'C' ? L.w / 2 : hj === 'R' ? L.w : 0, ay:vj === 'T' ? 0 : vj === 'B' ? L.h : vj === 'M' ? (mt ? L.h / 2 : L.base / 2) : L.base};
}
function geom(e){
  var mt = e.type === 'mtext', s = T.style(e.style), st = baseStyle(e);
  var h = num(e.h,0) || num(s.h,0) || T.lastH || T.defaultHeight();
  var raw = T.expandFields(String(e.str == null ? '' : e.str));
  if(!mt) raw = raw.replace(/[\r\n]+/g,' ');
  var o = {mt:mt,h:h,w:mt ? num(e.w,0) : 0,ls:mt ? num(e.ls,1) : 1,hm:1};
  var L = cachedLayout(raw,st,o), k = h / CAPR, sx = 1, rot = num(e.rot,0) * DEG, just = e.just || (mt ? 'TL' : 'L');
  if(!mt && (just === 'A' || just === 'F') && e.p2){
    var dx = e.p2.x - e.p.x, dy = e.p2.y - e.p.y, d = Math.hypot(dx,dy);
    rot = Math.atan2(dy,dx);
    if(L.w > 1 && d > 0){ if(just === 'A') k = d / L.w; else sx = d / (k * L.w); }
  }
  var a = anchorOf(just,mt,L);
  return {L:L,k:k,sx:sx,rot:rot,ax:a.ax,ay:a.ay,p:e.p,h:h,mt:mt,fx:s.backwards ? -1 : 1,fy:s.upside ? -1 : 1,just:just,st:st};
}
T.geom = geom;
function toWorld(g,lx,ly){
  var dx = g.fx * g.k * g.sx * (lx - g.ax), dy = g.fy * -g.k * (ly - g.ay), c = Math.cos(g.rot), s = Math.sin(g.rot);
  return pt(g.p.x + dx * c - dy * s,g.p.y + dx * s + dy * c);
}
function toLocal(g,p){
  var dx = p.x - g.p.x, dy = p.y - g.p.y, c = Math.cos(-g.rot), s = Math.sin(-g.rot);
  var ux = (dx * c - dy * s) * g.fx, uy = (dx * s + dy * c) * g.fy;
  return {lx:ux / (g.k * g.sx) + g.ax,ly:-uy / g.k + g.ay};
}

/* ---------- desenho ---------- */
function draw(ctx,e,view){
  var g = geom(e), L = g.L; if(!L.items.length) return;
  var sp = view.toScreen(g.p), sx0 = sp.x !== undefined ? sp.x : sp[0], sy0 = sp.y !== undefined ? sp.y : sp[1];
  var kz = g.k * view.zoom, base = ctx.strokeStyle;
  ctx.save();
  ctx.translate(sx0,sy0); ctx.rotate(-g.rot); ctx.scale(g.fx,g.fy); ctx.scale(kz * g.sx,kz); ctx.translate(-g.ax,-g.ay);
  if(g.h * view.zoom < 2.5){                       // texto minúsculo: traço simples
    ctx.strokeStyle = base; ctx.beginPath(); ctx.lineWidth = 60;
    L.items.forEach(function(it){ if(it.t === 'r'){ ctx.moveTo(it.x,it.y - 36 * it.st.hm); ctx.lineTo(it.x + it.w,it.y - 36 * it.st.hm); } });
    ctx.stroke(); ctx.restore(); return;
  }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  L.items.forEach(function(it){
    if(it.t === 'r'){
      if(!/[^ \u00a0]/.test(it.s)) return;
      var st = it.st;
      ctx.save(); ctx.translate(it.x,it.y); ctx.transform(st.wf,0,-Math.tan(st.obl * DEG),1,0,0);
      ctx.font = fontStr(st,100 * st.hm); ctx.fillStyle = st.color || base; ctx.fillText(it.s,0,0); ctx.restore();
    } else {
      ctx.strokeStyle = it.color || base; ctx.lineWidth = it.lw; ctx.beginPath(); ctx.moveTo(it.x1,it.y1); ctx.lineTo(it.x2,it.y2); ctx.stroke();
    }
  });
  ctx.restore();
}
T.draw = function(ctx,spec,view){ spec.type = spec.type || 'text'; draw(ctx,spec,view); };
T.box = function(spec){ spec.type = spec.type || 'text'; return bbox(spec); };

/* ---------- registro de tipos ---------- */
function bbox(e){
  var g = geom(e), c = [toWorld(g,0,0),toWorld(g,g.L.w,0),toWorld(g,g.L.w,g.L.h),toWorld(g,0,g.L.h)], xs = c.map(function(q){ return q.x; }), ys = c.map(function(q){ return q.y; });
  return {x1:Math.min.apply(0,xs),y1:Math.min.apply(0,ys),x2:Math.max.apply(0,xs),y2:Math.max.apply(0,ys)};
}
function hit(e,p,tol){
  var g = geom(e), q = toLocal(g,p), tl = (tol || 0) / g.k;
  return q.lx >= -tl && q.lx <= g.L.w + tl && q.ly >= -tl && q.ly <= g.L.h + tl;
}
function snapPts(e){ return [{pt:pt(e.p.x,e.p.y),mode:'insertion'}]; }
function grips(e){
  var gs = [{pt:pt(e.p.x,e.p.y),kind:'move',edit:function(q){
    var r = {p:pt(q.x,q.y)}; if(e.p2) r.p2 = pt(e.p2.x + q.x - e.p.x,e.p2.y + q.y - e.p.y); return r; }}];
  if(e.type === 'mtext'){
    var g = geom(e), hj = g.just.charAt(1);
    gs.push({pt:toWorld(g,g.L.w,0),kind:'width',edit:function(q){
      var l = toLocal(g,q).lx, w = hj === 'R' ? (g.L.w - l) * g.k : hj === 'C' ? 2 * (l - g.ax) * g.k : l * g.k;
      return {w:Math.max(g.h,w)};
    }});
  }
  return gs;
}
function transform(e,m){
  var q = CAD.xform.apply(m,e.p), det = m.a * m.d - m.b * m.c, s = Math.sqrt(Math.abs(det)) || 1, r = {p:pt(q.x,q.y)};
  if(e.p2){ var q2 = CAD.xform.apply(m,e.p2); r.p2 = pt(q2.x,q2.y); }
  if(det >= 0 && !((e.just === 'A' || e.just === 'F') && e.p2)) r.rot = ((num(e.rot,0) + Math.atan2(m.b,m.a) / DEG) % 360 + 360) % 360;
  if(Math.abs(s - 1) > 1e-12){ if(e.h) r.h = e.h * s; if(e.w) r.w = e.w * s; }
  return r;
}
function props(e){
  var mt = e.type === 'mtext', G = 'Texto', ps = [];
  function P(key,label,type,value,set,extra){ var o = {group:G,key:key,label:label,type:type,value:value,set:set}; if(extra) Object.assign(o,extra); ps.push(o); }
  P('str','Conteúdo','text',e.str,function(v){ return {str:String(v)}; });
  P('style','Estilo','select',e.style || 'Standard',function(v){ return {style:v}; },{options:T.styles.names()});
  P('just','Justificação','select',e.just || (mt ? 'TL' : 'L'),function(v){ return {just:v}; },{options:mt ? JUSTS_MT : JUSTS_ALL});
  P('h','Altura','number',num(e.h,0) || num(T.style(e.style).h,0) || T.defaultHeight(),function(v){ return {h:Math.max(1e-6,+v)}; },{min:0});
  P('rot','Rotação','angle',num(e.rot,0),function(v){ return {rot:+v}; });
  if(mt){
    P('w','Largura da caixa','number',num(e.w,0),function(v){ return {w:Math.max(0,+v)}; },{min:0});
    P('ls','Espaçamento de linha','number',num(e.ls,1),function(v){ return {ls:Math.max(0.1,+v)}; },{min:0.1});
  }
  P('bold','Negrito','select',e.bold == null ? 'Estilo' : (e.bold ? 'Sim' : 'Não'),function(v){ return {bold:v === 'Estilo' ? null : v === 'Sim'}; },{options:['Estilo','Sim','Não']});
  P('italic','Itálico','select',e.italic == null ? 'Estilo' : (e.italic ? 'Sim' : 'Não'),function(v){ return {italic:v === 'Estilo' ? null : v === 'Sim'}; },{options:['Estilo','Sim','Não']});
  P('p.x','Posição X','number',e.p.x,function(v){ return {p:pt(+v,e.p.y)}; },{group:'Geometria'});
  P('p.y','Posição Y','number',e.p.y,function(v){ return {p:pt(e.p.x,+v)}; },{group:'Geometria'});
  return ps;
}
function explode(e){
  var g = geom(e), out = [], bs = baseStyle(e), s = T.style(e.style);
  g.L.items.forEach(function(it){
    if(it.t !== 'r' || !/[^ \u00a0]/.test(it.s)) return;
    var st = it.st, n = baseEnt('text');
    n.layer = e.layer; n.color = st.color || e.color; n.lw = e.lw; n.ltype = e.ltype; n.space = e.space;
    n.p = toWorld(g,it.x,it.y); n.h = g.h * st.hm; n.rot = num(e.rot,0); n.style = e.style || 'Standard'; n.just = 'L';
    n.str = (st.under ? '%%u' : '') + (st.over ? '%%o' : '') + it.s.replace(/\u00a0/g,' ');
    if(st.font !== bs.font) n.font = st.font;
    if(st.bold !== !!s.bold) n.bold = st.bold;
    if(st.italic !== !!s.italic) n.italic = st.italic;
    if(st.wf !== bs.wf) n.wf = st.wf;
    if(st.obl !== bs.obl) n.obl = st.obl;
    out.push(n);
  });
  return out;
}

/* DXF: toDXF devolve [[código,valor],...] só com os grupos do tipo (sem layer/cor); fromDXF aceita pares ou objeto {código:valor} */
var DXFJ = {L:[0,0],C:[1,0],R:[2,0],A:[3,0],M:[4,0],F:[5,0],TL:[0,3],TC:[1,3],TR:[2,3],ML:[0,2],MC:[1,2],MR:[2,2],BL:[0,1],BC:[1,1],BR:[2,1]};
function hex4(c){ return ('0000' + c.toString(16).toUpperCase()).slice(-4); }
function dxfText(s){
  return s.replace(/[^\x00-\x7e]/g,function(ch){ return (ch === 'Ø' || ch === 'ø') ? '%%c' : ch === '°' ? '%%d' : ch === '±' ? '%%p' : '\\U+' + hex4(ch.charCodeAt(0)); });
}
function dxfMText(s,font){
  return s.replace(/\\B/g,'\\f' + font + '|b1;').replace(/\\b/g,'\\f' + font + '|b0;').replace(/\\I/g,'\\f' + font + '|i1;').replace(/\\i/g,'\\f' + font + '|i0;')
    .replace(/[^\x00-\x7e]/g,function(ch){ return '\\U+' + hex4(ch.charCodeAt(0)); });
}
function dget(g,c,d){
  var i, it, v;
  if(Array.isArray(g)){
    for(i = 0; i < g.length; i++){ it = g[i]; if(Array.isArray(it) && it[0] == c) return it[1]; if(it && !Array.isArray(it) && it.code == c) return it.value !== undefined ? it.value : it.v; }
    return d;
  }
  v = g[c]; if(Array.isArray(v)) v = v[0];
  return v === undefined ? d : v;
}
function dgetAll(g,c){
  var out = [];
  if(Array.isArray(g)) g.forEach(function(it){ if(Array.isArray(it) && it[0] == c) out.push(it[1]); else if(it && !Array.isArray(it) && it.code == c) out.push(it.value); });
  else if(g[c] !== undefined) out = [].concat(g[c]);
  return out;
}
function toDXF(e){
  var s = T.style(e.style), f = baseStyle(e), g = geom(e), mt = e.type === 'mtext', str = T.expandFields(String(e.str == null ? '' : e.str)), p = e.p, a;
  if(mt){
    var txt = dxfMText(str,f.font), chunks = [];
    while(txt.length > 250){ chunks.push(txt.slice(0,250)); txt = txt.slice(250); }
    a = [[0,'MTEXT'],[10,p.x],[20,p.y],[30,p.z || 0],[40,g.h],[41,num(e.w,0)],[71,Math.max(1,JUSTS_MT.indexOf(e.just || 'TL') + 1)],[72,1]];
    chunks.forEach(function(c){ a.push([3,c]); });
    a.push([1,txt],[50,num(e.rot,0)],[7,e.style || 'Standard']);
    return a;
  }
  var j = DXFJ[e.just || 'L'] || [0,0];
  a = [[0,'TEXT'],[10,p.x],[20,p.y],[30,p.z || 0],[40,g.h],[1,dxfText(str.replace(/[\r\n]+/g,' '))],[50,num(e.rot,0)],[41,f.wf],[51,f.obl],[7,e.style || 'Standard']];
  if(j[0] || j[1]){
    var q = ((e.just === 'A' || e.just === 'F') && e.p2) ? e.p2 : p;
    a.push([72,j[0]],[73,j[1]],[11,q.x],[21,q.y],[31,q.z || 0]);
    if(e.just === 'A' || e.just === 'F'){ a[1][1] = p.x; }
  }
  return a;
}
function fromDXF(g){
  var type = String(dget(g,0,'TEXT')).toUpperCase(), p = pt(num(dget(g,10,0),0),num(dget(g,20,0),0)), e;
  if(type === 'MTEXT'){
    var parts = dgetAll(g,3).join('') + String(dget(g,1,''));
    e = baseEnt('mtext'); e.p = p; e.h = num(dget(g,40,0),0); e.w = num(dget(g,41,0),0); e.str = parts;
    e.just = JUSTS_MT[Math.max(0,Math.min(8,num(dget(g,71,1),1) - 1))];
    var dx = dget(g,11,null), dy = dget(g,21,null);
    e.rot = dx != null && dy != null ? Math.atan2(+dy,+dx) / DEG : num(dget(g,50,0),0);
    e.style = String(dget(g,7,'Standard')); return e;
  }
  var h = num(dget(g,72,0),0), v = num(dget(g,73,0),0), just;
  if(h === 4) just = 'M'; else if(v === 0) just = ['L','C','R','A','M','F'][h] || 'L'; else just = ['','B','M','T'][v] + ['L','C','R'][h];
  e = baseEnt('text'); e.h = num(dget(g,40,0),0); e.str = String(dget(g,1,'')); e.rot = num(dget(g,50,0),0); e.style = String(dget(g,7,'Standard')); e.just = just;
  var wf = num(dget(g,41,1),1), ob = num(dget(g,51,0),0); if(wf !== 1) e.wf = wf; if(ob) e.obl = ob;
  var p2 = pt(num(dget(g,11,0),0),num(dget(g,21,0),0));
  if(just === 'A' || just === 'F'){ e.p = p; e.p2 = p2; } else if(h || v){ e.p = p2; } else e.p = p;
  return e;
}
/* SVG: o fragmento assume grupo externo com scale(1,-1) (coordenadas de mundo, Y para cima) */
function xmlEsc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function f4(v){ return (+v.toFixed(4)).toString(); }
function toSVG(e){
  var g = geom(e), c = '#000';
  try{ if(CAD.doc.resolve) c = CAD.doc.resolve(e).color || '#000'; }catch(x){}
  var tr = 'translate(' + f4(g.p.x) + ' ' + f4(g.p.y) + ') rotate(' + f4(g.rot / DEG) + ')' + (g.fx < 0 ? ' scale(-1 1)' : '') + (g.fy < 0 ? ' scale(1 -1)' : '') +
    ' scale(' + f4(g.k * g.sx) + ' ' + f4(-g.k) + ') translate(' + f4(-g.ax) + ' ' + f4(-g.ay) + ')';
  var out = '<g transform="' + tr + '" fill="' + c + '" stroke="' + c + '">';
  g.L.items.forEach(function(it){
    if(it.t === 'r'){
      if(!/[^ \u00a0]/.test(it.s)) return;
      var st = it.st, col = st.color || c;
      out += '<text transform="translate(' + f4(it.x) + ' ' + f4(it.y) + ') matrix(' + f4(st.wf) + ' 0 ' + f4(-Math.tan(st.obl * DEG)) + ' 1 0 0)" font-family="' +
        xmlEsc(fam(st.font)).replace(/"/g,'&quot;') + '" font-size="' + f4(100 * st.hm) + '"' + (st.bold ? ' font-weight="bold"' : '') + (st.italic ? ' font-style="italic"' : '') +
        ' fill="' + col + '" stroke="none" xml:space="preserve">' + xmlEsc(it.s) + '</text>';
    } else {
      out += '<line x1="' + f4(it.x1) + '" y1="' + f4(it.y1) + '" x2="' + f4(it.x2) + '" y2="' + f4(it.y2) + '" stroke="' + (it.color || c) + '" stroke-width="' + f4(it.lw) + '"/>';
    }
  });
  return out + '</g>';
}
var TDEF = {draw:draw,bbox:bbox,hit:hit,snapPts:snapPts,grips:grips,transform:transform,props:props,toDXF:toDXF,fromDXF:fromDXF,toSVG:toSVG};
if(CAD.types && CAD.types.register){
  CAD.types.register('text',Object.assign({},TDEF));
  CAD.types.register('mtext',Object.assign({explode:explode},TDEF));
}
if(CAD.snap && CAD.snap.register){
  CAD.snap.register('insertion',function(p,ctx,tol){
    var best = null, bd = tol;
    CAD.ents.query(function(e){ return (e.type === 'text' || e.type === 'mtext') && (!CAD.doc.visible || CAD.doc.visible(e)); }).forEach(function(e){
      var d = Math.hypot(e.p.x - p.x,e.p.y - p.y); if(d <= bd){ bd = d; best = {pt:pt(e.p.x,e.p.y),dist:d}; }
    });
    return best;
  });
}

/* ---------- criação ---------- */
T.create = function(kind,d){
  var e = Object.assign(baseEnt(kind),d);
  e.p = e.p ? pt(e.p.x,e.p.y) : pt(0,0);
  e.style = e.style || T.styles.current();
  if(e.str == null) e.str = '';
  return CAD.ents.add(e);
};
T.justify = function(e,newJust){        // muda a justificação mantendo o texto no mesmo lugar visual
  var g = geom(e), a = anchorOf(newJust,e.type === 'mtext',g.L), q = toWorld(g,a.ax,a.ay);
  return {just:newJust,p:pt(q.x,q.y)};
};

/* ---------- editor de texto (diálogo) ---------- */
T.editDialog = function(init){          // resolve {str,h,style,just,w,ls} | null (cancelou) | false (sem DOM)
  return new Promise(function(resolve){
    if(typeof document === 'undefined' || !document.body){ resolve(false); return; }
    var mt = init.kind === 'mtext';
    var S = {h:num(init.h,0) || T.lastH || T.defaultHeight(),style:init.style || T.styles.current(),just:init.just || (mt ? 'TL' : 'L'),w:num(init.w,0),ls:num(init.ls,1)};
    function el(tag,css,txt,par){ var x = document.createElement(tag); if(css) x.style.cssText = css; if(txt != null) x.textContent = txt; if(par) par.appendChild(x); return x; }
    var ov = el('div','position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;font:14px system-ui,Arial,sans-serif');
    var box = el('div','background:#fff;color:#111;border-radius:8px;padding:10px;width:min(600px,96vw);max-height:96vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.4)',null,ov);
    el('div','font-weight:600;margin-bottom:6px',mt ? 'Editor de texto (múltiplas linhas)' : 'Editor de texto',box);
    var bar = el('div','display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;align-items:center',null,box);
    var ta = el('textarea','width:100%;box-sizing:border-box;height:' + (mt ? '110px' : '46px') + ';font:14px Consolas,monospace;padding:6px',null,box);
    ta.value = init.str || '';
    var prev = el('canvas','width:100%;height:96px;border:1px solid #ccc;margin-top:6px;background:#fff;display:block',null,box);
    var row = el('div','display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center',null,box);
    var foot = el('div','display:flex;gap:8px;justify-content:flex-end;margin-top:10px',null,box);
    document.body.appendChild(ov);
    var cw = prev.clientWidth || 540, chh = 96; prev.width = cw; prev.height = chh;

    function upd(){
      var c = prev.getContext('2d'); c.clearRect(0,0,cw,chh);
      try{
        var e = {type:mt ? 'mtext' : 'text',p:pt(0,0),h:S.h,str:ta.value,rot:0,style:S.style,just:'TL',w:mt ? S.w : 0,ls:S.ls}, g = geom(e);
        var pw = Math.max(g.L.w * g.k,1e-9), ph = Math.max(g.L.h * g.k,1e-9), s = Math.min((cw - 16) / pw,(chh - 16) / ph,28 / S.h);
        if(!isFinite(s) || s <= 0) s = 1;
        c.strokeStyle = '#000'; draw(c,e,{zoom:s,toScreen:function(q){ return {x:8 + q.x * s,y:8 - q.y * s}; }});
      }catch(x){}
    }
    function wrapSel(a,b){
      var s = ta.selectionStart, e2 = ta.selectionEnd, v = ta.value;
      ta.value = v.slice(0,s) + a + v.slice(s,e2) + b + v.slice(e2);
      var pos = s === e2 ? s + a.length : e2 + a.length + b.length; ta.focus(); ta.setSelectionRange(pos,pos); upd();
    }
    function ins(t){ wrapSel(t,''); }
    function btn(label,title,fn,css){ var b = el('button','min-width:34px;height:30px;padding:0 8px;border:1px solid #bbb;border-radius:4px;background:#f4f4f4;cursor:pointer;' + (css || ''),label,bar); b.title = title; b.type = 'button'; b.onclick = fn; return b; }
    function actSel(label,items,fn){
      var s = el('select','height:30px;border:1px solid #bbb;border-radius:4px;background:#f4f4f4',null,bar), o0 = el('option',null,label,s); o0.value = '';
      items.forEach(function(it,i){ var o = el('option',null,it[0],s); o.value = String(i); });
      s.onchange = function(){ if(s.value !== ''){ fn(items[+s.value][1]); s.selectedIndex = 0; } };
    }
    if(mt){
      btn('N','Negrito',function(){ wrapSel('{\\B','}'); },'font-weight:bold');
      btn('I','Itálico',function(){ wrapSel('{\\I','}'); },'font-style:italic');
      btn('S','Sublinhado',function(){ wrapSel('{\\L','}'); },'text-decoration:underline');
      btn('S\u0336','Tachado',function(){ wrapSel('{\\K','}'); });
      btn('O\u0305','Sobrelinhado',function(){ wrapSel('{\\O','}'); });
      btn('a/b','Fração (selecione 1/2, 1^2 ou 1#2)',function(){
        var a = ta.selectionStart, b = ta.selectionEnd, s = ta.value.slice(a,b);
        var code = s ? '\\S' + s + (/[\/#^]/.test(s) ? '' : '/') + ';' : '\\S1/2;';
        ta.value = ta.value.slice(0,a) + code + ta.value.slice(b); ta.focus(); ta.setSelectionRange(a + code.length,a + code.length); upd();
      });
      btn('H','Altura da seleção (ex.: 1.5x ou valor absoluto)',function(){ var v = window.prompt('Altura (ex.: 1.5x ou 0.35):','1.5x'); if(v) wrapSel('{\\H' + v + ';','}'); });
      actSel('Cor',[['Vermelho','1'],['Amarelo','2'],['Verde','3'],['Ciano','4'],['Azul','5'],['Magenta','6'],['Preto','7']],function(v){ wrapSel('{\\C' + v + ';','}'); });
      actSel('Parágrafo',[['Esquerda','l'],['Centro','c'],['Direita','r'],['Justificado','j']],function(v){ ins('\\pq' + v + ';'); });
      btn('¶','Nova linha',function(){ ins('\\P'); });
    } else {
      btn('S','Sublinhado (%%u)',function(){ wrapSel('%%u','%%u'); },'text-decoration:underline');
      btn('O\u0305','Sobrelinhado (%%o)',function(){ wrapSel('%%o','%%o'); });
    }
    actSel('Símbolos',T.symbols.map(function(s){ return [s.ch + ' ' + s.name,s.ch]; }),function(v){ ins(v); });
    actSel('Campos',[['Data','%<\\date>%'],['Hora','%<\\time>%'],['Arquivo','%<\\filename>%'],['Autor','%<\\author>%'],['Unidade','%<\\units>%'],['Nº de objetos','%<\\count>%']],function(v){ ins(v); });

    function lab(t){ return el('label','display:flex;align-items:center;gap:4px',t,row); }
    var l1 = lab('Estilo'), ss = el('select','height:28px',null,l1);
    T.styles.names().forEach(function(n){ var o = el('option',null,n,ss); o.value = n; if(n === S.style) o.selected = true; });
    ss.onchange = function(){ S.style = ss.value; upd(); };
    var l2 = lab('Altura'), hi = el('input','width:80px;height:28px',null,l2); hi.type = 'number'; hi.step = 'any'; hi.min = '0'; hi.value = S.h;
    hi.oninput = function(){ var v = +hi.value; if(v > 0){ S.h = v; upd(); } };
    var l3 = lab(mt ? 'Ancoragem' : 'Justificação'), sj = el('select','height:28px',null,l3);
    (mt ? JUSTS_MT : JUSTS_ALL).forEach(function(n){ var o = el('option',null,n,sj); o.value = n; if(n === S.just) o.selected = true; });
    sj.onchange = function(){ S.just = sj.value; };
    if(mt){
      var l4 = lab('Largura (0 = livre)'), wi = el('input','width:80px;height:28px',null,l4); wi.type = 'number'; wi.step = 'any'; wi.min = '0'; wi.value = S.w;
      wi.oninput = function(){ S.w = Math.max(0,+wi.value || 0); upd(); };
      var l5 = lab('Entrelinha'), li = el('input','width:60px;height:28px',null,l5); li.type = 'number'; li.step = '0.1'; li.min = '0.1'; li.value = S.ls;
      li.oninput = function(){ S.ls = Math.max(0.1,+li.value || 1); upd(); };
    }
    function done(v){ document.removeEventListener('keydown',key,true); ov.remove(); resolve(v); }
    function key(ev){ if(ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); done(null); } else if(ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey || !mt)){ ev.preventDefault(); ev.stopPropagation(); ok.onclick(); } }
    var cancel = el('button','height:32px;padding:0 14px','Cancelar',foot), ok = el('button','height:32px;padding:0 14px;background:#1a73e8;color:#fff;border:0;border-radius:4px','OK',foot);
    cancel.onclick = function(){ done(null); };
    ok.onclick = function(){ done({str:ta.value,h:S.h,style:S.style,just:S.just,w:S.w,ls:S.ls}); };
    document.addEventListener('keydown',key,true);
    ta.addEventListener('input',upd); upd(); ta.focus();
  });
};

/* ---------- comandos ---------- */
function curStyle(){ return T.styles.current(); }
function isTextEnt(e){ return e && (e.type === 'text' || e.type === 'mtext'); }
async function pickTexts(prompt){
  var ids = await CAD.input.select(prompt), out = [];
  (ids || []).forEach(function(id){ var e = CAD.ents.get(id); if(isTextEnt(e)) out.push(e); });
  if(!out.length) CAD.cmd.print('Nenhum texto selecionado.');
  return out;
}
async function cmdText(){
  var sname = curStyle(), just = 'L', p, p2 = null, r;
  for(;;){
    r = await CAD.input.point('TEXTO  Ponto inicial ou [Justificar/Estilo] <' + just + '>:',{keywords:['Justificar','Estilo']});
    if(!r) return;
    if(r.keyword === undefined){ p = r; break; }
    if(String(r.keyword).charAt(0).toLowerCase() === 'j'){
      var jr = kwv(await CAD.input.keyword('Justificação [' + JUSTS_ALL.join('/') + '] <' + just + '>:',JUSTS_ALL,just)).toUpperCase();
      if(JUSTS_ALL.indexOf(jr) >= 0) just = jr;
    } else {
      var nm = String(kwv(await CAD.input.string('Nome do estilo ou ? <' + sname + '>:',{def:sname,allowEmpty:true})) || '').trim();
      if(nm === '?') CAD.cmd.print('Estilos: ' + T.styles.names().join(', '));
      else if(nm && T.styles.all()[nm]){ sname = nm; T.styles.setCurrent(nm); }
      else if(nm) CAD.cmd.print('Estilo inexistente.');
    }
  }
  var sty = T.style(sname), h = num(sty.h,0), rot = 0, def = T.lastH || T.defaultHeight();
  if(just === 'A' || just === 'F'){
    p2 = await CAD.input.point('Segundo ponto do texto:',{base:p}); if(!p2) return;
  }
  if(!(h > 0)){
    if(just === 'A') h = def;
    else { h = num(await CAD.input.number('Altura do texto <' + fmt(def) + '>:',{def:def,min:0,base:p}),def); if(!(h > 0)) h = def; }
  }
  T.lastH = h;
  if(!p2) rot = num(await CAD.input.angle('Ângulo de rotação <0>:',{def:0,base:p}),0);
  var pos = p, ang = rot * DEG, single = !!p2, s;
  for(;;){
    s = await CAD.input.string('Texto (Enter vazio encerra):',{allowEmpty:true});
    s = kwv(s) || (typeof s === 'string' ? s : '');
    if(!s) break;
    var d = {p:pos,h:h,str:s,rot:rot,style:sname,just:just}; if(p2) d.p2 = p2;
    T.create('text',d);
    if(single) break;
    pos = pt(pos.x + Math.sin(ang) * h * 1.6,pos.y - Math.cos(ang) * h * 1.6);
  }
}
async function cmdMText(){
  var sname = curStyle(), just = 'TL', rot = 0, h = num(T.style(sname).h,0) || T.lastH || T.defaultHeight(), p1, r, c2 = null;
  p1 = await CAD.input.point('MTEXTO  Primeiro canto:'); if(!p1) return;
  for(;;){
    r = await CAD.input.point('Canto oposto ou [Altura/Justificar/Rotação/Estilo/Largura]:',{base:p1,keywords:['Altura','Justificar','Rotacao','Estilo','Largura'],
      preview:function(ctx,v,q){ if(CAD.render && CAD.render.rubberRect) CAD.render.rubberRect(ctx,v,p1,q); }});
    if(!r) break;
    if(r.keyword === undefined){ c2 = r; break; }
    var k = String(r.keyword).charAt(0).toLowerCase();
    if(k === 'a'){ h = num(await CAD.input.number('Altura do texto <' + fmt(h) + '>:',{def:h,min:0,base:p1}),h) || h; T.lastH = h; }
    else if(k === 'j'){ var jr = kwv(await CAD.input.keyword('Ancoragem [' + JUSTS_MT.join('/') + '] <' + just + '>:',JUSTS_MT,just)).toUpperCase(); if(JUSTS_MT.indexOf(jr) >= 0) just = jr; }
    else if(k === 'r'){ rot = num(await CAD.input.angle('Ângulo de rotação <' + rot + '>:',{def:rot,base:p1}),rot); }
    else if(k === 'e'){ var nm = String(kwv(await CAD.input.string('Nome do estilo ou ? <' + sname + '>:',{def:sname,allowEmpty:true})) || '').trim();
      if(nm === '?') CAD.cmd.print('Estilos: ' + T.styles.names().join(', ')); else if(nm && T.styles.all()[nm]){ sname = nm; T.styles.setCurrent(nm); } }
    else if(k === 'l'){ var w = num(await CAD.input.number('Largura da caixa (0 = livre):',{def:0,min:0,base:p1}),0); c2 = {w:w,fixed:true}; break; }
  }
  var a = rot * DEG, w2 = 0, p = pt(p1.x,p1.y);
  if(c2 && c2.fixed) w2 = c2.w;
  else if(c2){
    var dx = c2.x - p1.x, dy = c2.y - p1.y, ux = dx * Math.cos(-a) - dy * Math.sin(-a), uy = dx * Math.sin(-a) + dy * Math.cos(-a);
    w2 = Math.abs(ux);
    var sx = Math.min(ux,0), sy = Math.max(uy,0);          // canto superior esquerdo do retângulo no referencial do texto
    p = pt(p1.x + sx * Math.cos(a) - sy * Math.sin(a),p1.y + sx * Math.sin(a) + sy * Math.cos(a));
  }
  var hj = just.charAt(1);
  if(w2 > 0 && hj !== 'L'){ var off = hj === 'C' ? w2 / 2 : w2; p = pt(p.x + off * Math.cos(a),p.y + off * Math.sin(a)); }
  var res = await T.editDialog({kind:'mtext',str:'',h:h,style:sname,just:just,w:w2,ls:1});
  if(res === false){ var s = await CAD.input.string('Texto (use \\P para nova linha):',{allowEmpty:true}); res = s ? {str:String(kwv(s) || s),h:h,style:sname,just:just,w:w2,ls:1} : null; }
  if(!res || !res.str) return;
  T.lastH = res.h;
  T.create('mtext',{p:p,w:res.w,h:res.h,str:res.str,rot:rot,style:res.style,just:res.just,ls:res.ls});
}
async function cmdEdit(){
  var list = await pickTexts('Selecione o texto para editar:');
  for(var i = 0; i < list.length; i++){
    var e = list[i], res = await T.editDialog({kind:e.type,str:e.str,h:e.h,style:e.style,just:e.just,w:e.w,ls:e.ls});
    if(res === false){ var s = await CAD.input.string('Novo texto <' + e.str + '>:',{def:e.str,allowEmpty:true}); if(s) CAD.ents.update(e.id,{str:String(kwv(s) || s)}); continue; }
    if(!res) continue;
    var patch = {str:res.str,h:res.h,style:res.style,just:res.just};
    if(e.type === 'mtext'){ patch.w = res.w; patch.ls = res.ls; }
    CAD.ents.update(e.id,patch);
  }
}
async function cmdJustify(){
  var list = await pickTexts('Selecione o texto para justificar:'); if(!list.length) return;
  var jr = kwv(await CAD.input.keyword('Nova justificação [' + JUSTS_ALL.join('/') + ']:',JUSTS_ALL,'L')).toUpperCase();
  if(JUSTS_ALL.indexOf(jr) < 0) return;
  list.forEach(function(e){
    if(e.type === 'mtext' && JUSTS_MT.indexOf(jr) < 0) return;
    if(jr === 'A' || jr === 'F') return;
    CAD.ents.update(e.id,T.justify(e,jr));
  });
}
async function cmdScaleText(){
  var list = await pickTexts('Selecione o texto para escalar:'); if(!list.length) return;
  var f = num(await CAD.input.number('Fator de escala <2>:',{def:2,min:0}),0); if(!(f > 0)) return;
  list.forEach(function(e){ var g = geom(e), pa = {h:g.h * f}; if(e.w) pa.w = e.w * f; CAD.ents.update(e.id,pa); });
}
async function cmdField(){
  var kinds = ['Data','Hora','DataHora','Arquivo','Autor','Unidade','Contagem','Comprimento','Area','Camada','Variavel'];
  var k = kwv(await CAD.input.keyword('CAMPO [' + kinds.join('/') + '] <Data>:',kinds,'Data'));
  var map = {data:'date',hora:'time',datahora:'datetime',arquivo:'filename',autor:'author',unidade:'units',contagem:'count',comprimento:'len',area:'area',camada:'layer',variavel:'var'};
  var name = map[k.toLowerCase()] || 'date', args = '';
  if(name === 'len' || name === 'area' || name === 'layer'){
    var ids = await CAD.input.select('Selecione o objeto:'); if(!ids || !ids.length) return; args = ' #' + ids[0];
  } else if(name === 'var'){
    var vn = String(kwv(await CAD.input.string('Nome da variável:',{allowEmpty:false})) || ''); if(!vn) return;
    args = ' ' + vn;
    var cur = CAD.doc.vars && CAD.doc.vars[vn];
    if(cur == null){ var val = await CAD.input.string('Valor da variável <' + vn + '>:',{allowEmpty:true}); T.setVar(vn,String(kwv(val) || val || '')); }
  }
  var p = await CAD.input.point('Ponto de inserção do campo:'); if(!p) return;
  var h = T.lastH || num(T.style(curStyle()).h,0) || T.defaultHeight();
  T.create('text',{p:p,h:h,str:'%<\\' + name + args + '>%',rot:0,style:curStyle(),just:'L'});
}
async function cmdStyle(){
  var S = T.styles, ks = ['Novo','Modificar','Definir','Excluir','Renomear','Listar'];
  var k = kwv(await CAD.input.keyword('ESTILO DE TEXTO [' + ks.join('/') + '] <Listar>:',ks,'Listar')).toLowerCase() || 'listar';
  async function askName(msg,must){
    var n = String(kwv(await CAD.input.string(msg,{def:curStyle(),allowEmpty:true})) || '').trim();
    if(must && !S.all()[n]){ CAD.cmd.print('Estilo inexistente.'); return null; }
    return n || null;
  }
  if(k === 'listar'){
    CAD.cmd.print('Estilos (atual: ' + curStyle() + '):');
    S.names().forEach(function(n){ var s = S.all()[n]; CAD.cmd.print('  ' + n + ' — ' + s.font + ', altura ' + (s.h || 'variável') + (s.bold ? ', negrito' : '') + (s.italic ? ', itálico' : '') + ', largura ' + s.wf + ', oblíquo ' + s.oblique + '°'); });
  } else if(k === 'novo'){
    var n = await askName('Nome do novo estilo:',false); if(!n) return;
    if(!S.add(n,S.all()[curStyle()] ? copy(S.all()[curStyle()]) : {})) CAD.cmd.print('Já existe um estilo com esse nome.'); else S.setCurrent(n);
  } else if(k === 'definir'){ var d = await askName('Estilo a definir como atual <' + curStyle() + '>:',true); if(d) S.setCurrent(d); }
  else if(k === 'excluir'){ var x = await askName('Estilo a excluir:',true); if(x && !S.remove(x)) CAD.cmd.print('Não é possível excluir o estilo Standard.'); }
  else if(k === 'renomear'){
    var a = await askName('Estilo a renomear:',true); if(!a) return;
    var b = String(kwv(await CAD.input.string('Novo nome:',{allowEmpty:false})) || '').trim();
    if(!b || !S.rename(a,b)) CAD.cmd.print('Não foi possível renomear.');
  } else {
    var m = await askName('Estilo a modificar <' + curStyle() + '>:',true); if(!m) return;
    var props2 = ['Fonte','Altura','Negrito','Italico','Largura','Obliquo'];
    var pr = kwv(await CAD.input.keyword('Propriedade [' + props2.join('/') + ']:',props2,'Fonte')).toLowerCase(), cur2 = S.all()[m], patch = {};
    if(pr === 'fonte'){ var f = String(kwv(await CAD.input.string('Fonte <' + cur2.font + '>:',{def:cur2.font,allowEmpty:true})) || '').trim(); if(f) patch.font = f; }
    else if(pr === 'altura') patch.h = Math.max(0,num(await CAD.input.number('Altura fixa (0 = perguntar) <' + cur2.h + '>:',{def:cur2.h,min:0}),cur2.h));
    else if(pr === 'negrito' || pr === 'italico'){ var yn = kwv(await CAD.input.keyword(pr === 'negrito' ? 'Negrito [Sim/Nao]:' : 'Itálico [Sim/Nao]:',['Sim','Nao'],'Nao')).toLowerCase(); patch[pr === 'negrito' ? 'bold' : 'italic'] = yn.charAt(0) === 's'; }
    else if(pr === 'largura') patch.wf = Math.max(0.1,num(await CAD.input.number('Fator de largura <' + cur2.wf + '>:',{def:cur2.wf,min:0.1}),cur2.wf));
    else patch.oblique = Math.max(-85,Math.min(85,num(await CAD.input.number('Ângulo oblíquo <' + cur2.oblique + '>:',{def:cur2.oblique,min:-85,max:85}),cur2.oblique)));
    S.update(m,patch);
  }
}
if(CAD.cmd && CAD.cmd.register){
  CAD.cmd.register({name:'TEXT',alias:['T','DT','DTEXT','TEXTO'],run:cmdText});
  CAD.cmd.register({name:'MTEXT',alias:['MT','MTEXTO'],run:cmdMText});
  CAD.cmd.register({name:'DDEDIT',alias:['ED','TEXTEDIT'],run:cmdEdit});
  CAD.cmd.register({name:'TEXTSTYLE',alias:['ST','STYLE'],run:cmdStyle});
  CAD.cmd.register({name:'JUSTIFYTEXT',alias:['JT'],run:cmdJustify});
  CAD.cmd.register({name:'SCALETEXT',alias:['STX'],run:cmdScaleText});
  CAD.cmd.register({name:'FIELD',alias:['FLD'],run:cmdField});
}

/* ---------- UI: menus, barra, painel de estilos ---------- */
if(CAD.ui && CAD.ui.menu && CAD.ui.menu.add){
  CAD.ui.menu.add('Anotar','Texto de linha única','TEXT');
  CAD.ui.menu.add('Anotar','Texto de múltiplas linhas','MTEXT');
  CAD.ui.menu.add('Anotar','Editar texto','DDEDIT');
  CAD.ui.menu.add('Anotar','Estilos de texto','TEXTSTYLE');
  CAD.ui.menu.add('Anotar','Justificar texto','JUSTIFYTEXT');
  CAD.ui.menu.add('Anotar','Escalar texto','SCALETEXT');
  CAD.ui.menu.add('Anotar','Inserir campo','FIELD');
}
if(CAD.ui && CAD.ui.toolbar && CAD.ui.toolbar.add){
  CAD.ui.toolbar.add('Anotar',{icone:'A',rotulo:'Texto',cmd:'TEXT'});
  CAD.ui.toolbar.add('Anotar',{icone:'¶',rotulo:'Texto múltiplo',cmd:'MTEXT'});
}
if(CAD.ui && CAD.ui.panel && CAD.ui.panel.register){
  CAD.ui.panel.register({id:'textstyles',title:'Estilos de texto',mount:function(el){
    var FONTS = ['Arial','Calibri','Consolas','Courier New','Georgia','Segoe UI','Tahoma','Times New Roman','Verdana','monospace','sans-serif','serif'];
    function mk(tag,css,txt,par){ var x = document.createElement(tag); if(css) x.style.cssText = css; if(txt != null) x.textContent = txt; if(par) par.appendChild(x); return x; }
    function render(){
      el.innerHTML = '';
      var wrapEl = mk('div','padding:8px;font:13px system-ui,Arial,sans-serif',null,el), names = T.styles.names(), cur = T.styles.current(), s = T.style(cur);
      var sel = mk('select','width:100%;height:30px;margin-bottom:6px',null,wrapEl);
      names.forEach(function(n){ var o = mk('option',null,n,sel); o.value = n; if(n === cur) o.selected = true; });
      sel.onchange = function(){ T.styles.setCurrent(sel.value); render(); };
      function field(label,type,value,apply,attrs){
        var l = mk('label','display:flex;justify-content:space-between;align-items:center;margin:3px 0',label,wrapEl), i = mk('input','width:55%;height:26px',null,l);
        i.type = type; if(attrs) Object.keys(attrs).forEach(function(k){ i.setAttribute(k,attrs[k]); });
        if(type === 'checkbox'){ i.checked = !!value; i.style.width = 'auto'; i.onchange = function(){ apply(i.checked); }; }
        else { i.value = value; i.onchange = function(){ apply(i.value); }; }
        return i;
      }
      var fi = field('Fonte','text',s.font,function(v){ if(v.trim()) T.styles.update(cur,{font:v.trim()}); },{list:'cad-fonts'});
      var dl = mk('datalist',null,null,wrapEl); dl.id = 'cad-fonts'; FONTS.forEach(function(f){ mk('option',null,f,dl).value = f; });
      field('Altura (0 = perguntar)','number',s.h,function(v){ T.styles.update(cur,{h:Math.max(0,+v || 0)}); },{step:'any',min:'0'});
      field('Negrito','checkbox',s.bold,function(v){ T.styles.update(cur,{bold:v}); });
      field('Itálico','checkbox',s.italic,function(v){ T.styles.update(cur,{italic:v}); });
      field('Fator de largura','number',s.wf,function(v){ T.styles.update(cur,{wf:Math.max(0.1,+v || 1)}); },{step:'0.05',min:'0.1'});
      field('Oblíquo (°)','number',s.oblique,function(v){ T.styles.update(cur,{oblique:Math.max(-85,Math.min(85,+v || 0))}); },{step:'1'});
      field('De cabeça para baixo','checkbox',s.upside,function(v){ T.styles.update(cur,{upside:v}); });
      field('Espelhado','checkbox',s.backwards,function(v){ T.styles.update(cur,{backwards:v}); });
      var bt = mk('div','display:flex;gap:6px;margin-top:8px',null,wrapEl);
      mk('button','flex:1;height:28px','Novo',bt).onclick = function(){ var n = window.prompt('Nome do novo estilo:'); if(n && T.styles.add(n.trim(),copy(s))){ T.styles.setCurrent(n.trim()); render(); } };
      mk('button','flex:1;height:28px','Renomear',bt).onclick = function(){ var n = window.prompt('Novo nome:',cur); if(n && T.styles.rename(cur,n.trim())) render(); };
      mk('button','flex:1;height:28px','Excluir',bt).onclick = function(){ if(cur !== 'Standard' && window.confirm('Excluir o estilo "' + cur + '"? Os textos passam para Standard.')){ T.styles.remove(cur); render(); } };
    }
    render();
    if(CAD.on) CAD.on('doc:changed',function(){ if(el.isConnected) render(); });
  }});
}

/* ---------- testes ---------- */
CAD.tests = CAD.tests || {};
CAD.tests.p8 = function(){
  var pass = 0, fail = 0;
  function ok(c,msg){ if(c) pass++; else { fail++; console.assert(false,'P8 FALHOU: ' + msg); } }
  function near(a,b,t){ return Math.abs(a - b) <= (t == null ? 1e-6 : t); }
  var hasEnts = CAD.ents && CAD.ents.add, added = [];
  ok(!!T.style('Standard') && T.styles.names().indexOf('Standard') >= 0,'estilo Standard existe');
  ok(T.style('inexistente') === T.style('Standard'),'estilo desconhecido cai em Standard');
  var pl = T.plain('%%c25 %%p0,5 %%d 10%%3 a%%<b %%130');
  ok(pl.indexOf('Ø25') === 0 && pl.indexOf('±0,5') > 0 && pl.indexOf('°') > 0 && pl.indexOf('³') > 0 && pl.indexOf('≤') > 0,'símbolos %%');
  ok(T.plain('a\\Pb') === 'a\nb','\\P gera nova linha');
  ok(T.plain('{\\C1;x}y') === 'xy','grupos e cor');
  ok(T.plain('\\S1/2;') === '1/2','fração /');
  ok(T.plain('\\U+00B0') === '°','\\U+');
  ok(T.expandFields('%<\\units>%') === (CAD.doc.units || ''),'campo units');
  ok(/^\d\d\/\d\d\/\d{4}$/.test(T.expandFields('%<\\date>%')),'campo date');
  ok(T.expandFields('%<\\naoexiste>%') === '#N/D','campo desconhecido');
  var A = {type:'text',p:pt(0,0),h:2,str:'Hello',rot:0,style:'Standard',just:'L'}, bA = bbox(A);
  ok(bA.x2 > bA.x1 && bA.y2 > bA.y1,'bbox com área');
  ok(near(bA.x1,0) && bA.y2 > 0 && bA.y2 < 2.2,'texto L: x1=0 e topo ≈ altura');
  var B = Object.assign({},A,{just:'C'}), bB = bbox(B);
  ok(near((bB.x1 + bB.x2) / 2,0,1e-6),'texto C centralizado no ponto');
  var Cc = Object.assign({},A,{just:'R'}), bC = bbox(Cc);
  ok(near(bC.x2,0,1e-6),'texto R termina no ponto');
  var D = Object.assign({},A,{just:'TL'}), bD = bbox(D);
  ok(near(bD.y2,0,1e-6),'TL: topo no ponto');
  var E2 = Object.assign({},A,{just:'BL'}), bE = bbox(E2);
  ok(near(bE.y1,0,1e-6),'BL: base no ponto');
  var big = Object.assign({},A,{h:4}); ok(near(bbox(big).x2 / bA.x2,2,1e-6),'largura proporcional à altura');
  var R = Object.assign({},A,{rot:90}), bR = bbox(R);
  ok(bR.y2 - bR.y1 > bR.x2 - bR.x1,'rotação 90° inverte caixa');
  ok(hit(A,pt(bA.x2 / 2,bA.y2 / 2),0.01) && !hit(A,pt(bA.x2 + 5,0),0.1),'hit dentro/fora');
  var wd = T.measure('Hello',2,'Standard'); ok(near(wd,bA.x2 - bA.x1,1e-6),'T.measure confere com bbox');
  var M1 = {type:'mtext',p:pt(0,0),h:2,w:0,str:'linha um\\Plinha dois',rot:0,style:'Standard',just:'TL'}, M2 = Object.assign({},M1,{str:'linha um'});
  ok(geom(M1).L.nlines === 2 && geom(M2).L.nlines === 1,'MTEXT com \\P tem 2 linhas');
  var M3 = {type:'mtext',p:pt(0,0),h:2,w:8,str:'uma frase bem comprida para forçar quebra automática',rot:0,style:'Standard',just:'TL'};
  ok(geom(M3).L.nlines > 1 && near(geom(M3).L.w * geom(M3).k,8,1e-9),'quebra automática pela largura');
  var M4 = Object.assign({},M1,{str:'\\S1/2;'}), g4 = geom(M4).L.items;
  ok(g4.some(function(i){ return i.t === 'l'; }) && g4.filter(function(i){ return i.t === 'r'; }).length === 2,'fração gera barra e dois textos');
  var M5 = Object.assign({},M1,{str:'{\\Lsub}'}); ok(geom(M5).L.items.some(function(i){ return i.t === 'l'; }),'sublinhado gera linha');
  var M6 = Object.assign({},M1,{str:'{\\Bnegrito} normal'}); ok(geom(M6).L.items[0].st.bold === true,'negrito inline');
  var tm = transform(A,{a:1,b:0,c:0,d:1,e:10,f:5}) ; ok(true,'transform executa');
  if(CAD.xform){
    ok(near(tm.p.x,10) && near(tm.p.y,5),'transform: translação');
    var ts = transform(A,{a:2,b:0,c:0,d:2,e:0,f:0}); ok(near(ts.h,4),'transform: escala dobra altura');
    var tr = transform(A,{a:0,b:1,c:-1,d:0,e:0,f:0}); ok(near(tr.rot,90),'transform: rotação 90°');
  }
  var dx = toDXF(Object.assign({},A,{just:'MC',str:'Ø 25 ≤ 3'})), back = fromDXF(dx);
  ok(back.type === 'text' && back.just === 'MC' && near(back.h,2),'DXF TEXT ida e volta (justificação/altura)');
  ok(dx.some(function(g){ return g[0] === 1 && /%%c/.test(g[1]) && /\\U\+2264/.test(g[1]); }),'DXF TEXT codifica Ø e ≤');
  var md = toDXF(Object.assign({},M1,{w:5})), mb = fromDXF(md);
  ok(mb.type === 'mtext' && mb.just === 'TL' && near(mb.w,5) && mb.str === M1.str,'DXF MTEXT ida e volta');
  var ex = explode(M1); ok(ex.length === 2 && ex[0].type === 'text' && ex[0].p.y > ex[1].p.y,'explode MTEXT em 2 textos (de cima p/ baixo)');
  var sv = toSVG(A); ok(sv.indexOf('<text') > 0 && sv.indexOf('Hello') > 0,'SVG contém o texto');
  var gr = grips(M3); ok(gr.length === 2 && gr[1].kind === 'width','MTEXT tem grip de largura');
  var jp = T.justify(A,'C'); ok(near(jp.p.x,(bA.x2 - bA.x1) / 2,1e-6),'T.justify mantém posição visual');
  var af = geom({type:'text',p:pt(0,0),p2:pt(10,0),h:2,str:'Hello',rot:0,style:'Standard',just:'F'});
  ok(near(af.L.w * af.k * af.sx,10,1e-6),'Fit ajusta à distância dos pontos');
  var aa = geom({type:'text',p:pt(0,0),p2:pt(10,0),h:2,str:'Hello',rot:0,style:'Standard',just:'A'});
  ok(near(aa.L.w * aa.k,10,1e-6),'Aligned ajusta altura à distância');
  if(CAD.types && CAD.types.get) ok(!!CAD.types.get('text') && !!CAD.types.get('mtext'),'tipos text/mtext registrados');
  if(hasEnts){
    try{
      var r = T.create('text',{p:pt(1,1),h:1,str:'teste p8'}); var id = r && (r.id || (Array.isArray(r) && r[0] && r[0].id));
      if(id != null){ added.push(id); ok(CAD.ents.get(id) && CAD.ents.get(id).type === 'text','T.create adiciona entidade'); }
    }catch(x){ ok(false,'T.create lançou: ' + x.message); }
    added.forEach(function(id){ try{ CAD.ents.remove(id); }catch(x){} });
  }
  var msg = 'P8: ' + pass + ' ok, ' + fail + ' falha(s)';
  if(CAD.cmd && CAD.cmd.print) CAD.cmd.print(msg); console.log(msg);
  return {pass:pass,fail:fail};
};
})(window.CAD=window.CAD||{});
/* ==== END:8 ==== */
