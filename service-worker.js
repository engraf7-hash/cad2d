/* ==== PART:15 (service-worker) ==== */
// tools/build-release.js atualiza VERSION e FILES. Para publicar nova versão: rode o build e publique a pasta.
const VERSION = '1.0.0';
const CACHE = 'cad2d-v' + VERSION;
const FILES = [/*FILES:BEGIN*/'./','index.html','styles.css','manifest.json','icons/192.png','icons/512.png','js/p1-nucleo.js','js/p2-geometria.js','js/p3-precisao.js','js/p4-layers-props.js','js/p5-desenho.js','js/p6-edicao.js','js/p7-hatch.js','js/p8-texto.js','js/p9-cotas.js','js/p10-blocos.js','js/p11-arquivos.js','js/p12-dxf.js','js/p13-layout.js','js/p14-extras.js','js/p15-pwa.js'/*FILES:END*/];

self.addEventListener('install', e => {
  // tolerante: um arquivo ausente não impede a instalação; o fetch abaixo completa o cache em uso
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(new Request(f, {cache: 'reload'}))))));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('cad2d-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;   // nada de rede externa
  e.respondWith(caches.match(r, {ignoreSearch: true}).then(hit => hit || fetch(r).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => r.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
