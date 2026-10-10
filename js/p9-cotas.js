/* ==== PART:9 ==== */
(function(CAD){
'use strict';
/* P9 - Cotas e medição. Depende de P1 (núcleo). P2/P8 são opcionais: matemática própria, texto desenhado direto no canvas. */
var D2R=Math.PI/180, R2D=180/Math.PI, TAU=Math.PI*2, EPS=1e-9;
var OPS={}, last={id:null}, uiDone=false, cmdDone=false, fallbackStyles=null;

/* ---------- matemática local (pura) ---------- */
function pt(x,y,z){ return {x:x,y:y,z:z||0}; }
function P(p){ return p?{x:p.x,y:p.y,z:p.z||0}:p; }
var M={
  add:function(a,b){ return pt(a.x+b.x,a.y+b.y); },
  sub:function(a,b){ return pt(a.x-b.x,a.y-b.y); },
  mul:function(a,k){ return pt(a.x*k,a.y*k); },
  dot:function(a,b){ return a.x*b.x+a.y*b.y; },
  dist:function(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); },
  ang:function(a,b){ return Math.atan2(b.y-a.y,b.x-a.x); },
  pol:function(p,a,d){ return pt(p.x+d*Math.cos(a),p.y+d*Math.sin(a)); },
  mid:function(a,b){ return pt((a.x+b.x)/2,(a.y+b.y)/2); },
  norm:function(a){ a%=TAU; return a<0?a+TAU:a; },
  ccw:function(a1,a2){ var s=M.norm(a2-a1); return s<EPS?TAU:s; },
  inter:function(a,b,c,d){
    var rx=b.x-a.x, ry=b.y-a.y, sx=d.x-c.x, sy=d.y-c.y, den=rx*sy-ry*sx;
    if(Math.abs(den)<EPS) return null;
    var t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den; return pt(a.x+t*rx,a.y+t*ry);
  },
  segd:function(p,a,b){
    var dx=b.x-a.x, dy=b.y-a.y, l2=dx*dx+dy*dy;
    var t=l2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2)):0;
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }
};
function up(a){ /* ângulo de texto sempre legível: (-90°,90°] */
  a=((a+Math.PI)%TAU+TAU)%TAU-Math.PI;
  if(a>Math.PI/2+EPS) a-=Math.PI; else if(a<=-Math.PI/2+EPS) a+=Math.PI;
  return a;
}
function tw(s,h){ return String(s).length*h*0.6; }           /* largura estimada do texto */
function print(m){ if(CAD.cmd&&CAD.cmd.print) CAD.cmd.print(m); }

/* ---------- estilos de cota (doc.dimstyles) ---------- */
/* Tamanhos do estilo ficam em mm de PAPEL; desenho = valor * scale * mm→unidade. */
var MM2U={mm:1,cm:0.1,m:0.001,km:1e-6,'in':1/25.4,ft:1/304.8};
var SC0={m:100,cm:10,mm:1}, PR0={mm:0,cm:1,m:2};
function units(){ return (CAD.doc&&CAD.doc.units)||'m'; }
function mmU(){ return MM2U[units()]||1; }
function defStyle(name){
  var u=units();
  return {name:name||'Standard',scale:SC0[u]||1,textH:2.5,arrowSize:2.5,arrowType:'closed',extOffset:0.625,extExt:1.25,
    baseSpacing:3.75,textGap:0.625,textPos:'above',precision:(PR0[u]!=null?PR0[u]:2),anglePrec:1,decSep:'.',trimZeros:false,
    prefix:'',suffix:'',unitFactor:1,radPrefix:'R',diaPrefix:'Ø',arcSymbol:'before',centerMark:2.5,textStyle:'Standard',
    dimColor:null,textColor:null};
}
function store(){
  var d=CAD.doc;
  if(d){ if(!d.dimstyles) d.dimstyles={}; if(!d.dimstyles.Standard) d.dimstyles.Standard=defStyle('Standard'); return d.dimstyles; }
  return fallbackStyles||(fallbackStyles={Standard:defStyle('Standard')});
}
function curName(){ var d=CAD.doc, n=d&&d.current&&d.current.dimstyle; return (n&&store()[n])?n:'Standard'; }
function getStyle(name,ov){
  var s=store(), b=s[name||curName()]||s.Standard, o=defStyle(), k;
  for(k in b) o[k]=b[k];
  if(ov) for(k in ov) o[k]=ov[k];
  return o;
}
function S(st,k){ return st[k]*st.scale*mmU(); }
function touch(){
  var d=CAD.doc; if(d) d.dirty=true;
  if(CAD.emit) CAD.emit('doc:changed',{dimstyle:true});
  if(CAD.render&&CAD.render.request) CAD.render.request();
}
function runH(name,fdo,fundo){
  var rec={name:name,do:fdo,undo:fundo};
  if(CAD.history&&CAD.history.run) CAD.history.run(rec); else fdo();
}
function clone(o){ return o==null?o:JSON.parse(JSON.stringify(o)); }
function setStyle(name,patch){
  var old=clone(store()[name]||null), nu=Object.assign({},old||getStyle(curName()),patch||{},{name:name});
  runH('Estilo de cota',function(){ store()[name]=clone(nu); touch(); },function(){ if(old) store()[name]=clone(old); else delete store()[name]; touch(); });
  return nu;
}
function delStyle(name){
  if(name==='Standard'||!store()[name]) return false;
  var old=clone(store()[name]);
  runH('Excluir estilo de cota',function(){ delete store()[name]; touch(); },function(){ store()[name]=clone(old); touch(); });
  return true;
}
function setCurrent(name){
  var d=CAD.doc; if(!d||!store()[name]) return false;
  if(!d.current) d.current={};
  var old=d.current.dimstyle;
  runH('Estilo de cota atual',function(){ d.current.dimstyle=name; },function(){ d.current.dimstyle=old; });
  return true;
}

/* ---------- formatação ---------- */
function fmtNum(v,prec,st){
  var s=(Math.abs(v)<0.5*Math.pow(10,-prec))?(0).toFixed(prec):v.toFixed(prec);
  if(st.trimZeros&&s.indexOf('.')>=0) s=s.replace(/0+$/,'').replace(/\.$/,'');
  if(st.decSep&&st.decSep!=='.') s=s.replace('.',st.decSep);
  return s;
}
function fmtLen(v,st){ return st.prefix+fmtNum(v*st.unitFactor,st.precision,st)+st.suffix; }
function fmtAng(d,st){ return fmtNum(d,st.anglePrec,st)+'°'; }
function sym(s){ return String(s).replace(/%%[cC]/g,'Ø').replace(/%%[dD]/g,'°').replace(/%%[pP]/g,'±').replace(/%%%/g,'%'); }

/* ---------- medida e texto da cota ---------- */
function axisOf(e){
  var d=e.defpts; if(e.override&&e.override.axis) return e.override.axis;
  return Math.abs(d[1].y-d[0].y)>=Math.abs(d[1].x-d[0].x)?'x':'y';
}
function measure(e){
  var d=e.defpts||[];
  switch(e.kind){
    case 'linear': var r=(e.rot||0)*D2R; return Math.abs((d[1].x-d[0].x)*Math.cos(r)+(d[1].y-d[0].y)*Math.sin(r));
    case 'aligned': return M.dist(d[0],d[1]);
    case 'angular': return M.ccw(M.ang(d[0],d[1]),M.ang(d[0],d[2]))*R2D;
    case 'radius': return M.dist(d[0],d[1]);
    case 'diameter': return 2*M.dist(d[0],d[1]);
    case 'arclen': return M.dist(d[0],d[1])*M.ccw(M.ang(d[0],d[1]),M.ang(d[0],d[2]));
    case 'ordinate': var o=(e.override&&e.override.origin)||{x:0,y:0}; return axisOf(e)==='x'?d[0].x-o.x:d[0].y-o.y;
  }
  return 0;
}
function dimText(e){
  var st=getStyle(e.style,e.override), k=e.kind, m=measure(e), v;
  if(k==='angular') v=fmtAng(m,st);
  else{
    v=fmtLen(m,st);
    if(k==='radius') v=st.radPrefix+v; else if(k==='diameter') v=st.diaPrefix+v;
    else if(k==='arclen'&&st.arcSymbol==='before') v='⌒'+v;
  }
  var t=e.override&&e.override.text;
  if(t!=null&&t!=='') v=(t.indexOf('<>')>=0)?t.split('<>').join(v):t;
  return sym(v);
}

/* ---------- primitivas de layout (mundo, radianos) ---------- */
/* {k:'line',a,b} {k:'arc',c,r,a1,a2(a2>=a1)} {k:'arrow',p,a,t,s} {k:'text',p,s,h,r,j:'mc'|'ml'|'mr'} */
function line(L,a,b){ if(M.dist(a,b)>EPS) L.push({k:'line',a:P(a),b:P(b)}); }
function arcP(L,c,r,a1,a2){ if(a2-a1>EPS&&r>EPS) L.push({k:'arc',c:P(c),r:r,a1:a1,a2:a2}); }
function arrow(L,p,a,st){ if(st.arrowType!=='none') L.push({k:'arrow',p:P(p),a:a,t:st.arrowType,s:S(st,'arrowSize')}); }
function textP(L,p,s,h,r,j){ if(s!==''&&s!=null) L.push({k:'text',p:P(p),s:String(s),h:h,r:r,j:j||'mc'}); }
function extLine(L,p,q,n,o,off,ext){
  if(Math.abs(o)<=off) return; var s=o<0?-1:1;
  line(L,M.add(p,M.mul(n,s*off)),M.add(q,M.mul(n,s*ext)));
}
function arrowGeom(pr){
  var u=pt(Math.cos(pr.a),Math.sin(pr.a)), n=pt(-u.y,u.x), s=pr.s, tip=pr.p, base=M.sub(tip,M.mul(u,s));
  if(pr.t==='open') return {lines:[[tip,M.add(base,M.mul(n,s/4))],[tip,M.sub(base,M.mul(n,s/4))]]};
  if(pr.t==='tick'){ var dd=M.mul(M.add(u,n),1/Math.SQRT2); return {lines:[[M.sub(tip,M.mul(dd,s/2)),M.add(tip,M.mul(dd,s/2))]]}; }
  if(pr.t==='dot') return {circle:{c:tip,r:s/2}};
  return {poly:[tip,M.add(base,M.mul(n,s/6)),M.sub(base,M.mul(n,s/6))]};
}

function layLinear(e,st,L){
  var d=e.defpts, p1=d[0], p2=d[1], dp=d[2];
  var r=e.kind==='aligned'?M.ang(p1,p2):(e.rot||0)*D2R;
  var u=pt(Math.cos(r),Math.sin(r)), n=pt(-u.y,u.x);
  var o1=M.dot(M.sub(dp,p1),n), o2=M.dot(M.sub(dp,p2),n);
  var q1=M.add(p1,M.mul(n,o1)), q2=M.add(p2,M.mul(n,o2));
  var off=S(st,'extOffset'), ext=S(st,'extExt'), ar=S(st,'arrowSize'), h=S(st,'textH'), gap=S(st,'textGap');
  extLine(L,p1,q1,n,o1,off,ext); extLine(L,p2,q2,n,o2,off,ext);
  var t=M.dot(M.sub(q2,q1),u), m=Math.abs(t), sg=t<0?-1:1, du=pt(u.x*sg,u.y*sg);
  var str=dimText(e), w=tw(str,h), mid=M.mid(q1,q2);
  var rt=up(Math.atan2(du.y,du.x)), nt=pt(-Math.sin(rt),Math.cos(rt));
  var inside=m>=w+2*ar+2*gap, arrowsIn=m>=2.4*ar, tp;
  var aOut1=Math.atan2(-du.y,-du.x), aOut2=Math.atan2(du.y,du.x);
  if(arrowsIn){ arrow(L,q1,aOut1,st); arrow(L,q2,aOut2,st); }
  else{
    arrow(L,q1,aOut2,st); arrow(L,q2,aOut1,st);
    line(L,M.sub(q1,M.mul(du,ar*1.5)),q1); line(L,q2,M.add(q2,M.mul(du,ar*1.5)));
  }
  if(inside){
    if(st.textPos==='centered'){
      var hw=w/2+gap; line(L,q1,M.sub(mid,M.mul(du,hw))); line(L,M.add(mid,M.mul(du,hw)),q2); tp=mid;
    }else{ line(L,q1,q2); tp=M.add(mid,M.mul(nt,gap+h/2)); }
  }else{
    line(L,q1,q2);
    var ex=ar*(arrowsIn?1:1.5)+gap;
    if(arrowsIn) line(L,q2,M.add(q2,M.mul(du,ex+w+gap)));
    tp=M.add(M.add(q2,M.mul(du,ex+w/2)),M.mul(nt,gap+h/2));
  }
  textP(L,tp,str,h,rt,'mc');
}

/* corpo comum de cota de arco: arco da cota, setas e texto */
function arcDimBody(L,st,c,a1,sw,ra,str){
  var ar=S(st,'arrowSize'), h=S(st,'textH'), gap=S(st,'textGap'), w=tw(str,h);
  var a2=a1+sw, am=a1+sw/2, alen=ra*sw, da=ar*1.5/ra;
  var inside=alen>=w+2*ar+2*gap, arrowsIn=alen>=2.4*ar;
  var s1=M.pol(c,a1,ra), s2=M.pol(c,a2,ra), t1=a1-Math.PI/2, t2=a2+Math.PI/2, cen=st.textPos==='centered'&&inside;
  if(arrowsIn){ arrow(L,s1,t1,st); arrow(L,s2,t2,st); }
  else{ arrow(L,s1,t1+Math.PI,st); arrow(L,s2,t2+Math.PI,st); arcP(L,c,ra,a1-da,a1); arcP(L,c,ra,a2,a2+da); }
  var tp, rt;
  if(inside){
    if(cen){ var hw=(w/2+gap)/ra; arcP(L,c,ra,a1,am-hw); arcP(L,c,ra,am+hw,a2); tp=M.pol(c,am,ra); rt=up(am+Math.PI/2); }
    else{ arcP(L,c,ra,a1,a2); tp=M.pol(c,am,ra+gap+h/2); rt=up(am+Math.PI/2); }
  }else{
    arcP(L,c,ra,a1,a2);
    var ae=a2+(ar*(arrowsIn?1:1.5)+gap+w/2)/ra;
    arcP(L,c,ra,a2,a2+(ar*(arrowsIn?1:1.5)+gap+w)/ra);
    tp=M.pol(c,ae,ra+gap+h/2); rt=up(ae+Math.PI/2);
  }
  textP(L,tp,str,h,rt,'mc');
}
function layAngular(e,st,L){
  var d=e.defpts, v=d[0], a1=M.ang(v,d[1]), a2=M.ang(v,d[2]), sw=M.ccw(a1,a2);
  var ra=Math.max(M.dist(v,d[3]),S(st,'arrowSize')*2), off=S(st,'extOffset'), ext=S(st,'extExt');
  [[a1,d[1]],[a2,d[2]]].forEach(function(q){
    var dp=M.dist(v,q[1]);
    if(ra>dp+off) line(L,M.pol(v,q[0],dp+off),M.pol(v,q[0],ra+ext));
  });
  arcDimBody(L,st,v,a1,sw,ra,dimText(e));
}
function layArcLen(e,st,L){
  var d=e.defpts, c=d[0], a1=M.ang(c,d[1]), sw=M.ccw(a1,M.ang(c,d[2])), r=M.dist(c,d[1]);
  var ra=Math.max(M.dist(c,d[3]),S(st,'arrowSize')*2), off=S(st,'extOffset'), ext=S(st,'extExt');
  [a1,a1+sw].forEach(function(a){
    if(ra>=r) line(L,M.pol(c,a,r+off),M.pol(c,a,ra+ext)); else line(L,M.pol(c,a,r-off),M.pol(c,a,Math.max(0,ra-ext)));
  });
  arcDimBody(L,st,c,a1,sw,ra,dimText(e));
}
function layRadial(e,st,L){
  var d=e.defpts, c=d[0], p=d[1], tp0=d[2], r=M.dist(c,p), dia=e.kind==='diameter';
  var ar=S(st,'arrowSize'), h=S(st,'textH'), gap=S(st,'textGap'), cm=S(st,'centerMark');
  var str=dimText(e), w=tw(str,h), a=M.ang(c,p), dir=pt(Math.cos(a),Math.sin(a)), p2=dia?M.sub(M.mul(c,2),p):c;
  var outside=tp0?M.dist(c,tp0)>r:(dia?2*r<w+2*ar+2*gap:r<w+ar+3*gap);
  if(!dia&&cm>0){ line(L,pt(c.x-cm,c.y),pt(c.x+cm,c.y)); line(L,pt(c.x,c.y-cm),pt(c.x,c.y+cm)); }
  if(!outside){
    var rt=up(a), nt=pt(-Math.sin(rt),Math.cos(rt)), tp;
    arrow(L,p,a,st);
    if(dia){
      arrow(L,p2,a+Math.PI,st);
      if(st.textPos==='centered'){ var hw=w/2+gap; line(L,p2,M.sub(c,M.mul(dir,hw))); line(L,M.add(c,M.mul(dir,hw)),p); tp=c; }
      else{ line(L,p2,p); tp=M.add(c,M.mul(nt,gap+h/2)); }
    }else{
      var lo=w/2+gap, hi=Math.max(lo,r-ar-w/2-gap), t=tp0?Math.max(lo,Math.min(hi,M.dot(M.sub(tp0,c),dir))):(r-ar)/2;
      line(L,c,p);
      tp=M.add(M.add(c,M.mul(dir,Math.max(t,0))),M.mul(nt,gap+h/2));
    }
    textP(L,tp,str,h,rt,'mc');
  }else{
    var tpo=tp0&&M.dist(c,tp0)>r?tp0:M.add(p,M.mul(dir,ar*1.5+gap));
    arrow(L,p,a+Math.PI,st);
    if(dia){ arrow(L,p2,a,st); line(L,p2,p); line(L,p2,M.sub(p2,M.mul(dir,ar*1.5))); }
    line(L,p,tpo);
    var side=(tpo.x-p.x)>EPS?1:((tpo.x-p.x)<-EPS?-1:(dir.x>=0?1:-1));
    textP(L,pt(tpo.x+side*gap,tpo.y),str,h,0,side>0?'ml':'mr');
  }
}
function layOrd(e,st,L){
  var d=e.defpts, f=d[0], t=d[1], h=S(st,'textH'), gap=S(st,'textGap'), off=S(st,'extOffset'), str=dimText(e), w=tw(str,h), s;
  if(axisOf(e)==='x'){
    s=t.y>=f.y?1:-1; line(L,pt(f.x,f.y+s*off),pt(f.x,t.y)); textP(L,pt(f.x,t.y+s*(gap+w/2)),str,h,Math.PI/2,'mc');
  }else{
    s=t.x>=f.x?1:-1; line(L,pt(f.x+s*off,f.y),pt(t.x,f.y)); textP(L,pt(t.x+s*(gap+w/2),f.y),str,h,0,'mc');
  }
}
function layLeader(e,L){
  var st=getStyle(e.style,e.override), pts=e.pts||[], n=pts.length; if(n<2) return;
  var ar=S(st,'arrowSize'), h=e.h||S(st,'textH'), gap=S(st,'textGap'), i;
  for(i=0;i<n-1;i++) line(L,pts[i],pts[i+1]);
  arrow(L,pts[0],M.ang(pts[1],pts[0]),st);
  var lp=pts[n-1];
  (e.more||[]).forEach(function(b){
    if(!b||!b.length) return; var ch=b.concat([lp]);
    for(var j=0;j<ch.length-1;j++) line(L,ch[j],ch[j+1]);
    arrow(L,b[0],M.ang(ch[1],b[0]),st);
  });
  var lines=String(e.str==null?'':e.str).split(/\\n|\n/);
  if(lines.join('')==='') return;
  var side=(lp.x-pts[n-2].x)<-EPS?-1:1, hook=pt(lp.x+side*ar,lp.y);
  line(L,lp,hook);
  for(i=0;i<lines.length;i++)
    textP(L,pt(hook.x+side*gap,lp.y+((lines.length-1)/2-i)*1.4*h),sym(lines[i]),h,0,side>0?'ml':'mr');
}
function layout(e){
  var L=[];
  try{
    if(e.type==='leader'){ layLeader(e,L); return L; }
    var st=getStyle(e.style,e.override);
    switch(e.kind){
      case 'linear': case 'aligned': layLinear(e,st,L); break;
      case 'angular': layAngular(e,st,L); break;
      case 'radius': case 'diameter': layRadial(e,st,L); break;
      case 'arclen': layArcLen(e,st,L); break;
      case 'ordinate': layOrd(e,st,L); break;
    }
  }catch(x){ L=[]; }
  return L;
}

/* ---------- caixa, hit, snap ---------- */
function tbox(pr){
  var w=tw(pr.s,pr.h), h=pr.h, x0=pr.j==='ml'?0:(pr.j==='mr'?-w:-w/2), c=Math.cos(pr.r), s=Math.sin(pr.r);
  return [[x0,-h/2],[x0+w,-h/2],[x0+w,h/2],[x0,h/2]].map(function(q){ return pt(pr.p.x+q[0]*c-q[1]*s,pr.p.y+q[0]*s+q[1]*c); });
}
function bboxL(L){
  var b={x1:Infinity,y1:Infinity,x2:-Infinity,y2:-Infinity};
  function add(p){ if(p.x<b.x1)b.x1=p.x; if(p.y<b.y1)b.y1=p.y; if(p.x>b.x2)b.x2=p.x; if(p.y>b.y2)b.y2=p.y; }
  L.forEach(function(q){
    if(q.k==='line'){ add(q.a); add(q.b); }
    else if(q.k==='arc'){
      add(M.pol(q.c,q.a1,q.r)); add(M.pol(q.c,q.a2,q.r));
      for(var k=0;k<4;k++){ var a=k*Math.PI/2; if(M.norm(a-q.a1)<=q.a2-q.a1) add(M.pol(q.c,a,q.r)); }
    }
    else if(q.k==='arrow'){
      var g=arrowGeom(q);
      if(g.poly) g.poly.forEach(add);
      else if(g.lines) g.lines.forEach(function(l){ add(l[0]); add(l[1]); });
      else if(g.circle){ add(pt(g.circle.c.x-g.circle.r,g.circle.c.y-g.circle.r)); add(pt(g.circle.c.x+g.circle.r,g.circle.c.y+g.circle.r)); }
    }
    else if(q.k==='text') tbox(q).forEach(add);
  });
  return b.x1===Infinity?null:b;
}
function bboxOf(e){
  var b=bboxL(layout(e));
  if(b) return b;
  var ps=(e.defpts||e.pts||[]).filter(Boolean);
  if(!ps.length) return {x1:0,y1:0,x2:0,y2:0};
  return {x1:Math.min.apply(null,ps.map(function(p){return p.x;})),y1:Math.min.apply(null,ps.map(function(p){return p.y;})),
          x2:Math.max.apply(null,ps.map(function(p){return p.x;})),y2:Math.max.apply(null,ps.map(function(p){return p.y;}))};
}
function hitL(L,p,tol){
  for(var i=0;i<L.length;i++){
    var q=L[i];
    if(q.k==='line'){ if(M.segd(p,q.a,q.b)<=tol) return true; }
    else if(q.k==='arc'){
      if(Math.abs(M.dist(p,q.c)-q.r)<=tol&&M.norm(M.ang(q.c,p)-q.a1)<=(q.a2-q.a1)+tol/q.r) return true;
    }
    else if(q.k==='text'){
      var c=Math.cos(-q.r), s=Math.sin(-q.r), dx=p.x-q.p.x, dy=p.y-q.p.y, lx=dx*c-dy*s, ly=dx*s+dy*c;
      var w=tw(q.s,q.h), x0=q.j==='ml'?0:(q.j==='mr'?-w:-w/2);
      if(lx>=x0-tol&&lx<=x0+w+tol&&Math.abs(ly)<=q.h/2+tol) return true;
    }
    else if(q.k==='arrow'){ if(M.dist(p,q.p)<=Math.max(tol,q.s)) return true; }
  }
  return false;
}
function snapPts(e){
  var out=[];
  (e.defpts||e.pts||[]).forEach(function(p){ if(p) out.push({p:P(p),mode:'node'}); });
  layout(e).forEach(function(q){
    if(q.k==='line'){ out.push({p:q.a,mode:'endpoint'},{p:q.b,mode:'endpoint'},{p:M.mid(q.a,q.b),mode:'midpoint'}); }
    else if(q.k==='arc'){ out.push({p:M.pol(q.c,q.a1,q.r),mode:'endpoint'},{p:M.pol(q.c,q.a2,q.r),mode:'endpoint'},{p:q.c,mode:'center'}); }
    else if(q.k==='arrow') out.push({p:q.p,mode:'endpoint'});
  });
  return out;
}

/* ---------- desenho (canvas, coordenadas de tela via view.toScreen) ---------- */
function fontOf(st){
  var ts=CAD.doc&&CAD.doc.textstyles&&CAD.doc.textstyles[st.textStyle];
  return (ts&&ts.font)||'sans-serif';
}
function drawL(ctx,L,v,st){
  var z=v.zoom, base=ctx.strokeStyle, cl=st.dimColor||base, ct=st.textColor||base;
  function S2(p){ return v.toScreen(p); }
  ctx.save();
  L.forEach(function(q){
    var a,b;
    if(q.k==='line'){ ctx.strokeStyle=cl; ctx.beginPath(); a=S2(q.a); b=S2(q.b); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
    else if(q.k==='arc'){ ctx.strokeStyle=cl; a=S2(q.c); ctx.beginPath(); ctx.arc(a.x,a.y,q.r*z,-q.a1,-q.a2,true); ctx.stroke(); }
    else if(q.k==='arrow'){
      var g=arrowGeom(q); ctx.strokeStyle=cl; ctx.fillStyle=cl;
      if(g.poly){ ctx.beginPath(); g.poly.forEach(function(p,i){ var s=S2(p); if(i)ctx.lineTo(s.x,s.y); else ctx.moveTo(s.x,s.y); }); ctx.closePath(); ctx.fill(); }
      else if(g.lines) g.lines.forEach(function(l){ ctx.beginPath(); var s0=S2(l[0]), s1=S2(l[1]); ctx.moveTo(s0.x,s0.y); ctx.lineTo(s1.x,s1.y); ctx.stroke(); });
      else if(g.circle){ var cs=S2(g.circle.c); ctx.beginPath(); ctx.arc(cs.x,cs.y,g.circle.r*z,0,TAU); ctx.fill(); }
    }
    else if(q.k==='text'){
      var px=q.h*z; if(px<2) return;
      a=S2(q.p); ctx.save(); ctx.translate(a.x,a.y); ctx.rotate(-q.r);
      ctx.fillStyle=ct; ctx.font=px+'px '+fontOf(st); ctx.textBaseline='middle';
      ctx.textAlign=q.j==='ml'?'left':(q.j==='mr'?'right':'center'); ctx.fillText(q.s,0,0); ctx.restore();
    }
  });
  ctx.restore();
}
function drawEnt(ctx,e,v){
  drawL(ctx,layout(e),v,getStyle(e.style,e.override));
}
function previewFor(build){
  return function(ctx,v,p){
    try{
      var tmp=build(p); if(!tmp) return;
      ctx.save(); ctx.strokeStyle='#0a6cff'; ctx.fillStyle='#0a6cff'; ctx.lineWidth=1; drawEnt(ctx,tmp,v); ctx.restore();
    }catch(x){}
  };
}

/* ---------- transformação, grips, propriedades, explode ---------- */
function apply(m,p){ return pt(m.a*p.x+m.c*p.y+m.e,m.b*p.x+m.d*p.y+m.f,p.z||0); }
function xform(e,m){
  var f=function(p){ return p?apply(m,p):p; }, patch={};
  if(e.defpts) patch.defpts=e.defpts.map(f);
  if(e.pts) patch.pts=e.pts.map(f);
  if(e.more) patch.more=e.more.map(function(b){ return b.map(f); });
  if(e.type==='dim'&&e.kind==='linear'){
    var r=(e.rot||0)*D2R; patch.rot=Math.atan2(m.b*Math.cos(r)+m.d*Math.sin(r),m.a*Math.cos(r)+m.c*Math.sin(r))*R2D;
  }
  if(e.type==='leader'&&e.h){ patch.h=e.h*Math.hypot(m.a,m.b); }
  return patch;
}
function grips(e){ return (e.defpts||e.pts||[]).map(function(p,i){ return p?{p:P(p),idx:i}:null; }).filter(Boolean); }
function grip(e,idx,p){
  var key=e.defpts?'defpts':'pts', arr=(e[key]||[]).slice(); arr[idx]=P(p); var o={}; o[key]=arr; return o;
}
function props(e){
  var out=[], names=Object.keys(store());
  if(e.type==='dim'){
    out.push({group:'Cota',key:'measure',label:'Medida',type:'readonly',value:dimText(e)});
    out.push({group:'Cota',key:'style',label:'Estilo',type:'select',options:names,value:e.style||curName(),patch:function(v){ return {style:v}; }});
    out.push({group:'Cota',key:'text',label:'Texto (<> = medida)',type:'text',value:(e.override&&e.override.text)||'',
      patch:function(v){ var o=Object.assign({},e.override||{}); if(v) o.text=v; else delete o.text; return {override:o}; }});
    if(e.kind==='linear') out.push({group:'Cota',key:'rot',label:'Ângulo da linha de cota',type:'number',value:e.rot||0,patch:function(v){ return {rot:+v}; }});
  }else{
    out.push({group:'Chamada',key:'str',label:'Texto',type:'text',value:e.str||'',patch:function(v){ return {str:v}; }});
    out.push({group:'Chamada',key:'style',label:'Estilo',type:'select',options:names,value:e.style||curName(),patch:function(v){ return {style:v}; }});
  }
  return out;
}
function mkEnt(type,e,extra){
  var o={type:type,layer:e.layer,color:e.color==null?null:e.color,lw:e.lw==null?null:e.lw,ltype:e.ltype==null?null:e.ltype,space:e.space||'model'};
  for(var k in extra) o[k]=extra[k];
  return o;
}
function explode(e){
  var out=[], st=getStyle(e.style,e.override);
  layout(e).forEach(function(q){
    if(q.k==='line') out.push(mkEnt('line',e,{p1:P(q.a),p2:P(q.b)}));
    else if(q.k==='arc'){ var a1=M.norm(q.a1)*R2D; out.push(mkEnt('arc',e,{c:P(q.c),r:q.r,a1:a1,a2:(a1+(q.a2-q.a1)*R2D)%360})); }
    else if(q.k==='arrow'){
      var g=arrowGeom(q);
      if(g.poly) out.push(mkEnt('pline',e,{pts:g.poly.map(function(p){ return {x:p.x,y:p.y,z:0,bulge:0}; }),closed:true}));
      else if(g.lines) g.lines.forEach(function(l){ out.push(mkEnt('line',e,{p1:P(l[0]),p2:P(l[1])})); });
      else if(g.circle) out.push(mkEnt('circle',e,{c:P(g.circle.c),r:g.circle.r}));
    }
    else if(q.k==='text') out.push(mkEnt('text',e,{p:P(q.p),h:q.h,str:q.s,rot:q.r*R2D,style:st.textStyle,just:q.j.toUpperCase()}));
  });
  return out;
}

/* ---------- SVG / DXF / DXF import ---------- */
function xmlEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function colorOf(e){
  try{ var r=CAD.doc&&CAD.doc.resolve&&CAD.doc.resolve(e); if(r&&typeof r.color==='string') return r.color; }catch(x){}
  return '#000000';
}
function toSVG(e){
  var col=colorOf(e), o=[], f=function(n){ return +n.toFixed(6); };
  layout(e).forEach(function(q){
    if(q.k==='line') o.push('<line x1="'+f(q.a.x)+'" y1="'+f(-q.a.y)+'" x2="'+f(q.b.x)+'" y2="'+f(-q.b.y)+'" stroke="'+col+'" fill="none"/>');
    else if(q.k==='arc'){
      var s=M.pol(q.c,q.a1,q.r), t=M.pol(q.c,q.a2,q.r), big=(q.a2-q.a1)>Math.PI?1:0;
      o.push('<path d="M'+f(s.x)+','+f(-s.y)+' A'+f(q.r)+','+f(q.r)+' 0 '+big+' 0 '+f(t.x)+','+f(-t.y)+'" stroke="'+col+'" fill="none"/>');
    }
    else if(q.k==='arrow'){
      var g=arrowGeom(q);
      if(g.poly) o.push('<polygon points="'+g.poly.map(function(p){ return f(p.x)+','+f(-p.y); }).join(' ')+'" fill="'+col+'" stroke="'+col+'"/>');
      else if(g.lines) g.lines.forEach(function(l){ o.push('<line x1="'+f(l[0].x)+'" y1="'+f(-l[0].y)+'" x2="'+f(l[1].x)+'" y2="'+f(-l[1].y)+'" stroke="'+col+'"/>'); });
      else if(g.circle) o.push('<circle cx="'+f(g.circle.c.x)+'" cy="'+f(-g.circle.c.y)+'" r="'+f(g.circle.r)+'" fill="'+col+'"/>');
    }
    else if(q.k==='text'){
      var an=q.j==='ml'?'start':(q.j==='mr'?'end':'middle'), x=f(q.p.x), y=f(-q.p.y);
      o.push('<text x="'+x+'" y="'+y+'" font-size="'+f(q.h)+'" text-anchor="'+an+'" dominant-baseline="central" font-family="sans-serif" fill="'+col+'" transform="rotate('+f(-q.r*R2D)+' '+x+' '+y+')">'+xmlEsc(q.s)+'</text>');
    }
  });
  return '<g>'+o.join('')+'</g>';
}
function toDXF(e){
  var L=layout(e), pr=[], pairs, tp=null, k;
  L.forEach(function(q){ if(q.k==='text'&&!tp) tp=q.p; });
  function p3(c,p){ pairs.push([c,p.x],[c+10,p.y],[c+20,p.z||0]); }
  if(e.type==='leader'){
    pairs=[[0,'LEADER'],[8,e.layer],[3,e.style||'Standard'],[71,1],[72,0],[73,3],[76,(e.pts||[]).length]];
    (e.pts||[]).forEach(function(p){ p3(10,p); });
    return {pairs:pairs,prims:L,text:e.str||''};
  }
  var T={linear:0,aligned:1,angular:5,diameter:3,radius:4,ordinate:6}, d=e.defpts;
  if(T[e.kind]==null) return {pairs:null,prims:L};
  pairs=[[0,'DIMENSION'],[8,e.layer],[2,'*D'],[3,e.style||'Standard']];
  var type=T[e.kind]+(e.kind==='ordinate'&&axisOf(e)==='x'?64:0);
  if(e.kind==='linear'||e.kind==='aligned'){ p3(10,d[2]); p3(11,tp||d[2]); pairs.push([70,type]); p3(13,d[0]); p3(14,d[1]); if(e.kind==='linear') pairs.push([50,e.rot||0]); }
  else if(e.kind==='radius'||e.kind==='diameter'){ p3(10,e.kind==='diameter'?M.sub(M.mul(d[0],2),d[1]):d[0]); p3(11,tp||d[1]); pairs.push([70,type]); p3(15,d[1]); }
  else if(e.kind==='ordinate'){ p3(10,d[0]); p3(11,tp||d[1]); pairs.push([70,type]); p3(13,d[0]); p3(14,d[1]); }
  else{ p3(10,d[3]); p3(11,tp||d[3]); pairs.push([70,type]); p3(13,d[1]); p3(14,d[2]); p3(15,d[0]); p3(16,d[3]); }
  var t=e.override&&e.override.text; if(t) pairs.push([1,t]);
  return {pairs:pairs,prims:L};
}
function fromDXF(g){
  var pr=g&&(g.pairs||g.codes||g); if(!Array.isArray(pr)) return null;
  var m={}; pr.forEach(function(q){ if(m[q[0]]==null) m[q[0]]=q[1]; });
  function p(c){ return m[c]!=null?pt(+m[c],+m[c+10]||0):null; }
  var ty=(+m[70]||0)&7, o={layer:m[8]||'0'}, e;
  if(ty===0||ty===1){ e=create(ty?'aligned':'linear',[p(13),p(14),p(10)],{rot:+m[50]||0}); }
  else if(ty===3){ var a=p(10),b=p(15); e=create('diameter',[M.mid(a,b),b,null]); }
  else if(ty===4){ e=create('radius',[p(15)?p(10):p(10),p(15),null]); }
  else return null;
  e.layer=o.layer; if(m[3]) e.style=m[3]; if(m[1]) e.override={text:m[1]};
  return e;
}

/* ---------- criação ---------- */
function baseEnt(type){
  var d=CAD.doc, cur=(d&&d.current)||{};
  return {type:type,layer:cur.layer||'0',color:cur.color==null?null:cur.color,lw:null,ltype:null,space:(d&&d.space)||'model'};
}
function create(kind,defpts,opts){
  opts=opts||{}; var e=baseEnt('dim');
  e.kind=kind; e.defpts=defpts.map(P); e.style=opts.style||curName(); e.override=opts.override?Object.assign({},opts.override):{};
  if(kind==='linear') e.rot=opts.rot||0;
  return e;
}
function createLeader(pts,str,opts){
  opts=opts||{}; var e=baseEnt('leader');
  e.pts=pts.map(P); e.str=str||''; e.style=opts.style||curName(); e.override=opts.override||{};
  if(opts.more&&opts.more.length) e.more=opts.more.map(function(b){ return b.map(P); });
  return e;
}
function idsOf(list,r){
  return list.map(function(e,i){ return e.id||(r&&r[i]&&(r[i].id||r[i]))||null; });
}
function addEnts(list,name){
  list=[].concat(list); var ids=null;
  runH(name||'Cota',function(){
    var r=CAD.ents.add(list); ids=idsOf(list,r);
    list.forEach(function(e,i){ if(!e.id&&ids[i]) e.id=ids[i]; });
  },function(){ CAD.ents.remove((ids||[]).filter(Boolean)); });
  return list;
}
function patchEnt(id,patch,name){
  var cur=CAD.ents.get(id); if(!cur) return;
  var old={}; Object.keys(patch).forEach(function(k){ old[k]=clone(cur[k]); });
  runH(name||'Editar cota',function(){ CAD.ents.update(id,clone(patch)); },function(){ CAD.ents.update(id,clone(old)); });
}
/* próxima cota de baseline/continue a partir de b */
function buildNext(kind,b,p2){
  var st=getStyle(b.style,b.override), sp=S(st,'baseSpacing'), d=b.defpts, nb;
  if(b.kind==='linear'||b.kind==='aligned'){
    var r=b.kind==='aligned'?M.ang(d[0],d[1]):(b.rot||0)*D2R, n=pt(-Math.sin(r),Math.cos(r));
    var o=M.dot(M.sub(d[2],d[0]),n), s=o<0?-1:1;
    nb=kind==='base'?create(b.kind,[d[0],p2,M.add(d[2],M.mul(n,s*sp))],{style:b.style,rot:b.rot})
                    :create(b.kind,[d[1],p2,d[2]],{style:b.style,rot:b.rot});
  }else{
    var ra=M.dist(d[0],d[3]);
    nb=kind==='base'?create('angular',[d[0],d[1],p2,M.pol(d[0],M.ang(d[0],d[3]),ra+sp)],{style:b.style})
                    :create('angular',[d[0],d[2],p2,d[3]],{style:b.style});
  }
  return nb;
}

/* ---------- medição (motor puro) ---------- */
function bulgeSeg(a,b,bu){
  var c=M.dist(a,b);
  if(!bu||c<EPS) return {len:c,seg:0};
  var th=4*Math.atan(bu), ath=Math.abs(th), r=c/(2*Math.sin(ath/2));
  return {len:r*ath,seg:(bu>0?1:-1)*0.5*r*r*(ath-Math.sin(ath))};
}
function polyMeas(pts,closed){
  var n=pts.length, len=0, A=0, m=closed?n:n-1;
  for(var i=0;i<m;i++){
    var a=pts[i], b=pts[(i+1)%n], s=bulgeSeg(a,b,a.bulge);
    len+=s.len; A+=(a.x*b.y-b.x*a.y)/2+s.seg;
  }
  return {length:len,area:closed?Math.abs(A):null};
}
function ellLen(a,b,t1,t2){
  var N=400, h=(t2-t1)/N, sum=0;
  function f(t){ return Math.sqrt(a*a*Math.sin(t)*Math.sin(t)+b*b*Math.cos(t)*Math.cos(t)); }
  for(var i=0;i<=N;i++) sum+=f(t1+i*h)*(i===0||i===N?1:(i%2?4:2));
  return sum*h/3;
}
function entMeas(e){
  var o={length:null,area:null};
  switch(e.type){
    case 'line': o.length=M.dist(e.p1,e.p2); break;
    case 'circle': o.length=TAU*e.r; o.area=Math.PI*e.r*e.r; break;
    case 'arc': o.length=e.r*M.ccw(e.a1*D2R,e.a2*D2R); break;
    case 'pline': var pm=polyMeas(e.pts||[],!!e.closed); o.length=pm.length; o.area=pm.area; break;
    case 'ellipse':
      var a=Math.hypot(e.major.x,e.major.y), b=a*e.ratio, full=e.a1==null||e.a2==null||Math.abs(e.a2-e.a1)>=360-1e-6||e.a1===e.a2;
      if(full){ o.length=Math.PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b))); o.area=Math.PI*a*b; }
      else o.length=ellLen(a,b,e.a1*D2R,(e.a1<e.a2?e.a2:e.a2+360)*D2R);
      break;
    case 'spline':
      var f=e.fit||[], l=0; for(var i=0;i<f.length-1;i++) l+=M.dist(f[i],f[i+1]);
      if(e.closed&&f.length>2) l+=M.dist(f[f.length-1],f[0]); o.length=l; break;
    default:
      try{
        if(CAD.geom&&CAD.geom.length){ var gl=CAD.geom.length(e); if(typeof gl==='number'&&isFinite(gl)) o.length=gl; }
        if(CAD.geom&&CAD.geom.area){ var ga=CAD.geom.area(e); if(typeof ga==='number'&&isFinite(ga)) o.area=Math.abs(ga); }
      }catch(x){}
  }
  return o;
}
function angleBetween(v,a,b){ return M.ccw(M.ang(v,a),M.ang(v,b))*R2D; }
var measureApi={
  prec:3,
  dist:M.dist,
  delta:function(a,b){ return {dx:b.x-a.x,dy:b.y-a.y,h:Math.abs(b.x-a.x),v:Math.abs(b.y-a.y),ang:M.norm(M.ang(a,b))*R2D}; },
  angle:angleBetween,
  poly:function(pts,closed){ return polyMeas(pts,closed); },
  area:function(pts){ return polyMeas(pts,true).area; },
  perimeter:function(pts,closed){ return polyMeas(pts,closed!==false).length; },
  ofEntity:entMeas,
  sum:function(ents){
    var t={length:0,area:0,count:0,open:0};
    ents.forEach(function(e){ var m=entMeas(e); if(m.length==null&&m.area==null) return; t.count++; t.length+=m.length||0; if(m.area!=null) t.area+=m.area; else t.open++; });
    return t;
  }
};
function mf(v){ return v.toFixed(measureApi.prec); }
function mU(){ return units(); }

/* ---------- comandos ---------- */
function isKw(r){ return !!r&&typeof r==='object'&&r.keyword!==undefined; }
function kc(r){ return String(r.keyword).charAt(0).toLowerCase(); }
function firstEnt(ids){ return ids&&ids.length?CAD.ents.get(ids[0]):null; }
function done(e,label){
  last.id=e.id||last.id; print(label+' = '+dimText(e));
}
function objEnds(e){
  if(e&&e.type==='line') return [e.p1,e.p2];
  if(e&&e.type==='arc') return [M.pol(e.c,e.a1*D2R,e.r),M.pol(e.c,e.a2*D2R,e.r)];
  if(e&&e.type==='pline'&&e.pts&&e.pts.length>=2) return [e.pts[0],e.pts[1]];
  print('Objeto não suportado: selecione linha, arco ou polilinha.'); return null;
}
function autoRot(p1,p2,dp){
  var m=M.mid(p1,p2); return Math.abs(dp.y-m.y)>=Math.abs(dp.x-m.x)?0:90;
}

OPS.linear=async function(aligned){
  var I=CAD.input, p1, p2, o={text:null,rot:null};
  p1=await I.point('COTA '+(aligned?'ALINHADA':'LINEAR')+' - origem da 1ª linha de extensão ou <Enter = selecionar objeto>:',{optional:true});
  if(!p1){
    var ends=objEnds(firstEnt(await I.select('Selecione o objeto a cotar:',{})));
    if(!ends) return; p1=ends[0]; p2=ends[1];
  }else{
    p2=await I.point('Origem da 2ª linha de extensão:',{base:p1}); if(!p2) return;
  }
  var kws=aligned?['Texto']:['Texto','Angulo','Horizontal','Vertical'];
  var build=function(dp){
    var ov={}; if(o.text!=null) ov.text=o.text;
    return create(aligned?'aligned':'linear',[p1,p2,dp],{override:ov,rot:aligned?0:(o.rot!=null?o.rot:autoRot(p1,p2,dp))});
  };
  for(;;){
    var r=await I.point('Posição da linha de cota ou ['+kws.join('/')+']:',{base:p2,keywords:kws,preview:previewFor(build)});
    if(!r) return;
    if(isKw(r)){
      var k=kc(r);
      if(k==='t'){ var s=await I.string('Texto da cota (<> = valor medido):',{def:'<>',allowEmpty:true}); o.text=(s==null||s==='<>')?null:s; }
      else if(k==='a'){ o.rot=await I.angle('Ângulo da linha de cota:',{def:0}); }
      else if(k==='h') o.rot=0; else if(k==='v') o.rot=90;
      continue;
    }
    var e=build(r); addEnts(e,aligned?'Cota alinhada':'Cota linear'); done(e,'Cota'); return;
  }
};

function sectorFor(v,ls,ap){
  var angs=[], R=0;
  ls.forEach(function(l){
    var far=M.dist(l.p1,v)>M.dist(l.p2,v)?l.p1:l.p2, a=M.ang(v,far); R=Math.max(R,M.dist(far,v));
    angs.push(M.norm(a),M.norm(a+Math.PI));
  });
  angs.sort(function(x,y){ return x-y; });
  var t=M.norm(M.ang(v,ap)), s0=angs[3], s1=angs[0];
  for(var i=0;i<4;i++){ var a=angs[i], b=angs[(i+1)%4]; if(M.norm(t-a)<=M.norm(b-a)){ s0=a; s1=b; break; } }
  R=R||1; return [M.pol(v,s0,R),M.pol(v,s1,R)];
}
OPS.angular=async function(){
  var I=CAD.input, v, p1, p2, two=null;
  var r=await I.point('COTA ANGULAR - vértice ou [Linhas/Arco]:',{keywords:['Linhas','Arco']});
  if(!r) return;
  if(isKw(r)){
    if(kc(r)==='a'){
      var o=firstEnt(await I.select('Selecione o arco:',{}));
      if(!o||o.type!=='arc'){ print('Selecione um arco.'); return; }
      v=o.c; p1=M.pol(o.c,o.a1*D2R,o.r); p2=M.pol(o.c,o.a2*D2R,o.r);
    }else{
      var ids=await I.select('Selecione duas linhas:',{}), l1=ids&&ids[0]&&CAD.ents.get(ids[0]), l2=ids&&ids[1]&&CAD.ents.get(ids[1]);
      if(!l1||!l2||l1.type!=='line'||l2.type!=='line'){ print('Selecione duas linhas.'); return; }
      v=M.inter(l1.p1,l1.p2,l2.p1,l2.p2); if(!v){ print('As linhas são paralelas.'); return; }
      two=[l1,l2];
    }
  }else{
    v=r; p1=await I.point('Primeiro ponto do ângulo:',{base:v}); if(!p1) return;
    p2=await I.point('Segundo ponto do ângulo:',{base:v}); if(!p2) return;
  }
  var build=function(ap){ var q1=p1,q2=p2; if(two){ var s=sectorFor(v,two,ap); q1=s[0]; q2=s[1]; } return create('angular',[v,q1,q2,ap]); };
  var ap=await I.point('Posição do arco da cota:',{base:v,preview:previewFor(build)}); if(!ap) return;
  var e=build(ap); addEnts(e,'Cota angular'); done(e,'Ângulo');
};

OPS.radial=async function(kind){
  var I=CAD.input, o=firstEnt(await I.select('Selecione arco ou círculo:',{}));
  if(!o||(o.type!=='circle'&&o.type!=='arc')){ print('Selecione um arco ou círculo.'); return; }
  var build=function(tp){ var a=tp?M.ang(o.c,tp):Math.PI/4; return create(kind,[o.c,M.pol(o.c,a,o.r),tp||null]); };
  var tp=await I.point('Posição da cota <Enter = automático>:',{base:o.c,optional:true,preview:previewFor(build)});
  if(isKw(tp)) tp=null;
  var e=build(tp||null); addEnts(e,kind==='radius'?'Cota de raio':'Cota de diâmetro'); done(e,kind==='radius'?'Raio':'Diâmetro');
};
OPS.arclen=async function(){
  var I=CAD.input, o=firstEnt(await I.select('Selecione o arco:',{}));
  if(!o||o.type!=='arc'){ print('Selecione um arco.'); return; }
  var build=function(ap){ return create('arclen',[o.c,M.pol(o.c,o.a1*D2R,o.r),M.pol(o.c,o.a2*D2R,o.r),ap]); };
  var ap=await I.point('Posição da cota do comprimento do arco:',{base:o.c,preview:previewFor(build)}); if(!ap) return;
  var e=build(ap); addEnts(e,'Cota de arco'); done(e,'Comprimento do arco');
};
OPS.ordinate=async function(){
  var I=CAD.input, f=await I.point('COTA ORDENADA - ponto do elemento:'); if(!f) return;
  var ax=null;
  var build=function(t){ return create('ordinate',[f,t],{override:ax?{axis:ax}:{}}); };
  for(;;){
    var r=await I.point('Fim da chamada ou [Xdatum/Ydatum]:',{base:f,keywords:['Xdatum','Ydatum'],preview:previewFor(build)});
    if(!r) return;
    if(isKw(r)){ ax=kc(r)==='x'?'x':'y'; continue; }
    var e=build(r); addEnts(e,'Cota ordenada'); done(e,'Ordenada'); return;
  }
};
OPS.chain=async function(kind){
  var I=CAD.input, b=last.id&&CAD.ents.get(last.id);
  if(!b||b.type!=='dim'||['linear','aligned','angular'].indexOf(b.kind)<0){
    b=firstEnt(await I.select('Selecione a cota base:',{}));
    if(!b||b.type!=='dim'||['linear','aligned','angular'].indexOf(b.kind)<0){ print('Selecione uma cota linear, alinhada ou angular.'); return; }
  }
  for(;;){
    var cur=b, build=function(p2){ return buildNext(kind,cur,p2); };
    var r=await I.point((kind==='base'?'COTA LINHA DE BASE':'COTA CONTÍNUA')+' - próxima origem de extensão <Enter = concluir>:',
      {optional:true,base:kind==='base'?cur.defpts[2]:cur.defpts[1],preview:previewFor(build)});
    if(!r||isKw(r)) return;
    var e=build(r); addEnts(e,kind==='base'?'Linha de base':'Cota contínua'); last.id=e.id||last.id; b=e;
    print((kind==='base'?'Base':'Contínua')+' = '+dimText(e));
  }
};
OPS.leader=async function(multi){
  var I=CAD.input, pts=[], more=[];
  var p=await I.point((multi?'MLEADER':'LEADER')+' - ponta da seta:'); if(!p) return; pts.push(p);
  for(;;){
    var q=await I.point('Próximo ponto <Enter = concluir>:',{base:pts[pts.length-1],optional:true,
      preview:previewFor(function(pp){ return pts.length>=1?createLeader(pts.concat([pp]),''):null; })});
    if(!q||isKw(q)) break; pts.push(q);
  }
  if(pts.length<2){ print('São necessários ao menos 2 pontos.'); return; }
  var str=await I.string('Texto da chamada (\\n = nova linha):',{def:'',allowEmpty:true});
  if(multi){
    for(;;){
      var t=await I.point('Seta adicional <Enter = concluir>:',{base:pts[pts.length-1],optional:true,
        preview:previewFor(function(pp){ return createLeader(pts,str||'',{more:more.concat([[pp]])}); })});
      if(!t||isKw(t)) break; more.push([t]);
    }
  }
  var e=createLeader(pts,str||'',{more:more}); addEnts(e,multi?'Multichamada':'Chamada'); print('Chamada criada.');
};
OPS.dimtext=async function(){
  var I=CAD.input, ids=await I.select('Selecione as cotas:',{});
  if(!ids||!ids.length) return;
  var s=await I.string('Novo texto (<> = medida; vazio = restaurar):',{def:'',allowEmpty:true}), n=0;
  CAD.history&&CAD.history.begin&&CAD.history.begin('Texto da cota');
  ids.forEach(function(id){
    var e=CAD.ents.get(id); if(!e||e.type!=='dim') return;
    var ov=Object.assign({},e.override||{}); if(s) ov.text=s; else delete ov.text;
    patchEnt(id,{override:ov},'Texto da cota'); n++;
  });
  CAD.history&&CAD.history.end&&CAD.history.end();
  print(n+' cota(s) alterada(s).');
};

var SCHEMA=[
  ['scale','Escala geral (DIMSCALE)','n'],['textH','Altura do texto (mm no papel)','n'],['arrowSize','Tamanho da seta (mm)','n'],
  ['arrowType','Tipo de seta','e',['closed','open','tick','dot','none']],['extOffset','Afastamento da origem (mm)','n'],
  ['extExt','Prolongamento da extensão (mm)','n'],['baseSpacing','Espaço entre cotas de base (mm)','n'],['textGap','Folga do texto (mm)','n'],
  ['textPos','Posição do texto','e',['above','centered']],['precision','Casas decimais','n'],['anglePrec','Casas decimais (ângulo)','n'],
  ['decSep','Separador decimal','e',['.',',']],['trimZeros','Suprimir zeros finais','b'],['unitFactor','Fator de unidade','n'],
  ['prefix','Prefixo','s'],['suffix','Sufixo','s'],['radPrefix','Prefixo de raio','s'],['diaPrefix','Prefixo de diâmetro','s'],
  ['arcSymbol','Símbolo de arco','e',['before','none']],['centerMark','Marca de centro (mm)','n'],['textStyle','Estilo de texto','s'],
  ['dimColor','Cor das linhas (vazio = camada)','s'],['textColor','Cor do texto (vazio = camada)','s']
];
function coerce(def,s){
  if(def[2]==='n'){ var v=parseFloat(String(s).replace(',','.')); return isFinite(v)?v:undefined; }
  if(def[2]==='b') return /^(1|s|sim|true|t|y)/i.test(String(s));
  if(def[2]==='e') return def[3].indexOf(s)>=0?s:undefined;
  return (s===''||s==null)&&(def[0]==='dimColor'||def[0]==='textColor')?null:String(s);
}
OPS.style=async function(){
  var I=CAD.input, names=Object.keys(store());
  var k=await I.keyword('DIMSTYLE [Corrente/Novo/Modificar/Listar/Excluir/Aplicar]',['Corrente','Novo','Modificar','Listar','Excluir','Aplicar'],'Listar');
  k=String(k||'L').charAt(0).toLowerCase();
  var name;
  if(k==='l'){ names.forEach(function(n){ var s=getStyle(n); print((n===curName()?'* ':'  ')+n+' - texto '+s.textH+' mm, seta '+s.arrowSize+' mm, escala '+s.scale+', '+s.precision+' casas'); }); }
  else if(k==='c'){ name=await I.string('Nome do estilo atual:',{def:curName()}); if(setCurrent(name)) print('Estilo atual: '+name); else print('Estilo inexistente.'); }
  else if(k==='n'){
    name=await I.string('Nome do novo estilo:',{}); if(!name) return;
    if(store()[name]){ print('Já existe um estilo com esse nome.'); return; }
    setStyle(name,getStyle(curName())); setCurrent(name); print('Estilo criado e definido como atual: '+name);
  }
  else if(k==='m'){
    name=curName(); var cs=getStyle(name);
    print('Estilo '+name+': '+SCHEMA.map(function(d){ return d[0]+'='+cs[d[0]]; }).join(', '));
    var key=await I.string('Propriedade a alterar:',{}), def=SCHEMA.filter(function(d){ return d[0]===key; })[0];
    if(!def){ print('Propriedade desconhecida.'); return; }
    var val=coerce(def,await I.string('Novo valor para '+key+':',{allowEmpty:true}));
    if(val===undefined){ print('Valor inválido.'); return; }
    var pa={}; pa[key]=val; setStyle(name,pa); print(key+' = '+val);
  }
  else if(k==='e'){ name=await I.string('Estilo a excluir:',{}); print(delStyle(name)?'Estilo excluído.':'Não foi possível excluir (Standard ou inexistente).'); }
  else if(k==='a'){
    name=await I.string('Aplicar o estilo:',{def:curName()}); if(!store()[name]){ print('Estilo inexistente.'); return; }
    var ids=await I.select('Selecione as cotas:',{}); if(!ids||!ids.length) return;
    CAD.history&&CAD.history.begin&&CAD.history.begin('Aplicar estilo de cota');
    ids.forEach(function(id){ var e=CAD.ents.get(id); if(e&&(e.type==='dim'||e.type==='leader')) patchEnt(id,{style:name},'Aplicar estilo'); });
    CAD.history&&CAD.history.end&&CAD.history.end();
  }
};
OPS.dim=async function(){
  var k=await CAD.input.keyword('COTA [Linear/Alinhada/Angular/Raio/Diametro/Arco/Ordenada/Base/Continua/Estilo]',
    ['Linear','Alinhada','Angular','Raio','Diametro','Arco','Ordenada','Base','Continua','Estilo'],'Linear');
  switch(String(k).toLowerCase().slice(0,3)){
    case 'ali': return OPS.linear(true);   case 'ang': return OPS.angular();
    case 'rai': return OPS.radial('radius'); case 'dia': return OPS.radial('diameter');
    case 'arc': return OPS.arclen();       case 'ord': return OPS.ordinate();
    case 'bas': return OPS.chain('base');  case 'con': return OPS.chain('cont');
    case 'est': return OPS.style();        default: return OPS.linear(false);
  }
};

/* medição */
function report(a,b){
  var d=measureApi.delta(a,b);
  print('Distância = '+mf(M.dist(a,b))+' '+mU()+' | ΔX (H) = '+mf(d.dx)+' | ΔY (V) = '+mf(d.dy)+' | Ângulo no plano XY = '+d.ang.toFixed(2)+'°');
}
OPS.dist=async function(){
  var I=CAD.input, a=await I.point('DIST - primeiro ponto:'); if(!a) return;
  var tot=0, prev=a, multi=false;
  for(;;){
    var b=await I.point(multi?'Próximo ponto <Enter = concluir>:':'Segundo ponto ou [Acumular]:',
      {base:prev,optional:multi,keywords:multi?undefined:['Acumular'],
       preview:function(ctx,v,pp){ if(CAD.render&&CAD.render.rubber) CAD.render.rubber(ctx,v,prev,pp); }});
    if(!b) break;
    if(isKw(b)){ multi=true; continue; }
    if(!multi){ report(a,b); return; }
    tot+=M.dist(prev,b); print('Trecho = '+mf(M.dist(prev,b))+' | Acumulado = '+mf(tot)+' '+mU()); prev=b;
  }
  if(multi) print('Distância acumulada = '+mf(tot)+' '+mU());
};
function reportPoly(pts,closed,label){
  var m=polyMeas(pts,closed);
  print((label||'')+'Área = '+mf(m.area)+' '+mU()+'² | Perímetro = '+mf(m.length)+' '+mU());
  return m;
}
OPS.area=async function(){
  var I=CAD.input, sign=1, mode=null, acc=0, n=0;
  for(;;){
    var r=await I.point('AREA - primeiro ponto ou ['+(mode?'Objeto/Somar/Subtrair] <Enter = concluir>':'Objeto/Somar/Subtrair]')+':',
      {optional:!!mode,keywords:['Objeto','Somar','Subtrair']});
    if(!r) break;
    var m=null;
    if(isKw(r)){
      var kw=String(r.keyword).toLowerCase();
      if(kw.indexOf('som')===0){ mode='add'; sign=1; print('Modo Somar.'); continue; }
      if(kw.indexOf('sub')===0){ mode='sub'; sign=-1; print('Modo Subtrair.'); continue; }
      var o=firstEnt(await I.select('Selecione o objeto:',{}));
      if(!o){ continue; }
      var em=entMeas(o);
      if(em.area==null){ print('Objeto aberto ou sem área. Comprimento = '+(em.length==null?'-':mf(em.length))+' '+mU()); if(!mode) break; continue; }
      print('Área = '+mf(em.area)+' '+mU()+'² | Perímetro = '+mf(em.length)+' '+mU()); m={area:em.area};
    }else{
      var pts=[r];
      for(;;){
        var q=await I.point('Próximo ponto <Enter = fechar>:',{base:pts[pts.length-1],optional:true,
          preview:function(ctx,v,pp){
            ctx.save(); ctx.strokeStyle='#0a6cff'; ctx.beginPath();
            pts.concat([pp]).forEach(function(p,i){ var s=v.toScreen(p); if(i)ctx.lineTo(s.x,s.y); else ctx.moveTo(s.x,s.y); });
            ctx.closePath(); ctx.stroke(); ctx.restore();
          }});
        if(!q||isKw(q)) break; pts.push(q);
      }
      if(pts.length<3){ print('São necessários ao menos 3 pontos.'); if(!mode) break; continue; }
      m=reportPoly(pts,true);
    }
    if(!mode) break;
    acc+=sign*m.area; n++; print('Área total acumulada = '+mf(acc)+' '+mU()+'² ('+n+' região(ões))');
  }
};
OPS.angle=async function(){
  var I=CAD.input, v=await I.point('MEDANG - vértice ou [Linhas]:',{keywords:['Linhas']});
  if(!v) return;
  if(isKw(v)){
    var ids=await I.select('Selecione duas linhas:',{}), l1=ids&&ids[0]&&CAD.ents.get(ids[0]), l2=ids&&ids[1]&&CAD.ents.get(ids[1]);
    if(!l1||!l2||l1.type!=='line'||l2.type!=='line'){ print('Selecione duas linhas.'); return; }
    var x=M.inter(l1.p1,l1.p2,l2.p1,l2.p2); if(!x){ print('Linhas paralelas: ângulo = 0°.'); return; }
    var a=M.norm(M.ang(l1.p1,l1.p2))%Math.PI, b=M.norm(M.ang(l2.p1,l2.p2))%Math.PI, d=Math.abs(a-b)*R2D;
    d=d>90?180-d:d; print('Ângulo entre as linhas = '+d.toFixed(2)+'° (suplemento '+(180-d).toFixed(2)+'°)'); return;
  }
  var p1=await I.point('Primeiro ponto:',{base:v}); if(!p1) return;
  var p2=await I.point('Segundo ponto:',{base:v}); if(!p2) return;
  var g=angleBetween(v,p1,p2); print('Ângulo = '+g.toFixed(2)+'° (replemento '+(360-g).toFixed(2)+'°)');
};
OPS.total=async function(){
  var ids=await CAD.input.select('TOTAL - selecione os objetos:',{});
  if(!ids||!ids.length) return;
  var list=ids.map(function(id){ return CAD.ents.get(id); }).filter(Boolean), t=measureApi.sum(list);
  print('Objetos medidos = '+t.count+' de '+list.length+' | Comprimento total = '+mf(t.length)+' '+mU()+' | Área total (fechados) = '+mf(t.area)+' '+mU()+'² | Abertos = '+t.open);
};

/* ---------- registro ---------- */
function registerTypes(){
  if(!CAD.types||!CAD.types.register) return;
  var common={draw:drawEnt,bbox:bboxOf,hit:function(e,p,tol){ return hitL(layout(e),p,tol); },snapPts:snapPts,grips:grips,grip:grip,
    transform:xform,props:props,explode:explode,toDXF:toDXF,toSVG:toSVG,measure:measure,layout:layout};
  CAD.types.register('dim',Object.assign({},common,{fromDXF:fromDXF}));
  CAD.types.register('leader',Object.assign({},common,{measure:function(){ return 0; }}));
}
function registerCmds(){
  if(cmdDone||!CAD.cmd||!CAD.cmd.register) return; cmdDone=true;
  [
    ['DIMLINEAR',['DLI','DIMLIN'],function(){ return OPS.linear(false); }],
    ['DIMALIGNED',['DAL','DIMALI'],function(){ return OPS.linear(true); }],
    ['DIMANGULAR',['DAN'],function(){ return OPS.angular(); }],
    ['DIMRADIUS',['DRA','DIMRAD'],function(){ return OPS.radial('radius'); }],
    ['DIMDIAMETER',['DDI','DIMDIA'],function(){ return OPS.radial('diameter'); }],
    ['DIMARC',['DAR'],function(){ return OPS.arclen(); }],
    ['DIMORDINATE',['DOR'],function(){ return OPS.ordinate(); }],
    ['DIMBASELINE',['DBA'],function(){ return OPS.chain('base'); }],
    ['DIMCONTINUE',['DCO'],function(){ return OPS.chain('cont'); }],
    ['LEADER',['LE'],function(){ return OPS.leader(false); }],
    ['MLEADER',['MLD','MLE'],function(){ return OPS.leader(true); }],
    ['DIMTEXT',['DTX'],function(){ return OPS.dimtext(); }],
    ['DIMSTYLE',['DST','DDIM'],function(){ return OPS.style(); }],
    ['DIM',[],function(){ return OPS.dim(); }]
  ].forEach(function(c){ CAD.cmd.register({name:c[0],alias:c[1],run:c[2]}); });
  [
    ['DIST',['DI'],function(){ return OPS.dist(); }],
    ['AREA',['AA'],function(){ return OPS.area(); }],
    ['MEDANG',['MA'],function(){ return OPS.angle(); }],
    ['TOTAL',['TOT'],function(){ return OPS.total(); }]
  ].forEach(function(c){ CAD.cmd.register({name:c[0],alias:c[1],raw:true,run:c[2]}); });
}
function mountPanel(el){
  function render(){
    if(!el) return; el.innerHTML='';
    var names=Object.keys(store()), cur=curName(), sel=document.createElement('select'), st=getStyle(cur);
    names.forEach(function(n){ var o=document.createElement('option'); o.value=n; o.textContent=n; if(n===cur) o.selected=true; sel.appendChild(o); });
    sel.onchange=function(){ setCurrent(sel.value); render(); };
    var bn=document.createElement('button'); bn.textContent='Novo'; bn.onclick=function(){
      var nm=window.prompt('Nome do novo estilo:'); if(nm&&!store()[nm]){ setStyle(nm,getStyle(cur)); setCurrent(nm); render(); } };
    var bd=document.createElement('button'); bd.textContent='Excluir'; bd.onclick=function(){ if(delStyle(sel.value)){ setCurrent('Standard'); render(); } };
    el.appendChild(sel); el.appendChild(bn); el.appendChild(bd);
    SCHEMA.forEach(function(def){
      var row=document.createElement('div'), lb=document.createElement('label'), inp;
      lb.textContent=def[1]+' '; lb.style.display='block'; lb.style.fontSize='12px';
      if(def[2]==='e'){ inp=document.createElement('select'); def[3].forEach(function(o){ var op=document.createElement('option'); op.value=o; op.textContent=o; inp.appendChild(op); }); inp.value=st[def[0]]; }
      else if(def[2]==='b'){ inp=document.createElement('input'); inp.type='checkbox'; inp.checked=!!st[def[0]]; }
      else{ inp=document.createElement('input'); inp.type=def[2]==='n'?'number':'text'; if(def[2]==='n') inp.step='any'; inp.value=st[def[0]]==null?'':st[def[0]]; }
      inp.onchange=function(){
        var val=def[2]==='b'?inp.checked:coerce(def,inp.value); if(val===undefined) return;
        var pa={}; pa[def[0]]=val; setStyle(cur,pa);
      };
      lb.appendChild(inp); row.appendChild(lb); el.appendChild(row);
    });
  }
  render();
  if(CAD.on) CAD.on('doc:changed',function(){ if(el&&el.isConnected!==false) render(); });
}
function registerUI(){
  if(uiDone||!CAD.ui) return; uiDone=true;
  var mn=CAD.ui.menu, tb=CAD.ui.toolbar;
  var items=[['Linear','↔','DIMLINEAR'],['Alinhada','⤢','DIMALIGNED'],['Angular','∠','DIMANGULAR'],['Raio','R','DIMRADIUS'],['Diâmetro','Ø','DIMDIAMETER'],
    ['Comprimento de arco','⌒','DIMARC'],['Ordenada','Y','DIMORDINATE'],['Linha de base','⊢','DIMBASELINE'],['Contínua','⊣','DIMCONTINUE'],
    ['Chamada','↗','LEADER'],['Multichamada','⇗','MLEADER'],['Estilo de cota','Aa','DIMSTYLE']];
  if(mn&&mn.add){
    items.forEach(function(a){ mn.add('Cotas/'+a[0],a[0],a[2]); });
    [['Distância','DIST'],['Área','AREA'],['Ângulo','MEDANG'],['Total por seleção','TOTAL']].forEach(function(a){ mn.add('Consultar/'+a[0],a[0],a[1]); });
  }
  if(tb&&tb.add){
    items.forEach(function(a){ tb.add('Cotas',{icone:a[1],rotulo:a[0],cmd:a[2]}); });
    [['Distância','⟷','DIST'],['Área','▱','AREA']].forEach(function(a){ tb.add('Consultar',{icone:a[1],rotulo:a[0],cmd:a[2]}); });
  }
  if(CAD.ui.panel&&CAD.ui.panel.register) CAD.ui.panel.register({id:'dimstyles',title:'Estilos de cota',mount:mountPanel});
}

/* ---------- API pública ---------- */
CAD.dim={
  create:create, createLeader:createLeader, add:addEnts, measure:measure, text:dimText, layout:layout, next:buildNext,
  style:{get:getStyle,set:setStyle,del:delStyle,list:function(){ return Object.keys(store()); },current:curName,setCurrent:setCurrent,schema:SCHEMA},
  fmt:{len:fmtLen,ang:fmtAng,num:fmtNum}, size:S
};
CAD.measure=measureApi;
registerTypes(); registerCmds(); registerUI();
if(CAD.on) CAD.on('ready',function(){ registerTypes(); registerCmds(); registerUI(); });

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p9=function(){
  var pass=0, fail=0;
  function ok(c,m){ if(c){ pass++; } else{ fail++; console.error('FALHOU P9: '+m); } }
  function near(a,b,m,t){ ok(Math.abs(a-b)<=(t||1e-6),m+' (obtido '+a+', esperado '+b+')'); }
  function cnt(L,k){ return L.filter(function(q){ return q.k===k; }).length; }
  var sc=0.1/mmU(), ov={scale:sc};           /* texto de 0.25 unid., proporcional em qualquer unidade */
  var st0=getStyle();
  /* formatação */
  ok(fmtNum(12.5,2,{decSep:','})==='12,50','fmtNum vírgula');
  ok(fmtNum(-0.0001,2,{})==='0.00','fmtNum zero negativo');
  ok(fmtNum(12.5,3,{trimZeros:true})==='12.5','fmtNum trimZeros');
  ok(sym('%%c10 %%p1 45%%d')==='Ø10 ±1 45°','símbolos %%');
  near(S(st0,'textH'),2.5*st0.scale*mmU(),'tamanho do texto escalado');
  /* medidas */
  near(measure(create('linear',[pt(0,0),pt(10,0),pt(5,3)],{rot:0})),10,'linear horizontal');
  near(measure(create('linear',[pt(0,0),pt(3,4),pt(5,3)],{rot:90})),4,'linear vertical');
  near(measure(create('aligned',[pt(0,0),pt(3,4),pt(5,3)])),5,'alinhada');
  near(measure(create('angular',[pt(0,0),pt(1,0),pt(0,1),pt(1,1)])),90,'angular 90');
  near(measure(create('angular',[pt(0,0),pt(0,1),pt(1,0),pt(1,1)])),270,'angular 270');
  near(measure(create('radius',[pt(0,0),pt(3,0),null])),3,'raio');
  near(measure(create('diameter',[pt(0,0),pt(3,0),null])),6,'diâmetro');
  near(measure(create('arclen',[pt(0,0),pt(2,0),pt(0,2),pt(3,3)])),Math.PI,'comprimento de arco');
  var eo=create('ordinate',[pt(12.5,4),pt(12.5,10)]);
  ok(axisOf(eo)==='x','ordenada eixo X'); near(measure(eo),12.5,'ordenada valor');
  eo=create('ordinate',[pt(12.5,4),pt(20,4)]); ok(axisOf(eo)==='y','ordenada eixo Y'); near(measure(eo),4,'ordenada Y');
  /* texto */
  var el=create('linear',[pt(0,0),pt(10,0),pt(5,3)],{rot:0,override:{text:'<> ±0.1',scale:sc}});
  ok(dimText(el)===fmtLen(10,getStyle(el.style,el.override))+' ±0.1','texto com <>');
  ok(dimText(create('radius',[pt(0,0),pt(3,0),null],{override:{scale:sc}})).charAt(0)==='R','prefixo de raio');
  /* layout */
  var e1=create('linear',[pt(0,0),pt(10,0),pt(5,3)],{rot:0,override:{scale:sc}}), L1=layout(e1);
  ok(cnt(L1,'arrow')===2&&cnt(L1,'text')===1,'linear: 2 setas e 1 texto');
  ok(L1.some(function(q){ return q.k==='line'&&Math.abs(q.a.y-3)<1e-9&&Math.abs(q.b.y-3)<1e-9&&Math.abs(M.dist(q.a,q.b)-10)<1e-9; }),'linear: linha de cota em y=3');
  ok(cnt(L1,'line')===3,'linear: 2 extensões + linha de cota');
  var e2=create('linear',[pt(0,0),pt(0.3,0),pt(0.15,1)],{rot:0,override:{scale:sc}}), L2=layout(e2);
  ok(cnt(L2,'arrow')===2,'cota curta: setas por fora');
  ok(L2.filter(function(q){ return q.k==='text'; })[0].p.x>0.3,'cota curta: texto fora das extensões');
  var ec=create('linear',[pt(0,0),pt(10,0),pt(5,3)],{rot:0,override:{scale:sc,textPos:'centered'}});
  ok(cnt(layout(ec),'line')===4,'texto centralizado quebra a linha de cota');
  ok(cnt(layout(create('angular',[pt(0,0),pt(5,0),pt(0,5),pt(3,3)],{override:{scale:sc}})),'arc')>=1,'angular tem arco');
  ok(cnt(layout(create('arclen',[pt(0,0),pt(5,0),pt(0,5),pt(7,7)],{override:{scale:sc}})),'arc')>=1,'arclen tem arco');
  var Rr=layout(create('radius',[pt(0,0),pt(5,0),null],{override:{scale:sc}}));
  ok(cnt(Rr,'arrow')===1&&cnt(Rr,'text')===1,'raio: 1 seta e texto');
  var Dd=layout(create('diameter',[pt(0,0),pt(5,0),null],{override:{scale:sc}}));
  ok(cnt(Dd,'arrow')===2,'diâmetro: 2 setas');
  ok(cnt(layout(create('ordinate',[pt(1,1),pt(1,5)],{override:{scale:sc}})),'text')===1,'ordenada: texto');
  /* bbox, hit, snap */
  var bb=bboxOf(e1); ok(bb.y2>=3&&bb.x1<=0&&bb.x2>=10,'bbox da cota linear');
  ok(hitL(L1,pt(5,3),0.01)===true,'hit na linha de cota'); ok(hitL(L1,pt(5,20),0.01)===false,'hit longe');
  ok(snapPts(e1).length>=3,'snapPts');
  /* transformação */
  var tr=xform(e1,{a:1,b:0,c:0,d:1,e:5,f:2}); near(tr.defpts[0].x,5,'translada x'); near(tr.rot,0,'translada mantém rot');
  var rr=xform(e1,{a:0,b:1,c:-1,d:0,e:0,f:0}); near(rr.rot,90,'gira 90 => rot 90');
  /* explode e SVG */
  var ex=explode(e1); ok(ex.length>=6&&ex.every(function(x){ return !!x.type; }),'explode gera entidades');
  ok(ex.some(function(x){ return x.type==='text'&&x.str===dimText(e1); }),'explode contém texto da cota');
  var sv=toSVG(e1); ok(sv.indexOf('<line')>=0&&sv.indexOf('<text')>=0,'toSVG');
  ok(toDXF(e1).pairs[0][1]==='DIMENSION','toDXF DIMENSION');
  /* baseline / continue */
  var nb=buildNext('base',e1,pt(20,0)), spn=S(getStyle(e1.style,e1.override),'baseSpacing');
  near(nb.defpts[2].y,3+spn,'baseline desloca a linha de cota'); near(measure(nb),20,'baseline mede da 1ª origem');
  var nc=buildNext('cont',e1,pt(20,0)); near(measure(nc),10,'continue parte da 2ª origem');
  /* chamadas */
  var ld=createLeader([pt(0,0),pt(2,2),pt(4,2)],'Texto\\nlinha 2',{override:{scale:sc}}), LL=layout(ld);
  ok(cnt(LL,'arrow')===1&&cnt(LL,'text')===2,'leader: seta e 2 linhas de texto');
  var ml=createLeader([pt(0,0),pt(2,2),pt(4,2)],'x',{override:{scale:sc},more:[[pt(3,-1)]]});
  ok(cnt(layout(ml),'arrow')===2,'multileader: 2 setas');
  /* medição */
  var semi=[{x:0,y:0,bulge:1},{x:2,y:0,bulge:0}];
  near(polyMeas(semi,true).area,Math.PI/2,'área do semicírculo (bulge)'); near(polyMeas(semi,true).length,Math.PI+2,'perímetro do semicírculo');
  var rect=[pt(0,0),pt(4,0),pt(4,3),pt(0,3)];
  near(measureApi.area(rect),12,'área do retângulo'); near(measureApi.perimeter(rect),14,'perímetro do retângulo');
  near(entMeas({type:'circle',r:2}).area,4*Math.PI,'área do círculo'); near(entMeas({type:'arc',r:2,a1:0,a2:90}).length,Math.PI,'arco 90°');
  near(entMeas({type:'ellipse',major:{x:3,y:0},ratio:1}).length,6*Math.PI,'elipse circular');
  var sm=measureApi.sum([{type:'line',p1:pt(0,0),p2:pt(3,4)},{type:'pline',pts:rect,closed:true},{type:'point'}]);
  near(sm.length,19,'soma de comprimentos'); near(sm.area,12,'soma de áreas'); ok(sm.count===2&&sm.open===1,'contagem total');
  var dl=measureApi.delta(pt(0,0),pt(3,4)); near(dl.h,3,'distância H'); near(dl.v,4,'distância V');
  near(measureApi.angle(pt(0,0),pt(1,0),pt(0,1)),90,'ângulo entre pontos');
  /* integração com o núcleo (se disponível) */
  if(CAD.doc&&CAD.ents&&CAD.history&&CAD.ents.query){
    var before=CAD.ents.query({type:'dim'}).length, e=create('linear',[pt(0,0),pt(10,0),pt(5,3)],{rot:0});
    addEnts(e,'Teste P9');
    ok(CAD.ents.query({type:'dim'}).length===before+1,'cota adicionada ao documento');
    CAD.history.undo(); ok(CAD.ents.query({type:'dim'}).length===before,'undo remove a cota');
    CAD.history.redo(); ok(CAD.ents.query({type:'dim'}).length===before+1,'redo recria a cota');
    CAD.history.undo();
    setStyle('T9',{textH:5}); ok(getStyle('T9').textH===5,'estilo criado');
    CAD.history.undo(); ok(store().T9===undefined,'undo remove o estilo');
  }else console.log('P9: testes de integração ignorados (núcleo ausente).');
  console.log('CAD.tests.p9: '+pass+' ok, '+fail+' falha(s)');
  return {pass:pass,fail:fail};
};
})(window.CAD=window.CAD||{});
/* ==== END:9 ==== */
