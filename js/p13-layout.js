/* ==== PART:13 ==== */
(function(CAD){
'use strict';
var K=72/25.4, SVGN=0, CUR='model', SELVP=null, OV=null, WZ=null, BOOT=false;
var MMU={mm:1,cm:10,m:1000,km:1e6,'in':25.4,ft:304.8,yd:914.4};
var PAPERS={A4:[210,297],A3:[297,420],A2:[420,594],A1:[594,841],A0:[841,1189]};
var STD=[1,2,5,10,20,25,50,75,100,150,200,250,500,1000,2000,5000];
var HW=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
var WIN={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};
var COLORS={black:[0,0,0],white:[255,255,255],red:[255,0,0],green:[0,128,0],blue:[0,0,255],yellow:[255,255,0],cyan:[0,255,255],magenta:[255,0,255],gray:[128,128,128],grey:[128,128,128],orange:[255,165,0]};

/* ---------- utilidades ---------- */
function clone(o){return JSON.parse(JSON.stringify(o));}
function pn(n){var s=(+n||0).toFixed(3).replace(/\.?0+$/,'');return s===''||s==='-'?'0':s;}
function mmu(){return MMU[(CAD.doc&&CAD.doc.units)||'m']||1000;}
function emit(e,d){if(CAD.emit)CAD.emit(e,d);}
function say(m){if(CAD.cmd&&CAD.cmd.print)CAD.cmd.print(m);}
function parseScale(s){
  if(typeof s==='number')return s>0?s:null;
  s=String(s).trim().replace(',','.');
  var m=s.match(/^([\d.]+)\s*[:\/]\s*([\d.]+)$/);
  if(m){var a=+m[1],b=+m[2];return a>0&&b>0?b/a:null;}
  var n=parseFloat(s);return n>0?n:null;
}
function scaleText(den){return den>=1?'1:'+pn(den):pn(1/den)+':1';}
function stdUp(need){for(var i=0;i<STD.length;i++)if(STD[i]>=need*(1-1e-9))return STD[i];return Math.ceil(need);}
function textW(s,size,bold){var w=0;s=String(s);for(var i=0;i<s.length;i++){var c=s.charCodeAt(i)-32;w+=(c>=0&&c<95?HW[c]:556);}return w/1000*size*(bold?1.07:1);}
function parseColor(c){
  if(typeof c!=='string')return null;c=c.trim().toLowerCase();
  if(COLORS[c])return COLORS[c];
  var m=c.match(/^#([0-9a-f]{3})$/);if(m){var h=m[1];return [parseInt(h[0]+h[0],16),parseInt(h[1]+h[1],16),parseInt(h[2]+h[2],16)];}
  m=c.match(/^#([0-9a-f]{6})/);if(m)return [parseInt(m[1].substr(0,2),16),parseInt(m[1].substr(2,2),16),parseInt(m[1].substr(4,2),16)];
  m=c.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);if(m)return [+m[1],+m[2],+m[3]];
  return null;
}
function hex(r,g,b){return '#'+[r,g,b].map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return (v<16?'0':'')+v.toString(16);}).join('');}
function colorMap(mode){
  return function(c,isFill){
    var v=parseColor(c)||[0,0,0];
    if(v[0]>=250&&v[1]>=250&&v[2]>=250)return isFill?'#ffffff':'#000000';
    if(mode==='mono')return '#000000';
    if(mode==='gray'){var g=.3*v[0]+.59*v[1]+.11*v[2];return hex(g,g,g);}
    return hex(v[0],v[1],v[2]);
  };
}
function dashFor(lt){
  if(!lt)return null;var s=String(lt).toLowerCase();
  if(/phantom|fantasma/.test(s))return [12,2,2,2,2,2];
  if(/center|centro|eixo/.test(s))return [12,2,2,2];
  if(/dashdot|tra.*ponto/.test(s))return [6,2,.5,2];
  if(/hidden|oculta/.test(s))return [3,1.5];
  if(/dash|tracej/.test(s))return [6,3];
  if(/dot|ponto/.test(s))return [.5,2];
  return null;
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ---------- layouts (dados) ---------- */
function layouts(){var d=CAD.doc;if(!d.layouts)d.layouts=[];return d.layouts;}
function getL(n){var a=layouts();for(var i=0;i<a.length;i++)if(a[i].name===n)return a[i];return null;}
function dimsOf(paper,orient,cw,ch){
  var w,h;
  if(paper&&typeof paper==='object'){w=+paper.w||297;h=+paper.h||210;}
  else if(paper==='custom'||paper==='Personalizado'){w=+cw||297;h=+ch||210;}
  else{var s=PAPERS[paper]||PAPERS.A4;w=s[0];h=s[1];}
  var lo=Math.max(w,h),sh=Math.min(w,h);
  return orient==='portrait'?{w:sh,h:lo}:{w:lo,h:sh};
}
function paperDims(l){return dimsOf(l.paper,l.orient);}
function uniq(base){var n=base,i=1;while(getL(n)||n==='Modelo'||n==='model'){i++;n=base+(base.match(/\d$/)?'':'')+(base.match(/\d+$/)?'_'+i:i);}return n;}
function mkLayout(name,o){
  return {name:name,paper:o.paper||'A3',orient:o.orient||'landscape',scale:o.scale||100,
    margins:o.margins||{l:10,t:10,r:10,b:10},viewports:[],
    titleblock:o.titleblock||{on:true,w:180,rowH:8,fields:{empresa:'',projeto:'',desenho:'',escala:'',data:'',autor:'',revisao:'',folha:''}}};
}
function changed(){emit('layout:changed');emit('doc:changed',{layouts:true});}
function tx(name,fn,beforeSnap){
  var before=beforeSnap||JSON.stringify(layouts());
  if(!beforeSnap)fn();
  var after=JSON.stringify(layouts());
  if(before===after)return false;
  function setS(s){CAD.doc.layouts=JSON.parse(s);changed();}
  if(CAD.history&&CAD.history.run)CAD.history.run({name:name,do:function(){setS(after);},undo:function(){setS(before);}});
  else changed();
  return true;
}
function grp(name,fn){
  var h=CAD.history,g=h&&h.begin&&h.end;
  if(g)h.begin(name);
  try{fn();}finally{if(g)h.end();}
}
function extents(){
  var x1=1e300,y1=1e300,x2=-1e300,y2=-1e300,n=0;
  entsOf('model',{}).forEach(function(e){var b=null;try{b=CAD.bboxOf(e);}catch(x){}if(!b)return;
    x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);n++;});
  return n?{x1:x1,y1:y1,x2:x2,y2:y2}:{x1:0,y1:0,x2:100,y2:100};
}
function addVpTo(l,o){
  var id=1;l.viewports.forEach(function(v){var n=parseInt(String(v.id).replace(/\D/g,''),10)||0;if(n>=id)id=n+1;});
  var vp={id:'vp'+id,x:o.x,y:o.y,w:o.w,h:o.h,cx:o.cx!=null?o.cx:0,cy:o.cy!=null?o.cy:0,scale:o.scale||l.scale||100,on:true,border:true,locked:false};
  l.viewports.push(vp);return vp.id;
}
function autoVp(l){
  var d=paperDims(l),m=l.margins,tb=l.titleblock&&l.titleblock.on?4*(l.titleblock.rowH||8):0;
  var vp={x:m.l,y:m.b+tb,w:d.w-m.l-m.r,h:d.h-m.t-m.b-tb},win=extents();
  var need=Math.max((win.x2-win.x1)*mmu()/vp.w,(win.y2-win.y1)*mmu()/vp.h);
  l.scale=stdUp(need>0?need:1);vp.scale=l.scale;vp.cx=(win.x1+win.x2)/2;vp.cy=(win.y1+win.y2)/2;
  addVpTo(l,vp);
}
function addLayout(name,o){
  o=o||{};name=uniq(name||'Layout');
  tx('LAYOUT',function(){var l=mkLayout(name,o);layouts().push(l);if(o.autoVp!==false)autoVp(l);});
  return name;
}
function removeLayout(name){
  grp('LAYOUT EXCLUIR',function(){
    tx('LAYOUT',function(){CAD.doc.layouts=layouts().filter(function(l){return l.name!==name;});});
    var ids=CAD.ents.query(function(e){return e.space===name;}).map(function(e){return e.id;});
    if(ids.length)CAD.ents.remove(ids);
  });
  if(CUR===name)showLayout('model');
}
function renameLayout(a,b){
  if(!getL(a)||!b||getL(b))return false;
  grp('LAYOUT RENOMEAR',function(){
    tx('LAYOUT',function(){getL(a).name=b;});
    CAD.ents.query(function(e){return e.space===a;}).forEach(function(e){CAD.ents.update(e.id,{space:b});});
  });
  if(CUR===a)CUR=b;changed();return true;
}
function updateLayout(name,patch){tx('LAYOUT',function(){var l=getL(name);if(l)for(var k in patch)l[k]=patch[k];});}
function vpOf(name,id){var l=getL(name);if(!l)return null;for(var i=0;i<l.viewports.length;i++)if(l.viewports[i].id===id)return l.viewports[i];return null;}
function addViewport(name,o){var id=null;tx('MVIEW',function(){var l=getL(name);if(l)id=addVpTo(l,o);});return id;}
function updateViewport(name,id,patch){tx('MVIEW',function(){var v=vpOf(name,id);if(v)for(var k in patch)v[k]=patch[k];});}
function removeViewport(name,id){tx('MVIEW',function(){var l=getL(name);if(l)l.viewports=l.viewports.filter(function(v){return v.id!==id;});});}
function vpMap(vp){var z=mmu()/vp.scale;return function(p){return {x:vp.x+vp.w/2+(p.x-vp.cx)*z,y:vp.y+vp.h/2+(p.y-vp.cy)*z};};}

/* ---------- gravador de contexto 2D (vetor) ---------- */
function Rec(ops,cm){
  this.ops=ops;this.cm=cm;this.m=[1,0,0,1,0,0];this.st=[];this.p=[];this.cx=null;this.cy=null;this.sx=null;this.sy=null;
  this._lw=.25;this._lockLW=true;this.dash=null;this.strokeStyle='#000000';this.fillStyle='#000000';
  this.globalAlpha=1;this.font='10px Helvetica';this.textAlign='left';this.textBaseline='alphabetic';
  this.lineCap='butt';this.lineJoin='miter';this.depth=0;this.lineDashOffset=0;
  var self=this;
  this.px=new Proxy(this,{get:function(t,k){if(k in t)return typeof t[k]==='function'?t[k].bind(t):t[k];return function(){return null;};},
    set:function(t,k,v){t[k]=v;return true;}});
  this.self=self;
}
Object.defineProperty(Rec.prototype,'lineWidth',{get:function(){return this._lw;},set:function(v){if(!this._lockLW)this._lw=+v||this._lw;}});
Rec.prototype.begin=function(s){this.m=[1,0,0,1,0,0];this.st=[];this.p=[];this.cx=this.cy=null;this.strokeStyle=this.fillStyle=s.c;this._lw=s.w;this.dash=s.dash;this.globalAlpha=1;this.depth=0;};
Rec.prototype.finish=function(){while(this.depth>0){this.ops.push({k:'Q'});this.depth--;}};
Rec.prototype.tp=function(x,y){var m=this.m;return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];};
Rec.prototype.save=function(){this.st.push({m:this.m.slice(),s:this.strokeStyle,f:this.fillStyle,a:this.globalAlpha,font:this.font});this.ops.push({k:'q'});this.depth++;};
Rec.prototype.restore=function(){var s=this.st.pop();if(!s)return;this.m=s.m;this.strokeStyle=s.s;this.fillStyle=s.f;this.globalAlpha=s.a;this.font=s.font;this.ops.push({k:'Q'});this.depth--;};
Rec.prototype.translate=function(x,y){var m=this.m;m[4]+=m[0]*x+m[2]*y;m[5]+=m[1]*x+m[3]*y;};
Rec.prototype.scale=function(x,y){var m=this.m;m[0]*=x;m[1]*=x;m[2]*=y;m[3]*=y;};
Rec.prototype.rotate=function(t){var m=this.m,c=Math.cos(t),s=Math.sin(t),a=m[0],b=m[1],cc=m[2],d=m[3];m[0]=a*c+cc*s;m[1]=b*c+d*s;m[2]=-a*s+cc*c;m[3]=-b*s+d*c;};
Rec.prototype.transform=function(a,b,c,d,e,f){var m=this.m,A=m[0],B=m[1],C=m[2],D=m[3];
  this.m=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+m[4],B*e+D*f+m[5]];};
Rec.prototype.setTransform=function(a,b,c,d,e,f){if(typeof a==='object'&&a){f=a.f;e=a.e;d=a.d;c=a.c;b=a.b;a=a.a;}this.m=[a,b,c,d,e,f];};
Rec.prototype.resetTransform=function(){this.m=[1,0,0,1,0,0];};
Rec.prototype.setLineDash=function(){};
Rec.prototype.beginPath=function(){this.p=[];this.cx=this.cy=null;};
Rec.prototype.moveTo=function(x,y){var q=this.tp(x,y);this.p.push(['M',q[0],q[1]]);this.cx=this.sx=x;this.cy=this.sy=y;};
Rec.prototype.lineTo=function(x,y){if(this.cx===null)return this.moveTo(x,y);var q=this.tp(x,y);this.p.push(['L',q[0],q[1]]);this.cx=x;this.cy=y;};
Rec.prototype.closePath=function(){if(this.p.length){this.p.push(['Z']);this.cx=this.sx;this.cy=this.sy;}};
Rec.prototype.bezierCurveTo=function(a,b,c,d,x,y){if(this.cx===null)this.moveTo(a,b);var p=this.tp(a,b),q=this.tp(c,d),r=this.tp(x,y);this.p.push(['C',p[0],p[1],q[0],q[1],r[0],r[1]]);this.cx=x;this.cy=y;};
Rec.prototype.quadraticCurveTo=function(a,b,x,y){var x0=this.cx===null?a:this.cx,y0=this.cy===null?b:this.cy;
  this.bezierCurveTo(x0+2/3*(a-x0),y0+2/3*(b-y0),x+2/3*(a-x),y+2/3*(b-y),x,y);};
Rec.prototype.arcTo=function(x1,y1){this.lineTo(x1,y1);};
Rec.prototype.rect=function(x,y,w,h){this.moveTo(x,y);this.lineTo(x+w,y);this.lineTo(x+w,y+h);this.lineTo(x,y+h);this.closePath();};
Rec.prototype.arc=function(x,y,r,a0,a1,ccw){this.ellipse(x,y,r,r,0,a0,a1,ccw);};
Rec.prototype.ellipse=function(cx,cy,rx,ry,rot,a0,a1,ccw){
  var T=2*Math.PI,sw,cr=Math.cos(rot||0),sr=Math.sin(rot||0);
  if(!ccw){sw=a1-a0;if(sw>=T)sw=T;else{sw=((sw%T)+T)%T;}}
  else{sw=a1-a0;if(sw<=-T)sw=-T;else{sw=-((((a0-a1)%T)+T)%T);}}
  if(Math.abs(a1-a0)>=T)sw=ccw?-T:T;
  function P(t){return [cx+rx*Math.cos(t)*cr-ry*Math.sin(t)*sr,cy+rx*Math.cos(t)*sr+ry*Math.sin(t)*cr];}
  function D(t){return [-rx*Math.sin(t)*cr-ry*Math.cos(t)*sr,-rx*Math.sin(t)*sr+ry*Math.cos(t)*cr];}
  var n=Math.max(1,Math.ceil(Math.abs(sw)/(Math.PI/2)-1e-9)),st=sw/n,k=4/3*Math.tan(st/4),s=P(a0);
  this.lineTo(s[0],s[1]);
  for(var i=0;i<n;i++){var t0=a0+i*st,t1=t0+st,p0=P(t0),d0=D(t0),p1=P(t1),d1=D(t1);
    this.bezierCurveTo(p0[0]+k*d0[0],p0[1]+k*d0[1],p1[0]-k*d1[0],p1[1]-k*d1[1],p1[0],p1[1]);}
};
Rec.prototype.stroke=function(){if(!this.p.length)return;
  this.ops.push({k:'path',segs:this.p.slice(),stroke:{c:this.cm(this.strokeStyle,false),w:this._lw,dash:this.dash,cap:this.lineCap,join:this.lineJoin,a:this.globalAlpha},fill:null});};
Rec.prototype.fill=function(rule){if(!this.p.length||typeof this.fillStyle!=='string')return;
  this.ops.push({k:'path',segs:this.p.slice(),stroke:null,fill:{c:this.cm(this.fillStyle,true),a:this.globalAlpha,eo:rule==='evenodd'}});};
Rec.prototype.clip=function(rule){if(!this.p.length)return;this.ops.push({k:'clip',segs:this.p.slice(),eo:rule==='evenodd'});};
Rec.prototype.fillRect=function(x,y,w,h){var s=this.p;this.p=[];this.rect(x,y,w,h);this.fill();this.p=s;};
Rec.prototype.strokeRect=function(x,y,w,h){var s=this.p;this.p=[];this.rect(x,y,w,h);this.stroke();this.p=s;};
Rec.prototype.createPattern=function(){return null;};
Rec.prototype.createLinearGradient=function(){return {addColorStop:function(){}};};
Rec.prototype._fs=function(){var f=String(this.font),m=f.match(/(\d+(?:\.\d+)?)\s*(px|pt)/),sz=m?+m[1]*(m[2]==='pt'?1.333:1):10;
  return {size:sz,bold:/bold|[6-9]00/.test(f),italic:/italic|oblique/.test(f)};};
Rec.prototype.measureText=function(s){var f=this._fs();return {width:textW(s,f.size,f.bold)};};
Rec.prototype.fillText=function(str,x,y,col){
  var f=this._fs(),m=this.m,sc=Math.sqrt(m[0]*m[0]+m[1]*m[1])||1,w=textW(str,f.size,f.bold),dx=0,dy=0;
  if(this.textAlign==='center')dx=-w/2;else if(this.textAlign==='right'||this.textAlign==='end')dx=-w;
  var b=this.textBaseline;dy=b==='middle'?.35*f.size:b==='top'?.8*f.size:b==='hanging'?.75*f.size:b==='bottom'?-.2*f.size:0;
  var q=this.tp(x+dx,y+dy);
  this.ops.push({k:'text',x:q[0],y:q[1],size:f.size*sc,str:String(str),c:this.cm(col||this.fillStyle,true),bold:f.bold,italic:f.italic,rot:Math.atan2(m[1],m[0]),a:this.globalAlpha});
};
Rec.prototype.strokeText=function(s,x,y){this.fillText(s,x,y,this.strokeStyle);};

/* ---------- folha (sheet) ---------- */
function Sheet(W,H,job){this.W=W;this.H=H;this.ops=[];this.job=job||{};this.cm=colorMap(this.job.color||'color');}
Sheet.prototype.line=function(x1,y1,x2,y2,w,c){this.ops.push({k:'path',segs:[['M',x1,this.H-y1],['L',x2,this.H-y2]],stroke:{c:c||'#000000',w:w||.25,dash:null,cap:'butt',join:'miter',a:1},fill:null});};
Sheet.prototype.rect=function(x,y,w,h,lw,c){var H=this.H;this.ops.push({k:'path',segs:[['M',x,H-y],['L',x+w,H-y],['L',x+w,H-y-h],['L',x,H-y-h],['Z']],stroke:{c:c||'#000000',w:lw||.25,dash:null,cap:'butt',join:'miter',a:1},fill:null});};
Sheet.prototype.text=function(x,y,str,size,o){o=o||{};var w=textW(str,size,o.bold);
  if(o.align==='center')x-=w/2;else if(o.align==='right')x-=w;
  this.ops.push({k:'text',x:x,y:this.H-y,size:size,str:String(str),c:o.c||'#000000',bold:!!o.bold,italic:!!o.italic,rot:0,a:1});};

function styleOf(e,job){
  var r=null;try{r=CAD.resolve&&CAD.resolve(e);}catch(x){}
  if(!r){var l=(CAD.layer&&CAD.layer(e.layer))||{};r={color:e.color||l.color||'#000000',lw:e.lw!=null?e.lw:(l.lw!=null?l.lw:.25),ltype:e.ltype||l.ltype};}
  var lw=+r.lw;if(!(lw>0))lw=.25;if(lw>=5)lw/=100;
  if(job.lwMode==='uniform')lw=job.lwValue>0?+job.lwValue:.25;else lw*=(job.lwScale>0?job.lwScale:1);
  return {c:r.color||'#000000',w:Math.max(.05,Math.min(lw,5)),dash:dashFor(r.ltype)};
}
function entsOf(space,job){
  var all=job.ents||CAD.ents.query(function(){return true;});
  var out=all.filter(function(e){
    var sp=e.space||'model';if(sp!==space)return false;
    try{if(CAD.visible&&!CAD.visible(e))return false;}catch(x){}
    var l=CAD.layer&&CAD.layer(e.layer);if(l&&l.plot===false)return false;
    return true;});
  var h=out.filter(function(e){return e.type==='hatch';}),o=out.filter(function(e){return e.type!=='hatch';});
  return h.concat(o);
}
function mkView(ox,oy,z,w,h,cx,cy){
  return {zoom:z,pan:{x:cx,y:cy},w:w,h:h,plot:true,dpr:1,
    toScreen:function(p){return {x:ox+(p.x-cx)*z,y:oy-(p.y-cy)*z};},
    toWorld:function(sx,sy){return {x:cx+(sx-ox)/z,y:cy-(sy-oy)/z,z:0};},pickTol:function(){return 0;}};
}
function drawEnts(sh,list,view,job){
  var rec=new Rec(sh.ops,sh.cm);
  list.forEach(function(e){
    var def=CAD.types&&CAD.types.get(e.type);if(!def||typeof def.draw!=='function')return;
    rec.begin(styleOf(e,job));
    try{def.draw(rec.px,e,view);}catch(x){if(typeof console!=='undefined')console.warn('P13: falha ao plotar '+e.type,x);}
    rec.finish();
  });
}
function renderVP(sh,vp,job,list){
  var z=mmu()/vp.scale,H=sh.H,ox=vp.x+vp.w/2,oy=H-(vp.y+vp.h/2),hw=vp.w/2/z,hh=vp.h/2/z;
  var x1=vp.cx-hw,x2=vp.cx+hw,y1=vp.cy-hh,y2=vp.cy+hh;
  var sel=list.filter(function(e){var b=null;try{b=CAD.bboxOf(e);}catch(x){}return !b||!(b.x2<x1||b.x1>x2||b.y2<y1||b.y1>y2);});
  var top=H-vp.y-vp.h,bot=H-vp.y;
  sh.ops.push({k:'q'});
  sh.ops.push({k:'clip',segs:[['M',vp.x,top],['L',vp.x+vp.w,top],['L',vp.x+vp.w,bot],['L',vp.x,bot],['Z']],eo:false});
  drawEnts(sh,sel,mkView(ox,oy,z,vp.w,vp.h,vp.cx,vp.cy),job);
  sh.ops.push({k:'Q'});
  if(vp.border!==false)sh.rect(vp.x,vp.y,vp.w,vp.h,.35);
}
function drawTitle(sh,l){
  var tb=l.titleblock;if(!tb||!tb.on)return;
  var m=l.margins,f=tb.fields||{},iw=sh.W-m.l-m.r,w=Math.min(tb.w||180,iw),rh=tb.rowH||8,x0=sh.W-m.r-w,y0=m.b;
  var all=layouts(),idx=all.indexOf(l)+1;
  var auto={escala:l.viewports[0]?scaleText(l.viewports[0].scale):scaleText(l.scale),data:new Date().toISOString().slice(0,10),folha:idx+'/'+all.length};
  function val(k){return f[k]!=null&&String(f[k])!==''?String(f[k]):(auto[k]||'');}
  function cell(x,y,cw,label,v){
    var sz=3.2,tw=textW(v,1);if(tw>0&&tw*sz>cw-2)sz=Math.max(1.2,(cw-2)/tw);
    sh.text(x+1,y+rh-2,label,1.8,{c:'#666666'});sh.text(x+1,y+1.8,v,sz,{bold:true});
  }
  sh.rect(x0,y0,w,4*rh,.5);
  for(var i=1;i<4;i++)sh.line(x0,y0+i*rh,x0+w,y0+i*rh,.25);
  function vdiv(r,fr){fr.forEach(function(p){sh.line(x0+w*p,y0+r*rh,x0+w*p,y0+(r+1)*rh,.25);});}
  vdiv(0,[.25,.5,.8]);vdiv(1,[.75]);
  cell(x0,y0,w*.25,'ESCALA',val('escala'));cell(x0+w*.25,y0,w*.25,'DATA',val('data'));
  cell(x0+w*.5,y0,w*.3,'AUTOR',val('autor'));cell(x0+w*.8,y0,w*.2,'REV.',val('revisao'));
  cell(x0,y0+rh,w*.75,'DESENHO',val('desenho'));cell(x0+w*.75,y0+rh,w*.25,'FOLHA',val('folha'));
  cell(x0,y0+2*rh,w,'PROJETO',val('projeto'));cell(x0,y0+3*rh,w,'EMPRESA',val('empresa'));
}
function areaWin(job){
  var a=job.area||{};
  if(a.mode==='window'&&a.win)return a.win;
  if(a.mode==='view'&&CAD.view&&CAD.view.zoom){var v=CAD.view,hw=v.w/2/v.zoom,hh=v.h/2/v.zoom;return {x1:v.pan.x-hw,y1:v.pan.y-hh,x2:v.pan.x+hw,y2:v.pan.y+hh};}
  return extents();
}
function normJob(j){
  j=j||{};var o={};for(var k in j)o[k]=j[k];
  if(!o.source)o.source=(CUR!=='model'&&getL(CUR))?'layout':'model';
  if(o.source==='layout'&&!o.layout)o.layout=CUR!=='model'?CUR:(layouts()[0]&&layouts()[0].name);
  o.color=o.color||'color';o.lwMode=o.lwMode||'layer';o.lwScale=o.lwScale||1;
  if(!o.margins)o.margins={l:10,t:10,r:10,b:10};
  if(!o.orient)o.orient='landscape';if(!o.paper)o.paper='A4';if(o.scale==null)o.scale='fit';
  return o;
}
function buildSheet(job){
  job=normJob(job);var sh,list;
  if(job.source==='layout'){
    var l=getL(job.layout);if(!l)throw new Error('Layout inexistente: '+job.layout);
    var d=paperDims(l);sh=new Sheet(d.w,d.h,job);sh.scales=[];
    list=entsOf('model',job);
    l.viewports.forEach(function(vp){if(vp.on===false)return;sh.scales.push(vp.scale);renderVP(sh,vp,job,list);});
    drawEnts(sh,entsOf(l.name,job),mkView(d.w/2,d.h/2,1,d.w,d.h,d.w/2,d.h/2),job);
    if(job.frame!==false){var m=l.margins;sh.rect(m.l,m.b,d.w-m.l-m.r,d.h-m.t-m.b,.5);}
    drawTitle(sh,l);
  }else{
    var dm=dimsOf(job.paper,job.orient,job.customW,job.customH),mg=job.margins;
    sh=new Sheet(dm.w,dm.h,job);
    var aw=dm.w-mg.l-mg.r,ah=dm.h-mg.t-mg.b,win=areaWin(job);
    var need=Math.max((win.x2-win.x1)*mmu()/aw,(win.y2-win.y1)*mmu()/ah);if(!(need>0))need=1;
    var den=typeof job.scale==='number'?job.scale:job.scale==='fitx'?need:stdUp(need);
    var vp={x:mg.l,y:mg.b,w:aw,h:ah,cx:(win.x1+win.x2)/2,cy:(win.y1+win.y2)/2,scale:den,border:false};
    sh.scales=[den];renderVP(sh,vp,job,entsOf('model',job));
    if(job.frame)sh.rect(mg.l,mg.b,aw,ah,.5);
  }
  return sh;
}

/* ---------- saída: SVG ---------- */
function toSVG(sh,o){
  o=o||{};var id='p13c'+(++SVGN)+'_',n=0,defs=[],out=[],stack=[];
  function P(segs){return segs.map(function(s){return s[0]==='Z'?'Z':s[0]+' '+s.slice(1).map(pn).join(' ');}).join(' ');}
  sh.ops.forEach(function(op){
    if(op.k==='q')stack.push(0);
    else if(op.k==='clip'){var c=id+(++n);defs.push('<clipPath id="'+c+'"><path d="'+P(op.segs)+'" clip-rule="'+(op.eo?'evenodd':'nonzero')+'"/></clipPath>');
      out.push('<g clip-path="url(#'+c+')">');if(!stack.length)stack.push(0);stack[stack.length-1]++;}
    else if(op.k==='Q'){var k=stack.pop()||0;for(var i=0;i<k;i++)out.push('</g>');}
    else if(op.k==='path'){
      var a='d="'+P(op.segs)+'"';
      if(op.fill)a+=' fill="'+op.fill.c+'" fill-rule="'+(op.fill.eo?'evenodd':'nonzero')+'"'+(op.fill.a<1?' fill-opacity="'+op.fill.a+'"':'');else a+=' fill="none"';
      if(op.stroke){var s=op.stroke;a+=' stroke="'+s.c+'" stroke-width="'+pn(s.w)+'" stroke-linecap="'+(s.cap==='butt'||s.cap==='round'||s.cap==='square'?s.cap:'butt')+'" stroke-linejoin="'+(s.join==='round'||s.join==='bevel'?s.join:'miter')+'"';
        if(s.dash&&s.dash.length)a+=' stroke-dasharray="'+s.dash.map(pn).join(' ')+'"';if(s.a<1)a+=' stroke-opacity="'+s.a+'"';}
      out.push('<path '+a+'/>');}
    else if(op.k==='text'){
      out.push('<text x="'+pn(op.x)+'" y="'+pn(op.y)+'" font-size="'+pn(op.size)+'" fill="'+op.c+'" font-family="Helvetica,Arial,sans-serif"'+(op.bold?' font-weight="bold"':'')+(op.italic?' font-style="italic"':'')+
        (op.rot?' transform="rotate('+pn(op.rot*180/Math.PI)+' '+pn(op.x)+' '+pn(op.y)+')"':'')+'>'+esc(op.str)+'</text>');}
  });
  stack.forEach(function(k){for(var i=0;i<k;i++)out.push('</g>');});
  var body=out.join(''),dd='<defs>'+defs.join('')+'</defs>';
  if(o.inner)return dd+body;
  var bg=o.bg?'<rect width="'+pn(sh.W)+'" height="'+pn(sh.H)+'" fill="#fff"/>':'';
  return '<svg xmlns="http://www.w3.org/2000/svg" '+(o.fluid?'style="width:100%;height:100%;display:block" ':'width="'+pn(sh.W)+'mm" height="'+pn(sh.H)+'mm" ')+'viewBox="0 0 '+pn(sh.W)+' '+pn(sh.H)+'">'+dd+bg+body+'</svg>';
}

/* ---------- saída: PDF vetorial próprio ---------- */
function enc(s){
  s=String(s).replace(/\u2264/g,'<=').replace(/\u2265/g,'>=').replace(/\u2260/g,'<>').replace(/\u2205/g,'\u00D8').replace(/\u2212/g,'-');
  var o='';
  for(var i=0;i<s.length;i++){
    var c=s.charCodeAt(i),b=c<32?32:(c<256&&!(c>=128&&c<160))?c:(WIN[c]||63);
    if(b<32||b>126)o+='\\'+('00'+b.toString(8)).slice(-3);
    else{var ch=String.fromCharCode(b);if(ch==='('||ch===')'||ch==='\\')o+='\\';o+=ch;}
  }
  return o;
}
function rgb(c){var v=parseColor(c)||[0,0,0];return pn(v[0]/255)+' '+pn(v[1]/255)+' '+pn(v[2]/255);}
function pdfContent(sh,alphas){
  var H=sh.H,out=[],cache={};
  function X(x){return pn(x*K);}function Y(y){return pn((H-y)*K);}
  function gs(a){if(!(a<1))return '';var r=Math.round(a*100)/100,i=alphas.indexOf(r);if(i<0){alphas.push(r);i=alphas.length-1;}return '/A'+i+' gs\n';}
  function set(key,val){if(cache[key]===val)return '';cache[key]=val;return val;}
  function path(segs){return segs.map(function(s){
    if(s[0]==='M')return X(s[1])+' '+Y(s[2])+' m';if(s[0]==='L')return X(s[1])+' '+Y(s[2])+' l';
    if(s[0]==='C')return X(s[1])+' '+Y(s[2])+' '+X(s[3])+' '+Y(s[4])+' '+X(s[5])+' '+Y(s[6])+' c';return 'h';}).join('\n')+'\n';}
  sh.ops.forEach(function(op){
    if(op.k==='q'){out.push('q\n');cache={};}
    else if(op.k==='Q'){out.push('Q\n');cache={};}
    else if(op.k==='clip')out.push(path(op.segs)+(op.eo?'W* n\n':'W n\n'));
    else if(op.k==='path'){
      var s='',st=op.stroke,fl=op.fill;
      if(st){s+=set('G',rgb(st.c)+' RG\n')+set('w',pn(Math.max(st.w,.02)*K)+' w\n')+set('J',(st.cap==='round'?1:st.cap==='square'?2:0)+' J\n')+set('j',(st.join==='round'?1:st.join==='bevel'?2:0)+' j\n')+
        set('d',(st.dash&&st.dash.length?'['+st.dash.map(function(v){return pn(v*K);}).join(' ')+'] 0 d\n':'[] 0 d\n'));}
      if(fl)s+=set('g',rgb(fl.c)+' rg\n');
      var a=(st?st.a:fl.a);s+=set('a',gs(a)||(cache.a2?'/A_ gs\n':''));
      out.push(s+path(op.segs)+(st&&fl?(fl.eo?'B*':'B'):st?'S':(fl.eo?'f*':'f'))+'\n');
    }else if(op.k==='text'){
      var f=op.bold?(op.italic?'/F4':'/F2'):(op.italic?'/F3':'/F1'),c=Math.cos(op.rot),sn=Math.sin(op.rot);
      out.push('BT\n'+f+' '+pn(op.size*K)+' Tf\n'+rgb(op.c)+' rg\n'+gs(op.a)+pn(c)+' '+pn(-sn)+' '+pn(sn)+' '+pn(c)+' '+X(op.x)+' '+Y(op.y)+' Tm\n('+enc(op.str)+') Tj\nET\n');
    }
  });
  return out.join('');
}
function pdfBuild(sheets,opt){
  opt=opt||{};var objs=[];function add(s){objs.push(s);return objs.length;}
  add(null);add(null);
  ['Helvetica','Helvetica-Bold','Helvetica-Oblique','Helvetica-BoldOblique'].forEach(function(f){add('<< /Type /Font /Subtype /Type1 /BaseFont /'+f+' /Encoding /WinAnsiEncoding >>');});
  var kids=[];
  sheets.forEach(function(sh){
    var al=[],cs=pdfContent(sh,al);
    var cid=add('<< /Length '+cs.length+' >>\nstream\n'+cs+'endstream');
    var g=al.map(function(a,i){return '/A'+i+' << /CA '+a+' /ca '+a+' >>';}).join(' ');
    var pid=add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pn(sh.W*K)+' '+pn(sh.H*K)+'] /Contents '+cid+' 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> /ExtGState << '+g+' >> >> >>');
    kids.push(pid+' 0 R');
  });
  objs[0]='<< /Type /Catalog /Pages 2 0 R >>';objs[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >>';
  var info=add('<< /Title ('+enc(opt.title||'CAD 2D')+') /Producer (CAD 2D Offline) >>');
  var out='%PDF-1.4\n',offs=[];
  objs.forEach(function(o,i){offs.push(out.length);out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
  var x=out.length;out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
  offs.forEach(function(o){out+=('0000000000'+o).slice(-10)+' 00000 n \n';});
  return out+'trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R /Info '+info+' 0 R >>\nstartxref\n'+x+'\n%%EOF\n';
}
function pdfBlob(str){var u=new Uint8Array(str.length);for(var i=0;i<str.length;i++)u[i]=str.charCodeAt(i)&255;return new Blob([u],{type:'application/pdf'});}
CAD.pdf={build:pdfBuild,blob:function(sheets,opt){return pdfBlob(pdfBuild(sheets,opt));},encode:enc};

/* ---------- ações de saída (DOM) ---------- */
function saveBlob(blob,name){
  var a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(u);a.remove();},1500);
}
function printSheets(sheets){
  var f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
  var s=sheets[0],html='<!doctype html><html><head><meta charset="utf-8"><style>@page{size:'+pn(s.W)+'mm '+pn(s.H)+'mm;margin:0}html,body{margin:0;padding:0}svg{display:block;page-break-after:always}</style></head><body>'+
    sheets.map(function(x){return toSVG(x,{bg:true});}).join('')+'</body></html>';
  var d=f.contentWindow.document;d.open();d.write(html);d.close();
  setTimeout(function(){f.contentWindow.focus();f.contentWindow.print();setTimeout(function(){f.remove();},2000);},250);
}
function plot(job,fmt,fname){
  var sh=buildSheet(job);fname=fname||(job.name||'desenho');
  if(fmt==='print')printSheets([sh]);
  else if(fmt==='svg')saveBlob(new Blob([toSVG(sh,{bg:true})],{type:'image/svg+xml'}),fname+'.svg');
  else saveBlob(pdfBlob(pdfBuild([sh],{title:fname})),fname+'.pdf');
  return sh;
}

/* ---------- API pública ---------- */
function showLayout(n){
  if(n!=='model'&&!getL(n))n='model';
  CUR=n;SELVP=null;
  if(n==='model')ovClose();else ovOpen();
  renderTabs();emit('layout:changed');
}
CAD.layout={
  paperSizes:PAPERS,scales:STD,parseScale:parseScale,scaleText:scaleText,mmPerUnit:mmu,paperDims:paperDims,dimsOf:dimsOf,
  list:function(){return layouts().map(function(l){return l.name;});},get:getL,current:function(){return CUR;},show:showLayout,
  add:addLayout,remove:removeLayout,rename:renameLayout,update:updateLayout,
  addViewport:addViewport,updateViewport:updateViewport,removeViewport:removeViewport,vpMap:vpMap,
  sheet:buildSheet,svg:toSVG,plot:plot,wizard:function(o){openWizard(o);},extents:extents
};

/* ---------- UI: estilos, abas e visualização do layout ---------- */
var CSS='.cad13-ov{position:absolute;left:0;right:0;top:0;bottom:26px;background:#8a8f98;z-index:20;display:flex;flex-direction:column;font:12px system-ui,sans-serif}'+
'.cad13-bar{display:flex;gap:6px;padding:4px 6px;background:#f3f4f6;border-bottom:1px solid #c9ccd1;align-items:center;flex-wrap:wrap}'+
'.cad13-bar button,.cad13-tabs button,.cad13-wz button{font:12px system-ui,sans-serif;padding:3px 9px;border:1px solid #b8bcc4;background:#fff;border-radius:3px;cursor:pointer}'+
'.cad13-bar button:hover,.cad13-tabs button:hover,.cad13-wz button:hover{background:#e8f0fe}.cad13-bar select,.cad13-wz select,.cad13-wz input{font:12px system-ui,sans-serif;padding:2px 4px}'+
'.cad13-stage{flex:1;position:relative;overflow:hidden;cursor:default}'+
'.cad13-tabs{position:absolute;left:0;right:0;bottom:0;height:26px;z-index:21;display:flex;gap:2px;padding:2px 4px;background:#e5e7eb;border-top:1px solid #c9ccd1;overflow-x:auto}'+
'.cad13-tabs button.on{background:#1f6feb;color:#fff;border-color:#1f6feb}'+
'.cad13-wzb{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;display:flex;align-items:center;justify-content:center;font:13px system-ui,sans-serif}'+
'.cad13-wz{background:#fff;border-radius:8px;width:min(920px,96vw);max-height:94vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.35)}'+
'.cad13-wz h3{margin:0;padding:10px 14px;border-bottom:1px solid #ddd;font-size:15px}.cad13-wzc{display:flex;gap:14px;padding:12px 14px;overflow:auto;flex-wrap:wrap}'+
'.cad13-wzl{flex:1 1 300px;display:flex;flex-direction:column;gap:8px}.cad13-wzl label{display:flex;gap:6px;align-items:center;flex-wrap:wrap}'+
'.cad13-pv{flex:1 1 340px;background:#8a8f98;padding:10px;border-radius:4px;min-height:240px;display:flex;align-items:center;justify-content:center}.cad13-pv svg{max-width:100%;max-height:52vh;box-shadow:0 2px 8px rgba(0,0,0,.4)}'+
'.cad13-wzf{display:flex;gap:8px;justify-content:space-between;padding:10px 14px;border-top:1px solid #ddd}.cad13-wz input[type=number]{width:64px}.cad13-note{color:#555;font-size:12px}'+
'.cad13-map{position:relative;background:#fff;line-height:0;overflow:hidden;touch-action:none;user-select:none;cursor:crosshair;box-shadow:0 2px 8px rgba(0,0,0,.4)}'+
'.cad13-sel{position:absolute;border:2px solid #e5322d;box-shadow:0 0 0 9999px rgba(0,0,0,.38);cursor:move;box-sizing:border-box}'+
'.cad13-sel i{position:absolute;width:12px;height:12px;background:#fff;border:2px solid #e5322d;box-sizing:border-box}'+
'.cad13-sel i[data-h=nw]{left:-7px;top:-7px;cursor:nwse-resize}.cad13-sel i[data-h=ne]{right:-7px;top:-7px;cursor:nesw-resize}.cad13-sel i[data-h=sw]{left:-7px;bottom:-7px;cursor:nesw-resize}.cad13-sel i[data-h=se]{right:-7px;bottom:-7px;cursor:nwse-resize}'+
'.cad13-lbl{position:absolute;left:4px;top:4px;background:rgba(255,255,230,.95);border:1px solid #999;padding:1px 6px;font:11px/16px system-ui;color:#111;pointer-events:none}';
function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
function hostEl(){
  var c=document.querySelector('canvas'),h=document.querySelector('#cad-wrap,#canvas-wrap,#viewport,#stage')||(c&&c.parentElement)||document.body;
  if(window.getComputedStyle(h).position==='static')h.style.position='relative';return h;
}
function renderTabs(){
  if(typeof document==='undefined')return;
  var t=document.querySelector('.cad13-tabs');if(!t)return;
  t.innerHTML='<button data-n="model" class="'+(CUR==='model'?'on':'')+'">Modelo</button>'+
    layouts().map(function(l){return '<button data-n="'+esc(l.name)+'" class="'+(CUR===l.name?'on':'')+'" title="Duplo clique: renomear">'+esc(l.name)+'</button>';}).join('')+'<button data-n="+" title="Novo layout">+</button><button data-n="-" title="Excluir o layout atual">\u2212</button>';
}
function ovOpen(){
  if(OV||typeof document==='undefined')return;
  var root=el('div','cad13-ov','<div class="cad13-bar"><button data-a="newvp">Nova janela</button><label>Escala <select data-a="vpscale"></select></label>'+
    '<button data-a="usev" title="Centro da janela = centro da vista do Modelo">Centro = vista</button><button data-a="fitv" title="Ajusta escala para mostrar a vista do Modelo">Ajustar à vista</button>'+
    '<button data-a="zext">Folha inteira</button><button data-a="plot">Imprimir…</button><button data-a="model">Voltar ao Modelo</button>'+
    '<span class="cad13-note">Arraste: mover/redimensionar | Ctrl+arrastar: pan do conteúdo | Ctrl+roda: escala | Del: excluir</span></div><div class="cad13-stage"></div>');
  hostEl().appendChild(root);
  OV={root:root,stage:root.querySelector('.cad13-stage'),vb:null,tool:'select',drag:null,svg:null,raf:0};
  var st=OV.stage;
  root.querySelector('.cad13-bar').addEventListener('click',function(ev){var a=ev.target.getAttribute&&ev.target.getAttribute('data-a');if(a)ovAction(a);});
  root.querySelector('[data-a=vpscale]').addEventListener('change',function(ev){
    var v=ev.target.value,den=v==='custom'?parseScale(window.prompt('Escala (ex.: 1:75)','1:'+(selVp()?selVp().scale:100))):+v;
    if(den&&selVp())updateViewport(CUR,SELVP,{scale:den});else ovSync();});
  st.addEventListener('pointerdown',ovDown);st.addEventListener('pointermove',ovMove);st.addEventListener('pointerup',ovUp);
  st.addEventListener('wheel',ovWheel,{passive:false});
  document.addEventListener('keydown',ovKey);
  ovRender(true);
}
function ovClose(){if(!OV)return;document.removeEventListener('keydown',ovKey);OV.root.remove();OV=null;}
function selVp(){return CUR!=='model'&&SELVP?vpOf(CUR,SELVP):null;}
function ovSync(){
  if(!OV)return;var s=OV.root.querySelector('[data-a=vpscale]'),v=selVp(),opts=STD.slice();
  if(v&&opts.indexOf(v.scale)<0)opts.push(v.scale);opts.sort(function(a,b){return a-b;});
  s.innerHTML=opts.map(function(d){return '<option value="'+d+'"'+(v&&v.scale===d?' selected':'')+'>'+scaleText(d)+'</option>';}).join('')+'<option value="custom">Outra…</option>';
  s.disabled=!v;
}
function ovRender(fit){
  if(!OV||CUR==='model'||!getL(CUR))return;
  var sh;try{sh=buildSheet({source:'layout',layout:CUR});}catch(x){OV.stage.textContent=String(x.message);return;}
  OV.sh=sh;
  if(fit||!OV.vb)ovFit();
  OV.stage.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;touch-action:none" viewBox="'+OV.vb.x+' '+OV.vb.y+' '+OV.vb.w+' '+OV.vb.h+'">'+
    '<rect x="2" y="2" width="'+sh.W+'" height="'+sh.H+'" fill="rgba(0,0,0,.3)"/><rect width="'+sh.W+'" height="'+sh.H+'" fill="#fff"/>'+toSVG(sh,{inner:true})+'<g class="ui"></g></svg>';
  OV.svg=OV.stage.firstChild;ovUI();ovSync();
}
function ovFit(){
  var sh=OV.sh||{W:420,H:297},cw=OV.stage.clientWidth||800,ch=OV.stage.clientHeight||600,pad=sh.W*.04;
  var w=sh.W+2*pad,h=sh.H+2*pad,k=Math.max(w/cw,h/ch);w=cw*k;h=ch*k;
  OV.vb={x:sh.W/2-w/2,y:sh.H/2-h/2,w:w,h:h};
}
function ovApplyVB(){if(OV&&OV.svg){OV.svg.setAttribute('viewBox',OV.vb.x+' '+OV.vb.y+' '+OV.vb.w+' '+OV.vb.h);ovUI();}}
function ovUI(){
  if(!OV||!OV.svg)return;var g=OV.svg.querySelector('.ui'),sh=OV.sh,l=getL(CUR);if(!g||!l)return;
  var mp=OV.svg.getScreenCTM()?1/OV.svg.getScreenCTM().a:1,h='';
  l.viewports.forEach(function(v){
    var on=v.id===SELVP;
    h+='<rect x="'+pn(v.x)+'" y="'+pn(sh.H-v.y-v.h)+'" width="'+pn(v.w)+'" height="'+pn(v.h)+'" fill="none" stroke="'+(on?'#0a84ff':'#7aa7e0')+'" stroke-width="'+pn(mp*(on?1.6:.8))+'" stroke-dasharray="'+pn(mp*5)+' '+pn(mp*3)+'"/>';
    if(on)h+='<rect x="'+pn(v.x+v.w-mp*4)+'" y="'+pn(sh.H-v.y-mp*4)+'" width="'+pn(mp*8)+'" height="'+pn(mp*8)+'" fill="#0a84ff"/>';
  });
  if(OV.drag&&OV.drag.t==='new'&&OV.drag.r){var r=OV.drag.r;h+='<rect x="'+pn(r.x)+'" y="'+pn(sh.H-r.y-r.h)+'" width="'+pn(r.w)+'" height="'+pn(r.h)+'" fill="rgba(10,132,255,.12)" stroke="#0a84ff" stroke-width="'+pn(mp)+'"/>';}
  g.innerHTML=h;
}
function ovPt(ev){var s=OV.svg,p=s.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;var q=p.matrixTransform(s.getScreenCTM().inverse());return {x:q.x,y:OV.sh.H-q.y};}
function ovHit(p){var l=getL(CUR);for(var i=l.viewports.length-1;i>=0;i--){var v=l.viewports[i];if(p.x>=v.x&&p.x<=v.x+v.w&&p.y>=v.y&&p.y<=v.y+v.h)return v;}return null;}
function ovDown(ev){
  if(!OV||!OV.svg)return;var p=ovPt(ev),mp=1/OV.svg.getScreenCTM().a,hit=ovHit(p),sel=selVp();
  OV.stage.setPointerCapture&&OV.stage.setPointerCapture(ev.pointerId);
  var d={sx:ev.clientX,sy:ev.clientY,p0:p,before:JSON.stringify(layouts()),mp:mp,moved:false};OV.drag=d;
  if(ev.button===1||(ev.button===0&&OV.tool==='select'&&!hit)){d.t='pan';if(!hit&&ev.button===0){SELVP=null;ovUI();ovSync();}return;}
  if(OV.tool==='newvp'){d.t='new';return;}
  if(hit){SELVP=hit.id;ovSync();
    if(sel&&sel.id===hit.id&&Math.abs(p.x-(hit.x+hit.w))<mp*8&&Math.abs(p.y-hit.y)<mp*8&&!hit.locked)d.t='resize';
    else if(ev.ctrlKey)d.t='content';else d.t=hit.locked?'none':'move';
    d.v0=clone(hit);ovUI();
  }
}
function ovMove(ev){
  if(!OV||!OV.drag)return;var d=OV.drag,dx=(ev.clientX-d.sx)*d.mp,dy=(ev.clientY-d.sy)*d.mp,v=selVp();d.moved=true;
  if(d.t==='pan'){OV.vb.x-=(ev.clientX-d.sx)*d.mp;OV.vb.y-=(ev.clientY-d.sy)*d.mp;d.sx=ev.clientX;d.sy=ev.clientY;ovApplyVB();}
  else if(d.t==='new'){var p=ovPt(ev);d.r={x:Math.min(d.p0.x,p.x),y:Math.min(d.p0.y,p.y),w:Math.abs(p.x-d.p0.x),h:Math.abs(p.y-d.p0.y)};ovUI();}
  else if(v&&d.t==='move'){v.x=d.v0.x+dx;v.y=d.v0.y-dy;ovUI();}
  else if(v&&d.t==='resize'){v.w=Math.max(5,d.v0.w+dx);v.h=Math.max(5,d.v0.h+dy);v.y=d.v0.y+d.v0.h-v.h;ovUI();}
  else if(v&&d.t==='content'){var z=mmu()/v.scale;v.cx=d.v0.cx-dx/z;v.cy=d.v0.cy+dy/z;
    if(!OV.raf)OV.raf=requestAnimationFrame(function(){OV.raf=0;ovRender();});}
}
function ovUp(ev){
  if(!OV||!OV.drag)return;var d=OV.drag;OV.drag=null;
  if(d.t==='new'&&d.r&&d.r.w>3&&d.r.h>3){
    var win=extents(),vpn={x:d.r.x,y:d.r.y,w:d.r.w,h:d.r.h,cx:(win.x1+win.x2)/2,cy:(win.y1+win.y2)/2},l=getL(CUR);
    var id=addViewport(CUR,{x:vpn.x,y:vpn.y,w:vpn.w,h:vpn.h,cx:vpn.cx,cy:vpn.cy,scale:l.scale});SELVP=id;OV.tool='select';
  }else if(d.moved&&d.t!=='pan'&&d.t!=='new'){tx('JANELA',null,d.before);}
  ovRender();
}
function ovWheel(ev){
  if(!OV||!OV.svg)return;ev.preventDefault();var p=ovPt(ev),f=ev.deltaY>0?1.15:1/1.15,hit=ovHit(p);
  if(ev.ctrlKey&&hit&&!hit.locked){var i=STD.indexOf(hit.scale),n=i<0?hit.scale*f:STD[Math.max(0,Math.min(STD.length-1,i+(ev.deltaY>0?1:-1)))];updateViewport(CUR,hit.id,{scale:n});SELVP=hit.id;return;}
  var q=OV.svg.createSVGPoint();q.x=ev.clientX;q.y=ev.clientY;q=q.matrixTransform(OV.svg.getScreenCTM().inverse());
  OV.vb={x:q.x-(q.x-OV.vb.x)*f,y:q.y-(q.y-OV.vb.y)*f,w:OV.vb.w*f,h:OV.vb.h*f};ovApplyVB();
}
function ovKey(ev){
  if(!OV||/INPUT|SELECT|TEXTAREA/.test((ev.target||{}).tagName||''))return;
  if(CAD.cmd&&CAD.cmd.activeName&&CAD.cmd.activeName())return;
  if(ev.key==='Delete'&&selVp()){removeViewport(CUR,SELVP);SELVP=null;}
  else if(ev.key==='Escape'){OV.tool='select';SELVP=null;ovUI();ovSync();}
}
function ovAction(a){
  if(a==='newvp'){OV.tool='newvp';say('Arraste na folha para criar a janela.');}
  else if(a==='zext'){ovFit();ovApplyVB();}
  else if(a==='plot')openWizard();
  else if(a==='model')showLayout('model');
  else if(a==='usev'&&selVp()&&CAD.view){updateViewport(CUR,SELVP,{cx:CAD.view.pan.x,cy:CAD.view.pan.y});}
  else if(a==='fitv'&&selVp()&&CAD.view&&CAD.view.zoom){
    var v=selVp(),w=CAD.view.w/CAD.view.zoom,h=CAD.view.h/CAD.view.zoom;
    updateViewport(CUR,SELVP,{cx:CAD.view.pan.x,cy:CAD.view.pan.y,scale:stdUp(Math.max(w*mmu()/v.w,h*mmu()/v.h))});}
}

/* ---------- UI: assistente de impressão (5 etapas) ---------- */
function closeWizard(){if(WZ){WZ.remove();WZ=null;}}
function openWizard(opt){
  if(typeof document==='undefined')return;closeWizard();
  var lay=CUR!=='model'?getL(CUR):null;
  var job={source:lay?'layout':'model',layout:lay?lay.name:(layouts()[0]&&layouts()[0].name)||null,paper:'A4',orient:'landscape',customW:297,customH:210,
    area:{mode:'extents',win:null},scale:'fit',customScale:'1:100',margins:{l:10,t:10,r:10,b:10},frame:false,color:'color',lwMode:'layer',lwValue:.25,lwScale:1,out:'pdf',name:'desenho'};
  if(opt)for(var k in opt)job[k]=opt[k];
  function sync(){var l=getL(job.layout);if(job.source==='layout'&&l){var p=l.paper;job.paper=typeof p==='object'?'custom':p;if(typeof p==='object'){job.customW=p.w;job.customH=p.h;}job.orient=l.orient;job.margins=clone(l.margins);job.frame=true;}}
  sync();
  var step=0,back=el('div','cad13-wzb'),box=el('div','cad13-wz');back.appendChild(box);document.body.appendChild(back);WZ=back;
  var TITLES=['1. Papel e orientação','2. Área de plotagem','3. Escala, margens e prévia','4. Cores e espessuras','5. Gerar PDF ou imprimir'];
  function fin(){var j=clone(job);j.area=job.area;if(job.scale==='custom')j.scale=parseScale(job.customScale)||100;return j;}
  function sel(id,opts,val){return '<select data-k="'+id+'">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(String(o[0])===String(val)?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>';}
  function num(id,val,st){return '<input type="number" data-k="'+id+'" value="'+val+'" step="'+(st||1)+'">';}
  function areaPreview(pv){   // mostra o desenho do modelo e a área que será impressa (arraste para escolher)
    var ex=extents(),cur=areaWin(job),sel={x1:cur.x1,y1:cur.y1,x2:cur.x2,y2:cur.y2};
    var b={x1:Math.min(ex.x1,sel.x1),y1:Math.min(ex.y1,sel.y1),x2:Math.max(ex.x2,sel.x2),y2:Math.max(ex.y2,sel.y2)};
    var pad=Math.max(b.x2-b.x1,b.y2-b.y1,1)*.06;b.x1-=pad;b.y1-=pad;b.x2+=pad;b.y2+=pad;
    var W0=200,H0=Math.max(40,Math.min(400,W0*(b.y2-b.y1)/(b.x2-b.x1))),dm=dimsOf('custom',W0>=H0?'landscape':'portrait',W0,H0);
    var asp=dm.w/dm.h,bw=b.x2-b.x1,bh=b.y2-b.y1,cxm=(b.x1+b.x2)/2,cym=(b.y1+b.y2)/2;
    if(bw/bh<asp){bw=bh*asp;}else{bh=bw/asp;}
    b={x1:cxm-bw/2,x2:cxm+bw/2,y1:cym-bh/2,y2:cym+bh/2};
    var sh=buildSheet({source:'model',paper:'custom',customW:dm.w,customH:dm.h,orient:dm.w>=dm.h?'landscape':'portrait',area:{mode:'window',win:b},scale:'fitx',
      margins:{l:0,t:0,r:0,b:0},frame:false,color:'color',lwMode:'layer',lwValue:.25,lwScale:1,layout:null});
    pv.innerHTML='<div class="cad13-map" style="aspect-ratio:'+pn(dm.w)+'/'+pn(dm.h)+';width:min(100%,calc(52vh*'+pn(asp)+'))">'+toSVG(sh,{bg:true,fluid:true})+
      '<div class="cad13-sel"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div><div class="cad13-lbl"></div></div>';
    var map=pv.querySelector('.cad13-map'),se=map.querySelector('.cad13-sel'),lb=map.querySelector('.cad13-lbl'),un=(CAD.doc&&CAD.doc.units)||'';
    function show(){
      se.style.left=((sel.x1-b.x1)/bw*100)+'%';se.style.width=((sel.x2-sel.x1)/bw*100)+'%';
      se.style.top=((b.y2-sel.y2)/bh*100)+'%';se.style.height=((sel.y2-sel.y1)/bh*100)+'%';
      lb.textContent='Área de impressão: '+(sel.x2-sel.x1).toFixed(2)+' × '+(sel.y2-sel.y1).toFixed(2)+(un?' '+un:'');
    }
    function wpt(ev){var r=map.getBoundingClientRect();return {x:b.x1+(ev.clientX-r.left)/r.width*bw,y:b.y2-(ev.clientY-r.top)/r.height*bh};}
    var dr=null;
    map.addEventListener('pointerdown',function(ev){
      if(ev.button!==0)return;ev.preventDefault();var p=wpt(ev),h=ev.target.getAttribute&&ev.target.getAttribute('data-h');
      dr={t:h?'size':(ev.target===se?'move':'new'),h:h,p0:p,o:{x1:sel.x1,y1:sel.y1,x2:sel.x2,y2:sel.y2},px:ev.clientX,py:ev.clientY,moved:false};
      try{map.setPointerCapture(ev.pointerId);}catch(x){}
    });
    map.addEventListener('pointermove',function(ev){
      if(!dr)return;var p=wpt(ev),dx=p.x-dr.p0.x,dy=p.y-dr.p0.y,o=dr.o;
      if(Math.hypot(ev.clientX-dr.px,ev.clientY-dr.py)>3)dr.moved=true;if(!dr.moved)return;
      if(dr.t==='move'){sel.x1=o.x1+dx;sel.x2=o.x2+dx;sel.y1=o.y1+dy;sel.y2=o.y2+dy;}
      else if(dr.t==='size'){var h=dr.h,nx1=o.x1,nx2=o.x2,ny1=o.y1,ny2=o.y2;
        if(h.indexOf('w')>=0)nx1=p.x;else nx2=p.x;if(h.indexOf('n')>=0)ny2=p.y;else ny1=p.y;
        sel.x1=Math.min(nx1,nx2);sel.x2=Math.max(nx1,nx2);sel.y1=Math.min(ny1,ny2);sel.y2=Math.max(ny1,ny2);}
      else{sel.x1=Math.min(dr.p0.x,p.x);sel.x2=Math.max(dr.p0.x,p.x);sel.y1=Math.min(dr.p0.y,p.y);sel.y2=Math.max(dr.p0.y,p.y);}
      show();
    });
    function up(ev){
      if(!dr)return;var d=dr;dr=null;try{map.releasePointerCapture(ev.pointerId);}catch(x){}
      if(!d.moved||!(sel.x2-sel.x1>0)||!(sel.y2-sel.y1>0)){show();return;}
      job.area={mode:'window',win:{x1:sel.x1,y1:sel.y1,x2:sel.x2,y2:sel.y2}};render();
    }
    map.addEventListener('pointerup',up);map.addEventListener('pointercancel',function(){dr=null;show();});
    show();
  }
  function preview(){
    var pv=box.querySelector('.cad13-pv');if(!pv)return;
    if(step===1&&job.source==='model'){try{areaPreview(pv);}catch(x){pv.textContent='Prévia indisponível: '+x.message;}return;}
    try{var sh=buildSheet(fin());pv.innerHTML=toSVG(sh,{bg:true});WZ._sh=sh;}catch(x){pv.textContent='Prévia indisponível: '+x.message;}
  }
  function body(){
    var h='';
    if(step===0){
      h+='<label>Origem '+sel('source',[['model','Modelo']].concat(layouts().map(function(l){return ['L:'+l.name,'Layout: '+esc(l.name)];})),job.source==='layout'?'L:'+job.layout:'model')+'</label>';
      h+='<label>Papel '+sel('paper',Object.keys(PAPERS).map(function(p){return [p,p];}).concat([['custom','Personalizado']]),job.paper)+'</label>';
      if(job.paper==='custom')h+='<label>Largura '+num('customW',job.customW)+' Altura '+num('customH',job.customH)+' mm</label>';
      h+='<label>Orientação '+sel('orient',[['landscape','Paisagem'],['portrait','Retrato']],job.orient)+'</label>';
      if(job.source==='layout')h+='<div class="cad13-note">As alterações de papel valem para o layout (e podem ser desfeitas com Ctrl+Z).</div>';
    }else if(step===1){
      if(job.source==='layout')h+='<div>Folha inteira do layout <b>'+esc(job.layout)+'</b> (todas as janelas, anotações e carimbo).</div>';
      else{
        h+='<label>Área '+sel('area.mode',[['extents','Extensão do desenho'],['view','Vista atual'],['window','Janela']],job.area.mode)+'</label>';
        h+='<div class="cad13-note">O retângulo vermelho na prévia é a área que será impressa. Arraste na prévia para desenhar uma nova área, arraste o retângulo para mover ou os cantos para redimensionar.</div>';
        if(job.area.mode==='window'){var w=job.area.win;h+='<button data-act="win">Escolher janela no desenho</button><div class="cad13-note">'+(w?'Janela: '+pn(w.x1)+','+pn(w.y1)+' → '+pn(w.x2)+','+pn(w.y2):'Nenhuma janela definida (usa extensão).')+'</div>';}
      }
    }else if(step===2){
      if(job.source==='model'){
        h+='<label>Escala '+sel('scale',[['fit','Ajustar (escala padrão)'],['fitx','Ajustar (exata)']].concat(STD.map(function(d){return [d,'1:'+d];})).concat([['custom','Personalizada…']]),job.scale)+'</label>';
        if(job.scale==='custom')h+='<label>Valor <input data-k="customScale" value="'+esc(job.customScale)+'" size="8"> <span class="cad13-note">ex.: 1:75 ou 2:1</span></label>';
        h+='<label><input type="checkbox" data-k="frame"'+(job.frame?' checked':'')+'> Moldura na área impressa</label>';
      }else h+='<div class="cad13-note">A escala é definida em cada janela do layout (use o seletor de escala no layout).</div>';
      h+='<div>Margens (mm)</div><label>Esq '+num('margins.l',job.margins.l)+' Sup '+num('margins.t',job.margins.t)+' Dir '+num('margins.r',job.margins.r)+' Inf '+num('margins.b',job.margins.b)+'</label>';
      h+='<div id="cad13-sc" class="cad13-note"></div>';
    }else if(step===3){
      h+='<label>Cores '+sel('color',[['color','Colorido'],['gray','Tons de cinza'],['mono','Monocromático (preto)']],job.color)+'</label>';
      h+='<label>Espessuras '+sel('lwMode',[['layer','Das camadas'],['uniform','Uniforme']],job.lwMode)+'</label>';
      if(job.lwMode==='uniform')h+='<label>Valor (mm) '+num('lwValue',job.lwValue,.05)+'</label>';
      else h+='<label>Multiplicador '+num('lwScale',job.lwScale,.1)+'</label>';
      h+='<div class="cad13-note">Branco é plotado como preto. Tipos de linha seguem a camada.</div>';
    }else{
      h+='<label>Saída '+sel('out',[['pdf','Arquivo PDF vetorial'],['print','Imprimir (impressora do sistema)'],['svg','Arquivo SVG']],job.out)+'</label>';
      if(job.out!=='print')h+='<label>Nome do arquivo <input data-k="name" value="'+esc(job.name)+'"></label>';
      var sc=WZ&&WZ._sh?WZ._sh:null,d=sc?sc.W+' × '+sc.H+' mm':'';
      h+='<div class="cad13-note">Papel: '+d+(sc&&sc.scales&&sc.scales.length?' | Escala: '+sc.scales.map(scaleText).join(', '):'')+'</div>';
    }
    return h;
  }
  function render(){
    box.innerHTML='<h3>Imprimir — '+TITLES[step]+'</h3><div class="cad13-wzc"><div class="cad13-wzl">'+body()+'</div><div class="cad13-pv"></div></div>'+
      '<div class="cad13-wzf"><button data-act="cancel">Cancelar</button><span><button data-act="back"'+(step?'':' disabled')+'>Voltar</button> <button data-act="next">'+(step===4?(job.out==='print'?'Imprimir':'Gerar'):'Próximo')+'</button></span></div>';
    preview();
    var sc=box.querySelector('#cad13-sc');if(sc&&WZ._sh)sc.textContent='Escala resultante: '+(WZ._sh.scales||[]).map(scaleText).join(', ');
  }
  function setPath(k,v){var p=k.split('.'),o=job;for(var i=0;i<p.length-1;i++)o=o[p[i]];o[p[p.length-1]]=v;}
  box.addEventListener('change',function(ev){
    var t=ev.target,k=t.getAttribute('data-k');if(!k)return;
    var v=t.type==='checkbox'?t.checked:(t.type==='number'?+t.value:t.value);
    if(k==='source'){if(v==='model')job.source='model';else{job.source='layout';job.layout=v.slice(2);sync();}}
    else{setPath(k,v);
      if(job.source==='layout'&&/^(paper|orient|customW|customH|margins\.)/.test(k)){
        updateLayout(job.layout,{paper:job.paper==='custom'?{w:job.customW,h:job.customH}:job.paper,orient:job.orient,margins:clone(job.margins)});}}
    render();
  });
  box.addEventListener('input',function(ev){var t=ev.target;if(t.getAttribute('data-k')==='customScale'){job.customScale=t.value;preview();}});
  box.addEventListener('click',function(ev){
    var a=ev.target.getAttribute&&ev.target.getAttribute('data-act');if(!a)return;
    if(a==='cancel')closeWizard();
    else if(a==='back'&&step>0){step--;render();}
    else if(a==='next'){if(step<4){step++;render();}else{try{plot(fin(),job.out,job.name);}catch(x){window.alert('Falha ao gerar: '+x.message);return;}closeWizard();}}
    else if(a==='win'){
      back.style.display='none';
      CAD.cmd.run({name:'PLOTJANELA',run:async function(){
        var p1=await CAD.input.point('Primeiro canto da área de plotagem');if(!p1||p1.keyword)return;
        var p2=await CAD.input.point('Canto oposto',{base:p1,preview:function(ctx,v,pt){if(CAD.render&&CAD.render.rubberRect)CAD.render.rubberRect(ctx,v,p1,pt);}});
        if(!p2||p2.keyword)return;
        job.area.win={x1:Math.min(p1.x,p2.x),y1:Math.min(p1.y,p2.y),x2:Math.max(p1.x,p2.x),y2:Math.max(p1.y,p2.y)};
      }}).catch(function(){}).then(function(){back.style.display='';render();});
    }
  });
  render();
}

/* ---------- UI: painel Layouts ---------- */
function mountPanel(el0){
  function esc2(s){return esc(s==null?'':s);}
  function draw(){
    var l=CUR!=='model'?getL(CUR):null,h='';
    if(!l){
      h='<div style="padding:8px;font:12px system-ui">Layouts:<ul style="padding-left:16px">'+layouts().map(function(x){return '<li><a href="#" data-open="'+esc2(x.name)+'">'+esc2(x.name)+'</a> <a href="#" data-del="'+esc2(x.name)+'" title="Excluir">✕</a></li>';}).join('')+'</ul><button data-new>Novo layout</button></div>';
    }else{
      var tb=l.titleblock||{fields:{}},f=tb.fields||{},v=selVp();
      function row(lbl,k,val,t){return '<label style="display:flex;justify-content:space-between;gap:6px;margin:2px 0">'+lbl+'<input data-p="'+k+'" value="'+esc2(val)+'" '+(t==='n'?'type="number" step="any" style="width:80px"':'style="width:130px"')+'></label>';}
      h='<div style="padding:8px;font:12px system-ui"><b>'+esc2(l.name)+'</b><br>'+
        '<label>Papel <select data-p="paper">'+Object.keys(PAPERS).map(function(p){return '<option'+(l.paper===p?' selected':'')+'>'+p+'</option>';}).join('')+'</select></label> '+
        '<label><select data-p="orient"><option value="landscape"'+(l.orient==='landscape'?' selected':'')+'>Paisagem</option><option value="portrait"'+(l.orient==='portrait'?' selected':'')+'>Retrato</option></select></label><br>'+
        row('Escala padrão (1:n)','scale',l.scale,'n')+row('Margem esq','m.l',l.margins.l,'n')+row('Margem sup','m.t',l.margins.t,'n')+row('Margem dir','m.r',l.margins.r,'n')+row('Margem inf','m.b',l.margins.b,'n')+
        '<label><input type="checkbox" data-p="tb.on"'+(tb.on?' checked':'')+'> Carimbo</label>'+
        ['empresa','projeto','desenho','escala','data','autor','revisao','folha'].map(function(k){return row(k[0].toUpperCase()+k.slice(1),'tb.'+k,f[k]);}).join('')+
        (v?'<hr><b>Janela '+esc2(v.id)+'</b>'+row('X (mm)','vp.x',pn(v.x),'n')+row('Y (mm)','vp.y',pn(v.y),'n')+row('Largura','vp.w',pn(v.w),'n')+row('Altura','vp.h',pn(v.h),'n')+row('Centro X','vp.cx',pn(v.cx),'n')+row('Centro Y','vp.cy',pn(v.cy),'n')+row('Escala (1:n)','vp.scale',v.scale,'n')+
          '<label><input type="checkbox" data-p="vp.locked"'+(v.locked?' checked':'')+'> Travada</label> <label><input type="checkbox" data-p="vp.border"'+(v.border!==false?' checked':'')+'> Borda</label> <label><input type="checkbox" data-p="vp.on"'+(v.on!==false?' checked':'')+'> Ativa</label>':'<div class="cad13-note">Selecione uma janela para editar.</div>')+
        '<hr><button data-new>Novo layout</button> <button data-del="'+esc2(l.name)+'">Excluir</button></div>';
    }
    el0.innerHTML=h;
  }
  el0.addEventListener('click',function(ev){
    var t=ev.target,o=t.getAttribute('data-open'),d=t.getAttribute('data-del');
    if(o!=null){ev.preventDefault();showLayout(o);}
    else if(d!=null){ev.preventDefault();if(window.confirm('Excluir o layout "'+d+'"?'))removeLayout(d);}
    else if(t.hasAttribute('data-new')){showLayout(addLayout('Layout'));}
  });
  el0.addEventListener('change',function(ev){
    var t=ev.target,k=t.getAttribute('data-p');if(!k||!CUR||CUR==='model')return;
    var v=t.type==='checkbox'?t.checked:t.value,n=+v,l=getL(CUR),p;
    if(k==='paper'||k==='orient')updateLayout(CUR,(p={},p[k]=v,p));
    else if(k==='scale'){if(n>0)updateLayout(CUR,{scale:n});}
    else if(k.indexOf('m.')===0){var m=clone(l.margins);m[k[2]]=Math.max(0,n||0);updateLayout(CUR,{margins:m});}
    else if(k==='tb.on'||k.indexOf('tb.')===0){var tb=clone(l.titleblock);if(k==='tb.on')tb.on=v;else{tb.fields=tb.fields||{};tb.fields[k.slice(3)]=v;}updateLayout(CUR,{titleblock:tb});}
    else if(k.indexOf('vp.')===0&&SELVP){var q={},f=k.slice(3);q[f]=t.type==='checkbox'?v:n;if((f==='w'||f==='h'||f==='scale')&&!(n>0))return;updateViewport(CUR,SELVP,q);}
  });
  CAD.on&&CAD.on('layout:changed',draw);draw();
}

/* ---------- comandos e integração ---------- */
function reg(def){try{CAD.cmd.register(def);}catch(x){}}
function kw(r){return String((r&&typeof r==='object'?r.keyword:r)||'').toLowerCase();}
reg({name:'PLOT',alias:['PRINT','IMPRIMIR'],run:async function(){openWizard();}});
reg({name:'MODEL',alias:['MODELO'],run:async function(){showLayout('model');}});
reg({name:'LAYOUT',alias:['LO'],run:async function(){
  var k=kw(await CAD.input.keyword('Layout [Novo/Renomear/Excluir/Ativar/Lista/Modelo]',['Novo','Renomear','Excluir','Ativar','Lista','Modelo'],'Ativar'));
  var names=CAD.layout.list();
  if(k==='lista'){say('Layouts: '+(names.join(', ')||'(nenhum)'));return;}
  if(k==='modelo'){showLayout('model');return;}
  if(k==='novo'){var n=await CAD.input.string('Nome do novo layout',{def:'Layout'+(names.length+1)});if(n){n=addLayout(n);showLayout(n);}return;}
  var n2=await CAD.input.string('Nome do layout',{def:CUR!=='model'?CUR:names[0]||''});
  if(!getL(n2)){say('Layout não encontrado: '+n2);return;}
  if(k==='excluir'){removeLayout(n2);}
  else if(k==='renomear'){var nn=await CAD.input.string('Novo nome',{def:n2});if(!renameLayout(n2,nn))say('Nome inválido ou já existente.');}
  else showLayout(n2);
}});
reg({name:'MVIEW',alias:['MV','JANELA'],run:async function(){
  if(CUR==='model'||!getL(CUR)){say('Abra um layout (comando LAYOUT) antes de criar janelas.');return;}
  var a=await CAD.input.point('Primeiro canto da janela em mm na folha (ex.: 20,30) ou ENTER para desenhar com o mouse',{optional:true});
  if(!a||a.keyword){if(OV)OV.tool='newvp';say('Arraste na folha para criar a janela.');return;}
  var b=await CAD.input.point('Canto oposto (mm)',{base:a});if(!b||b.keyword)return;
  var win=extents(),l=getL(CUR);
  SELVP=addViewport(CUR,{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y),cx:(win.x1+win.x2)/2,cy:(win.y1+win.y2)/2,scale:l.scale});
  ovRender();
}});
reg({name:'MVSCALE',alias:['ESCALAJ'],run:async function(){
  var v=selVp();if(!v){say('Selecione uma janela no layout.');return;}
  var s=await CAD.input.string('Escala da janela (ex.: 1:50)',{def:'1:'+v.scale});var d=parseScale(s);
  if(d)updateViewport(CUR,v.id,{scale:d});else say('Escala inválida.');
}});

function boot(){
  if(BOOT||typeof document==='undefined')return;BOOT=true;
  var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  var tabs=el('div','cad13-tabs');hostEl().appendChild(tabs);
  tabs.addEventListener('click',function(ev){var n=ev.target.getAttribute&&ev.target.getAttribute('data-n');if(n==null)return;
    if(n==='+')showLayout(addLayout('Layout'));
    else if(n==='-'){
      if(CUR==='model'){say('Abra o layout que deseja excluir e clique em \u2212 (o Modelo não pode ser excluído).');return;}
      if(window.confirm('Excluir o layout "'+CUR+'" e tudo o que há nele?'))removeLayout(CUR);
    }else showLayout(n);});
  tabs.addEventListener('dblclick',function(ev){var n=ev.target.getAttribute&&ev.target.getAttribute('data-n');if(!n||n==='+'||n==='-'||n==='model')return;
    var nn=window.prompt('Novo nome do layout',n);if(nn&&!renameLayout(n,nn))say('Nome inválido ou já existente.');renderTabs();});
  renderTabs();
  try{CAD.ui.menu.add('Arquivo/Imprimir…','Imprimir…','PLOT');CAD.ui.menu.add('Layout/Novo layout','Novo layout','LAYOUT');CAD.ui.menu.add('Layout/Nova janela','Nova janela','MVIEW');CAD.ui.menu.add('Layout/Modelo','Modelo','MODEL');}catch(x){}
  try{CAD.ui.toolbar.add('Arquivo',{icone:'🖨',rotulo:'Imprimir',cmd:'PLOT'});}catch(x){}
  try{CAD.ui.panel.register({id:'layouts',title:'Layouts',mount:mountPanel});}catch(x){}
  var t=0;
  CAD.on&&CAD.on('doc:changed',function(){clearTimeout(t);t=setTimeout(function(){
    if(CUR!=='model'&&!getL(CUR)){showLayout('model');}else if(OV)ovRender();renderTabs();},150);});
  try{if(CAD.fileio&&CAD.fileio.register)CAD.fileio.register({ext:'pdf',label:'PDF (layout/plotagem)',export:function(doc){
    var job=layouts().length?{source:'layout',layout:layouts()[0].name}:{source:'model',paper:'A3',orient:'landscape'};
    return pdfBlob(pdfBuild([buildSheet(job)],{title:'CAD 2D'}));}});}catch(x){}
}
if(CAD.on)CAD.on('ready',boot);
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);}

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p13=function(){
  var n=0,f=0;function ok(c,m){n++;if(!c){f++;console.assert(false,'P13 FALHOU: '+m);}}
  var u0=CAD.doc.units;CAD.doc.units='m';
  try{
    ok(HW.length===95,'tabela de larguras');
    var d=dimsOf('A3','landscape');ok(d.w===420&&d.h===297,'A3 paisagem');d=dimsOf('A4','portrait');ok(d.w===210&&d.h===297,'A4 retrato');
    ok(dimsOf('custom','landscape',500,300).w===500,'papel personalizado');
    ok(parseScale('1:75')===75&&parseScale('2:1')===.5&&parseScale('100')===100&&parseScale('x')===null,'parseScale');
    ok(scaleText(100)==='1:100'&&scaleText(.5)==='2:1','scaleText');
    ok(stdUp(60)===75&&stdUp(100)===100,'stdUp');
    ok(Math.abs(textW('AAA',10)-20.01)<1e-6,'largura de texto');
    var m=vpMap({x:10,y:10,w:100,h:100,cx:0,cy:0,scale:100}),a=m({x:0,y:0}),b=m({x:10,y:0});
    ok(Math.abs((b.x-a.x)-100)<1e-9,'10 m em 1:100 = 100 mm');
    CAD.types.register('p13t',{draw:function(ctx,e,v){var p=v.toScreen(e.p1),q=v.toScreen(e.p2);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();},bbox:function(e){return {x1:Math.min(e.p1.x,e.p2.x),y1:Math.min(e.p1.y,e.p2.y),x2:Math.max(e.p1.x,e.p2.x),y2:Math.max(e.p1.y,e.p2.y)};}});
    CAD.types.register('p13c',{draw:function(ctx,e,v){var c=v.toScreen(e.c);ctx.beginPath();ctx.arc(c.x,c.y,e.r*v.zoom,0,Math.PI*2);ctx.stroke();ctx.fillText('Ø12',c.x,c.y);},bbox:function(e){return {x1:e.c.x-e.r,y1:e.c.y-e.r,x2:e.c.x+e.r,y2:e.c.y+e.r};}});
    var ents=[{id:'t1',type:'p13t',layer:'0',p1:{x:0,y:0,z:0},p2:{x:10,y:0,z:0},space:'model',color:'#ff0000',lw:.5,ltype:'DASHED'},{id:'t2',type:'p13c',layer:'0',c:{x:5,y:5,z:0},r:2,space:'model'}];
    var sh=buildSheet({source:'model',ents:ents,paper:'A4',orient:'landscape',margins:{l:10,t:10,r:10,b:10},scale:100,area:{mode:'window',win:{x1:0,y1:0,x2:10,y2:10}},color:'color'});
    var ps=sh.ops.filter(function(o){return o.k==='path';}),ln=ps[0];
    ok(ps.length===2&&sh.ops.some(function(o){return o.k==='clip';}),'ops gravadas');
    ok(Math.abs(Math.abs(ln.segs[1][1]-ln.segs[0][1])-100)<1e-6,'linha 10 m = 100 mm na folha');
    ok(ln.stroke.dash&&ln.stroke.w===.5&&ln.stroke.c==='#ff0000','estilo (cor, espessura, tracejado)');
    ok(ps[1].segs.filter(function(s){return s[0]==='C';}).length===4,'círculo = 4 béziers');
    ok(sh.ops.some(function(o){return o.k==='text'&&o.str==='Ø12';}),'texto gravado');
    ok(sh.scales[0]===100,'escala resultante');
    var sm=buildSheet({source:'model',ents:ents,paper:'A4',orient:'landscape',scale:100,area:{mode:'window',win:{x1:0,y1:0,x2:10,y2:10}},color:'mono'});
    ok(sm.ops.filter(function(o){return o.k==='path';})[0].stroke.c==='#000000','modo monocromático');
    var fit=buildSheet({source:'model',ents:ents,paper:'A4',orient:'landscape',scale:'fit',area:{mode:'extents'}});
    ok(fit.scales[0]>=1&&STD.indexOf(fit.scales[0])>=0,'ajuste automático em escala padrão');
    var svg=toSVG(sh,{bg:true});ok(svg.indexOf('<svg')===0&&svg.indexOf('clipPath')>0&&svg.indexOf('stroke-dasharray')>0,'SVG');
    var pdf=pdfBuild([sh,fit],{title:'teste'});
    ok(pdf.indexOf('%PDF-1.4')===0&&/%%EOF\n$/.test(pdf),'PDF cabeçalho/rodapé');
    ok(pdf.indexOf('/MediaBox [0 0 841.89 595.276]')>0&&pdf.indexOf('/Count 2')>0,'PDF MediaBox A4 e 2 páginas');
    var sx=+pdf.match(/startxref\n(\d+)/)[1];ok(pdf.substr(sx,4)==='xref','PDF xref offset');
    var o1=+pdf.match(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/)[1];ok(pdf.substr(o1,7)==='1 0 obj','PDF offset do objeto 1');
    ok(enc('a(b)\\ Ø ≤ ±')==='a\\(b\\)\\\\ \\330 <= \\261','codificação WinAnsi');
    if(typeof Blob!=='undefined')ok(pdfBlob(pdf).size===pdf.length,'Blob do PDF');
    if(CAD.history&&CAD.history.run&&CAD.history.undo){
      var nm=addLayout('T13',{autoVp:false});ok(!!getL(nm),'layout criado');
      var vid=addViewport(nm,{x:20,y:20,w:100,h:80,cx:0,cy:0,scale:50});ok(vpOf(nm,vid)&&vpOf(nm,vid).scale===50,'janela criada');
      updateLayout(nm,{titleblock:{on:true,rowH:8,w:180,fields:{projeto:'PROJ13'}}});
      var ls=buildSheet({source:'layout',layout:nm,ents:ents});
      ok(ls.ops.some(function(o){return o.k==='text'&&o.str==='PROJ13';}),'carimbo com campo editável');
      ok(ls.W===420&&ls.H===297&&ls.scales[0]===50,'folha do layout');
      CAD.history.undo();CAD.history.undo();CAD.history.undo();
      ok(!getL(nm),'undo remove o layout');
      CAD.history.redo();ok(!!getL(nm),'redo restaura o layout');
      CAD.history.undo();
    }
  }catch(x){f++;console.error('P13 exceção',x);}
  CAD.doc.units=u0;
  console.log('P13: '+(n-f)+'/'+n+' ok'+(f?' — '+f+' FALHA(S)':''));return f===0;
};
})(window.CAD=window.CAD||{});
/* ==== END:13 ==== */
