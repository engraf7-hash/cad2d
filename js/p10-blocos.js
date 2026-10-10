/* ==== PART:10 ==== */
(function(CAD){
'use strict';
if(!CAD.types||!CAD.cmd||!CAD.ents||!CAD.history){if(window.console)console.warn('P10 (Blocos) requer P1.');return;}
const PI=Math.PI,D2R=PI/180,R2D=180/PI,MAXD=8;
const B=()=>CAD.doc.blocks||(CAD.doc.blocks={});
const num=(v,d)=>(typeof v==='number'&&isFinite(v))?v:d;
const clone=o=>CAD.clone?CAD.clone(o):JSON.parse(JSON.stringify(o));
const pr=m=>CAD.cmd.print(m);
const yes=v=>/^s/i.test(String((v&&v.keyword)||v||''));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const curSpace=()=>typeof CAD.space==='function'?CAD.space():(CAD.space||'model');
const g=(...a)=>a.join('\n')+'\n';
const UF={m:1,cm:100,mm:1000,km:0.001,ft:3.28084,'in':39.3701};
const uf=()=>UF[(CAD.doc&&CAD.doc.units)||'m']||1;

/* ---------- matrizes ---------- */
const mmul=(m,n)=>({a:m.a*n.a+m.c*n.b,b:m.b*n.a+m.d*n.b,c:m.a*n.c+m.c*n.d,d:m.b*n.c+m.d*n.d,e:m.a*n.e+m.c*n.f+m.e,f:m.b*n.e+m.d*n.f+m.f});
const mapp=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f,z:p.z||0});
function insMatrix(e,blk){
  const r=num(e.rot,0)*D2R,c=Math.cos(r),s=Math.sin(r),sx=num(e.sx,1),sy=num(e.sy,1);
  const bs=(blk&&blk.base)||{x:0,y:0},a=c*sx,b=s*sx,cc=-s*sy,d=c*sy;
  return {a:a,b:b,c:cc,d:d,e:e.p.x-(a*bs.x+cc*bs.y),f:e.p.y-(b*bs.x+d*bs.y)};
}

/* ---------- cache / versão de definições ---------- */
let gver=0,lastDoc=null;const cache=new Map();
const bump=()=>{gver++;cache.clear();if(CAD.render&&CAD.render.request)CAD.render.request();};
const chk=()=>{if(lastDoc!==CAD.doc){lastDoc=CAD.doc;gver++;cache.clear();}};
const sig=e=>[gver,e.block,e.p.x,e.p.y,e.sx,e.sy,e.rot,e.layer,e.color,e.lw,e.ltype,JSON.stringify(e.attrs||null)].join('|');

/* ---------- definição de bloco ---------- */
function badName(n){
  if(!n)return 'Nome vazio.';
  if(/[<>\/\\":;?*|=`]/.test(n))return 'Nome contém caracteres inválidos.';
  return null;
}
const strip=e=>{const c=clone(e);delete c.id;delete c.space;delete c._bedit;return c;};
function refs(ents,name,seen){
  seen=seen||{};
  for(const e of ents){
    if(e.type!=='insert')continue;
    if(e.block===name)return true;
    if(seen[e.block])continue;seen[e.block]=1;
    const b=B()[e.block];if(b&&refs(b.ents,name,seen))return true;
  }
  return false;
}
function defineBlock(name,def){
  const prev=B()[name];
  const nb={base:def.base||{x:0,y:0,z:0},ents:def.ents.map(e=>{const c=clone(e);delete c.id;return c;}),desc:def.desc||''};
  const apply=()=>{B()[name]=nb;bump();};
  const undo=()=>{if(prev)B()[name]=prev;else delete B()[name];bump();};
  CAD.history.run({name:'BLOCK '+name,do:apply,undo:undo});
  return nb;
}
function removeBlock(name){
  const prev=B()[name];if(!prev)return false;
  CAD.history.run({name:'BDEL '+name,do:()=>{delete B()[name];bump();},undo:()=>{B()[name]=prev;bump();}});
  return true;
}
function renameBlock(o,n){
  const bad=badName(n);if(bad)return bad;
  if(!B()[o])return 'Bloco inexistente.';
  if(B()[n])return 'Já existe um bloco com esse nome.';
  const ins=CAD.ents.query(e=>e.type==='insert'&&e.block===o),prevMap=CAD.doc.blocks,next={};
  Object.keys(prevMap).forEach(k=>{
    const b=prevMap[k];
    next[k===o?n:k]=Object.assign({},b,{ents:b.ents.map(c=>c.type==='insert'&&c.block===o?Object.assign({},c,{block:n}):c)});
  });
  CAD.history.run({name:'BRENAME',
    do:()=>{CAD.doc.blocks=next;ins.forEach(e=>{e.block=n;});bump();if(CAD.emit)CAD.emit('doc:changed',{});},
    undo:()=>{CAD.doc.blocks=prevMap;ins.forEach(e=>{e.block=o;});bump();if(CAD.emit)CAD.emit('doc:changed',{});}});
  return null;
}
const attdefsOf=name=>((B()[name]||{}).ents||[]).filter(e=>e.type==='attdef');
function usage(name){
  let n=CAD.ents.query(e=>e.type==='insert'&&e.block===name).length;
  Object.keys(B()).forEach(k=>{if(k!==name)n+=B()[k].ents.filter(e=>e.type==='insert'&&e.block===name).length;});
  return n;
}
function unused(){
  const used={};
  const walk=n=>{if(used[n]||!B()[n])return;used[n]=1;B()[n].ents.forEach(e=>{if(e.type==='insert')walk(e.block);});};
  CAD.ents.query(e=>e.type==='insert').forEach(e=>walk(e.block));
  return Object.keys(B()).filter(n=>!used[n]);
}

/* ---------- expansão (insert → entidades de mundo) ---------- */
function inherit(w,c,e){
  w.space=e.space;
  if(!c.layer||c.layer==='0')w.layer=e.layer;
  ['color','lw','ltype'].forEach(k=>{if(c[k]==='byblock')w[k]=e[k];});
}
function attText(a,e,m){
  if(a.invisible)return null;
  const v=(!a.constant&&e.attrs&&e.attrs[a.tag]!==undefined)?e.attrs[a.tag]:(a.def||'');
  const sc=Math.hypot(m.a,m.b)||1;
  const t={type:'text',p:mapp(m,a.p),h:num(a.h,0.2)*sc,str:String(v),rot:num(a.rot,0)+Math.atan2(m.b,m.a)*R2D,
    style:a.style||'standard',just:a.just||'left',layer:a.layer,color:a.color==null?null:a.color,
    lw:a.lw==null?null:a.lw,ltype:a.ltype==null?null:a.ltype,_att:a.tag};
  inherit(t,a,e);return t;
}
function expandRaw(e,depth,one){
  const blk=B()[e.block];if(!blk||depth>MAXD)return [];
  const m=insMatrix(e,blk),out=[];
  for(const c of blk.ents){
    if(c.type==='attdef'){const t=attText(c,e,m);if(t)out.push(t);continue;}
    const T=CAD.types.get(c.type);if(!T||!T.transform)continue;
    const w=clone(c);delete w.id;Object.assign(w,T.transform(c,m));inherit(w,c,e);
    if(c.type==='insert'&&!one)out.push.apply(out,expandRaw(w,depth+1,false));else out.push(w);
  }
  return out;
}
function expand(e,o){
  if(o&&o.oneLevel)return expandRaw(e,0,true);
  chk();
  if(e.id==null)return expandRaw(e,0,false);
  const s=sig(e),h=cache.get(e.id);if(h&&h.s===s)return h.l;
  const l=expandRaw(e,0,false);if(cache.size>4000)cache.clear();
  cache.set(e.id,{s:s,l:l});return l;
}
const bb=c=>{try{const q=CAD.bboxOf(c);if(q)return q;}catch(_){}
  if(c.type==='text'){const w=c.h*0.6*String(c.str).length;return {x1:c.p.x,y1:c.p.y,x2:c.p.x+w,y2:c.p.y+c.h};}
  return null;};
function drawLabel(ctx,v,e){
  const p=v.toScreen(e.p),h=Math.max(1,e.h*v.zoom);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-num(e.rot,0)*D2R);ctx.font=h+'px sans-serif';
  ctx.fillStyle=CAD.resolve?CAD.resolve(e).color:'#000';ctx.fillText(e.str,0,0);ctx.restore();
}

/* ---------- tipo: insert ---------- */
CAD.types.register('insert',{
  draw(ctx,e,v){
    expand(e).forEach(c=>{
      if(CAD.visible&&!CAD.visible(c))return;
      const T=CAD.types.get(c.type);
      if(T&&T.draw)T.draw(ctx,c,v);else if(c.type==='text')drawLabel(ctx,v,c);
    });
  },
  bbox(e){
    let b=null;
    expand(e).forEach(c=>{const q=bb(c);if(!q)return;
      b=b?{x1:Math.min(b.x1,q.x1),y1:Math.min(b.y1,q.y1),x2:Math.max(b.x2,q.x2),y2:Math.max(b.y2,q.y2)}:{x1:q.x1,y1:q.y1,x2:q.x2,y2:q.y2};});
    return b||{x1:e.p.x,y1:e.p.y,x2:e.p.x,y2:e.p.y};
  },
  hit(e,p,tol){
    return expand(e).some(c=>{const T=CAD.types.get(c.type);
      if(T&&T.hit)return !!T.hit(c,p,tol);
      const q=bb(c);return !!q&&p.x>=q.x1-tol&&p.x<=q.x2+tol&&p.y>=q.y1-tol&&p.y<=q.y2+tol;});
  },
  snapPts(e){
    let r=[{pt:{x:e.p.x,y:e.p.y,z:e.p.z||0},mode:'node'}];
    expand(e).forEach(c=>{const T=CAD.types.get(c.type);if(T&&T.snapPts){const s=T.snapPts(c);if(s)r=r.concat(s);}});
    return r;
  },
  grips(e){return [{pt:{x:e.p.x,y:e.p.y,z:e.p.z||0},kind:'move',apply:np=>({p:{x:np.x,y:np.y,z:np.z||0}})}];},
  transform(e,m){
    const ang=Math.atan2(m.b,m.a)*R2D,sxm=Math.hypot(m.a,m.b)||1,sym=(m.a*m.d-m.b*m.c)/sxm;
    const sx=num(e.sx,1),sy=num(e.sy,1),rot=num(e.rot,0),p=mapp(m,e.p);
    if(sym<0)return {p:p,rot:ang-rot,sx:sx*sxm,sy:-sy*Math.abs(sym)};
    return {p:p,rot:rot+ang,sx:sx*sxm,sy:sy*sym};
  },
  props(e){
    const P=(key,label,type,value,set,ro)=>({key:key,label:label,type:type,value:value,group:'Bloco',readonly:!!ro,set:set});
    const r=[P('block','Nome','text',e.block,null,true),
      P('p.x','Posição X','number',e.p.x,v=>({p:Object.assign({},e.p,{x:+v})})),
      P('p.y','Posição Y','number',e.p.y,v=>({p:Object.assign({},e.p,{y:+v})})),
      P('sx','Escala X','number',e.sx,v=>({sx:+v})),P('sy','Escala Y','number',e.sy,v=>({sy:+v})),
      P('rot','Rotação','number',e.rot,v=>({rot:+v}))];
    attdefsOf(e.block).forEach(a=>{
      if(!a.constant)r.push(P('attrs.'+a.tag,a.prompt||a.tag,'text',(e.attrs&&e.attrs[a.tag]!==undefined)?e.attrs[a.tag]:a.def,
        v=>{const at=Object.assign({},e.attrs||{});at[a.tag]=String(v);return {attrs:at};}));
    });
    return r;
  },
  explode(e){return expand(e,{oneLevel:true});},
  toDXF(e){
    const at=expand(e,{oneLevel:true}).filter(c=>c._att!==undefined);
    let s=g(0,'INSERT',8,e.layer,100,'AcDbEntity',100,'AcDbBlockReference');
    if(at.length)s+=g(66,1);
    s+=g(2,e.block,10,e.p.x,20,e.p.y,30,e.p.z||0,41,e.sx,42,e.sy,43,1,50,e.rot);
    at.forEach(t=>{s+=g(0,'ATTRIB',8,t.layer||e.layer,100,'AcDbEntity',100,'AcDbText',10,t.p.x,20,t.p.y,30,0,40,t.h,1,t.str,50,t.rot,100,'AcDbAttribute',2,t._att,70,0);});
    if(at.length)s+=g(0,'SEQEND',8,e.layer);
    return s;
  },
  fromDXF(d){
    const q=(c,df)=>gv(d,c,df);
    const at={};(d&&d.attribs||[]).forEach(a=>{at[a.tag]=a.value;});
    return {type:'insert',block:String(q(2,'')),p:{x:+q(10,0),y:+q(20,0),z:+q(30,0)},sx:+q(41,1),sy:+q(42,1),rot:+q(50,0),
      attrs:at,layer:String(q(8,'0')),color:null,lw:null,ltype:null};
  },
  toSVG(e){
    return '<g>'+expand(e).map(c=>{const T=CAD.types.get(c.type);return T&&T.toSVG?T.toSVG(c):'';}).join('')+'</g>';
  }
});
function gv(d,code,df){
  if(!d)return df;
  if(Array.isArray(d)){for(const p of d)if(p[0]==code)return p[1];return df;}
  return d[code]!==undefined?d[code]:df;
}

/* ---------- tipo: attdef (definição de atributo; só dentro de blocos/edição) ---------- */
const asText=a=>({type:'text',p:a.p,h:a.h,str:'<'+a.tag+'>',rot:a.rot||0,style:a.style||'standard',just:a.just||'left',
  layer:a.layer,color:a.color,lw:a.lw,ltype:a.ltype,space:a.space});
const attBox=a=>{const w=num(a.h,.2)*.6*(String(a.tag).length+2);return {x1:a.p.x,y1:a.p.y,x2:a.p.x+w,y2:a.p.y+num(a.h,.2)};};
CAD.types.register('attdef',{
  draw(ctx,e,v){const T=CAD.types.get('text'),t=asText(e);if(T&&T.draw)T.draw(ctx,t,v);else drawLabel(ctx,v,t);},
  bbox:attBox,
  hit(e,p,tol){const b=attBox(e);return p.x>=b.x1-tol&&p.x<=b.x2+tol&&p.y>=b.y1-tol&&p.y<=b.y2+tol;},
  snapPts(e){return [{pt:{x:e.p.x,y:e.p.y,z:0},mode:'node'}];},
  grips(e){return [{pt:{x:e.p.x,y:e.p.y,z:0},kind:'move',apply:np=>({p:{x:np.x,y:np.y,z:0}})}];},
  transform(e,m){return {p:mapp(m,e.p),h:num(e.h,.2)*Math.hypot(m.a,m.b),rot:num(e.rot,0)+Math.atan2(m.b,m.a)*R2D};},
  props(e){
    const P=(key,label,type,value,set)=>({key:key,label:label,type:type,value:value,group:'Atributo',set:set});
    return [P('tag','Tag','text',e.tag,v=>({tag:String(v).toUpperCase().replace(/\s+/g,'_')})),
      P('prompt','Pergunta','text',e.prompt,v=>({prompt:String(v)})),P('def','Padrão','text',e.def,v=>({def:String(v)})),
      P('h','Altura','number',e.h,v=>({h:+v})),P('invisible','Invisível','bool',!!e.invisible,v=>({invisible:!!v})),
      P('constant','Constante','bool',!!e.constant,v=>({constant:!!v}))];
  },
  explode(e){const t=asText(e);t.str=String(e.def||'');return [t];},
  toDXF(e){
    return g(0,'ATTDEF',8,e.layer,100,'AcDbEntity',100,'AcDbText',10,e.p.x,20,e.p.y,30,0,40,e.h,1,e.def||'',50,e.rot||0,
      100,'AcDbAttributeDefinition',3,e.prompt||e.tag,2,e.tag,70,(e.invisible?1:0)|(e.constant?2:0));
  },
  fromDXF(d){
    const q=(c,df)=>gv(d,c,df),f=+q(70,0);
    return {type:'attdef',tag:String(q(2,'TAG')),prompt:String(q(3,'')),def:String(q(1,'')),p:{x:+q(10,0),y:+q(20,0),z:0},
      h:+q(40,0.2),rot:+q(50,0),style:'standard',just:'left',invisible:!!(f&1),constant:!!(f&2),layer:String(q(8,'0')),color:null,lw:null,ltype:null};
  },
  toSVG(e){const T=CAD.types.get('text'),t=asText(e);t.str=String(e.def||'');return T&&T.toSVG?T.toSVG(t):'';}
});

/* ---------- inserção programática ---------- */
function ensure(name){
  if(B()[name])return name;
  const it=libFind(name);
  if(!it)return null;
  const def=it.def?{base:it.def.base,ents:it.def.ents,desc:it.desc}:{base:{x:0,y:0,z:0},ents:it.make(builders(uf())),desc:it.desc};
  defineBlock(it.name,def);
  return it.name;
}
function insertBlock(name,p,o){
  o=o||{};const n=ensure(name);if(!n)return null;
  const sx=num(o.sx,1);
  const e={type:'insert',block:n,p:{x:p.x,y:p.y,z:p.z||0},sx:sx,sy:num(o.sy,sx),rot:num(o.rot,0),attrs:o.attrs||{},
    layer:o.layer||(CAD.doc.current&&CAD.doc.current.layer)||'0',color:null,lw:null,ltype:null,space:o.space||curSpace()};
  const r=CAD.ents.add(e);
  return r&&r.type?r:(Array.isArray(r)&&r[0]?r[0]:e);
}

/* ---------- biblioteca ---------- */
const LIB=[];
const libFind=n=>LIB.find(i=>i.name===n)||LIB.find(i=>i.name.toLowerCase()===String(n).toLowerCase());
function libAdd(it){const i=LIB.findIndex(x=>x.name===it.name);if(i>=0)LIB[i]=it;else LIB.push(it);}
function builders(k){
  const P=(x,y)=>({x:x*k,y:y*k,z:0}),bs=()=>({layer:'0',color:null,lw:null,ltype:null}),o={};
  o.L=(a,b,c,d)=>Object.assign(bs(),{type:'line',p1:P(a,b),p2:P(c,d)});
  o.PL=(a,cl)=>Object.assign(bs(),{type:'pline',pts:a.map(q=>({x:q[0]*k,y:q[1]*k,z:0,bulge:q[2]||0})),closed:!!cl});
  o.R=(x1,y1,x2,y2)=>o.PL([[x1,y1],[x2,y1],[x2,y2],[x1,y2]],1);
  o.C=(x,y,r)=>Object.assign(bs(),{type:'circle',c:P(x,y),r:r*k});
  o.A=(x,y,r,a1,a2)=>Object.assign(bs(),{type:'arc',c:P(x,y),r:r*k,a1:a1,a2:a2});
  o.T=(x,y,h,s)=>Object.assign(bs(),{type:'text',p:P(x,y),h:h*k,str:s,rot:0,style:'standard',just:'left'});
  o.AT=(tag,prompt,def,x,y,h)=>Object.assign(bs(),{type:'attdef',tag:tag,prompt:prompt,def:def,p:P(x,y),h:h*k,rot:0,style:'standard',just:'left',invisible:false,constant:false});
  return o;
}
function builtins(){
  const add=(g_,n,d,f)=>libAdd({group:g_,name:n,desc:d,make:f});
  [0.7,0.8,0.9,1.0].forEach(w=>add('Portas','Porta_'+w.toFixed(2),'Porta de giro '+w.toFixed(2)+' m (dobradiça na origem)',
    b=>[b.PL([[0,0],[.04,0],[.04,w],[0,w]],1),b.A(0,0,w,0,90),b.L(0,-.075,0,.075),b.L(w,-.075,w,.075)]));
  [1.2,1.5,2.0].forEach(w=>add('Janelas','Janela_'+w.toFixed(2),'Janela '+w.toFixed(2)+' m, parede 0,15 m',
    b=>[b.R(0,-.075,w,.075),b.L(0,-.025,w,-.025),b.L(0,.025,w,.025)]));
  add('Móveis','Mesa_1.60x0.90','Mesa retangular',b=>[b.R(-.8,-.45,.8,.45)]);
  add('Móveis','Cadeira','Cadeira em planta',b=>[b.R(-.22,-.22,.22,.22),b.R(-.22,.17,.22,.22)]);
  add('Móveis','Sofa_2.00','Sofá de 3 lugares',b=>[b.R(-1,-.45,1,.45),b.R(-1,.2,1,.45),b.R(-1,-.45,-.85,.2),b.R(.85,-.45,1,.2)]);
  add('Móveis','Cama_Casal','Cama de casal 1,40 x 1,90',b=>[b.R(-.7,-.95,.7,.95),b.R(-.6,.55,-.05,.9),b.R(.05,.55,.6,.9),b.L(-.7,.3,.7,.3)]);
  add('Móveis','Pia','Pia com cuba',b=>[b.R(-.3,-.25,.3,.25),b.R(-.2,-.17,.2,.17),b.C(0,0,.03)]);
  add('Móveis','Vaso_Sanitario','Vaso sanitário',b=>[b.R(-.2,.2,.2,.35),b.C(0,0,.19)]);
  [['Arvore_P',.6],['Arvore_M',1],['Arvore_G',1.5]].forEach(a=>add('Árvores',a[0],'Árvore em planta, raio '+a[1]+' m',b=>{
    const r=a[1],l=[b.C(0,0,r),b.C(0,0,r*.08)];
    for(let i=0;i<8;i++){const t=i*PI/4;l.push(b.L(Math.cos(t)*r*.15,Math.sin(t)*r*.15,Math.cos(t)*r*.8,Math.sin(t)*r*.8));}
    return l;}));
  add('Símbolos','Norte','Seta de norte',b=>[b.C(0,0,.5),b.PL([[0,.45],[-.15,-.3],[0,-.15],[.15,-.3]],1),b.T(-.07,.6,.2,'N')]);
  add('Símbolos','Nivel','Cota de nível com atributo COTA',b=>[b.PL([[-.15,.3],[.15,.3],[0,0]],1),b.L(-.25,.3,.6,.3),b.AT('COTA','Cota do nível','0.00',.3,.33,.2)]);
  add('Símbolos','Ponto_Topo','Ponto topográfico',b=>[b.C(0,0,.1),b.L(-.18,0,.18,0),b.L(0,-.18,0,.18)]);
  add('Símbolos','Marco','Marco/vértice',b=>[b.PL([[-.15,-.1],[.15,-.1],[0,.15]],1),b.C(0,0,.02)]);
}
/* biblioteca do usuário (IndexedDB) */
const idb=()=>new Promise((res,rej)=>{
  if(!window.indexedDB)return rej(new Error('sem IndexedDB'));
  const r=indexedDB.open('cad2d-blocklib',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('blocks',{keyPath:'name'});
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const idbTx=(mode,fn)=>idb().then(db=>new Promise((res,rej)=>{
  const t=db.transaction('blocks',mode),rq=fn(t.objectStore('blocks'));
  t.oncomplete=()=>res(rq&&rq.result);t.onerror=()=>rej(t.error);}));
function userAdd(name){
  const b=B()[name];if(!b)return Promise.reject(new Error('Bloco inexistente.'));
  const rec={name:name,desc:b.desc||'',def:{base:b.base,ents:clone(b.ents)}};
  libAdd({group:'Usuário',name:name,desc:rec.desc,def:rec.def,user:true});
  return idbTx('readwrite',s=>s.put(rec));
}
function userDel(name){
  const i=LIB.findIndex(x=>x.name===name&&x.user);if(i>=0)LIB.splice(i,1);
  return idbTx('readwrite',s=>s.delete(name));
}

/* ---------- DXF: seção BLOCKS ---------- */
function dxfBlock(name){
  const b=B()[name];if(!b)return '';
  let s=g(0,'BLOCK',8,0,100,'AcDbEntity',100,'AcDbBlockBegin',2,name,70,0,10,b.base.x,20,b.base.y,30,b.base.z||0,3,name,1,'');
  b.ents.forEach(c=>{const T=CAD.types.get(c.type);if(T&&T.toDXF){const t=T.toDXF(c);if(t)s+=/\n$/.test(t)?t:t+'\n';}});
  return s+g(0,'ENDBLK',8,0,100,'AcDbEntity',100,'AcDbBlockEnd');
}
function fromDXFBlock(name,base,ents){
  return defineBlock(name,{base:{x:+base.x||0,y:+base.y||0,z:+base.z||0},ents:ents});
}

/* ---------- edição de definição (BEDIT / BSAVE / BCLOSE) ---------- */
let editing=null;
const unionBox=ids=>{let b=null;ids.forEach(i=>{const e=CAD.ents.get(i);const q=e&&bb(e);if(!q)return;
  b=b?{x1:Math.min(b.x1,q.x1),y1:Math.min(b.y1,q.y1),x2:Math.max(b.x2,q.x2),y2:Math.max(b.y2,q.y2)}:{x1:q.x1,y1:q.y1,x2:q.x2,y2:q.y2};});return b;};
const idOf=(r,fb)=>r&&r.id!=null?r.id:(Array.isArray(r)&&r[0]&&r[0].id!=null?r[0].id:(fb&&fb.id));

/* ---------- atributos: prompts ---------- */
async function askAttrs(name,cur){
  const at=Object.assign({},cur||{});
  for(const a of attdefsOf(name)){
    if(a.constant)continue;
    const df=at[a.tag]!==undefined?at[a.tag]:(a.def||'');
    const v=await CAD.input.string((a.prompt||a.tag)+' <'+df+'>:',{def:df,allowEmpty:true});
    at[a.tag]=(v===''||v==null)?df:String(v);
  }
  return at;
}

/* ---------- comandos ---------- */
CAD.cmd.register({name:'BLOCK',alias:['B','BL','BLOCO'],async run(){
  const nm=String(await CAD.input.string('Nome do bloco:')).trim();
  const bad=badName(nm);if(bad){pr(bad);return;}
  if(B()[nm]&&!yes(await CAD.input.keyword('Bloco "'+nm+'" já existe. Redefinir? [Sim/Nao]',['Sim','Nao'],'Nao'))){pr('Cancelado.');return;}
  const base=await CAD.input.point('Ponto base:');
  const ids=await CAD.input.select('Selecione os objetos do bloco:');
  const ents=(ids||[]).map(i=>CAD.ents.get(i)).filter(Boolean);
  if(!ents.length){pr('Nenhum objeto selecionado.');return;}
  if(refs(ents,nm)){pr('Um bloco não pode conter a si mesmo.');return;}
  const conv=yes(await CAD.input.keyword('Converter objetos em bloco? [Sim/Nao]',['Sim','Nao'],'Sim'));
  defineBlock(nm,{base:{x:base.x,y:base.y,z:base.z||0},ents:ents.map(strip)});
  if(conv){CAD.ents.remove(ids);insertBlock(nm,base,{});}
  CAD.sel.clear();
  pr('Bloco "'+nm+'" definido com '+ents.length+' objeto(s).');
}});

CAD.cmd.register({name:'INSERT',alias:['I','INS'],async run(){
  let name=CAD.blocks._pending;CAD.blocks._pending=null;
  while(!name){
    const ns=Object.keys(B());
    pr('Blocos do desenho: '+(ns.join(', ')||'(nenhum)')+'. Biblioteca: '+LIB.map(i=>i.name).join(', '));
    const s=String(await CAD.input.string('Nome do bloco (? lista):')).trim();
    if(s!=='?')name=s;
  }
  const n=ensure(name);if(!n){pr('Bloco "'+name+'" não encontrado.');return;}
  const ghost=(ctx,v,p)=>{
    const t={type:'insert',block:n,p:p,sx:1,sy:1,rot:0,attrs:{},layer:(CAD.doc.current&&CAD.doc.current.layer)||'0',color:null,lw:null,ltype:null,space:curSpace()};
    ctx.save();ctx.globalAlpha=0.5;try{CAD.types.get('insert').draw(ctx,t,v);}finally{ctx.restore();}
  };
  const p=await CAD.input.point('Ponto de inserção:',{preview:ghost});
  const sc=await CAD.input.number('Escala <1>:',{def:1});
  const rot=await CAD.input.angle('Rotação <0>:',{def:0,base:p});
  const attrs=await askAttrs(n,{});
  insertBlock(n,p,{sx:sc||1,sy:sc||1,rot:rot||0,attrs:attrs});
  pr('Bloco "'+n+'" inserido.');
}});

CAD.cmd.register({name:'ATTDEF',alias:['ATT'],async run(){
  const tag=String(await CAD.input.string('Tag do atributo:')).trim().toUpperCase().replace(/\s+/g,'_');
  if(!tag){pr('Tag vazia.');return;}
  const prompt=String(await CAD.input.string('Pergunta <'+tag+'>:',{def:tag,allowEmpty:true})||tag);
  const def=String(await CAD.input.string('Valor padrão:',{def:'',allowEmpty:true})||'');
  const mode=String(await CAD.input.keyword('Modo [Normal/Invisivel/Constante]',['Normal','Invisivel','Constante'],'Normal')||'Normal');
  const p=await CAD.input.point('Ponto de inserção do texto:');
  const h=await CAD.input.number('Altura <'+(0.2*uf()).toFixed(2)+'>:',{def:0.2*uf(),min:0});
  CAD.ents.add({type:'attdef',tag:tag,prompt:prompt,def:def,p:{x:p.x,y:p.y,z:0},h:h||0.2*uf(),rot:0,style:'standard',just:'left',
    invisible:/^i/i.test(mode),constant:/^c/i.test(mode),layer:(CAD.doc.current&&CAD.doc.current.layer)||'0',color:null,lw:null,ltype:null,space:curSpace()});
  pr('Atributo '+tag+' criado. Inclua-o na seleção do comando BLOCK.');
}});

CAD.cmd.register({name:'ATTEDIT',alias:['ATE'],async run(){
  const ids=await CAD.input.select('Selecione um bloco com atributos:');
  const e=(ids||[]).map(i=>CAD.ents.get(i)).find(x=>x&&x.type==='insert');
  if(!e){pr('Nenhum bloco selecionado.');return;}
  if(!attdefsOf(e.block).some(a=>!a.constant)){pr('O bloco não tem atributos editáveis.');return;}
  CAD.ents.update(e.id,{attrs:await askAttrs(e.block,e.attrs)});
}});

CAD.cmd.register({name:'BEDIT',alias:['BE','BLOCKEDIT'],async run(){
  if(editing){pr('Já existe edição em andamento. Use BSAVE ou BCLOSE.');return;}
  let name=null;
  const sid=CAD.sel&&CAD.sel.ids?CAD.sel.ids():[];
  if(sid.length===1){const s=CAD.ents.get(sid[0]);if(s&&s.type==='insert')name=s.block;}
  if(!name)name=String(await CAD.input.string('Nome do bloco a editar:')).trim();
  const blk=B()[name];if(!blk){pr('Bloco "'+name+'" não existe.');return;}
  const list=blk.ents.map(c=>Object.assign(clone(c),{_bedit:name,space:curSpace()}));
  const added=CAD.ents.add(list);
  const arr=Array.isArray(added)?added:list;
  editing={name:name,base:Object.assign({},blk.base)};
  CAD.blocks.editing=editing;
  const bx=unionBox(arr.map(a=>a.id));
  if(bx&&CAD.view&&CAD.view.fit)CAD.view.fit(bx.x1,bx.y1,bx.x2,bx.y2,0.1);
  pr('Editando "'+name+'". Edite os objetos; BSAVE grava, BCLOSE descarta.');
}});

CAD.cmd.register({name:'BSAVE',alias:['BS'],async run(){
  if(!editing){pr('Nenhuma edição de bloco em andamento.');return;}
  const tagged=CAD.ents.query(e=>e._bedit===editing.name);
  const extra=await CAD.input.select('Objetos novos a incluir (Enter = só os do bloco):',{optional:true});
  const ids={};tagged.forEach(e=>{ids[e.id]=1;});(extra||[]).forEach(i=>{ids[i]=1;});
  const ents=Object.keys(ids).map(i=>CAD.ents.get(isNaN(i)?i:+i)||CAD.ents.get(i)).filter(Boolean);
  if(!ents.length){pr('Bloco ficaria vazio; use BCLOSE.');return;}
  if(refs(ents,editing.name)){pr('Um bloco não pode conter a si mesmo.');return;}
  defineBlock(editing.name,{base:editing.base,ents:ents.map(strip),desc:(B()[editing.name]||{}).desc});
  CAD.ents.remove(ents.map(e=>e.id));
  pr('Bloco "'+editing.name+'" atualizado.');editing=null;CAD.blocks.editing=null;CAD.sel.clear();
}});

CAD.cmd.register({name:'BCLOSE',alias:['BC'],async run(){
  if(!editing){pr('Nenhuma edição de bloco em andamento.');return;}
  const t=CAD.ents.query(e=>e._bedit===editing.name);
  if(t.length)CAD.ents.remove(t.map(e=>e.id));
  pr('Edição de "'+editing.name+'" descartada.');editing=null;CAD.blocks.editing=null;CAD.sel.clear();
}});

CAD.cmd.register({name:'BLIST',alias:['BL?'],run(){
  const ns=Object.keys(B());
  if(!ns.length){pr('Nenhum bloco no desenho.');return;}
  ns.forEach(n=>pr(n+': '+B()[n].ents.length+' objeto(s), '+usage(n)+' uso(s)'));
}});
CAD.cmd.register({name:'BPURGE',alias:['BPU'],run(){
  const u=unused();if(!u.length){pr('Nenhum bloco sem uso.');return;}
  u.forEach(removeBlock);pr(u.length+' bloco(s) removido(s): '+u.join(', '));
}});
CAD.cmd.register({name:'BDEL',run:async function(){
  const n=String(await CAD.input.string('Bloco a excluir:')).trim();
  if(!B()[n]){pr('Bloco inexistente.');return;}
  if(usage(n)){pr('Bloco em uso ('+usage(n)+'); explode ou apague os insert antes.');return;}
  removeBlock(n);pr('Bloco "'+n+'" excluído.');
}});
CAD.cmd.register({name:'BRENAME',alias:['BREN'],async run(){
  const o=String(await CAD.input.string('Nome atual:')).trim();
  const n=String(await CAD.input.string('Novo nome:')).trim();
  const er=renameBlock(o,n);pr(er||'Bloco renomeado.');
}});
CAD.cmd.register({name:'BLIBADD',async run(){
  const n=String(await CAD.input.string('Bloco a salvar na biblioteca do usuário:')).trim();
  try{await userAdd(n);pr('"'+n+'" salvo na biblioteca (grupo Usuário).');}catch(er){pr('Falha: '+er.message);}
}});
CAD.cmd.register({name:'BLIBDEL',async run(){
  const n=String(await CAD.input.string('Item da biblioteca do usuário a remover:')).trim();
  try{await userDel(n);pr('Removido.');}catch(er){pr('Falha: '+er.message);}
}});

/* ---------- painel, menu, toolbar ---------- */
function mountPanel(el){
  el.style.cssText='font:12px sans-serif;overflow:auto;padding:4px;color:#222;background:#fff';
  let t=null;
  const draw=()=>{
    const grp={};LIB.forEach(i=>{(grp[i.group]=grp[i.group]||[]).push(i);});
    const item=(n,d)=>'<button data-blk="'+esc(n)+'" title="'+esc(d||'')+'" style="margin:1px;padding:2px 6px;border:1px solid #bbb;background:#fafafa;cursor:pointer">'+esc(n)+'</button>';
    let h='<b>Blocos do desenho</b><div>'+(Object.keys(B()).map(n=>item(n,usage(n)+' uso(s)')).join('')||'<i>nenhum</i>')+'</div>';
    Object.keys(grp).forEach(k=>{h+='<div style="margin-top:6px"><b>'+esc(k)+'</b></div><div>'+grp[k].map(i=>item(i.name,i.desc)).join('')+'</div>';});
    el.innerHTML=h;
  };
  el.addEventListener('click',ev=>{
    const b=ev.target.closest&&ev.target.closest('[data-blk]');if(!b)return;
    CAD.blocks._pending=b.getAttribute('data-blk');CAD.cmd.run('INSERT');
  });
  CAD.on('doc:changed',()=>{clearTimeout(t);t=setTimeout(draw,250);});
  draw();
}
try{
  if(CAD.ui&&CAD.ui.panel)CAD.ui.panel.register({id:'blocks',title:'Blocos',mount:mountPanel});
  if(CAD.ui&&CAD.ui.menu){
    [['Criar bloco...','BLOCK'],['Inserir bloco...','INSERT'],['Definir atributo...','ATTDEF'],['Editar atributos...','ATTEDIT'],
     ['Editar definição...','BEDIT'],['Salvar definição','BSAVE'],['Descartar edição','BCLOSE'],['Listar blocos','BLIST'],
     ['Renomear bloco...','BRENAME'],['Limpar blocos sem uso','BPURGE'],['Salvar na biblioteca...','BLIBADD']]
     .forEach(m=>CAD.ui.menu.add('Bloco',m[0],m[1]));
  }
  if(CAD.ui&&CAD.ui.toolbar){
    CAD.ui.toolbar.add('Blocos',{icone:'▣',rotulo:'Criar bloco',cmd:'BLOCK'});
    CAD.ui.toolbar.add('Blocos',{icone:'⊞',rotulo:'Inserir bloco',cmd:'INSERT'});
    CAD.ui.toolbar.add('Blocos',{icone:'✎',rotulo:'Editar bloco',cmd:'BEDIT'});
  }
}catch(er){if(window.console)console.warn('P10: UI parcial',er);}

/* ---------- API pública ---------- */
builtins();
idbTx('readonly',s=>s.getAll()).then(l=>(l||[]).forEach(r=>libAdd({group:'Usuário',name:r.name,desc:r.desc||'',def:r.def,user:true}))).catch(()=>{});
CAD.blocks={
  _pending:null,editing:null,
  list:()=>Object.keys(B()),get:n=>B()[n]||null,exists:n=>!!B()[n],
  define:defineBlock,remove:removeBlock,rename:renameBlock,usage:usage,unused:unused,attdefs:attdefsOf,
  expand:expand,insMatrix:insMatrix,insert:insertBlock,ensure:ensure,
  dxfBlock:dxfBlock,fromDXFBlock:fromDXFBlock,
  library:{list:()=>LIB.map(i=>({group:i.group,name:i.name,desc:i.desc,user:!!i.user})),
    add:libAdd,load:ensure,userAdd:userAdd,userDel:userDel,groups:()=>Array.from(new Set(LIB.map(i=>i.group)))}
};

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p10=function(){
  let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.error('FALHA P10:',m);}};
  const near=(a,b)=>Math.abs(a-b)<1e-6;
  const m=insMatrix({p:{x:10,y:5},rot:90,sx:2,sy:2},{base:{x:1,y:1}});
  let q=mapp(m,{x:1,y:1,z:0});ok(near(q.x,10)&&near(q.y,5),'ponto base vai para o ponto de inserção');
  q=mapp(m,{x:2,y:1,z:0});ok(near(q.x,10)&&near(q.y,7),'rotação 90° + escala 2');
  q=mapp(mmul(m,{a:1,b:0,c:0,d:1,e:1,f:0}),{x:1,y:1,z:0});ok(near(q.x,10)&&near(q.y,7),'mmul');
  ok(!!badName('a/b')&&!!badName('')&&!badName('JANELA_1'),'validação de nomes');
  ok(CAD.blocks.library.list().length>=20,'biblioteca embutida (>=20 itens)');
  ['Portas','Janelas','Móveis','Árvores','Símbolos'].forEach(k=>ok(CAD.blocks.library.groups().indexOf(k)>=0,'grupo '+k));
  const t=CAD.types.get('insert').transform({p:{x:0,y:0},rot:30,sx:1,sy:1},{a:0,b:1,c:-1,d:0,e:5,f:5});
  ok(near(t.rot,120)&&near(t.p.x,5),'transform do insert (rot 90°)');
  const mir=CAD.types.get('insert').transform({p:{x:1,y:0},rot:0,sx:1,sy:1},{a:1,b:0,c:0,d:-1,e:0,f:0});
  ok(near(mir.sy,-1)&&near(mir.p.y,0),'transform do insert (espelho)');
  if(!CAD.types.get('line')){console.warn('P10: tipo "line" ausente (P5); testes com entidades ignorados.');}
  else{
    CAD.history.begin('p10-test');
    try{
      const L=(a,b,c,d)=>({type:'line',p1:{x:a,y:b,z:0},p2:{x:c,y:d,z:0},layer:'0',color:null,lw:null,ltype:null});
      const AT={type:'attdef',tag:'TAG',prompt:'t',def:'A',p:{x:0,y:0,z:0},h:.2,rot:0,layer:'0',color:null,lw:null,ltype:null};
      defineBlock('__T10',{base:{x:0,y:0,z:0},ents:[L(0,0,1,0),L(1,0,1,1),AT]});
      defineBlock('__T10o',{base:{x:0,y:0,z:0},ents:[{type:'insert',block:'__T10',p:{x:0,y:0,z:0},sx:1,sy:1,rot:0,attrs:{},layer:'0',color:null,lw:null,ltype:null}]});
      ok(!!B().__T10,'bloco definido');
      ok(refs(B().__T10o.ents,'__T10')&&!refs(B().__T10.ents,'__T10o'),'detecção de referência');
      const ins=insertBlock('__T10',{x:10,y:10,z:0},{sx:2,rot:90,layer:'0',attrs:{TAG:'Z'}});
      ok(!!ins&&ins.type==='insert','insert criado');
      const ex=expand(ins);
      ok(ex.length===3,'expansão: 2 linhas + 1 atributo');
      ok(near(ex[1].p2.x,8)&&near(ex[1].p2.y,12),'geometria transformada');
      ok(ex[2].type==='text'&&ex[2].str==='Z','valor do atributo');
      const ex2=expand(Object.assign({},ins,{attrs:{}}));ok(ex2[2].str==='A','atributo padrão');
      const bx=CAD.types.get('insert').bbox(ins);ok(bx&&near(bx.x1,8)&&near(bx.x2,10)&&near(bx.y1,10),'bbox');
      ok(CAD.types.get('insert').hit(ins,{x:9,y:12},0.05),'hit na geometria');
      ok(CAD.types.get('insert').explode(ins).length===3,'explode 1 nível');
      const nest=insertBlock('__T10o',{x:0,y:0,z:0},{});ok(expand(nest).length===3,'expansão aninhada');
      ok(usage('__T10')===2&&unused().indexOf('__T10')<0,'uso e purge');
      ok(renameBlock('__T10','__T10b')===null&&B().__T10b&&B().__T10o.ents[0].block==='__T10b'&&ins.block==='__T10b','rename propaga');
      ok(ensure('Porta_0.90')==='Porta_0.90'&&B()['Porta_0.90'].ents.length===4,'carrega da biblioteca');
      ok(CAD.types.get('insert').toDXF(ins).indexOf('INSERT')>=0,'toDXF');
    }catch(er){fail++;console.error('FALHA P10 (exceção):',er);}
    finally{CAD.history.end();CAD.history.undo();}
    ok(!B().__T10&&!B().__T10o&&!B().__T10b,'undo reverte blocos de teste');
  }
  console.log('P10: '+pass+' ok, '+fail+' falha(s)');
  return fail===0;
};
})(window.CAD=window.CAD||{});
/* ==== END:10 ==== */
