/* ==== PART:7 ==== */
(function(CAD){
'use strict';
const H=CAD.hatch=CAD.hatch||{};
const PI=Math.PI,TAU=PI*2,D2R=PI/180,R2D=180/PI;
const cur=v=>typeof v==='function'?v():v;
const nz=(v,d)=>(typeof v==='number'&&isFinite(v))?v:d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const xy=r=>Array.isArray(r)?{x:r[0],y:r[1]}:r;
const say=m=>{try{CAD.cmd&&CAD.cmd.print&&CAD.cmd.print(m);}catch(_){}};

/* ================= 1. PADRÕES ================= */
// linha: "ang,x0,y0,dx,dy[,traço,-vazio,...]" (unidades de padrão = mm; 0 = ponto)
const PAT=Object.create(null);
function defPat(name,cat,desc,src){
  PAT[name]={name,cat,desc,solid:false,lines:src.split(';').map(s=>s.trim()).filter(Boolean).map(s=>{
    const n=s.split(',').map(Number);return{a:n[0],x:n[1],y:n[2],dx:n[3],dy:n[4],d:n.slice(5)};})};
}
function copyPat(from,name,cat,desc){const p=PAT[from];PAT[name]={name,cat,desc,solid:false,lines:p.lines.map(l=>Object.assign({},l,{d:l.d.slice()}))};}
PAT.SOLID={name:'SOLID',cat:'Solid',desc:'Preenchimento sólido',solid:true,lines:[]};
PAT.USER={name:'USER',cat:'Usuário',desc:'Linhas definidas pelo usuário (ângulo, espaçamento, dupla)',solid:false,user:true,lines:[]};
defPat('ANSI31','ANSI','Ferro / alvenaria (45°)','45,0,0,0,3.175');
defPat('ANSI32','ANSI','Aço','45,0,0,0,9.525;45,4.490128054,0,0,9.525');
defPat('ANSI33','ANSI','Bronze / latão','45,0,0,0,6.35;45,4.490128054,0,0,6.35,3.175,-1.5875');
defPat('ANSI34','ANSI','Plástico / borracha','45,0,0,0,19.05;45,4.490128054,0,0,19.05;45,8.980256108,0,0,19.05;45,13.470384162,0,0,19.05');
defPat('ANSI35','ANSI','Material refratário','45,0,0,0,6.35;45,4.490128054,0,0,6.35,7.9375,-1.5875,0,-1.5875');
defPat('ANSI36','ANSI','Mármore / ardósia','45,0,0,5.55625,3.175,7.9375,-1.5875,0,-1.5875');
defPat('ANSI37','ANSI','Chumbo / zinco (cruzado)','45,0,0,0,3.175;135,0,0,0,3.175');
defPat('ANSI38','ANSI','Alumínio','45,0,0,0,3.175;135,0,0,6.35,3.175,7.9375,-4.7625');
const ISO={'02':'12,-3','03':'12,-18','04':'24,-3,0,-3','05':'24,-3,0,-3,0,-3','06':'24,-3,0,-3,0,-3,0,-3','07':'0,-3',
 '08':'24,-3,6,-3','09':'24,-3,6,-3,6,-3','10':'12,-3,0,-3','11':'12,-3,12,-3,0,-3','12':'12,-3,0,-3,0,-3',
 '13':'12,-3,12,-3,0,-3,0,-3','14':'12,-3,0,-3,0,-3,0,-3','15':'12,-3,12,-3,0,-3,0,-3,0,-3'};
Object.keys(ISO).forEach(k=>defPat('ISO'+k+'W100','ISO','ISO '+k+' (aprox.)','0,0,0,0,5,'+ISO[k]));
defPat('AR-B816','Architectural','Tijolo 8x16','0,0,0,0,203.2;90,0,0,203.2,203.2,203.2,-203.2');
defPat('AR-B88','Architectural','Tijolo 8x8','0,0,0,0,101.6;90,0,0,101.6,101.6,101.6,-101.6');
defPat('AR-CONC','Architectural','Concreto (aprox.)','50,0,0,37,-55,0,-90;355,0,0,41,-63,0,-110;100.4,0,0,29,-71,0,-70');
defPat('AR-SAND','Architectural','Areia (aprox.)','37.5,0,0,0.4,2.7,0,-7.1;115,0,0,0.7,3.3,0,-9;5,0,0,1.1,2.9,0,-8.2');
defPat('LINE','Outros','Linhas horizontais','0,0,0,0,3.175');
defPat('NET','Outros','Grade ortogonal','0,0,0,0,3.175;90,0,0,0,3.175');
defPat('NET3','Outros','Grade 60°','0,0,0,0,3.175;60,0,0,0,3.175;120,0,0,0,3.175');
defPat('DOTS','Outros','Pontos','0,0,0,0.79375,1.5875,0,-1.5875');
defPat('DASH','Outros','Tracejado','0,0,0,3.175,3.175,3.175,-3.175');
defPat('CROSS','Outros','Cruzes','0,0,0,6.35,6.35,3.175,-9.525;90,1.5875,-1.5875,6.35,6.35,3.175,-9.525');
defPat('STEEL','Outros','Aço (linhas duplas)','45,0,0,0,3.175;45,0,1.5875,0,3.175');
defPat('EARTH','Outros','Terra (aprox.)','0,0,0,6.35,6.35,6.35,-6.35;0,0,2.38125,6.35,6.35,6.35,-6.35;0,0,4.7625,6.35,6.35,6.35,-6.35;90,0.79375,5.55625,6.35,6.35,5.55625,-7.14375;90,2.38125,5.55625,6.35,6.35,5.55625,-7.14375;90,3.96875,5.55625,6.35,6.35,5.55625,-7.14375');
copyPat('AR-CONC','CONCRETO','Civil','Concreto');
copyPat('AR-SAND','AREIA','Civil','Areia');
copyPat('AR-B816','TIJOLO','Civil','Alvenaria de tijolo');
copyPat('EARTH','TERRA','Civil','Terra / aterro');
H.patterns=PAT;
H.listPatterns=function(cat){return Object.keys(PAT).filter(k=>!cat||PAT[k].cat===cat);};
H.registerPattern=function(name,cat,desc,src){defPat(String(name).toUpperCase(),cat||'Custom',desc||'',src);};

H.state={pattern:'ANSI31',scale:50,rot:0,transp:0,style:'normal',assoc:true,origin:{x:0,y:0},
  uspace:null,udouble:false,toBack:true,startMode:'pick',gap:0};

const UF={mm:1,cm:.1,m:.001,km:1e-6,in:1/25.4,ft:1/304.8,pol:1/25.4};
function unitFactor(){const u=(CAD.doc&&CAD.doc.units)||'m';return UF[u]!=null?UF[u]:.001;}
function userSpacing(){return H.state.uspace>0?H.state.uspace:3.175*50*unitFactor();}
const isSolid=e=>!!e.solid||String(e.pattern||'').toUpperCase()==='SOLID';

// famílias de linhas efetivas (mundo)
function families(e,o){
  o=o||{};const name=String(e.pattern||'ANSI31').toUpperCase();let defs,k;
  if(name==='USER'){const sp=e.uspace>0?e.uspace:userSpacing();defs=[{a:0,x:0,y:0,dx:0,dy:sp,d:[]}];
    if(e.udouble)defs.push({a:90,x:0,y:0,dx:0,dy:sp,d:[]});k=1;}
  else{const p=PAT[name];if(!p||p.solid)return[];defs=p.lines;k=(e.scale>0?e.scale:1)*(o.uf!=null?o.uf:unitFactor());}
  const rot=(e.rot||0)*D2R,cr=Math.cos(rot),sr=Math.sin(rot),org=e.origin||{x:0,y:0};
  return defs.map(l=>{const lx=l.x*k,ly=l.y*k;
    return{ox:org.x+lx*cr-ly*sr,oy:org.y+lx*sr+ly*cr,ang:rot+l.a*D2R,dx:l.dx*k,dy:l.dy*k,d:l.d.map(v=>v*k)};});
}
H.families=families;

/* ================= 2. GEOMETRIA DE LOOPS ================= */
// loop = {pts:[{x,y,z,bulge}], src:[ids]}  (fechado implícito; bulge do vértice i vale para o segmento i→i+1)
function arcOfBulge(p,q,b){
  const dx=q.x-p.x,dy=q.y-p.y,c=Math.hypot(dx,dy);if(c<1e-12||!b)return null;
  const off=(c/2)*(1-b*b)/(2*b),mx=(p.x+q.x)/2,my=(p.y+q.y)/2;
  const cx=mx+(-dy/c)*off,cy=my+(dx/c)*off;
  return{cx,cy,r:(c/2)*(1+b*b)/(2*Math.abs(b)),a0:Math.atan2(p.y-cy,p.x-cx),sw:4*Math.atan(b)};
}
function flatLoop(pts,step){
  const out=[],n=pts.length;
  for(let i=0;i<n;i++){const p=pts[i],q=pts[(i+1)%n];out.push({x:p.x,y:p.y});
    const b=p.bulge||0;if(b){const A=arcOfBulge(p,q,b);if(A){const st=typeof step==='function'?step(A.r):step;
      const m=Math.max(2,Math.ceil(Math.abs(A.sw)/st));
      for(let j=1;j<m;j++){const a=A.a0+A.sw*j/m;out.push({x:A.cx+A.r*Math.cos(a),y:A.cy+A.r*Math.sin(a)});}}}}
  return out;
}
function polyArea(P){let s=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];s+=a.x*b.y-b.x*a.y;}return s/2;}
function loopArea(l){ // exato, com sinal (CCW +)
  const P=l.pts;let s=polyArea(P);
  for(let i=0;i<P.length;i++){const b=P[i].bulge||0;if(b){const A=arcOfBulge(P[i],P[(i+1)%P.length],b);if(A)s+=A.r*A.r/2*(A.sw-Math.sin(A.sw));}}
  return s;
}
function pointInPoly(P,pt){
  let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];
    if((a.y>pt.y)!==(b.y>pt.y)&&pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x)c=!c;}
  return c;
}
const FLAT=new WeakMap(),DEPTH=new WeakMap();
function flats(loops){let f=FLAT.get(loops);if(!f){f=loops.map(l=>flatLoop(l.pts,0.03));FLAT.set(loops,f);}return f;}
function included(e,loops){
  const st=e.style||'normal',all=loops.map((l,i)=>i);if(st==='normal')return all;
  let d=DEPTH.get(loops);
  if(!d){const F=flats(loops);d=F.map((f,i)=>{if(f.length<2)return 0;const m={x:(f[0].x+f[1].x)/2,y:(f[0].y+f[1].y)/2};
    let c=0;F.forEach((g,j)=>{if(j!==i&&g.length>2&&pointInPoly(g,m))c++;});return c;});DEPTH.set(loops,d);}
  return all.filter(i=>st==='outer'?d[i]<=1:d[i]===0);
}
function depths(loops){included({style:'ignore'},loops);return DEPTH.get(loops)||loops.map(()=>0);}
function loopsBBox(loops,idx){
  const F=flats(loops);let x1=1e300,y1=1e300,x2=-1e300,y2=-1e300;
  (idx||loops.map((l,i)=>i)).forEach(i=>F[i].forEach(p=>{if(p.x<x1)x1=p.x;if(p.x>x2)x2=p.x;if(p.y<y1)y1=p.y;if(p.y>y2)y2=p.y;}));
  return{x1,y1,x2,y2};
}
const loopKey=l=>l.pts.map(p=>Math.round(p.x*1e4)+','+Math.round(p.y*1e4)).sort().join(';');
function dedupe(loops){const s=new Set();return loops.filter(l=>{const k=loopKey(l);if(s.has(k))return false;s.add(k);return true;});}

/* ================= 3. ENTIDADES → SEGMENTOS ================= */
function microArc(cx,cy,r,a0,sw,ref,segs,id){
  const n=Math.max(2,Math.ceil(Math.abs(sw)/0.0262));let px=cx+r*Math.cos(a0),py=cy+r*Math.sin(a0);
  for(let j=1;j<=n;j++){const a=a0+sw*j/n,x=cx+r*Math.cos(a),y=cy+r*Math.sin(a);
    segs.push({ax:px,ay:py,bx:x,by:y,arc:ref,id});px=x;py=y;}
}
function splinePts(e){
  const f=(e.fit||e.pts||[]).map(p=>({x:p.x,y:p.y}));if(f.length<3)return f;
  const cl=!!e.closed,n=f.length,out=[],g=i=>cl?f[((i%n)+n)%n]:f[Math.max(0,Math.min(n-1,i))],m=cl?n:n-1;
  for(let i=0;i<m;i++){const p0=g(i-1),p1=g(i),p2=g(i+1),p3=g(i+2);
    for(let j=0;j<8;j++){const t=j/8,t2=t*t,t3=t2*t;
      const f2=(a,b,c,d)=>.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
      out.push({x:f2(p0.x,p1.x,p2.x,p3.x),y:f2(p0.y,p1.y,p2.y,p3.y)});}}
  if(!cl)out.push(f[n-1]);return out;
}
function ellipsePts(e){
  const M=typeof e.major==='number'?{x:e.major,y:0}:e.major,r=e.ratio||1,nx=-M.y*r,ny=M.x*r;
  const full=e.a1==null||e.a2==null||Math.abs(e.a2-e.a1)>=359.99;
  const a1=full?0:e.a1*D2R,sw=full?TAU:(((e.a2-e.a1)%360+360)%360)*D2R,n=Math.max(16,Math.ceil(sw/0.0524)),out=[];
  for(let j=0;j<=(full?n-1:n);j++){const t=a1+sw*j/n;out.push({x:e.c.x+M.x*Math.cos(t)+nx*Math.sin(t),y:e.c.y+M.y*Math.cos(t)+ny*Math.sin(t)});}
  return{pts:out,closed:full};
}
function entSegs(e,segs){
  const id=e.id;
  function chain(P,closed){const n=P.length,m=closed?n:n-1;for(let i=0;i<m;i++){const a=P[i],b=P[(i+1)%n];
    if(Math.hypot(b.x-a.x,b.y-a.y)>0)segs.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,arc:null,id});}}
  switch(e.type){
    case'line':segs.push({ax:e.p1.x,ay:e.p1.y,bx:e.p2.x,by:e.p2.y,arc:null,id});break;
    case'pline':{const P=e.pts,n=P.length,m=e.closed?n:n-1;
      for(let i=0;i<m;i++){const p=P[i],q=P[(i+1)%n],b=p.bulge||0;
        if(b){const A=arcOfBulge(p,q,b);if(A){microArc(A.cx,A.cy,A.r,A.a0,A.sw,{cx:A.cx,cy:A.cy,r:A.r},segs,id);continue;}}
        if(Math.hypot(q.x-p.x,q.y-p.y)>0)segs.push({ax:p.x,ay:p.y,bx:q.x,by:q.y,arc:null,id});}break;}
    case'circle':microArc(e.c.x,e.c.y,e.r,0,TAU,{cx:e.c.x,cy:e.c.y,r:e.r},segs,id);break;
    case'arc':{let sw=(((e.a2-e.a1)%360)+360)%360;if(sw===0)sw=360;
      microArc(e.c.x,e.c.y,e.r,e.a1*D2R,sw*D2R,{cx:e.c.x,cy:e.c.y,r:e.r},segs,id);break;}
    case'ellipse':{const r=ellipsePts(e);chain(r.pts,r.closed);break;}
    case'spline':chain(splinePts(e),!!e.closed);break;
  }
}
function closedLoop(e){
  const id=e.id;
  if(e.type==='circle')return{pts:[{x:e.c.x+e.r,y:e.c.y,z:0,bulge:1},{x:e.c.x-e.r,y:e.c.y,z:0,bulge:1}],src:[id]};
  if(e.type==='pline'&&e.closed&&e.pts.length>=3)return{pts:e.pts.map(p=>({x:p.x,y:p.y,z:0,bulge:p.bulge||0})),src:[id]};
  if(e.type==='ellipse'){const r=ellipsePts(e);if(r.closed)return{pts:r.pts.map(p=>({x:p.x,y:p.y,z:0,bulge:0})),src:[id]};}
  if(e.type==='spline'&&e.closed){const P=splinePts(e);if(P.length>2)return{pts:P.map(p=>({x:p.x,y:p.y,z:0,bulge:0})),src:[id]};}
  return null;
}

/* ================= 4. GRAFO PLANAR E DETECÇÃO DE CONTORNO ================= */
function buildGraph(ents,gap){
  const segs=[];ents.forEach(e=>entSegs(e,segs));
  if(!segs.length||segs.length>60000)return null;
  let x1=1e300,y1=1e300,x2=-1e300,y2=-1e300;
  segs.forEach(s=>{x1=Math.min(x1,s.ax,s.bx);x2=Math.max(x2,s.ax,s.bx);y1=Math.min(y1,s.ay,s.by);y2=Math.max(y2,s.ay,s.by);});
  const ext=Math.max(x2-x1,y2-y1,1e-9),mag=Math.max(Math.abs(x1),Math.abs(x2),Math.abs(y1),Math.abs(y2));
  const eps=Math.max(1e-7,ext*1e-9,mag*1e-12,gap||0),N=segs.length;
  const ts=segs.map(()=>[]),mnx=[],mxx=[],mny=[],mxy=[];
  segs.forEach((s,i)=>{mnx[i]=Math.min(s.ax,s.bx);mxx[i]=Math.max(s.ax,s.bx);mny[i]=Math.min(s.ay,s.by);mxy[i]=Math.max(s.ay,s.by);});
  const ord=segs.map((s,i)=>i).sort((a,b)=>mnx[a]-mnx[b]);
  function addT(i,t,et){if(t>et&&t<1-et)ts[i].push(t);}
  function inter(i,j){
    const a=segs[i],b=segs[j],rx=a.bx-a.ax,ry=a.by-a.ay,sx=b.bx-b.ax,sy=b.by-b.ay,
      la=Math.hypot(rx,ry),lb=Math.hypot(sx,sy),den=rx*sy-ry*sx,qx=b.ax-a.ax,qy=b.ay-a.ay,ea=eps/la,eb=eps/lb;
    if(Math.abs(den)<=1e-12*la*lb){
      if(Math.abs(qx*ry-qy*rx)/la>eps)return;
      addT(i,((b.ax-a.ax)*rx+(b.ay-a.ay)*ry)/(la*la),ea);addT(i,((b.bx-a.ax)*rx+(b.by-a.ay)*ry)/(la*la),ea);
      addT(j,((a.ax-b.ax)*sx+(a.ay-b.ay)*sy)/(lb*lb),eb);addT(j,((a.bx-b.ax)*sx+(a.by-b.ay)*sy)/(lb*lb),eb);return;}
    const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    if(t>=-ea&&t<=1+ea&&u>=-eb&&u<=1+eb){addT(i,t,ea);addT(j,u,eb);}
  }
  for(let ii=0;ii<N;ii++){const a=ord[ii];
    for(let jj=ii+1;jj<N;jj++){const b=ord[jj];if(mnx[b]>mxx[a]+eps)break;
      if(mny[b]>mxy[a]+eps||mxy[b]<mny[a]-eps)continue;inter(a,b);}}
  const nodes=[],grid=new Map(),cell=Math.max(eps*4,1e-12);
  function node(x,y){
    const cx=Math.round(x/cell),cy=Math.round(y/cell);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const l=grid.get((cx+dx)+','+(cy+dy));
      if(l)for(const k of l){const nd=nodes[k];if(Math.abs(nd.x-x)<=eps&&Math.abs(nd.y-y)<=eps)return k;}}
    const k=nodes.length;nodes.push({x,y,out:[]});const key=cx+','+cy;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(k);return k;
  }
  const edges=[],seen=new Set();
  function addEdge(a,b,arc,id){
    const key=a<b?a+'_'+b:b+'_'+a;if(seen.has(key))return;seen.add(key);
    const ed={a,b,arc,id},h1={from:a,to:b,edge:ed},h2={from:b,to:a,edge:ed};h1.twin=h2;h2.twin=h1;ed.h1=h1;ed.h2=h2;
    edges.push(ed);nodes[a].out.push(h1);nodes[b].out.push(h2);
  }
  segs.forEach((s,i)=>{
    const T=ts[i].sort((p,q)=>p-q);let prev=node(s.ax,s.ay);
    T.forEach(t=>{const n=node(s.ax+t*(s.bx-s.ax),s.ay+t*(s.by-s.ay));if(n!==prev){addEdge(prev,n,s.arc,s.id);prev=n;}});
    const e=node(s.bx,s.by);if(e!==prev)addEdge(prev,e,s.arc,s.id);
  });
  nodes.forEach(n=>{n.out.forEach(h=>{const t=nodes[h.to];h.ang=Math.atan2(t.y-n.y,t.x-n.x);});
    n.out.sort((p,q)=>p.ang-q.ang);n.out.forEach((h,i)=>{h.pos=i;});});
  const par=nodes.map((n,i)=>i);
  const find=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;};
  edges.forEach(e=>{const a=find(e.a),b=find(e.b);if(a!==b)par[a]=b;});
  return{nodes,edges,eps,find};
}
const nextH=(g,h)=>{const l=g.nodes[h.to].out;return l[(h.twin.pos-1+l.length)%l.length];};
function walk(g,h0){const hs=[];let h=h0,c=0;do{hs.push(h);h=nextH(g,h);}while(h!==h0&&++c<200000);return c>=200000?null:hs;}
function faceFromRay(g,pt,ign){
  let best=null;
  for(const e of g.edges){if(ign.has(g.find(e.a)))continue;const a=g.nodes[e.a],b=g.nodes[e.b];
    if((a.y<=pt.y)===(b.y<=pt.y))continue;
    const x=a.x+(pt.y-a.y)/(b.y-a.y)*(b.x-a.x);if(x>pt.x&&(!best||x<best.x))best={x,e};}
  if(!best)return null;
  const e=best.e;return walk(g,g.nodes[e.b].y>g.nodes[e.a].y?e.h1:e.h2);
}
function assemble(g,hs){
  const n=hs.length,arc=i=>hs[i].edge.arc||null,src=[...new Set(hs.map(h=>h.edge.id))];
  const micro=(i,A)=>{const a=g.nodes[hs[i].from],b=g.nodes[hs[i].to];
    let d=Math.atan2(b.y-A.cy,b.x-A.cx)-Math.atan2(a.y-A.cy,a.x-A.cx);while(d>PI)d-=TAU;while(d<-PI)d+=TAU;return d;};
  let start=-1;for(let i=0;i<n;i++)if(arc(i)!==arc((i-1+n)%n)){start=i;break;}
  if(start<0){const A=arc(0);
    if(A){let sw=0;for(let i=0;i<n;i++)sw+=micro(i,A);
      if(Math.abs(Math.abs(sw)-TAU)<0.05){const s=sw>0?1:-1;
        return{pts:[{x:A.cx+A.r,y:A.cy,z:0,bulge:s},{x:A.cx-A.r,y:A.cy,z:0,bulge:s}],src};}}
    start=0;}
  const pts=[];let i=0;
  while(i<n){const k=(start+i)%n,A=arc(k),p=g.nodes[hs[k].from];
    if(!A){pts.push({x:p.x,y:p.y,z:0,bulge:0});i++;continue;}
    let sw=0,j=i;while(j<n&&arc((start+j)%n)===A){sw+=micro((start+j)%n,A);j++;}
    pts.push({x:p.x,y:p.y,z:0,bulge:Math.tan(sw/4)});i=j;}
  return{pts,src};
}
function outerWalk(g,list){
  let b=list[0];list.forEach(i=>{const n=g.nodes[i],m=g.nodes[b];if(n.x<m.x||(n.x===m.x&&n.y<m.y))b=i;});
  const o=g.nodes[b].out;if(!o.length)return null;return walk(g,o[o.length-1]);
}
// região (contorno externo + ilhas) que contém pt, a partir de entidades dadas
function regionAt(ents,pt,gap){
  const g=buildGraph(ents,gap);if(!g)return null;
  const ign=new Set();let outer=null,poly=null;
  for(let it=0;it<400;it++){
    const hs=faceFromRay(g,pt,ign);if(!hs)return null;
    const P=hs.map(h=>g.nodes[h.from]);
    if(Math.abs(polyArea(P))>g.eps*g.eps*10&&pointInPoly(P,pt)){outer=hs;poly=P;break;}
    ign.add(g.find(hs[0].from));
  }
  if(!outer)return null;
  const oc=g.find(outer[0].from),loops=[assemble(g,outer)],comps=new Map();
  g.nodes.forEach((n,i)=>{const c=g.find(i);if(c===oc)return;if(!comps.has(c))comps.set(c,[]);comps.get(c).push(i);});
  comps.forEach(list=>{
    if(!pointInPoly(poly,g.nodes[list[0]]))return;
    const hs=outerWalk(g,list);if(!hs)return;
    if(Math.abs(polyArea(hs.map(h=>g.nodes[h.from])))>g.eps*g.eps*10)loops.push(assemble(g,hs));});
  return{loops:dedupe(loops)};
}
// laços a partir de objetos selecionados
function loopsFromObjects(ents){
  const loops=[],open=[];
  ents.forEach(e=>{if(!e)return;const c=closedLoop(e);if(c)loops.push(c);else if(['line','pline','arc','ellipse','spline'].includes(e.type))open.push(e);});
  if(open.length){const g=buildGraph(open,H.state.gap);
    if(g){const vis=new Set();
      g.nodes.forEach(n=>n.out.forEach(h0=>{if(vis.has(h0))return;const hs=walk(g,h0);if(!hs)return;hs.forEach(h=>vis.add(h));
        if(polyArea(hs.map(h=>g.nodes[h.from]))>g.eps*g.eps*10)loops.push(assemble(g,hs));}));}}
  return dedupe(loops);
}
H._regionAt=regionAt;H._loopsFromObjects=loopsFromObjects;

/* ---- coleta de candidatos do documento ---- */
const BT=['line','pline','circle','arc','ellipse','spline'];
function candidates(allOfDoc){
  if(!CAD.ents||!CAD.ents.query)return[];
  const sp=cur(CAD.doc&&CAD.doc.space)||'model';let R=null;
  if(!allOfDoc&&CAD.view&&CAD.view.toWorld&&CAD.view.w){try{const a=xy(CAD.view.toWorld(0,0)),b=xy(CAD.view.toWorld(CAD.view.w,CAD.view.h));
    R={x1:Math.min(a.x,b.x),x2:Math.max(a.x,b.x),y1:Math.min(a.y,b.y),y2:Math.max(a.y,b.y)};}catch(_){R=null;}}
  return CAD.ents.query(e=>{
    if(!BT.includes(e.type)||(e.space||'model')!==sp)return false;
    try{if(CAD.doc&&CAD.doc.visible&&!CAD.doc.visible(e))return false;}catch(_){}
    if(R&&CAD.bboxOf){try{const b=CAD.bboxOf(e);if(b&&(b.x2<R.x1||b.x1>R.x2||b.y2<R.y1||b.y1>R.y2))return false;}catch(_){}}
    return true;});
}
H.findBoundary=function(pt,o){
  o=o||{};const gap=nz(o.gap,H.state.gap);let r;
  if(o.ents)r=regionAt(o.ents,pt,gap);
  else{r=regionAt(candidates(false),pt,gap);if(!r)r=regionAt(candidates(true),pt,gap);}
  return r?{ok:true,loops:r.loops}:{ok:false,msg:'Não foi possível determinar um contorno fechado nesse ponto.'};
};
H.fromObjects=function(ents){const l=loopsFromObjects(ents);return l.length?{ok:true,loops:l}:{ok:false,msg:'Os objetos não formam contorno fechado.'};};

/* ================= 5. HACHURA ASSOCIATIVA ================= */
const CACHE=new Map();
const geomSig=s=>{const o=Object.assign({},s);delete o.id;return JSON.stringify(o);};
function interiorPt(loop){
  const F=flatLoop(loop.pts,0.1);let sx=0,sy=0;F.forEach(p=>{sx+=p.x;sy+=p.y;});const c={x:sx/F.length,y:sy/F.length};
  if(pointInPoly(F,c))return c;
  for(let i=0;i<F.length;i++){const a=F[i],b=F[(i+2)%F.length],m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(pointInPoly(F,m))return m;}
  return F[0];
}
function recompute(e,srcs,shift){
  const pk=srcs.filter(s=>!(e.srcSel||[]).includes(s.id)),sel=srcs.filter(s=>(e.srcSel||[]).includes(s.id));
  let loops=[];
  const seeds=(e.seeds&&e.seeds.length?e.seeds:(e.loops.length?[interiorPt(e.loops[0])]:[]));
  if(pk.length)for(const sd of seeds){const r=regionAt(pk,{x:sd.x+(shift?shift.x:0),y:sd.y+(shift?shift.y:0)},H.state.gap);if(!r)return null;loops=loops.concat(r.loops);}
  if(sel.length)loops=loops.concat(loopsFromObjects(sel));
  return loops.length?dedupe(loops):null;
}
function liveLoops(e){
  if(!e.assoc||!e.src||!e.src.length||!CAD.ents||!CAD.ents.get||e.id==null)return e.loops;
  const srcs=[];let sig='',cx=0,cy=0;
  for(const id of e.src){const s=CAD.ents.get(id);if(!s)return e.loops;srcs.push(s);sig+=geomSig(s)+'|';
    try{const b=CAD.bboxOf(s);cx+=(b.x1+b.x2)/2;cy+=(b.y1+b.y2)/2;}catch(_){}}
  cx/=srcs.length;cy/=srcs.length;
  const c=CACHE.get(e.id);
  if(!c){CACHE.set(e.id,{sig,base:e.loops,cx,cy});return e.loops;}
  if(c.sig===sig){c.base=e.loops;return e.loops;}
  let nl=recompute(e,srcs,null);
  if(!nl)nl=recompute(e,srcs,{x:cx-c.cx,y:cy-c.cy});
  if(nl){try{e.loops=nl;}catch(_){}}   // cache derivado: mantém o arquivo coerente com as fontes
  CACHE.set(e.id,{sig,base:e.loops,cx,cy});return e.loops;
}
H.liveLoops=liveLoops;

/* ================= 6. MÉTRICAS ================= */
function pointInRegion(e,pt){
  const L=liveLoops(e);if(!L||!L.length)return false;const F=flats(L);
  return included(e,L).filter(i=>F[i].length>2&&pointInPoly(F[i],pt)).length%2===1;
}
function areaOf(e){
  const L=liveLoops(e);if(!L||!L.length)return 0;const d=depths(L);
  return included(e,L).reduce((s,i)=>s+Math.abs(loopArea(L[i]))*(d[i]%2?-1:1),0);
}
H.pointInRegion=pointInRegion;H.area=areaOf;

/* segmentos reais (recortados) da hachura, em mundo */
function dashRun(a,b,s0,d,out,emitSeg,emitDot){
  const n=d.length,P=d.reduce((x,v)=>x+Math.abs(v),0);
  if(!n||P<=0){emitSeg(a,b);return;}
  let t=(((a-s0)%P)+P)%P,i=0,acc=0,guard=0;
  while(acc+Math.abs(d[i])<t&&guard++<1e6){acc+=Math.abs(d[i]);i=(i+1)%n;}
  let rem=Math.abs(d[i])-(t-acc),pos=a;
  while(pos<b-1e-12&&guard++<2e6){
    if(d[i]===0){emitDot(pos);}
    else{const len=Math.min(rem,b-pos);if(d[i]>0)emitSeg(pos,pos+len);pos+=len;}
    i=(i+1)%n;rem=Math.abs(d[i]);
    if(d[i]===0&&pos>=b-1e-12)break;}
}
H.segments=function(e,o){
  o=o||{};const out={lines:[],points:[],solid:false},L=liveLoops(e);
  if(!L||!L.length)return out;
  if(isSolid(e)){out.solid=true;return out;}
  const F=flats(L),idx=included(e,L),polys=idx.map(i=>F[i]),maxSeg=o.max||200000;
  families(e,o).forEach(f=>{
    if(!f.dy)return;const co=Math.cos(f.ang),si=Math.sin(f.ang),X=new Map();
    polys.forEach(Pl=>{const Q=Pl.map(q=>{const x=q.x-f.ox,y=q.y-f.oy;return{s:x*co+y*si,n:-x*si+y*co};});
      for(let i=0;i<Q.length;i++){const A=Q[i],B=Q[(i+1)%Q.length];if(A.n===B.n)continue;
        const ka=A.n/f.dy,kb=B.n/f.dy,k1=Math.ceil(Math.min(ka,kb)-1e-12),k2=Math.floor(Math.max(ka,kb)+1e-12);
        for(let k=k1;k<=k2;k++){const n=k*f.dy;
          if((A.n<=n)!==(B.n<=n)){const s=A.s+(n-A.n)/(B.n-A.n)*(B.s-A.s);if(!X.has(k))X.set(k,[]);X.get(k).push(s);}}}});
    X.forEach((arr,k)=>{
      arr.sort((p,q)=>p-q);const n=k*f.dy,s0=k*f.dx,P=(s,nn)=>({x:f.ox+s*co-nn*si,y:f.oy+s*si+nn*co,z:0});
      for(let i=0;i+1<arr.length;i+=2){
        dashRun(arr[i],arr[i+1],s0,f.d,out,(a,b)=>{if(out.lines.length>=maxSeg)throw new Error('Hachura densa demais');
          out.lines.push({p1:P(a,n),p2:P(b,n)});},s=>out.points.push(P(s,n)));}});
  });
  return out;
};

/* ================= 7. DESENHO ================= */
function drawHatch(ctx,e,view,o){
  o=o||{};view=view||CAD.view;if(!view||!view.toScreen)return;
  const loops=liveLoops(e);if(!loops||!loops.length)return;
  const toS=p=>xy(view.toScreen(p)),s0=toS({x:0,y:0,z:0}),s1=toS({x:1,y:0,z:0});
  const zs=Math.hypot(s1.x-s0.x,s1.y-s0.y)||nz(view.zoom,1),idx=included(e,loops);if(!idx.length)return;
  const fams=isSolid(e)?null:families(e,o),dense=!!(fams&&fams.length&&fams.some(f=>Math.abs(f.dy)*zs<2.5));
  ctx.save();
  ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;
  ctx.globalAlpha=(ctx.globalAlpha||1)*(1-clamp(nz(e.transp,0),0,90)/100)*(o.alpha||1);
  ctx.beginPath();
  idx.forEach(i=>{const fl=flatLoop(loops[i].pts,r=>clamp(2*Math.acos(Math.max(0,1-0.3/Math.max(r*zs,0.31))),0.02,0.6));
    fl.forEach((p,k)=>{const s=toS(p);if(k)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});ctx.closePath();});
  if(!fams||!fams.length||dense){if(dense)ctx.globalAlpha*=0.35;ctx.fill('evenodd');ctx.restore();return;}
  ctx.clip('evenodd');
  let bb=loopsBBox(loops,idx);
  if(view.toWorld&&view.w){try{const a=xy(view.toWorld(0,0)),b=xy(view.toWorld(view.w,view.h));
    bb={x1:Math.max(bb.x1,Math.min(a.x,b.x)),x2:Math.min(bb.x2,Math.max(a.x,b.x)),y1:Math.max(bb.y1,Math.min(a.y,b.y)),y2:Math.min(bb.y2,Math.max(a.y,b.y))};}catch(_){}}
  if(bb.x1>bb.x2||bb.y1>bb.y2){ctx.restore();return;}
  fams.forEach(f=>{
    if(!f.dy)return;const co=Math.cos(f.ang),si=Math.sin(f.ang);
    let nmin=1e300,nmax=-1e300,smin=1e300,smax=-1e300;
    [[bb.x1,bb.y1],[bb.x2,bb.y1],[bb.x2,bb.y2],[bb.x1,bb.y2]].forEach(q=>{const X=q[0]-f.ox,Y=q[1]-f.oy,s=X*co+Y*si,n=-X*si+Y*co;
      nmin=Math.min(nmin,n);nmax=Math.max(nmax,n);smin=Math.min(smin,s);smax=Math.max(smax,s);});
    const ka=nmin/f.dy,kb=nmax/f.dy,k1=Math.ceil(Math.min(ka,kb)-1e-9),k2=Math.floor(Math.max(ka,kb)+1e-9);
    if(k2-k1>4000)return;
    const P=f.d.reduce((a,v)=>a+Math.abs(v),0),dashed=f.d.length>0&&P*zs>=3;
    const pos=(s,n)=>toS({x:f.ox+s*co-n*si,y:f.oy+s*si+n*co,z:0});
    if(!dashed){ctx.beginPath();for(let k=k1;k<=k2;k++){const n=k*f.dy,a=pos(smin,n),b=pos(smax,n);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();return;}
    let dot=false;const arr=f.d.map(v=>{if(v===0){dot=true;return 0.01;}return Math.abs(v)*zs;});
    ctx.setLineDash(arr);ctx.lineCap=dot?'round':'butt';
    for(let k=k1;k<=k2;k++){const n=k*f.dy,a=pos(smin,n),b=pos(smax,n),ph=(((smin-k*f.dx)%P)+P)%P;
      ctx.lineDashOffset=ph*zs;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  });
  ctx.restore();
}
H.draw=drawHatch;
H.swatch=function(name,cv){
  const w=cv.width,h=cv.height,ctx=cv.getContext('2d'),p=PAT[name];ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);if(!p)return;
  ctx.strokeStyle='#000';let z=1;
  if(!p.solid){const dys=p.lines.map(l=>Math.abs(l.dy)).filter(v=>v>0);z=p.user?2:Math.min(20,6/Math.max(Math.min.apply(null,dys.length?dys:[3]),1e-6));}
  const W=w/z,Hh=h/z,e={pattern:name,scale:1,rot:0,solid:p.solid,uspace:3,udouble:false,
    loops:[{pts:[{x:0,y:0,bulge:0},{x:W,y:0,bulge:0},{x:W,y:Hh,bulge:0},{x:0,y:Hh,bulge:0}],src:[]}]};
  drawHatch(ctx,e,{w,h,zoom:z,toScreen:q=>({x:q.x*z,y:h-q.y*z}),toWorld:(sx,sy)=>({x:sx/z,y:(h-sy)/z})},{uf:1});
};

/* ================= 8. TIPO 'hatch' ================= */
const bboxOf=e=>{const L=liveLoops(e);return L&&L.length?loopsBBox(L):{x1:0,y1:0,x2:0,y2:0};};
function hitHatch(e,pt,tol){
  if(!pointInRegion(e,pt))return false;if(isSolid(e))return true;
  const fams=families(e);if(!fams.length)return true;
  return fams.some(f=>{if(!f.dy)return false;const n=-(pt.x-f.ox)*Math.sin(f.ang)+(pt.y-f.oy)*Math.cos(f.ang);
    return Math.abs(n-Math.round(n/f.dy)*f.dy)<=tol;});
}
function xf(m,p){return CAD.xform&&CAD.xform.apply?CAD.xform.apply(m,p):{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};}
function transformHatch(e,m){
  const det=m.a*m.d-m.b*m.c,sc=Math.sqrt(Math.abs(det))||1,rr=(e.rot||0)*D2R,c=Math.cos(rr),s=Math.sin(rr);
  const nl=(liveLoops(e)||[]).map(l=>({src:l.src,pts:l.pts.map(q=>{const r=xf(m,q);return{x:r.x,y:r.y,z:q.z||0,bulge:det<0?-(q.bulge||0):(q.bulge||0)};})}));
  let keep=!!e.assoc;
  if(keep&&e.src&&CAD.sel&&CAD.sel.has)keep=e.src.every(id=>CAD.sel.has(id));
  const o=e.origin||{x:0,y:0},no=xf(m,o),p={loops:nl,rot:((Math.atan2(m.b*c+m.d*s,m.a*c+m.c*s)*R2D)%360+360)%360,
    origin:{x:no.x,y:no.y},scale:nz(e.scale,1)*sc,assoc:keep};
  if(e.uspace>0)p.uspace=e.uspace*sc;
  if(e.seeds)p.seeds=e.seeds.map(q=>{const r=xf(m,q);return{x:r.x,y:r.y};});
  return p;
}
function propsHatch(e){
  const pats=Object.keys(PAT);
  return[{key:'pattern',label:'Padrão',type:'select',options:pats,value:e.pattern},
    {key:'scale',label:'Escala',type:'number',value:e.scale,min:1e-6},
    {key:'rot',label:'Ângulo',type:'number',value:e.rot||0},
    {key:'transp',label:'Transparência (%)',type:'number',value:e.transp||0,min:0,max:90},
    {key:'style',label:'Ilhas',type:'select',options:['normal','outer','ignore'],value:e.style||'normal'},
    {key:'assoc',label:'Associativa',type:'bool',value:!!e.assoc},
    {key:'area',label:'Área',type:'number',value:areaOf(e),readonly:true}];
}
function explodeHatch(e){
  const base={layer:e.layer,color:e.color,lw:e.lw,ltype:e.ltype,space:e.space},S=H.segments(e),L=liveLoops(e)||[];
  if(S.solid)return included(e,L).map(i=>Object.assign({type:'pline',closed:true,pts:L[i].pts.map(p=>({x:p.x,y:p.y,z:0,bulge:p.bulge||0}))},base));
  return S.lines.map(s=>Object.assign({type:'line',p1:s.p1,p2:s.p2},base)).concat(S.points.map(p=>Object.assign({type:'point',p},base)));
}
function toSVG(e){
  const f=v=>+(+v).toFixed(4),S=H.segments(e);
  if(S.solid){const L=liveLoops(e),F=flats(L);
    const d=included(e,L).map(i=>'M'+F[i].map(p=>f(p.x)+' '+f(-p.y)).join('L')+'Z').join('');
    return'<path d="'+d+'" fill="currentColor" fill-rule="evenodd" fill-opacity="'+(1-nz(e.transp,0)/100)+'" stroke="none"/>';}
  const d=S.lines.map(s=>'M'+f(s.p1.x)+' '+f(-s.p1.y)+'L'+f(s.p2.x)+' '+f(-s.p2.y)).join('')+S.points.map(p=>'M'+f(p.x)+' '+f(-p.y)+'h0').join('');
  return'<path d="'+d+'" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
}
// DXF R2000: pares [código,valor] (inclui 0, 8 e 100 AcDbHatch; P12 acrescenta handle/propriedades comuns)
function toDXF(e){
  const L=liveLoops(e)||[],d=depths(L),P=[[0,'HATCH'],[8,e.layer||'0'],[100,'AcDbHatch'],[10,0],[20,0],[30,0],[210,0],[220,0],[230,1],
    [2,isSolid(e)?'SOLID':String(e.pattern||'ANSI31').toUpperCase()],[70,isSolid(e)?1:0],[71,e.assoc?1:0],[91,L.length]];
  L.forEach((l,i)=>{const hb=l.pts.some(p=>p.bulge);P.push([92,d[i]===0?3:2],[72,hb?1:0],[73,1],[93,l.pts.length]);
    l.pts.forEach(p=>{P.push([10,p.x],[20,p.y]);if(hb)P.push([42,p.bulge||0]);});P.push([97,0]);});
  P.push([75,['normal','outer','ignore'].indexOf(e.style||'normal')],[76,String(e.pattern).toUpperCase()==='USER'?0:1]);
  if(!isSolid(e)){const F=families(e);P.push([52,e.rot||0],[41,e.scale||1],[77,e.udouble?1:0],[78,F.length]);
    F.forEach(f=>{P.push([53,f.ang*R2D],[43,f.ox],[44,f.oy],[45,f.dx],[46,f.dy],[79,f.d.length]);f.d.forEach(v=>P.push([49,v]));});}
  const sd=(e.seeds&&e.seeds.length)?e.seeds:(L.length?[interiorPt(L[0])]:[]);
  P.push([98,sd.length]);sd.forEach(s=>P.push([10,s.x],[20,s.y]));return P;
}
function fromDXF(g){
  try{
    const P=Array.isArray(g)?g:((g&&(g.pairs||g.codes))||[]);let i=0;
    const e={type:'hatch',loops:[],pattern:'SOLID',scale:1,rot:0,solid:true,assoc:false,transp:0,style:'normal',seeds:[],src:[]};
    const rd=()=>P[i++]||[-1,0];
    const bul=(sw)=>Math.tan(sw/4);
    function readPath(){
      const flag=+rd()[1];const pts=[];
      if(flag&2){let hb=0,nv=0;
        let p=rd();if(p[0]===72){hb=+p[1];p=rd();}if(p[0]===73)p=rd();if(p[0]===93)nv=+p[1];
        for(let k=0;k<nv;k++){const x=+rd()[1],y=+rd()[1];let b=0;if(hb)b=+rd()[1];pts.push({x,y,z:0,bulge:b});}
      }else{
        const ne=+rd()[1];const ed=[];
        for(let k=0;k<ne;k++){const t=+rd()[1];
          if(t===1){const a=+rd()[1],b=+rd()[1],c=+rd()[1],d=+rd()[1];ed.push({s:{x:a,y:b},e:{x:c,y:d},sw:0});}
          else if(t===2){const cx=+rd()[1],cy=+rd()[1],r=+rd()[1],a1=+rd()[1]*D2R;let a2=+rd()[1]*D2R;const ccw=+rd()[1];
            let sw=ccw?((a2-a1)%TAU+TAU)%TAU:-(((a1-a2)%TAU+TAU)%TAU);if(sw===0)sw=ccw?TAU:-TAU;
            ed.push({s:{x:cx+r*Math.cos(a1),y:cy+r*Math.sin(a1)},e:{x:cx+r*Math.cos(a1+sw),y:cy+r*Math.sin(a1+sw)},sw});}
          else if(t===3){const cx=+rd()[1],cy=+rd()[1],mx=+rd()[1],my=+rd()[1],ra=+rd()[1];let a1=+rd()[1],a2=+rd()[1];const ccw=+rd()[1];
            if(!ccw){const t2=a1;a1=360-a2;a2=360-t2;}
            const r=ellipsePts({c:{x:cx,y:cy},major:{x:mx,y:my},ratio:ra,a1,a2});
            const q=ccw?r.pts:r.pts.slice().reverse();
            for(let m=0;m<q.length-1;m++)ed.push({s:q[m],e:q[m+1],sw:0});}
          else{throw new Error('aresta DXF não suportada: '+t);}}
        let last=null;
        ed.forEach(x=>{let s=x.s,en=x.e,sw=x.sw;
          if(last&&Math.hypot(s.x-last.x,s.y-last.y)>Math.hypot(en.x-last.x,en.y-last.y)){const t=s;s=en;en=t;sw=-sw;}
          pts.push({x:s.x,y:s.y,z:0,bulge:sw?bul(sw):0});last=en;});
      }
      let p=P[i];if(p&&p[0]===97){i++;i+=+p[1];}
      e.loops.push({pts,src:[]});
    }
    while(i<P.length){const c=rd(),code=c[0],v=c[1];
      if(code===8)e.layer=v;else if(code===2)e.pattern=String(v).toUpperCase();
      else if(code===70)e.solid=+v===1;else if(code===71)e.assoc=+v===1;
      else if(code===52)e.rot=+v;else if(code===41)e.scale=+v;else if(code===77)e.udouble=+v===1;
      else if(code===75)e.style=['normal','outer','ignore'][+v]||'normal';
      else if(code===91){for(let k=0;k<+v;k++)readPath();}
      else if(code===98){for(let k=0;k<+v;k++){const x=+rd()[1],y=+rd()[1];e.seeds.push({x,y});}}}
    if(e.pattern==='SOLID')e.solid=true;if(!PAT[e.pattern]&&e.pattern!=='SOLID')e.pattern='ANSI31';
    e.assoc=false;return e.loops.length?e:null;
  }catch(err){say('HATCH: falha ao importar DXF ('+err.message+')');return null;}
}
H.toDXF=toDXF;H.fromDXF=fromDXF;H.toSVG=toSVG;

/* ================= 9. CRIAÇÃO / EDIÇÃO ================= */
function hist(name,doFn,undoFn){if(CAD.history&&CAD.history.run)CAD.history.run({name,do:doFn,undo:undoFn});else doFn();}
function toBack(id){try{const A=CAD.doc.entities,i=A.findIndex(x=>x.id===id);if(i>0){const x=A.splice(i,1)[0];A.unshift(x);}}catch(_){}}
function newHatch(loops,seeds,selIds,S){
  const c=(CAD.doc&&CAD.doc.current)||{},src=[...new Set([].concat.apply([],loops.map(l=>l.src||[])))].filter(v=>v!=null);
  return{type:'hatch',layer:c.layer||'0',color:(c.color==null||c.color==='ByLayer')?null:c.color,lw:null,ltype:null,
    space:cur(CAD.doc&&CAD.doc.space)||'model',loops,pattern:S.pattern,scale:S.scale,rot:S.rot,solid:S.pattern==='SOLID',
    assoc:!!S.assoc&&src.length>0,transp:S.transp,style:S.style,origin:{x:S.origin.x,y:S.origin.y},
    uspace:S.pattern==='USER'?userSpacing():undefined,udouble:S.pattern==='USER'?!!S.udouble:undefined,
    src,srcSel:selIds||[],seeds:seeds||[]};
}
function addHatch(e,S){
  let id=null;
  hist('HATCH',()=>{const r=CAD.ents.add(e);let v=Array.isArray(r)?r[0]:r;if(v&&typeof v==='object')v=v.id;id=v!=null?v:e.id;e.id=id;if(S.toBack)toBack(id);},
    ()=>{CAD.ents.remove(id);});
  CAD.render&&CAD.render.request&&CAD.render.request();return id;
}
H.create=function(loops,o){const S=Object.assign({},H.state,o||{});const e=newHatch(loops,(o&&o.seeds)||[],(o&&o.srcSel)||[],S);return addHatch(e,S);};
function patchHatches(ids,patch,name){
  const olds=ids.map(id=>{const e=CAD.ents.get(id),o={};Object.keys(patch).forEach(k=>{o[k]=e[k]===undefined?undefined:JSON.parse(JSON.stringify(e[k]));});return o;});
  hist(name||'HATCHEDIT',()=>ids.forEach(id=>CAD.ents.update(id,patch)),()=>ids.forEach((id,i)=>CAD.ents.update(id,olds[i])));
  CAD.render&&CAD.render.request&&CAD.render.request();
}
H.edit=patchHatches;

/* ================= 10. COMANDOS ================= */
const KW=['Selecionar','Padrao','Escala','Rotacao','Transparencia','Associativa','Ilhas','Origem','Desfazer'];
const kwKey=r=>{if(r==null)return null;const s=typeof r==='object'?(r.keyword!==undefined?r.keyword:r.value||r.name):r;
  return s==null?null:String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').charAt(0)||null;};
const isKw=r=>r!=null&&typeof r==='object'&&(r.keyword!==undefined);
async function askPattern(S){
  for(;;){
    const nm=await CAD.input.string('Nome do padrão (? = lista) <'+S.pattern+'>: ',{def:S.pattern,allowEmpty:true});
    const n=String(nm||'').trim().toUpperCase();if(!n)return;
    if(n==='?'){say('Padrões: '+Object.keys(PAT).join(', '));continue;}
    if(!PAT[n]){say('Padrão inexistente: '+n);continue;}
    S.pattern=n;
    if(n==='USER'){const sp=await CAD.input.number('Espaçamento entre linhas <'+userSpacing()+'>: ',{def:userSpacing(),min:1e-9});if(sp>0)S.uspace=sp;
      const dd=await CAD.input.keyword('Hachura dupla? [Sim/Nao] <Nao>: ',['Sim','Nao'],S.udouble?'Sim':'Nao');S.udouble=/^s/i.test(String(isKw(dd)?dd.keyword:dd||''));}
    return;}
}
async function setOption(k,S){
  if(k==='p')return askPattern(S);
  if(k==='e'){const v=await CAD.input.number('Escala do padrão <'+S.scale+'>: ',{def:S.scale,min:1e-9});if(v>0)S.scale=v;}
  else if(k==='r'){const v=await CAD.input.angle('Ângulo do padrão <'+S.rot+'>: ',{def:S.rot});if(v!=null&&isFinite(v))S.rot=v;}
  else if(k==='t'){const v=await CAD.input.number('Transparência 0-90 % <'+S.transp+'>: ',{def:S.transp,min:0,max:90});if(v!=null&&isFinite(v))S.transp=clamp(v,0,90);}
  else if(k==='a'){const v=await CAD.input.keyword('Associativa? [Sim/Nao] <'+(S.assoc?'Sim':'Nao')+'>: ',['Sim','Nao'],S.assoc?'Sim':'Nao');S.assoc=/^s/i.test(String(isKw(v)?v.keyword:v||''));}
  else if(k==='i'){const v=await CAD.input.keyword('Detecção de ilhas [Normal/Externa/Ignorar] <'+S.style+'>: ',['Normal','Externa','Ignorar'],'Normal');
    const c=kwKey(v);S.style=c==='e'?'outer':c==='i'?'ignore':'normal';}
  else if(k==='o'){const p=await CAD.input.point('Origem do padrão (Enter = 0,0): ',{optional:true});S.origin=p&&!isKw(p)?{x:p.x,y:p.y}:{x:0,y:0};}
}
function drawPreview(ctx,view,loops,S){
  drawHatch(ctx,{loops,pattern:S.pattern,scale:S.scale,rot:S.rot,solid:S.pattern==='SOLID',transp:S.transp,style:S.style,
    origin:S.origin,uspace:S.uspace,udouble:S.udouble},view,{alpha:0.7});
}
async function cmdHatch(){
  const S=H.state;let groups=[];let startSel=S.startMode==='select';S.startMode='pick';
  const all=()=>[].concat.apply([],groups.map(g=>g.loops));
  const refresh=()=>{try{CAD.render&&CAD.render.preview&&CAD.render.preview(all().length?(ctx,view)=>drawPreview(ctx,view,all(),S):null);CAD.render&&CAD.render.request&&CAD.render.request();}catch(_){}};
  try{
    for(;;){
      let r;
      if(startSel){r={keyword:'Selecionar'};startSel=false;}
      else r=await CAD.input.point('HATCH '+S.pattern+' esc='+S.scale+' âng='+S.rot+' — Clique em área interna ou ['+KW.join('/')+'] <Enter = aplicar>: ',{optional:true,keywords:KW});
      if(r==null)break;
      if(isKw(r)){const k=kwKey(r);
        if(k==='s'){const ids=await CAD.input.select('Selecione objetos de contorno: ',{optional:true,noPickfirst:true});
          const ents=(ids||[]).map(id=>CAD.ents.get(id)).filter(Boolean),res=H.fromObjects(ents);
          if(res.ok)groups.push({loops:res.loops,seeds:[],sel:ents.map(x=>x.id)});else say(res.msg);}
        else if(k==='d'){groups.pop();}
        else await setOption(k,S);
        refresh();continue;}
      const res=H.findBoundary({x:r.x,y:r.y});
      if(res.ok)groups.push({loops:res.loops,seeds:[{x:r.x,y:r.y}],sel:[]});else say(res.msg);
      refresh();
    }
    if(!all().length){say('HATCH: nenhum contorno definido.');return;}
    const loops=dedupe(all()),seeds=[].concat.apply([],groups.map(g=>g.seeds)),sel=[].concat.apply([],groups.map(g=>g.sel));
    const e=newHatch(loops,seeds,sel,S);addHatch(e,S);say('HATCH: '+S.pattern+' criada, área = '+areaOf(e).toFixed(3)+' '+((CAD.doc&&CAD.doc.units)||'m')+'².');
  }finally{try{CAD.render&&CAD.render.preview&&CAD.render.preview(null);CAD.render&&CAD.render.request&&CAD.render.request();}catch(_){}}
}
const isHatch=id=>{const e=CAD.ents.get(id);return e&&e.type==='hatch';};
async function cmdEdit(){
  let ids=((CAD.sel&&CAD.sel.ids?cur(CAD.sel.ids)||[]:[])).filter(isHatch);
  if(!ids.length){const r=await CAD.input.select('Selecione a hachura: ',{});ids=(r||[]).filter(isHatch);}
  if(!ids.length){say('HATCHEDIT: nenhuma hachura selecionada.');return;}
  const e0=CAD.ents.get(ids[0]),S=Object.assign({},H.state,{pattern:e0.pattern,scale:e0.scale,rot:e0.rot||0,transp:e0.transp||0,style:e0.style||'normal',
    assoc:!!e0.assoc,origin:e0.origin||{x:0,y:0},uspace:e0.uspace,udouble:e0.udouble});
  const K=['Padrao','Escala','Rotacao','Transparencia','Associativa','Ilhas','Origem','Mais','Contorno','Fim'];
  for(;;){
    const r=await CAD.input.keyword('HATCHEDIT ['+K.join('/')+'] <Fim>: ',K,'Fim');const k=kwKey(r)||'f';
    if(k==='f')break;
    if(k==='m'){const p=await CAD.input.point('Clique em área interna para ADICIONAR (Enter = sair): ',{optional:true});
      if(p&&!isKw(p)){const res=H.findBoundary({x:p.x,y:p.y});
        if(res.ok)ids.forEach(id=>{const e=CAD.ents.get(id);patchHatches([id],{loops:dedupe((liveLoops(e)||[]).concat(res.loops)),seeds:(e.seeds||[]).concat([{x:p.x,y:p.y}]),
          src:[...new Set((e.src||[]).concat([].concat.apply([],res.loops.map(l=>l.src))))]},'HATCHEDIT');});else say(res.msg);}
      continue;}
    if(k==='c'){ids.forEach(id=>{const e=CAD.ents.get(id);
      const srcs=(e.src||[]).map(x=>CAD.ents.get(x)).filter(Boolean);const nl=srcs.length?recompute(e,srcs,null):null;
      if(nl)patchHatches([id],{loops:nl},'HATCHEDIT');else say('HATCHEDIT: sem objetos de origem para recriar o contorno.');});continue;}
    await setOption(k,S);
    const patch={};
    if(k==='p'){patch.pattern=S.pattern;patch.solid=S.pattern==='SOLID';if(S.pattern==='USER'){patch.uspace=userSpacing();patch.udouble=!!S.udouble;}}
    if(k==='e')patch.scale=S.scale;if(k==='r')patch.rot=S.rot;if(k==='t')patch.transp=S.transp;if(k==='i')patch.style=S.style;
    if(k==='o')patch.origin=S.origin;
    if(k==='a'){patch.assoc=S.assoc;ids.forEach(id=>{const e=CAD.ents.get(id);
      if(!S.assoc)patchHatches([id],{assoc:false,loops:liveLoops(e)},'HATCHEDIT');
      else patchHatches([id],{assoc:true,src:[...new Set([].concat.apply([],(e.loops||[]).map(l=>l.src||[])))]},'HATCHEDIT');});continue;}
    patchHatches(ids,patch);
  }
}

/* ================= 11. PAINEL ================= */
function mountPanel(el){
  if(typeof document==='undefined')return;
  const S=H.state;el.innerHTML='';
  const mk=(t,st,tx)=>{const n=document.createElement(t);if(st)n.style.cssText=st;if(tx!=null)n.textContent=tx;return n;};
  const base='width:100%;box-sizing:border-box;margin:2px 0;font:12px system-ui,sans-serif;';
  const root=mk('div','padding:6px;font:12px system-ui,sans-serif');el.appendChild(root);
  const sel=mk('select',base);
  [...new Set(Object.keys(PAT).map(k=>PAT[k].cat))].forEach(cat=>{const g=document.createElement('optgroup');g.label=cat;
    Object.keys(PAT).filter(k=>PAT[k].cat===cat).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k+' — '+PAT[k].desc;g.appendChild(o);});sel.appendChild(g);});
  sel.value=S.pattern;root.appendChild(sel);
  const cv=mk('canvas','border:1px solid #bbb;margin:4px 0;display:block;background:#fff');cv.width=220;cv.height=70;root.appendChild(cv);
  const sw=()=>H.swatch(S.pattern,cv);sw();
  sel.onchange=()=>{S.pattern=sel.value;sw();};
  function field(label,key,min,max,step){const r=mk('label',base+'display:flex;justify-content:space-between;align-items:center');r.appendChild(mk('span',null,label));
    const i=mk('input','width:90px');i.type='number';i.value=S[key];if(min!=null)i.min=min;if(max!=null)i.max=max;i.step=step||'any';
    i.onchange=()=>{const v=parseFloat(i.value);if(isFinite(v))S[key]=v;};r.appendChild(i);root.appendChild(r);}
  field('Escala','scale',0.000001);field('Ângulo','rot');field('Transparência %','transp',0,90,1);
  const st=mk('select',base);[['normal','Ilhas: normal'],['outer','Ilhas: externa'],['ignore','Ilhas: ignorar']].forEach(a=>{const o=document.createElement('option');o.value=a[0];o.textContent=a[1];st.appendChild(o);});
  st.value=S.style;st.onchange=()=>{S.style=st.value;};root.appendChild(st);
  const as=mk('label',base);const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!S.assoc;cb.onchange=()=>{S.assoc=cb.checked;};
  as.appendChild(cb);as.appendChild(document.createTextNode(' Associativa'));root.appendChild(as);
  const btn=(t,fn)=>{const b=mk('button',base+'padding:4px;cursor:pointer',t);b.onclick=fn;root.appendChild(b);};
  btn('Escolher pontos internos',()=>{S.startMode='pick';CAD.cmd.run('HATCH');});
  btn('Selecionar objetos',()=>{S.startMode='select';CAD.cmd.run('HATCH');});
  btn('Aplicar às hachuras selecionadas',()=>{const ids=(CAD.sel&&CAD.sel.ids?cur(CAD.sel.ids)||[]:[]).filter(isHatch);
    if(ids.length)patchHatches(ids,{pattern:S.pattern,solid:S.pattern==='SOLID',scale:S.scale,rot:S.rot,transp:S.transp,style:S.style});});
}

/* ================= 12. REGISTRO ================= */
function init(){
  if(init.done)return true;if(!CAD.types||!CAD.types.register)return false;init.done=true;
  CAD.types.register('hatch',{draw:drawHatch,bbox:bboxOf,hit:hitHatch,snapPts:()=>[],grips:()=>[],transform:transformHatch,
    props:propsHatch,explode:explodeHatch,toDXF,fromDXF,toSVG,zorder:-10});
  if(CAD.cmd&&CAD.cmd.register){
    CAD.cmd.register({name:'HATCH',alias:['H','BH','BHATCH','HACHURA'],run:cmdHatch});
    CAD.cmd.register({name:'HATCHEDIT',alias:['HE'],run:cmdEdit});}
  if(CAD.ui){
    try{CAD.ui.menu&&CAD.ui.menu.add('Desenhar','Hachura...','HATCH');CAD.ui.menu&&CAD.ui.menu.add('Modificar','Editar hachura','HATCHEDIT');}catch(_){}
    try{CAD.ui.toolbar&&CAD.ui.toolbar.add('Desenho',{icone:'▨',rotulo:'Hachura',cmd:'HATCH'});}catch(_){}
    try{CAD.ui.panel&&CAD.ui.panel.register({id:'hatch',title:'Hachura',mount:mountPanel});}catch(_){}}
  return true;
}
if(!init()&&CAD.on)CAD.on('ready',init);
H.init=init;

/* ================= 13. TESTES ================= */
CAD.tests=CAD.tests||{};
CAD.tests.p7=function(){
  let ok=0,bad=0;const t=(c,m)=>{if(c)ok++;else{bad++;}console.assert(c,'P7 FALHOU: '+m);};
  const near=(a,b,tol)=>Math.abs(a-b)<=(tol||1e-6);
  const R=(id,x1,y1,x2,y2)=>({id,type:'pline',closed:true,pts:[{x:x1,y:y1,bulge:0},{x:x2,y:y1,bulge:0},{x:x2,y:y2,bulge:0},{x:x1,y:y2,bulge:0}]});
  t(Object.keys(PAT).length>=35,'biblioteca de padrões');t(PAT.SOLID.solid&&PAT.ANSI31&&PAT.USER&&PAT['AR-B816']&&PAT.ISO02W100,'padrões básicos');
  // retângulo simples
  let r=regionAt([R(1,0,0,10,6)],{x:5,y:3});t(r&&r.loops.length===1,'região retângulo');
  const e1={type:'hatch',loops:r.loops,pattern:'ANSI31',scale:0.1,rot:0,style:'normal'};
  t(near(areaOf(e1),60,1e-6),'área 60');
  // ilha circular
  const C={id:2,type:'circle',c:{x:5,y:3},r:1};
  r=regionAt([R(1,0,0,10,6),C],{x:1,y:1});t(r&&r.loops.length===2,'ilha detectada');
  const e2={type:'hatch',loops:r.loops,pattern:'ANSI31',scale:0.1,style:'normal'};
  t(near(areaOf(e2),60-PI,1e-6),'área com ilha');
  t(!pointInRegion(e2,{x:5,y:3})&&pointInRegion(e2,{x:1,y:1}),'ponto no furo');
  t(r.loops.some(l=>l.pts.length===2&&Math.abs(l.pts[0].bulge)===1),'círculo vira loop exato');
  const e2o=Object.assign({},e2,{loops:r.loops,style:'ignore'});t(near(areaOf(e2o),60,1e-6)&&pointInRegion(e2o,{x:5,y:3}),'estilo ignorar ilhas');
  r=regionAt([R(1,0,0,10,6),C],{x:5,y:3});t(r&&r.loops.length===1&&near(loopArea(r.loops[0]),PI,1e-6),'clique dentro da ilha');
  // quatro linhas soltas com cruzamento em T
  const Ls=[[0,0,10,0],[10,0,10,6],[10,6,0,6],[0,6,0,0],[5,-2,5,8]].map((q,i)=>({id:10+i,type:'line',p1:{x:q[0],y:q[1]},p2:{x:q[2],y:q[3]}}));
  r=regionAt(Ls,{x:2,y:3});t(r&&near(Math.abs(loopArea(r.loops[0])),30,1e-6),'T-junction: região dividida');
  // fora
  t(regionAt([R(1,0,0,10,6)],{x:20,y:3})===null,'fora = sem contorno');
  // semicírculo (arco + linha) com bulge
  r=regionAt([{id:1,type:'arc',c:{x:0,y:0},r:5,a1:0,a2:180},{id:2,type:'line',p1:{x:-5,y:0},p2:{x:5,y:0}}],{x:0,y:2});
  t(r&&near(Math.abs(loopArea(r.loops[0])),PI*25/2,1e-3)&&r.loops[0].pts.some(p=>near(Math.abs(p.bulge),1,1e-3)),'semicírculo com bulge');
  // select objects
  const so=H.fromObjects([R(1,0,0,4,4),C]);t(so.ok&&so.loops.length===2,'select objects');
  const so2=H.fromObjects(Ls.slice(0,4));t(so2.ok&&so2.loops.length===1,'select objects com linhas abertas');
  // segmentos ANSI31
  const sq={type:'hatch',loops:[{pts:[{x:0,y:0,bulge:0},{x:10,y:0,bulge:0},{x:10,y:10,bulge:0},{x:0,y:10,bulge:0}],src:[]}],pattern:'ANSI31',scale:0.1,rot:0};
  const S=H.segments(sq,{uf:1});let tot=0;S.lines.forEach(s=>{tot+=Math.hypot(s.p2.x-s.p1.x,s.p2.y-s.p1.y);});
  t(S.lines.length>=40&&S.lines.length<=50,'nº de linhas ANSI31 ('+S.lines.length+')');t(Math.abs(tot-100/0.3175)/(100/0.3175)<0.05,'comprimento total ANSI31');
  t(S.lines.every(s=>[s.p1,s.p2].every(p=>p.x>=-1e-6&&p.x<=10+1e-6&&p.y>=-1e-6&&p.y<=10+1e-6)),'linhas dentro do contorno');
  // tracejado ISO
  const iso=Object.assign({},sq,{pattern:'ISO02W100',scale:0.2});const Si=H.segments(iso,{uf:1});
  t(Si.lines.length>20&&Si.lines.every(s=>Math.hypot(s.p2.x-s.p1.x,s.p2.y-s.p1.y)<=2.4+1e-6),'traço ISO ≤ 2.4 (12×0.2)');
  // solid + explode
  const so3=Object.assign({},sq,{pattern:'SOLID',solid:true});t(H.segments(so3).solid&&explodeHatch(so3).length===1,'solid explode → pline');
  t(explodeHatch(sq).length>=40&&explodeHatch(sq)[0].type==='line','explode padrão → linhas');
  // user pattern
  const us=Object.assign({},sq,{pattern:'USER',uspace:1,udouble:true,rot:0,origin:{x:0.5,y:0.5}});t(H.segments(us).lines.length===20,'USER dupla 1×1 ('+H.segments(us).lines.length+')');
  // hit
  t(hitHatch(so3,{x:5,y:5},0.01)&&!hitHatch(so3,{x:15,y:5},0.01),'hit solid');
  t(hitHatch(us,{x:5.5,y:3.3},0.01)&&!hitHatch(us,{x:5.25,y:5.25},0.01),'hit só nas linhas do padrão');
  // transform
  const p=transformHatch(sq,{a:1,b:0,c:0,d:1,e:10,f:5});t(near(p.loops[0].pts[0].x,10)&&near(p.loops[0].pts[0].y,5)&&near(p.scale,0.1),'translação');
  const pm=transformHatch(sq,{a:-1,b:0,c:0,d:1,e:0,f:0});t(pm.loops[0].pts[1].x===-10,'espelho');
  const pr=transformHatch(sq,{a:0,b:1,c:-1,d:0,e:0,f:0});t(near(pr.rot,90,1e-6),'rotação 90°');
  const bb=bboxOf(sq);t(bb.x1===0&&bb.x2===10&&bb.y2===10,'bbox');
  // DXF ida e volta
  const dx=toDXF(e2),back=fromDXF(dx);t(back&&back.loops.length===2&&back.pattern==='ANSI31'&&near(areaOf(Object.assign({style:'normal'},back)),60-PI,1e-6),'DXF ida e volta');
  t(/<path/.test(toSVG(sq))&&/evenodd/.test(toSVG(so3)),'SVG');
  t(typeof propsHatch(sq)[0].key==='string'&&propsHatch(sq).length>=6,'props');
  console.log('CAD.tests.p7: '+ok+' ok, '+bad+' falha(s)');return{ok,bad};
};
})(window.CAD=window.CAD||{});
/* ==== END:7 ==== */
