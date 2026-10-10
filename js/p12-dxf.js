/* ==== PART:12 ==== */
/* P12 DXF: importação/exportação R2000 (AC1015) ASCII.
   Entidades: LINE POLYLINE LWPOLYLINE CIRCLE ARC ELLIPSE SPLINE POINT TEXT MTEXT HATCH SOLID XLINE RAY INSERT DIMENSION
   + tabelas LAYER/LTYPE/STYLE e BLOCKS. Depende de P1 e P11 (usa CAD.files.normalize e CAD.files.svg.apply se existirem).
   PROTOCOLO por tipo (plugado via CAD.types.extend e CAD.dxf.registerOut/register):
     toDXF(e,ctx) -> {n:'LINE',sub:'AcDbLine',g:[[codigo,valor],...],com?:[[codigo,valor]]} | array deles | null
        (o motor escreve 0,5,330,100 AcDbEntity,67,8,6,62,420,370 e com[]; g[] vem depois do subclass 'sub')
     fromDXF(r,ctx) -> entidade (sem id) | array | null ; r={t,g:[[codigo,valor]],subs?} ; helpers: CAD.dxf.gv/gn/gp */
(function(CAD){
'use strict';
var D2R=Math.PI/180;
function say(m){try{CAD.cmd.print(m);}catch(_){console.log(m);}}
function isCancel(e){return e===CAD.Cancel||(typeof CAD.Cancel==='function'&&e instanceof CAD.Cancel)||!!(e&&e.name==='Cancel');}
function guard(fn){return async function(){try{return await fn.apply(this,arguments);}catch(e){if(isCancel(e))throw e;say('Erro: '+(e&&e.message||e));}};}
function tdef(t){try{return CAD.types&&CAD.types.get&&CAD.types.get(t);}catch(_){return null;}}

/* ---------- texto, números, nomes ---------- */
function enc(s){return String(s==null?'':s).replace(/[^\x20-\x7e]/g,function(c){return '\\U+'+('0000'+c.charCodeAt(0).toString(16).toUpperCase()).slice(-4);});}
function dec(s){return String(s==null?'':s).replace(/\\U\+([0-9A-Fa-f]{4})/g,function(m,h){return String.fromCharCode(parseInt(h,16));})
  .replace(/%%[cC]/g,'\u00D8').replace(/%%[dD]/g,'\u00B0').replace(/%%[pP]/g,'\u00B1');}
function dxfName(n){return (String(n==null?'':n).replace(/[<>\/\\":;?*|=`]/g,'_').trim()||'0').slice(0,255);}
function fmt(v){
  if(!isFinite(v)||Math.abs(v)<1e-12)return '0';
  if(Number.isInteger(v))return String(v);
  var s=v.toFixed(12);return s.indexOf('.')>=0?s.replace(/\.?0+$/,''):s;
}
function Wr(){this.a=[];}
Wr.prototype.w=function(c,v){this.a.push(String(c),typeof v==='number'?fmt(v):String(v));};

/* ---------- cores (ACI <-> #rrggbb) ---------- */
var PAL=null;
function hsv(h,s,v){
  var c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c,r,g,b;
  if(h<60){r=c;g=x;b=0;}else if(h<120){r=x;g=c;b=0;}else if(h<180){r=0;g=c;b=x;}else if(h<240){r=0;g=x;b=c;}else if(h<300){r=x;g=0;b=c;}else{r=c;g=0;b=x;}
  return [Math.floor((r+m)*255+1e-6),Math.floor((g+m)*255+1e-6),Math.floor((b+m)*255+1e-6)];
}
function pal(){
  if(PAL)return PAL;
  PAL=[];
  [[255,0,0],[255,255,0],[0,255,0],[0,255,255],[0,0,255],[255,0,255],[0,0,0],[128,128,128],[192,192,192]].forEach(function(c,i){PAL[i+1]=c;});
  var V=[255,204,153,127,76],h,k;
  for(h=0;h<24;h++)for(k=0;k<10;k++)PAL[10+h*10+k]=hsv(h*15,(k%2)?0.5:1,V[k>>1]/255);
  [[51,51,51],[80,80,80],[105,105,105],[130,130,130],[190,190,190],[255,255,255]].forEach(function(c,j){PAL[250+j]=c;});
  return PAL;
}
function toHex(rgb){return '#'+rgb.map(function(v){return ('0'+v.toString(16)).slice(-2);}).join('');}
function toRGB(c){
  if(c==null)return null;
  if(typeof c==='number')return pal()[c]||null;
  var s=String(c).trim().toLowerCase(),m=/^#?([0-9a-f]{6})$/.exec(s),n;
  if(m){n=parseInt(m[1],16);return [(n>>16)&255,(n>>8)&255,n&255];}
  m=/^#([0-9a-f]{3})$/.exec(s);
  if(m){return m[1].split('').map(function(x){return parseInt(x+x,16);});}
  return s==='white'?[255,255,255]:null;
}
function colorPair(c){
  var rgb=toRGB(c)||[0,0,0],P=pal(),i,best=7,bd=1e9,d;
  if(rgb[0]===rgb[1]&&rgb[1]===rgb[2]&&(rgb[0]===0||rgb[0]===255))return {aci:7};
  for(i=1;i<=255;i++){if(i===7)continue;d=Math.pow(P[i][0]-rgb[0],2)+Math.pow(P[i][1]-rgb[1],2)+Math.pow(P[i][2]-rgb[2],2);if(d<bd){bd=d;best=i;}}
  return bd===0?{aci:best}:{aci:best,tc:(rgb[0]<<16)|(rgb[1]<<8)|rgb[2]};
}
var LW=[0,5,9,13,15,18,20,25,30,35,40,50,53,60,70,80,90,100,106,120,140,158,200,211];
function lw100(mm){var v=mm*100,b=LW[0];LW.forEach(function(x){if(Math.abs(x-v)<Math.abs(b-v))b=x;});return b;}
var LT={continuous:null,dashed:[0.5,-0.25],hidden:[0.25,-0.125],center:[1.25,-0.25,0.25,-0.25],dashdot:[0.5,-0.25,0,-0.25],phantom:[1.25,-0.25,0.25,-0.25,0.25,-0.25],dot:[0,-0.25]};
function ltName(n){var s=dxfName(n);return s.toLowerCase()==='continuous'?'Continuous':s.toUpperCase();}
function ltPat(n){var k=String(n||'').toLowerCase();return LT[k]||(/dashdot/.test(k)?LT.dashdot:/dash|hidden/.test(k)?LT.dashed:/center/.test(k)?LT.center:/phantom/.test(k)?LT.phantom:/dot/.test(k)?LT.dot:null);}
function alphaToTransp(v){return (v&0x02000000)?Math.round((1-(v&255)/255)*100):0;}

/* ---------- justificação de TEXT ---------- */
var JUST={left:[0,0],l:[0,0],center:[1,0],c:[1,0],right:[2,0],r:[2,0],middle:[4,0],m:[4,0],
  tl:[0,3],tc:[1,3],tr:[2,3],ml:[0,2],mc:[1,2],mr:[2,2],bl:[0,1],bc:[1,1],br:[2,1]};
function justName(h,v){
  if(h===3||h===5)return 'left';
  if(!v)return {0:'left',1:'center',2:'right',4:'middle'}[h]||'left';
  return ({3:'t',2:'m',1:'b'}[v]||'b')+(['l','c','r'][h]||'c');
}

/* ---------- padrões de hachura (formato .pat: ang,x0,y0,dx,dy,[traços]) ---------- */
var PAT={ANSI31:[[45,0,0,0,3.175,[]]],ANSI32:[[45,0,0,0,9.525,[]],[45,4.49,0,0,9.525,[]]],ANSI37:[[45,0,0,0,3.175,[]],[135,0,0,0,3.175,[]]],
  LINE:[[0,0,0,0,3.175,[]]],USER:[[0,0,0,0,1,[]]],CROSS:[[0,0,0,0,6.35,[]],[90,0,0,0,6.35,[]]],
  ANGLE:[[0,0,0,0,6.35,[5.08,-1.5875]],[90,0,0,0,6.35,[5.08,-1.5875]]]};

/* =====================  EXPORTAÇÃO  ===================== */
var D={};  /* CAD type -> {toDXF} */
D.line={toDXF:function(e){return {n:'LINE',sub:'AcDbLine',g:[[10,e.p1.x],[20,e.p1.y],[30,e.p1.z||0],[11,e.p2.x],[21,e.p2.y],[31,e.p2.z||0]]};}};
D.circle={toDXF:function(e){return {n:'CIRCLE',sub:'AcDbCircle',g:[[10,e.c.x],[20,e.c.y],[30,e.c.z||0],[40,e.r]]};}};
D.arc={toDXF:function(e){return {n:'ARC',sub:'AcDbCircle',g:[[10,e.c.x],[20,e.c.y],[30,e.c.z||0],[40,e.r],[100,'AcDbArc'],[50,e.a1],[51,e.a2]]};}};
D.point={toDXF:function(e){return {n:'POINT',sub:'AcDbPoint',g:[[10,e.p.x],[20,e.p.y],[30,e.p.z||0]]};}};
D.pline={toDXF:function(e){
  var P=e.pts||[];if(P.length<2)return null;
  var g=[[90,P.length],[70,e.closed?1:0],[43,0]];
  if(P[0].z)g.push([38,P[0].z]);
  P.forEach(function(p){g.push([10,p.x],[20,p.y]);if(p.bulge)g.push([42,p.bulge]);});
  return {n:'LWPOLYLINE',sub:'AcDbPolyline',g:g};
}};
D.ellipse={toDXF:function(e){
  var mj=e.major||{x:1,y:0,z:0},a1=+e.a1||0,a2=e.a2==null?360:+e.a2;
  if(Math.abs(a2-a1)<1e-9){a1=0;a2=360;}
  return {n:'ELLIPSE',sub:'AcDbEllipse',g:[[10,e.c.x],[20,e.c.y],[30,e.c.z||0],[11,mj.x],[21,mj.y],[31,mj.z||0],[210,0],[220,0],[230,1],[40,+e.ratio||1],[41,a1*D2R],[42,a2*D2R]]};
}};
D.spline={toDXF:function(e){
  var P=e.fit||[];if(P.length<2)return null;
  var g=[[210,0],[220,0],[230,1],[70,8+(e.closed?1:0)],[71,3],[72,0],[73,0],[74,P.length]];
  P.forEach(function(p){g.push([11,p.x],[21,p.y],[31,p.z||0]);});
  return {n:'SPLINE',sub:'AcDbSpline',g:g};
}};
D.xline={toDXF:function(e){return {n:'XLINE',sub:'AcDbXline',g:[[10,e.p.x],[20,e.p.y],[30,e.p.z||0],[11,e.dir.x],[21,e.dir.y],[31,e.dir.z||0]]};}};
D.ray={toDXF:function(e){return {n:'RAY',sub:'AcDbRay',g:[[10,e.p.x],[20,e.p.y],[30,e.p.z||0],[11,e.dir.x],[21,e.dir.y],[31,e.dir.z||0]]};}};
D.text={toDXF:function(e,c){
  var j=JUST[String(e.just||'left').toLowerCase()]||[0,0],st=dxfName(e.style||'Standard'),z=e.p.z||0;
  c.styles[st]=1;
  var g=[[10,e.p.x],[20,e.p.y],[30,z],[40,+e.h||1],[1,enc(String(e.str==null?'':e.str).replace(/\r?\n/g,' '))],[50,+e.rot||0],[7,enc(st)],[72,j[0]]];
  if(j[0]||j[1])g.push([11,e.p.x],[21,e.p.y],[31,z]);
  g.push([100,'AcDbText'],[73,j[1]]);
  return {n:'TEXT',sub:'AcDbText',g:g};
}};
D.mtext={toDXF:function(e,c){
  var st=dxfName(e.style||'Standard'),s=String(e.str==null?'':e.str).replace(/\r?\n/g,'\\P'),r=(+e.rot||0)*D2R,parts=[];
  c.styles[st]=1;
  while(s.length>100){parts.push(s.slice(0,100));s=s.slice(100);}
  var g=[[10,e.p.x],[20,e.p.y],[30,e.p.z||0],[40,+e.h||1],[41,+e.w||0],[71,1],[72,5]];
  parts.forEach(function(p){g.push([3,enc(p)]);});
  g.push([1,enc(s)],[7,enc(st)],[11,Math.cos(r)],[21,Math.sin(r)],[31,0]);
  return {n:'MTEXT',sub:'AcDbMText',g:g};
}};
D.insert={toDXF:function(e,c){
  if(!c.doc.blocks||!c.doc.blocks[e.block]){c.skipMsg('INSERT sem bloco');return null;}
  var sx=e.sx==null?1:e.sx,sy=e.sy==null?sx:e.sy;
  return {n:'INSERT',sub:'AcDbBlockReference',g:[[2,enc(dxfName(e.block))],[10,e.p.x],[20,e.p.y],[30,e.p.z||0],[41,sx],[42,sy],[43,sx],[50,+e.rot||0]]};
}};
D.hatch={toDXF:function(e){
  var loops=(e.loops||[]).map(function(l){return Array.isArray(l)?l:(l&&(l.pts||l.points))||[];}).filter(function(l){return l.length>1;});
  if(!loops.length)return null;
  var solid=!!e.solid||/^solid$/i.test(e.pattern||''),key=String(e.pattern||'ANSI31').toUpperCase(),name=solid?'SOLID':dxfName(key);
  var g=[[10,0],[20,0],[30,0],[210,0],[220,0],[230,1],[2,name],[70,solid?1:0],[71,0],[91,loops.length]];
  loops.forEach(function(P){
    var hb=P.some(function(p){return p.bulge;})?1:0;
    g.push([92,7],[72,hb],[73,1],[93,P.length]);
    P.forEach(function(p){g.push([10,p.x],[20,p.y]);if(hb)g.push([42,p.bulge||0]);});
    g.push([97,0]);
  });
  g.push([75,0],[76,1]);
  if(!solid){
    var s=+e.scale||1,rot=+e.rot||0,lines=PAT[key]||PAT.ANSI31,cr=Math.cos(rot*D2R),sr=Math.sin(rot*D2R);
    g.push([52,rot],[41,s],[77,0],[78,lines.length]);
    lines.forEach(function(L){
      var a=L[0]+rot,ca=Math.cos(a*D2R),sa=Math.sin(a*D2R),x0=L[1]*s,y0=L[2]*s,dx=L[3]*s,dy=L[4]*s;
      g.push([53,a],[43,x0*cr-y0*sr],[44,x0*sr+y0*cr],[45,dx*ca-dy*sa],[46,dx*sa+dy*ca],[79,L[5].length]);
      L[5].forEach(function(d){g.push([49,d*s]);});
    });
  }
  var sd=loops[0].reduce(function(a,p){return {x:a.x+p.x/loops[0].length,y:a.y+p.y/loops[0].length};},{x:0,y:0});
  g.push([47,1],[98,1],[10,sd.x],[20,sd.y]);
  var r={n:'HATCH',sub:'AcDbHatch',g:g};
  if(+e.transp>0)r.com=[[440,0x02000000+Math.round(255*(1-e.transp/100))]];
  return r;
}};

function recsOf(e,ctx,depth){
  var fn=(D[e.type]&&D[e.type].toDXF)||(tdef(e.type)&&tdef(e.type).toDXF),out=[];
  if(fn){
    try{var r=fn(e,ctx);if(r)[].concat(r).forEach(function(x){out.push({rec:x,src:e});});}
    catch(err){ctx.skipMsg(e.type+' (erro: '+(err&&err.message||err)+')');}
    return out;
  }
  var def=tdef(e.type);
  if(def&&def.explode&&depth<3){
    try{
      var parts=def.explode(e)||[];
      parts.forEach(function(p){
        p=Object.assign({layer:e.layer,color:e.color,lw:e.lw,ltype:e.ltype,space:e.space},p);
        recsOf(p,ctx,depth+1).forEach(function(x){out.push(x);});
      });
      if(out.length){ctx.exploded[e.type]=(ctx.exploded[e.type]||0)+1;return out;}
    }catch(_){}
  }
  ctx.skipMsg(e.type);return out;
}
function wRec(w,x,owner,paper,H,ctx){
  var r=x.rec,s=x.src,ln=dxfName(s.layer||'0');
  ctx.layers[ln]=1;
  w.w(0,r.n);w.w(5,H());w.w(330,owner);w.w(100,'AcDbEntity');
  if(paper)w.w(67,1);
  w.w(8,enc(ln));
  if(s.ltype!=null&&!/^by/i.test(s.ltype)){var n=ltName(s.ltype);ctx.lts[n]=s.ltype;w.w(6,n);}
  if(s.color!=null){var cp=colorPair(s.color);w.w(62,cp.aci);if(cp.tc!=null)w.w(420,cp.tc);}
  if(s.lw!=null&&+s.lw>=0)w.w(370,lw100(+s.lw));
  (r.com||[]).forEach(function(p){w.w(p[0],p[1]);});
  w.w(100,r.sub);
  r.g.forEach(function(p){w.w(p[0],p[1]);});
}
var UNITS={in:1,ft:2,mm:4,cm:5,m:6,km:7};
function exportDXF(doc,opts){
  opts=opts||{};
  var hc=0x30;
  function H(){return (hc++).toString(16).toUpperCase();}
  var skipped={};
  var ctx={doc:doc,styles:{standard:1},layers:{'0':1},lts:{},exploded:{},enc:enc,fmt:fmt,
    skipMsg:function(t){skipped[t]=(skipped[t]||0)+1;}};
  var brModel=H(),brPaper=H(),bn=Object.keys(doc.blocks||{}).filter(function(n){return n.charAt(0)!=='*';}),blockBR={};
  bn.forEach(function(n){blockBR[n]=H();});
  var E=new Wr(),B=new Wr(),count=0;
  doc.entities.forEach(function(e){
    var paper=(e.space||'model')!=='model';
    recsOf(e,ctx,0).forEach(function(x){wRec(E,x,paper?brPaper:brModel,paper,H,ctx);count++;});
  });
  function blk(name,br,b){
    var base=(b&&b.base)||{x:0,y:0};
    B.w(0,'BLOCK');B.w(5,H());B.w(330,br);B.w(100,'AcDbEntity');B.w(8,'0');B.w(100,'AcDbBlockBegin');
    B.w(2,enc(name));B.w(70,0);B.w(10,base.x||0);B.w(20,base.y||0);B.w(30,0);B.w(3,enc(name));B.w(1,'');
    ((b&&b.ents)||[]).forEach(function(e){recsOf(e,ctx,0).forEach(function(x){wRec(B,x,br,false,H,ctx);});});
    B.w(0,'ENDBLK');B.w(5,H());B.w(330,br);B.w(100,'AcDbEntity');B.w(8,'0');B.w(100,'AcDbBlockEnd');
  }
  blk('*Model_Space',brModel,null);blk('*Paper_Space',brPaper,null);
  bn.forEach(function(n){blk(dxfName(n),blockBR[n],doc.blocks[n]);});

  /* extensão do desenho */
  var x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  doc.entities.forEach(function(e){
    var b=null;try{b=CAD.bboxOf&&CAD.bboxOf(e);}catch(_){}
    if(b&&isFinite(b.x1+b.y1+b.x2+b.y2)){x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);}
  });
  if(!isFinite(x1)){x1=0;y1=0;x2=10;y2=10;}
  var cx=(x1+x2)/2,cy=(y1+y2)/2,vh=Math.max(y2-y1,(x2-x1)/1.5,1e-3)*1.1;

  /* tabelas */
  var layers=doc.layers.slice(),have={};
  layers.forEach(function(l){have[dxfName(l.name)]=1;});
  Object.keys(ctx.layers).forEach(function(n){if(!have[n]){layers.push({name:n,color:'#000000',lw:0.25,ltype:'continuous',on:true});have[n]=1;}});
  layers.forEach(function(l){if(l.ltype)ctx.lts[ltName(l.ltype)]=l.ltype;});
  var T=new Wr(),stdStyleH=null;
  function tbl(name,cnt,extra){var h=H();T.w(0,'TABLE');T.w(2,name);T.w(5,h);T.w(330,'0');T.w(100,'AcDbSymbolTable');T.w(70,cnt);if(extra)extra();return h;}
  function endt(){T.w(0,'ENDTAB');}
  function rec(type,owner,sub,hcode){T.w(0,type);T.w(hcode||5,H());T.w(330,owner);T.w(100,'AcDbSymbolTableRecord');T.w(100,sub);}
  var th=tbl('VPORT',1);
  rec('VPORT',th,'AcDbViewportTableRecord');
  [[2,'*Active'],[70,0],[10,0],[20,0],[11,1],[21,1],[12,cx],[22,cy],[13,0],[23,0],[14,10],[24,10],[15,10],[25,10],[16,0],[26,0],[36,1],[17,0],[27,0],[37,0],
   [40,vh],[41,1.5],[42,50],[43,0],[44,0],[50,0],[51,0],[71,0],[72,100],[73,1],[74,3],[75,0],[76,0],[77,0],[78,0]].forEach(function(p){T.w(p[0],p[1]);});
  endt();
  var ltn={'ByBlock':1,'ByLayer':1,'Continuous':1},ltl=['ByBlock','ByLayer','Continuous'];
  Object.keys(ctx.lts).forEach(function(n){if(!ltn[n]){ltn[n]=1;ltl.push(n);}});
  th=tbl('LTYPE',ltl.length);
  ltl.forEach(function(n){
    var pat=(n==='ByBlock'||n==='ByLayer'||n==='Continuous')?null:ltPat(ctx.lts[n]||n);
    rec('LTYPE',th,'AcDbLinetypeTableRecord');
    T.w(2,n);T.w(70,0);T.w(3,n==='Continuous'?'Solid line':n);T.w(72,65);T.w(73,pat?pat.length:0);
    T.w(40,pat?pat.reduce(function(a,v){return a+Math.abs(v);},0):0);
    if(pat)pat.forEach(function(v){T.w(49,v);T.w(74,0);});
  });
  endt();
  th=tbl('LAYER',layers.length);
  layers.forEach(function(l){
    var cp=colorPair(l.color==null?'#000000':l.color);
    rec('LAYER',th,'AcDbLayerTableRecord');
    T.w(2,enc(dxfName(l.name)));T.w(70,(l.frozen?1:0)+(l.locked?4:0));T.w(62,(l.on===false?-1:1)*cp.aci);
    if(cp.tc!=null)T.w(420,cp.tc);
    T.w(6,ltName(l.ltype||'continuous'));T.w(290,l.plot===false?0:1);T.w(370,l.lw>=0?lw100(+l.lw||0.25):25);
    if(+l.transp>0)T.w(440,0x02000000+Math.round(255*(1-l.transp/100)));
  });
  endt();
  var sn=Object.keys(ctx.styles);
  th=tbl('STYLE',sn.length);
  sn.forEach(function(n){
    var key=null,def=doc.textstyles||{};Object.keys(def).forEach(function(k){if(dxfName(k)===n)key=k;});
    var s=(key&&def[key])||{},hh=H();
    T.w(0,'STYLE');T.w(5,hh);T.w(330,th);T.w(100,'AcDbSymbolTableRecord');T.w(100,'AcDbTextStyleTableRecord');
    T.w(2,enc(n));T.w(70,0);T.w(40,+s.h||0);T.w(41,1);T.w(50,0);T.w(71,0);T.w(42,2.5);T.w(3,enc(s.font||'txt'));T.w(4,'');
    if(n.toLowerCase()==='standard')stdStyleH=hh;
  });
  endt();
  tbl('VIEW',0);endt();tbl('UCS',0);endt();
  th=tbl('APPID',1);rec('APPID',th,'AcDbRegAppTableRecord');T.w(2,'ACAD');T.w(70,0);endt();
  th=tbl('DIMSTYLE',1,function(){T.w(100,'AcDbDimStyleTable');T.w(71,1);});
  rec('DIMSTYLE',th,'AcDbDimStyleTableRecord',105);
  [[2,'Standard'],[70,0],[40,1],[41,0.18],[42,0.0625],[43,0.38],[44,0.18],[140,0.18],[141,0.09],[147,0.09],[73,1],[74,1],[77,0],[78,8],[271,4],[272,4]].forEach(function(p){T.w(p[0],p[1]);});
  if(stdStyleH)T.w(340,stdStyleH);
  endt();
  th=tbl('BLOCK_RECORD',2+bn.length);
  [['*Model_Space',brModel],['*Paper_Space',brPaper]].concat(bn.map(function(n){return [dxfName(n),blockBR[n]];})).forEach(function(p){
    T.w(0,'BLOCK_RECORD');T.w(5,p[1]);T.w(330,th);T.w(100,'AcDbSymbolTableRecord');T.w(100,'AcDbBlockTableRecord');T.w(2,enc(p[0]));
  });
  endt();

  /* objetos mínimos */
  var O=new Wr(),root=H(),grp=H();
  O.w(0,'DICTIONARY');O.w(5,root);O.w(330,'0');O.w(100,'AcDbDictionary');O.w(281,1);O.w(3,'ACAD_GROUP');O.w(350,grp);
  O.w(0,'DICTIONARY');O.w(5,grp);O.w(102,'{ACAD_REACTORS');O.w(330,root);O.w(102,'}');O.w(330,root);O.w(100,'AcDbDictionary');O.w(281,1);

  var Hd=new Wr();
  Hd.w(0,'SECTION');Hd.w(2,'HEADER');Hd.w(9,'$ACADVER');Hd.w(1,'AC1015');Hd.w(9,'$HANDSEED');Hd.w(5,H());
  Hd.w(9,'$INSUNITS');Hd.w(70,UNITS[doc.units]||0);
  Hd.w(9,'$EXTMIN');Hd.w(10,x1);Hd.w(20,y1);Hd.w(30,0);Hd.w(9,'$EXTMAX');Hd.w(10,x2);Hd.w(20,y2);Hd.w(30,0);
  Hd.w(9,'$DWGCODEPAGE');Hd.w(3,'ANSI_1252');Hd.w(0,'ENDSEC');
  function sec(name,body){var s=new Wr();s.w(0,'SECTION');s.w(2,name);return s.a.concat(body||[],['0','ENDSEC']);}
  var all=Hd.a.concat(sec('CLASSES',[]),sec('TABLES',T.a),sec('BLOCKS',B.a),sec('ENTITIES',E.a),sec('OBJECTS',O.a),['0','EOF']);
  exportDXF.last={entities:count,skipped:skipped,exploded:ctx.exploded};
  return all.join('\r\n')+'\r\n';
}

/* =====================  IMPORTAÇÃO  ===================== */
function gv(r,c){for(var i=0;i<r.g.length;i++)if(r.g[i][0]===c)return r.g[i][1];return undefined;}
function gn(r,c,d){var v=parseFloat(gv(r,c));return isNaN(v)?d:v;}
function gall(r,c){return r.g.filter(function(p){return p[0]===c;}).map(function(p){return p[1];});}
function gp(r,c){return {x:gn(r,c,0),y:gn(r,c+10,0),z:gn(r,c+20,0)};}
function series(r,cx,cy,cz){
  var out=[],last=null;
  r.g.forEach(function(p){
    if(p[0]===cx){last={x:parseFloat(p[1]),y:0,z:0};out.push(last);}
    else if(last&&p[0]===cy)last.y=parseFloat(p[1]);else if(last&&p[0]===cz)last.z=parseFloat(p[1]);
  });
  return out;
}
function parseDXF(text){
  var L=String(text).replace(/^\uFEFF/,'').split(/\r\n|\n|\r/),S={HEADER:{},TABLES:[],BLOCKS:[],ENTITIES:[]},sec=null,cur=null,hvar=null,expect=false,i,c,v;
  for(i=0;i+1<L.length;i+=2){
    c=parseInt(L[i],10);v=L[i+1];
    if(isNaN(c))continue;
    if(c===0){
      var t=v.trim();
      if(t==='SECTION'){expect=true;cur=null;continue;}
      if(t==='ENDSEC'){sec=null;cur=null;hvar=null;continue;}
      if(t==='EOF')break;
      cur={t:t,g:[]};if(sec&&sec!=='HEADER'&&S[sec])S[sec].push(cur);
      continue;
    }
    if(expect&&c===2){sec=v.trim();expect=false;continue;}
    if(sec==='HEADER'){if(c===9){hvar=v.trim();S.HEADER[hvar]=[];}else if(hvar)S.HEADER[hvar].push([c,v]);continue;}
    if(cur)cur.g.push([c,v]);
  }
  return S;
}
function aggregate(list){
  var out=[],cur=null;
  list.forEach(function(r){
    if(r.t==='VERTEX'||r.t==='ATTRIB'){if(cur)(cur.subs=cur.subs||[]).push(r);return;}
    if(r.t==='SEQEND'){cur=null;return;}
    out.push(r);cur=(r.t==='POLYLINE'||r.t==='INSERT')?r:null;
  });
  return out;
}
function colorOf(r){
  var tc=gv(r,420);
  if(tc!==undefined){var n=parseInt(tc,10)||0;return toHex([(n>>16)&255,(n>>8)&255,n&255]);}
  var c=gn(r,62,256);
  if(c===256||c===0)return null;
  return toHex(pal()[Math.abs(c)]||pal()[7]);
}
function lwOf(r){var v=gn(r,370,-1);return v<0?null:v/100;}
function ltOf(r){var v=gv(r,6);return (v===undefined||/^by(layer|block)$/i.test(v.trim()))?null:dec(v.trim()).toLowerCase();}
function layerOf(r){return dec((gv(r,8)||'0').trim())||'0';}
function deBoor(knots,deg,P,t){
  var n=P.length-1,s,d=[],j,r;
  for(s=deg;s<n;s++)if(t<knots[s+1])break;
  for(j=0;j<=deg;j++)d.push({x:P[j+s-deg].x,y:P[j+s-deg].y,z:P[j+s-deg].z});
  for(r=1;r<=deg;r++)for(j=deg;j>=r;j--){
    var den=knots[j+1+s-r]-knots[j+s-deg],a=den?(t-knots[j+s-deg])/den:0;
    d[j]={x:(1-a)*d[j-1].x+a*d[j].x,y:(1-a)*d[j-1].y+a*d[j].y,z:(1-a)*d[j-1].z+a*d[j].z};
  }
  return d[deg];
}
function sweepOf(a1,a2,ccw){
  var s=ccw?(((a2-a1)%360)+360)%360:-((((a1-a2)%360)+360)%360);
  return s===0?(ccw?360:-360):s;
}
var FROM={};  /* nome DXF -> fn(r,ctx) */
FROM.LINE=function(r){return {type:'line',p1:gp(r,10),p2:gp(r,11)};};
FROM.CIRCLE=function(r){var c=gp(r,10);if(gn(r,230,1)<0){c.x=-c.x;c.z=-c.z;}return {type:'circle',c:c,r:gn(r,40,0)};};
FROM.ARC=function(r){
  var c=gp(r,10),a1=gn(r,50,0),a2=gn(r,51,360);
  if(gn(r,230,1)<0){c.x=-c.x;c.z=-c.z;var t=a1;a1=180-a2;a2=180-t;}
  return {type:'arc',c:c,r:gn(r,40,0),a1:a1,a2:a2};
};
FROM.POINT=function(r){return {type:'point',p:gp(r,10)};};
FROM.XLINE=function(r){return {type:'xline',p:gp(r,10),dir:gp(r,11)};};
FROM.RAY=function(r){return {type:'ray',p:gp(r,10),dir:gp(r,11)};};
FROM.ELLIPSE=function(r){return {type:'ellipse',c:gp(r,10),major:gp(r,11),ratio:gn(r,40,1),a1:gn(r,41,0)/D2R,a2:gn(r,42,2*Math.PI)/D2R};};
FROM.LWPOLYLINE=function(r){
  var pts=[],last=null,z=gn(r,38,0),fl=gn(r,70,0),flip=gn(r,230,1)<0;
  r.g.forEach(function(p){
    if(p[0]===10){last={x:parseFloat(p[1]),y:0,z:z,bulge:0};pts.push(last);}
    else if(p[0]===20&&last)last.y=parseFloat(p[1]);
    else if(p[0]===42&&last)last.bulge=parseFloat(p[1])||0;
  });
  if(flip)pts.forEach(function(p){p.x=-p.x;p.bulge=p.bulge?-p.bulge:0;p.z=p.z?-p.z:0;});
  return pts.length<2?null:{type:'pline',pts:pts,closed:!!(fl&1)};
};
FROM.POLYLINE=function(r){
  var fl=gn(r,70,0),pts=[];
  if(fl&(16|64))return null;
  (r.subs||[]).forEach(function(v){if(gn(v,70,0)&16)return;var p=gp(v,10);p.bulge=gn(v,42,0);pts.push(p);});
  return pts.length<2?null:{type:'pline',pts:pts,closed:!!(fl&1)};
};
FROM.SPLINE=function(r){
  var fit=series(r,11,21,31),closed=!!(gn(r,70,0)&1);
  if(fit.length<2){
    var cp=series(r,10,20,30),deg=gn(r,71,3),kn=gall(r,40).map(parseFloat);
    if(cp.length<2)return null;
    if(kn.length===cp.length+deg+1&&cp.length>deg){
      var N=Math.max(16,cp.length*6),t0=kn[deg],t1=kn[cp.length],k;
      fit=[];for(k=0;k<=N;k++)fit.push(deBoor(kn,deg,cp,t0+(t1-t0)*k/N));
    }else fit=cp;
  }
  return {type:'spline',fit:fit,closed:closed};
};
FROM.TEXT=function(r){
  var h72=gn(r,72,0),h73=gn(r,73,0),al=(h72||h73)&&h72!==3&&h72!==5&&gv(r,11)!==undefined;
  return {type:'text',p:al?gp(r,11):gp(r,10),h:gn(r,40,1),str:dec(gv(r,1)||''),rot:gn(r,50,0),style:dec((gv(r,7)||'Standard').trim()),just:justName(h72,h73)};
};
FROM.MTEXT=function(r){
  var s='';r.g.forEach(function(p){if(p[0]===3)s+=p[1];});s+=gv(r,1)||'';
  var rot=gv(r,11)!==undefined?Math.atan2(gn(r,21,0),gn(r,11,1))/D2R:gn(r,50,0)/D2R;
  return {type:'mtext',p:gp(r,10),w:gn(r,41,0),h:gn(r,40,1),str:dec(s).replace(/\\P/g,'\n'),rot:rot,style:dec((gv(r,7)||'Standard').trim())};
};
FROM.SOLID=function(r){
  var a=gp(r,10),b=gp(r,11),c=gp(r,12),d=gp(r,13),loop=(d.x===c.x&&d.y===c.y)?[a,b,c]:[a,b,d,c];
  return {type:'hatch',loops:[loop.map(function(p){return {x:p.x,y:p.y,z:0,bulge:0};})],pattern:'SOLID',scale:1,rot:0,solid:true,assoc:false,transp:0};
};
FROM.TRACE=FROM.SOLID;
FROM.INSERT=function(r){
  var at={};(r.subs||[]).forEach(function(a){at[dec(gv(a,2)||'')]=dec(gv(a,1)||'');});
  return {type:'insert',block:dec((gv(r,2)||'').trim()),p:gp(r,10),sx:gn(r,41,1),sy:gn(r,42,1),rot:gn(r,50,0),attrs:at};
};
FROM.HATCH=function(r){
  var g=r.g,i=0,k,e,loops=[];
  function take(stop){var o={};while(i<g.length&&stop.indexOf(g[i][0])<0){(o[g[i][0]]=o[g[i][0]]||[]).push(parseFloat(g[i][1]));i++;}return o;}
  while(i<g.length&&g[i][0]!==91)i++;
  var nl=i<g.length?parseInt(g[i][1],10):0;i++;
  for(k=0;k<nl;k++){
    while(i<g.length&&g[i][0]!==92)i++;
    if(i>=g.length)break;
    var fl=parseInt(g[i][1],10),pts=[],bad=false;i++;
    if(fl&2){
      while(i<g.length&&g[i][0]!==93)i++;
      var nv=parseInt(g[i][1],10),cnt=0;i++;
      while(i<g.length&&cnt<nv){
        if(g[i][0]===10){
          var p={x:parseFloat(g[i][1]),y:0,z:0,bulge:0};i++;
          if(g[i]&&g[i][0]===20){p.y=parseFloat(g[i][1]);i++;}
          if(g[i]&&g[i][0]===42){p.bulge=parseFloat(g[i][1])||0;i++;}
          pts.push(p);cnt++;
        }else i++;
      }
    }else{
      while(i<g.length&&g[i][0]!==93)i++;
      var ne=parseInt(g[i][1],10);i++;
      for(e=0;e<ne;e++){
        while(i<g.length&&g[i][0]!==72)i++;
        if(i>=g.length)break;
        var et=parseInt(g[i][1],10);i++;
        var o=take([72,97,92,75]),ccw=o[73]?o[73][0]!==0:true;
        if(et===1)pts.push({x:o[10][0],y:o[20][0],z:0,bulge:0});
        else if(et===2){
          var cx=o[10][0],cy=o[20][0],rr=o[40][0],a1=o[50][0],a2=o[51][0],sw=sweepOf(a1,a2,ccw);
          if(Math.abs(sw)>=359.99){
            var sg=sw>0?1:-1;
            pts.push({x:cx+rr*Math.cos(a1*D2R),y:cy+rr*Math.sin(a1*D2R),z:0,bulge:sg},{x:cx+rr*Math.cos((a1+180*sg)*D2R),y:cy+rr*Math.sin((a1+180*sg)*D2R),z:0,bulge:sg});
          }else pts.push({x:cx+rr*Math.cos(a1*D2R),y:cy+rr*Math.sin(a1*D2R),z:0,bulge:Math.tan(sw*D2R/4)});
        }else if(et===3){
          var ex=o[10][0],ey=o[20][0],mx=o[11][0],my=o[21][0],ra=o[40][0],b1=o[50][0],b2=o[51][0],sw2=sweepOf(b1,b2,ccw),n2=Math.max(16,Math.ceil(Math.abs(sw2)/5)),q;
          for(q=0;q<(Math.abs(sw2)>=359.99?n2:n2+1);q++){
            var t=(b1+sw2*q/n2)*D2R;
            pts.push({x:ex+mx*Math.cos(t)-my*ra*Math.sin(t),y:ey+my*Math.cos(t)+mx*ra*Math.sin(t),z:0,bulge:0});
          }
        }else bad=true;
      }
    }
    if(!bad&&pts.length>1)loops.push(pts);
  }
  if(!loops.length)return null;
  var t440=gn(r,440,0);
  return {type:'hatch',loops:loops,pattern:dec(gv(r,2)||'SOLID'),scale:gn(r,41,1),rot:gn(r,52,0),solid:gn(r,70,0)===1,assoc:false,transp:alphaToTransp(t440)};
};
FROM.DIMENSION=function(r,ctx){
  var b=ctx.blocks[dec((gv(r,2)||'').trim())];
  if(!b){ctx.skip.DIMENSION=(ctx.skip.DIMENSION||0)+1;return null;}
  ctx.dims++;
  var out=[],ly=layerOf(r);
  aggregate(b.recs).forEach(function(rr){conv(rr,ctx).forEach(function(e){if(e.layer==='0')e.layer=ly;out.push(e);});});
  return out;
};
function common(r,e,ctx){
  if(e.layer===undefined)e.layer=layerOf(r);
  if(e.color===undefined)e.color=colorOf(r);
  if(e.lw===undefined)e.lw=lwOf(r);
  if(e.ltype===undefined)e.ltype=ltOf(r);
  if(e.space===undefined&&!ctx.inBlock)e.space='model';
}
function conv(r,ctx){
  var f=FROM[r.t],out;
  if(!f){ctx.skip[r.t]=(ctx.skip[r.t]||0)+1;return [];}
  try{out=f(r,ctx);}catch(err){ctx.skip[r.t+' (erro)']=(ctx.skip[r.t+' (erro)']||0)+1;return [];}
  if(!out)return [];
  out=[].concat(out);
  out.forEach(function(e){common(r,e,ctx);});
  return out;
}
function finalize(doc){
  if(CAD.files&&CAD.files.normalize)return CAD.files.normalize(doc);
  var seen={},n=0;
  if(!doc.layers.some(function(l){return l.name==='0';}))doc.layers.unshift({name:'0',color:'#000000',lw:0.25,ltype:'continuous',on:true,frozen:false,locked:false,transp:0,plot:true});
  doc.entities.forEach(function(e){
    e.id=++n;
    if(!doc.layers.some(function(l){return l.name===e.layer;}))doc.layers.push({name:e.layer,color:'#000000',lw:0.25,ltype:'continuous',on:true,frozen:false,locked:false,transp:0,plot:true});
  });
  return doc;
}
var DXFUNITS={1:'in',2:'ft',4:'mm',5:'cm',6:'m',7:'km'};
function importDXF(text){
  var S=parseDXF(text),ctx={skip:{},blocks:{},dims:0,paper:0,inBlock:false};
  if(!S.ENTITIES.length&&!S.BLOCKS.length&&!S.TABLES.length)throw new Error('Arquivo DXF inválido ou vazio.');
  var ins=S.HEADER.$INSUNITS,units=(ins&&DXFUNITS[parseInt(ins[0][1],10)])||'m';
  var doc={version:1,units:units,layers:[],entities:[],blocks:{},dimstyles:{},textstyles:{},layouts:[],current:{layer:'0',color:null,lw:null,ltype:null}};
  var cb=null;
  S.BLOCKS.forEach(function(r){
    if(r.t==='BLOCK'){cb={name:dec((gv(r,2)||'').trim()),base:gp(r,10),recs:[]};ctx.blocks[cb.name]=cb;}
    else if(r.t==='ENDBLK')cb=null;
    else if(cb)cb.recs.push(r);
  });
  S.TABLES.forEach(function(r){
    if(r.t!=='LAYER')return;
    var name=dec((gv(r,2)||'').trim());if(!name||name.indexOf('|')>=0)return;
    var fl=gn(r,70,0),c=gn(r,62,7),col=colorOf({g:[[420,gv(r,420)],[62,String(Math.abs(c))]].filter(function(p){return p[1]!==undefined;})}),lw=gn(r,370,-3);
    doc.layers.push({name:name,color:col||'#000000',lw:lw<0?0.25:lw/100,ltype:ltOf(r)||'continuous',on:c>=0,frozen:!!(fl&1),locked:!!(fl&4),transp:alphaToTransp(gn(r,440,0)),plot:gn(r,290,1)!==0});
  });
  aggregate(S.ENTITIES).forEach(function(r){
    if(gn(r,67,0)===1){ctx.paper++;return;}
    conv(r,ctx).forEach(function(e){doc.entities.push(e);});
  });
  ctx.inBlock=true;
  Object.keys(ctx.blocks).forEach(function(n){
    if(/^\*(model_space|paper_space|d\d*)/i.test(n))return;
    var b=ctx.blocks[n],ents=[];
    aggregate(b.recs).forEach(function(r){conv(r,ctx).forEach(function(e){ents.push(e);});});
    doc.blocks[n]={base:{x:b.base.x,y:b.base.y,z:0},ents:ents};
  });
  doc=finalize(doc);
  return {doc:doc,report:{entities:doc.entities.length,skipped:ctx.skip,dims:ctx.dims,paper:ctx.paper,blocks:Object.keys(doc.blocks).length}};
}
function reportIn(rp){
  var sk=Object.keys(rp.skipped).map(function(k){return k+' \u00D7'+rp.skipped[k];}).join(', ');
  say('DXF: '+rp.entities+' entidade(s), '+rp.blocks+' bloco(s)'+(rp.dims?', '+rp.dims+' cota(s) convertida(s) em geometria':'')+
    (rp.paper?'; espaço papel ignorado ('+rp.paper+')':'')+(sk?'; ignorados: '+sk:'')+'.');
}
function reportOut(){
  var l=exportDXF.last||{},sk=Object.keys(l.skipped||{}).map(function(k){return k+' \u00D7'+l.skipped[k];}).join(', '),
      ex=Object.keys(l.exploded||{}).map(function(k){return k+' \u00D7'+l.exploded[k];}).join(', ');
  say('DXF: '+l.entities+' entidade(s) gravada(s)'+(ex?'; explodidas em geometria: '+ex:'')+(sk?'; sem conversor (ignoradas): '+sk:'')+'.');
}

/* =====================  integração  ===================== */
CAD.fileio.register({ext:'dxf',label:'AutoCAD DXF R2000 (.dxf)',
  import:function(text){var r=importDXF(text);reportIn(r.report);return r.doc;},
  export:function(doc){var s=exportDXF(doc);reportOut();return new Blob([s],{type:'application/dxf'});}});

var MAP={line:'LINE',circle:'CIRCLE',arc:'ARC',pline:'LWPOLYLINE',ellipse:'ELLIPSE',spline:'SPLINE',point:'POINT',text:'TEXT',mtext:'MTEXT',hatch:'HATCH',insert:'INSERT',xline:'XLINE',ray:'RAY'};
Object.keys(MAP).forEach(function(t){try{CAD.types.extend(t,{toDXF:D[t].toDXF,fromDXF:FROM[MAP[t]]});}catch(_){}});

function download(blob,name){
  var a=document.createElement('a'),u=URL.createObjectURL(blob);
  a.href=u;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(u);a.remove();},4000);
}
function pickFile(acc){
  return new Promise(function(res,rej){
    var i=document.createElement('input'),done=false;
    i.type='file';i.accept=acc;i.style.display='none';
    function end(f){if(done)return;done=true;i.remove();f?res(f):rej(CAD.Cancel||new Error('Cancelado'));}
    i.onchange=function(){end(i.files&&i.files[0]);};
    i.addEventListener('cancel',function(){end(null);});
    window.addEventListener('focus',function(){setTimeout(function(){if(!(i.files&&i.files[0]))end(null);},700);},{once:true});
    document.body.appendChild(i);i.click();
  });
}
function decodeBuf(buf){
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch(_){}
  var s0=new TextDecoder('windows-1252').decode(buf),m=/\$DWGCODEPAGE\s+3\s+ANSI_(\d{3,4})/i.exec(s0);
  try{return new TextDecoder(m?'windows-'+m[1]:'windows-1252').decode(buf);}catch(_){return s0;}
}
function applyDXF(d){
  var ents=d.entities.map(function(e){var c=Object.assign({},e);delete c.id;return c;}),
      newL=d.layers.filter(function(l){return !CAD.doc.layers.some(function(x){return x.name===l.name;});}),
      newB=Object.keys(d.blocks).filter(function(n){return !(n in CAD.doc.blocks);});
  CAD.history.begin('DXFIMPORT');
  try{
    if(newL.length||newB.length)CAD.history.run({name:'DXFIMPORT tabelas',
      do:function(){newL.forEach(function(l){CAD.doc.layers.push(l);});newB.forEach(function(n){CAD.doc.blocks[n]=d.blocks[n];});},
      undo:function(){newL.forEach(function(l){var i=CAD.doc.layers.indexOf(l);if(i>=0)CAD.doc.layers.splice(i,1);});newB.forEach(function(n){delete CAD.doc.blocks[n];});}});
    if(ents.length)CAD.ents.add(ents);
  }finally{CAD.history.end();}
  return ents.length;
}
function reg(name,alias,fn){CAD.cmd.register({name:name,alias:alias,raw:true,run:guard(fn)});}
reg('DXFEXPORT',['DXFOUT'],async function(){
  var name=((CAD.files&&CAD.files.state&&CAD.files.state.name)||'desenho').replace(/[\\\/:*?"<>|]+/g,'_')+'.dxf',s=exportDXF(CAD.doc),blob=new Blob([s],{type:'application/dxf'}),h=null;
  if(window.showSaveFilePicker){
    try{h=await window.showSaveFilePicker({suggestedName:name,types:[{description:'AutoCAD DXF',accept:{'text/plain':['.dxf']}}]});}
    catch(e){if(e&&e.name==='AbortError')throw (CAD.Cancel||e);}
  }
  if(h){var w=await h.createWritable();await w.write(blob);await w.close();}else download(blob,name);
  reportOut();
});
reg('DXFIMPORT',['DXFIN'],async function(){
  var f=await pickFile('.dxf'),r=importDXF(decodeBuf(await f.arrayBuffer())),n=applyDXF(r.doc);
  try{var b=CAD.view.extents();if(b&&isFinite(b.x1+b.y1+b.x2+b.y2))CAD.view.fit(b.x1,b.y1,b.x2,b.y2,0.05);}catch(_){}
  reportIn(r.report);say('DXF mesclado ao desenho atual ('+n+' entidade(s)).');
});
try{
  CAD.ui.menu.add('Arquivo','Exportar DXF','DXFEXPORT');
  CAD.ui.menu.add('Arquivo','Importar DXF (mesclar)','DXFIMPORT');
}catch(_){}

CAD.dxf={export:exportDXF,import:importDXF,parse:parseDXF,gv:gv,gn:gn,gp:gp,gall:gall,enc:enc,dec:dec,
  register:function(dxfName,fn){FROM[String(dxfName).toUpperCase()]=fn;},
  registerOut:function(type,toDXF){D[type]={toDXF:toDXF};},
  color:{pair:colorPair,hex:toHex,aci:function(i){return toHex(pal()[i]||pal()[7]);}},apply:applyDXF};

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p12=function(){
  var ok=0,fail=[];
  function A(c,m){if(c)ok++;else{fail.push(m);console.error('FAIL p12:',m);}}
  function near(a,b){return Math.abs(a-b)<1e-6;}
  function dx(a){var s=[];for(var i=0;i<a.length;i+=2)s.push(String(a[i]),String(a[i+1]));return s.join('\r\n')+'\r\n';}
  function P(x,y){return {x:x,y:y,z:0};}
  var big=[];for(var q=0;q<7;q++)big.push('linha longa ');
  var doc=finalize({version:1,units:'m',dimstyles:{},textstyles:{},layouts:[],current:{layer:'0',color:null,lw:null,ltype:null},
    layers:[{name:'0',color:'#000000',lw:0.25,ltype:'continuous',on:true,frozen:false,locked:false,transp:0,plot:true},
            {name:'Paredes',color:'#ff8000',lw:0.5,ltype:'dashed',on:true,frozen:true,locked:true,transp:0,plot:false}],
    blocks:{B:{base:P(1,1),ents:[{type:'line',layer:'0',color:null,lw:null,ltype:null,p1:P(0,0),p2:P(2,0)}]}},
    entities:[
      {type:'line',layer:'Paredes',color:'#00ff00',lw:0.35,ltype:null,p1:P(0,0),p2:P(10,5)},
      {type:'circle',layer:'0',c:P(3,3),r:2},
      {type:'arc',layer:'0',c:P(0,0),r:4,a1:10,a2:100},
      {type:'pline',layer:'0',closed:true,pts:[{x:0,y:0,z:0,bulge:0.5},{x:5,y:0,z:0,bulge:0},{x:5,y:5,z:0,bulge:0}]},
      {type:'text',layer:'0',p:P(1,1),h:0.5,str:'\u00D8 25 \u00B1 2',rot:30,style:'Standard',just:'tc'},
      {type:'mtext',layer:'0',p:P(2,2),w:4,h:0.3,str:'a\nb '+big.join(''),rot:0,style:'Standard'},
      {type:'ellipse',layer:'0',c:P(0,0),major:P(4,0),ratio:0.5,a1:0,a2:360},
      {type:'spline',layer:'0',closed:false,fit:[P(0,0),P(1,2),P(2,0),P(3,2)]},
      {type:'point',layer:'0',p:P(7,7)},
      {type:'hatch',layer:'0',pattern:'SOLID',solid:true,scale:1,rot:0,transp:50,assoc:false,loops:[[{x:0,y:0,z:0,bulge:0},{x:4,y:0,z:0,bulge:0},{x:4,y:4,z:0,bulge:0},{x:0,y:4,z:0,bulge:0}],[{x:1,y:1,z:0,bulge:0},{x:2,y:1,z:0,bulge:0},{x:2,y:2,z:0,bulge:0},{x:1,y:2,z:0,bulge:0}]]},
      {type:'hatch',layer:'0',pattern:'ANSI31',solid:false,scale:2,rot:30,transp:0,assoc:false,loops:[[{x:0,y:0,z:0,bulge:0},{x:4,y:0,z:0,bulge:0},{x:4,y:4,z:0,bulge:0}]]},
      {type:'insert',layer:'0',block:'B',p:P(20,20),sx:2,sy:2,rot:90,attrs:{}}]});
  var out=exportDXF(doc),pairs=out.split('\r\n'),hs={},dup=0,i;
  A(out.indexOf('0\r\nSECTION')===0&&/AC1015/.test(out)&&/0\r\nEOF\r\n$/.test(out),'estrutura R2000 (SECTION/AC1015/EOF)');
  for(i=0;i+1<pairs.length;i+=2)if(pairs[i].trim()==='5'||pairs[i].trim()==='105'){if(hs[pairs[i+1]])dup++;hs[pairs[i+1]]=1;}
  A(dup===0,'handles únicos');
  A(/\\U\+00D8/.test(out)&&!/[^\x00-\x7f]/.test(out),'texto exportado só em ASCII com \\U+');
  A(exportDXF.last.entities===doc.entities.length,'todas as entidades convertidas');
  var r=importDXF(out),d=r.doc,by={};
  d.entities.forEach(function(e){(by[e.type]=by[e.type]||[]).push(e);});
  A(by.line.length===1&&by.circle.length===1&&by.arc.length===1&&by.pline.length===1&&by.text.length===1&&by.mtext.length===1&&by.ellipse.length===1&&by.spline.length===1&&by.point.length===1&&by.hatch.length===2&&by.insert.length===1,'roundtrip: contagem por tipo');
  var ln=by.line[0];
  A(near(ln.p2.x,10)&&near(ln.p2.y,5)&&ln.color==='#00ff00'&&near(ln.lw,0.35)&&ln.layer==='Paredes','roundtrip: linha (cor, espessura, layer)');
  A(near(by.arc[0].a1,10)&&near(by.arc[0].a2,100)&&near(by.arc[0].r,4),'roundtrip: arco em graus');
  A(by.pline[0].closed&&near(by.pline[0].pts[0].bulge,0.5)&&by.pline[0].pts.length===3,'roundtrip: lwpolyline com bulge');
  A(by.text[0].str==='\u00D8 25 \u00B1 2'&&by.text[0].just==='tc'&&near(by.text[0].rot,30),'roundtrip: texto, unicode e justificação');
  A(by.mtext[0].str.indexOf('a\nb ')===0&&by.mtext[0].str.length===doc.entities[5].str.length,'roundtrip: mtext em pedaços de 250 e quebra de linha');
  A(near(by.ellipse[0].ratio,0.5)&&near(by.ellipse[0].a2,360)&&near(by.ellipse[0].major.x,4),'roundtrip: elipse');
  A(by.spline[0].fit.length===4&&near(by.spline[0].fit[1].y,2),'roundtrip: spline por pontos de ajuste');
  var hs1=by.hatch[0],hs2=by.hatch[1];
  A(hs1.solid&&hs1.loops.length===2&&hs1.loops[0].length===4&&hs1.transp===50,'roundtrip: hachura sólida com ilha e transparência');
  A(hs2.pattern==='ANSI31'&&near(hs2.scale,2)&&near(hs2.rot,30)&&!hs2.solid,'roundtrip: hachura de padrão');
  var ins=by.insert[0];
  A(ins.block==='B'&&near(ins.sx,2)&&near(ins.rot,90)&&d.blocks.B&&near(d.blocks.B.base.x,1)&&d.blocks.B.ents.length===1,'roundtrip: bloco e insert');
  var lp=d.layers.filter(function(l){return l.name==='Paredes';})[0];
  A(lp&&lp.color==='#ff8000'&&lp.frozen&&lp.locked&&near(lp.lw,0.5)&&lp.ltype==='dashed'&&lp.plot===false,'roundtrip: propriedades do layer (truecolor, flags, lw, ltype)');
  A(d.units==='m','unidade preservada');
  /* paleta ACI */
  A(toHex(pal()[1])==='#ff0000'&&toHex(pal()[30])==='#ff7f00'&&toHex(pal()[250])==='#333333','paleta ACI 1/30/250');
  A(colorPair('#000000').aci===7&&colorPair('#ff0000').aci===1&&colorPair('#ff0000').tc===undefined&&colorPair('#123456').tc===0x123456,'colorPair');
  A(lw100(0.3)===30&&lw100(0.26)===25&&lw100(0)===0,'snap de espessura');
  /* POLYLINE antigo */
  var o1=importDXF(dx([0,'SECTION',2,'ENTITIES',0,'POLYLINE',8,'L1',66,1,70,1,0,'VERTEX',8,'L1',10,0,20,0,42,0.5,0,'VERTEX',10,10,20,0,0,'VERTEX',10,10,20,10,0,'SEQEND',0,'ENDSEC',0,'EOF'])).doc;
  A(o1.entities.length===1&&o1.entities[0].closed&&o1.entities[0].pts.length===3&&near(o1.entities[0].pts[0].bulge,0.5)&&o1.layers.some(function(l){return l.name==='L1';}),'POLYLINE+VERTEX (layer ausente criada)');
  /* HATCH com arestas */
  var o2=importDXF(dx([0,'SECTION',2,'ENTITIES',0,'HATCH',8,'0',2,'ANSI31',70,0,71,0,91,1,92,1,93,4,
    72,1,10,0,20,0,11,10,21,0,72,1,10,10,20,0,11,10,21,10,72,2,10,5,20,10,40,5,50,0,51,180,73,1,72,1,10,0,20,10,11,0,21,0,97,0,75,0,76,1,52,0,41,1,0,'ENDSEC',0,'EOF'])).doc;
  var lo=o2.entities[0]&&o2.entities[0].loops[0];
  A(lo&&lo.length===4&&near(lo[2].bulge,1)&&near(lo[2].x,10)&&near(lo[2].y,10),'HATCH com arestas (linha+arco) vira loop com bulge');
  /* DIMENSION via bloco anônimo */
  var o3=importDXF(dx([0,'SECTION',2,'BLOCKS',0,'BLOCK',2,'*D1',70,1,10,0,20,0,0,'LINE',8,'0',10,0,20,0,11,5,21,0,0,'TEXT',8,'0',10,2,20,1,40,0.2,1,'5.00',0,'ENDBLK',0,'ENDSEC',
    0,'SECTION',2,'ENTITIES',0,'DIMENSION',8,'COTAS',2,'*D1',70,0,0,'ENDSEC',0,'EOF']));
  A(o3.doc.entities.length===2&&o3.doc.entities.every(function(e){return e.layer==='COTAS';})&&o3.report.dims===1&&!o3.doc.blocks['*D1'],'DIMENSION vira geometria da camada da cota');
  /* SPLINE NURBS (controle+nós) */
  var o4=importDXF(dx([0,'SECTION',2,'ENTITIES',0,'SPLINE',8,'0',70,8,71,2,73,3,40,0,40,0,40,0,40,1,40,1,40,1,10,0,20,0,10,5,20,10,10,10,20,0,0,'ENDSEC',0,'EOF'])).doc;
  A(o4.entities.length===1&&o4.entities[0].fit.length>10&&near(o4.entities[0].fit[0].x,0)&&near(o4.entities[0].fit.slice(-1)[0].x,10),'SPLINE B-spline amostrada');
  /* OCS espelhado e tolerância a LF */
  var o5=importDXF(['0','SECTION','2','ENTITIES','0','ARC','8','0','10','5','20','0','40','2','50','0','51','90','230','-1','0','ENDSEC','0','EOF'].join('\n')).doc;
  A(o5.entities[0]&&near(o5.entities[0].c.x,-5)&&near(o5.entities[0].a1,90)&&near(o5.entities[0].a2,180),'ARC com normal -Z (OCS) e arquivo com LF');
  var thr=false;try{importDXF('lixo');}catch(e){thr=true;}A(thr,'arquivo inválido lança erro');
  console.log('p12: '+ok+' ok, '+fail.length+' falha(s)');
  return {ok:ok,fail:fail};
};
})(window.CAD=window.CAD||{});
/* ==== END:12 ==== */
