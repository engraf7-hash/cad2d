/* ==== PART:11 ==== */
/* P11 Arquivos: .cad (JSON), novo/abrir/salvar/salvar como, IndexedDB, autosave e backup, SVG import/export.
   Depende só do P1. Degrada sem erro se faltar File System Access API, IndexedDB ou outras partes. */
(function(CAD){
'use strict';
var FORMAT='CAD2D',FORMAT_VER=1,D2R=Math.PI/180,INK='http://www.inkscape.org/namespaces/inkscape',
    FONT='Arial, Helvetica, sans-serif';
var st={name:'Sem título',named:false,handle:null,dirty:false,loading:false,changed:false,timer:null,
  prefs:{auto:true,every:60,keepAuto:10,keepSave:10,keepManual:20}};

/* ---------- utilidades ---------- */
function say(m){try{CAD.cmd.print(m);}catch(_){console.log(m);}}
function emit(ev,d){try{CAD.emit(ev,d);}catch(_){}}
function clone(o){return JSON.parse(JSON.stringify(o));}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function f(v){return String(Math.round(v*1e4)/1e4);}
function kb(n){return (n/1024).toFixed(1)+' KB';}
function cancel(){throw (CAD.Cancel||new Error('Cancelado'));}
function isCancel(e){return e===CAD.Cancel||(typeof CAD.Cancel==='function'&&e instanceof CAD.Cancel)||!!(e&&e.name==='Cancel');}
function safeFile(n){return String(n||'').replace(/\.cad$/i,'').replace(/[\\\/:*?"<>|]+/g,'_').trim()||'desenho';}
function act(fn){return function(){Promise.resolve().then(fn).catch(function(e){if(!isCancel(e))say('Erro: '+(e&&e.message||e));});};}
function guard(fn){return async function(){try{return await fn.apply(this,arguments);}catch(e){if(isCancel(e))throw e;say('Erro: '+(e&&e.message||e));}};}

/* ---------- formato .cad ---------- */
function blankLayer(n){return {name:n,color:'#000000',lw:0.25,ltype:'continuous',on:true,frozen:false,locked:false,transp:0,plot:true};}
function normalize(d){
  if(d&&d.doc&&!d.entities&&typeof d.doc==='object')d=d.doc;
  if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('Arquivo CAD inválido: conteúdo não é um desenho.');
  d.version=+d.version>0?+d.version:1;
  d.units=d.units||'m';
  ['blocks','dimstyles','textstyles'].forEach(function(k){if(!d[k]||typeof d[k]!=='object'||Array.isArray(d[k]))d[k]={};});
  if(!Array.isArray(d.layers))d.layers=[];
  if(!Array.isArray(d.entities))d.entities=[];
  if(!Array.isArray(d.layouts))d.layouts=[];
  var names={};
  d.layers=d.layers.filter(function(l){if(!l||typeof l.name!=='string'||names[l.name])return false;names[l.name]=1;return true;})
    .map(function(l){return Object.assign(blankLayer(l.name),l);});
  if(!names['0']){names['0']=1;d.layers.unshift(blankLayer('0'));}
  function need(n){if(!names[n]){names[n]=1;d.layers.push(blankLayer(n));}}
  d.entities=d.entities.filter(function(e){return e&&typeof e==='object'&&typeof e.type==='string';});
  var seen={},maxN=0,numeric=true;
  d.entities.forEach(function(e){
    if(e.id!=null&&typeof e.id!=='number')numeric=false;
    var n=parseInt(String(e.id).replace(/\D/g,''),10);if(n>maxN)maxN=n;});
  d.entities.forEach(function(e){
    if(e.id==null||seen[e.id])e.id=numeric?++maxN:'e'+(++maxN);
    seen[e.id]=1;
    e.space=e.space||'model';e.layer=e.layer||'0';need(e.layer);
    if(e.color===undefined)e.color=null;if(e.lw===undefined)e.lw=null;if(e.ltype===undefined)e.ltype=null;});
  var c=d.current;if(!c||typeof c!=='object')c=d.current={};
  if(!c.layer||!names[c.layer])c.layer='0';
  ['color','lw','ltype'].forEach(function(k){if(c[k]===undefined)c[k]=null;});
  return d;
}
function serialize(doc,pretty){
  return JSON.stringify({format:FORMAT,formatVersion:FORMAT_VER,app:'cad2d',saved:new Date().toISOString(),doc:doc},null,pretty?1:0);
}
function parseCad(text){
  if(typeof text!=='string')throw new Error('Conteúdo do arquivo ilegível.');
  var o;
  try{o=JSON.parse(text.replace(/^\uFEFF/,''));}catch(e){throw new Error('Arquivo .cad inválido (JSON corrompido): '+e.message);}
  if(o&&o.format&&o.format!==FORMAT)throw new Error('Formato desconhecido: '+o.format);
  if(o&&o.formatVersion>FORMAT_VER)say('Aviso: arquivo gerado por versão mais nova; alguns dados podem ser ignorados.');
  var d=normalize(o&&o.doc&&!o.entities?o.doc:o);
  try{var m=CAD.fileio.migrate(d);if(m&&typeof m==='object')d=m;}catch(e){say('Aviso: migração do arquivo falhou: '+e.message);}
  return d;
}

/* ---------- IndexedDB ---------- */
var DB=null;
function dbOpen(){
  if(DB)return DB;
  DB=new Promise(function(res,rej){
    if(!window.indexedDB){rej(new Error('IndexedDB indisponível neste navegador.'));return;}
    var r=indexedDB.open('cad2d',1);
    r.onupgradeneeded=function(){var d=r.result;
      if(!d.objectStoreNames.contains('projects'))d.createObjectStore('projects',{keyPath:'name'});
      if(!d.objectStoreNames.contains('snaps'))d.createObjectStore('snaps',{keyPath:'id',autoIncrement:true}).createIndex('kind','kind');
      if(!d.objectStoreNames.contains('data'))d.createObjectStore('data',{keyPath:'id'});
      if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'k'});};
    r.onsuccess=function(){res(r.result);};
    r.onerror=function(){rej(r.error);};
  });
  DB.catch(function(){DB=null;});
  return DB;
}
function T(stores,mode,fn){
  return dbOpen().then(function(db){return new Promise(function(res,rej){
    var names=[].concat(stores),t=db.transaction(names,mode),out={};
    var ss=names.map(function(n){return t.objectStore(n);});
    try{fn.apply(null,ss.concat([out,t]));}catch(e){rej(e);return;}
    t.oncomplete=function(){res(out);};
    t.onerror=t.onabort=function(){rej(t.error||new Error('Falha no IndexedDB'));};
  });});
}
function projPut(name,text,ts){return T(['projects','data'],'readwrite',function(p,d){p.put({name:name,ts:ts||Date.now(),size:text.length});d.put({id:'p:'+name,data:text});});}
function projGet(name){return T('data','readonly',function(d,o){d.get('p:'+name).onsuccess=function(e){o.v=e.target.result&&e.target.result.data;};}).then(function(o){return o.v;});}
function projDel(name){return T(['projects','data'],'readwrite',function(p,d){p.delete(name);d.delete('p:'+name);});}
function projList(){return T('projects','readonly',function(p,o){p.getAll().onsuccess=function(e){o.v=e.target.result;};}).then(function(o){return (o.v||[]).sort(function(a,b){return b.ts-a.ts;});});}
function snapList(){return T('snaps','readonly',function(s,o){s.getAll().onsuccess=function(e){o.v=e.target.result;};}).then(function(o){return (o.v||[]).sort(function(a,b){return b.id-a.id;});});}
function snapGet(id){return T('data','readonly',function(d,o){d.get(id).onsuccess=function(e){o.v=e.target.result&&e.target.result.data;};}).then(function(o){return o.v;});}
function snapPrune(kind,limit){
  return T(['snaps','data'],'readwrite',function(s,d){
    var ix=s.index('kind'),rg=IDBKeyRange.only(kind),c=ix.count(rg);
    c.onsuccess=function(){var n=c.result-limit;if(n<=0)return;var q=ix.openCursor(rg);
      q.onsuccess=function(){var cu=q.result;if(cu&&n>0){d.delete(cu.primaryKey);cu.delete();n--;cu.continue();}};};});
}
function snapPut(kind,text,ts){
  var lim={auto:st.prefs.keepAuto,save:st.prefs.keepSave,manual:st.prefs.keepManual}[kind]||10;
  return T(['snaps','data'],'readwrite',function(s,d,o){
    var q=s.add({kind:kind,name:st.name,ts:ts||Date.now(),size:text.length});
    q.onsuccess=function(){o.id=q.result;d.put({id:q.result,data:text});};
  }).then(function(o){return snapPrune(kind,lim).then(function(){return o.id;});});
}
function metaGet(k){return T('meta','readonly',function(s,o){s.get(k).onsuccess=function(e){o.v=e.target.result&&e.target.result.v;};}).then(function(o){return o.v;});}
function metaPut(k,v){return T('meta','readwrite',function(s){s.put({k:k,v:v});});}
function markSession(v){return metaPut('session',{unsaved:!!v,ts:Date.now(),name:st.name}).catch(function(){});}

/* ---------- estado, carga e título ---------- */
function setDirty(v){
  st.dirty=!!v;try{CAD.dirty=st.dirty;}catch(_){}
  try{document.title=(st.dirty?'\u25CF ':'')+st.name+' \u2014 CAD 2D';}catch(_){}
  emit('file:changed');
}
function finishLoad(dirty){
  st.changed=!!dirty;setDirty(dirty);
  try{CAD.render.request();}catch(_){}
  setTimeout(function(){st.loading=false;setDirty(dirty);},60); /* ignora doc:changed assíncronos do setDoc */
  markSession(false);
}
function zoomAll(){
  var b;try{b=CAD.view.extents();}catch(_){}
  if(b&&isFinite(b.x1)&&isFinite(b.x2)&&isFinite(b.y1)&&isFinite(b.y2)){try{CAD.view.fit(b.x1,b.y1,b.x2,b.y2,0.05);}catch(_){}}
}
function loadDoc(d,o){
  o=o||{};st.loading=true;
  d=normalize(d);
  try{var m=CAD.fileio.migrate(d);if(m&&typeof m==='object')d=m;}catch(_){}
  CAD.setDoc(d);
  try{CAD.history.clear();}catch(_){}
  try{CAD.sel.clear();}catch(_){}
  st.name=safeFile(o.name||'Sem título');st.named=!!o.named;st.handle=o.handle||null;
  zoomAll();finishLoad(!!o.dirty);
}
function doNew(){
  st.loading=true;
  var d=CAD.newDoc();if(d&&typeof d==='object'&&d!==CAD.doc)CAD.setDoc(d);
  try{CAD.history.clear();}catch(_){}
  try{CAD.sel.clear();}catch(_){}
  st.name='Sem título';st.named=false;st.handle=null;finishLoad(false);
}
async function confirmDiscard(){
  if(st.dirty&&!window.confirm('Há alterações não salvas. Descartar e continuar?'))cancel();
}

/* ---------- entrada/saída de arquivos ---------- */
var MIME={cad:'application/json',json:'application/json',svg:'image/svg+xml'};
function accept(ext,label){var o={};o[MIME[ext]||'text/plain']=ext==='cad'?['.cad','.json']:['.'+ext];return {description:label||ext.toUpperCase(),accept:o};}
function fmts(wantExport){
  var L=[];try{L=CAD.fileio.list()||[];}catch(_){}
  if(!Array.isArray(L))L=Object.keys(L).map(function(k){return L[k];});
  return L.filter(function(x){return x&&x.ext&&(wantExport?x.export:x.import);});
}
function download(blob,name){
  var a=document.createElement('a'),u=URL.createObjectURL(blob);
  a.href=u;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(u);a.remove();},4000);
}
function pickFile(acc){
  return new Promise(function(res,rej){
    var i=document.createElement('input'),done=false;
    i.type='file';i.accept=acc||'';i.style.display='none';
    function end(file){if(done)return;done=true;i.remove();file?res(file):rej(CAD.Cancel||new Error('Cancelado'));}
    i.onchange=function(){end(i.files&&i.files[0]);};
    i.addEventListener('cancel',function(){end(null);});
    window.addEventListener('focus',function(){setTimeout(function(){if(!(i.files&&i.files[0]))end(null);},700);},{once:true});
    document.body.appendChild(i);i.click();
  });
}
async function pickOpen(types,acc){
  if(window.showOpenFilePicker){
    try{var hs=await window.showOpenFilePicker({types:types});return {file:await hs[0].getFile(),handle:hs[0]};}
    catch(e){if(e&&e.name==='AbortError')cancel();}
  }
  return {file:await pickFile(acc),handle:null};
}
async function saveBlob(blob,fname,ext,label,handle){
  var h=handle;
  if(!h&&window.showSaveFilePicker){
    try{h=await window.showSaveFilePicker({suggestedName:fname,types:[accept(ext,label)]});}
    catch(e){if(e&&e.name==='AbortError')cancel();h=null;}
  }
  if(h){
    try{var w=await h.createWritable();await w.write(blob);await w.close();return {handle:h,name:h.name||fname};}
    catch(e){if(e&&e.name==='AbortError')cancel();say('Aviso: gravação direta falhou ('+(e.message||e)+'); baixando o arquivo.');}
  }
  download(blob,fname);return {handle:null,name:fname};
}
async function persist(text,kind){
  try{var ts=Date.now();await projPut(st.name,text,ts);if(kind)await snapPut(kind,text,ts);}
  catch(e){say('Aviso: cópia no navegador não gravada ('+(e&&e.message||e)+').');}
  emit('file:changed');
}
async function doSave(forceAs){
  var text=serialize(CAD.doc),blob=new Blob([text],{type:'application/json'}),base=st.name;
  if(!window.showSaveFilePicker&&(forceAs||!st.named)){
    var nm=await CAD.input.string('Nome do arquivo',{def:base});base=safeFile(nm||base);
  }
  var r=await saveBlob(blob,safeFile(base)+'.cad','cad','Desenho CAD 2D',forceAs?null:st.handle);
  st.handle=r.handle;st.name=safeFile(r.handle?r.name:base);st.named=true;
  setDirty(false);st.changed=false;await markSession(false);
  await persist(text,'save');
  say('Arquivo salvo: '+r.name+' ('+kb(text.length)+')');emit('file:saved',{name:st.name});
}
async function doOpen(){
  await confirmDiscard();
  var all=fmts(false);
  var r=await pickOpen(all.map(function(x){return accept(x.ext,x.label);}),all.map(function(x){return '.'+x.ext;}).join(',')+',.json');
  var fl=r.file,ext=((fl.name.match(/\.([^.]+)$/)||[])[1]||'cad').toLowerCase(),text=await fl.text(),d,isCad=(ext==='cad'||ext==='json');
  if(isCad)d=parseCad(text);
  else{
    var fio=CAD.fileio.get(ext);
    if(!fio||!fio.import)throw new Error('Formato .'+ext+' não suportado (módulo ausente).');
    d=await fio.import(text,fl.name);
    if(!d||!Array.isArray(d.entities))throw new Error('A importação de .'+ext+' não retornou um desenho.');
  }
  loadDoc(d,{name:fl.name.replace(/\.[^.]+$/,''),handle:isCad?r.handle:null,named:isCad,dirty:!isCad});
  say('Aberto: '+fl.name+' ('+CAD.doc.entities.length+' entidades)');
}
async function doExport(){
  var L=fmts(true),exts=L.map(function(x){return x.ext;});
  if(!exts.length)throw new Error('Nenhum formato de exportação registrado.');
  var ext=await CAD.input.keyword('Formato de exportação',exts,exts.indexOf('svg')>=0?'svg':exts[0]);
  ext=String((ext&&ext.keyword)||ext||'').toLowerCase();
  var fio=CAD.fileio.get(ext);if(!fio||!fio.export)throw new Error('Formato inválido: '+ext);
  var blob=await fio.export(CAD.doc);if(!(blob instanceof Blob))blob=new Blob([String(blob)]);
  var r=await saveBlob(blob,safeFile(st.name)+'.'+ext,ext,fio.label,null);
  say('Exportado: '+r.name);
}
async function openLib(name){
  await confirmDiscard();
  var t=await projGet(name);if(!t)throw new Error('Projeto não encontrado: '+name);
  loadDoc(parseCad(t),{name:name,named:true});say('Aberto do navegador: '+name);
}
async function restoreSnap(id,name){
  await confirmDiscard();
  var t=await snapGet(id);if(!t)throw new Error('Versão não encontrada.');
  loadDoc(parseCad(t),{name:name||'recuperado',named:false,dirty:true});say('Versão restaurada. Salve para gravar em arquivo.');
}

/* ---------- autosave, backup, recuperação ---------- */
async function autosaveNow(kind){
  kind=kind||'auto';
  if(kind==='auto'&&(!st.changed||st.loading))return false;
  try{var was=st.changed;if(kind==='auto')st.changed=false;
    await snapPut(kind,serialize(CAD.doc),Date.now());emit('file:changed');return true;}
  catch(e){st.changed=true;return false;}
}
function startAutosave(){
  if(st.timer){clearInterval(st.timer);st.timer=null;}
  if(st.prefs.auto&&st.prefs.every>=10)st.timer=setInterval(function(){autosaveNow('auto');},st.prefs.every*1000);
}
async function latestSnap(){
  var L=await snapList();
  for(var i=0;i<L.length;i++)if(L[i].kind==='auto'||L[i].kind==='manual')return L[i];
  return null;
}
async function checkRecovery(){
  try{
    var s=await metaGet('session');if(!s||!s.unsaved)return;
    var sn=await latestSnap();
    if(!sn||sn.ts<s.ts){await markSession(false);return;}
    if(window.confirm('Foi encontrado um trabalho não salvo ("'+sn.name+'", '+new Date(sn.ts).toLocaleString()+'). Recuperar?'))await restoreSnap(sn.id,sn.name);
    else await markSession(false);
  }catch(e){}
}
function boot(){
  if(boot.done)return;boot.done=true;
  metaGet('prefs').then(function(p){if(p)Object.assign(st.prefs,p);}).catch(function(){}).then(function(){startAutosave();return checkRecovery();});
  setDirty(false);
}

/* ---------- SVG: exportação ---------- */
var ACI={1:'#ff0000',2:'#ffff00',3:'#00ff00',4:'#00ffff',5:'#0000ff',6:'#ff00ff',7:'#000000',8:'#808080',9:'#c0c0c0'};
function css(c){
  if(c==null)return '#000000';if(typeof c==='number')return ACI[c]||'#000000';
  c=String(c).trim();if(/^[0-9a-f]{6}$/i.test(c))c='#'+c;
  return /^(#fff|#ffffff|white)$/i.test(c)?'#000000':c;
}
function dash(lt,k){
  lt=String(lt||'').toLowerCase();var p=null;
  if(/dashdot|phantom|divide/.test(lt))p=[10,3,2,3];else if(/center/.test(lt))p=[16,4,4,4];
  else if(/dot|point/.test(lt))p=[1.5,3];else if(/dash|hidden/.test(lt))p=[8,4];
  return p?p.map(function(v){return f(v/k);}).join(' '):null;
}
function sym(s){return String(s==null?'':s).replace(/%%[cC]/g,'\u00D8').replace(/%%[dD]/g,'\u00B0').replace(/%%[pP]/g,'\u00B1');}
function segD(p,q,b){
  if(!b)return 'L'+f(q.x)+' '+f(q.y);
  var d=Math.hypot(q.x-p.x,q.y-p.y),r=d*(1+b*b)/(4*Math.abs(b));
  return 'A'+f(r)+' '+f(r)+' 0 '+(Math.abs(b)>1?1:0)+' '+(b>0?1:0)+' '+f(q.x)+' '+f(q.y);
}
function plineD(P,closed){
  var n=P.length,d='M'+f(P[0].x)+' '+f(P[0].y),i;
  for(i=0;i<n-1;i++)d+=segD(P[i],P[i+1],P[i].bulge);
  if(closed&&n>2)d+=segD(P[n-1],P[0],P[n-1].bulge)+'Z';
  return d;
}
function catmull(P,closed){
  var n=P.length,out=[],i,t,N=8;if(n<3)return P.slice();
  for(i=0;i<(closed?n:n-1);i++){
    var p0=P[closed?(i-1+n)%n:Math.max(i-1,0)],p1=P[i],p2=P[(i+1)%n],p3=P[closed?(i+2)%n:Math.min(i+2,n-1)];
    for(t=0;t<N;t++){var s=t/N,s2=s*s,s3=s2*s;
      out.push({x:.5*(2*p1.x+(-p0.x+p2.x)*s+(2*p0.x-5*p1.x+4*p2.x-p3.x)*s2+(-p0.x+3*p1.x-3*p2.x+p3.x)*s3),
                y:.5*(2*p1.y+(-p0.y+p2.y)*s+(2*p0.y-5*p1.y+4*p2.y-p3.y)*s2+(-p0.y+3*p1.y-3*p2.y+p3.y)*s3)});}
  }
  if(!closed)out.push(P[n-1]);return out;
}
function mtLines(s){
  return String(s==null?'':s).replace(/\\P/gi,'\n').replace(/\\[A-Za-z][^;\\]*;/g,'').replace(/\\~/g,' ').replace(/[{}]/g,'').replace(/\\\\/g,'\\').split('\n');
}
/* Renderizadores embutidos: coordenadas do MUNDO (Y para cima); o <g scale(1 -1)> raiz faz a inversão.
   Texto usa transform "translate(x y) rotate(r) scale(1 -1)" para voltar a ficar em pé. */
var R={
  line:function(e){return '<path d="M'+f(e.p1.x)+' '+f(e.p1.y)+'L'+f(e.p2.x)+' '+f(e.p2.y)+'"/>';},
  pline:function(e){return e.pts&&e.pts.length>1?'<path d="'+plineD(e.pts,e.closed)+'"/>':'';},
  circle:function(e){return '<circle cx="'+f(e.c.x)+'" cy="'+f(e.c.y)+'" r="'+f(e.r)+'"/>';},
  arc:function(e){
    var sw=(((e.a2-e.a1)%360)+360)%360;if(sw<1e-9||sw>=359.999)return R.circle(e);
    var a=e.a1*D2R,b=(e.a1+sw)*D2R;
    return '<path d="M'+f(e.c.x+e.r*Math.cos(a))+' '+f(e.c.y+e.r*Math.sin(a))+'A'+f(e.r)+' '+f(e.r)+' 0 '+(sw>180?1:0)+' 1 '+f(e.c.x+e.r*Math.cos(b))+' '+f(e.c.y+e.r*Math.sin(b))+'"/>';
  },
  ellipse:function(e){
    var c=e.c,mj=e.major||{x:1,y:0},a=Math.hypot(mj.x,mj.y),b=a*(+e.ratio||1),rot=Math.atan2(mj.y,mj.x),
        a1=+e.a1||0,a2=e.a2==null?360:+e.a2,sw=(((a2-a1)%360)+360)%360;
    if(sw<1e-6||Math.abs(a2-a1)>=359.999)
      return '<ellipse cx="'+f(c.x)+'" cy="'+f(c.y)+'" rx="'+f(a)+'" ry="'+f(b)+'" transform="rotate('+f(rot/D2R)+' '+f(c.x)+' '+f(c.y)+')"/>';
    var P=[],n=Math.max(8,Math.ceil(sw/5)),k,t,x,y;
    for(k=0;k<=n;k++){t=(a1+sw*k/n)*D2R;x=a*Math.cos(t);y=b*Math.sin(t);
      P.push({x:c.x+x*Math.cos(rot)-y*Math.sin(rot),y:c.y+x*Math.sin(rot)+y*Math.cos(rot)});}
    return '<path d="'+plineD(P,false)+'"/>';
  },
  point:function(e,ctx){return '<circle cx="'+f(e.p.x)+'" cy="'+f(e.p.y)+'" r="'+f(2/ctx.k)+'" fill="currentColor" stroke="none"/>';},
  spline:function(e){
    var P=e.fit||[];if(P.length<2)return '';
    return '<path d="'+plineD(catmull(P,e.closed),!!e.closed&&P.length>2)+'"/>';
  },
  text:function(e){
    var h=+e.h||1,j=String(e.just||'').toLowerCase(),a=/cent|mid|^c/.test(j)?'middle':/right|^r/.test(j)?'end':'start';
    return '<text transform="translate('+f(e.p.x)+' '+f(e.p.y)+') rotate('+f(+e.rot||0)+') scale(1 -1)" font-size="'+f(h)+'" font-family="'+FONT+'" text-anchor="'+a+'" fill="currentColor" stroke="none">'+esc(sym(e.str))+'</text>';
  },
  mtext:function(e){
    var h=+e.h||1,L=mtLines(e.str);
    return '<text transform="translate('+f(e.p.x)+' '+f(e.p.y)+') rotate('+f(+e.rot||0)+') scale(1 -1)" font-size="'+f(h)+'" font-family="'+FONT+'" fill="currentColor" stroke="none">'+
      L.map(function(s,i){return '<tspan x="0" y="'+f(h*(0.85+1.4*i))+'">'+esc(sym(s))+'</tspan>';}).join('')+'</text>';
  },
  hatch:function(e){
    var d='';(e.loops||[]).forEach(function(l){var P=Array.isArray(l)?l:(l&&(l.pts||l.points))||[];if(P.length>1)d+=plineD(P,true);});
    if(!d)return '';
    var op=1-(+e.transp||0)/100;
    return '<path d="'+d+'" fill="currentColor" fill-opacity="'+f(e.solid?op:op*0.2)+'" fill-rule="evenodd" stroke="none"/>';
  },
  insert:function(e,ctx){
    var b=ctx.doc.blocks&&ctx.doc.blocks[e.block];if(!b||ctx.depth>8)return '';
    var inh=sty(e,ctx,null),c2=Object.assign({},ctx,{depth:ctx.depth+1}),bs=b.base||{x:0,y:0},sx=e.sx==null?1:e.sx,sy=e.sy==null?sx:e.sy;
    var inner=(b.ents||[]).map(function(x){return entSVG(x,c2,inh);}).join('');
    return inner?'<g transform="translate('+f(e.p.x)+' '+f(e.p.y)+') rotate('+f(+e.rot||0)+') scale('+f(sx)+' '+f(sy)+') translate('+f(-bs.x)+' '+f(-bs.y)+')">'+inner+'</g>':'';
  }
};
function sty(e,ctx,inh){
  var L=ctx.L[e.layer]||{},col=e.color!=null?e.color:L.color,lw=e.lw!=null?e.lw:L.lw,lt=e.ltype!=null?e.ltype:L.ltype;
  if(inh&&e.layer==='0'){if(e.color==null)col=inh.col;if(e.lw==null)lw=inh.lw;if(e.ltype==null)lt=inh.lt;}
  return {col:col,lw:lw,lt:lt};
}
function entSVG(e,ctx,inh){
  var body='',def=CAD.types&&CAD.types.get&&CAD.types.get(e.type);
  try{if(R[e.type])body=R[e.type](e,ctx);else if(def&&def.toSVG)body=def.toSVG(e,ctx)||'';}catch(err){ctx.cnt.err++;body='';}
  if(!body){ctx.cnt.skip++;return '';}
  var s=sty(e,ctx,inh),sw=(+s.lw>0?+s.lw*3.7795:0.945)/ctx.k,c=esc(css(s.col)),da=dash(s.lt,ctx.k);
  return '<g data-id="'+esc(e.id)+'" stroke="'+c+'" color="'+c+'" stroke-width="'+(+sw.toFixed(6))+'"'+(da?' stroke-dasharray="'+da+'"':'')+'>'+body+'</g>';
}
function keyPts(e){
  var P=[],c,r;
  switch(e.type){
    case 'line':P=[e.p1,e.p2];break;
    case 'pline':P=e.pts||[];break;
    case 'circle':case 'arc':c=e.c;r=e.r;P=[{x:c.x-r,y:c.y-r},{x:c.x+r,y:c.y+r}];break;
    case 'ellipse':c=e.c;r=Math.hypot((e.major||{x:1,y:0}).x,(e.major||{x:1,y:0}).y);P=[{x:c.x-r,y:c.y-r},{x:c.x+r,y:c.y+r}];break;
    case 'spline':P=e.fit||[];break;
    case 'hatch':(e.loops||[]).forEach(function(l){P=P.concat(Array.isArray(l)?l:(l&&(l.pts||l.points))||[]);});break;
    case 'text':case 'mtext':P=[e.p,{x:e.p.x+String(e.str||'').length*0.6*(+e.h||1),y:e.p.y+(+e.h||1)}];break;
    default:if(e.p)P=[e.p];
  }
  return P;
}
function bounds(ents){
  var b={x1:Infinity,y1:Infinity,x2:-Infinity,y2:-Infinity};
  function add(x,y){if(isFinite(x)&&isFinite(y)){if(x<b.x1)b.x1=x;if(x>b.x2)b.x2=x;if(y<b.y1)b.y1=y;if(y>b.y2)b.y2=y;}}
  ents.forEach(function(e){
    var bb=null;try{bb=CAD.bboxOf&&CAD.bboxOf(e);}catch(_){}
    if(bb&&isFinite(bb.x1+bb.y1+bb.x2+bb.y2)){add(bb.x1,bb.y1);add(bb.x2,bb.y2);}
    else keyPts(e).forEach(function(p){if(p)add(p.x,p.y);});
  });
  return b;
}
function exportSVG(doc,o){
  o=o||{};
  var L={};doc.layers.forEach(function(l){L[l.name]=l;});
  function vis(l){return !l||(l.on!==false&&!l.frozen);}
  var ents=doc.entities.filter(function(e){return (e.space||'model')==='model'&&vis(L[e.layer])&&(!o.only||o.only[e.id]);});
  var b=bounds(ents);if(!isFinite(b.x1))b={x1:0,y1:0,x2:100,y2:100};
  var w=Math.max(b.x2-b.x1,1e-6),h=Math.max(b.y2-b.y1,1e-6),m=Math.max(w,h)*0.02,
      vx=b.x1-m,vy=-(b.y2+m),vw=w+2*m,vh=h+2*m,k=1000/Math.max(vw,vh);
  var ctx={doc:doc,L:L,k:k,depth:0,cnt:{skip:0,err:0}};
  var out=['<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="'+INK+'" width="'+f(vw*k)+'" height="'+f(vh*k)+'" viewBox="'+[vx,vy,vw,vh].map(f).join(' ')+'" data-cad2d="1" data-units="'+esc(doc.units||'m')+'">',
    '<title>'+esc(o.title||'CAD 2D')+'</title>'];
  if(o.bg!==false)out.push('<rect x="'+f(vx)+'" y="'+f(vy)+'" width="'+f(vw)+'" height="'+f(vh)+'" fill="#ffffff"/>');
  out.push('<g transform="scale(1 -1)" fill="none" stroke-linecap="round" stroke-linejoin="round">');
  doc.layers.forEach(function(l){
    if(!vis(l))return;
    var it=ents.filter(function(e){return e.layer===l.name;}).map(function(e){return entSVG(e,ctx);}).join('');
    if(it)out.push('<g inkscape:groupmode="layer" inkscape:label="'+esc(l.name)+'" data-layer="'+esc(l.name)+'">'+it+'</g>');
  });
  out.push('</g>','</svg>');
  exportSVG.last={skipped:ctx.cnt.skip,errors:ctx.cnt.err};
  return out.join('\n');
}

/* ---------- SVG: importação ---------- */
var NAMED={black:'#000000',white:'#ffffff',red:'#ff0000',green:'#008000',lime:'#00ff00',blue:'#0000ff',yellow:'#ffff00',cyan:'#00ffff',aqua:'#00ffff',magenta:'#ff00ff',fuchsia:'#ff00ff',gray:'#808080',grey:'#808080',orange:'#ffa500',purple:'#800080',brown:'#a52a2a',silver:'#c0c0c0',navy:'#000080',maroon:'#800000',olive:'#808000',teal:'#008080'};
function hex(c,cur){
  if(!c)return null;c=String(c).trim().toLowerCase();
  if(c==='none'||c==='transparent')return null;
  if(c==='currentcolor')return cur&&cur.toLowerCase()!=='currentcolor'?hex(cur,null):null;
  if(NAMED[c])return NAMED[c];
  var m=/^#([0-9a-f]{3})$/.exec(c);if(m)return '#'+m[1].split('').map(function(x){return x+x;}).join('');
  if(/^#[0-9a-f]{6}$/.test(c))return c;
  m=/^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c);
  return m?'#'+[m[1],m[2],m[3]].map(function(v){return ('0'+Math.min(255,+v).toString(16)).slice(-2);}).join(''):null;
}
var ID={a:1,b:0,c:0,d:1,e:0,f:0};
function mul(A,B){return {a:A.a*B.a+A.c*B.b,b:A.b*B.a+A.d*B.b,c:A.a*B.c+A.c*B.d,d:A.b*B.c+A.d*B.d,e:A.a*B.e+A.c*B.f+A.e,f:A.b*B.e+A.d*B.f+A.f};}
function ap(M,x,y){return {x:M.a*x+M.c*y+M.e,y:M.b*x+M.d*y+M.f,z:0};}
function similar(M){
  var s1=Math.hypot(M.a,M.b),s2=Math.hypot(M.c,M.d);
  return (s1>0&&Math.abs(s1-s2)<1e-6*s1&&Math.abs(M.a*M.c+M.b*M.d)<1e-6*s1*s2)?s1:0;
}
function parseT(s){
  var M=ID,re=/(\w+)\s*\(([^)]*)\)/g,m;
  while((m=re.exec(s||''))){
    var n=m[2].trim().split(/[\s,]+/).map(Number),T=null,r;
    switch(m[1]){
      case 'matrix':if(n.length>=6)T={a:n[0],b:n[1],c:n[2],d:n[3],e:n[4],f:n[5]};break;
      case 'translate':T={a:1,b:0,c:0,d:1,e:n[0]||0,f:n[1]||0};break;
      case 'scale':T={a:n[0],b:0,c:0,d:n.length>1?n[1]:n[0],e:0,f:0};break;
      case 'rotate':r=(n[0]||0)*D2R;T={a:Math.cos(r),b:Math.sin(r),c:-Math.sin(r),d:Math.cos(r),e:0,f:0};
        if(n.length>=3)T=mul(mul({a:1,b:0,c:0,d:1,e:n[1],f:n[2]},T),{a:1,b:0,c:0,d:1,e:-n[1],f:-n[2]});break;
      case 'skewX':T={a:1,b:0,c:Math.tan((n[0]||0)*D2R),d:1,e:0,f:0};break;
      case 'skewY':T={a:1,b:Math.tan((n[0]||0)*D2R),c:0,d:1,e:0,f:0};break;
    }
    if(T)M=mul(M,T);
  }
  return M;
}
function arcPts(x1,y1,rx,ry,phi,fa,fs,x2,y2){
  if(!rx||!ry||(x1===x2&&y1===y2))return [[x2,y2]];
  rx=Math.abs(rx);ry=Math.abs(ry);
  var p=phi*D2R,c=Math.cos(p),s=Math.sin(p),dx=(x1-x2)/2,dy=(y1-y2)/2,xp=c*dx+s*dy,yp=-s*dx+c*dy,
      l=xp*xp/(rx*rx)+yp*yp/(ry*ry);
  if(l>1){var q=Math.sqrt(l);rx*=q;ry*=q;}
  var nu=rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp,de=rx*rx*yp*yp+ry*ry*xp*xp,co=Math.sqrt(Math.max(0,nu/de))*(fa===fs?-1:1),
      cxp=co*rx*yp/ry,cyp=-co*ry*xp/rx,cx=c*cxp-s*cyp+(x1+x2)/2,cy=s*cxp+c*cyp+(y1+y2)/2;
  function ang(ux,uy,vx,vy){return Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);}
  var t1=ang(1,0,(xp-cxp)/rx,(yp-cyp)/ry),dt=ang((xp-cxp)/rx,(yp-cyp)/ry,(-xp-cxp)/rx,(-yp-cyp)/ry);
  if(!fs&&dt>0)dt-=2*Math.PI;else if(fs&&dt<0)dt+=2*Math.PI;
  var n=Math.max(4,Math.ceil(Math.abs(dt)/(10*D2R))),out=[],k,a;
  for(k=1;k<=n;k++){a=t1+dt*k/n;out.push([c*rx*Math.cos(a)-s*ry*Math.sin(a)+cx,s*rx*Math.cos(a)+c*ry*Math.sin(a)+cy]);}
  out[n-1]=[x2,y2];return out;
}
function parsePath(d){
  var tok=String(d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)||[],
      i=0,cmd='',x=0,y=0,sx=0,sy=0,subs=[],cur=null,lc='',lcx=0,lcy=0;
  function num(){return parseFloat(tok[i++]);}
  function ensure(){if(!cur){cur={pts:[[x,y]],closed:false};subs.push(cur);}}
  function cub(x1,y1,x2,y2,x3,y3){for(var k=1;k<=16;k++){var t=k/16,u=1-t;
    cur.pts.push([u*u*u*x+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x3,u*u*u*y+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3]);}}
  function quad(x1,y1,x2,y2){for(var k=1;k<=16;k++){var t=k/16,u=1-t;
    cur.pts.push([u*u*x+2*u*t*x1+t*t*x2,u*u*y+2*u*t*y1+t*t*y2]);}}
  while(i<tok.length){
    if(/^[a-zA-Z]$/.test(tok[i]))cmd=tok[i++];else if(!cmd)break;
    var rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase(),a,b,c2,d2,e2,g,nx,ny;
    if(C==='Z'){if(cur){cur.closed=true;}x=sx;y=sy;cur=null;lc='';continue;}
    if(C==='M'){nx=num();ny=num();if(rel){nx+=x;ny+=y;}x=sx=nx;y=sy=ny;cur={pts:[[x,y]],closed:false};subs.push(cur);cmd=rel?'l':'L';lc='';continue;}
    ensure();
    switch(C){
      case 'L':nx=num();ny=num();if(rel){nx+=x;ny+=y;}cur.pts.push([nx,ny]);x=nx;y=ny;lc='';break;
      case 'H':nx=num();if(rel)nx+=x;cur.pts.push([nx,y]);x=nx;lc='';break;
      case 'V':ny=num();if(rel)ny+=y;cur.pts.push([x,ny]);y=ny;lc='';break;
      case 'C':a=num();b=num();c2=num();d2=num();nx=num();ny=num();
        if(rel){a+=x;b+=y;c2+=x;d2+=y;nx+=x;ny+=y;}cub(a,b,c2,d2,nx,ny);lcx=c2;lcy=d2;x=nx;y=ny;lc='C';break;
      case 'S':c2=num();d2=num();nx=num();ny=num();if(rel){c2+=x;d2+=y;nx+=x;ny+=y;}
        a=lc==='C'?2*x-lcx:x;b=lc==='C'?2*y-lcy:y;cub(a,b,c2,d2,nx,ny);lcx=c2;lcy=d2;x=nx;y=ny;lc='C';break;
      case 'Q':a=num();b=num();nx=num();ny=num();if(rel){a+=x;b+=y;nx+=x;ny+=y;}
        quad(a,b,nx,ny);lcx=a;lcy=b;x=nx;y=ny;lc='Q';break;
      case 'T':nx=num();ny=num();if(rel){nx+=x;ny+=y;}
        a=lc==='Q'?2*x-lcx:x;b=lc==='Q'?2*y-lcy:y;quad(a,b,nx,ny);lcx=a;lcy=b;x=nx;y=ny;lc='Q';break;
      case 'A':a=num();b=num();c2=num();d2=num();e2=num();nx=num();ny=num();if(rel){nx+=x;ny+=y;}
        g=arcPts(x,y,a,b,c2,d2,e2,nx,ny);g.forEach(function(q){cur.pts.push(q);});x=nx;y=ny;lc='';break;
      default:i=tok.length;
    }
  }
  return subs;
}
var SKIP={defs:1,clippath:1,mask:1,symbol:1,metadata:1,title:1,desc:1,style:1,marker:1,pattern:1,lineargradient:1,radialgradient:1,filter:1,script:1,image:1,use:1,foreignobject:1};
var STY=['stroke','fill','font-size','text-anchor','color','display','visibility'];
function getStyle(el,par){
  var o=Object.assign({},par);
  STY.forEach(function(k){var v=el.getAttribute(k);if(v!=null&&v!=='')o[k]=v.trim();});
  var s=el.getAttribute('style');
  if(s)s.split(';').forEach(function(p){var i=p.indexOf(':');if(i>0){var k=p.slice(0,i).trim().toLowerCase();if(STY.indexOf(k)>=0)o[k]=p.slice(i+1).trim();}});
  return o;
}
function layerName(n){return String(n||'').replace(/[<>\/\\":;?*|=`]/g,'_').trim().slice(0,255);}
function svgImport(text,doc,o){
  o=o||{};
  var s=o.scale>0?o.scale:1,xml=new DOMParser().parseFromString(String(text),'image/svg+xml');
  if(xml.getElementsByTagName('parsererror').length||!xml.documentElement||xml.documentElement.localName!=='svg')throw new Error('SVG inválido.');
  var res={ents:[],layers:[],skipped:0},lcol={},used={};
  (doc.layers||[]).forEach(function(l){lcol[l.name]=typeof l.color==='string'?l.color.toLowerCase():null;});
  function ellPts(cx,cy,rx,ry){var P=[],k;for(k=0;k<64;k++)P.push([cx+rx*Math.cos(k*Math.PI/32),cy+ry*Math.sin(k*Math.PI/32)]);return P;}
  function shape(el,tag,M,stl,ln){
    var col=hex(stl.stroke,stl.color)||hex(stl.fill,stl.color),E=[];
    if(col&&col===(lcol[ln]||'#000000'))col=null;
    function g(a){return parseFloat(el.getAttribute(a))||0;}
    function poly(P,closed){
      var pts=P.map(function(q){return ap(M,q[0],q[1]);});
      if(closed&&pts.length>2&&Math.hypot(pts[0].x-pts[pts.length-1].x,pts[0].y-pts[pts.length-1].y)<1e-9)pts.pop();
      if(pts.length===2&&!closed)E.push({type:'line',p1:pts[0],p2:pts[1]});
      else if(pts.length>=2)E.push({type:'pline',pts:pts.map(function(p){return {x:p.x,y:p.y,z:0,bulge:0};}),closed:!!closed&&pts.length>2});
    }
    var sm=similar(M);
    switch(tag){
      case 'line':poly([[g('x1'),g('y1')],[g('x2'),g('y2')]],false);break;
      case 'polyline':case 'polygon':
        var nn=(el.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number),P=[],k;
        for(k=0;k+1<nn.length;k+=2)P.push([nn[k],nn[k+1]]);poly(P,tag==='polygon');break;
      case 'rect':var x=g('x'),y=g('y'),w=g('width'),h=g('height');if(w>0&&h>0)poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true);break;
      case 'circle':
        if(sm)E.push({type:'circle',c:ap(M,g('cx'),g('cy')),r:g('r')*sm});else poly(ellPts(g('cx'),g('cy'),g('r'),g('r')),true);break;
      case 'ellipse':
        if(sm&&g('rx')===g('ry'))E.push({type:'circle',c:ap(M,g('cx'),g('cy')),r:g('rx')*sm});else poly(ellPts(g('cx'),g('cy'),g('rx'),g('ry')),true);break;
      case 'path':parsePath(el.getAttribute('d')).forEach(function(sp){poly(sp.pts,sp.closed);});break;
      case 'text':
        var str=(el.textContent||'').replace(/\s+/g,' ').trim();if(!str)break;
        var fs=parseFloat(stl['font-size'])||12,sc=Math.sqrt(Math.abs(M.a*M.d-M.b*M.c)),an=stl['text-anchor'];
        E.push({type:'text',p:ap(M,g('x'),g('y')),h:fs*sc,str:str,rot:Math.atan2(M.b,M.a)/D2R,style:'Standard',just:an==='middle'?'center':an==='end'?'right':'left'});break;
      default:res.skipped++;
    }
    E.forEach(function(e){e.layer=ln;e.color=col;e.lw=null;e.ltype=null;e.space='model';res.ents.push(e);used[ln]=1;});
  }
  function walk(node,M,par,layer,top){
    for(var el=node.firstElementChild;el;el=el.nextElementSibling){
      var tag=el.localName.toLowerCase();
      if(SKIP[tag]){if(tag==='image'||tag==='use')res.skipped++;continue;}
      var stl=getStyle(el,par);if(stl.display==='none'||stl.visibility==='hidden')continue;
      var tr=el.getAttribute('transform'),M2=tr?mul(M,parseT(tr)):M;
      if(tag==='g'||tag==='a'||tag==='svg'){
        var nm=el.getAttribute('data-layer');
        if(!nm&&el.getAttributeNS(INK,'groupmode')==='layer')nm=el.getAttributeNS(INK,'label');
        if(!nm&&top&&el.getAttribute('id'))nm=el.getAttribute('id');
        walk(el,M2,stl,nm?layerName(nm)||layer:layer,false);
      }else shape(el,tag,M2,stl,layer);
    }
  }
  walk(xml.documentElement,{a:s,b:0,c:0,d:-s,e:0,f:0},getStyle(xml.documentElement,{}),layerName(o.layer||'SVG')||'SVG',true);
  Object.keys(used).forEach(function(n){if(!(n in lcol))res.layers.push(blankLayer(n));});
  return res;
}
function applySvg(res){
  CAD.history.begin('SVGIMPORT');
  try{
    if(res.layers.length)CAD.history.run({name:'SVGIMPORT layers',
      do:function(){res.layers.forEach(function(l){if(!CAD.doc.layers.some(function(x){return x.name===l.name;}))CAD.doc.layers.push(l);});},
      undo:function(){res.layers.forEach(function(l){var i=CAD.doc.layers.indexOf(l);if(i>=0)CAD.doc.layers.splice(i,1);});}});
    if(res.ents.length)CAD.ents.add(res.ents);
  }finally{CAD.history.end();}
}
function svgToDoc(text){
  var d=normalize({}),r=svgImport(text,d);
  r.layers.forEach(function(l){d.layers.push(l);});d.entities=r.ents;return normalize(d);
}

/* ---------- comandos ---------- */
function reg(name,alias,fn){CAD.cmd.register({name:name,alias:alias,raw:true,run:guard(fn)});}
reg('NEW',['QNEW','NOVO'],async function(){await confirmDiscard();doNew();say('Novo desenho.');});
reg('OPEN',['ABRIR'],doOpen);
reg('SAVE',['QSAVE','SALVAR'],function(){return doSave(false);});
reg('SAVEAS',['SALVARCOMO'],function(){return doSave(true);});
reg('EXPORT',['EXPORTAR'],doExport);
reg('SVGEXPORT',[],async function(){
  var only=null;
  if(CAD.sel&&CAD.sel.size&&CAD.sel.size()>0){
    var k=await CAD.input.keyword('Exportar',['Tudo','Seleção'],'Tudo');
    if(/^sel/i.test(String((k&&k.keyword)||k))){only={};CAD.sel.ids().forEach(function(id){only[id]=1;});}
  }
  var svg=exportSVG(CAD.doc,{only:only,title:st.name}),r=await saveBlob(new Blob([svg],{type:'image/svg+xml'}),safeFile(st.name)+'.svg','svg','SVG',null);
  say('SVG exportado: '+r.name+(exportSVG.last.skipped?' ('+exportSVG.last.skipped+' entidade(s) sem representação SVG)':''));
});
reg('SVGIMPORT',[],async function(){
  var r=await pickOpen([accept('svg','SVG')],'.svg,image/svg+xml'),text=await r.file.text();
  var sc=await CAD.input.number('Escala (unidades do desenho por unidade SVG)',{def:1,min:1e-9});
  var res=svgImport(text,CAD.doc,{scale:sc>0?sc:1});applySvg(res);zoomAll();
  say('SVG importado: '+res.ents.length+' entidade(s), '+res.layers.length+' layer(s) nova(s)'+(res.skipped?', '+res.skipped+' elemento(s) ignorado(s)':'')+'.');
});
reg('RECOVER',['RECUPERAR'],async function(){
  var sn=await latestSnap();if(!sn)throw new Error('Nenhum autosave/backup disponível.');
  await restoreSnap(sn.id,sn.name);
});
reg('BACKUP',[],async function(){
  if(await autosaveNow('manual'))say('Backup criado ('+new Date().toLocaleString()+').');else throw new Error('Não foi possível gravar o backup (IndexedDB/espaço).');
});
reg('AUTOSAVE',[],async function(){
  var v=await CAD.input.number('Intervalo do autosave em segundos (0 = desligar)',{def:st.prefs.every,min:0});
  if(v==null)return;
  st.prefs.auto=v>0;if(v>0)st.prefs.every=Math.max(10,v);
  startAutosave();metaPut('prefs',st.prefs).catch(function(){});emit('file:changed');
  say(st.prefs.auto?'Autosave a cada '+st.prefs.every+' s.':'Autosave desligado.');
});
reg('PROJECTS',['PROJETOS'],async function(){
  var L=await projList();if(!L.length){say('Nenhum projeto salvo no navegador.');return;}
  var n=await CAD.input.keyword('Projeto',L.map(function(p){return p.name;}),L[0].name);
  await openLib(String((n&&n.keyword)||n));
});

/* ---------- registro de formatos, UI, atalhos ---------- */
CAD.fileio.register({ext:'cad',label:'Desenho CAD 2D (.cad)',import:parseCad,export:function(doc){return new Blob([serialize(doc)],{type:'application/json'});}});
CAD.fileio.register({ext:'svg',label:'SVG',import:svgToDoc,export:function(doc){return new Blob([exportSVG(doc)],{type:'image/svg+xml'});}});

try{
  CAD.ui.menu.add('Arquivo','Novo','NEW');CAD.ui.menu.add('Arquivo','Abrir...','OPEN');
  CAD.ui.menu.add('Arquivo','Salvar','SAVE');CAD.ui.menu.add('Arquivo','Salvar como...','SAVEAS');
  CAD.ui.menu.add('Arquivo','Exportar...','EXPORT');CAD.ui.menu.add('Arquivo','Exportar SVG','SVGEXPORT');
  CAD.ui.menu.add('Arquivo','Importar SVG','SVGIMPORT');CAD.ui.menu.add('Arquivo','Recuperar autosave','RECOVER');
  CAD.ui.menu.add('Arquivo','Backup agora','BACKUP');
  CAD.ui.toolbar.add('Arquivo',{icone:'\uD83D\uDCC4',rotulo:'Novo',cmd:'NEW'});
  CAD.ui.toolbar.add('Arquivo',{icone:'\uD83D\uDCC2',rotulo:'Abrir',cmd:'OPEN'});
  CAD.ui.toolbar.add('Arquivo',{icone:'\uD83D\uDCBE',rotulo:'Salvar',cmd:'SAVE'});
}catch(_){}

function mountPanel(root){
  var box=document.createElement('div');
  box.style.cssText='font:13px system-ui,"Segoe UI",Arial,sans-serif;color:#111;background:#fff;padding:8px;display:flex;flex-direction:column;gap:8px';
  root.appendChild(box);
  function mk(tag,cssText,txt){var e=document.createElement(tag);if(cssText)e.style.cssText=cssText;if(txt!=null)e.textContent=txt;return e;}
  function btn(txt,fn){var b=mk('button','padding:4px 8px;border:1px solid #bbb;background:#f6f6f6;border-radius:3px;cursor:pointer',txt);b.onclick=act(fn);return b;}
  var status=mk('div','font-weight:600'),row=mk('div','display:flex;flex-wrap:wrap;gap:4px'),cfg=mk('div','display:flex;align-items:center;gap:6px;flex-wrap:wrap'),
      ck=mk('input'),iv=mk('input','width:56px'),lp=mk('div'),ls=mk('div');
  [['Novo','NEW'],['Abrir','OPEN'],['Salvar','SAVE'],['Salvar como','SAVEAS'],['Exportar','EXPORT'],['Importar SVG','SVGIMPORT'],['Backup agora','BACKUP']]
    .forEach(function(x){row.appendChild(btn(x[0],function(){return CAD.cmd.run(x[1]);}));});
  ck.type='checkbox';iv.type='number';iv.min='10';
  cfg.appendChild(ck);cfg.appendChild(mk('span',null,'Autosave a cada'));cfg.appendChild(iv);cfg.appendChild(mk('span',null,'s'));
  [status,row,cfg,mk('b',null,'Projetos no navegador'),lp,mk('b',null,'Versões e backups'),ls].forEach(function(e){box.appendChild(e);});
  ck.onchange=iv.onchange=function(){st.prefs.auto=ck.checked;st.prefs.every=Math.max(10,+iv.value||60);startAutosave();metaPut('prefs',st.prefs).catch(function(){});};
  function item(parent,label,btns){
    var r=mk('div','display:flex;justify-content:space-between;align-items:center;gap:6px;padding:2px 0;border-bottom:1px solid #eee'),g=mk('span','display:flex;gap:4px');
    r.appendChild(mk('span','overflow:hidden;text-overflow:ellipsis;white-space:nowrap',label));
    btns.forEach(function(b){g.appendChild(b);});r.appendChild(g);parent.appendChild(r);
  }
  var KN={auto:'auto',save:'ao salvar',manual:'manual'};
  function refresh(){
    status.textContent=(st.dirty?'\u25CF ':'')+st.name+(st.handle?'':' (sem arquivo vinculado)');
    ck.checked=!!st.prefs.auto;iv.value=st.prefs.every;
    projList().then(function(L){
      lp.textContent='';if(!L.length)lp.appendChild(mk('i','color:#777','Nenhum projeto salvo.'));
      L.forEach(function(p){item(lp,p.name+' \u00B7 '+new Date(p.ts).toLocaleString(),[
        btn('Abrir',function(){return openLib(p.name);}),
        btn('\u2715',function(){if(window.confirm('Remover "'+p.name+'" do navegador?'))return projDel(p.name).then(refresh);})]);});
    }).catch(function(){lp.textContent='IndexedDB indisponível.';});
    snapList().then(function(L){
      ls.textContent='';if(!L.length)ls.appendChild(mk('i','color:#777','Nenhuma versão guardada.'));
      L.slice(0,25).forEach(function(s){item(ls,(KN[s.kind]||s.kind)+' \u00B7 '+s.name+' \u00B7 '+new Date(s.ts).toLocaleTimeString()+' \u00B7 '+kb(s.size),[
        btn('Restaurar',function(){return restoreSnap(s.id,s.name);})]);});
    }).catch(function(){ls.textContent='';});
  }
  CAD.on('file:changed',refresh);refresh();
}
try{CAD.ui.panel.register({id:'arquivos',title:'Arquivos',mount:mountPanel});}catch(_){}

CAD.on('doc:changed',function(){
  if(st.loading)return;
  st.changed=true;
  if(!st.dirty){setDirty(true);markSession(true);}
});
window.addEventListener('keydown',function(e){
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
  var k=String(e.key).toLowerCase(),c=k==='s'?(e.shiftKey?'SAVEAS':'SAVE'):(k==='o'&&!e.shiftKey?'OPEN':null);
  if(!c)return;
  e.preventDefault();
  var p=CAD.cmd.run(c);if(p&&p.catch)p.catch(function(){});
},true);
window.addEventListener('beforeunload',function(e){
  if(st.dirty){autosaveNow('auto');e.preventDefault();e.returnValue='';return '';}
});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')autosaveNow('auto');});
window.addEventListener('pagehide',function(){autosaveNow('auto');});
CAD.on('ready',boot);
if(document.readyState==='complete')setTimeout(boot,300);else window.addEventListener('load',function(){setTimeout(boot,300);});

/* ---------- API pública ---------- */
CAD.files={state:st,serialize:serialize,parse:parseCad,normalize:normalize,load:loadDoc,newDoc:doNew,
  open:doOpen,save:function(){return doSave(false);},saveAs:function(){return doSave(true);},
  autosave:autosaveNow,startAutosave:startAutosave,recover:function(){return latestSnap().then(function(s){return s&&restoreSnap(s.id,s.name);});},
  svg:{export:exportSVG,import:svgImport,apply:applySvg},
  db:{projPut:projPut,projGet:projGet,projDel:projDel,projList:projList,snapPut:snapPut,snapGet:snapGet,snapList:snapList,snapPrune:snapPrune,metaGet:metaGet,metaPut:metaPut}};

/* ---------- testes ---------- */
CAD.tests=CAD.tests||{};
CAD.tests.p11=async function(){
  var ok=0,fail=[];
  function A(c,m){if(c)ok++;else{fail.push(m);console.error('FAIL p11:',m);}}
  function near(a,b){return Math.abs(a-b)<1e-6;}
  var doc=normalize({layers:[{name:'0'},{name:'A',color:'#ff0000'}],entities:[
    {id:1,type:'line',layer:'A',p1:{x:0,y:0,z:0},p2:{x:10,y:5,z:0}},
    {id:1,type:'circle',layer:'B',c:{x:3,y:3,z:0},r:2},
    {type:'arc',layer:'A',c:{x:0,y:0,z:0},r:4,a1:0,a2:90},
    {type:'pline',layer:'A',pts:[{x:0,y:0,z:0,bulge:0},{x:5,y:0,z:0,bulge:0.5},{x:5,y:5,z:0,bulge:0}],closed:true},
    {type:'text',layer:'0',p:{x:1,y:1,z:0},h:0.5,str:'\u00D8 <ok> %%c',rot:30,style:'Standard',just:'left'}]});
  var ids=doc.entities.map(function(e){return e.id;});
  A(doc.entities.length===5,'normalize mantém 5 entidades');
  A(new Set(ids).size===5,'ids duplicados corrigidos');
  A(doc.layers.some(function(l){return l.name==='B';}),'layer ausente criada');
  A(doc.layers[0].name==='0'&&doc.current.layer==='0','layer 0 e current garantidos');
  var d2=parseCad(serialize(doc));
  A(JSON.stringify(d2.entities)===JSON.stringify(doc.entities),'roundtrip .cad preserva entidades');
  A(d2.layers.length===doc.layers.length,'roundtrip .cad preserva layers');
  var thr=false;try{parseCad('{x');}catch(e){thr=true;}A(thr,'JSON inválido lança erro');
  thr=false;try{parseCad('{"format":"OUTRO"}');}catch(e){thr=true;}A(thr,'formato desconhecido lança erro');
  var svg=exportSVG(doc);
  A(/<svg[^>]+viewBox/.test(svg),'SVG tem viewBox');
  A(svg.indexOf('data-layer="A"')>0,'SVG agrupa por layer');
  A(svg.indexOf('&lt;ok&gt;')>0,'SVG escapa texto');
  A(svg.indexOf('\u00D8 &lt;ok&gt; \u00D8')>0,'%%c vira \u00D8');
  A(/A4 4 0 0 1 /.test(svg),'arco 90\u00B0 anti-horário: large=0 sweep=1');
  A(exportSVG(doc,{only:{1:1}}).indexOf('<circle')<0,'exportação só da seleção');
  if(typeof DOMParser!=='undefined'){
    var r=svgImport(svg,normalize({}));
    var ln=r.ents.filter(function(e){return e.type==='line';})[0];
    A(!!ln&&near(ln.p2.x,10)&&near(ln.p2.y,5),'SVG roundtrip: linha volta em Y para cima');
    A(r.ents.some(function(e){return e.type==='circle'&&near(e.r,2)&&near(e.c.y,3);}),'SVG roundtrip: círculo');
    A(r.ents.some(function(e){return e.type==='text'&&near(e.rot,30);}),'SVG roundtrip: rotação do texto');
    var ext='<svg xmlns="http://www.w3.org/2000/svg"><g id="Paredes" transform="translate(10 20)"><rect x="0" y="0" width="30" height="10" stroke="#f00" fill="none"/><path d="M0 0 l10 0 v10 h-10 z" stroke="#00f"/><circle cx="5" cy="5" r="3"/></g></svg>';
    var r2=svgImport(ext,normalize({})),rp=r2.ents.filter(function(e){return e.type==='pline';})[0];
    A(r2.layers.length===1&&r2.layers[0].name==='Paredes','id do grupo vira layer');
    A(r2.ents.length===3,'rect + path + circle = 3 entidades');
    A(!!rp&&near(rp.pts[0].x,10)&&near(rp.pts[0].y,-20)&&rp.closed&&rp.pts.length===4,'transform do grupo e rect fechado');
    A(rp&&rp.color==='#ff0000','cor do traço vira cor da entidade');
    thr=false;try{svgImport('<nao-svg',normalize({}));}catch(e){thr=true;}A(thr,'SVG inválido lança erro');
  }else console.warn('p11: DOMParser ausente; testes de importação SVG ignorados.');
  if(window.indexedDB){
    try{
      await projPut('__t11','x',1);A(await projGet('__t11')==='x','IndexedDB: projPut/projGet');
      await projDel('__t11');A(await projGet('__t11')===undefined,'IndexedDB: projDel');
      await snapPrune('test',0);
      for(var i=0;i<5;i++)await T(['snaps','data'],'readwrite',function(s,d,o){var q=s.add({kind:'test',name:'t',ts:i,size:1});q.onsuccess=function(){d.put({id:q.result,data:'x'});};});
      await snapPrune('test',3);
      A((await snapList()).filter(function(s){return s.kind==='test';}).length===3,'IndexedDB: snapPrune mantém só os 3 mais novos');
      await snapPrune('test',0);
    }catch(e){A(false,'IndexedDB: '+(e&&e.message||e));}
  }else console.warn('p11: IndexedDB ausente; testes de armazenamento ignorados.');
  console.log('p11: '+ok+' ok, '+fail.length+' falha(s)');
  return {ok:ok,fail:fail};
};
})(window.CAD=window.CAD||{});
/* ==== END:11 ==== */
