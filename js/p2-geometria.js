/* ==== PART:2 ==== */
(function(CAD){
'use strict';
/* CAD.geom: geometria pura (sem DOM). Parâmetros angulares das funções = RADIANOS.
   Dados de entidade (a1, a2, rot, ellipse a1/a2, xline dir numérico) = GRAUS, anti-horário a partir de +X. */
var TAU=Math.PI*2,EPS=1e-9,D2R=Math.PI/180,R2D=180/Math.PI,G=CAD.geom={};
function P(x,y,z){return {x:x,y:y,z:z||0};}
function nA(a){a=a%TAU;return a<0?a+TAU:a;}
var KEEP=['layer','color','lw','ltype','space'];
function props(e){var o={};KEEP.forEach(function(k){if(e[k]!==undefined)o[k]=e[k];});return o;}
function mk(b,o){for(var k in o)b[k]=o[k];return b;}
function cp(p){return P(p.x,p.y,p.z);}

/* ---------- vetores ---------- */
G.EPS=EPS;
G.add=function(a,b){return P(a.x+b.x,a.y+b.y,(a.z||0)+(b.z||0));};
G.sub=function(a,b){return P(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));};
G.mul=function(v,k){return P(v.x*k,v.y*k,(v.z||0)*k);};
G.dot=function(a,b){return a.x*b.x+a.y*b.y;};
G.cross=function(a,b){return a.x*b.y-a.y*b.x;};
G.len=function(v){return Math.hypot(v.x,v.y);};
G.dist=function(a,b){return Math.hypot(a.x-b.x,a.y-b.y);};
G.unit=function(v){var l=Math.hypot(v.x,v.y);return l<EPS?P(0,0):P(v.x/l,v.y/l);};
G.ang=function(v){return Math.atan2(v.y,v.x);};
G.polar=function(p,a,d){return P(p.x+d*Math.cos(a),p.y+d*Math.sin(a),p.z);};
G.normAng=nA;
G.rot=function(p,a,c){c=c||P(0,0);var s=Math.sin(a),k=Math.cos(a),x=p.x-c.x,y=p.y-c.y;return P(c.x+x*k-y*s,c.y+x*s+y*k,p.z);};
G.mirrorPt=function(p,a,b){
  var dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(l2<EPS)return cp(p);
  var t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;return P(2*(a.x+t*dx)-p.x,2*(a.y+t*dy)-p.y,p.z);
};
var add=G.add,sub=G.sub,dot=G.dot,cross=G.cross,len=G.len,dist=G.dist,unit=G.unit;

/* ---------- matrizes afins {a,b,c,d,e,f}: x'=a*x+c*y+e ; y'=b*x+d*y+f ---------- */
G.matrix={
  identity:function(){return {a:1,b:0,c:0,d:1,e:0,f:0};},
  translate:function(dx,dy){return {a:1,b:0,c:0,d:1,e:dx,f:dy};},
  rotate:function(a,c){c=c||P(0,0);var s=Math.sin(a),k=Math.cos(a);return {a:k,b:s,c:-s,d:k,e:c.x-k*c.x+s*c.y,f:c.y-s*c.x-k*c.y};},
  scale:function(sx,sy,c){c=c||P(0,0);if(sy===undefined)sy=sx;return {a:sx,b:0,c:0,d:sy,e:c.x-sx*c.x,f:c.y-sy*c.y};},
  mirror:function(a,b){
    var f=Math.atan2(b.y-a.y,b.x-a.x),c2=Math.cos(2*f),s2=Math.sin(2*f);
    return {a:c2,b:s2,c:s2,d:-c2,e:a.x-c2*a.x-s2*a.y,f:a.y-s2*a.x+c2*a.y};
  },
  mul:function(m,n){   // aplica n primeiro, depois m
    return {a:m.a*n.a+m.c*n.b,b:m.b*n.a+m.d*n.b,c:m.a*n.c+m.c*n.d,d:m.b*n.c+m.d*n.d,
            e:m.a*n.e+m.c*n.f+m.e,f:m.b*n.e+m.d*n.f+m.f};
  },
  det:function(m){return m.a*m.d-m.b*m.c;},
  inverse:function(m){
    var D=m.a*m.d-m.b*m.c;if(Math.abs(D)<1e-15)return null;
    return {a:m.d/D,b:-m.b/D,c:-m.c/D,d:m.a/D,e:(m.c*m.f-m.d*m.e)/D,f:(m.b*m.e-m.a*m.f)/D};
  },
  apply:function(m,p){return P(m.a*p.x+m.c*p.y+m.e,m.b*p.x+m.d*p.y+m.f,p.z);}
};

/* ---------- segmentos: base de todas as operações ----------
   L {t:'L',p1,p2,ext?}  A {t:'A',c,r,a1,a2,rev,ext?} (arco anti-horário de a1 a a2; rev = percurso de a2 a a1)  C {t:'C',c,r}
   ext: 'both' | 'fwd' | 'back' (linha estendida) ; truthy em arco = círculo completo. flat:true = veio de elipse/spline. */
function sweepOf(s){var w=nA(s.a2-s.a1);return w<1e-12?TAU:w;}
function ap(s,a){return P(s.c.x+s.r*Math.cos(a),s.c.y+s.r*Math.sin(a));}
function inArc(a,a1,a2){var s=nA(a2-a1);if(s<1e-12)s=TAU;var d=nA(a-a1);return d<=s+1e-9||d>=TAU-1e-9;}
function arcSeg(c,r,a1,a2,rev){return {t:'A',c:c,r:r,a1:a1,a2:a2,rev:!!rev};}
function sS(s){return s.t==='L'?s.p1:(s.rev?ap(s,s.a2):ap(s,s.a1));}
function sE(s){return s.t==='L'?s.p2:(s.rev?ap(s,s.a1):ap(s,s.a2));}
function segLen(s){return s.t==='L'?dist(s.p1,s.p2):s.t==='C'?TAU*s.r:s.r*sweepOf(s);}
function segAt(s,u){
  if(s.t==='L')return P(s.p1.x+(s.p2.x-s.p1.x)*u,s.p1.y+(s.p2.y-s.p1.y)*u,s.p1.z);
  var w=sweepOf(s);return ap(s,s.rev?s.a2-u*w:s.a1+u*w);
}
function bulgeSeg(p1,p2,b){
  if(Math.abs(b)<1e-12)return {t:'L',p1:p1,p2:p2};
  var dx=p2.x-p1.x,dy=p2.y-p1.y,d=Math.hypot(dx,dy);if(d<EPS)return null;
  var r=d*(1+b*b)/(4*Math.abs(b)),h=(d/2)*(1-b*b)/(2*b);
  var c=P((p1.x+p2.x)/2-dy/d*h,(p1.y+p2.y)/2+dx/d*h),th=4*Math.atan(b),a1=Math.atan2(p1.y-c.y,p1.x-c.x);
  if(b>0)return arcSeg(c,r,a1,a1+th,false);
  return arcSeg(c,r,Math.atan2(p2.y-c.y,p2.x-c.x),a1,true);
}
function bulgeOf(s,a,b){
  if(s.t!=='A')return 0;
  var al=Math.atan2(a.y-s.c.y,a.x-s.c.x),be=Math.atan2(b.y-s.c.y,b.x-s.c.x);
  return s.rev?-Math.tan(nA(al-be)/4):Math.tan(nA(be-al)/4);
}
function dv(d){return typeof d==='number'?P(Math.cos(d*D2R),Math.sin(d*D2R)):d;}
function ellipsePts(e){
  var m=e.major,q=e.ratio==null?1:e.ratio,mn=P(-m.y*q,m.x*q),c=e.c;
  var full=e.a1==null||e.a2==null||nA((e.a2-e.a1)*D2R)<1e-9,t0=full?0:e.a1*D2R,sw=full?TAU:nA((e.a2-e.a1)*D2R);
  var n=Math.max(32,Math.ceil(sw/TAU*128)),out=[],i,t;
  for(i=0;i<=n;i++){t=t0+sw*i/n;out.push(P(c.x+m.x*Math.cos(t)+mn.x*Math.sin(t),c.y+m.y*Math.cos(t)+mn.y*Math.sin(t),c.z));}
  return out;
}
function splinePts(e){   // Catmull-Rom uniforme pelos pontos de ajuste (aproximação)
  var f=e.fit||[],n=f.length;if(n<2)return f.map(cp);
  var cl=!!e.closed&&n>2,N=cl?n:n-1,out=[],i,k;
  function g(i){return cl?f[((i%n)+n)%n]:f[Math.max(0,Math.min(n-1,i))];}
  for(i=0;i<N;i++){
    var p0=g(i-1),p1=g(i),p2=g(i+1),p3=g(i+2);
    for(k=0;k<16;k++){
      var t=k/16,t2=t*t,t3=t2*t;
      out.push(P(0.5*(2*p1.x+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
                 0.5*(2*p1.y+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3),p1.z));
    }
  }
  out.push(cp(cl?f[0]:f[n-1]));return out;
}
function polySegs(pts){var s=[],i;for(i=0;i<pts.length-1;i++)if(dist(pts[i],pts[i+1])>1e-12)s.push({t:'L',p1:pts[i],p2:pts[i+1],flat:true});return s;}

/* converte entidade em segmentos. ext=true estende (linha infinita, arco = círculo; pline: só as pontas) */
G.segs=function(e,ext){
  var s=[],i,n,pts;
  switch(e.type){
    case 'line':s=[{t:'L',p1:e.p1,p2:e.p2}];if(ext)s[0].ext='both';break;
    case 'xline':s=[{t:'L',p1:e.p,p2:add(e.p,dv(e.dir)),ext:'both'}];break;
    case 'ray':s=[{t:'L',p1:e.p,p2:add(e.p,dv(e.dir)),ext:'fwd'}];break;
    case 'circle':s=[{t:'C',c:e.c,r:e.r}];break;
    case 'arc':s=[arcSeg(e.c,e.r,e.a1*D2R,e.a2*D2R,false)];if(ext)s[0].ext='both';break;
    case 'pline':
      pts=e.pts||[];n=pts.length;
      for(i=0;i<n-1;i++){var q=bulgeSeg(pts[i],pts[i+1],pts[i].bulge||0);if(q)s.push(q);}
      if(e.closed&&n>2){var q2=bulgeSeg(pts[n-1],pts[0],pts[n-1].bulge||0);if(q2)s.push(q2);}
      if(ext&&!e.closed&&s.length){
        if(s.length===1){if(s[0].t==='L')s[0].ext='both';}
        else{if(s[0].t==='L')s[0].ext='back';if(s[s.length-1].t==='L')s[s.length-1].ext='fwd';}
      }
      break;
    case 'ellipse':s=polySegs(ellipsePts(e));break;
    case 'spline':s=polySegs(splinePts(e));break;
  }
  return s;
};
function entFromSeg(s){
  if(s.t==='L')return {type:'line',p1:cp(s.p1),p2:cp(s.p2)};
  return {type:'arc',c:cp(s.c),r:s.r,a1:nA(s.a1)*R2D,a2:nA(s.a2)*R2D};
}
function pathEnt(segs,closed,pr,asType){
  if(segs.length===1&&asType!=='pline'&&!closed)return mk(entFromSeg(segs[0]),pr);
  var pts=segs.map(function(s){var a=sS(s),q=P(a.x,a.y,a.z);q.bulge=bulgeOf(s,sS(s),sE(s));return q;});
  if(!closed){var l=sE(segs[segs.length-1]);pts.push(P(l.x,l.y,l.z));}
  return mk({type:'pline',pts:pts,closed:!!closed},pr);
}
G.fromSegs=function(segs,closed,pr){return pathEnt(segs,closed,pr||{},'pline');};

/* ---------- pontos amostrados ---------- */
function segPts(s,step){
  if(s.t==='L')return [s.p1,s.p2];
  var w=s.t==='C'?TAU:sweepOf(s),n=Math.max(2,Math.ceil(w/step)),out=[],k;
  for(k=0;k<=n;k++)out.push(s.t==='C'?ap(s,TAU*k/n):segAt(s,k/n));return out;
}
G.flatten=function(e,step){
  step=step||5*D2R;var out=[];
  G.segs(e).forEach(function(s){segPts(s,step).forEach(function(p){if(!out.length||dist(out[out.length-1],p)>1e-12)out.push(p);});});
  return out;
};

/* ---------- interseção ---------- */
function okT(s,t){var e=1e-9,x=s.ext;if(x==='both')return true;if(x==='fwd')return t>=-e;if(x==='back')return t<=1+e;return t>=-e&&t<=1+e;}
function llInt(a,b){
  var r=sub(a.p2,a.p1),s=sub(b.p2,b.p1),den=cross(r,s);
  if(Math.abs(den)<1e-12*Math.max(1,len(r)*len(s)))return [];
  var qp=sub(b.p1,a.p1),t=cross(qp,s)/den,u=cross(qp,r)/den;
  if(!okT(a,t)||!okT(b,u))return [];
  return [P(a.p1.x+t*r.x,a.p1.y+t*r.y)];
}
function lcInt(l,c){
  var d=sub(l.p2,l.p1),f=sub(l.p1,c.c),A=dot(d,d),B=2*dot(f,d),C=dot(f,f)-c.r*c.r,out=[];
  if(A<EPS)return out;
  var disc=B*B-4*A*C;if(disc<-1e-9*(B*B+4*Math.abs(A*C)+1e-30))return out;disc=Math.max(0,disc);
  var sq=Math.sqrt(disc),ts=sq<1e-9*Math.sqrt(A)?[-B/(2*A)]:[(-B-sq)/(2*A),(-B+sq)/(2*A)];
  ts.forEach(function(t){
    if(!okT(l,t))return;
    var p=P(l.p1.x+t*d.x,l.p1.y+t*d.y);
    if(c.t==='A'&&!c.ext&&!inArc(Math.atan2(p.y-c.c.y,p.x-c.c.x),c.a1,c.a2))return;
    out.push(p);
  });
  return out;
}
function ccInt(a,b){
  var d=dist(a.c,b.c);if(d<EPS)return [];
  if(d>a.r+b.r+1e-9||d<Math.abs(a.r-b.r)-1e-9)return [];
  var x=(d*d+a.r*a.r-b.r*b.r)/(2*d),h=Math.sqrt(Math.max(0,a.r*a.r-x*x)),ux=(b.c.x-a.c.x)/d,uy=(b.c.y-a.c.y)/d;
  var mx=a.c.x+ux*x,my=a.c.y+uy*x,pts=h<1e-7?[P(mx,my)]:[P(mx-uy*h,my+ux*h),P(mx+uy*h,my-ux*h)];
  return pts.filter(function(p){
    if(a.t==='A'&&!a.ext&&!inArc(Math.atan2(p.y-a.c.y,p.x-a.c.x),a.a1,a.a2))return false;
    if(b.t==='A'&&!b.ext&&!inArc(Math.atan2(p.y-b.c.y,p.x-b.c.x),b.a1,b.a2))return false;
    return true;
  });
}
function segInt(a,b){
  if(a.t==='L'&&b.t==='L')return llInt(a,b);
  if(a.t==='L')return lcInt(a,b);
  if(b.t==='L')return lcInt(b,a);
  return ccInt(a,b);
}
function dedup(pts){
  var out=[];pts.forEach(function(p){for(var i=0;i<out.length;i++)if(dist(out[i],p)<1e-7)return;out.push(p);});return out;
}
/* intersect(a,b,{extend:true|'a'|'b'|'both'}) -> [pt]. Elipse/spline: aproximadas por polilinha. */
G.intersect=function(a,b,o){
  var ex=o&&o.extend,ea=ex===true||ex==='both'||ex==='a',eb=ex===true||ex==='both'||ex==='b';
  var A=G.segs(a,ea),B=G.segs(b,eb),out=[];
  A.forEach(function(x){B.forEach(function(y){segInt(x,y).forEach(function(p){out.push(p);});});});
  return dedup(out);
};

/* ---------- ponto mais próximo ---------- */
function closestSeg(s,p){
  if(s.t==='L'){
    var dx=s.p2.x-s.p1.x,dy=s.p2.y-s.p1.y,l2=dx*dx+dy*dy,t=l2<EPS?0:((p.x-s.p1.x)*dx+(p.y-s.p1.y)*dy)/l2;
    if(s.ext==='both'){}else if(s.ext==='fwd')t=Math.max(0,t);else if(s.ext==='back')t=Math.min(1,t);else t=Math.max(0,Math.min(1,t));
    return P(s.p1.x+t*dx,s.p1.y+t*dy);
  }
  var a=Math.atan2(p.y-s.c.y,p.x-s.c.x);
  if(s.t==='C'||s.ext||inArc(a,s.a1,s.a2))return ap(s,a);
  var q1=ap(s,s.a1),q2=ap(s,s.a2);return dist(q1,p)<dist(q2,p)?q1:q2;
}
function paramOn(s,q){
  if(s.t==='L'){var dx=s.p2.x-s.p1.x,dy=s.p2.y-s.p1.y,l2=dx*dx+dy*dy;return l2<EPS?0:((q.x-s.p1.x)*dx+(q.y-s.p1.y)*dy)/l2;}
  var a=Math.atan2(q.y-s.c.y,q.x-s.c.x),w=sweepOf(s),d=s.rev?nA(s.a2-a):nA(a-s.a1);
  if(d>w+1e-9)d=(d-w<TAU-d)?w:0;
  return d/w;
}
/* closest(e,pt) -> {pt,dist,i}  (i = índice do segmento) */
G.closest=function(e,pt){
  if(e.type==='point')return {pt:e.p,dist:dist(e.p,pt),i:0};
  var best=null;
  G.segs(e).forEach(function(s,i){var q=closestSeg(s,pt),d=dist(q,pt);if(!best||d<best.dist)best={pt:q,dist:d,i:i};});
  return best;
};

/* ---------- caixa envolvente {x1,y1,x2,y2} ---------- */
function ubb(r,b){
  if(!b)return r;if(!r)return {x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2};
  return {x1:Math.min(r.x1,b.x1),y1:Math.min(r.y1,b.y1),x2:Math.max(r.x2,b.x2),y2:Math.max(r.y2,b.y2)};
}
G.bbox=function(e){
  if(Array.isArray(e)){var r0=null;e.forEach(function(x){r0=ubb(r0,G.bbox(x));});return r0;}
  if(e.type==='xline'||e.type==='ray')return null;
  if(e.type==='point')return {x1:e.p.x,y1:e.p.y,x2:e.p.x,y2:e.p.y};
  var r=null;
  G.segs(e).forEach(function(s){
    if(s.t==='L')r=ubb(r,{x1:Math.min(s.p1.x,s.p2.x),y1:Math.min(s.p1.y,s.p2.y),x2:Math.max(s.p1.x,s.p2.x),y2:Math.max(s.p1.y,s.p2.y)});
    else if(s.t==='C')r=ubb(r,{x1:s.c.x-s.r,y1:s.c.y-s.r,x2:s.c.x+s.r,y2:s.c.y+s.r});
    else{
      var pts=[ap(s,s.a1),ap(s,s.a2)],k;
      for(k=0;k<4;k++)if(inArc(k*Math.PI/2,s.a1,s.a2))pts.push(ap(s,k*Math.PI/2));
      pts.forEach(function(p){r=ubb(r,{x1:p.x,y1:p.y,x2:p.x,y2:p.y});});
    }
  });
  return r;
};

/* ---------- comprimento, área, ponto em polígono ---------- */
G.length=function(e){
  if(e.type==='xline'||e.type==='ray')return Infinity;
  var t=0;G.segs(e).forEach(function(s){t+=segLen(s);});return t;
};
G.signedArea=function(e){   // anti-horário positivo; pline aberta = fechada pela corda; arco/linha = 0
  var A=0,i,n,pts;
  if(e.type==='circle')return Math.PI*e.r*e.r;
  if(e.type==='ellipse'){
    var m=Math.hypot(e.major.x,e.major.y),q=e.ratio==null?1:e.ratio;
    if(e.a1==null||e.a2==null||nA((e.a2-e.a1)*D2R)<1e-9)return Math.PI*m*m*q;
    var w=nA((e.a2-e.a1)*D2R);return m*m*q/2*(w-Math.sin(w));
  }
  if(e.type==='pline'){
    pts=e.pts||[];n=pts.length;if(n<3&&!(n===2&&pts[0].bulge))return 0;
    for(i=0;i<n;i++){
      var a=pts[i],b=pts[(i+1)%n],bb=(i<n-1||e.closed)?(a.bulge||0):0;
      A+=(a.x*b.y-b.x*a.y)/2;
      if(bb){var th=4*Math.atan(Math.abs(bb)),d=dist(a,b),r=d*(1+bb*bb)/(4*Math.abs(bb));A+=(bb>0?1:-1)*r*r/2*(th-Math.sin(th));}
    }
    return A;
  }
  if(e.type==='spline'){pts=splinePts(e);n=pts.length;if(n<3)return 0;for(i=0;i<n;i++){var p=pts[i],q2=pts[(i+1)%n];A+=(p.x*q2.y-q2.x*p.y)/2;}return A;}
  return 0;
};
G.area=function(e){return Math.abs(G.signedArea(e));};
function onSeg(p,a,b){
  var dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(l2<EPS)return dist(p,a)<1e-9;
  var t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;if(t<0||t>1)return false;
  return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy))<1e-9;
}
/* pointInPoly(pt, [pts] | entidade) -> true se dentro ou sobre a borda */
G.pointInPoly=function(pt,poly){
  var pts=Array.isArray(poly)?poly:G.flatten(poly),n=pts.length,i,j,ins=false;
  for(i=0,j=n-1;i<n;j=i++){
    var a=pts[i],b=pts[j];if(onSeg(pt,a,b))return true;
    if((a.y>pt.y)!==(b.y>pt.y)&&pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x)ins=!ins;
  }
  return ins;
};

/* ---------- offset ---------- */
function offSeg(s,sd){   // sd>0 = esquerda do sentido de percurso (arco/círculo anti-horário: para dentro)
  if(s.t==='L'){
    var d=sub(s.p2,s.p1),l=len(d);if(l<EPS)return null;
    var nx=-d.y/l*sd,ny=d.x/l*sd;
    return {t:'L',p1:P(s.p1.x+nx,s.p1.y+ny,s.p1.z),p2:P(s.p2.x+nx,s.p2.y+ny,s.p2.z)};
  }
  var r=(s.t==='A'&&s.rev)?s.r+sd:s.r-sd;if(r<=1e-9)return null;
  var o={t:s.t,c:s.c,r:r,rev:s.rev};if(s.t==='A'){o.a1=s.a1;o.a2=s.a2;}return o;
}
function extOf(s){var o={},k;for(k in s)o[k]=s[k];o.ext='both';return o;}
function sideSign(e,side){
  if(side==null||side==='left')return 1;if(side==='right')return -1;if(typeof side==='number')return side<0?-1:1;
  var S=G.segs(e),c=G.closest(e,side);if(!c)return 1;var s=S[c.i];
  if(s.t==='L')return cross(sub(s.p2,s.p1),sub(side,s.p1))>=0?1:-1;
  var out=dist(side,s.c)>s.r;return (s.t==='A'&&s.rev)?(out?1:-1):(out?-1:1);
}
function offPline(e,S,sd,pr){
  var m=S.length,O=[],st=[],en=[],i;if(!m)return null;
  for(i=0;i<m;i++){var o=offSeg(S[i],sd);if(!o)return null;O.push(o);st.push(sS(o));en.push(sE(o));}
  var closed=!!e.closed&&m>1,lim=closed?m:m-1;
  for(i=0;i<lim;i++){
    var j=(i+1)%m,c=segInt(extOf(O[i]),extOf(O[j])),ref=en[i],best=null;
    c.forEach(function(q){if(!best||dist(q,ref)<dist(best,ref))best=q;});
    if(!best)best=P((en[i].x+st[j].x)/2,(en[i].y+st[j].y)/2);
    en[i]=best;st[j]=best;
  }
  var pts=[];
  for(i=0;i<m;i++){var q=P(st[i].x,st[i].y,st[i].z);q.bulge=bulgeOf(O[i],st[i],en[i]);pts.push(q);}
  if(!closed){var l=en[m-1];pts.push(P(l.x,l.y,l.z));}
  return mk({type:'pline',pts:pts,closed:closed},pr);
}
/* offset(e,dist,side): side = 'left'|'right'|ponto. Esquerda segue o sentido do desenho (arco/círculo: para dentro).
   Retorna nova entidade (sem id) ou null. Suporta line, circle, arc, pline (emenda por prolongamento; sem remoção de laços). */
G.offset=function(e,d,side){
  var sd=sideSign(e,side)*Math.abs(d),S=G.segs(e),pr=props(e),o;
  if(e.type==='line'){o=offSeg(S[0],sd);return o&&mk({type:'line',p1:o.p1,p2:o.p2},pr);}
  if(e.type==='circle'){o=offSeg(S[0],sd);return o&&mk({type:'circle',c:cp(e.c),r:o.r},pr);}
  if(e.type==='arc'){o=offSeg(S[0],sd);return o&&mk({type:'arc',c:cp(e.c),r:o.r,a1:e.a1,a2:e.a2},pr);}
  if(e.type==='pline')return offPline(e,S,sd,pr);
  return null;
};

/* ---------- explode ---------- */
G.explode=function(e){
  if(e.type!=='pline')return [];var pr=props(e);
  return G.segs(e).map(function(s){return mk(entFromSeg(s),pr);});
};

/* ---------- trim / extend ---------- */
function subSeg(s,ua,ub){
  if(s.t==='L')return {t:'L',p1:segAt(s,ua),p2:segAt(s,ub)};
  var w=sweepOf(s);function A(u){return s.rev?s.a2-u*w:s.a1+u*w;}
  return s.rev?{t:'A',c:s.c,r:s.r,a1:A(ub),a2:A(ua),rev:true}:{t:'A',c:s.c,r:s.r,a1:A(ua),a2:A(ub),rev:false};
}
function slice(S,s1,s2){
  var out=[],i=Math.floor(s1+1e-9);
  for(;i<S.length&&i<s2-1e-9;i++){var ua=Math.max(0,s1-i),ub=Math.min(1,s2-i);if(ub-ua>=1e-9)out.push(subSeg(S[i],ua,ub));}
  return out;
}
function trimCircle(e,edges,pick,pr){
  var angs=[],C={t:'C',c:e.c,r:e.r};
  edges.forEach(function(ed){if(ed===e)return;G.segs(ed).forEach(function(es){segInt(C,es).forEach(function(q){angs.push(nA(Math.atan2(q.y-e.c.y,q.x-e.c.x)));});});});
  angs.sort(function(a,b){return a-b;});angs=angs.filter(function(a,i){return i===0||a-angs[i-1]>1e-7;});
  if(angs.length<2)return null;
  var pa=nA(Math.atan2(pick.y-e.c.y,pick.x-e.c.x)),lo=angs[angs.length-1],hi=angs[0],i;
  for(i=0;i<angs.length;i++)if(angs[i]<=pa)lo=angs[i];
  for(i=angs.length-1;i>=0;i--)if(angs[i]>pa)hi=angs[i];
  return {parts:[mk({type:'arc',c:cp(e.c),r:e.r,a1:hi*R2D,a2:lo*R2D},pr)]};
}
/* trim(e,edges[],pick) -> {parts:[entidades sem id]} (substituem e; pode ser 1 ou 2) | null. Suporta line, arc, circle, pline. */
G.trim=function(e,edges,pick){
  var pr=props(e);if(e.type==='circle')return trimCircle(e,edges,pick,pr);
  if(e.type!=='line'&&e.type!=='arc'&&e.type!=='pline')return null;
  var S=G.segs(e),m=S.length;if(!m)return null;
  var closed=e.type==='pline'&&!!e.closed&&m>1,cuts=[];
  edges.forEach(function(ed){
    if(ed===e||(ed.id&&ed.id===e.id))return;
    G.segs(ed).forEach(function(es){S.forEach(function(s,k){segInt(s,es).forEach(function(q){
      cuts.push(k+Math.max(0,Math.min(1,paramOn(s,q))));});});});
  });
  if(closed)cuts=cuts.map(function(c){return c>=m-1e-9?0:c;});
  cuts.sort(function(a,b){return a-b;});cuts=cuts.filter(function(c,i){return i===0||c-cuts[i-1]>1e-7;});
  var c0=G.closest(e,pick),sp=c0.i+Math.max(0,Math.min(1,paramOn(S[c0.i],c0.pt))),i;
  if(!closed){
    if(!cuts.length)return null;
    var lo=0,hi=m;
    cuts.forEach(function(c){if(c<=sp+1e-12)lo=Math.max(lo,c);});
    cuts.forEach(function(c){if(c>sp&&c<hi)hi=c;});
    if(lo<=1e-7&&hi>=m-1e-7)return null;
    var parts=[];
    if(lo>1e-7)parts.push(pathEnt(slice(S,0,lo),false,pr,e.type));
    if(hi<m-1e-7)parts.push(pathEnt(slice(S,hi,m),false,pr,e.type));
    return {parts:parts};
  }
  if(cuts.length<2)return null;
  var l2=cuts[cuts.length-1],h2=cuts[0];
  for(i=0;i<cuts.length;i++)if(cuts[i]<=sp)l2=cuts[i];
  for(i=cuts.length-1;i>=0;i--)if(cuts[i]>sp)h2=cuts[i];
  var kept=h2<=l2?slice(S,h2,l2):slice(S,h2,m).concat(slice(S,0,l2));
  return {parts:[pathEnt(kept,false,pr,'pline')]};
};
function extEnd(end,other,hitsFn){   // acha o ponto de prolongamento a partir de 'end', no sentido other->end
  var dir=sub(end,other),seg={t:'L',p1:other,p2:end,ext:'both'},best=null;
  hitsFn(seg).forEach(function(q){if(dot(sub(q,end),dir)>1e-9&&(!best||dist(q,end)<dist(best,end)))best=q;});
  return best;
}
/* extend(e,edges[],pick) -> patch p/ ents.update | null. line {p1|p2}; arc {a1|a2} (graus); pline aberta {pts} (só segmento reto na ponta) */
G.extend=function(e,edges,pick){
  function hits(seg){var out=[];edges.forEach(function(ed){if(ed===e)return;G.segs(ed).forEach(function(es){segInt(seg,es).forEach(function(q){out.push(q);});});});return out;}
  var q;
  if(e.type==='line'){
    var at2=dist(pick,e.p2)<dist(pick,e.p1);
    q=at2?extEnd(e.p2,e.p1,hits):extEnd(e.p1,e.p2,hits);if(!q)return null;
    return at2?{p2:P(q.x,q.y,e.p2.z)}:{p1:P(q.x,q.y,e.p1.z)};
  }
  if(e.type==='arc'){
    var s=G.segs(e)[0],a2e=dist(pick,ap(s,s.a2))<dist(pick,ap(s,s.a1)),w=sweepOf(s),best=null;
    hits(extOf(s)).forEach(function(p){
      var f=Math.atan2(p.y-e.c.y,p.x-e.c.x),d=a2e?nA(f-s.a2):nA(s.a1-f);
      if(d>1e-9&&d<TAU-w-1e-9&&(!best||d<best.d))best={d:d,a:f};
    });
    if(!best)return null;return a2e?{a2:nA(best.a)*R2D}:{a1:nA(best.a)*R2D};
  }
  if(e.type==='pline'&&!e.closed&&e.pts.length>=2){
    var pts=e.pts,n=pts.length,last=dist(pick,pts[n-1])<dist(pick,pts[0]),np;
    if(last){if(pts[n-2].bulge)return null;q=extEnd(pts[n-1],pts[n-2],hits);if(!q)return null;np=pts.map(function(p){return mk(cp(p),{bulge:p.bulge||0});});np[n-1]=P(q.x,q.y,pts[n-1].z);}
    else{if(pts[0].bulge)return null;q=extEnd(pts[0],pts[1],hits);if(!q)return null;np=pts.map(function(p){return mk(cp(p),{bulge:p.bulge||0});});np[0]=mk(P(q.x,q.y,pts[0].z),{bulge:0});}
    return {pts:np};
  }
  return null;
};

/* ---------- fillet / chamfer ---------- */
function sideAlong(s,Pp,x){
  if(s.t==='L')return dot(sub(s.p2,s.p1),sub(x,Pp))>=0?1:-1;
  var a1=Math.atan2(Pp.y-s.c.y,Pp.x-s.c.x),a2=Math.atan2(x.y-s.c.y,x.x-s.c.x);
  return Math.atan2(Math.sin(a2-a1),Math.cos(a2-a1))>=0?1:-1;
}
/* mantém a ponta do lado do ponto escolhido e leva a outra ponta até t */
function endPatch(e,s,Pp,q,t){
  if(e.type==='circle')return null;
  if(e.type==='line'){
    var v=sub(q,Pp),f1=dot(sub(e.p1,Pp),v),f2=dot(sub(e.p2,Pp),v);
    return f1>=f2?{p2:P(t.x,t.y,e.p2.z)}:{p1:P(t.x,t.y,e.p1.z)};
  }
  var side=sideAlong(s,Pp,q),A1=ap(s,s.a1),A2=ap(s,s.a2),o1=sideAlong(s,Pp,A1)===side,o2=sideAlong(s,Pp,A2)===side,keep1;
  if(o1&&!o2)keep1=true;else if(o2&&!o1)keep1=false;else keep1=dist(A1,Pp)>=dist(A2,Pp);
  var ang=nA(Math.atan2(t.y-s.c.y,t.x-s.c.x))*R2D;
  return keep1?{a2:ang}:{a1:ang};
}
/* fillet(a,b,r,pa,pb): a,b = line|arc|circle; pa,pb = pontos escolhidos. r=0 => canto.
   -> {a:patch|null, b:patch|null, arc:{type:'arc',...}|null} ou null */
G.fillet=function(a,b,r,pa,pb){
  var ok={line:1,arc:1,circle:1};if(!ok[a.type]||!ok[b.type])return null;
  var sa=G.segs(a,true)[0],sb=G.segs(b,true)[0],I=segInt(sa,sb);if(!I.length)return null;
  var mid=P((pa.x+pb.x)/2,(pa.y+pb.y)/2),Pp=I[0];I.forEach(function(q){if(dist(q,mid)<dist(Pp,mid))Pp=q;});
  var qa=closestSeg(sa,pa),qb=closestSeg(sb,pb);
  if(!(r>0))return {a:endPatch(a,sa,Pp,qa,Pp),b:endPatch(b,sb,Pp,qb,Pp),arc:null};
  var best=null,sg=[1,-1];
  sg.forEach(function(x){sg.forEach(function(y){
    var oa=offSeg(sa,x*r),ob=offSeg(sb,y*r);if(!oa||!ob)return;oa.ext='both';ob.ext='both';
    segInt(oa,ob).forEach(function(c){
      var ta=closestSeg(sa,c),tb=closestSeg(sb,c);
      if(sideAlong(sa,Pp,ta)!==sideAlong(sa,Pp,qa)||sideAlong(sb,Pp,tb)!==sideAlong(sb,Pp,qb))return;
      var d=dist(c,Pp);if(!best||d<best.d)best={c:c,ta:ta,tb:tb,d:d};
    });
  });});
  if(!best)return null;
  var c=best.c,al=Math.atan2(best.ta.y-c.y,best.ta.x-c.x),be=Math.atan2(best.tb.y-c.y,best.tb.x-c.x),a1,a2;
  if(nA(be-al)<=Math.PI){a1=al;a2=be;}else{a1=be;a2=al;}
  return {a:endPatch(a,sa,Pp,qa,best.ta),b:endPatch(b,sb,Pp,qb,best.tb),
          arc:{type:'arc',c:P(c.x,c.y),r:r,a1:nA(a1)*R2D,a2:nA(a2)*R2D}};
};
function dirTo(e,Pp,q){
  var v=sub(q,Pp);if(len(v)>1e-9)return unit(v);
  var far=dist(e.p1,Pp)>=dist(e.p2,Pp)?e.p1:e.p2;return unit(sub(far,Pp));
}
/* chamfer(a,b,d1,d2,pa,pb): só linhas. -> {a,b,line} ou null */
G.chamfer=function(a,b,d1,d2,pa,pb){
  if(a.type!=='line'||b.type!=='line')return null;
  var sa=G.segs(a,true)[0],sb=G.segs(b,true)[0],I=segInt(sa,sb);if(!I.length)return null;
  var Pp=I[0],qa=closestSeg(sa,pa),qb=closestSeg(sb,pb);if(d2===undefined||d2===null)d2=d1;
  if(!(d1>0)&&!(d2>0))return {a:endPatch(a,sa,Pp,qa,Pp),b:endPatch(b,sb,Pp,qb,Pp),line:null};
  var Ca=add(Pp,G.mul(dirTo(a,Pp,qa),d1)),Cb=add(Pp,G.mul(dirTo(b,Pp,qb),d2));
  return {a:endPatch(a,sa,Pp,qa,Ca),b:endPatch(b,sb,Pp,qb,Cb),line:{type:'line',p1:P(Ca.x,Ca.y),p2:P(Cb.x,Cb.y)}};
};

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p2=function(){
  var pass=0,fail=0;
  function ok(c,m){if(c)pass++;else{fail++;console.error('FALHOU P2: '+m);}}
  function near(a,b,t){return Math.abs(a-b)<(t||1e-6);}
  function pn(p,x,y){return p&&near(p.x,x)&&near(p.y,y);}
  function L(x1,y1,x2,y2){return {type:'line',p1:P(x1,y1),p2:P(x2,y2)};}
  function Ci(x,y,r){return {type:'circle',c:P(x,y),r:r};}
  function Ar(x,y,r,a1,a2){return {type:'arc',c:P(x,y),r:r,a1:a1,a2:a2};}
  function rect(w,h){return {type:'pline',closed:true,pts:[P(0,0),P(w,0),P(w,h),P(0,h)]};}
  var r,i;
  // vetores / matrizes
  ok(near(G.dist(P(0,0),P(3,4)),5),'dist');
  ok(pn(G.rot(P(1,0),Math.PI/2),0,1),'rot');
  ok(pn(G.mirrorPt(P(1,2),P(0,0),P(10,0)),1,-2),'mirrorPt');
  ok(pn(G.matrix.apply(G.matrix.rotate(Math.PI/2),P(1,0)),0,1),'matrix rotate');
  ok(pn(G.matrix.apply(G.matrix.rotate(Math.PI/2,P(1,1)),P(2,1)),1,2),'rotate em torno de ponto');
  ok(pn(G.matrix.apply(G.matrix.mirror(P(0,0),P(1,1)),P(3,0)),0,3),'matrix mirror');
  var M=G.matrix.mul(G.matrix.translate(5,0),G.matrix.scale(2,2));ok(pn(G.matrix.apply(M,P(1,1)),7,2),'mul (escala depois translada)');
  ok(pn(G.matrix.apply(G.matrix.inverse(M),P(7,2)),1,1),'inverse');
  // interseção
  r=G.intersect(L(0,0,10,10),L(0,10,10,0));ok(r.length===1&&pn(r[0],5,5),'linha x linha');
  r=G.intersect(L(-10,0,10,0),Ci(0,0,5));ok(r.length===2,'linha x círculo = 2');
  r=G.intersect(L(-10,5,10,5),Ci(0,0,5));ok(r.length===1&&pn(r[0],0,5),'tangente = 1');
  r=G.intersect(Ci(0,0,5),Ci(8,0,5));ok(r.length===2&&near(r[0].x,4)&&near(Math.abs(r[0].y),3),'círculo x círculo');
  ok(G.intersect(Ar(0,0,5,0,90),L(-10,-3,10,-3)).length===0,'arco limitado não cruza');
  ok(G.intersect(Ar(0,0,5,0,90),L(-10,-3,10,-3),{extend:'a'}).length===2,'arco estendido cruza');
  ok(G.intersect(L(0,0,1,0),L(5,-1,5,1)).length===0&&G.intersect(L(0,0,1,0),L(5,-1,5,1),{extend:true}).length===1,'extend linhas');
  r=G.intersect({type:'xline',p:P(0,0),dir:45},Ci(0,0,5));ok(r.length===2&&near(Math.abs(r[0].x),5/Math.SQRT2),'xline');
  var EL={type:'ellipse',c:P(0,0),major:P(4,0),ratio:0.5};
  r=G.intersect(EL,L(-10,0,10,0));ok(r.length===2,'elipse x linha');
  // closest / bbox / length / area
  r=G.closest(L(0,0,10,0),P(5,3));ok(pn(r.pt,5,0)&&near(r.dist,3),'closest linha');
  r=G.closest(Ci(0,0,5),P(10,0));ok(pn(r.pt,5,0),'closest círculo');
  r=G.closest(Ar(0,0,5,0,90),P(-10,0));ok(pn(r.pt,0,5),'closest arco (ponta)');
  var bb=G.bbox(Ar(0,0,5,0,180));ok(near(bb.x1,-5)&&near(bb.x2,5)&&near(bb.y1,0)&&near(bb.y2,5),'bbox arco');
  bb=G.bbox(EL);ok(near(bb.x1,-4)&&near(bb.y2,2),'bbox elipse');
  ok(near(G.length(Ar(0,0,2,0,90)),Math.PI)&&near(G.length(Ci(0,0,1)),TAU),'length arco/círculo');
  ok(near(G.length({type:'pline',pts:[P(0,0),P(3,0),P(3,4)]}),7),'length pline');
  ok(near(G.area(Ci(0,0,2)),4*Math.PI)&&near(G.area(rect(4,3)),12),'area círculo/retângulo');
  ok(near(G.area({type:'pline',closed:true,pts:[mk(P(0,0),{bulge:1}),P(2,0)]}),Math.PI/2),'area com bulge');
  ok(near(G.area(EL),8*Math.PI,1e-6),'area elipse');
  ok(G.pointInPoly(P(1,1),rect(4,3))&&!G.pointInPoly(P(5,1),rect(4,3))&&G.pointInPoly(P(4,1),rect(4,3)),'pointInPoly');
  // offset / explode
  r=G.offset(L(0,0,10,0),1,'left');ok(near(r.p1.y,1)&&near(r.p2.y,1),'offset linha');
  r=G.offset(Ci(0,0,5),2,'left');ok(near(r.r,3),'offset círculo p/ dentro');
  r=G.offset(Ci(0,0,5),2,P(10,0));ok(near(r.r,7),'offset círculo por ponto (fora)');
  ok(G.offset(Ci(0,0,5),6,'left')===null,'offset colapsa');
  r=G.offset(rect(10,10),1,'left');ok(near(G.area(r),64),'offset retângulo p/ dentro');
  r=G.offset(rect(10,10),1,'right');ok(near(G.area(r),144),'offset retângulo p/ fora');
  r=G.explode(rect(2,2));ok(r.length===4&&r[0].type==='line','explode retângulo');
  r=G.explode({type:'pline',pts:[mk(P(0,0),{bulge:1}),P(2,0)]});ok(r.length===1&&r[0].type==='arc'&&near(r[0].r,1),'explode bulge = arco');
  // trim / extend
  r=G.trim(L(0,0,10,0),[L(5,-5,5,5)],P(8,0));ok(r&&r.parts.length===1&&pn(r.parts[0].p2,5,0),'trim linha (resta 0..5)');
  r=G.trim(L(0,0,10,0),[L(3,-5,3,5),L(7,-5,7,5)],P(5,0));ok(r&&r.parts.length===2,'trim meio = 2 partes');
  ok(G.trim(L(0,0,10,0),[L(20,-5,20,5)],P(5,0))===null,'trim sem corte = null');
  r=G.trim(Ci(0,0,5),[L(3,-10,3,10)],P(5,0));ok(r&&r.parts[0].type==='arc'&&near(nA((r.parts[0].a2-r.parts[0].a1)*D2R)*R2D,360-2*Math.acos(3/5)*R2D,1e-4),'trim círculo');
  r=G.trim(rect(10,10),[L(5,-5,5,15),L(-5,5,15,5)],P(10,5));ok(r&&r.parts.length===1&&r.parts[0].type==='pline'&&G.length(r.parts[0])>29&&G.length(r.parts[0])<31,'trim pline fechada');
  r=G.extend(L(0,0,5,0),[L(8,-5,8,5)],P(4.5,0));ok(r&&near(r.p2.x,8),'extend linha');
  r=G.extend(Ar(0,0,5,0,90),[L(-10,-3,10,-3)],P(5,0.1));ok(r&&near(r.a1,360-Math.asin(3/5)*R2D,1e-4),'extend arco');
  r=G.extend({type:'pline',pts:[P(0,0),P(5,0),P(5,5)]},[L(-5,8,15,8)],P(5,5));ok(r&&near(r.pts[2].y,8),'extend pline');
  // fillet / chamfer
  r=G.fillet(L(0,0,10,0),L(0,0,0,10),2,P(8,0),P(0,8));
  ok(r&&pn(r.arc.c,2,2)&&near(r.arc.r,2)&&near(r.arc.a1,180)&&near(r.arc.a2,270),'fillet arco');
  ok(r&&pn(r.a.p1,2,0)&&pn(r.b.p1,0,2),'fillet patches');
  r=G.fillet(L(0,0,10,0),L(0,0,0,10),0,P(8,0),P(0,8));ok(r&&r.arc===null&&r.a&&r.b,'fillet r=0');
  r=G.fillet(L(0,0,10,0),Ci(5,5,3),1,P(8,0),P(8,5));ok(r&&r.arc&&near(r.arc.r,1),'fillet linha-círculo');
  r=G.chamfer(L(0,0,10,0),L(0,0,0,10),2,2,P(8,0),P(0,8));ok(r&&pn(r.line.p1,2,0)&&pn(r.line.p2,0,2)&&pn(r.a.p1,2,0),'chamfer');
  console.log('CAD.tests.p2: '+pass+' ok, '+fail+' falhas');return {pass:pass,fail:fail};
};
})(window.CAD=window.CAD||{});
/* ==== END:2 ==== */
