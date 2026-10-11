/* ==== PART:1 ==== */
(function(CAD){
'use strict';
CAD.version='0.1.0';

/* =====================================================================
   ENGINE (sem DOM). A UI só conversa com isto.
   ===================================================================== */
function Cancel(){this.name='Cancel';this.message='cancelado';}
Cancel.prototype=Object.create(Error.prototype);
CAD.Cancel=Cancel;
CAD.has=function(m){return CAD[m]!==undefined;};
CAD.clone=function(o){return o===undefined?o:JSON.parse(JSON.stringify(o));};
function fmt(p){return p.x.toFixed(3)+','+p.y.toFixed(3);}

/* ---------- eventos ---------- */
var EV={};
CAD.on=function(ev,fn){(EV[ev]=EV[ev]||[]).push(fn);return fn;};
CAD.off=function(ev,fn){var a=EV[ev]||[],i=a.indexOf(fn);if(i>=0)a.splice(i,1);};
CAD.emit=function(ev,d){(EV[ev]||[]).slice().forEach(function(f){try{f(d);}catch(x){console.error('[CAD] '+ev,x);}});};

/* ---------- modos (F3 F7 F8 F9 F10 F12) ---------- */
CAD.mode={osnap:true,ortho:false,polar:false,grid:true,snap:false,dynin:true,gridStep:1,lwdisp:false};
CAD.toggle=function(k){CAD.mode[k]=!CAD.mode[k];CAD.emit('mode:changed',{key:k,value:CAD.mode[k]});CAD.render.request();};

/* ---------- documento ---------- */
CAD.newDoc=function(){
  return {version:1,units:'m',
    layers:[{name:'0',color:'#000000',lw:0.25,ltype:'continuous',on:true,frozen:false,locked:false,transp:0,plot:true}],
    entities:[],blocks:{},dimstyles:{},textstyles:{},
    layouts:[{name:'Layout1',paper:'A3',orient:'landscape',scale:'1:100',margins:[10,10,10,10],viewports:[],titleblock:null}],
    current:{layer:'0',color:null,lw:null,ltype:null}};
};
CAD.doc=CAD.newDoc();
CAD.space='model';
CAD.lastPoint=null;
CAD.cursor=null;
var seq=0,idx={};
CAD.nextId=function(){return 'e'+(++seq);};
CAD.setDoc=function(d){
  CAD.doc=d;idx={};var m=0;
  d.entities.forEach(function(e){idx[e.id]=e;var n=parseInt(String(e.id).slice(1),10);if(n>m)m=n;});
  if(m>seq)seq=m;
  CAD.history.clear();CAD.sel.clear();
  CAD.emit('doc:changed',{reset:true});CAD.render.request();
};
CAD.layer=function(n){var L=CAD.doc.layers;for(var i=0;i<L.length;i++)if(L[i].name===n)return L[i];return L[0];};
CAD.visible=function(e){var l=CAD.layer(e.layer);return l.on!==false&&!l.frozen&&(e.space||'model')===CAD.space;};
CAD.selectable=function(e){return CAD.visible(e)&&!CAD.layer(e.layer).locked;};
CAD.resolve=function(e){var l=CAD.layer(e.layer);return {color:e.color||l.color,lw:e.lw==null?l.lw:e.lw,ltype:e.ltype||l.ltype};};
/* matriz afim 2D {a,b,c,d,e,f}: x'=a*x+c*y+e ; y'=b*x+d*y+f */
CAD.xform={apply:function(m,p){return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f,z:p.z||0};}};

/* ---------- history transacional (sem snapshot) ---------- */
var HS={undo:[],redo:[],group:null,depth:0};
function hpush(g){HS.undo.push(g);if(HS.undo.length>1000)HS.undo.shift();HS.redo.length=0;}
CAD.history={
  run:function(a){
    a.do();
    if(HS.group)HS.group.items.push(a);else hpush({name:a.name,items:[a]});
    CAD.dirty=true;CAD.emit('doc:changed',{action:a.name});CAD.render.request();return a;
  },
  begin:function(name){if(HS.depth++===0)HS.group={name:name||'Comando',items:[]};},
  end:function(){
    if(HS.depth===0)return;
    if(--HS.depth===0){var g=HS.group;HS.group=null;if(g&&g.items.length)hpush(g);}
  },
  undo:function(){
    if(HS.depth)return false;var g=HS.undo.pop();if(!g)return false;
    for(var i=g.items.length-1;i>=0;i--)g.items[i].undo();
    HS.redo.push(g);CAD.sel.prune();CAD.dirty=true;
    CAD.emit('doc:changed',{action:'undo',name:g.name});CAD.cmd.print('Desfazer: '+g.name);CAD.render.request();return true;
  },
  redo:function(){
    if(HS.depth)return false;var g=HS.redo.pop();if(!g)return false;
    g.items.forEach(function(a){a.do();});
    HS.undo.push(g);CAD.sel.prune();CAD.dirty=true;
    CAD.emit('doc:changed',{action:'redo',name:g.name});CAD.cmd.print('Refazer: '+g.name);CAD.render.request();return true;
  },
  clear:function(){HS.undo.length=0;HS.redo.length=0;HS.group=null;HS.depth=0;},
  canUndo:function(){return HS.undo.length>0;},
  canRedo:function(){return HS.redo.length>0;}
};

/* ---------- registro de tipos ---------- */
var T={};
CAD.types={
  register:function(t,d){d.type=t;T[t]=d;CAD.emit('types:changed',t);CAD.render.request();},
  extend:function(t,part){T[t]=T[t]||{type:t};for(var k in part)T[t][k]=part[k];},   // ex.: P12 acrescenta toDXF/fromDXF
  get:function(t){return T[t];},
  list:function(){return Object.keys(T);},
  call:function(e,fn){var d=T[e.type];return d&&d[fn]?d[fn].apply(d,[e].concat([].slice.call(arguments,2))):undefined;}
};
function bboxOf(e){var d=T[e.type];return d&&d.bbox?d.bbox(e):null;}   // bbox => {x1,y1,x2,y2}
CAD.bboxOf=bboxOf;

/* ---------- entidades ---------- */
CAD.ents={
  add:function(e){
    var arr=Array.isArray(e)?e:[e],cur=CAD.doc.current,L=CAD.doc.entities;
    arr.forEach(function(x){
      if(!x.id)x.id=CAD.nextId();
      if(x.layer===undefined)x.layer=cur.layer;
      ['color','lw','ltype'].forEach(function(k){if(x[k]===undefined)x[k]=cur[k]===undefined?null:cur[k];});
      if(!x.space)x.space=CAD.space;
    });
    CAD.history.run({name:'Adicionar',
      do:function(){arr.forEach(function(x){L.push(x);idx[x.id]=x;});},
      undo:function(){arr.forEach(function(x){var i=L.indexOf(x);if(i>=0)L.splice(i,1);delete idx[x.id];});}});
    return Array.isArray(e)?arr:arr[0];
  },
  remove:function(x){
    var ids=(Array.isArray(x)?x:[x]).map(function(v){return typeof v==='object'?v.id:v;});
    var L=CAD.doc.entities,items=[];
    L.forEach(function(e,i){if(ids.indexOf(e.id)>=0)items.push({e:e,i:i});});
    if(!items.length)return 0;
    CAD.history.run({name:'Apagar',
      do:function(){for(var k=items.length-1;k>=0;k--){L.splice(items[k].i,1);delete idx[items[k].e.id];}CAD.sel.prune();},
      undo:function(){items.forEach(function(it){L.splice(it.i,0,it.e);idx[it.e.id]=it.e;});}});
    return items.length;
  },
  update:function(id,patch){
    var e=CAD.ents.get(id);if(!e)return null;
    var old={},had={},nw=CAD.clone(patch);
    Object.keys(patch).forEach(function(k){had[k]=(k in e);old[k]=CAD.clone(e[k]);});
    CAD.history.run({name:'Alterar',
      do:function(){Object.keys(nw).forEach(function(k){e[k]=CAD.clone(nw[k]);});},
      undo:function(){Object.keys(old).forEach(function(k){if(had[k])e[k]=CAD.clone(old[k]);else delete e[k];});}});
    return e;
  },
  get:function(id){
    if(idx[id])return idx[id];
    var L=CAD.doc.entities;for(var i=0;i<L.length;i++)if(L[i].id===id)return L[i];return null;
  },
  query:function(f){
    var L=CAD.doc.entities;if(!f)return L.slice();if(typeof f==='function')return L.filter(f);
    return L.filter(function(e){for(var k in f)if(e[k]!==f[k])return false;return true;});
  }
};

/* ---------- seleção ---------- */
var S={};
function schg(){CAD.emit('sel:changed',Object.keys(S));CAD.render.request();}
CAD.sel={
  set:function(ids){S={};(ids||[]).forEach(function(i){S[i]=1;});schg();},
  add:function(ids){[].concat(ids).forEach(function(i){S[i]=1;});schg();},
  remove:function(ids){[].concat(ids).forEach(function(i){delete S[i];});schg();},
  clear:function(){if(Object.keys(S).length){S={};schg();}},
  has:function(id){return !!S[id];},
  ids:function(){return Object.keys(S);},
  size:function(){return Object.keys(S).length;},
  prune:function(){var ch=false;Object.keys(S).forEach(function(i){if(!CAD.ents.get(i)){delete S[i];ch=true;}});if(ch)schg();},
  /* modos: 'click'(a=pt) 'window'|'crossing'(a,b=cantos) 'all' 'last'. Retorna array de ids */
  pick:function(mode,a,b){
    var L=CAD.doc.entities,out=[],i,e,d;
    if(mode==='all')return L.filter(CAD.selectable).map(function(x){return x.id;});
    if(mode==='last'){for(i=L.length-1;i>=0;i--)if(CAD.selectable(L[i]))return [L[i].id];return out;}
    if(mode==='click'){
      var tol=CAD.view.pickTol();
      for(i=L.length-1;i>=0;i--){e=L[i];if(!CAD.selectable(e))continue;d=T[e.type];if(d&&d.hit&&d.hit(e,a,tol))return [e.id];}
      return out;
    }
    if(mode==='window'||mode==='crossing'){
      var r={x1:Math.min(a.x,b.x),y1:Math.min(a.y,b.y),x2:Math.max(a.x,b.x),y2:Math.max(a.y,b.y)};
      L.forEach(function(e){
        if(!CAD.selectable(e))return;var bb=bboxOf(e);if(!bb)return;
        var inside=bb.x1>=r.x1&&bb.x2<=r.x2&&bb.y1>=r.y1&&bb.y2<=r.y2;
        var hit=bb.x1<=r.x2&&bb.x2>=r.x1&&bb.y1<=r.y2&&bb.y2>=r.y1;
        if(mode==='window'?inside:hit)out.push(e.id);
      });
    }
    return out;
  }
};

/* ---------- viewport (zoom = pixels por unidade; pan = ponto do mundo no centro da tela) ---------- */
var V=CAD.view={zoom:10,pan:{x:0,y:0},w:800,h:600,stack:[]};
function vchg(){CAD.emit('view:changed',{zoom:V.zoom,pan:V.pan});CAD.render.request();}
V.toScreen=function(p){return {x:(p.x-V.pan.x)*V.zoom+V.w/2,y:V.h/2-(p.y-V.pan.y)*V.zoom};};
V.toWorld=function(sx,sy){return {x:(sx-V.w/2)/V.zoom+V.pan.x,y:V.pan.y-(sy-V.h/2)/V.zoom,z:0};};
V.pickTol=function(){return 6/V.zoom;};
V.setSize=function(w,h){V.w=w;V.h=h;vchg();};
V.save=function(){V.stack.push({zoom:V.zoom,x:V.pan.x,y:V.pan.y});if(V.stack.length>30)V.stack.shift();};
V.panBy=function(dx,dy){V.pan.x-=dx/V.zoom;V.pan.y+=dy/V.zoom;vchg();};
V.zoomAt=function(sx,sy,f){
  var wp=V.toWorld(sx,sy);V.zoom=Math.min(1e7,Math.max(1e-5,V.zoom*f));
  V.pan.x=wp.x-(sx-V.w/2)/V.zoom;V.pan.y=wp.y+(sy-V.h/2)/V.zoom;vchg();
};
V.fit=function(x1,y1,x2,y2,m){
  var bw=Math.max(x2-x1,1e-9),bh=Math.max(y2-y1,1e-9);
  V.zoom=Math.min(V.w/bw,V.h/bh)*(m||0.9);V.pan.x=(x1+x2)/2;V.pan.y=(y1+y2)/2;vchg();
};
V.extents=function(){
  var x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  CAD.doc.entities.forEach(function(e){
    if(!CAD.visible(e))return;var b=bboxOf(e);if(!b)return;
    x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
  });
  V.save();
  if(x1===Infinity){V.fit(0,0,100,100*V.h/V.w,1);return;}
  if(x2-x1<1e-9&&y2-y1<1e-9){x1-=5;x2+=5;y1-=5;y2+=5;}
  V.fit(x1,y1,x2,y2,0.9);
};
V.window=function(a,b){
  if(Math.abs(a.x-b.x)<1e-9||Math.abs(a.y-b.y)<1e-9)return;
  V.save();V.fit(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y),1);
};
V.previous=function(){var s=V.stack.pop();if(!s){CAD.cmd.print('Sem zoom anterior.');return;}V.zoom=s.zoom;V.pan.x=s.x;V.pan.y=s.y;vchg();};

/* ---------- snap (versão mínima; P3 amplia) ---------- */
var SN={};
CAD.snap={
  register:function(mode,fn){SN[mode]=fn;},   // fn(pt,ctx,tolMundo)->{pt,dist}|null
  resolve:function(pt,ctx){
    ctx=ctx||{};var base=ctx.base||null,m,best=null,tol=(ctx.tol||10)/V.zoom;
    if(CAD.mode.osnap){
      for(m in SN){var r=SN[m](pt,ctx,tol);if(r&&(!best||r.dist<best.dist))best={pt:r.pt,mode:m,dist:r.dist};}
      if(best)return {pt:best.pt,mode:best.mode};
    }
    var p={x:pt.x,y:pt.y,z:pt.z||0};
    if(CAD.mode.snap){var s=CAD.mode.gridStep;p.x=Math.round(p.x/s)*s;p.y=Math.round(p.y/s)*s;}
    if(CAD.mode.ortho&&base){
      if(Math.abs(p.x-base.x)>=Math.abs(p.y-base.y))p.y=base.y;else p.x=base.x;
    }
    return {pt:p,mode:null};
  }
};
CAD.ucs={toWorld:function(p){return p;},toUCS:function(p){return p;}};   // identidade por ora

/* ---------- parser de coordenadas ----------
   100,50 | 100,50,3 | @100,50 | @100<45 | 100<45 (relativa ao último ponto) | 25 (distância direta na direção do cursor) */
CAD.parseCoord=function(t,base,cursor){
  t=String(t).trim().replace(/\s+/g,'');var rel=false,m,b0={x:0,y:0,z:0};
  if(t[0]==='@'){rel=true;t=t.slice(1);}
  var b=base||b0;
  if((m=/^(-?[\d.]+)<(-?[\d.]+)$/.exec(t))){
    var d=+m[1],a=+m[2]*Math.PI/180;if(!isFinite(d)||!isFinite(a))return null;
    return {x:b.x+d*Math.cos(a),y:b.y+d*Math.sin(a),z:b.z||0};
  }
  if((m=/^(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?$/.exec(t))){
    var x=+m[1],y=+m[2],z=m[3]?+m[3]:0;if(!isFinite(x)||!isFinite(y)||!isFinite(z))return null;
    return rel?{x:b.x+x,y:b.y+y,z:(b.z||0)+z}:{x:x,y:y,z:z};
  }
  if(/^-?[\d.]+$/.test(t)&&base&&cursor){
    var dist=+t,dx=cursor.x-base.x,dy=cursor.y-base.y,L=Math.hypot(dx,dy);
    if(!isFinite(dist)||L<1e-12)return null;
    return {x:base.x+dx/L*dist,y:base.y+dy/L*dist,z:base.z||0};
  }
  return null;
};

/* ---------- comandos ---------- */
var C={},AL={},active=null,lastCmd=null;
CAD.cmd={
  register:function(d){var n=d.name.toUpperCase();C[n]=d;(d.alias||[]).forEach(function(a){AL[a.toUpperCase()]=n;});},
  unregister:function(n){n=n.toUpperCase();delete C[n];},
  find:function(n){n=String(n).toUpperCase();return C[n]||C[AL[n]]||null;},
  list:function(){return Object.keys(C);},
  print:function(m){CAD.emit('cmd:print',String(m));},
  activeName:function(){return active?active.name:null;},
  last:function(){return lastCmd;},
  cancel:function(){CAD.input._cancel();},
  whenIdle:function(cancel){if(cancel)CAD.cmd.cancel();return active?active.done:Promise.resolve();},
  run:function(n){
    var d=typeof n==='string'?CAD.cmd.find(n):n;
    if(!d){CAD.cmd.print('Comando desconhecido: '+n);return Promise.resolve();}
    if(active){CAD.cmd.cancel();return active.done.then(function(){return CAD.cmd.run(d);});}
    var tok={name:d.name};active=tok;if(!d.raw)lastCmd=d.name;
    CAD.emit('cmd:start',d.name);
    if(!d.raw)CAD.history.begin(d.name);
    tok.done=Promise.resolve().then(function(){return d.run();})
      .catch(function(e){
        if(e instanceof Cancel)CAD.cmd.print('*Cancelado*');
        else{console.error(e);CAD.cmd.print('Erro em '+d.name+': '+(e&&e.message||e));}
      })
      .then(function(){
        if(!d.raw)CAD.history.end();
        if(active===tok)active=null;
        CAD.input._reset();CAD.render.preview=null;CAD.emit('cmd:end',d.name);CAD.render.request();
      });
    return tok.done;
  }
};

/* ---------- entrada interativa ---------- */
var P=null;
function kwMatch(t,list){
  if(!list)return null;var s=t.toLowerCase(),i;
  for(i=0;i<list.length;i++)if(list[i].toLowerCase()===s)return list[i];
  for(i=0;i<list.length;i++)if(list[i].toLowerCase().indexOf(s)===0)return list[i];
  return null;
}
function finish(v){var p=P;P=null;CAD.emit('input:prompt',null);p.res(v);}
function ask(kind,prompt,o){
  o=o||{};
  return new Promise(function(res,rej){
    if(P)P.rej(new Cancel());
    var txt=prompt+(o.keywords&&o.keywords.length?' ['+o.keywords.join('/')+']':'')+(o.def!==undefined?' <'+o.def+'>':'')+':';
    P={kind:kind,prompt:txt,opts:o,res:res,rej:rej};
    CAD.emit('input:prompt',txt);CAD.render.request();
  });
}
CAD.input={
  /* opts: base(ponto p/ coord. relativas), optional(Enter retorna null), keywords[], preview(ctx,view,pt) */
  point:function(p,o){return ask('point',p,o);},                 // -> {x,y,z} | null | {keyword}
  number:function(p,o){return ask('number',p,o);},               // opts: def,min,max,base(clique = distância)
  angle:function(p,o){return ask('angle',p,o);},                 // graus; clique com base = ângulo
  string:function(p,o){return ask('string',p,o);},
  keyword:function(p,list,def){return ask('keyword',p,{keywords:list,def:def});},
  select:function(p,o){                                          // -> array de ids (usa seleção prévia se houver)
    o=o||{};if(!o.noPickfirst&&CAD.sel.size()>0)return Promise.resolve(CAD.sel.ids());
    return ask('select',p,o);
  },
  pending:function(){return P?{kind:P.kind,prompt:P.prompt,opts:P.opts}:null;},
  _submitPoint:function(pt,m){
    if(!P)return false;var o=P.opts;
    if(P.kind==='select'){var ids=CAD.sel.pick('click',pt);if(ids.length){(m&&m.shift)?CAD.sel.remove(ids):CAD.sel.add(ids);}return true;}
    if(P.kind==='point'){CAD.lastPoint=pt;CAD.cmd.print(P.prompt+' '+fmt(pt));finish(pt);return true;}
    var b=o.base||CAD.lastPoint;if(!b)return false;
    if(P.kind==='number'){finish(Math.hypot(pt.x-b.x,pt.y-b.y));return true;}
    if(P.kind==='angle'){finish(Math.atan2(pt.y-b.y,pt.x-b.x)*180/Math.PI);return true;}
    return false;
  },
  _submitText:function(t){
    if(!P)return false;t=String(t).trim();var o=P.opts,k=P.kind,v,m;
    if(k==='point'){
      if(!t){if(o.optional)finish(null);return true;}
      m=kwMatch(t,o.keywords);if(m){finish({keyword:m});return true;}
      v=CAD.parseCoord(t,o.base||CAD.lastPoint,CAD.cursor);
      if(!v){CAD.cmd.print('Ponto inválido. Use x,y  @dx,dy  @dist<ang  (ponto como separador decimal).');return true;}
      CAD.lastPoint=v;finish(v);return true;
    }
    if(k==='number'||k==='angle'){
      if(!t){if(o.def!==undefined)finish(o.def);else if(o.optional)finish(null);return true;}
      var s=t.replace(',','.');v=parseFloat(s);
      if(!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)||!isFinite(v)){CAD.cmd.print('Número inválido.');return true;}
      if((o.min!==undefined&&v<o.min)||(o.max!==undefined&&v>o.max)){CAD.cmd.print('Valor fora do limite.');return true;}
      finish(v);return true;
    }
    if(k==='keyword'){
      if(!t){if(o.def!==undefined)finish(o.def);return true;}
      m=kwMatch(t,o.keywords);if(m)finish(m);else CAD.cmd.print('Opção inválida.');return true;
    }
    if(k==='string'){
      if(!t){if(o.def!==undefined)finish(o.def);else if(o.allowEmpty)finish('');return true;}
      finish(t);return true;
    }
    if(k==='select'){
      if(!t){if(CAD.sel.size()||o.optional)finish(CAD.sel.ids());return true;}
      if(/^(all|tudo|todos|t)$/i.test(t))CAD.sel.set(CAD.sel.pick('all'));
      return true;
    }
    return false;
  },
  _cancel:function(){if(P){var p=P;P=null;CAD.emit('input:prompt',null);p.rej(new Cancel());}},
  _reset:function(){if(P){P=null;CAD.emit('input:prompt',null);}}
};

/* ---------- arquivos (registro; P11/P12 preenchem) ---------- */
var FIO={};
CAD.fileio={
  register:function(f){FIO[f.ext.toLowerCase()]=f;},
  get:function(ext){return FIO[String(ext).toLowerCase()];},
  list:function(){return Object.keys(FIO).map(function(k){return FIO[k];});},
  migrate:function(doc){return doc;}   // P11 sobrescreve
};

/* ---------- render: contrato mínimo (a UI substitui request) ---------- */
CAD.render={
  request:function(){},
  preview:null,   // função(ctx,view) opcional desenhada como overlay
  rubber:function(ctx,v,a,b){var p=v.toScreen(a),q=v.toScreen(b);ctx.save();ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.restore();},
  rubberRect:function(ctx,v,a,b){var p=v.toScreen(a),q=v.toScreen(b);ctx.save();ctx.strokeStyle='#1a73e8';ctx.lineWidth=1;ctx.setLineDash([5,4]);ctx.strokeRect(Math.min(p.x,q.x),Math.min(p.y,q.y),Math.abs(p.x-q.x),Math.abs(p.y-q.y));ctx.restore();}
};

/* ---------- tipo mínimo "line" (P5 sobrescreve com a versão completa) ---------- */
function segDist(p,a,b){
  var dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,t=l2?((p.x-a.x)*dx+(p.y-a.y)*dy)/l2:0;
  t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
}
function mid(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:0};}
CAD.types.register('line',{
  draw:function(ctx,e,v){var a=v.toScreen(e.p1),b=v.toScreen(e.p2);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();},
  bbox:function(e){return {x1:Math.min(e.p1.x,e.p2.x),y1:Math.min(e.p1.y,e.p2.y),x2:Math.max(e.p1.x,e.p2.x),y2:Math.max(e.p1.y,e.p2.y)};},
  hit:function(e,pt,tol){return segDist(pt,e.p1,e.p2)<=tol;},
  snapPts:function(e){return [{pt:e.p1,mode:'endpoint'},{pt:e.p2,mode:'endpoint'},{pt:mid(e.p1,e.p2),mode:'midpoint'}];},
  grips:function(e){return [e.p1,mid(e.p1,e.p2),e.p2];},
  transform:function(e,m){return {p1:CAD.xform.apply(m,e.p1),p2:CAD.xform.apply(m,e.p2)};},   // retorna patch p/ ents.update
  props:function(e){return [{key:'p1',label:'Início',type:'point',value:e.p1},{key:'p2',label:'Fim',type:'point',value:e.p2},
    {key:'length',label:'Comprimento',type:'number',readonly:true,value:Math.hypot(e.p2.x-e.p1.x,e.p2.y-e.p1.y)}];},
  explode:function(){return null;},
  toSVG:function(e){return '<line x1="'+e.p1.x+'" y1="'+(-e.p1.y)+'" x2="'+e.p2.x+'" y2="'+(-e.p2.y)+'"/>';}
});

/* ---------- comandos do núcleo ---------- */
CAD.cmd.register({name:'UNDO',alias:['U'],raw:true,run:function(){if(!CAD.history.undo())CAD.cmd.print('Nada para desfazer.');}});
CAD.cmd.register({name:'REDO',alias:['R'],raw:true,run:function(){if(!CAD.history.redo())CAD.cmd.print('Nada para refazer.');}});
CAD.cmd.register({name:'REGEN',alias:['RE'],raw:true,run:function(){CAD.render.request();}});
CAD.cmd.register({name:'ZOOMEXT',alias:['ZE'],raw:true,run:function(){V.extents();}});
CAD.cmd.register({name:'ZOOMPREV',alias:['ZP'],raw:true,run:function(){V.previous();}});
async function zoomWindow(){
  var a=await CAD.input.point('Primeiro canto');
  var b=await CAD.input.point('Canto oposto',{base:a,preview:function(ctx,v,pt){CAD.render.rubberRect(ctx,v,a,pt);}});
  V.window(a,b);
}
CAD.cmd.register({name:'ZOOMWIN',alias:['ZW'],raw:true,run:zoomWindow});
CAD.cmd.register({name:'ZOOM',alias:['Z'],raw:true,run:async function(){
  var k=await CAD.input.keyword('Zoom',['Janela','Anterior','Extensão','Tudo'],'Extensão');
  if(k==='Janela')await zoomWindow();else if(k==='Anterior')V.previous();else V.extents();
}});
/* LINHA provisória só para testar o núcleo; P5 a substitui (CAD.cmd.register com o mesmo nome) */
CAD.cmd.register({name:'LINE',alias:['L'],_p1demo:true,run:async function(){
  var p=await CAD.input.point('Primeiro ponto');
  for(;;){
    var q=await CAD.input.point('Próximo ponto',{base:p,optional:true,preview:function(ctx,v,pt){CAD.render.rubber(ctx,v,p,pt);}});
    if(q===null)break;
    CAD.ents.add({type:'line',p1:p,p2:q});p=q;
  }
}});

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p1=async function(){
  var pass=0,fail=0,sd=CAD.doc,sv={zoom:V.zoom,x:V.pan.x,y:V.pan.y,w:V.w,h:V.h},sm=Object.assign({},CAD.mode);
  function ok(c,m){if(c)pass++;else{fail++;console.error('FALHOU P1: '+m);}}
  function near(a,b){return Math.abs(a-b)<1e-6;}
  function tick(){return new Promise(function(r){setTimeout(r,0);});}
  CAD.setDoc(CAD.newDoc());V.zoom=10;V.pan={x:0,y:0};V.w=800;V.h=600;V.stack=[];
  // parser
  var q=CAD.parseCoord('100,50');ok(q&&q.x===100&&q.y===50,'abs');
  q=CAD.parseCoord('@100,50',{x:10,y:10,z:0});ok(q&&q.x===110&&q.y===60,'rel');
  q=CAD.parseCoord('@100<90',{x:0,y:0,z:0});ok(q&&near(q.x,0)&&near(q.y,100),'polar rel');
  q=CAD.parseCoord('100<0',{x:5,y:5,z:0});ok(q&&near(q.x,105)&&near(q.y,5),'polar sem @ = relativa');
  q=CAD.parseCoord('25',{x:0,y:0,z:0},{x:0,y:3,z:0});ok(q&&near(q.x,0)&&near(q.y,25),'distância direta');
  ok(CAD.parseCoord('abc')===null&&CAD.parseCoord('1.2.3,4')===null,'inválidos');
  // view
  var p0={x:12.5,y:-7},s=V.toScreen(p0),w=V.toWorld(s.x,s.y);ok(near(w.x,12.5)&&near(w.y,-7),'toScreen/toWorld');
  V.zoomAt(100,100,2);var a=V.toWorld(100,100);V.zoomAt(100,100,0.5);var b=V.toWorld(100,100);ok(near(a.x,b.x)&&near(a.y,b.y),'zoom no cursor');
  // entidades + history
  var e=CAD.ents.add({type:'line',p1:{x:0,y:0,z:0},p2:{x:10,y:0,z:0}});
  ok(CAD.doc.entities.length===1&&e.layer==='0'&&e.color===null,'add');
  CAD.history.undo();ok(CAD.doc.entities.length===0,'undo add');CAD.history.redo();ok(CAD.doc.entities.length===1,'redo add');
  CAD.history.begin('g');CAD.ents.add({type:'line',p1:{x:0,y:1,z:0},p2:{x:5,y:1,z:0}});CAD.ents.add({type:'line',p1:{x:0,y:2,z:0},p2:{x:5,y:2,z:0}});CAD.history.end();
  ok(CAD.doc.entities.length===3,'grupo add');CAD.history.undo();ok(CAD.doc.entities.length===1,'grupo = 1 undo');CAD.history.redo();
  CAD.ents.update(e.id,{p2:{x:20,y:0,z:0}});ok(CAD.ents.get(e.id).p2.x===20,'update');
  CAD.history.undo();ok(CAD.ents.get(e.id).p2.x===10,'undo update');
  var id2=CAD.doc.entities[1].id;CAD.ents.remove(e.id);ok(CAD.doc.entities[0].id===id2&&!CAD.ents.get(e.id),'remove');
  CAD.history.undo();ok(CAD.doc.entities[0].id===e.id,'undo remove restaura posição');
  ok(CAD.ents.query({type:'line'}).length===3,'query');
  var r=CAD.resolve(e);ok(r.color==='#000000'&&r.ltype==='continuous','ByLayer');
  // seleção
  ok(CAD.sel.pick('click',{x:5,y:0.01})[0]===e.id,'pick click');
  ok(CAD.sel.pick('click',{x:5,y:50}).length===0,'pick vazio');
  ok(CAD.sel.pick('window',{x:-1,y:-1},{x:11,y:0.5}).length===1,'window');
  ok(CAD.sel.pick('crossing',{x:4,y:-1},{x:6,y:3}).length===3,'crossing');
  CAD.layer('0').locked=true;ok(CAD.sel.pick('all').length===0,'layer bloqueada não seleciona');CAD.layer('0').locked=false;
  // zoom extents
  V.extents();ok(V.stack.length>=1&&near(V.pan.x,5)&&near(V.pan.y,1),'extents centraliza');
  V.previous();
  // comando + input
  var got=null;CAD.cmd.register({name:'__T',run:async function(){got=await CAD.input.point('T');}});
  CAD.cmd.run('__T');await tick();
  ok(CAD.input.pending()&&CAD.input.pending().kind==='point','pendente');
  CAD.input._submitText('10,20');await CAD.cmd.whenIdle();ok(got&&got.x===10&&got.y===20,'input texto');
  CAD.cmd.run('__T');await tick();CAD.cmd.cancel();await CAD.cmd.whenIdle();
  ok(!CAD.input.pending()&&!CAD.cmd.activeName(),'ESC cancela');
  // LINE demo: 2 segmentos = 1 undo
  var n0=CAD.doc.entities.length;CAD.cmd.run('L');await tick();
  CAD.input._submitText('0,50');await tick();CAD.input._submitText('@10,0');await tick();CAD.input._submitText('@0,10');await tick();CAD.input._submitText('');
  await CAD.cmd.whenIdle();ok(CAD.doc.entities.length===n0+2,'LINE cria 2 segmentos');
  CAD.history.undo();ok(CAD.doc.entities.length===n0,'comando = 1 undo');
  CAD.cmd.unregister('__T');
  CAD.setDoc(sd);V.zoom=sv.zoom;V.pan={x:sv.x,y:sv.y};V.w=sv.w;V.h=sv.h;CAD.mode=sm;
  console.log('CAD.tests.p1: '+pass+' ok, '+fail+' falhas');return {pass:pass,fail:fail};
};

/* =====================================================================
   UI (DOM). Registros de menu/toolbar/painel existem mesmo sem DOM.
   ===================================================================== */
var MENU={list:[]},TOOLS=[],PANELS=[],ui={ready:false};
CAD.ui={
  menu:{add:function(path,label,cmd){
    var n=MENU;path.split('/').forEach(function(sg){
      var f=null;for(var i=0;i<n.list.length;i++)if(n.list[i].node&&n.list[i].label===sg){f=n.list[i].node;break;}
      if(!f){f={list:[]};n.list.push({label:sg,node:f});}n=f;
    });
    n.list.push({label:label,cmd:cmd});buildMenus();
  }},
  toolbar:{add:function(group,b){
    var g=null;TOOLS.forEach(function(x){if(x.name===group)g=x;});
    if(!g){g={name:group,items:[]};TOOLS.push(g);}g.items.push(b);buildToolbar();
  }},
  panel:{register:function(p){PANELS.push(p);if(ui.ready)mountPanel(p);}}
};
if(typeof document==='undefined')return;   // execução sem navegador (testes em Node)

var cv,cx,wrap,dpr=1,raf=0,sized=false,mx=-1,my=-1,inside=false,logEl,inp,promptEl,hist=[],hpos=0;
function $(i){return document.getElementById(i);}
function coarse(){return !!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);}
function focusInp(){if(!coarse())inp.focus({preventScroll:true});}
function el(t,c){var x=document.createElement(t);if(c)x.className=c;return x;}

CAD.render.request=function(){if(!ui.ready||raf)return;raf=requestAnimationFrame(draw);};

/* ---- menus ---- */
function closeMenus(){var o=document.querySelectorAll('.mi.open');for(var i=0;i<o.length;i++)o[i].classList.remove('open');}
function ddEl(node){
  var dd=el('div','dd');
  node.list.forEach(function(it){
    if(it.node){var s=el('div','it sub');s.appendChild(document.createTextNode(it.label+' ▸'));s.appendChild(ddEl(it.node));dd.appendChild(s);}
    else if(it.label==='-'){dd.appendChild(el('div','sep'));}
    else{var b=el('div','it');b.textContent=it.label;b.onclick=function(){closeMenus();CAD.cmd.run(it.cmd);};dd.appendChild(b);}
  });
  return dd;
}
function buildMenus(){
  if(!ui.ready)return;var bar=$('menubar');bar.innerHTML='';
  MENU.list.forEach(function(top){
    var m=el('div','mi'),l=el('span','ml');l.textContent=top.label;m.appendChild(l);m.appendChild(ddEl(top.node));
    l.onclick=function(e){e.stopPropagation();var was=m.classList.contains('open');closeMenus();if(!was)m.classList.add('open');};
    m.onmouseenter=function(){if(document.querySelector('.mi.open')&&!m.classList.contains('open')){closeMenus();m.classList.add('open');}};
    bar.appendChild(m);
  });
}
/* ---- toolbar ---- */
function buildToolbar(){
  if(!ui.ready)return;var bar=$('toolbar');bar.innerHTML='';
  TOOLS.forEach(function(g){
    var d=el('div','tg');
    g.items.forEach(function(it){
      var b=el('button','tb');b.type='button';b.title=it.rotulo||it.cmd;b.setAttribute('aria-label',it.rotulo||it.cmd);
      var ic=it.icone||(it.rotulo||it.cmd).slice(0,2);
      if(String(ic).charAt(0)==='<')b.innerHTML=ic;else b.textContent=ic;
      b.onclick=function(){CAD.cmd.run(it.cmd);focusInp();};d.appendChild(b);
    });
    bar.appendChild(d);
  });
}
/* ---- painéis ---- */
function mountPanel(p){
  var e0=$('panel-empty');if(e0)e0.remove();
  var sec=el('section','panel'),h=el('div','ph'),b=el('div','pb');sec.id='panel-'+p.id;h.textContent=p.title;
  h.onclick=function(){sec.classList.toggle('closed');};sec.appendChild(h);sec.appendChild(b);$('sidebar').appendChild(sec);
  try{p.mount(b);}catch(x){console.error('painel '+p.id,x);}
}
/* ---- linha de comando ---- */
function logLine(m){
  if(!logEl)return;var d=el('div');d.textContent=m;logEl.appendChild(d);
  while(logEl.childNodes.length>300)logEl.removeChild(logEl.firstChild);logEl.scrollTop=logEl.scrollHeight;
}
function submit(t){
  t=t.trim();inp.value='';
  if(CAD.input.pending()){if(t)logLine(promptEl.textContent+' '+t);CAD.input._submitText(t);return;}
  if(!t){if(CAD.cmd.last())CAD.cmd.run(CAD.cmd.last());return;}
  logLine('Comando: '+t);hist.push(t);hpos=hist.length;
  var d=CAD.cmd.find(t.split(/\s+/)[0]);if(d)CAD.cmd.run(d);else CAD.cmd.print('Comando desconhecido: '+t);
}
/* ---- status ---- */
var MODES=[['snap','SNAP'],['grid','GRID'],['ortho','ORTHO'],['polar','POLAR'],['osnap','OSNAP'],['dynin','DYN']];
function buildStatus(){
  var box=$('sb-modes');box.innerHTML='';
  MODES.forEach(function(m){var b=el('span','sbtn');b.textContent=m[1];b.dataset.k=m[0];b.onclick=function(){CAD.toggle(m[0]);};box.appendChild(b);});
  syncModes();
}
function syncModes(){var b=document.querySelectorAll('.sbtn');for(var i=0;i<b.length;i++)b[i].classList.toggle('on',!!CAD.mode[b[i].dataset.k]);}
function syncInfo(){
  var l=CAD.layer(CAD.doc.current.layer);
  $('sb-info').innerHTML='<span class="sw" style="background:'+l.color+'"></span>'+l.name+' · '+CAD.doc.units;
}
function setCoord(p){$('sb-coord').textContent=p.x.toFixed(3)+', '+p.y.toFixed(3)+', '+(p.z||0).toFixed(3);}

/* ---- render ---- */
var DASH={continuous:[],dashed:[10,6],dotted:[2,5],center:[18,5,4,5],hidden:[6,4],dashdot:[12,4,2,4]};
function ink(c){var s=String(c||'#000').toLowerCase();return (s==='#fff'||s==='#ffffff'||s==='white')?'#000000':c;}
function lwPx(lw){return CAD.mode.lwdisp?Math.max(1,lw*4):(lw>=0.5?2:1);}
function drawGrid(){
  var st=CAD.mode.gridStep,f=[2,2.5,2],i=0;while(st*V.zoom<12)st*=f[i++%3];
  var a=V.toWorld(0,V.h),b=V.toWorld(V.w,0),x,y,n;
  cx.lineWidth=1;
  for(n=Math.ceil(a.x/st);n*st<=b.x;n++){x=Math.round(V.toScreen({x:n*st,y:0}).x)+0.5;cx.strokeStyle=n%5===0?'#d9d9d9':'#ececec';cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,V.h);cx.stroke();}
  for(n=Math.ceil(a.y/st);n*st<=b.y;n++){y=Math.round(V.toScreen({x:0,y:n*st}).y)+0.5;cx.strokeStyle=n%5===0?'#d9d9d9':'#ececec';cx.beginPath();cx.moveTo(0,y);cx.lineTo(V.w,y);cx.stroke();}
}
function drawEnt(e,color,dash,lw){
  var d=T[e.type];if(!d||!d.draw)return;
  var bb=d.bbox?d.bbox(e):null;
  if(bb){var p1=V.toScreen({x:bb.x1,y:bb.y1}),p2=V.toScreen({x:bb.x2,y:bb.y2});
    if(Math.max(p1.x,p2.x)<0||Math.min(p1.x,p2.x)>V.w||Math.max(p1.y,p2.y)<0||Math.min(p1.y,p2.y)>V.h)return;}
  cx.save();cx.strokeStyle=cx.fillStyle=color;cx.lineWidth=lw;cx.setLineDash(dash);cx.lineCap='round';cx.lineJoin='round';
  try{d.draw(cx,e,V);}catch(x){console.error('draw '+e.type,x);}
  cx.restore();
}
function drawMeasure(a,b){   // comprimento e ângulo ao vivo junto ao cursor (some se o Dynamic Input da P3 já mostra)
  var dy=document.getElementById('cad-dynin');if(dy&&dy.style.display!=='none'&&dy.offsetParent!==null&&(dy.textContent||'').trim())return;
  var dx=b.x-a.x,dyy=b.y-a.y,len=Math.hypot(dx,dyy),ang=Math.atan2(dyy,dx)*180/Math.PI;if(ang<0)ang+=360;
  var u=CAD.doc.units||'',txt=len.toFixed(3).replace(/\.?0+$/,'')+(u?' '+u:'')+'  ∠ '+ang.toFixed(1)+'°';
  var p=V.toScreen(b),x=p.x+16,y=p.y+22;cx.save();cx.font='12px system-ui';
  var w=cx.measureText(txt).width+10;if(x+w>V.w)x=p.x-w-10;if(y+18>V.h)y=p.y-12;
  cx.fillStyle='rgba(255,255,230,.95)';cx.strokeStyle='#999';cx.lineWidth=1;cx.fillRect(x,y-13,w,18);cx.strokeRect(x+.5,y-12.5,w-1,18);
  cx.fillStyle='#111';cx.fillText(txt,x+5,y);cx.restore();
}
function draw(){
  raf=0;if(!cx)return;
  cx.setTransform(dpr,0,0,dpr,0,0);cx.fillStyle='#fff';cx.fillRect(0,0,V.w,V.h);
  if(CAD.mode.grid)drawGrid();
  var o=V.toScreen({x:0,y:0});cx.lineWidth=1;
  cx.strokeStyle='#f0c8c8';cx.beginPath();cx.moveTo(0,Math.round(o.y)+0.5);cx.lineTo(V.w,Math.round(o.y)+0.5);cx.stroke();
  cx.strokeStyle='#c8e6c8';cx.beginPath();cx.moveTo(Math.round(o.x)+0.5,0);cx.lineTo(Math.round(o.x)+0.5,V.h);cx.stroke();
  var L=CAD.doc.entities,i,e,r;
  for(i=0;i<L.length;i++){e=L[i];if(!CAD.visible(e))continue;r=CAD.resolve(e);drawEnt(e,ink(r.color),DASH[r.ltype]||[],lwPx(r.lw));}
  for(i=0;i<L.length;i++){e=L[i];if(CAD.sel.has(e.id)&&CAD.visible(e))drawEnt(e,'#1a73e8',[6,4],2);}
  cx.save();cx.strokeStyle='#555';cx.fillStyle='#555';cx.lineWidth=1;
  if(CAD.render.preview)try{CAD.render.preview(cx,V);}catch(x){console.error(x);}
  var pd=CAD.input.pending();
  if(pd&&typeof pd.opts.preview==='function'&&CAD.cursor)try{
    if(pd.opts.preview.length>=2)pd.opts.preview(cx,V,CAD.cursor);          // estilo P1: preview(ctx,view,pt) desenha direto
    else{                                                                   // estilo P5: preview(pt) devolve a(s) entidade(s) fantasma
      var gh=pd.opts.preview(CAD.cursor);if(gh&&!Array.isArray(gh))gh=[gh];
      (gh||[]).forEach(function(ge){if(!ge||!ge.type)return;var gr=CAD.resolve(ge);cx.save();drawEnt(ge,ink(gr.color),[],lwPx(gr.lw));cx.restore();});
    }
  }catch(x){console.error('preview',x);}
  if(pd&&!pd.opts.preview&&pd.kind==='point'&&pd.opts.base&&CAD.cursor)CAD.render.rubber(cx,V,pd.opts.base,CAD.cursor);   // sem preview próprio: traço elástico
  cx.restore();
  if(pd&&pd.opts.base&&CAD.cursor&&(pd.kind==='point'||pd.kind==='number'||pd.kind==='angle'))drawMeasure(pd.opts.base,CAD.cursor);
  // ícone do UCS
  cx.save();cx.lineWidth=1.5;cx.strokeStyle='#d33';cx.beginPath();cx.moveTo(30,V.h-30);cx.lineTo(60,V.h-30);cx.stroke();
  cx.strokeStyle='#2a2';cx.beginPath();cx.moveTo(30,V.h-30);cx.lineTo(30,V.h-60);cx.stroke();
  cx.fillStyle='#555';cx.font='11px system-ui';cx.fillText('X',63,V.h-26);cx.fillText('Y',26,V.h-64);cx.restore();
  // cursor
  if(inside&&CAD.cursor){
    var c=V.toScreen(CAD.cursor);cx.save();cx.strokeStyle='rgba(0,0,0,.55)';cx.lineWidth=1;
    cx.beginPath();cx.moveTo(0,Math.round(c.y)+0.5);cx.lineTo(V.w,Math.round(c.y)+0.5);cx.moveTo(Math.round(c.x)+0.5,0);cx.lineTo(Math.round(c.x)+0.5,V.h);cx.stroke();
    if(!pd){cx.strokeStyle='#000';cx.strokeRect(c.x-4,c.y-4,8,8);}
    if(CAD.cursorMode){cx.strokeStyle='#0a0';cx.lineWidth=2;cx.strokeRect(c.x-6,c.y-6,12,12);cx.fillStyle='#060';cx.font='11px system-ui';cx.fillText(CAD.cursorMode,c.x+10,c.y-10);}
    cx.restore();
  }
}

/* ---- interação com o canvas ---- */
function updateCursor(){
  var raw=V.toWorld(mx,my),pd=CAD.input.pending(),r=CAD.snap.resolve(raw,{base:pd&&pd.opts.base?pd.opts.base:null});
  CAD.cursor=r.pt;CAD.cursorMode=r.mode;setCoord(r.pt);
}
function initCanvas(){
  cv=$('cv');cx=cv.getContext('2d');wrap=$('canvas-wrap');
  var panning=false,lx=0,ly=0,lastMid=0,pressed=null;
  function resize(){
    var r=wrap.getBoundingClientRect();dpr=window.devicePixelRatio||1;
    cv.width=Math.max(1,Math.round(r.width*dpr));cv.height=Math.max(1,Math.round(r.height*dpr));
    cv.style.width=r.width+'px';cv.style.height=r.height+'px';
    V.w=r.width;V.h=r.height;
    if(!sized){sized=true;V.pan.x=(V.w/2-60)/V.zoom;V.pan.y=(V.h/2-60)/V.zoom;}   // origem perto do canto inferior esquerdo
    vchg();
  }
  if(window.ResizeObserver)new ResizeObserver(resize).observe(wrap);else window.addEventListener('resize',resize);
  resize();
  cv.addEventListener('pointermove',function(e){
    if(e.pointerType==='touch'){touchMove(e);return;}
    var r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;inside=true;
    if(panning){V.panBy(e.clientX-lx,e.clientY-ly);lx=e.clientX;ly=e.clientY;}
    updateCursor();CAD.render.request();
  });
  cv.addEventListener('pointerleave',function(){inside=false;CAD.render.request();});
  function canvasClick(shift){
    if(CAD.input.pending()){CAD.input._submitPoint(CAD.cursor,{shift:shift});return;}
    var ids=CAD.sel.pick('click',CAD.cursor);
    if(!ids.length){if(!shift)CAD.sel.clear();}
    else if(shift){CAD.sel.has(ids[0])?CAD.sel.remove(ids):CAD.sel.add(ids);}
    else CAD.sel.set(ids);
  }
  // --- toque: 1 dedo toca = clique; 1 dedo arrasta = pan; 2 dedos = pinça (zoom) + pan ---
  var ptrs={},tap=null,pinch=null;
  function nptr(){return Object.keys(ptrs).length;}
  function rel(x,y){var r=cv.getBoundingClientRect();return {x:x-r.left,y:y-r.top};}
  function pinchState(){var k=Object.keys(ptrs),a=ptrs[k[0]],b=ptrs[k[1]],c=rel((a.x+b.x)/2,(a.y+b.y)/2);return {d:Math.hypot(a.x-b.x,a.y-b.y)||1,x:c.x,y:c.y};}
  function touchDown(e){
    closeMenus();ptrs[e.pointerId]={x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId);inside=true;
    var q=rel(e.clientX,e.clientY);mx=q.x;my=q.y;updateCursor();
    if(nptr()===1)tap={id:e.pointerId,x:e.clientX,y:e.clientY,t:Date.now(),moved:false};
    else{tap=null;pinch=pinchState();}
    CAD.render.request();
  }
  function touchMove(e){
    var p=ptrs[e.pointerId];if(!p)return;var dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(nptr()>=2&&pinch){
      var n=pinchState();V.panBy(n.x-pinch.x,n.y-pinch.y);V.zoomAt(n.x,n.y,n.d/pinch.d);pinch=n;
    }else if(tap&&tap.id===e.pointerId){
      if(!tap.moved&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>8)tap.moved=true;
      if(tap.moved)V.panBy(dx,dy);
    }
    var q=rel(e.clientX,e.clientY);mx=q.x;my=q.y;updateCursor();CAD.render.request();
  }
  function touchUp(e){
    if(!ptrs[e.pointerId])return;
    var q=rel(e.clientX,e.clientY);
    if(e.type==='pointerup'&&tap&&tap.id===e.pointerId&&!tap.moved&&Date.now()-tap.t<600){mx=q.x;my=q.y;updateCursor();canvasClick(false);}
    delete ptrs[e.pointerId];if(nptr()<2)pinch=null;if(nptr()===0)tap=null;
  }
  cv.addEventListener('pointerdown',function(e){
    if(e.pointerType==='touch'){e.preventDefault();touchDown(e);return;}
    focusInp();closeMenus();
    if(e.button===1){
      e.preventDefault();var now=Date.now();
      if(now-lastMid<350){V.extents();lastMid=0;return;}
      lastMid=now;panning=true;lx=e.clientX;ly=e.clientY;cv.setPointerCapture(e.pointerId);return;
    }
    if(e.button!==0)return;
    var r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;updateCursor();
    var pd0=CAD.input.pending();
    if(pd0&&pd0.kind==='point'&&pd0.opts.base){      // 2º ponto: segura e arrasta; ao soltar confirma (clique simples também funciona)
      pressed={id:e.pointerId,shift:e.shiftKey};try{cv.setPointerCapture(e.pointerId);}catch(x){}CAD.render.request();return;
    }
    canvasClick(e.shiftKey);
  });
  cv.addEventListener('pointerup',function(e){
    if(e.pointerType==='touch'){touchUp(e);return;}
    if(e.button===1){panning=false;return;}
    if(e.button===0&&pressed&&pressed.id===e.pointerId){
      var r=cv.getBoundingClientRect(),sh=pressed.shift;pressed=null;try{cv.releasePointerCapture(e.pointerId);}catch(x){}
      mx=e.clientX-r.left;my=e.clientY-r.top;updateCursor();canvasClick(sh);
    }
  });
  cv.addEventListener('pointercancel',function(e){if(e.pointerType==='touch')touchUp(e);panning=false;pressed=null;});
  // barra de toque (só aparece em telas touch): Esc / Enter / teclado
  var tb=el('div','touchbar');
  [['Esc',function(){inp.value='';if(CAD.cmd.activeName()||CAD.input.pending())CAD.cmd.cancel();else CAD.sel.clear();}],
   ['Enter',function(){if(CAD.input.pending())CAD.input._submitText('');else if(CAD.cmd.last())CAD.cmd.run(CAD.cmd.last());}],
   ['⌨',function(){inp.focus();}]].forEach(function(b){
    var x=el('button','tbtn');x.type='button';x.textContent=b[0];x.onclick=b[1];tb.appendChild(x);});
  wrap.appendChild(tb);
  cv.addEventListener('dblclick',function(){if(!CAD.input.pending()&&!CAD.cmd.activeName())V.extents();});
  cv.addEventListener('wheel',function(e){e.preventDefault();var r=cv.getBoundingClientRect();
    V.zoomAt(e.clientX-r.left,e.clientY-r.top,Math.pow(1.0015,-Math.max(-300,Math.min(300,e.deltaY))));updateCursor();},{passive:false});
  cv.addEventListener('contextmenu',function(e){e.preventDefault();   // botão direito = Enter
    if(CAD.input.pending())CAD.input._submitText('');else if(CAD.cmd.last())CAD.cmd.run(CAD.cmd.last());});
}
function initKeys(){
  inp.addEventListener('keydown',function(e){
    if(e.key==='Enter'){e.preventDefault();submit(inp.value);}
    else if(e.key===' '){var pd=CAD.input.pending();if(inp.value===''||!pd||pd.kind!=='string'){e.preventDefault();submit(inp.value);}}
    else if(e.key==='ArrowUp'){e.preventDefault();if(hpos>0){hpos--;inp.value=hist[hpos];}}
    else if(e.key==='ArrowDown'){e.preventDefault();if(hpos<hist.length-1){hpos++;inp.value=hist[hpos];}else{hpos=hist.length;inp.value='';}}
  });
  document.addEventListener('keydown',function(e){
    var t=e.target,foreign=t!==inp&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable;
    if(foreign)return;
    var fk={F3:'osnap',F7:'grid',F8:'ortho',F9:'snap',F10:'polar',F12:'dynin'};
    if(fk[e.key]){e.preventDefault();CAD.toggle(fk[e.key]);return;}
    if(e.key==='Escape'){e.preventDefault();inp.value='';if(CAD.cmd.activeName()||CAD.input.pending())CAD.cmd.cancel();else CAD.sel.clear();return;}
    if(e.key==='Delete'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.defaultPrevented){   // Delete = apaga a seleção (pickfirst)
      if(t===inp&&inp.value!=='')return;                       // texto na linha de comando: Delete edita o texto
      if(CAD.input.pending()||CAD.cmd.activeName())return;     // comando em andamento: não interfere
      if(CAD.sel.size()>0&&CAD.cmd.find('ERASE')){e.preventDefault();CAD.cmd.run('ERASE');}
      return;
    }
    if((e.ctrlKey||e.metaKey)&&!e.altKey){
      var k=e.key.toLowerCase();
      if(k==='z'&&!e.shiftKey){e.preventDefault();CAD.cmd.whenIdle(true).then(function(){CAD.history.undo();});}
      else if(k==='y'||(k==='z'&&e.shiftKey)){e.preventDefault();CAD.cmd.whenIdle(true).then(function(){CAD.history.redo();});}
      return;
    }
    if(t!==inp&&e.key.length===1&&!e.ctrlKey&&!e.altKey&&!e.metaKey)inp.focus({preventScroll:true});   // digitar em qualquer lugar vai p/ a linha de comando
  });
  document.addEventListener('pointerdown',function(e){if(!e.target.closest||!e.target.closest('#menubar'))closeMenus();});
}

function init(){
  logEl=$('cmdlog');inp=$('cmdinput');promptEl=$('cmdprompt');ui.ready=true;
  buildMenus();buildToolbar();buildStatus();syncInfo();
  PANELS.forEach(mountPanel);
  initCanvas();initKeys();
  CAD.on('cmd:print',logLine);
  CAD.on('input:prompt',function(p){promptEl.textContent=p||'Comando:';CAD.render.request();});
  CAD.on('mode:changed',syncModes);
  CAD.on('doc:changed',syncInfo);
  CAD.on('cmd:end',focusInp);
  logLine('CAD 2D '+CAD.version+' — digite um comando (ex.: L, Z) ou use os menus. ESC cancela; clique direito = Enter.');
  focusInp();CAD.render.request();CAD.emit('ready');
}

/* menus/toolbar do núcleo */
CAD.ui.menu.add('Editar','Desfazer','UNDO');
CAD.ui.menu.add('Editar','Refazer','REDO');
CAD.ui.menu.add('Exibir','Zoom extensão','ZOOMEXT');
CAD.ui.menu.add('Exibir','Zoom janela','ZOOMWIN');
CAD.ui.menu.add('Exibir','Zoom anterior','ZOOMPREV');
CAD.ui.menu.add('Exibir','-','');
CAD.ui.menu.add('Exibir','Regenerar','REGEN');
CAD.ui.menu.add('Desenhar','Linha','LINE');
CAD.ui.toolbar.add('Desenho',{icone:'╱',rotulo:'Linha (L)',cmd:'LINE'});
CAD.ui.toolbar.add('Exibir',{icone:'⤢',rotulo:'Zoom extensão (ZE)',cmd:'ZOOMEXT'});
CAD.ui.toolbar.add('Exibir',{icone:'🔍',rotulo:'Zoom janela (ZW)',cmd:'ZOOMWIN'});
CAD.ui.toolbar.add('Editar',{icone:'↶',rotulo:'Desfazer (Ctrl+Z)',cmd:'UNDO'});
CAD.ui.toolbar.add('Editar',{icone:'↷',rotulo:'Refazer (Ctrl+Y)',cmd:'REDO'});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window.CAD=window.CAD||{});
/* ==== END:1 ==== */
