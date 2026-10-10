/* ==== PART:4 ==== */
(function(CAD){
'use strict';
/* P4: Layers + Properties. Engine (CAD.layers, CAD.props) sem DOM; painéis só chamam o engine.
   Depende só da P1. Transparência de layer: envolve types[*].draw e ajusta ctx.globalAlpha (a P1 faz save/restore por entidade). */
var GEN={layer:1,color:1,lw:1,ltype:1};
var LW=[0,0.05,0.09,0.13,0.15,0.18,0.20,0.25,0.30,0.35,0.40,0.50,0.53,0.60,0.70,0.80,0.90,1.00,1.06,1.20,1.40,1.58,2.00,2.11];
var LT=['continuous','dashed','dotted','center','hidden','dashdot'];
var LTL={continuous:'Contínua',dashed:'Tracejada',dotted:'Pontilhada',center:'Eixo',hidden:'Oculta',dashdot:'Traço-ponto'};
var IDX={1:'#ff0000',2:'#ffff00',3:'#00ff00',4:'#00ffff',5:'#0000ff',6:'#ff00ff',7:'#000000',8:'#808080',9:'#c0c0c0'};
var NAMES={vermelho:'#ff0000',red:'#ff0000',amarelo:'#ffff00',yellow:'#ffff00',verde:'#00ff00',green:'#00ff00',ciano:'#00ffff',cyan:'#00ffff',
  azul:'#0000ff',blue:'#0000ff',magenta:'#ff00ff',branco:'#ffffff',white:'#ffffff',preto:'#000000',black:'#000000',cinza:'#808080',gray:'#808080',laranja:'#ff8000'};
var BAD=/[<>\/\\":;?*|=`]/;
function mk(b,o){for(var k in o)b[k]=o[k];return b;}
function eqv(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function hex6(c){
  c=String(c==null?'':c).trim().toLowerCase();var m=/^#([0-9a-f]{3})$/.exec(c);
  if(m)return '#'+m[1].split('').map(function(x){return x+x;}).join('');
  return /^#[0-9a-f]{6}$/.test(c)?c:null;
}
function parseColor(t){
  t=String(t).trim().toLowerCase();var n=parseInt(t,10);
  if(/^\d+$/.test(t)&&IDX[n])return IDX[n];
  var m=/^(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})$/.exec(t);
  if(m&&+m[1]<256&&+m[2]<256&&+m[3]<256)return '#'+[m[1],m[2],m[3]].map(function(x){return (+x<16?'0':'')+(+x).toString(16);}).join('');
  return hex6(t)||NAMES[t]||null;
}

/* =================== ENGINE: layers =================== */
var Ly=CAD.layers={LW:LW,LT:LT,LTL:LTL,error:''};
function fail(m){Ly.error=m;CAD.cmd.print(m);return null;}
function chg(d){CAD.emit('layers:changed',d||{});}
function entLists(){
  var out=[CAD.doc.entities],b=CAD.doc.blocks||{};
  Object.keys(b).forEach(function(k){if(b[k]&&b[k].ents)out.push(b[k].ents);});return out;
}
function validName(n,except){
  if(!n)return 'Nome de layer vazio.';
  if(BAD.test(n))return 'Nome inválido (não use < > / \\ " : ; ? * | = `).';
  var low=n.toLowerCase(),L=CAD.doc.layers,i;
  for(i=0;i<L.length;i++)if(L[i]!==except&&L[i].name.toLowerCase()===low)return 'Já existe uma layer chamada "'+L[i].name+'".';
  return '';
}
Ly.list=function(){return CAD.doc.layers;};
Ly.get=function(n){var L=CAD.doc.layers;for(var i=0;i<L.length;i++)if(L[i].name===n)return L[i];return null;};
Ly.find=function(n){var low=String(n).toLowerCase(),L=CAD.doc.layers;for(var i=0;i<L.length;i++)if(L[i].name.toLowerCase()===low)return L[i];return null;};
Ly.current=function(){return CAD.doc.current.layer;};
Ly.usage=function(n){var c=0;entLists().forEach(function(l){l.forEach(function(e){if(e.layer===n)c++;});});return c;};
Ly.nextName=function(){var i=1;while(Ly.find('Layer'+i))i++;return 'Layer'+i;};
Ly.add=function(spec){
  spec=spec||{};var name=String(spec.name||Ly.nextName()).trim(),e=validName(name);if(e)return fail(e);
  var col=spec.color?(hex6(spec.color)||parseColor(spec.color)):'#000000';if(!col)return fail('Cor inválida.');
  var L={name:name,color:col,lw:spec.lw!=null?spec.lw:0.25,ltype:spec.ltype||'continuous',on:spec.on!==false,
    frozen:!!spec.frozen,locked:!!spec.locked,transp:spec.transp||0,plot:spec.plot!==false},arr=CAD.doc.layers;
  CAD.history.run({name:'Nova layer',
    do:function(){arr.push(L);chg({name:name,action:'add'});},
    undo:function(){var i=arr.indexOf(L);if(i>=0)arr.splice(i,1);chg({name:name,action:'remove'});}});
  Ly.error='';return L;
};
Ly.set=function(name,patch){
  var L=Ly.get(name);if(!L)return fail('Layer inexistente: '+name);
  var np={},k,v;
  for(k in patch){
    v=patch[k];
    if(k==='color'){v=hex6(v)||parseColor(v);if(!v)return fail('Cor inválida.');}
    else if(k==='lw'){v=Number(v);if(!isFinite(v)||v<0||v>5)return fail('Espessura inválida.');}
    else if(k==='transp'){v=Number(v);if(!isFinite(v))return fail('Transparência inválida.');v=Math.max(0,Math.min(90,Math.round(v)));}
    else if(k==='ltype'){v=String(v||'');if(!v)return fail('Tipo de linha inválido.');}
    else if(k==='on'||k==='frozen'||k==='locked'||k==='plot')v=!!v;
    else continue;
    if(!eqv(L[k],v))np[k]=v;
  }
  if(np.frozen&&name===CAD.doc.current.layer)return fail('Não é possível congelar a layer atual.');
  var keys=Object.keys(np);Ly.error='';if(!keys.length)return L;
  var old={};keys.forEach(function(x){old[x]=L[x];});
  CAD.history.run({name:'Layer '+name,do:function(){mk(L,np);chg({name:name});},undo:function(){mk(L,old);chg({name:name});}});
  return L;
};
Ly.toggle=function(name,key){var L=Ly.get(name);return L?Ly.set(name,(function(o){o[key]=!L[key];return o;})({})):null;};
Ly.rename=function(old,nw){
  nw=String(nw==null?'':nw).trim();var L=Ly.get(old);if(!L)return fail('Layer inexistente: '+old);
  if(old==='0')return fail('A layer 0 não pode ser renomeada.');
  if(nw===old)return L;var e=validName(nw,L);if(e)return fail(e);
  var refs=[];entLists().forEach(function(l){l.forEach(function(x){if(x.layer===old)refs.push(x);});});
  var wasCur=CAD.doc.current.layer===old,cur=CAD.doc.current;
  CAD.history.run({name:'Renomear layer',
    do:function(){L.name=nw;refs.forEach(function(x){x.layer=nw;});if(wasCur)cur.layer=nw;chg({name:nw,action:'rename'});},
    undo:function(){L.name=old;refs.forEach(function(x){x.layer=old;});if(wasCur)cur.layer=old;chg({name:old,action:'rename'});}});
  Ly.error='';return L;
};
Ly.remove=function(name){
  var L=Ly.get(name);if(!L)return fail('Layer inexistente: '+name);
  if(name==='0')return fail('A layer 0 não pode ser excluída.');
  if(name===CAD.doc.current.layer)return fail('Não é possível excluir a layer atual.');
  var n=Ly.usage(name);if(n)return fail('Layer em uso por '+n+' objeto(s); apague-os ou mude de layer antes.');
  var arr=CAD.doc.layers,i=arr.indexOf(L);
  CAD.history.run({name:'Excluir layer',do:function(){var j=arr.indexOf(L);if(j>=0)arr.splice(j,1);chg({name:name,action:'remove'});},
    undo:function(){arr.splice(i,0,L);chg({name:name,action:'add'});}});
  Ly.error='';return true;
};
Ly.setCurrent=function(name){
  var L=Ly.get(name);if(!L)return fail('Layer inexistente: '+name);
  if(L.frozen)return fail('Não é possível tornar atual uma layer congelada.');
  var cur=CAD.doc.current,old=cur.layer;if(old===name)return L;
  CAD.history.run({name:'Layer atual',do:function(){cur.layer=name;chg({name:name,action:'current'});},undo:function(){cur.layer=old;chg({name:old,action:'current'});}});
  if(L.on===false)CAD.cmd.print('Aviso: a layer atual está desligada.');
  Ly.error='';return L;
};
/* padrões para novos objetos (doc.current): null = ByLayer */
Ly.setDefaults=function(p){
  var cur=CAD.doc.current,np={},k,v;
  for(k in p){v=p[k];
    if(k==='color'&&v!==null){v=hex6(v)||parseColor(v);if(!v)return fail('Cor inválida.');}
    else if(k==='lw'&&v!==null){v=Number(v);if(!isFinite(v)||v<0)return fail('Espessura inválida.');}
    else if(k==='ltype'&&v!==null)v=String(v);
    else if(k!=='color'&&k!=='lw'&&k!=='ltype')continue;
    if(!eqv(cur[k],v))np[k]=v;}
  var keys=Object.keys(np);if(!keys.length)return cur;
  var old={};keys.forEach(function(x){old[x]=cur[x]===undefined?null:cur[x];});
  CAD.history.run({name:'Padrões',do:function(){mk(cur,np);chg({action:'defaults'});},undo:function(){mk(cur,old);chg({action:'defaults'});}});
  Ly.error='';return cur;
};
var isoStack=[];
Ly.isolate=function(names){
  names=[].concat(names);var prev={};
  CAD.doc.layers.forEach(function(l){prev[l.name]=l.on!==false;});isoStack.push(prev);
  CAD.history.begin('Isolar layers');
  CAD.doc.layers.slice().forEach(function(l){Ly.set(l.name,{on:names.indexOf(l.name)>=0});});
  CAD.history.end();return true;
};
Ly.unisolate=function(){
  var prev=isoStack.pop();if(!prev){CAD.cmd.print('Nada para restaurar.');return false;}
  CAD.history.begin('Restaurar layers');
  Object.keys(prev).forEach(function(n){if(Ly.get(n))Ly.set(n,{on:prev[n]});});
  CAD.history.end();return true;
};
Ly.setAll=function(key,val){   // ex.: setAll('on',true) | ('frozen',false) | ('locked',false)
  CAD.history.begin('Layers');CAD.doc.layers.slice().forEach(function(l){Ly.set(l.name,(function(o){o[key]=val;return o;})({}));});CAD.history.end();
};
Ly.purge=function(){
  var n=0;CAD.history.begin('Limpar layers');
  CAD.doc.layers.slice().forEach(function(l){if(l.name!=='0'&&l.name!==CAD.doc.current.layer&&!Ly.usage(l.name)&&Ly.remove(l.name))n++;});
  CAD.history.end();return n;
};

/* transparência por layer: envolve draw de todo tipo registrado */
function wrapType(d){
  if(!d||!d.draw||d._p4w===d.draw)return;
  var o=d.draw;
  d.draw=function(ctx,e,v){var l=CAD.layer(e.layer);if(l&&l.transp>0)ctx.globalAlpha=Math.max(0.1,1-l.transp/100);return o.call(d,ctx,e,v);};
  d._p4w=d.draw;
}
function wrapAll(){CAD.types.list().forEach(function(t){wrapType(CAD.types.get(t));});}
wrapAll();CAD.on('types:changed',wrapAll);

/* =================== ENGINE: propriedades =================== */
var Pr=CAD.props={GEN:GEN};
function lwOpts(){return [{value:null,label:'ByLayer'}].concat(LW.map(function(v){return {value:v,label:v.toFixed(2)+' mm'};}));}
function ltOpts(){return [{value:null,label:'ByLayer'}].concat(LT.map(function(v){return {value:v,label:LTL[v]||v};}));}
function layOpts(){return CAD.doc.layers.map(function(l){return {value:l.name,label:l.name};});}
function item(key,label,type,vals,extra){
  var v=vals[0],varies=vals.some(function(x){return !eqv(x,v);});
  return mk({key:key,label:label,type:type,value:varies?undefined:v,varies:varies},extra||{});
}
function nul(x){return x==null?null:x;}
/* collect(ents) -> {n,types:{tipo:qtd},general:[itens],typed:[itens]}. item: {key,label,type,value,varies,readonly,options,general} */
Pr.collect=function(ents){
  var types={},gen=[],typed=[],i;
  ents.forEach(function(e){types[e.type]=(types[e.type]||0)+1;});
  var lc=ents.length?CAD.layer(ents[0].layer).color:'#000000';
  gen.push(item('layer','Layer','select',ents.map(function(e){return e.layer;}),{general:true,options:layOpts()}));
  gen.push(item('color','Cor','color',ents.map(function(e){return nul(e.color);}),{general:true,layerColor:lc}));
  gen.push(item('lw','Espessura','select',ents.map(function(e){return nul(e.lw);}),{general:true,options:lwOpts()}));
  gen.push(item('ltype','Tipo de linha','select',ents.map(function(e){return nul(e.ltype);}),{general:true,options:ltOpts()}));
  var lists=ents.map(function(e){return CAD.types.call(e,'props')||[];});
  if(lists.length)lists[0].forEach(function(p0){
    var all=[p0];
    for(i=1;i<lists.length;i++){
      var q=null;lists[i].forEach(function(x){if(x.key===p0.key)q=x;});
      if(!q||q.type!==p0.type)return;all.push(q);
    }
    typed.push(item(p0.key,p0.label||p0.key,p0.type,all.map(function(q){return q.value;}),
      {readonly:all.some(function(q){return q.readonly&&!q.set;}),options:p0.options,min:p0.min,max:p0.max,group:p0.group}));
  });
  return {n:ents.length,types:types,general:gen,typed:typed};
};
Pr.collectDefaults=function(){
  var c=CAD.doc.current,lc=CAD.layer(c.layer).color;
  return [item('layer','Layer atual','select',[c.layer],{general:true,options:layOpts()}),
    item('color','Cor','color',[nul(c.color)],{general:true,layerColor:lc}),
    item('lw','Espessura','select',[nul(c.lw)],{general:true,options:lwOpts()}),
    item('ltype','Tipo de linha','select',[nul(c.ltype)],{general:true,options:ltOpts()})];
};
Pr.applyDefaults=function(key,val){return key==='layer'?Ly.setCurrent(val):Ly.setDefaults((function(o){o[key]=val;return o;})({}));};
function valuePatch(pr,e,v){
  var o={},k=pr.key;
  if(pr.type==='point'){var old=e[k]||{};o[k]={x:Number(v.x),y:Number(v.y),z:v.z!=null?Number(v.z):(old.z||0)};}
  else if(pr.type==='number'||pr.type==='angle'){o[k]=Number(v);}
  else o[k]=v;
  return o;
}
/* apply(ents,key,value,scope?) -> {changed,skipped}. Um único passo de undo. Pula objetos em layer bloqueada. */
Pr.apply=function(ents,key,value,scope){
  var general=scope?scope==='general':!!GEN[key],changed=0,skipped=0;
  CAD.history.begin('Propriedades');
  ents.forEach(function(e0){
    var e=typeof e0==='object'?e0:CAD.ents.get(e0);if(!e)return;
    if(CAD.layer(e.layer).locked){skipped++;return;}
    var patch=null;
    if(general){
      if(key==='layer'&&!Ly.get(value))return;
      patch={};patch[key]=value;
    }else{
      var list=CAD.types.call(e,'props')||[],pr=null;list.forEach(function(p){if(p.key===key)pr=p;});
      if(!pr||(pr.readonly&&!pr.set))return;
      if((pr.type==='number'||pr.type==='angle')&&!isFinite(Number(value)))return;
      patch=pr.set?pr.set(e,value):valuePatch(pr,e,value);
    }
    if(!patch)return;
    var diff=false;Object.keys(patch).forEach(function(k){if(!eqv(e[k],patch[k]))diff=true;});
    if(!diff)return;
    CAD.ents.update(e.id,patch);changed++;
  });
  CAD.history.end();
  if(skipped)CAD.cmd.print(skipped+' objeto(s) em layer bloqueada não foram alterados.');
  return {changed:changed,skipped:skipped};
};
Pr.match=function(src,dsts){   // copia layer, cor, espessura e tipo de linha
  var s=typeof src==='object'?src:CAD.ents.get(src),n=0;if(!s)return 0;
  CAD.history.begin('Copiar propriedades');
  ['layer','color','lw','ltype'].forEach(function(k){n+=Pr.apply(dsts.map(function(d){return typeof d==='object'?d.id:d;}),k,s[k]===undefined?null:s[k],'general').changed;});
  CAD.history.end();return n;
};

/* =================== comandos =================== */
var NARROW=function(){return typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(max-width:700px)').matches;};
function showSide(id){
  if(typeof document==='undefined')return;
  var b=document.body;
  if(NARROW()){if(b.classList.contains('cad-side-open')&&b.dataset.p4==id){b.classList.remove('cad-side-open');return;}b.classList.add('cad-side-open');}
  b.dataset.p4=id;
  var s=document.getElementById('panel-'+id);if(s){s.classList.remove('closed');if(s.scrollIntoView)s.scrollIntoView({block:'nearest'});}
}
function reg(name,alias,fn,raw){CAD.cmd.register({name:name,alias:alias||[],raw:!!raw,run:fn});}
function splitNames(t){return String(t).split(',').map(function(s){return s.trim();}).filter(Boolean);}
function resolveNames(t){
  var out=[];splitNames(t).forEach(function(n){
    if(n==='*'){CAD.doc.layers.forEach(function(l){out.push(l.name);});return;}
    var L=Ly.find(n);if(L)out.push(L.name);else CAD.cmd.print('Layer não encontrada: '+n);});
  return out;
}
function layersOfIds(ids){var s={};ids.forEach(function(i){var e=CAD.ents.get(i);if(e)s[e.layer]=1;});return Object.keys(s);}

reg('LAYER',['LA'],function(){showSide('layers');},true);
reg('PROPERTIES',['PR','PROPS'],function(){showSide('props');},true);
reg('-LAYER',['-LA'],async function(){
  var KW=['Nova','Atual','Ligar','Desligar','Congelar','Descongelar','Bloquear','Desbloquear','Cor','Tipo','Espessura','Renomear','Excluir','Listar','Sair'];
  for(;;){
    var k=await CAD.input.keyword('Layer',KW,'Sair');if(k==='Sair')break;
    if(k==='Listar'){CAD.doc.layers.forEach(function(l){CAD.cmd.print(l.name+'  '+l.color+'  '+l.lw+'mm  '+l.ltype+(l.on===false?'  [off]':'')+(l.frozen?'  [congelada]':'')+(l.locked?'  [bloqueada]':''));});continue;}
    if(k==='Renomear'){var o=await CAD.input.string('Nome atual'),n=await CAD.input.string('Novo nome');Ly.rename(o,n);continue;}
    var txt=await CAD.input.string(k==='Nova'?'Nome(s) da(s) nova(s) layer(s), separados por vírgula':'Nome(s) da(s) layer(s) (* = todas)');
    var names=k==='Nova'?splitNames(txt):resolveNames(txt),extra;
    if(k==='Cor')extra=await CAD.input.string('Cor (#rrggbb, índice 1-9, r,g,b ou nome)');
    if(k==='Tipo')extra=await CAD.input.string('Tipo de linha ('+LT.join('/')+')');
    if(k==='Espessura')extra=await CAD.input.number('Espessura em mm');
    names.forEach(function(nm){
      if(k==='Nova')Ly.add({name:nm});
      else if(k==='Atual')Ly.setCurrent(nm);
      else if(k==='Ligar')Ly.set(nm,{on:true});
      else if(k==='Desligar')Ly.set(nm,{on:false});
      else if(k==='Congelar')Ly.set(nm,{frozen:true});
      else if(k==='Descongelar')Ly.set(nm,{frozen:false});
      else if(k==='Bloquear')Ly.set(nm,{locked:true});
      else if(k==='Desbloquear')Ly.set(nm,{locked:false});
      else if(k==='Cor')Ly.set(nm,{color:extra});
      else if(k==='Tipo')Ly.set(nm,{ltype:extra});
      else if(k==='Espessura')Ly.set(nm,{lw:extra});
      else if(k==='Excluir')Ly.remove(nm);
    });
  }
});
function selCmd(name,alias,prompt,fn){
  reg(name,alias,async function(){var ids=await CAD.input.select(prompt);fn(layersOfIds(ids),ids);CAD.sel.clear();});
}
selCmd('LAYOFF',[],'Selecione objeto(s) cuja layer será desligada',function(ns){ns.forEach(function(n){Ly.set(n,{on:false});});});
selCmd('LAYFRZ',[],'Selecione objeto(s) cuja layer será congelada',function(ns){ns.forEach(function(n){Ly.set(n,{frozen:true});});});
selCmd('LAYLCK',[],'Selecione objeto(s) cuja layer será bloqueada',function(ns){ns.forEach(function(n){Ly.set(n,{locked:true});});});
selCmd('LAYISO',[],'Selecione objeto(s) cuja layer será isolada',function(ns){if(ns.length)Ly.isolate(ns);});
reg('LAYCUR',[],async function(){var ids=await CAD.input.select('Selecione um objeto para tornar sua layer atual');var ns=layersOfIds(ids);if(ns.length)Ly.setCurrent(ns[0]);CAD.sel.clear();});
reg('LAYUNISO',[],function(){Ly.unisolate();},true);
reg('LAYON',[],function(){Ly.setAll('on',true);},true);
reg('LAYTHW',[],function(){Ly.setAll('frozen',false);},true);
reg('LAYULK',[],function(){Ly.setAll('locked',false);},true);
reg('PURGE',['PU'],function(){CAD.cmd.print(Ly.purge()+' layer(s) sem uso removida(s).');},true);
reg('MATCHPROP',['MA'],async function(){
  var src=(await CAD.input.select('Selecione o objeto de ORIGEM'))[0];if(!src)return;
  CAD.sel.clear();
  var dst=await CAD.input.select('Selecione os objetos de DESTINO (Enter para aplicar)',{noPickfirst:true});
  dst=dst.filter(function(i){return i!==src;});
  CAD.cmd.print(Pr.match(src,dst)+' alteração(ões) aplicada(s).');CAD.sel.clear();
});

/* =================== UI =================== */
var CSS='.p4{font-size:12px}.p4-close{display:none;width:100%;margin-bottom:6px;padding:6px;border:1px solid #c5cad0;border-radius:4px;background:#fff}'+
'.p4-bar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}.p4-bar button,.p4-btn{padding:4px 8px;border:1px solid #b9c0c8;border-radius:4px;background:#fff;cursor:pointer;font-size:12px}'+
'.p4-bar button:hover,.p4-btn:hover{background:#e3edfb}.p4-msg{min-height:16px;margin:2px 0 6px;color:#b3261e}'+
'.p4-row{border:1px solid #d9dcdf;border-radius:5px;background:#fff;margin-bottom:4px}.p4-row.sel{border-color:#1a73e8;box-shadow:0 0 0 1px #1a73e8}'+
'.p4-row.off .p4-name,.p4-row.frz .p4-name{color:#999}.p4-row.cur .p4-name{font-weight:700}'+
'.p4-top{display:flex;align-items:center;gap:2px;padding:3px 4px}.p4-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;padding:2px 3px}'+
'.p4-ic{border:0;background:none;cursor:pointer;font-size:14px;padding:2px 3px;min-width:24px;line-height:1}.p4-ic.act{color:#1a73e8}'+
'.p4-sw{width:26px;height:22px;padding:0;border:1px solid #aaa;border-radius:3px;background:none;cursor:pointer}'+
'.p4-det{padding:4px 8px 6px;border-top:1px dashed #e0e3e6;display:grid;grid-template-columns:78px 1fr;gap:4px 6px;align-items:center}'+
'.p4 input[type=text],.p4 input[type=number],.p4 select,.p4 textarea{width:100%;min-width:0;padding:3px 4px;border:1px solid #c5cad0;border-radius:3px;font:inherit;background:#fff}'+
'.p4 input:disabled{background:#f1f3f4;color:#666}.p4-gh{margin:8px 0 3px;font-weight:700;color:#456;border-bottom:1px solid #dde0e3}'+
'.p4-pr{display:grid;grid-template-columns:42% 1fr;gap:4px 6px;align-items:center;margin-bottom:3px}.p4-pl{color:#555;overflow:hidden;text-overflow:ellipsis}'+
'.p4-xy{display:flex;gap:3px}.p4-col{display:flex;gap:4px;align-items:center}.p4-hd{margin-bottom:6px;color:#456}'+
'@media (max-width:700px){.p4-close{display:block}body.cad-side-open #sidebar{display:block;position:fixed;right:0;top:76px;bottom:112px;width:min(94vw,340px);z-index:60;box-shadow:-4px 0 14px rgba(0,0,0,.25)}}';
function injectCss(){
  if(typeof document==='undefined'||document.getElementById('p4-css'))return;
  var s=document.createElement('style');s.id='p4-css';s.textContent=CSS;document.head.appendChild(s);
}
function h(tag,cls,txt){var x=document.createElement(tag);if(cls)x.className=cls;if(txt!=null)x.textContent=txt;return x;}
function closeBtn(){var b=h('button','p4-close','✕ Fechar painel');b.onclick=function(){document.body.classList.remove('cad-side-open');};return b;}
function fmtNum(v){return v===undefined||v===null||v===''?'':String(Math.round(Number(v)*1e6)/1e6);}
function parseNum(t){var s=String(t).trim().replace(',','.');if(!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s))return null;return parseFloat(s);}

function mountLayers(el){
  injectCss();
  var box=h('div','p4'),bar=h('div','p4-bar'),msg=h('div','p4-msg'),list=h('div','p4-list'),sel=null,open={},renaming=null,t=0;
  box.appendChild(closeBtn());box.appendChild(bar);box.appendChild(msg);box.appendChild(list);el.appendChild(box);
  function say(){msg.textContent=Ly.error||'';}
  [['+ Nova',function(){var L=Ly.add({});if(L){sel=L.name;renaming=L.name;}}],
   ['Excluir',function(){if(sel&&Ly.remove(sel))sel=null;else if(!sel)Ly.error='Selecione uma layer na lista.';}],
   ['Isolar',function(){if(sel)Ly.isolate(sel);else Ly.error='Selecione uma layer na lista.';}],
   ['Restaurar',function(){Ly.unisolate();}],
   ['Limpar',function(){var n=Ly.purge();Ly.error=n+' layer(s) sem uso removida(s).';}]].forEach(function(b){
    var x=h('button',null,b[0]);x.onclick=function(){Ly.error='';b[1]();render();say();};bar.appendChild(x);});
  function cell(parent,label,node){parent.appendChild(h('div',null,label));parent.appendChild(node);}
  function selectOf(opts,cur,fn){
    var s=h('select'),found=false;
    opts.forEach(function(o,i){var op=h('option',null,o.label);op.value=i;if(eqv(o.value,cur)){op.selected=true;found=true;}s.appendChild(op);});
    if(!found){var op2=h('option',null,String(cur));op2.value=-1;op2.selected=true;s.appendChild(op2);}
    s.onchange=function(){if(+s.value>=0)fn(opts[+s.value].value);};return s;
  }
  function rowFor(L){
    var cur=CAD.doc.current.layer===L.name,name=L.name;
    var row=h('div','p4-row'+(cur?' cur':'')+(sel===name?' sel':'')+(L.on===false?' off':'')+(L.frozen?' frz':'')),top=h('div','p4-top');
    function ic(txt,title,act,fn){var b=h('button','p4-ic'+(act?' act':''),txt);b.title=title;b.onclick=function(e){e.stopPropagation();Ly.error='';fn();render();say();};return b;}
    top.appendChild(ic(cur?'●':'○','Tornar atual',cur,function(){Ly.setCurrent(name);}));
    if(renaming===name){
      var inp=h('input');inp.type='text';inp.value=name;inp.className='p4-name';var done=false;
      function commit(ok){if(done)return;done=true;renaming=null;if(ok&&inp.value.trim()!==name){Ly.error='';Ly.rename(name,inp.value);}render();say();}
      inp.onkeydown=function(e){if(e.key==='Enter')commit(true);else if(e.key==='Escape')commit(false);e.stopPropagation();};
      inp.onblur=function(){commit(true);};top.appendChild(inp);setTimeout(function(){inp.focus();inp.select();},0);
    }else{
      var nm=h('span','p4-name',name);nm.title='Clique para selecionar; duplo clique para renomear';
      nm.onclick=function(){sel=name;render();};nm.ondblclick=function(){if(name!=='0'){renaming=name;render();}};top.appendChild(nm);
    }
    top.appendChild(ic(L.on===false?'▫':'👁','Ligar/desligar',false,function(){Ly.toggle(name,'on');}));
    top.appendChild(ic(L.frozen?'❄':'☀','Congelar/descongelar',false,function(){Ly.toggle(name,'frozen');}));
    top.appendChild(ic(L.locked?'🔒':'🔓','Bloquear/desbloquear',false,function(){Ly.toggle(name,'locked');}));
    var sw=h('input','p4-sw');sw.type='color';sw.value=hex6(L.color)||'#000000';sw.title='Cor';
    sw.onchange=function(){Ly.error='';Ly.set(name,{color:sw.value});render();say();};top.appendChild(sw);
    top.appendChild(ic(open[name]?'▾':'▸','Detalhes',false,function(){open[name]=!open[name];}));
    row.appendChild(top);
    if(open[name]){
      var det=h('div','p4-det'),lts=LT.slice();if(lts.indexOf(L.ltype)<0)lts.push(L.ltype);
      cell(det,'Tipo de linha',selectOf(lts.map(function(v){return {value:v,label:LTL[v]||v};}),L.ltype,function(v){Ly.set(name,{ltype:v});render();say();}));
      var lws=LW.slice();if(lws.indexOf(L.lw)<0)lws.push(L.lw);
      cell(det,'Espessura',selectOf(lws.map(function(v){return {value:v,label:Number(v).toFixed(2)+' mm'};}),L.lw,function(v){Ly.set(name,{lw:v});render();say();}));
      var tr=h('input');tr.type='number';tr.min=0;tr.max=90;tr.value=L.transp||0;
      tr.onchange=function(){Ly.error='';Ly.set(name,{transp:tr.value});render();say();};cell(det,'Transp. (%)',tr);
      var pl=h('input');pl.type='checkbox';pl.checked=L.plot!==false;pl.style.width='auto';
      pl.onchange=function(){Ly.set(name,{plot:pl.checked});render();};cell(det,'Imprimir',pl);
      cell(det,'Objetos',h('div',null,String(Ly.usage(name))));
      row.appendChild(det);
    }
    return row;
  }
  function render(){
    list.innerHTML='';
    CAD.doc.layers.slice().sort(function(a,b){if(a.name==='0')return -1;if(b.name==='0')return 1;return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});})
      .forEach(function(L){list.appendChild(rowFor(L));});
  }
  function schedule(){if(t)return;t=setTimeout(function(){t=0;if(document.activeElement&&box.contains(document.activeElement)&&document.activeElement.type==='text')return;render();},0);}
  CAD.on('layers:changed',schedule);CAD.on('doc:changed',schedule);render();
}

/* editor genérico de uma propriedade; commit(valor) aplica */
function editor(it,commit){
  var ph='*Varia*',w,i;
  if(it.readonly){var r=h('div',null,it.varies?ph:(it.type==='point'&&it.value?fmtNum(it.value.x)+', '+fmtNum(it.value.y):fmtNum(it.value)||String(it.value==null?'':it.value)));r.style.color='#444';return r;}
  if(it.type==='select'){
    var s=h('select'),opts=it.options||[],found=false;
    if(it.varies){var o0=h('option',null,ph);o0.value=-1;o0.selected=true;s.appendChild(o0);found=true;}
    opts.forEach(function(o,k){var op=h('option',null,typeof o==='object'?o.label:String(o));op.value=k;if(!it.varies&&eqv(typeof o==='object'?o.value:o,it.value)){op.selected=true;found=true;}s.appendChild(op);});
    if(!found){var o1=h('option',null,String(it.value));o1.value=-1;o1.selected=true;s.appendChild(o1);}
    s.onchange=function(){var k=+s.value;if(k>=0)commit(typeof opts[k]==='object'?opts[k].value:opts[k]);};return s;
  }
  if(it.type==='color'){
    w=h('div','p4-col');var c=h('input');c.type='color';c.className='p4-sw';
    c.value=hex6(it.varies?it.layerColor:(it.value||it.layerColor))||'#000000';c.onchange=function(){commit(c.value);};
    var bl=h('button','p4-btn',it.varies?'*Varia*':(it.value==null?'ByLayer ✓':'ByLayer'));bl.onclick=function(){commit(null);};
    w.appendChild(c);w.appendChild(bl);return w;
  }
  if(it.type==='bool'){var cb=h('input');cb.type='checkbox';cb.style.width='auto';cb.checked=!!it.value;cb.onchange=function(){commit(cb.checked);};return cb;}
  if(it.type==='number'||it.type==='angle'){
    var n=h('input');n.type='text';n.setAttribute('inputmode','decimal');n.value=it.varies?'':fmtNum(it.value);if(it.varies)n.placeholder=ph;
    n.onchange=function(){var v=parseNum(n.value);if(v===null||(it.min!=null&&v<it.min)||(it.max!=null&&v>it.max)){n.value=it.varies?'':fmtNum(it.value);return;}commit(v);};
    n.onkeydown=function(e){e.stopPropagation();if(e.key==='Enter')n.blur();};return n;
  }
  if(it.type==='point'){
    w=h('div','p4-xy');var v0=it.varies||!it.value?{x:'',y:'',z:0}:it.value,xs=[];
    ['x','y'].forEach(function(ax){
      var t=h('input');t.type='text';t.setAttribute('inputmode','decimal');t.value=fmtNum(v0[ax]);t.title=ax.toUpperCase();if(it.varies)t.placeholder=ph;
      t.onkeydown=function(e){e.stopPropagation();if(e.key==='Enter')t.blur();};
      t.onchange=function(){var a=parseNum(xs[0].value),b=parseNum(xs[1].value);if(a===null||b===null){t.value=fmtNum(v0[ax]);return;}commit({x:a,y:b});};
      xs.push(t);w.appendChild(t);});
    return w;
  }
  if(it.type==='text'){var ta=h('textarea');ta.rows=3;ta.value=it.varies?'':String(it.value==null?'':it.value);ta.onkeydown=function(e){e.stopPropagation();};ta.onchange=function(){commit(ta.value);};return ta;}
  var tx=h('input');tx.type='text';tx.value=it.varies?'':String(it.value==null?'':it.value);if(it.varies)tx.placeholder=ph;
  tx.onkeydown=function(e){e.stopPropagation();if(e.key==='Enter')tx.blur();};tx.onchange=function(){commit(tx.value);};return tx;
}

function mountProps(el){
  injectCss();
  var box=h('div','p4'),body=h('div'),filter='',t=0,deferred=false;
  box.appendChild(closeBtn());box.appendChild(body);el.appendChild(box);
  function group(title,items,commitFor){
    if(!items.length)return;body.appendChild(h('div','p4-gh',title));
    items.forEach(function(it){var row=h('div','p4-pr');row.appendChild(h('div','p4-pl',it.label));row.appendChild(editor(it,commitFor(it)));body.appendChild(row);});
  }
  function render(){
    body.innerHTML='';var ents=CAD.sel.ids().map(function(i){return CAD.ents.get(i);}).filter(Boolean);
    if(!ents.length){
      body.appendChild(h('div','p4-hd','Nenhum objeto selecionado. Padrões para novos objetos:'));
      group('Geral',CAD.props.collectDefaults(),function(it){return function(v){CAD.props.applyDefaults(it.key,v);render();};});return;
    }
    var all=CAD.props.collect(ents),tk=Object.keys(all.types);
    if(filter&&!all.types[filter])filter='';
    if(tk.length>1){
      var s=h('select'),o=h('option',null,'Todos ('+ents.length+')');o.value='';s.appendChild(o);
      tk.forEach(function(k){var op=h('option',null,k+' ('+all.types[k]+')');op.value=k;if(k===filter)op.selected=true;s.appendChild(op);});
      s.onchange=function(){filter=s.value;render();};body.appendChild(s);
    }else body.appendChild(h('div','p4-hd',ents.length+' objeto(s): '+tk[0]));
    var sub=filter?ents.filter(function(e){return e.type===filter;}):ents,data=filter?CAD.props.collect(sub):all;
    function commitFor(it){return function(v){var r=CAD.props.apply(sub,it.key,v,it.general?'general':'type');if(!r.changed)render();};}
    group('Geral',data.general,commitFor);group(filter||(tk.length===1?tk[0]:'Comum'),data.typed,commitFor);
  }
  function schedule(){if(t)return;t=setTimeout(function(){t=0;var a=document.activeElement;
    if(a&&box.contains(a)&&(a.tagName==='INPUT'&&a.type==='text'||a.tagName==='TEXTAREA')){deferred=true;return;}render();},0);}
  box.addEventListener('focusout',function(){if(deferred){deferred=false;schedule();}});
  CAD.on('sel:changed',schedule);CAD.on('doc:changed',schedule);CAD.on('layers:changed',schedule);render();
}

CAD.ui.panel.register({id:'layers',title:'Layers',mount:mountLayers});
CAD.ui.panel.register({id:'props',title:'Propriedades',mount:mountProps});
CAD.ui.menu.add('Formatar','Layers…','LAYER');
CAD.ui.menu.add('Formatar','Propriedades…','PROPERTIES');
CAD.ui.menu.add('Formatar','Copiar propriedades','MATCHPROP');
CAD.ui.menu.add('Formatar','-','');
CAD.ui.menu.add('Formatar','Isolar layer do objeto','LAYISO');
CAD.ui.menu.add('Formatar','Restaurar layers','LAYUNISO');
CAD.ui.menu.add('Formatar','Limpar layers sem uso','PURGE');
CAD.ui.toolbar.add('Propriedades',{icone:'☰',rotulo:'Layers (LA)',cmd:'LAYER'});
CAD.ui.toolbar.add('Propriedades',{icone:'⚙',rotulo:'Propriedades (PR)',cmd:'PROPERTIES'});
CAD.ui.toolbar.add('Propriedades',{icone:'🖌',rotulo:'Copiar propriedades (MA)',cmd:'MATCHPROP'});

/* =================== testes =================== */
CAD.tests=CAD.tests||{};
CAD.tests.p4=async function(){
  var pass=0,fail=0,sd=CAD.doc;
  function ok(c,m){if(c)pass++;else{fail++;console.error('FALHOU P4: '+m);}}
  function tick(){return new Promise(function(r){setTimeout(r,0);});}
  function ln(y){return {type:'line',p1:{x:0,y:y,z:0},p2:{x:10,y:y,z:0}};}
  var quiet=CAD.cmd.print;CAD.cmd.print=function(){};
  try{
    CAD.setDoc(CAD.newDoc());var n0=CAD.doc.layers.length,L;
    // criar / validar
    L=Ly.add({name:'Paredes',color:'#ff0000'});ok(L&&CAD.doc.layers.length===n0+1&&Ly.get('Paredes').color==='#ff0000','add');
    ok(Ly.add({name:'paredes'})===null&&/Já existe/.test(Ly.error),'duplicada (sem diferenciar maiúsculas)');
    ok(Ly.add({name:'a/b'})===null&&Ly.add({name:'  '})===null,'nome inválido');
    ok(Ly.nextName()==='Layer1','nextName');
    CAD.history.undo();ok(!Ly.get('Paredes'),'undo add');CAD.history.redo();ok(!!Ly.get('Paredes'),'redo add');
    // set
    Ly.set('Paredes',{lw:0.5,ltype:'dashed',locked:true,plot:false,transp:200});L=Ly.get('Paredes');
    ok(L.lw===0.5&&L.ltype==='dashed'&&L.locked&&!L.plot&&L.transp===90,'set (transp limitada a 90)');
    CAD.history.undo();ok(Ly.get('Paredes').lw===0.25&&!Ly.get('Paredes').locked,'undo set restaura tudo');
    ok(Ly.set('Paredes',{color:'zzz'})===null,'cor inválida');
    ok(Ly.set('Paredes',{color:'3'}).color==='#00ff00'&&Ly.set('Paredes',{color:'azul'}).color==='#0000ff'&&Ly.set('Paredes',{color:'255,128,0'}).color==='#ff8000','parseColor índice/nome/rgb');
    ok(Ly.set('0',{frozen:true})===null,'não congela a atual');
    // atual + novos objetos
    Ly.setCurrent('Paredes');var e1=CAD.ents.add(ln(0));ok(e1.layer==='Paredes','objeto novo na layer atual');
    ok(Ly.remove('Paredes')===null,'não exclui atual');
    Ly.setCurrent('0');Ly.set('Paredes',{frozen:true});ok(Ly.setCurrent('Paredes')===null,'não torna atual uma congelada');
    ok(!CAD.visible(e1),'congelada some (P1 visible)');Ly.set('Paredes',{frozen:false});
    // rename
    var e2=CAD.ents.add(ln(1));Ly.setCurrent('Paredes');
    ok(Ly.rename('0','X')===null,'não renomeia 0');ok(Ly.rename('Paredes','0')===null,'rename p/ existente');
    Ly.rename('Paredes','Muros');ok(e1.layer==='Muros'&&CAD.doc.current.layer==='Muros'&&!Ly.get('Paredes'),'rename atualiza objetos e atual');
    CAD.history.undo();ok(e1.layer==='Paredes'&&CAD.doc.current.layer==='Paredes','undo rename');
    Ly.setCurrent('0');
    // excluir
    ok(Ly.remove('Paredes')===null&&/em uso/.test(Ly.error),'não exclui layer em uso');
    var U=Ly.add({name:'Vazia'});var idx=CAD.doc.layers.indexOf(U);ok(Ly.remove('Vazia')===true&&!Ly.get('Vazia'),'exclui vazia');
    CAD.history.undo();ok(CAD.doc.layers.indexOf(U)===idx,'undo exclui volta na mesma posição');
    ok(Ly.purge()===1&&!Ly.get('Vazia')&&!!Ly.get('Paredes'),'purge remove só as sem uso');
    // isolar
    Ly.add({name:'B'});Ly.isolate('B');ok(Ly.get('B').on&&!Ly.get('0').on&&!Ly.get('Paredes').on,'isolar');
    Ly.unisolate();ok(Ly.get('0').on&&Ly.get('Paredes').on,'restaurar');
    Ly.setAll('locked',true);ok(Ly.get('B').locked&&Ly.get('0').locked,'setAll');Ly.setAll('locked',false);
    // padrões
    Ly.setDefaults({color:'#00ff00',lw:0.5});var e3=CAD.ents.add(ln(2));ok(e3.color==='#00ff00'&&e3.lw===0.5,'padrões p/ novos objetos');
    Ly.setDefaults({color:null,lw:null});ok(CAD.ents.add(ln(3)).color===null,'volta ByLayer');
    // propriedades em lote
    CAD.ents.update(e2.id,{layer:'Paredes'});
    var ents=[e1,e2];var data=CAD.props.collect(ents);
    ok(data.n===2&&data.types.line===2&&data.general.length===4,'collect geral');
    ok(!data.general[0].varies&&data.general[0].value==='Paredes','layer igual');
    var pk={};data.typed.forEach(function(i){pk[i.key]=i;});
    ok(pk.p1&&pk.p2&&pk.length&&pk.length.readonly&&!pk.p1.readonly,'props do tipo (P1 line)');
    CAD.ents.update(e2.id,{p2:{x:20,y:1,z:0}});data=CAD.props.collect(ents);
    ok(data.typed.filter(function(i){return i.key==='p2';})[0].varies,'varia quando diferem');
    Ly.add({name:'Novo'});var r=CAD.props.apply(ents,'layer','Novo');
    ok(r.changed===2&&e1.layer==='Novo'&&e2.layer==='Novo','apply layer em lote');
    CAD.history.undo();ok(e1.layer==='Paredes'&&e2.layer==='Paredes','lote = 1 passo de undo');
    CAD.props.apply(ents,'color','#123456');ok(e1.color==='#123456'&&e2.color==='#123456','apply cor');
    CAD.props.apply(ents,'color',null);ok(e1.color===null,'ByLayer');
    CAD.props.apply([e1],'p1',{x:5,y:6});ok(e1.p1.x===5&&e1.p1.y===6&&e1.p1.z===0,'apply ponto');
    ok(CAD.props.apply([e1],'length',99).changed===0,'somente leitura é ignorado');
    Ly.set('Paredes',{locked:true});r=CAD.props.apply([e1],'color','#ff0000');ok(r.skipped===1&&e1.color===null,'layer bloqueada protege');Ly.set('Paredes',{locked:false});
    // tipos diferentes: só chaves em comum com o mesmo tipo
    CAD.types.register('__p4a',{props:function(e){return [{key:'k',label:'K',type:'number',value:e.k},{key:'s',label:'S',type:'string',value:'x'}];}});
    CAD.types.register('__p4b',{props:function(e){return [{key:'k',label:'K',type:'number',value:e.k},{key:'s',label:'S',type:'number',value:1}];}});
    var ea=CAD.ents.add({type:'__p4a',k:1}),eb=CAD.ents.add({type:'__p4b',k:2});
    data=CAD.props.collect([ea,eb]);ok(data.typed.length===1&&data.typed[0].key==='k'&&data.typed[0].varies,'tipos mistos: só chaves compatíveis');
    CAD.props.apply([ea,eb],'k',7);ok(ea.k===7&&eb.k===7,'apply em tipos mistos');
    // match
    CAD.props.apply([e2],'color','#ff00ff');ok(CAD.props.match(e2,[e1,ea])>=1&&e1.color==='#ff00ff'&&ea.color==='#ff00ff','matchprop');
    // transparência
    var flag=null;CAD.types.register('__p4t',{draw:function(ctx){flag=ctx.globalAlpha;}});
    Ly.set('Novo',{transp:50});var ctx={globalAlpha:1};CAD.types.get('__p4t').draw(ctx,{layer:'Novo'},{});ok(Math.abs(flag-0.5)<1e-9,'transparência ajusta globalAlpha');
    ctx={globalAlpha:1};CAD.types.get('__p4t').draw(ctx,{layer:'0'},{});ok(flag===1,'sem transparência = 1');
    // comando -LAYER
    CAD.cmd.run('-LAYER');await tick();
    CAD.input._submitText('Nova');await tick();CAD.input._submitText('Cmd1,Cmd2');await tick();
    CAD.input._submitText('Cor');await tick();CAD.input._submitText('Cmd1');await tick();CAD.input._submitText('vermelho');await tick();
    CAD.input._submitText('Desligar');await tick();CAD.input._submitText('Cmd2');await tick();
    CAD.input._submitText('');await CAD.cmd.whenIdle();
    ok(Ly.get('Cmd1')&&Ly.get('Cmd1').color==='#ff0000'&&Ly.get('Cmd2')&&Ly.get('Cmd2').on===false,'-LAYER por linha de comando');
    CAD.history.undo();ok(!Ly.get('Cmd1')&&!Ly.get('Cmd2'),'-LAYER inteiro = 1 passo de undo');
    // comando por objeto
    var eo=CAD.ents.add(ln(9));eo.layer='B';CAD.sel.set([eo.id]);
    CAD.cmd.run('LAYOFF');await CAD.cmd.whenIdle();ok(Ly.get('B').on===false,'LAYOFF usa seleção prévia');
  }finally{
    CAD.cmd.print=quiet;CAD.setDoc(sd);
  }
  console.log('CAD.tests.p4: '+pass+' ok, '+fail+' falhas');return {pass:pass,fail:fail};
};
})(window.CAD=window.CAD||{});
/* ==== END:4 ==== */
