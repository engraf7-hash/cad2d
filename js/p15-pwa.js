/* ==== PART:15 ==== */
(function(CAD){
'use strict';
const VERSION='1.1.1'; // tools/build-release.js atualiza esta linha
const R=CAD.release=CAD.release||{};
R.version=VERSION;R.cache='cad2d-v'+VERSION;R.updateReady=false;R.sw='não iniciado';
const say=m=>{try{CAD.cmd&&CAD.cmd.print&&CAD.cmd.print(m);}catch(_){}};
const up=s=>String(s).toUpperCase();

/* ---------- contrato de release v1.0 ---------- */
const REQ_CMDS=['L','PL','C','A','REC','H','M','CO','RO','MI','O','TR','EX','E','S','SC','F','CHA','J','B','X','T','DIM','PR','PLOT','Z','U','UNDO','REDO','ZOOM','ZE','ZW','ZP','REGEN'];
const REQ_TYPES=['line','pline','circle','arc','ellipse','spline','point','xline','ray','hatch','text','mtext','dim','leader','insert'];
const REQ_FIO=['cad','dxf','svg'];
const REQ_MODS=['geom','snap','sel','view','history','types','ents','cmd','input','render','fileio','ui'];
const REQ_MODE=['osnap','ortho','polar','grid','snap','dynin'];
R.contract={cmds:REQ_CMDS,types:REQ_TYPES,fileio:REQ_FIO,mods:REQ_MODS,mode:REQ_MODE};

R.cmpVersion=function(a,b){const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);
  for(let i=0;i<3;i++){const d=(x[i]||0)-(y[i]||0);if(d)return d<0?-1:1;}return 0;};

/* ---------- service worker, atualização e instalação ---------- */
function registerSW(){
  if(typeof navigator==='undefined'||!('serviceWorker' in navigator)){R.sw='indisponível';return;}
  const h=location.hostname,ok=location.protocol==='https:'||h==='localhost'||h==='127.0.0.1'||h==='[::1]';
  if(!ok){R.sw='indisponível (use HTTPS ou localhost; em file:// o app roda, sem offline instalável)';return;}
  navigator.serviceWorker.register('service-worker.js').then(reg=>{
    R.sw='ativo';R.reg=reg;
    const flag=()=>{R.updateReady=true;say('Nova versão baixada. Salve o trabalho e use ATUALIZAR.');try{CAD.emit&&CAD.emit('release:update',{version:VERSION});}catch(_){}};
    if(reg.waiting&&navigator.serviceWorker.controller)flag();
    reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;
      w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)flag();});});
  }).catch(err=>{R.sw='falhou: '+err.message;});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(R._applying&&!R._reloading){R._reloading=true;location.reload();}});
}
R.applyUpdate=function(){
  if(CAD.doc&&CAD.doc.dirty){say('Há alterações não salvas. Salve o desenho antes de atualizar.');return false;}
  if(!R.reg||!R.reg.waiting){say('Nenhuma atualização pendente.');return false;}
  R._applying=true;R.reg.waiting.postMessage({type:'SKIP_WAITING'});return true;
};
let deferred=null;
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;});
  window.addEventListener('appinstalled',()=>{deferred=null;say('Aplicativo instalado.');});
  window.addEventListener('load',registerSW);
}
R.install=async function(){
  if(!deferred){say('Instalação indisponível agora. Use o menu do navegador: "Instalar este site como aplicativo" (HTTPS ou localhost).');return false;}
  deferred.prompt();const r=await deferred.userChoice;deferred=null;return r&&r.outcome==='accepted';
};

/* ---------- verificação de integração (conflitos, atalhos, contrato) ---------- */
function cmdMap(){
  let L=[];try{L=CAD.cmd.list()||[];}catch(_){}
  if(!Array.isArray(L))L=Object.keys(L).map(k=>L[k]);
  const own=new Map(),dups=[];
  const add=(t,who)=>{t=up(t);if(own.has(t)&&own.get(t)!==who)dups.push(t+' ('+own.get(t)+' × '+who+')');else own.set(t,who);};
  L.forEach(c=>{if(typeof c==='string'){add(c,up(c));return;}const n=up(c.name||'');if(n)add(n,n);[].concat(c.alias||c.aliases||[]).forEach(a=>add(a,n));});
  return{own,dups};
}
R._cmdMap=cmdMap;
R.check=function(){
  const rep={ok:true,errors:[],warns:[],info:{version:VERSION,sw:R.sw}};
  const E=m=>{rep.errors.push(m);rep.ok=false;},W=m=>rep.warns.push(m);
  REQ_MODS.forEach(m=>{const has=CAD.has?CAD.has(m):!!CAD[m];if(!has&&!CAD[m])E('módulo ausente: CAD.'+m);});
  const cm=cmdMap();rep.info.comandos=cm.own.size;
  cm.dups.forEach(d=>E('comando/atalho duplicado: '+d));
  REQ_CMDS.forEach(c=>{let f=cm.own.has(c);try{if(!f&&CAD.cmd.find)f=!!CAD.cmd.find(c);}catch(_){}if(!f)E('atalho/comando não registrado: '+c);});
  let tl=[];try{tl=CAD.types.list()||[];}catch(_){}
  const tn=tl.map(x=>typeof x==='string'?x:(x.type||x.name));rep.info.tipos=tn.length;
  REQ_TYPES.forEach(t=>{if(!tn.includes(t))E('tipo não registrado: '+t);});
  let fl=[];try{fl=CAD.fileio.list()||[];}catch(_){}
  const fe=fl.map(x=>String(typeof x==='string'?x:x.ext).replace(/^\./,'').toLowerCase());
  REQ_FIO.forEach(x=>{if(!fe.includes(x))E('formato de arquivo não registrado: '+x);});
  REQ_MODE.forEach(k=>{if(!CAD.mode||!(k in CAD.mode))E('CAD.mode.'+k+' ausente');});
  const tests=Object.keys(CAD.tests||{}).filter(k=>/^p\d+$/.test(k));rep.info.testes=tests.length;
  for(let i=1;i<=14;i++)if(!tests.includes('p'+i))W('CAD.tests.p'+i+' ausente');
  if(CAD.fileio&&!CAD.fileio.migrate)E('CAD.fileio.migrate ausente');
  if(CAD.doc&&CAD.doc.version==null)W('doc.version ausente');
  rep.info.avisosSW=R.sw;
  return rep;
};
R.runTests=function(){
  const names=Object.keys(CAD.tests||{}).filter(k=>/^p\d+$/.test(k)&&k!=='p15').sort((a,b)=>+a.slice(1)-+b.slice(1)),res=[];
  names.forEach(k=>{const orig=console.assert;let fails=0,err=null,ret;
    console.assert=function(c){if(!c)fails++;return orig.apply(console,arguments);};
    try{ret=CAD.tests[k]();}catch(e){err=e;}finally{console.assert=orig;}
    if(ret&&typeof ret.bad==='number')fails=Math.max(fails,ret.bad);
    res.push({teste:k,falhas:fails+(err?1:0),erro:err?String(err.message||err):''});});
  return res;
};
R.verify=function(){
  const c=R.check(),t=R.runTests(),bad=t.filter(x=>x.falhas);
  c.errors.forEach(m=>say('ERRO: '+m));c.warns.forEach(m=>say('AVISO: '+m));
  bad.forEach(x=>say('TESTE '+x.teste+': '+x.falhas+' falha(s) '+x.erro));
  say('Versão '+VERSION+' — '+(c.ok&&!bad.length?'integração OK':'há pendências')+' ('+t.length+' testes executados).');
  if(typeof console!=='undefined'&&console.table){console.table(t);}
  return{check:c,tests:t,ok:c.ok&&!bad.length};
};

/* ---------- teste de fumaça (seção 6) ---------- */
R.smoke=async function(o){
  o=o||{};const out=[];
  const skip=m=>{const e=new Error(m);e.skip=true;return e;},need=(c,m)=>{if(!c)throw skip(m);};
  const step=async(n,fn)=>{try{const r=await fn();out.push({passo:n,resultado:r===undefined?'OK':String(r)});}
    catch(e){out.push({passo:n,resultado:e&&e.skip?'PULADO: '+e.message:'FALHOU: '+(e&&e.message||e)});}};
  const D=()=>CAD.doc,all=()=>CAD.ents.query(()=>true),blank=()=>{const d=D().newDoc();if(d&&D().setDoc)D().setDoc(d);};
  if(!D()||!D().newDoc){say('SMOKE: CAD.doc.newDoc ausente.');return[{passo:'pré-requisito',resultado:'FALHOU: CAD.doc.newDoc ausente'}];}
  if(!o.force&&((D().entities&&D().entities.length)||D().dirty)){
    say('SMOKE recusado: o desenho atual tem conteúdo. Salve e use CAD.release.smoke({force:true}) (o desenho será substituído).');
    return[{passo:'proteção',resultado:'RECUSADO: desenho com conteúdo'}];}
  blank();
  const lay=(D().current&&D().current.layer)||'0',base={layer:lay,color:null,lw:null,ltype:null,space:'model'};
  let ids=[],text='';
  await step('desenhar (pline, circle, line)',()=>{need(CAD.ents&&CAD.history,'ents/history ausentes');
    const P=(x,y)=>({x,y,z:0,bulge:0}),es=[Object.assign({type:'pline',closed:true,pts:[P(0,0),P(10,0),P(10,6),P(0,6)]},base),
      Object.assign({type:'circle',c:{x:5,y:3,z:0},r:1},base),Object.assign({type:'line',p1:{x:0,y:0,z:0},p2:{x:10,y:6,z:0}},base)];
    CAD.history.run({name:'SMOKE',do:()=>{es.forEach(e=>CAD.ents.add(e));},undo:()=>{CAD.ents.remove(all().map(e=>e.id));}});
    ids=all().map(e=>e.id);if(ids.length!==3)throw new Error('esperado 3 entidades, há '+ids.length);});
  await step('editar (mover círculo) + undo/redo',()=>{need(CAD.types&&CAD.types.transform,'types.transform ausente');
    const c=all().find(e=>e.type==='circle');
    const m={a:1,b:0,c:0,d:1,e:5,f:0},patch=CAD.types.transform(c,m),old={c:Object.assign({},c.c)};
    CAD.history.run({name:'SMOKE-MOVE',do:()=>CAD.ents.update(c.id,patch),undo:()=>CAD.ents.update(c.id,old)});
    if(Math.abs(CAD.ents.get(c.id).c.x-10)>1e-9)throw new Error('mover falhou');
    CAD.history.undo();if(Math.abs(CAD.ents.get(c.id).c.x-5)>1e-9)throw new Error('undo falhou');
    CAD.history.redo();if(Math.abs(CAD.ents.get(c.id).c.x-10)>1e-9)throw new Error('redo falhou');
    CAD.history.undo();});
  await step('cotar',()=>{need(CAD.cmd&&CAD.cmd.find&&CAD.cmd.find('DIM'),'comando DIM ausente');return'manual: rode DIM e confira a cota';});
  await step('hachurar',()=>{need(CAD.hatch,'P7 ausente');const r=CAD.hatch.findBoundary({x:1,y:1});
    if(!r.ok)throw new Error(r.msg);CAD.hatch.create(r.loops,{});
    if(all().filter(e=>e.type==='hatch').length!==1)throw new Error('hachura não criada');});
  await step('inserir bloco',()=>{need(CAD.cmd&&CAD.cmd.find&&CAD.cmd.find('INSERT'),'comando INSERT ausente');return'manual: rode INSERT e confira o bloco';});
  const n=()=>all().length;
  await step('salvar/reabrir .cad (JSON + migrate)',async()=>{const f=CAD.fileio.get('cad');need(f&&f.export,'formato cad ausente');
    const b=await f.export(D());text=b&&b.text?await b.text():String(b);const j=JSON.parse(text);
    const m=(CAD.fileio.migrate&&CAD.fileio.migrate(j))||j;if(!m.entities||m.entities.length!==n())throw new Error('entidades divergem após reabrir');});
  await step('exportar e reimportar DXF',async()=>{const f=CAD.fileio.get('dxf');need(f&&f.export&&f.import,'formato dxf ausente');
    const b=await f.export(D()),t=b&&b.text?await b.text():String(b);
    if(!/SECTION/.test(t)||!/ENTITIES/.test(t))throw new Error('DXF sem seções');
    (D().layers||[]).forEach(l=>{if(t.indexOf(l.name)<0)throw new Error('layer perdida: '+l.name);});
    const d=await f.import(t);const c=d&&d.entities?d.entities.length:(Array.isArray(d)?d.length:0);if(!c)throw new Error('reimportação vazia');});
  await step('imprimir PDF em escala',()=>'manual: assistente PLOT; 10 m em 1:100 deve medir 100 mm na folha');
  await step('cache offline completo',async()=>{need(typeof caches!=='undefined','Cache API indisponível (use HTTPS/localhost)');
    const c=await caches.open(R.cache),ks=(await c.keys()).map(r=>new URL(r.url).pathname);
    const need2=[...document.scripts].map(s=>s.src).filter(Boolean).map(s=>new URL(s).pathname);
    const miss=need2.filter(p=>!ks.includes(p));if(!ks.length)throw new Error('cache '+R.cache+' vazio (recarregue após registrar o SW)');
    if(miss.length)throw new Error('fora do cache: '+miss.join(', '));});
  await step('sem requisições externas',()=>{need(typeof performance!=='undefined'&&performance.getEntriesByType,'Performance API ausente');
    const ext=performance.getEntriesByType('resource').map(r=>r.name).filter(u=>/^https?:/.test(u)&&new URL(u).origin!==location.origin);
    if(ext.length)throw new Error('externas: '+ext.slice(0,5).join(', '));});
  blank();
  if(console.table)console.table(out);
  const f=out.filter(x=>/^FALHOU/.test(x.resultado));say('SMOKE: '+(f.length?f.length+' falha(s)':'sem falhas')+'; '+out.filter(x=>/^(PULADO|manual)/i.test(x.resultado)).length+' passo(s) manuais/pulados.');
  return out;
};

/* ---------- comandos e menu ---------- */
function init(){
  if(init.done||!CAD.cmd||!CAD.cmd.register)return false;init.done=true;
  const reg=(name,fn)=>{try{CAD.cmd.register({name,alias:[],run:async()=>fn()});}catch(_){}};
  reg('VERSAO',()=>say('CAD 2D Offline v'+VERSION+' | cache '+R.cache+' | service worker: '+R.sw+(R.updateReady?' | atualização pendente (ATUALIZAR)':'')));
  reg('ATUALIZAR',()=>R.applyUpdate());reg('INSTALAR',()=>R.install());
  reg('VERIFICAR',()=>R.verify());reg('TESTEFUMACA',()=>R.smoke());
  try{CAD.ui&&CAD.ui.menu&&(CAD.ui.menu.add('Ajuda','Sobre / versão','VERSAO'),CAD.ui.menu.add('Ajuda','Instalar aplicativo','INSTALAR'),CAD.ui.menu.add('Ajuda','Verificar integração','VERIFICAR'));}catch(_){}
  return true;
}
if(!init()&&CAD.on)CAD.on('ready',init);

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p15=function(){
  let ok=0,bad=0;const t=(c,m)=>{if(c)ok++;else bad++;console.assert(c,'P15 FALHOU: '+m);};
  t(/^\d+\.\d+\.\d+$/.test(R.version)&&R.cache==='cad2d-v'+R.version,'versão e nome do cache');
  t(R.cmpVersion('1.0.0','1.2.0')===-1&&R.cmpVersion('2.0.0','1.9.9')===1&&R.cmpVersion('1.0.0','1.0.0')===0,'cmpVersion');
  const saved=CAD.cmd;const mk=(n,a)=>({name:n,alias:a});CAD.cmd={list:()=>[mk('AA',['A','X1']),mk('BB',['A']),'CC']};
  const m=cmdMap();CAD.cmd=saved;
  t(m.dups.length===1&&/^A /.test(m.dups[0]),'detecta atalho duplicado');t(m.own.get('X1')==='AA'&&m.own.get('CC')==='CC','mapa de comandos');
  const c=R.check();t(Array.isArray(c.errors)&&Array.isArray(c.warns)&&typeof c.ok==='boolean','forma do relatório');
  const r=R.runTests();t(Array.isArray(r)&&r.every(x=>x.teste!=='p15'),'runTests não recursivo');
  t(typeof R.smoke==='function'&&typeof R.applyUpdate==='function'&&typeof R.install==='function','API pública');
  console.log('CAD.tests.p15: '+ok+' ok, '+bad+' falha(s)');return{ok,bad};
};
})(window.CAD=window.CAD||{});
/* ==== END:15 ==== */
