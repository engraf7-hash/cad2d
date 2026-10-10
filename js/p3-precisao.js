/* ==== PART:3 ==== */
/* P3: Precisão e seleção
   OSNAP (12 modos), ortho, polar, grid, snap, dynamic input, teclas F, seleção
   (clique, window, crossing, all, previous, last).
   Depende de P1 (doc, eventos, view, sel, cmd) e P2 (opcional). Degrada sem erro. */
(function(CAD){
'use strict';

var D2R=Math.PI/180, R2D=180/Math.PI, TAU=Math.PI*2, EPS=1e-9;

/* ---------- utilitários ---------- */
function on(ev,fn){ if(CAD.on) CAD.on(ev,fn); }
function emit(ev,d){ if(CAD.emit) CAD.emit(ev,d); }
function say(m){ if(CAD.cmd&&CAD.cmd.print) CAD.cmd.print(m); }
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function norm(a){ a%=TAU; return a<0?a+TAU:a; }
function unit(a,b){ var d=dist(a,b); return d<EPS?null:{x:(b.x-a.x)/d,y:(b.y-a.y)/d}; }
function fmt(n){ return String(Math.round(n*1000)/1000); }

/* ---------- estado padrão ---------- */
var mode=CAD.mode=CAD.mode||{};
var DEF={osnap:true,ortho:false,polar:false,grid:true,snap:false,dynin:true,
         aperture:10,pickbox:6,polarAngle:45,polarExtra:[],gridStep:1,snapStep:null};
Object.keys(DEF).forEach(function(k){ if(mode[k]===undefined) mode[k]=DEF[k]; });
mode.osmodes=mode.osmodes||{endpoint:true,midpoint:true,center:true,geocenter:false,node:true,
  quadrant:true,intersection:true,extension:true,perpendicular:true,tangent:true,nearest:false,apparent:false};

var snap=CAD.snap=CAD.snap||{};
var sel=CAD.sel=CAD.sel||{};
var acq=snap._acq=[];            /* pontos adquiridos para extensão */
snap._override=null;

var LAB={endpoint:'Extremidade',midpoint:'Ponto médio',center:'Centro',geocenter:'Centro geométrico',
  node:'Nó',quadrant:'Quadrante',intersection:'Interseção',extension:'Extensão',
  perpendicular:'Perpendicular',tangent:'Tangente',nearest:'Mais próximo',apparent:'Interseção aparente'};
var PRI={endpoint:0,intersection:1,midpoint:2,center:3,geocenter:4,node:5,quadrant:6,
  perpendicular:7,tangent:8,extension:9,apparent:10,nearest:11};
var TOG={osnap:'OSNAP',ortho:'ORTHO',polar:'POLAR',grid:'GRID',snap:'SNAP',dynin:'Entrada dinâmica'};

/* ---------- view (tolerante a assinaturas) ---------- */
function s2w(x,y){
  var v=CAD.view,r; if(!v||!v.toWorld) return {x:x,y:y,z:0};
  try{ r=v.toWorld(x,y); if(!r||!isFinite(r.x)) r=v.toWorld({x:x,y:y}); }catch(e){ r={x:x,y:y}; }
  return {x:r.x,y:r.y,z:0};
}
function w2s(p){
  var v=CAD.view,r; if(!v||!v.toScreen) return {x:p.x,y:-p.y};
  try{ r=v.toScreen(p); if(!r||!isFinite(r.x)) r=v.toScreen(p.x,p.y); }catch(e){ r={x:p.x,y:-p.y}; }
  return r;
}
function zoomNow(){ return (CAD.view&&CAD.view.zoom)||1; }

/* ---------- entidades, camadas, caches ---------- */
function lyMap(){ var m={},L=(CAD.doc&&CAD.doc.layers)||[]; for(var i=0;i<L.length;i++) m[L[i].name]=L[i]; return m; }
function isVisible(e,m){
  if(typeof CAD.visible==='function'){ try{ return !!CAD.visible(e); }catch(x0){} }
  var l=m[e.layer]; if(l&&(l.on===false||l.frozen)) return false;
  return (e.space||'model')===(CAD.currentSpace||'model');
}
function isSelectable(e,m){
  if(typeof CAD.selectable==='function'){ try{ return !!CAD.selectable(e); }catch(x0){} }
  var l=m[e.layer]; return isVisible(e,m)&&!(l&&l.locked); }
function ents(){ return (CAD.doc&&CAD.doc.entities)||[]; }
function T(e){ return (CAD.types&&CAD.types.get)?CAD.types.get(e.type):null; }

var bbc=new WeakMap();
function clearCache(){ bbc=new WeakMap(); }
snap._clear=clearCache;
on('doc:changed',clearCache);

/* ---------- primitivas geométricas (seg | arc) ---------- */
function seg(a,b){ return {k:'seg',a:a,b:b}; }
function arcP(c,r,a1,a2,full){ return {k:'arc',c:c,r:r,a1:a1,a2:a2,full:!!full}; }
function inArc(p,a){
  if(p.full) return true;
  var s=norm(p.a2-p.a1); if(s<EPS) s=TAU;
  return norm(a-p.a1)<=s+1e-9;
}
function arcEnd(p,i){ var a=i?p.a2:p.a1; return {x:p.c.x+p.r*Math.cos(a),y:p.c.y+p.r*Math.sin(a),z:0}; }
function bulgeArc(p,q){
  var b=p.bulge,dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy);
  if(L<EPS||Math.abs(b)<EPS) return seg(p,q);
  var off=L*(1-b*b)/(4*b),mx=(p.x+q.x)/2,my=(p.y+q.y)/2;
  var c={x:mx-dy/L*off,y:my+dx/L*off,z:0},r=L*(1+b*b)/(4*Math.abs(b));
  var ap=Math.atan2(p.y-c.y,p.x-c.x),aq=Math.atan2(q.y-c.y,q.x-c.x);
  return b>0?arcP(c,r,ap,aq):arcP(c,r,aq,ap);
}
function polyPrims(P,closed){        /* aproximações (spline, elipse): ap=true */
  var o=[],n=P.length,m=closed?n:n-1,i,s;
  for(i=0;i<m;i++){ s=seg(P[i],P[(i+1)%n]); s.ap=true; s.first=(!closed&&i===0); s.last=(!closed&&i===m-1); o.push(s); }
  return o;
}
function ellPts(e){
  var a1=(e.a1==null?0:e.a1)*D2R,a2=(e.a2==null?360:e.a2)*D2R,s=norm(a2-a1)||TAU,n=64,
      q=(e.ratio==null?1:e.ratio),mj=e.major,mn={x:-mj.y*q,y:mj.x*q},o=[],i,t;
  for(i=0;i<=n;i++){ t=a1+s*i/n; o.push({x:e.c.x+mj.x*Math.cos(t)+mn.x*Math.sin(t),y:e.c.y+mj.y*Math.cos(t)+mn.y*Math.sin(t),z:0}); }
  return o;
}
function prims(e){
  var o=[],P,i,n,m,t=e.type;
  if(t==='line'){ if(e.p1&&e.p2) o.push(seg(e.p1,e.p2)); }
  else if(t==='pline'){
    P=e.pts||[]; n=P.length; m=e.closed?n:n-1;
    for(i=0;i<m;i++){ var a=P[i],b=P[(i+1)%n]; o.push(a.bulge?bulgeArc(a,b):seg(a,b)); }
  }
  else if(t==='circle'){ o.push(arcP(e.c,e.r,0,TAU,true)); }
  else if(t==='arc'){ o.push(arcP(e.c,e.r,e.a1*D2R,e.a2*D2R,false)); }
  else if(t==='ellipse'||t==='spline'){ o=flatPrims(e); }
  return o;
}
/* elipse/spline: usa CAD.geom.segs (P2) quando existe, para coincidir com o que a P2 calcula */
function flatPrims(e){
  var g=CAD.geom,ss=null,o=[],n,closed;
  if(g&&g.segs){ try{ ss=g.segs(e); }catch(x){ ss=null; } }
  if(ss&&ss.length){
    n=ss.length; closed=dist(ss[0].p1||{x:0,y:0},ss[n-1].p2||{x:1e9,y:1e9})<1e-7;
    ss.forEach(function(q,i){
      if(q.t!=='L') return;
      var s=seg(q.p1,q.p2); s.ap=true; s.first=(!closed&&i===0); s.last=(!closed&&i===n-1); o.push(s);
    });
    return o;
  }
  if(t_ell(e)){
    var full=(e.a1==null||e.a2==null||Math.abs(norm((e.a2-e.a1)*D2R))<EPS);
    return polyPrims(ellPts(e),full);
  }
  if(e.type==='spline'&&e.fit&&e.fit.length>1) return polyPrims(e.fit,!!e.closed);
  return o;
}
function t_ell(e){ return e.type==='ellipse'&&e.c&&e.major; }
function samplePts(e){
  var out=[],ps=prims(e);
  ps.forEach(function(p){
    if(p.k==='seg'){ out.push(p.a,p.b); return; }
    var s=p.full?TAU:(norm(p.a2-p.a1)||TAU),k,i,a,N=64;
    for(i=0;i<=N;i++){ a=p.a1+s*i/N; out.push({x:p.c.x+p.r*Math.cos(a),y:p.c.y+p.r*Math.sin(a)}); }
    for(k=0;k<4;k++){ a=k*Math.PI/2; if(inArc(p,a)) out.push({x:p.c.x+p.r*Math.cos(a),y:p.c.y+p.r*Math.sin(a)}); }
  });
  if(!out.length){ if(e.p) out.push(e.p); else if(e.c) out.push(e.c); }
  return out;
}
function normBox(b){
  if(!b) return null;
  var a=b.min||(b.x1!=null?{x:b.x1,y:b.y1}:(b.xmin!=null?{x:b.xmin,y:b.ymin}:null)),
      c=b.max||(b.x2!=null?{x:b.x2,y:b.y2}:(b.xmax!=null?{x:b.xmax,y:b.ymax}:null));
  if(!a||!c||!isFinite(a.x+a.y+c.x+c.y)) return null;
  return {x1:Math.min(a.x,c.x),y1:Math.min(a.y,c.y),x2:Math.max(a.x,c.x),y2:Math.max(a.y,c.y)};
}
function bboxOf(e){
  var b=bbc.get(e); if(b!==undefined) return b;
  var t=T(e); b=null;
  try{ if(typeof CAD.bboxOf==='function') b=normBox(CAD.bboxOf(e)); }catch(x0){ b=null; }
  if(!b) try{ b=normBox(t&&t.bbox?t.bbox(e):(CAD.geom&&CAD.geom.bbox?CAD.geom.bbox(e):null)); }catch(x){ b=null; }
  if(!b){
    var P=samplePts(e);
    if(P.length){
      b={x1:1e300,y1:1e300,x2:-1e300,y2:-1e300};
      P.forEach(function(p){ b.x1=Math.min(b.x1,p.x); b.y1=Math.min(b.y1,p.y); b.x2=Math.max(b.x2,p.x); b.y2=Math.max(b.y2,p.y); });
    }
  }
  bbc.set(e,b); return b;
}
function gather(pt,rad,max){
  var m=lyMap(),A=ents(),o=[],i,e,b;
  for(i=0;i<A.length;i++){
    e=A[i]; if(!isVisible(e,m)) continue;
    b=bboxOf(e); if(!b||pt.x<b.x1-rad||pt.x>b.x2+rad||pt.y<b.y1-rad||pt.y>b.y2+rad) continue;
    o.push({e:e,b:b,ps:prims(e)}); if(max&&o.length>=max) break;
  }
  return o;
}

/* ---------- distância, projeção, interseção ---------- */
function nearSeg(p,a,b){
  var dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,t=l2?((p.x-a.x)*dx+(p.y-a.y)*dy)/l2:0;
  t=Math.max(0,Math.min(1,t)); return {x:a.x+dx*t,y:a.y+dy*t,z:0};
}
function nearPrim(p,pr){
  if(pr.k==='seg') return nearSeg(p,pr.a,pr.b);
  var dx=p.x-pr.c.x,dy=p.y-pr.c.y,d=Math.hypot(dx,dy);
  if(d<EPS) return arcEnd(pr,0);
  var a=Math.atan2(dy,dx);
  if(inArc(pr,a)) return {x:pr.c.x+pr.r*Math.cos(a),y:pr.c.y+pr.r*Math.sin(a),z:0};
  var e1=arcEnd(pr,0),e2=arcEnd(pr,1); return dist(p,e1)<=dist(p,e2)?e1:e2;
}
function ixSS(a,b,ext){
  var rx=a.b.x-a.a.x,ry=a.b.y-a.a.y,sx=b.b.x-b.a.x,sy=b.b.y-b.a.y,den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-12) return [];
  var qx=b.a.x-a.a.x,qy=b.a.y-a.a.y,t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  if(!ext&&(t<-EPS||t>1+EPS||u<-EPS||u>1+EPS)) return [];
  return [{x:a.a.x+t*rx,y:a.a.y+t*ry,z:0}];
}
function ixSA(s,ar,ext){
  var dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,fx=s.a.x-ar.c.x,fy=s.a.y-ar.c.y,A=dx*dx+dy*dy;
  if(A<EPS) return [];
  var B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-ar.r*ar.r,D=B*B-4*A*C;
  if(D<0) return [];
  var sq=Math.sqrt(D),ts=D<EPS?[-B/(2*A)]:[(-B-sq)/(2*A),(-B+sq)/(2*A)],o=[];
  ts.forEach(function(t){
    if(!ext&&(t<-EPS||t>1+EPS)) return;
    var p={x:s.a.x+dx*t,y:s.a.y+dy*t,z:0};
    if(!ext&&!inArc(ar,Math.atan2(p.y-ar.c.y,p.x-ar.c.x))) return;
    o.push(p);
  });
  return o;
}
function ixAA(a,b,ext){
  var d=dist(a.c,b.c);
  if(d<EPS||d>a.r+b.r+EPS||d<Math.abs(a.r-b.r)-EPS) return [];
  var x=(a.r*a.r-b.r*b.r+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.r*a.r-x*x)),
      ux=(b.c.x-a.c.x)/d,uy=(b.c.y-a.c.y)/d,mx=a.c.x+ux*x,my=a.c.y+uy*x,
      pts=[{x:mx-uy*h,y:my+ux*h,z:0}];
  if(h>1e-9) pts.push({x:mx+uy*h,y:my-ux*h,z:0});
  return pts.filter(function(p){
    return ext||(inArc(a,Math.atan2(p.y-a.c.y,p.x-a.c.x))&&inArc(b,Math.atan2(p.y-b.c.y,p.x-b.c.x)));
  });
}
function ixPrim(a,b,ext){
  if(a.k==='seg'&&b.k==='seg') return ixSS(a,b,ext);
  if(a.k==='seg') return ixSA(a,b,ext);
  if(b.k==='seg') return ixSA(b,a,ext);
  return ixAA(a,b,ext);
}
function ixItems(items,ext,pt,tol){
  var o=[],i,j,x,y,pa,pb,k,l,pts;
  for(i=0;i<items.length;i++) for(j=i;j<items.length;j++){
    if(i===j&&(ext||items[i].e.type!=='pline')) continue;
    pa=items[i].ps; pb=items[j].ps;
    for(k=0;k<pa.length;k++) for(l=(i===j?k+2:0);l<pb.length;l++){
      if(i===j&&items[i].e.closed&&k===0&&l===pb.length-1) continue;
      pts=ixPrim(pa[k],pb[l],ext);
      for(x=0;x<pts.length;x++) if(dist(pts[x],pt)<=tol) o.push({pt:pts[x]});
    }
  }
  return o;
}
function centroid(P){
  var A=0,cx=0,cy=0,n=P.length,i,p,q,f;
  for(i=0;i<n;i++){ p=P[i]; q=P[(i+1)%n]; f=p.x*q.y-q.x*p.y; A+=f; cx+=(p.x+q.x)*f; cy+=(p.y+q.y)*f; }
  if(Math.abs(A)<EPS){ cx=0; cy=0; P.forEach(function(v){ cx+=v.x; cy+=v.y; }); return {x:cx/n,y:cy/n,z:0}; }
  A*=0.5; return {x:cx/(6*A),y:cy/(6*A),z:0};
}
function perpPts(last,pr){
  if(pr.k==='seg'){
    var dx=pr.b.x-pr.a.x,dy=pr.b.y-pr.a.y,l2=dx*dx+dy*dy; if(l2<EPS) return [];
    var t=((last.x-pr.a.x)*dx+(last.y-pr.a.y)*dy)/l2; if(t<-EPS||t>1+EPS) return [];
    return [{x:pr.a.x+dx*t,y:pr.a.y+dy*t,z:0}];
  }
  var vx=last.x-pr.c.x,vy=last.y-pr.c.y,d=Math.hypot(vx,vy); if(d<EPS) return [];
  var ux=vx/d,uy=vy/d;
  return [{x:pr.c.x+ux*pr.r,y:pr.c.y+uy*pr.r,z:0},{x:pr.c.x-ux*pr.r,y:pr.c.y-uy*pr.r,z:0}]
    .filter(function(p){ return inArc(pr,Math.atan2(p.y-pr.c.y,p.x-pr.c.x)); });
}
function tanPts(last,pr){
  if(pr.k!=='arc') return [];
  var dx=last.x-pr.c.x,dy=last.y-pr.c.y,d=Math.hypot(dx,dy); if(d<=pr.r+EPS) return [];
  var base=Math.atan2(dy,dx),al=Math.acos(pr.r/d);
  return [base+al,base-al].map(function(a){ return {x:pr.c.x+pr.r*Math.cos(a),y:pr.c.y+pr.r*Math.sin(a),z:0}; })
    .filter(function(p){ return inArc(pr,Math.atan2(p.y-pr.c.y,p.x-pr.c.x)); });
}
function closestOf(arr,pt){
  var b=null,bd=1e300; arr.forEach(function(p){ var d=dist(p,pt); if(d<bd){ bd=d; b=p; } }); return b;
}
function hookPts(e,o,m){
  var t=T(e); if(!t||!t.snapPts) return;
  try{ (t.snapPts(e)||[]).forEach(function(p){ o.push({pt:p.pt||p,mode:p.mode||m}); }); }catch(x){}
}

/* ---------- registro e modos de OSNAP ---------- */
var modes={};
snap.register=function(name,fn){ modes[name]=fn; if(!(name in mode.osmodes)) mode.osmodes[name]=true; };
function reg(n,f){ snap.register(n,f); }

reg('endpoint',function(pt,c){
  var o=[]; c.items.forEach(function(it){
    if(!it.ps.length){ hookPts(it.e,o,'endpoint'); return; }
    it.ps.forEach(function(p){
      if(p.k==='seg'){
        if(!p.ap){ o.push({pt:p.a},{pt:p.b}); }
        else{ if(p.first) o.push({pt:p.a}); if(p.last) o.push({pt:p.b}); }
      } else if(!p.full){ o.push({pt:arcEnd(p,0)},{pt:arcEnd(p,1)}); }
    });
  });
  return o;
});
reg('midpoint',function(pt,c){
  var o=[]; c.items.forEach(function(it){
    it.ps.forEach(function(p){
      if(p.k==='seg'){ if(!p.ap) o.push({pt:{x:(p.a.x+p.b.x)/2,y:(p.a.y+p.b.y)/2,z:0}}); }
      else if(!p.full){ var s=norm(p.a2-p.a1)||TAU,a=p.a1+s/2; o.push({pt:{x:p.c.x+p.r*Math.cos(a),y:p.c.y+p.r*Math.sin(a),z:0}}); }
    });
  });
  return o;
});
reg('center',function(pt,c){
  var o=[]; c.items.forEach(function(it){
    var e=it.e; if((e.type==='circle'||e.type==='arc'||e.type==='ellipse')&&e.c) o.push({pt:e.c});
  });
  return o;
});
reg('geocenter',function(pt,c){
  var o=[]; c.items.forEach(function(it){
    var e=it.e; if(e.type==='pline'&&e.closed&&e.pts&&e.pts.length>2) o.push({pt:centroid(e.pts)});
  });
  return o;
});
reg('node',function(pt,c){
  var o=[]; c.items.forEach(function(it){
    var e=it.e; if((e.type==='point'||e.type==='tpoint'||e.type==='text'||e.type==='mtext'||e.type==='insert')&&e.p) o.push({pt:e.p});
  });
  return o;
});
reg('quadrant',function(pt,c){
  var o=[]; c.items.forEach(function(it){
    var e=it.e; if(e.type!=='circle'&&e.type!=='arc') return;
    var p=it.ps[0],k,a; if(!p) return;
    for(k=0;k<4;k++){ a=k*Math.PI/2; if(inArc(p,a)) o.push({pt:{x:p.c.x+p.r*Math.cos(a),y:p.c.y+p.r*Math.sin(a),z:0}}); }
  });
  return o;
});
reg('intersection',function(pt,c){ return ixItems(c.items,false,pt,c.tol); });
reg('apparent',function(pt,c){ return ixItems(c.wide(),true,pt,c.tol); });
reg('perpendicular',function(pt,c){
  if(!c.last) return [];
  var o=[]; c.items.forEach(function(it){ it.ps.forEach(function(p){
    var ed=dist(pt,nearPrim(pt,p)); if(ed>c.tol) return;
    var q=closestOf(perpPts(c.last,p),pt); if(q) o.push({pt:q,d:ed});
  }); });
  return o;
});
reg('tangent',function(pt,c){
  if(!c.last) return [];
  var o=[]; c.items.forEach(function(it){ it.ps.forEach(function(p){
    if(p.ap) return;
    var ed=dist(pt,nearPrim(pt,p)); if(ed>c.tol) return;
    var q=closestOf(tanPts(c.last,p),pt); if(q) o.push({pt:q,d:ed});
  }); });
  return o;
});
reg('nearest',function(pt,c){
  var o=[]; c.items.forEach(function(it){ it.ps.forEach(function(p){ var q=nearPrim(pt,p); o.push({pt:q,d:dist(q,pt)}); }); });
  return o;
});
reg('extension',function(pt,c){
  var o=[]; acq.forEach(function(a){
    if(a.dir){
      var vx=pt.x-a.pt.x,vy=pt.y-a.pt.y,pr=vx*a.dir.x+vy*a.dir.y; if(pr<=c.tol*0.2) return;
      var f={x:a.pt.x+a.dir.x*pr,y:a.pt.y+a.dir.y*pr,z:0};
      o.push({pt:f,d:Math.abs(vx*a.dir.y-vy*a.dir.x),guide:{from:a.pt,to:f}});
    } else if(a.arc){
      var k=a.arc,ang=Math.atan2(pt.y-k.c.y,pt.x-k.c.x),dd=Math.hypot(pt.x-k.c.x,pt.y-k.c.y),
          s=k.ccw?norm(ang-k.a):norm(k.a-ang);
      if(s<0.02||s>Math.PI) return;
      var g={x:k.c.x+k.r*Math.cos(ang),y:k.c.y+k.r*Math.sin(ang),z:0};
      o.push({pt:g,d:Math.abs(dd-k.r),guide:{from:a.pt,to:g}});
    }
  });
  return o;
});

function endpointsDir(e){
  var o=[],u,a1,a2,P,n;
  if(e.type==='line'){
    u=unit(e.p2,e.p1); if(u) o.push({pt:e.p1,dir:u});
    u=unit(e.p1,e.p2); if(u) o.push({pt:e.p2,dir:u});
  } else if(e.type==='arc'){
    a1=e.a1*D2R; a2=e.a2*D2R;
    o.push({pt:{x:e.c.x+e.r*Math.cos(a1),y:e.c.y+e.r*Math.sin(a1),z:0},arc:{c:e.c,r:e.r,a:a1,ccw:false}});
    o.push({pt:{x:e.c.x+e.r*Math.cos(a2),y:e.c.y+e.r*Math.sin(a2),z:0},arc:{c:e.c,r:e.r,a:a2,ccw:true}});
  } else if(e.type==='pline'&&!e.closed&&e.pts&&e.pts.length>1){
    P=e.pts; n=P.length;
    if(!P[0].bulge){ u=unit(P[1],P[0]); if(u) o.push({pt:P[0],dir:u}); }
    if(!P[n-2].bulge){ u=unit(P[n-2],P[n-1]); if(u) o.push({pt:P[n-1],dir:u}); }
  }
  return o;
}
/* paira o cursor sobre uma extremidade: adquire (ou remove, se já adquirida) */
snap.acquire=function(pt,ctx){
  var z=(ctx&&ctx.zoom)||zoomNow(),tol=(ctx&&ctx.tol)||(mode.aperture/z),got=false;
  gather(pt,tol).forEach(function(it){
    endpointsDir(it.e).forEach(function(ed){
      if(dist(ed.pt,pt)>tol) return;
      var k=-1; acq.forEach(function(a,i){ if(dist(a.pt,ed.pt)<tol/2) k=i; });
      if(k>=0) acq.splice(k,1); else{ acq.push(ed); if(acq.length>4) acq.shift(); }
      got=true;
    });
  });
  return got;
};
snap.clearAcquired=function(){ acq.length=0; };
snap.override=function(m){ snap._override=m||null; };
snap.clearOverride=function(){ snap._override=null; };

function enabled(name,only){
  if(only){ only=typeof only==='string'?[only]:only; return only.indexOf(name)>=0; }
  return !!mode.osmodes[name];
}
function bestOsnap(pt,tol,z,last,only){
  var items=gather(pt,2*tol),wideCache=null,cands=[];
  var c={pt:pt,tol:tol,zoom:z,last:last,items:items,
         wide:function(){ return wideCache||(wideCache=gather(pt,160/z,40)); }};
  Object.keys(modes).forEach(function(name){
    if(!enabled(name,only)) return;
    var r; try{ r=modes[name](pt,c,c.tol); }catch(x){ r=null; }
    if(!r) return; if(!Array.isArray(r)) r=[r];
    r.forEach(function(cd){
      if(!cd||!cd.pt) return;
      cd.mode=cd.mode||name;
      if(cd.mode!==name&&!enabled(cd.mode,only)) return;
      if(cd.d==null) cd.d=(cd.dist!=null?cd.dist:dist(cd.pt,pt));
      if(cd.d<=tol) cands.push(cd);
    });
  });
  var best=null,bs=1e300;
  cands.forEach(function(cd){
    var s=cd.d*z+(PRI[cd.mode]!=null?PRI[cd.mode]:6)*0.35;
    if(cd.mode==='nearest') s+=1e6;
    if(s<bs){ bs=s; best=cd; }
  });
  return best;
}

/* ---------- resolve: osnap → ortho/polar → snap ---------- */
function lastPt(){ return CAD.lastPoint||(CAD.input&&CAD.input.lastPoint)||null; }
function snapStep(){ return mode.snapStep||mode.gridStep||1; }

snap.resolve=function(pt,ctx){
  ctx=ctx||{};
  var z=ctx.zoom||zoomNow(),tol=ctx.tol||(mode.aperture/z),ov=ctx.only||snap._override,
      last=ctx.last||ctx.base||null,
      res={pt:{x:pt.x,y:pt.y,z:pt.z||0},mode:null,guide:null,label:null};
  if(ctx.osnap!==false&&(ov||mode.osnap)){
    var c=bestOsnap(pt,tol,z,last,ov||null);
    if(c){
      res.pt={x:c.pt.x,y:c.pt.y,z:pt.z||0}; res.mode=c.mode; res.guide=c.guide||null;
      res.label=LAB[c.mode]||c.mode; snap.last=res; return res;
    }
  }
  var u=null,dx,dy,d,st=snapStep();
  if(last&&ctx.track!==false){
    dx=pt.x-last.x; dy=pt.y-last.y; d=Math.hypot(dx,dy);
    if(d>EPS){
      if(mode.ortho){
        u=Math.abs(dx)>=Math.abs(dy)?{x:dx<0?-1:1,y:0}:{x:0,y:dy<0?-1:1}; res.mode='ortho';
      } else if(mode.polar){
        var inc=mode.polarAngle||90,list=[],a,bp=1e300,bu=null;
        for(a=0;a<360-EPS;a+=inc) list.push(a);
        (mode.polarExtra||[]).forEach(function(x){ list.push(x); });
        list.forEach(function(deg){
          var ux=Math.cos(deg*D2R),uy=Math.sin(deg*D2R),pr=dx*ux+dy*uy,pp=Math.abs(dx*uy-dy*ux);
          if(pr>0&&pp<=tol&&pp<bp){ bp=pp; bu={x:ux,y:uy}; }
        });
        if(bu){ u=bu; res.mode='polar'; }
      }
    }
  }
  if(u){
    var pr=dx*u.x+dy*u.y; if(mode.snap) pr=Math.round(pr/st)*st;
    res.pt={x:last.x+u.x*pr,y:last.y+u.y*pr,z:pt.z||0};
    var ang=norm(Math.atan2(u.y,u.x))*R2D;
    res.guide={from:last,to:res.pt,angle:ang};
    res.label=(res.mode==='ortho'?'Orto':'Polar')+': '+fmt(pr)+' < '+fmt(ang)+'°';
  } else if(mode.snap){
    res.pt={x:Math.round(pt.x/st)*st,y:Math.round(pt.y/st)*st,z:pt.z||0}; res.mode='snap';
  }
  snap.last=res; return res;
};

/* ---------- alternância de modos ---------- */
function enforceExcl(){
  if(mode.ortho&&mode.polar){ if(mode.ortho!==pOrtho) mode.polar=false; else mode.ortho=false; }
  pOrtho=mode.ortho; pPolar=mode.polar;
}
var pOrtho=mode.ortho,pPolar=mode.polar;
on('mode:changed',enforceExcl);
snap.toggle=function(name,val){
  if(!TOG[name]) return;
  var v;
  if(val===undefined&&typeof CAD.toggle==='function'){ CAD.toggle(name); v=!!mode[name]; enforceExcl(); emit('mode:changed',{name:name,value:v}); return v; }
  v=(val===undefined)?!mode[name]:!!val; mode[name]=v; enforceExcl();
  emit('mode:changed',{name:name,value:v});
  say(TOG[name]+': '+(v?'ligado':'desligado'));
  return v;
};

/* ---------- seleção ---------- */
if(!sel.set){
  var _s=[];
  sel.set=function(ids){ _s=(ids||[]).slice(); emit('sel:changed',_s.slice()); };
  sel.add=function(ids){ (ids||[]).forEach(function(i){ if(_s.indexOf(i)<0) _s.push(i); }); emit('sel:changed',_s.slice()); };
  sel.clear=function(){ _s=[]; emit('sel:changed',[]); };
  sel.list=function(){ return _s.slice(); };
}
function curIds(){
  var o=[],v;
  if(typeof sel.list==='function') v=sel.list();
  else if(typeof sel.ids==='function') v=sel.ids();
  else v=sel.ids;
  if(v&&v.forEach) v.forEach(function(x){ o.push(x); });
  return o;
}
var cur=[],prev=[];
function sameSet(a,b){ return a.length===b.length&&a.every(function(x){ return b.indexOf(x)>=0; }); }
on('sel:changed',function(){ var n=curIds(); if(!sameSet(n,cur)){ if(cur.length) prev=cur; cur=n; } });

function hitDist(e,pt,tol){
  var ps=prims(e),best=null,i,d;
  if(ps.length){
    for(i=0;i<ps.length;i++){ d=dist(pt,nearPrim(pt,ps[i])); if(best===null||d<best) best=d; }
    return best<=tol?best:null;
  }
  var t=T(e);
  if(t&&t.hit){ try{ var h=t.hit(e,pt,tol); if(h) return (typeof h==='number')?h:0; }catch(x){} }
  var b=bboxOf(e);
  if(b&&pt.x>=b.x1-tol&&pt.x<=b.x2+tol&&pt.y>=b.y1-tol&&pt.y<=b.y2+tol) return 0;
  return null;
}
function rectOf(a,b){ return {x1:Math.min(a.x,b.x),y1:Math.min(a.y,b.y),x2:Math.max(a.x,b.x),y2:Math.max(a.y,b.y)}; }
function inR(p,r){ return p.x>=r.x1&&p.x<=r.x2&&p.y>=r.y1&&p.y<=r.y2; }
function segHitsRect(a,b,r){
  if(inR(a,r)||inR(b,r)) return true;
  var A={x:r.x1,y:r.y1},B={x:r.x2,y:r.y1},C={x:r.x2,y:r.y2},D={x:r.x1,y:r.y2},s=seg(a,b);
  return ixSS(s,seg(A,B),false).length>0||ixSS(s,seg(B,C),false).length>0||
         ixSS(s,seg(C,D),false).length>0||ixSS(s,seg(D,A),false).length>0;
}
function crosses(e,r){
  var b=bboxOf(e); if(!b) return false;
  if(b.x2<r.x1||b.x1>r.x2||b.y2<r.y1||b.y1>r.y2) return false;
  var ps=prims(e); if(!ps.length) return true;           /* texto, insert, hatch: bbox */
  var i,j,P;
  for(i=0;i<ps.length;i++){
    if(ps[i].k==='seg'){ if(segHitsRect(ps[i].a,ps[i].b,r)) return true; continue; }
    P=samplePts({type:'arc',c:ps[i].c,r:ps[i].r,a1:ps[i].a1*R2D,a2:(ps[i].full?ps[i].a1*R2D+360:ps[i].a2*R2D)});
    for(j=0;j<P.length-1;j++) if(segHitsRect(P[j],P[j+1],r)) return true;
  }
  return false;
}
function within(e,r){ var b=bboxOf(e); return !!b&&b.x1>=r.x1&&b.x2<=r.x2&&b.y1>=r.y1&&b.y2<=r.y2; }

/* find: puro, não altera a seleção. modos: click|window|crossing|box|all|previous|last|none */
sel.find=function(m,a,b,o){
  o=o||{}; var map=lyMap(),A=ents(),out=[],i,e,r;
  if(m==='none') return [];
  if(m==='all'){ A.forEach(function(x){ if(isSelectable(x,map)) out.push(x.id); }); return out; }
  if(m==='last'){ for(i=A.length-1;i>=0;i--) if(isSelectable(A[i],map)) return [A[i].id]; return []; }
  if(m==='previous'){
    var ex={}; A.forEach(function(x){ if(isSelectable(x,map)) ex[x.id]=1; });
    return prev.filter(function(id){ return ex[id]; });
  }
  if(m==='click'){
    var tol=o.tol||((mode.pickbox||6)/zoomNow()),bd=null,bid=null;
    for(i=0;i<A.length;i++){
      e=A[i]; if(!isSelectable(e,map)) continue;
      var bb=bboxOf(e); if(!bb||a.x<bb.x1-tol||a.x>bb.x2+tol||a.y<bb.y1-tol||a.y>bb.y2+tol) continue;
      var d=hitDist(e,a,tol);
      if(d!==null&&(bd===null||d<=bd)){ bd=d; bid=e.id; }       /* empate: o mais recente */
    }
    return bid===null?[]:[bid];
  }
  if(m==='box') m=(b.x<a.x)?'crossing':'window';
  r=rectOf(a,b);
  A.forEach(function(x){
    if(!isSelectable(x,map)) return;
    if(m==='window'?within(x,r):crosses(x,r)) out.push(x.id);
  });
  return out;
};
sel.hit=function(pt,px){ var r=sel.find('click',pt,null,{tol:(px||mode.pickbox||6)/zoomNow()}); return r.length?r[0]:null; };

/* pick: mesma semântica da P1 (retorna ids, não altera a seleção). Estende a P1 com box e previous. */
sel.pick=function(m,a,b,o){ return sel.find(m,a,b,o); };
/* apply: find + aplica na seleção. opts: {add, remove, toggle} */
function applyPick(m,a,b,o){
  o=o||{}; var ids=sel.find(m,a,b,o);
  if(o.toggle&&ids.length){ if(curIds().indexOf(ids[0])>=0) o.remove=true; else o.add=true; }
  if(o.remove){ sel.set(curIds().filter(function(x){ return ids.indexOf(x)<0; })); }
  else if(o.add){ if(ids.length) sel.add(ids); }
  else{ sel.set(ids); }
  return ids;
}
sel.apply=applyPick;
if(sel.mouse===undefined) sel.mouse=true;     /* false = P3 não trata o mouse ocioso */
if(snap.drawMarkers===undefined) snap.drawMarkers=true;   /* false = P3 não desenha marcadores */

/* ---------- interface: overlay, dynamic input, teclas, mouse ---------- */
var main=null,ovl=null,dyn=null,raf=0,busy=0,drag=null,rubber=null,hover=null,acqT=0;
function awaiting(){ try{ if(CAD.input&&typeof CAD.input.pending==='function') return !!CAD.input.pending(); }catch(x){} return busy>0; }
function isIdle(){ try{ if(CAD.cmd&&typeof CAD.cmd.activeName==='function') return !CAD.cmd.activeName(); }catch(x){} return busy===0; }
function pendBase(){ try{ var p=CAD.input&&CAD.input.pending&&CAD.input.pending(); if(p&&p.base&&isFinite(p.base.x)) return p.base; }catch(x){} return null; }

function findMain(){
  if(main&&main.isConnected) return main;
  main=(CAD.ui&&CAD.ui.canvas)||document.getElementById('cad-canvas')||document.getElementById('canvas')||
       document.querySelector('canvas:not(#cad-overlay)')||null;
  return main;
}
function isMain(t){ return !!t&&t.tagName==='CANVAS'&&t.id!=='cad-overlay'; }
function ensureOverlay(){
  if(ovl&&ovl.isConnected) return ovl;
  if(!findMain()) return null;
  ovl=document.createElement('canvas'); ovl.id='cad-overlay';
  ovl.style.cssText='position:fixed;pointer-events:none;z-index:6';
  document.body.appendChild(ovl); return ovl;
}
function req(){ if(!raf) raf=requestAnimationFrame(draw); }

function marker(g,m,x,y){
  var s=7; g.save(); g.lineWidth=2; g.strokeStyle='#c27c00'; g.setLineDash([]); g.beginPath();
  switch(m){
    case 'endpoint': g.rect(x-s,y-s,2*s,2*s); break;
    case 'midpoint': g.moveTo(x,y-s); g.lineTo(x+s,y+s); g.lineTo(x-s,y+s); g.closePath(); break;
    case 'center': g.arc(x,y,s,0,TAU); break;
    case 'geocenter': g.arc(x,y,s,0,TAU); g.moveTo(x-s,y-s); g.lineTo(x+s,y+s); break;
    case 'node': g.arc(x,y,s,0,TAU); g.moveTo(x-s,y-s); g.lineTo(x+s,y+s); g.moveTo(x-s,y+s); g.lineTo(x+s,y-s); break;
    case 'quadrant': g.moveTo(x,y-s); g.lineTo(x+s,y); g.lineTo(x,y+s); g.lineTo(x-s,y); g.closePath(); break;
    case 'intersection': g.moveTo(x-s,y-s); g.lineTo(x+s,y+s); g.moveTo(x-s,y+s); g.lineTo(x+s,y-s); break;
    case 'apparent': g.setLineDash([3,2]); g.rect(x-s,y-s,2*s,2*s); g.moveTo(x-s,y-s); g.lineTo(x+s,y+s); g.moveTo(x-s,y+s); g.lineTo(x+s,y-s); break;
    case 'extension': g.setLineDash([2,2]); g.moveTo(x-s,y); g.lineTo(x+s,y); g.moveTo(x,y-s); g.lineTo(x,y+s); break;
    case 'perpendicular': g.moveTo(x-s,y-s); g.lineTo(x-s,y+s); g.lineTo(x+s,y+s); g.moveTo(x-s,y); g.lineTo(x,y); g.lineTo(x,y+s); break;
    case 'tangent': g.arc(x,y,s-1,0,TAU); g.moveTo(x-s,y-s); g.lineTo(x+s,y-s); break;
    case 'nearest': g.moveTo(x-s,y-s); g.lineTo(x+s,y-s); g.lineTo(x-s,y+s); g.lineTo(x+s,y+s); g.closePath(); break;
    default: g.rect(x-s,y-s,2*s,2*s);
  }
  g.stroke(); g.restore();
}
function drawGrid(g,w,h,z){
  if(!mode.grid||(CAD.render&&CAD.render.drawsGrid)) return;
  var st=mode.gridStep||1; while(st*z<8) st*=5;
  var a=s2w(0,h),b=s2w(w,0),
      x0=Math.floor(Math.min(a.x,b.x)/st)*st,x1=Math.max(a.x,b.x),
      y0=Math.floor(Math.min(a.y,b.y)/st)*st,y1=Math.max(a.y,b.y);
  if(((x1-x0)/st)*((y1-y0)/st)>40000) return;
  var o=w2s({x:x0,y:y0}),sx=w2s({x:x0+st,y:y0}).x-o.x,sy=w2s({x:x0,y:y0+st}).y-o.y,i,j;
  g.fillStyle='rgba(0,0,0,0.28)';
  for(i=0;x0+i*st<=x1;i++) for(j=0;y0+j*st<=y1;j++) g.fillRect(Math.round(o.x+i*sx),Math.round(o.y+j*sy),1,1);
}
function draw(){
  raf=0; var m=findMain(),o=ensureOverlay(); if(!m||!o) return;
  var r=m.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=r.width,h=r.height;
  o.style.left=r.left+'px'; o.style.top=r.top+'px'; o.style.width=w+'px'; o.style.height=h+'px';
  if(o.width!==Math.round(w*dpr)||o.height!==Math.round(h*dpr)){ o.width=Math.round(w*dpr); o.height=Math.round(h*dpr); }
  var g=o.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
  drawGrid(g,w,h,zoomNow());
  if(rubber){
    var p1=w2s(rubber.p1),p2=w2s(rubber.p2),cross=rubber.p2.x<rubber.p1.x;
    g.save();
    g.fillStyle=cross?'rgba(0,160,60,0.12)':'rgba(0,90,255,0.12)';
    g.strokeStyle=cross?'#00a03c':'#005aff'; g.lineWidth=1; g.setLineDash(cross?[5,4]:[]);
    g.fillRect(Math.min(p1.x,p2.x),Math.min(p1.y,p2.y),Math.abs(p2.x-p1.x),Math.abs(p2.y-p1.y));
    g.strokeRect(Math.min(p1.x,p2.x)+.5,Math.min(p1.y,p2.y)+.5,Math.abs(p2.x-p1.x),Math.abs(p2.y-p1.y));
    g.restore();
  }
  if(awaiting()&&mode.osnap) acq.forEach(function(a){
    var s=w2s(a.pt); g.save(); g.strokeStyle='#c27c00'; g.lineWidth=1.5; g.beginPath();
    g.moveTo(s.x-5,s.y); g.lineTo(s.x+5,s.y); g.moveTo(s.x,s.y-5); g.lineTo(s.x,s.y+5); g.stroke(); g.restore();
  });
  if(hover&&awaiting()){
    var res=hover.res;
    if(res.guide){
      var f=w2s(res.guide.from),t=w2s(res.guide.to);
      g.save(); g.strokeStyle='#6a7fb5'; g.lineWidth=1; g.setLineDash([4,4]);
      g.beginPath(); g.moveTo(f.x,f.y); g.lineTo(t.x,t.y); g.stroke(); g.restore();
    }
    if(res.mode&&LAB[res.mode]&&snap.drawMarkers!==false){
      var s=w2s(res.pt); marker(g,res.mode,s.x,s.y);
      g.save(); g.font='12px system-ui,sans-serif'; g.fillStyle='#7a4d00'; g.fillText(res.label,s.x+12,s.y-12); g.restore();
    }
  }
}

function showDyn(ev,res,base){
  if(!mode.dynin||!awaiting()){ hideDyn(); return; }
  if(!dyn){
    dyn=document.createElement('div'); dyn.id='cad-dynin';
    dyn.style.cssText='position:fixed;z-index:7;pointer-events:none;font:12px system-ui,sans-serif;background:#fff;'+
      'border:1px solid #666;padding:2px 6px;color:#111;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)';
    document.body.appendChild(dyn);
  }
  var p=res.pt,l=base||null,txt;
  if(l){ var d=dist(p,l); txt=fmt(d)+' < '+fmt(norm(Math.atan2(p.y-l.y,p.x-l.x))*R2D)+'°'; }
  else txt=fmt(p.x)+', '+fmt(p.y);
  if(res.mode&&LAB[res.mode]) txt+='  ['+LAB[res.mode]+']';
  dyn.textContent=txt; dyn.style.left=(ev.clientX+18)+'px'; dyn.style.top=(ev.clientY+18)+'px'; dyn.style.display='block';
}
function hideDyn(){ if(dyn) dyn.style.display='none'; }

/* seleção por mouse quando nenhum comando está ativo */
document.addEventListener('mousedown',function(ev){
  if(ev.button!==0||sel.mouse===false||!isIdle()||!isMain(ev.target)) return;
  main=ev.target; var r=main.getBoundingClientRect();
  drag={x0:ev.clientX-r.left,y0:ev.clientY-r.top,x:ev.clientX-r.left,y:ev.clientY-r.top,moved:false};
},true);
document.addEventListener('mousemove',function(ev){
  var t=ev.target;
  if(!isMain(t)&&!drag){ hover=null; hideDyn(); req(); return; }
  var m=drag?main:t; main=m; ensureOverlay();
  var r=m.getBoundingClientRect(),sx=ev.clientX-r.left,sy=ev.clientY-r.top,w=s2w(sx,sy);
  if(drag){
    drag.x=sx; drag.y=sy;
    if(!drag.moved&&Math.hypot(sx-drag.x0,sy-drag.y0)>4) drag.moved=true;
    if(drag.moved) rubber={p1:s2w(drag.x0,drag.y0),p2:w};
  }
  if(awaiting()){
    var bs=pendBase(); hover={res:snap.resolve(w,{base:bs}),base:bs}; showDyn(ev,hover.res,bs);
    clearTimeout(acqT);
    if(mode.osnap&&mode.osmodes.extension) acqT=setTimeout(function(){ snap.acquire(w); req(); },350);
  } else { hover=null; hideDyn(); }
  req();
},true);
document.addEventListener('mouseup',function(ev){
  if(!drag) return;
  var d=drag,w; drag=null; rubber=null;
  if(ev.button!==0||!isIdle()){ req(); return; }
  if(!d.moved){
    w=s2w(d.x,d.y);
    if(ev.shiftKey) applyPick('click',w,null,{toggle:true});
    else applyPick('click',w,null,{});
  } else {
    applyPick('box',s2w(d.x0,d.y0),s2w(d.x,d.y),{add:ev.shiftKey});
  }
  req();
},true);
sel.rubberband=function(p1,p2){ rubber=p1&&p2?{p1:p1,p2:p2}:null; req(); };

on('cmd:start',function(){ busy++; req(); });
on('cmd:end',function(){ busy=Math.max(0,busy-1); if(!busy){ hover=null; hideDyn(); snap.clearAcquired(); snap.clearOverride(); } req(); });
on('view:changed',req); on('mode:changed',req); on('doc:changed',req);

/* teclas de função e atalhos */
document.addEventListener('keydown',function(ev){
  var k=ev.key,tg=ev.target&&ev.target.tagName,
      typing=tg==='INPUT'||tg==='TEXTAREA'||(ev.target&&ev.target.isContentEditable),
      map={F3:'osnap',F7:'grid',F8:'ortho',F9:'snap',F10:'polar',F12:'dynin'};
  if(map[k]&&!ev.ctrlKey&&!ev.altKey){
    ev.preventDefault();
    var nm=map[k],v0=mode[nm];          /* se a P1 já tratou a tecla, o modo mudou: não repete */
    setTimeout(function(){ if(mode[nm]===v0) snap.toggle(nm); },0);
    return;
  }
  if(k==='Escape'&&isIdle()){ rubber=null; drag=null; if(sel.clear) sel.clear(); else sel.set([]); req(); return; }
  if(typing) return;
  if((ev.ctrlKey||ev.metaKey)&&(k==='a'||k==='A')&&isIdle()){ ev.preventDefault(); applyPick('all'); }
},true);

/* botões na barra de status (se #statusbar existir) */
function buildStatus(){
  var bar=document.getElementById('statusbar')||(CAD.ui&&CAD.ui.statusEl);
  if(!bar||bar.querySelector('.cad-p3-tog')||/OSNAP|ORTHO/i.test(bar.textContent||'')) return;
  var box=document.createElement('span'); box.className='cad-p3-tog'; box.style.cssText='display:inline-flex;gap:4px;margin-left:8px';
  var items=[['osnap','OSNAP','F3'],['grid','GRID','F7'],['ortho','ORTHO','F8'],['snap','SNAP','F9'],['polar','POLAR','F10'],['dynin','DYN','F12']],btns={};
  items.forEach(function(it){
    var b=document.createElement('button'); b.type='button'; b.textContent=it[1]; b.title=it[1]+' ('+it[2]+')';
    b.style.cssText='font:11px system-ui,sans-serif;padding:1px 6px;border:1px solid #999;border-radius:3px;cursor:pointer';
    b.addEventListener('click',function(){ snap.toggle(it[0]); });
    btns[it[0]]=b; box.appendChild(b);
  });
  function refresh(){ items.forEach(function(it){ var on=!!mode[it[0]]; btns[it[0]].style.background=on?'#cfe3ff':'#f4f4f4'; btns[it[0]].style.color=on?'#0b3d91':'#444'; }); }
  on('mode:changed',refresh); refresh(); bar.appendChild(box);
}

/* ---------- comandos ---------- */
var ABR={end:'endpoint',mid:'midpoint',cen:'center',gce:'geocenter',nod:'node',qua:'quadrant',
         int:'intersection',ext:'extension',per:'perpendicular',tan:'tangent',nea:'nearest',app:'apparent'};
function regCmds(){
  if(!CAD.cmd||!CAD.cmd.register) return;
  [['OSNAP',['OSN'],'osnap'],['ORTHO',['OR'],'ortho'],['POLAR',['POL'],'polar'],
   ['GRID',['GR'],'grid'],['SNAP',['SN'],'snap'],['DYN',['DYNIN'],'dynin']].forEach(function(c){
    CAD.cmd.register({name:c[0],alias:c[1],run:async function(){ snap.toggle(c[2]); }});
  });
  CAD.cmd.register({name:'OSMODE',alias:['OSM'],run:async function(){
    var s=await CAD.input.string('Modos (end,mid,cen,gce,nod,qua,int,ext,per,tan,nea,app | all | none; vazio = ver)',{allowEmpty:true});
    s=(s||'').trim().toLowerCase();
    if(!s){ say('OSMODE ativos: '+Object.keys(mode.osmodes).filter(function(k){ return mode.osmodes[k]; }).join(', ')); return; }
    var on={};
    s.split(/[\s,;]+/).forEach(function(t){
      if(t==='all') Object.keys(mode.osmodes).forEach(function(k){ on[k]=1; });
      else if(ABR[t.slice(0,3)]) on[ABR[t.slice(0,3)]]=1;
    });
    Object.keys(mode.osmodes).forEach(function(k){ mode.osmodes[k]=!!on[k]; });
    emit('mode:changed',{name:'osmodes'}); say('OSMODE atualizado.');
  }});
  CAD.cmd.register({name:'GRIDUNIT',alias:[],run:async function(){
    var v=await CAD.input.number('Espaçamento da grade <'+mode.gridStep+'>',{}); if(v>0){ mode.gridStep=v; emit('mode:changed',{name:'gridStep'}); }
  }});
  CAD.cmd.register({name:'SNAPUNIT',alias:[],run:async function(){
    var v=await CAD.input.number('Passo do snap <'+snapStep()+'>',{}); if(v>0){ mode.snapStep=v; emit('mode:changed',{name:'snapStep'}); }
  }});
  CAD.cmd.register({name:'POLARANG',alias:[],run:async function(){
    var v=await CAD.input.angle('Incremento polar em graus <'+mode.polarAngle+'>',{}); if(v>0){ mode.polarAngle=v; emit('mode:changed',{name:'polarAngle'}); }
  }});
  CAD.cmd.register({name:'SELALL',alias:[],run:async function(){ var n=applyPick('all').length; say(n+' objeto(s) selecionado(s).'); }});
}
regCmds();
function init(){ ensureOverlay(); buildStatus(); req(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else setTimeout(init,0);

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p3=function(){
  var ok=0,bad=0;
  function chk(n,c){ if(c) ok++; else{ bad++; console.error('P3 FALHOU: '+n); } }
  function nr(a,b,e){ return Math.abs(a-b)<=(e||1e-3); }
  function P(x,y){ return {x:x,y:y,z:0}; }
  function L(id,x1,y1,x2,y2){ return {id:id,type:'line',layer:'0',color:null,lw:null,ltype:null,space:'model',p1:P(x1,y1),p2:P(x2,y2)}; }
  function C(id,x,y,r){ return {id:id,type:'circle',layer:'0',color:null,lw:null,ltype:null,space:'model',c:P(x,y),r:r}; }
  var sv={osnap:mode.osnap,ortho:mode.ortho,polar:mode.polar,snap:mode.snap,polarAngle:mode.polarAngle,snapStep:mode.snapStep},
      oldDoc=CAD.doc,oldOv=snap._override,oldAcq=acq.slice();
  function doc(es){
    CAD.doc={version:1,units:'m',layers:[{name:'0',on:true,frozen:false,locked:false}],entities:es,blocks:{},dimstyles:{},textstyles:{},layouts:[],current:{layer:'0'}};
    clearCache();
  }
  function R(pt,only,extra){ var c={tol:0.5,zoom:1,only:only,osnap:true}; for(var k in extra) c[k]=extra[k]; return snap.resolve(pt,c); }
  try{
    snap._override=null; acq.length=0;
    var r;
    doc([L(1,0,0,10,0)]);
    r=R(P(0.1,0.1),['endpoint'],{}); chk('endpoint',r.mode==='endpoint'&&nr(r.pt.x,0)&&nr(r.pt.y,0));
    r=R(P(5.1,0.2),['midpoint'],{}); chk('midpoint',r.mode==='midpoint'&&nr(r.pt.x,5)&&nr(r.pt.y,0));
    r=R(P(3,0.2),['nearest'],{}); chk('nearest',r.mode==='nearest'&&nr(r.pt.x,3)&&nr(r.pt.y,0));
    r=R(P(5.1,0.1),['perpendicular'],{last:P(5,5)}); chk('perpendicular',r.mode==='perpendicular'&&nr(r.pt.x,5)&&nr(r.pt.y,0));
    r=R(P(6,3),['endpoint'],{}); chk('fora da abertura não captura',r.mode===null);
    doc([C(1,20,20,5)]);
    r=R(P(20.2,19.9),['center'],{}); chk('center',r.mode==='center'&&nr(r.pt.x,20)&&nr(r.pt.y,20));
    r=R(P(25.1,20.1),['quadrant'],{}); chk('quadrant',r.mode==='quadrant'&&nr(r.pt.x,25)&&nr(r.pt.y,20));
    doc([L(1,40,50,70,50),L(2,50,40,50,70)]);
    r=R(P(50.1,49.9),['intersection'],{}); chk('intersection',r.mode==='intersection'&&nr(r.pt.x,50)&&nr(r.pt.y,50));
    r=R(P(50.1,49.9),['apparent'],{}); chk('apparent',r.mode==='apparent'&&nr(r.pt.x,50)&&nr(r.pt.y,50));
    doc([C(1,0,0,5)]);
    r=R(P(2.6,4.2),['tangent'],{last:P(10,0)}); chk('tangent',r.mode==='tangent'&&nr(r.pt.x,2.5)&&nr(r.pt.y,4.330));
    doc([{id:1,type:'pline',layer:'0',space:'model',closed:true,pts:[{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:2,z:0},{x:0,y:2,z:0}]}]);
    r=R(P(2.1,1.1),['geocenter'],{}); chk('geocenter',r.mode==='geocenter'&&nr(r.pt.x,2)&&nr(r.pt.y,1));
    doc([]);
    mode.ortho=true; mode.polar=false; mode.snap=false;
    r=snap.resolve(P(10,1),{last:P(0,0),osnap:false,zoom:1,tol:0.5}); chk('ortho',r.mode==='ortho'&&nr(r.pt.x,10)&&nr(r.pt.y,0));
    mode.ortho=false; mode.polar=true; mode.polarAngle=45;
    r=snap.resolve(P(10,9.5),{last:P(0,0),osnap:false,zoom:1,tol:0.5}); chk('polar 45',r.mode==='polar'&&nr(r.pt.x,9.75)&&nr(r.pt.y,9.75));
    mode.polar=false; mode.snap=true; mode.snapStep=1;
    r=snap.resolve(P(3.4,7.6),{osnap:false,zoom:1}); chk('snap',r.mode==='snap'&&nr(r.pt.x,3)&&nr(r.pt.y,8));
    mode.snap=false;
    doc([C(1,0,0,1),L(2,-5,-5,5,5),L(3,100,100,101,101)]);
    chk('window',sel.find('window',P(-2,-2),P(2,2)).join()==='1');
    chk('crossing',sel.find('crossing',P(-2,-2),P(2,2)).slice().sort().join()==='1,2');
    chk('box E→D = window',sel.find('box',P(-2,-2),P(2,2)).join()==='1');
    chk('box D→E = crossing',sel.find('box',P(2,2),P(-2,-2)).slice().sort().join()==='1,2');
    chk('click',sel.find('click',P(0.02,1.0),null,{tol:0.1}).join()==='1');
    chk('click vazio',sel.find('click',P(50,0),null,{tol:0.1}).length===0);
    chk('all',sel.find('all').length===3);
    chk('last',sel.find('last').join()==='3');
    CAD.doc.layers[0].locked=true; chk('layer travada não seleciona',sel.find('all').length===0);
    CAD.doc.layers[0].locked=false; CAD.doc.layers[0].on=false; chk('layer desligada não seleciona',sel.find('all').length===0);
  } finally {
    CAD.doc=oldDoc; clearCache(); snap._override=oldOv; acq.length=0; oldAcq.forEach(function(a){ acq.push(a); });
    mode.osnap=sv.osnap; mode.ortho=sv.ortho; mode.polar=sv.polar; mode.snap=sv.snap; mode.polarAngle=sv.polarAngle; mode.snapStep=sv.snapStep;
  }
  console.log('P3 testes: '+ok+' ok, '+bad+' falha(s)');
  return {ok:ok,fail:bad};
};

})(window.CAD=window.CAD||{});
/* ==== END:3 ==== */
