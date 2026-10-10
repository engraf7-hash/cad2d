#!/usr/bin/env node
/* ==== PART:15 (build) ====
 * Uso:  node tools/build-release.js [versão] [--partial] [--zip] [--root=pasta]
 *  - ordena js/pN-*.js numericamente e reescreve os <script> do index.html
 *  - atualiza VERSION/FILES do service-worker.js e VERSION do js/p15-pwa.js
 *  - checagens estáticas: partes faltando, sintaxe, marcadores, imports, URLs externas,
 *    comandos/atalhos duplicados, atribuições duplicadas de CAD.x.y, manifest e ícones
 *  --partial: partes faltando viram aviso (útil antes de terminar todas as partes)
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const args = process.argv.slice(2), flag = k => args.includes('--' + k);
const rootArg = (args.find(a => a.startsWith('--root=')) || '').slice(7);
const root = path.resolve(rootArg || path.join(__dirname, '..'));
const P = (...p) => path.join(root, ...p), rd = f => fs.readFileSync(P(f), 'utf8'), ex = f => fs.existsSync(P(f));
const errors = [], warns = [], E = m => errors.push(m), W = m => warns.push(m);

// versão
let ver = args.find(a => /^\d+\.\d+\.\d+$/.test(a));
if (!ver && ex('service-worker.js')) { const m = rd('service-worker.js').match(/const VERSION = '([^']+)'/); ver = m && m[1]; }
ver = ver || '1.0.0';
const major = +ver.split('.')[0], last = major >= 3 ? 25 : major === 2 ? 19 : 15;

// arquivos js
const jsFiles = ex('js') ? fs.readdirSync(P('js')).filter(f => /^p\d+-.+\.js$/.test(f)) : [];
const num = f => +f.match(/^p(\d+)-/)[1];
jsFiles.sort((a, b) => num(a) - num(b));
const byNum = new Map(); jsFiles.forEach(f => { const n = num(f); if (byNum.has(n)) E('duas partes com o número ' + n + ': ' + byNum.get(n) + ' e ' + f); byNum.set(n, f); });
for (let n = 1; n <= last; n++) if (!byNum.has(n)) (flag('partial') ? W : E)('parte ausente: P' + n + ' (js/p' + n + '-*.js)');
if (!ex('index.html')) E('index.html não encontrado (é criado pela P1)');

// checagens por arquivo
const cmdOwner = new Map(), assign = new Map();
const req = ['L','PL','C','A','REC','H','M','CO','RO','MI','O','TR','EX','E','S','SC','F','CHA','J','B','X','T','DIM','PR','PLOT','Z'];
jsFiles.forEach(f => {
  const n = num(f), src = rd('js/' + f);
  if (!src.includes('/* ==== PART:' + n + ' ==== */') || !src.includes('/* ==== END:' + n + ' ==== */')) W(f + ': marcadores PART/END:' + n + ' ausentes');
  if (!/\(window\.CAD\s*=\s*window\.CAD\s*\|\|\s*\{\}\)/.test(src)) E(f + ': não usa o wrapper (function(CAD){...})(window.CAD=window.CAD||{})');
  try { new vm.Script(src, { filename: f }); } catch (e) { E(f + ': erro de sintaxe: ' + e.message); }
  if (/^\s*(import\s.+from|export\s+(default|const|function|class|\{))/m.test(src) || /(?<![.\w$])import\s*\(/.test(src)) E(f + ': usa import/export (precisa ser script clássico)');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const ext = (code.match(/https?:\/\/(?!www\.w3\.org)[^\s'"`)<]+/g) || []);
  if (ext.length) W(f + ': URL externa no código: ' + [...new Set(ext)].slice(0, 3).join(', '));
  if (!ex('api/p' + n + '.txt')) W('api/p' + n + '.txt ausente');
  // comandos (heurística)
  const re = /name\s*:\s*['"]([^'"]+)['"]\s*,\s*alias\s*:\s*\[([^\]]*)\]/g; let m;
  while ((m = re.exec(code))) {
    const nm = m[1].toUpperCase(), al = (m[2].match(/['"]([^'"]+)['"]/g) || []).map(s => s.slice(1, -1).toUpperCase());
    [nm, ...al].forEach(t => { if (cmdOwner.has(t) && cmdOwner.get(t).cmd !== nm) E('atalho duplicado "' + t + '": ' + cmdOwner.get(t).cmd + ' (' + cmdOwner.get(t).f + ') × ' + nm + ' (' + f + ')'); else cmdOwner.set(t, { cmd: nm, f }); });
  }
  // atribuições CAD.ns.fn = ... sem "||"
  const ra = /CAD\.(\w+)\.(\w+)\s*=(?!=)\s*([^;\n]*)/g;
  while ((m = ra.exec(code))) { if (/\|\|/.test(m[3])) continue; const k = m[1] + '.' + m[2]; if (assign.has(k) && assign.get(k) !== f) W('CAD.' + k + ' atribuído em ' + assign.get(k) + ' e ' + f + ' (confirme se é extensão intencional)'); else assign.set(k, f); }
});
if (jsFiles.length >= 10) req.forEach(t => { if (!cmdOwner.has(t)) W('atalho do contrato não encontrado estaticamente: ' + t + ' (confirme com VERIFICAR no navegador)'); });

// manifest e ícones
let manifest = null;
try { manifest = JSON.parse(rd('manifest.json')); } catch (e) { E('manifest.json inválido: ' + e.message); }
if (manifest) {
  ['name', 'short_name', 'start_url', 'display', 'icons'].forEach(k => { if (!manifest[k]) E('manifest.json sem "' + k + '"'); });
  const sizes = new Set();
  (manifest.icons || []).forEach(i => {
    if (!ex(i.src)) return E('ícone ausente: ' + i.src);
    const b = fs.readFileSync(P(i.src)), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    if (b.toString('latin1', 1, 4) !== 'PNG') E(i.src + ' não é PNG');
    if (i.sizes !== w + 'x' + h) E(i.src + ': tamanho real ' + w + 'x' + h + ' ≠ declarado ' + i.sizes);
    sizes.add(w);
  });
  [192, 512].forEach(s => { if (!sizes.has(s)) E('manifest sem ícone ' + s + 'x' + s); });
}

// index.html
let idxFiles = [];
if (ex('index.html')) {
  let html = rd('index.html');
  const tags = jsFiles.map(f => '  <script src="js/' + f + '"></script>').join('\n');
  html = html.replace(/[ \t]*<!--\s*P15:SCRIPTS:BEGIN\s*-->[\s\S]*?<!--\s*P15:SCRIPTS:END\s*-->\s*/g, '')
             .replace(/[ \t]*<script[^>]*\ssrc=["']js\/[^"']+["'][^>]*>\s*<\/script>[ \t]*\r?\n?/g, '');
  if (!/<\/body>/i.test(html)) E('index.html sem </body>'); else
  html = html.replace(/<\/body>/i, '  <!-- P15:SCRIPTS:BEGIN -->\n' + tags + '\n  <!-- P15:SCRIPTS:END -->\n</body>');
  const head = [];
  if (!/rel=["']manifest["']/.test(html)) head.push('<link rel="manifest" href="manifest.json">');
  if (!/name=["']theme-color["']/.test(html)) head.push('<meta name="theme-color" content="#1f3a5f">');
  if (!/rel=["']apple-touch-icon["']/.test(html)) head.push('<link rel="apple-touch-icon" href="icons/192.png">');
  if (!/name=["']viewport["']/.test(html)) head.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  if (head.length) html = html.replace(/<\/head>/i, '  ' + head.join('\n  ') + '\n</head>');
  if (/(src|href)=["']https?:\/\//i.test(html)) W('index.html referencia recurso externo (o app deve ser 100% offline)');
  fs.writeFileSync(P('index.html'), html);
  (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/g) || []).forEach(t => { const h = (t.match(/href=["']([^"']+)["']/) || [])[1]; if (h && !/^https?:/.test(h)) idxFiles.push(h); });
}

// service worker + p15
const files = ['./', 'index.html', ...new Set(idxFiles), 'styles.css', 'manifest.json', ...((manifest && manifest.icons) || []).map(i => i.src), ...jsFiles.map(f => 'js/' + f)];
const list = [...new Set(files)].filter(f => f === './' || ex(f));
files.forEach(f => { if (f !== './' && !ex(f)) E('arquivo do cache não existe: ' + f); });
if (ex('service-worker.js')) {
  let sw = rd('service-worker.js');
  sw = sw.replace(/const VERSION = '[^']*'/, "const VERSION = '" + ver + "'")
         .replace(/\/\*FILES:BEGIN\*\/[\s\S]*?\/\*FILES:END\*\//, '/*FILES:BEGIN*/' + list.map(f => "'" + f + "'").join(',') + '/*FILES:END*/');
  fs.writeFileSync(P('service-worker.js'), sw);
} else E('service-worker.js ausente');
const pwa = jsFiles.find(f => num(f) === 15);
if (pwa) fs.writeFileSync(P('js/' + pwa), rd('js/' + pwa).replace(/const VERSION='[^']*'/, "const VERSION='" + ver + "'"));

console.log('CAD 2D — build v' + ver + ' (' + root + ')');
console.log('  scripts: ' + jsFiles.length + ' | arquivos no cache: ' + list.length + ' | cache: cad2d-v' + ver);
warns.forEach(m => console.log('  AVISO: ' + m)); errors.forEach(m => console.log('  ERRO:  ' + m));
if (!errors.length && flag('zip')) {
  const out = path.resolve(root, '..', 'cad2d-v' + ver + '.zip'), items = ['index.html', 'styles.css', 'manifest.json', 'service-worker.js', 'icons', 'js'].filter(ex);
  try { cp.execFileSync('zip', ['-rq', out, ...items], { cwd: root }); console.log('  pacote: ' + out); } catch (e) { console.log('  zip indisponível; compacte a pasta manualmente.'); }
}
console.log(errors.length ? '  RESULTADO: ' + errors.length + ' erro(s). Corrija antes de publicar.' : '  RESULTADO: OK' + (warns.length ? ' (com ' + warns.length + ' aviso(s))' : ''));
process.exit(errors.length ? 1 : 0);
