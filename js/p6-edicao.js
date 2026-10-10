/* ==== PART:6 ==== */
/* P6 Edição: erase, move, copy, rotate, mirror, scale, stretch, offset, trim, extend, fillet, chamfer, join, explode.
   Depende só do contrato (P1 registros, input, ents, history). Matemática própria (não usa CAD.geom).
   Trim/extend/fillet/chamfer/join/offset operam sobre "caminhos" (segmentos reta/arco com bulge), comum a line, arc, circle e pline. */
(function (CAD) {
'use strict';
var PI = Math.PI, TAU = PI * 2, D2R = PI / 180, R2D = 180 / PI, EPS = 1e-9;
var S = CAD.edit = CAD.edit || {};
S.settings = S.settings || {
  filletR: 0, filletTrim: true, chamferD1: 0, chamferD2: 0, chamferAng: 45, chamferMethod: 'Distâncias', chamferTrim: true,
  offsetDist: 1, offsetErase: false, offsetLayer: 'Origem', edgeExtend: false, joinTol: 1e-6
};
var env = null; // injeção para testes: {input, ents, history, sel, layers, space, print}

/* ---------- utilitários ---------- */
function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function P(x, y, z) { return { x: x, y: y, z: z || 0 }; }
function pt(p) { return p ? P(num(p.x, 0), num(p.y, 0), num(p.z, 0)) : P(0, 0, 0); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function ang(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function mid(a, b) { return P((a.x + b.x) / 2, (a.y + b.y) / 2, ((a.z || 0) + (b.z || 0)) / 2); }
function pol(c, r, a) { return P(c.x + r * Math.cos(a), c.y + r * Math.sin(a), c.z || 0); }
function norm2pi(a) { a %= TAU; return a < 0 ? a + TAU : a; }
function norm360(a) { a %= 360; if (a < 0) a += 360; return a > 360 - 1e-9 ? 0 : a; }
function sweepRad(a1d, a2d) { var s = norm2pi(a2d * D2R) - norm2pi(a1d * D2R); if (s <= EPS) s += TAU; return s; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmt(n) { return String(Math.round(n * 1e6) / 1e6); }
function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function plain(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function kw(r, list) {
  if (typeof r !== 'string' || !list) return null;
  var s = plain(r), i;
  for (i = 0; i < list.length; i++) if (plain(list[i]) === s) return list[i];
  for (i = 0; i < list.length; i++) if (s && plain(list[i]).indexOf(s) === 0) return list[i];
  return null;
}
function isPt(r) { return !!r && typeof r === 'object' && typeof r.x === 'number' && typeof r.y === 'number'; }
function toNum(r) {
  if (typeof r === 'number' && isFinite(r)) return r;
  if (typeof r === 'string' && r.trim() !== '') { var n = +r.replace(',', '.'); if (isFinite(n)) return n; }
  return null;
}
function isCancel(x) {
  return !!x && (x === CAD.Cancel || (typeof CAD.Cancel === 'function' && x instanceof CAD.Cancel) || x.name === 'Cancel');
}
function guard(fn) {
  return async function () {
    try { await fn(); }
    catch (x) { if (isCancel(x)) return; throw x; }
  };
}
function unit(a, b) { var l = dist(a, b) || 1; return P((b.x - a.x) / l, (b.y - a.y) / l); }
function cross(u, v) { return u.x * v.y - u.y * v.x; }
function dot(u, v) { return u.x * v.x + u.y * v.y; }
function vsub(a, b) { return P(a.x - b.x, a.y - b.y); }

/* ---------- acesso ao Engine (injetável em testes) ---------- */
function IN() { return (env && env.input) || CAD.input; }
function EN() { return (env && env.ents) || CAD.ents; }
function HI() { return (env && env.history) || CAD.history; }
function SE() { return (env && env.sel) || CAD.sel; }
function say(m) { if (env && env.print) env.print(m); else if (CAD.cmd && CAD.cmd.print) CAD.cmd.print(m); }
function TY(t) { try { return (CAD.types && CAD.types.get) ? CAD.types.get(t) : null; } catch (x) { return null; } }
function redraw() { if (CAD.render && CAD.render.request) CAD.render.request(); }
function undoLast() { var h = HI(); if (h && h.undo) h.undo(); }

function layerOf(e) {
  var L = (env && env.layers) || (CAD.doc && CAD.doc.layers) || [], i;
  for (i = 0; i < L.length; i++) if (L[i].name === e.layer) return L[i];
  return null;
}
function visible(e) { var l = layerOf(e); return !(l && (l.on === false || l.frozen)); }
function editable(e) { var l = layerOf(e); return visible(e) && !(l && l.locked); }
function curSpace() { return (env && env.space) || (CAD.doc && CAD.doc.space) || (CAD.draw && CAD.draw.settings && CAD.draw.settings.space) || 'model'; }
function inSpace(e) { return (e.space || 'model') === curSpace(); }
function allEnts() {
  var q = EN(), r = null;
  try { if (q && q.query) r = q.query({}); } catch (x) { r = null; }
  if (!Array.isArray(r)) r = (CAD.doc && CAD.doc.entities) || [];
  return r.filter(inSpace);
}
function getEnt(id) { var q = EN(); return (q && q.get) ? q.get(id) : null; }
function normIds(r) {
  if (!r) return [];
  if (typeof Set !== 'undefined' && r instanceof Set) r = Array.from(r);
  if (!Array.isArray(r)) { if (Array.isArray(r.ids)) r = r.ids; else if (r.id !== undefined) r = [r.id]; else return []; }
  return r.map(function (x) { return (x && typeof x === 'object') ? x.id : x; }).filter(function (x) { return x !== undefined && x !== null; });
}
function selIds() {
  var s = SE(), r = null;
  if (!s) return [];
  try {
    if (typeof s.ids === 'function') r = s.ids(); else if (typeof s.get === 'function') r = s.get();
    else if (s.ids && typeof s.ids !== 'function') r = s.ids; else if (Array.isArray(s) || (typeof Set !== 'undefined' && s instanceof Set)) r = s;
  } catch (x) { r = null; }
  return normIds(r);
}
function selClear() { var s = SE(); try { if (s && s.clear) s.clear(); } catch (x) { /* ok */ } }

/* seleção de conjunto: usa pré-seleção (substantivo-verbo) se houver, senão pede ao usuário */
async function pickSet(prompt, o) {
  o = o || {};
  var ids = o.ignorePre ? [] : selIds();
  if (!ids.length) ids = normIds(await IN().select(prompt, {}));
  var ents = [], skipped = 0;
  ids.forEach(function (id) {
    var e = getEnt(id);
    if (!e || !inSpace(e)) return;
    if (o.needEdit === false ? !visible(e) : !editable(e)) { skipped++; return; }
    ents.push(e);
  });
  if (skipped) say(skipped + ' objeto(s) em layer bloqueada ou congelada ignorado(s).');
  return ents;
}
/* seleção de um objeto com ponto de seleção: devolve {id,pt} | {kw} | null */
async function pickOne(prompt, o) {
  o = o || {};
  var r = await IN().select(prompt, Object.assign({ single: true, withPoint: true }, o));
  if (r === null || r === undefined) return null;
  if (typeof r === 'string') { var k = kw(r, o.keywords); return k ? { kw: k } : null; }
  var id = null, p = null;
  if (typeof r === 'number') id = r;
  else if (Array.isArray(r)) id = normIds(r)[0];
  else if (typeof r === 'object') {
    if (r.id !== undefined) id = r.id; else if (Array.isArray(r.ids)) id = r.ids[0];
    p = r.pt || r.point || r.p || null; if (!isPt(p)) p = null;
  }
  if (id === undefined || id === null) return null;
  if (!p && o.needPt !== false) { p = await askPt('Indique o ponto de seleção'); if (!isPt(p)) return null; }
  return { id: id, pt: p };
}
function askPt(prompt, o) { return IN().point(prompt, o || {}); }
async function askNum(prompt, o) { var r = await IN().number(prompt, o || {}); return toNum(r); }
async function askYN(prompt, cur) {
  var r = await IN().keyword(prompt, ['Sim', 'Não'], { default: cur ? 'Sim' : 'Não' });
  var k = kw(r, ['Sim', 'Não']);
  return k ? k === 'Sim' : !!cur;
}
/* distância/ângulo: clique (relativo à base) ou número digitado */
async function askDist(prompt, base, o) {
  o = Object.assign({ base: base, allowNumber: true }, o || {});
  var r = await IN().point(prompt, o);
  if (isPt(r)) return { d: dist(base, r), pt: r };
  var k = kw(r, o.keywords); if (k) return { kw: k };
  var n = toNum(r); return n !== null ? { d: n } : null;
}
async function askAng(prompt, base, o) {
  o = Object.assign({ base: base, allowNumber: true }, o || {});
  var r = await IN().point(prompt, o);
  if (isPt(r)) return { a: ang(base, r) * R2D, pt: r };
  var k = kw(r, o.keywords); if (k) return { kw: k };
  var n = toNum(r); return n !== null ? { a: n } : null;
}

/* ---------- operações transacionais (um history.run por comando, sem snapshot) ---------- */
function opUpd(e, patch) { var old = {}, k; for (k in patch) old[k] = clone(e[k]); return { t: 'upd', id: e.id, patch: patch, old: old }; }
function opAdd(spec) { var s = clone(spec); delete s.id; return { t: 'add', spec: s, id: null }; }
function opDel(e) { return { t: 'del', id: e.id, spec: clone(e) }; }
function runOps(name, ops) {
  if (!ops || !ops.length) return;
  var q = EN();
  function apply(o) {
    var s;
    if (o.t === 'upd') q.update(o.id, clone(o.patch));
    else if (o.t === 'del') q.remove(o.id);
    else { s = clone(o.spec); if (o.id !== null) s.id = o.id; var r = q.add(s); o.id = (r && typeof r === 'object') ? r.id : r; }
  }
  function unapply(o) {
    if (o.t === 'upd') q.update(o.id, clone(o.old));
    else if (o.t === 'del') q.add(clone(o.spec));
    else q.remove(o.id);
  }
  function doAll() { ops.forEach(apply); redraw(); }
  function undoAll() { ops.slice().reverse().forEach(unapply); redraw(); }
  var h = HI();
  if (h && h.run) h.run({ name: name, do: doAll, undo: undoAll }); else doAll();
}
function cleanPatch(p) { var o = {}, k; for (k in p) if (p[k] !== undefined) o[k] = p[k]; return o; }
function copySpec(e, patch) { var s = clone(e); delete s.id; var p = cleanPatch(patch || {}), k; for (k in p) s[k] = clone(p[k]); return s; }
function inheritProps(e) { return { layer: e.layer, color: e.color === undefined ? null : e.color, lw: e.lw === undefined ? null : e.lw, ltype: e.ltype === undefined ? null : e.ltype, space: e.space || 'model' }; }

/* ---------- matrizes afins (compatíveis com types.transform do P5) ---------- */
function M(a, b, c, d, e, f) {
  var m = { a: a, b: b, c: c, d: d, e: e, f: f };
  m.apply = function (p) { return P(a * p.x + c * p.y + e, b * p.x + d * p.y + f, p.z || 0); };
  return m;
}
function mTrans(dx, dy) { return M(1, 0, 0, 1, dx, dy); }
function mRot(c, al) { var co = Math.cos(al), si = Math.sin(al); return M(co, si, -si, co, c.x - (co * c.x - si * c.y), c.y - (si * c.x + co * c.y)); }
function mScale(c, s) { return M(s, 0, 0, s, c.x * (1 - s), c.y * (1 - s)); }
function mMirror(p1, p2) {
  var t = ang(p1, p2), co = Math.cos(2 * t), si = Math.sin(2 * t);
  return M(co, si, si, -co, p1.x - (co * p1.x + si * p1.y), p1.y - (si * p1.x - co * p1.y));
}
function det(m) { return m.a * m.d - m.b * m.c; }
function xfLocal(e, m) { // degrada quando o tipo não tem types.transform
  var T = function (p) { return m.apply(pt(p)); }, sc = Math.sqrt(Math.abs(det(m)));
  switch (e.type) {
    case 'line': return { p1: T(e.p1), p2: T(e.p2) };
    case 'point': return { p: T(e.p) };
    case 'pline': { var fl = det(m) < 0; return { pts: (e.pts || []).map(function (p) { var q = T(p); q.bulge = fl ? -num(p.bulge, 0) : num(p.bulge, 0); return q; }) }; }
    case 'circle': return { c: T(e.c), r: e.r * sc };
    case 'arc': {
      var p1 = T(pol(e.c, e.r, e.a1 * D2R)), p2 = T(pol(e.c, e.r, e.a2 * D2R)), c2 = T(e.c), t;
      if (det(m) < 0) { t = p1; p1 = p2; p2 = t; }
      return { c: c2, r: e.r * sc, a1: norm360(ang(c2, p1) * R2D), a2: norm360(ang(c2, p2) * R2D) };
    }
  }
  return null;
}
function xf(e, m) {
  var d = TY(e.type);
  if (d && typeof d.transform === 'function') { try { var r = d.transform(e, m); if (r) return r; } catch (x) { /* usa local */ } }
  return xfLocal(e, m);
}
function ghost(ents, m) {
  return ents.slice(0, 400).map(function (e) { var p = xf(e, m); return p ? Object.assign(clone(e), cleanPatch(p)) : e; });
}
function xfOps(ents, m, copy) {
  var ops = [], skipped = 0;
  ents.forEach(function (e) {
    var p = xf(e, m);
    if (!p) { skipped++; return; }
    ops.push(copy ? opAdd(copySpec(e, p)) : opUpd(e, p));
  });
  if (skipped) say(skipped + ' objeto(s) sem suporte à transformação.');
  return ops;
}

/* ---------- bbox ---------- */
function bboxE(e) {
  var d = TY(e.type), b = null;
  if (d && d.bbox) { try { b = d.bbox(e); } catch (x) { b = null; } }
  if (b) { var mn = b.min || { x: b.x1, y: b.y1 }, mx = b.max || { x: b.x2, y: b.y2 }; return { x1: mn.x, y1: mn.y, x2: mx.x, y2: mx.y }; }
  var o = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  function add(p) { o.x1 = Math.min(o.x1, p.x); o.y1 = Math.min(o.y1, p.y); o.x2 = Math.max(o.x2, p.x); o.y2 = Math.max(o.y2, p.y); }
  var pa = toPath(e);
  if (pa) pa.segs.forEach(function (s) { add(s.p1); add(s.p2); if (s.arc) for (var k = 1; k < 48; k++) add(segAt(s, k / 48)); });
  else if (e.p) add(e.p); else if (e.c) add(e.c);
  if (o.x1 === Infinity) o.x1 = o.y1 = o.x2 = o.y2 = 0;
  return o;
}

/* ---------- segmentos (reta ou arco por bulge) ---------- */
function bulgeArc(p1, p2, b) {
  var d = dist(p1, p2);
  if (d < EPS || Math.abs(b) < 1e-12) return null;
  var th = 4 * Math.atan(b), r = d / (2 * Math.sin(Math.abs(th) / 2));
  var u = P((p2.x - p1.x) / d, (p2.y - p1.y) / d), n = P(-u.y, u.x), m = mid(p1, p2);
  var h = (d / 2) / Math.tan(th / 2);
  var c = P(m.x + n.x * h, m.y + n.y * h, p1.z || 0);
  var a0 = ang(c, p1), a3 = ang(c, p2);
  return { c: c, r: r, th: th, a0: a0, a1: b > 0 ? a0 : a3, a2: b > 0 ? a3 : a0 };
}
function mkSeg(p1, p2, b) {
  p1 = pt(p1); p2 = pt(p2);
  var s = { p1: p1, p2: p2, b: b || 0, arc: false }, a;
  if (Math.abs(s.b) > 1e-12 && dist(p1, p2) > EPS) {
    a = bulgeArc(p1, p2, s.b);
    if (a) { s.arc = true; s.c = a.c; s.r = a.r; s.th = a.th; s.a0 = a.a0; }
  }
  s.len = s.arc ? Math.abs(s.th) * s.r : dist(p1, p2);
  return s;
}
function mkCirc(c, r) { return mkSeg(pol(c, r, 0), pol(c, r, PI), 1); } // só para interseções (círculo completo)
function segAt(s, t) {
  if (s.arc) return P(s.c.x + s.r * Math.cos(s.a0 + s.th * t), s.c.y + s.r * Math.sin(s.a0 + s.th * t), s.p1.z + (s.p2.z - s.p1.z) * t);
  return P(s.p1.x + (s.p2.x - s.p1.x) * t, s.p1.y + (s.p2.y - s.p1.y) * t, s.p1.z + (s.p2.z - s.p1.z) * t);
}
/* parâmetro t (0 = início, 1 = fim; fora disso = prolongamento). modo: near (mais próximo), fwd, bwd */
function segParam(s, p, mode) {
  if (!s.arc) { var dx = s.p2.x - s.p1.x, dy = s.p2.y - s.p1.y, l2 = dx * dx + dy * dy; return l2 ? ((p.x - s.p1.x) * dx + (p.y - s.p1.y) * dy) / l2 : 0; }
  var sg = s.th > 0 ? 1 : -1, d = norm2pi(sg * (ang(s.c, p) - s.a0)), at = Math.abs(s.th);
  if (mode === 'fwd') return d / at;
  if (mode === 'bwd') return -norm2pi(-d) / at;
  if (d <= at) return d / at;
  return (d - at <= TAU - d) ? d / at : -(TAU - d) / at;
}
function segClosest(s, p) {
  var t, q;
  if (!s.arc) { t = clamp(segParam(s, p), 0, 1); q = segAt(s, t); return { t: t, pt: q, d: dist(p, q) }; }
  t = segParam(s, p, 'near');
  if (t >= 0 && t <= 1 && dist(p, s.c) > EPS) { q = segAt(s, t); return { t: t, pt: q, d: dist(p, q) }; }
  var d1 = dist(p, s.p1), d2 = dist(p, s.p2);
  return d1 <= d2 ? { t: 0, pt: s.p1, d: d1 } : { t: 1, pt: s.p2, d: d2 };
}
function lineLine(A, B) {
  var r = vsub(A.p2, A.p1), s = vsub(B.p2, B.p1), den = cross(r, s);
  if (Math.abs(den) <= 1e-10 * Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)) return [];
  var t = cross(vsub(B.p1, A.p1), s) / den;
  return [P(A.p1.x + r.x * t, A.p1.y + r.y * t, A.p1.z)];
}
function lineCirc(L, C) {
  var u = unit(L.p1, L.p2), f = vsub(L.p1, C.c), b = dot(f, u), cc = dot(f, f) - C.r * C.r, disc = b * b - cc, tol = 1e-12 * C.r * C.r + 1e-14;
  if (disc < -tol) return [];
  var sq = Math.sqrt(Math.max(0, disc)), o = [];
  [-b - sq, -b + sq].forEach(function (t, i) { if (i === 0 || sq > 1e-9 * (1 + C.r)) o.push(P(L.p1.x + u.x * t, L.p1.y + u.y * t, L.p1.z)); });
  return o;
}
function circCirc(A, B) {
  var d = dist(A.c, B.c);
  if (d < EPS || d > A.r + B.r + 1e-9 || d < Math.abs(A.r - B.r) - 1e-9) return [];
  var a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a));
  var ux = (B.c.x - A.c.x) / d, uy = (B.c.y - A.c.y) / d, mx = A.c.x + ux * a, my = A.c.y + uy * a;
  if (h < 1e-9 * (1 + A.r)) return [P(mx, my, A.c.z)];
  return [P(mx - uy * h, my + ux * h, A.c.z), P(mx + uy * h, my - ux * h, A.c.z)];
}
function segInt(A, B) { // interseções das curvas infinitas (reta ou círculo completo)
  if (!A.arc && !B.arc) return lineLine(A, B);
  if (A.arc && B.arc) return circCirc(A, B);
  return A.arc ? lineCirc(B, A) : lineCirc(A, B);
}
function inSeg(s, p, eb, ea) {
  var t = segParam(s, p, 'near');
  return (t >= -1e-9 && t <= 1 + 1e-9) || (t < -1e-9 && !!eb) || (t > 1 + 1e-9 && !!ea);
}

/* ---------- caminhos ---------- */
function toPath(e) {
  var v, n, segs = [], i, cnt, sw, q0, q1;
  switch (e.type) {
    case 'line': return { segs: [mkSeg(e.p1, e.p2, 0)], closed: false };
    case 'arc':
      sw = sweepRad(e.a1, e.a2); if (sw > TAU - 1e-9) sw = TAU - 1e-6;
      return { segs: [mkSeg(pol(e.c, e.r, e.a1 * D2R), pol(e.c, e.r, e.a2 * D2R), Math.tan(sw / 4))], closed: false };
    case 'circle':
      q0 = pol(e.c, e.r, 0); q1 = pol(e.c, e.r, PI);
      return { segs: [mkSeg(q0, q1, 1), mkSeg(q1, q0, 1)], closed: true };
    case 'pline':
      v = e.pts || []; n = v.length; cnt = e.closed ? n : n - 1;
      if (n < 2) return null;
      for (i = 0; i < cnt; i++) segs.push(mkSeg(v[i], v[(i + 1) % n], num(v[i].bulge, 0)));
      return { segs: segs, closed: !!e.closed };
  }
  if (CAD.draw && CAD.draw.tess && (e.type === 'ellipse' || e.type === 'spline')) { // só como aresta (aproximação)
    var t = CAD.draw.tess(e, 0.01);
    if (t && t.pts && t.pts.length > 1) {
      for (i = 0; i < t.pts.length - 1; i++) segs.push(mkSeg(t.pts[i], t.pts[i + 1], 0));
      if (t.closed) segs.push(mkSeg(t.pts[t.pts.length - 1], t.pts[0], 0));
      return { segs: segs, closed: !!t.closed, approx: true };
    }
  }
  return null;
}
function isTarget(e) { return e.type === 'line' || e.type === 'arc' || e.type === 'circle' || e.type === 'pline'; }
function locate(Pa, p) {
  var best = { d: Infinity, u: 0, i: 0, t: 0, pt: null };
  Pa.segs.forEach(function (s, i) { var c = segClosest(s, p); if (c.d < best.d - 1e-12) best = { d: c.d, u: i + c.t, i: i, t: c.t, pt: c.pt }; });
  return best;
}
function bulgeOf(s, dt) { return s.arc ? Math.tan(s.th * dt / 4) : 0; }
/* trecho do caminho entre u0 e u1 (u0<u1; em fechado pode passar de n; em aberto pode sair de [0,n] = prolongamento) */
function subPath(Pa, u0, u1) {
  var n = Pa.segs.length, closed = Pa.closed, pts = [], i0 = Math.floor(u0 + 1e-9), i1 = Math.ceil(u1 - 1e-9) - 1, i, s, ta, tb, last = null, lt = 0;
  if (!closed) { i0 = Math.max(0, i0); i1 = Math.min(n - 1, Math.max(i1, i0)); }
  for (i = i0; i <= i1; i++) {
    s = Pa.segs[((i % n) + n) % n];
    ta = (i === i0) ? u0 - i : 0; tb = (i === i1) ? u1 - i : 1;
    if (tb - ta < 1e-12) continue;
    var p = segAt(s, ta);
    pts.push({ x: p.x, y: p.y, z: p.z, bulge: bulgeOf(s, tb - ta) });
    last = s; lt = tb;
  }
  if (!last) return null;
  var q = segAt(last, lt);
  pts.push({ x: q.x, y: q.y, z: q.z, bulge: 0 });
  return pts.length > 1 ? pts : null;
}
function ptsLen(pts) { var L = 0, i; for (i = 0; i < pts.length - 1; i++) L += mkSeg(pts[i], pts[i + 1], num(pts[i].bulge, 0)).len; return L; }
function specFor(T, pts) {
  var o = inheritProps(T), a = pts[0], b = pts[pts.length - 1];
  if (T.type === 'pline') { o.type = 'pline'; o.pts = pts; o.closed = false; return o; }
  if (T.type === 'line') { o.type = 'line'; o.p1 = pt(a); o.p2 = pt(b); return o; }
  o.type = 'arc'; o.c = pt(T.c); o.r = T.r; o.a1 = norm360(ang(T.c, a) * R2D); o.a2 = norm360(ang(T.c, b) * R2D);
  return o;
}

/* ---------- TRIM ---------- */
function cutParams(Pa, T, edges, ext) {
  var n = Pa.segs.length, out = [];
  edges.forEach(function (E) {
    var same = E.id !== undefined && E.id === T.id;
    if (same && T.type !== 'pline') return;
    var Q = same ? Pa : toPath(E);
    if (!Q) return;
    var m = Q.segs.length, i, j;
    for (i = 0; i < n; i++) for (j = 0; j < m; j++) {
      if (same) { if (i === j || Math.abs(i - j) <= 1 || (Pa.closed && Math.abs(i - j) === n - 1)) continue; }
      segInt(Pa.segs[i], Q.segs[j]).forEach(function (p) {
        if (!inSeg(Pa.segs[i], p, false, false)) return;
        if (!inSeg(Q.segs[j], p, ext && !Q.closed && j === 0, ext && !Q.closed && j === m - 1)) return;
        out.push(i + clamp(segParam(Pa.segs[i], p, 'near'), 0, 1));
      });
    }
  });
  out = out.map(function (u) { return (Pa.closed && u >= n - 1e-9) ? u - n : u; }).sort(function (a, b) { return a - b; });
  var uniq = [];
  out.forEach(function (u) { if (!uniq.length || u - uniq[uniq.length - 1] > 1e-7) uniq.push(u); });
  if (Pa.closed && uniq.length > 1 && uniq[uniq.length - 1] - uniq[0] > n - 1e-7) uniq.pop();
  return uniq;
}
function trimOp(T, pick, edges, ext) {
  var Pa = toPath(T);
  if (!Pa) return { err: 'Objeto inválido.' };
  var n = Pa.segs.length, U = locate(Pa, pick).u, cuts = cutParams(Pa, T, edges, ext), pieces = [], k;
  if (!cuts.length) return { err: 'O objeto não cruza uma aresta de corte.' };
  if (!Pa.closed) {
    var lower = null, upper = null;
    cuts.forEach(function (c) { if (c <= U + 1e-9 && (lower === null || c > lower)) lower = c; if (c > U + 1e-9 && upper === null) upper = c; });
    if (lower !== null && lower > 1e-7) pieces.push(subPath(Pa, 0, lower));
    if (upper !== null && upper < n - 1e-7) pieces.push(subPath(Pa, upper, n));
  } else {
    if (cuts.length < 2) return { err: 'É preciso cruzar duas arestas para aparar um objeto fechado.' };
    var cc = cuts.concat(cuts.map(function (c) { return c + n; })), Uq = U < cuts[0] ? U + n : U;
    for (k = 0; k < cc.length - 1; k++) if (cc[k] <= Uq + 1e-9 && Uq < cc[k + 1]) break;
    pieces.push(subPath(Pa, cc[k + 1], cc[k] + n));
  }
  pieces = pieces.filter(function (p) { return p && ptsLen(p) > 1e-7; });
  return { remove: true, specs: pieces.map(function (p) { return specFor(T, p); }) };
}

/* ---------- EXTEND ---------- */
function extendOp(T, pick, edges, ext) {
  var Pa = toPath(T);
  if (!Pa || Pa.closed) return { err: 'Objeto fechado não pode ser estendido.' };
  var n = Pa.segs.length, atEnd = dist(pick, Pa.segs[n - 1].p2) <= dist(pick, Pa.segs[0].p1);
  var s = atEnd ? Pa.segs[n - 1] : Pa.segs[0], best = null;
  edges.forEach(function (E) {
    if (E.id !== undefined && E.id === T.id) return;
    var Q = toPath(E); if (!Q) return;
    var m = Q.segs.length;
    Q.segs.forEach(function (qs, j) {
      segInt(s, qs).forEach(function (p) {
        if (!inSeg(qs, p, ext && !Q.closed && j === 0, ext && !Q.closed && j === m - 1)) return;
        var t = segParam(s, p, atEnd ? 'fwd' : 'bwd'), amt = atEnd ? t - 1 : -t;
        if (amt <= 1e-9) return;
        if (s.arc && amt * Math.abs(s.th) >= TAU - Math.abs(s.th) - 1e-9) return;
        var meas = amt * (s.arc ? Math.abs(s.th) * s.r : s.len);
        if (!best || meas < best.meas) best = { t: t, meas: meas };
      });
    });
  });
  if (!best) return { err: 'Não há aresta limite na direção da extensão.' };
  var pts = atEnd ? subPath(Pa, 0, (n - 1) + best.t) : subPath(Pa, best.t, n);
  if (!pts) return { err: 'Falha ao estender.' };
  if (T.type === 'line') return { patch: { p1: pt(pts[0]), p2: pt(pts[pts.length - 1]) } };
  if (T.type === 'arc') return { patch: { a1: norm360(ang(T.c, pts[0]) * R2D), a2: norm360(ang(T.c, pts[pts.length - 1]) * R2D) } };
  return { patch: { pts: pts } };
}

/* ---------- OFFSET ---------- */
function pol3(c, r, a, z) { return P(c.x + r * Math.cos(a), c.y + r * Math.sin(a), z || 0); }
function offsetSeg(s, k) { // k > 0 = esquerda do sentido do segmento
  if (!s.arc) {
    if (s.len < EPS) return null;
    var nx = -(s.p2.y - s.p1.y) / s.len, ny = (s.p2.x - s.p1.x) / s.len;
    return mkSeg(P(s.p1.x + nx * k, s.p1.y + ny * k, s.p1.z), P(s.p2.x + nx * k, s.p2.y + ny * k, s.p2.z), 0);
  }
  var rr = s.th > 0 ? s.r - k : s.r + k;
  if (rr <= 1e-9) return null;
  return mkSeg(pol3(s.c, rr, s.a0, s.p1.z), pol3(s.c, rr, s.a0 + s.th, s.p2.z), s.b);
}
function joinPt(A, B) {
  var tol = 1e-9 * (1 + Math.abs(A.p2.x) + Math.abs(A.p2.y));
  if (dist(A.p2, B.p1) < tol) return A.p2;
  var m = mid(A.p2, B.p1), ints = segInt(A, B), best = null;
  ints.forEach(function (p) { if (!best || dist(p, m) < dist(best, m)) best = p; });
  return best ? P(best.x, best.y, A.p2.z) : m;
}
function segFix(s0, O, a, b) { // bulge do segmento deslocado entre a e b; null = colapsou/inverteu
  if (!s0.arc) {
    var u = unit(s0.p1, s0.p2);
    return dot(vsub(b, a), u) <= 1e-9 ? null : 0;
  }
  var sg = s0.th > 0 ? 1 : -1, raw = norm2pi(sg * (ang(O.c, b) - ang(O.c, a)));
  if (raw < 1e-9 || raw > Math.abs(s0.th) + PI) return null;
  return Math.tan(sg * raw / 4);
}
function offsetPath(Pa, k) {
  var O = [], orig = [], closed = Pa.closed, iter, i, j;
  Pa.segs.forEach(function (s) { var o = offsetSeg(s, k); if (o) { O.push(o); orig.push(s); } });
  for (iter = 0; iter < 14; iter++) {
    var n = O.length;
    if (n < 1 || (closed && n < 2)) return null;
    var V = [], bad = [], B = [];
    for (i = 0; i < n; i++) V.push((!closed && i === 0) ? O[0].p1 : joinPt(O[(i - 1 + n) % n], O[i]));
    var endV = closed ? V[0] : O[n - 1].p2;
    for (i = 0; i < n; i++) {
      var b = segFix(orig[i], O[i], V[i], (i + 1 < n) ? V[i + 1] : endV);
      if (b === null) bad.push(i); B.push(b);
    }
    if (!bad.length) {
      var pts = V.map(function (v, q) { return { x: v.x, y: v.y, z: v.z || 0, bulge: B[q] }; });
      if (!closed) pts.push({ x: endV.x, y: endV.y, z: endV.z || 0, bulge: 0 });
      return { pts: pts, closed: closed };
    }
    for (j = bad.length - 1; j >= 0; j--) { O.splice(bad[j], 1); orig.splice(bad[j], 1); }
  }
  return null;
}
function offsetEnt(e, d, sp) { // → {spec} | {err}
  var o = inheritProps(e), Pa, loc, s, left;
  switch (e.type) {
    case 'line': {
      var l = dist(e.p1, e.p2); if (l < EPS) return { err: 'Linha degenerada.' };
      var sd = cross(vsub(e.p2, e.p1), vsub(sp, e.p1)) >= 0 ? 1 : -1, nx = -(e.p2.y - e.p1.y) / l * d * sd, ny = (e.p2.x - e.p1.x) / l * d * sd;
      o.type = 'line'; o.p1 = P(e.p1.x + nx, e.p1.y + ny, e.p1.z); o.p2 = P(e.p2.x + nx, e.p2.y + ny, e.p2.z); return { spec: o };
    }
    case 'circle': case 'arc': {
      var rr = dist(e.c, sp) > e.r ? e.r + d : e.r - d;
      if (rr <= EPS) return { err: 'A distância colapsa o objeto.' };
      o.type = e.type; o.c = pt(e.c); o.r = rr; if (e.type === 'arc') { o.a1 = e.a1; o.a2 = e.a2; }
      return { spec: o };
    }
    case 'pline': {
      Pa = toPath(e); if (!Pa) return { err: 'Polilinha inválida.' };
      loc = locate(Pa, sp); s = Pa.segs[loc.i];
      left = s.arc ? (s.th > 0 ? dist(s.c, sp) < s.r : dist(s.c, sp) > s.r) : cross(vsub(s.p2, s.p1), vsub(sp, s.p1)) > 0;
      var r = offsetPath(Pa, left ? d : -d);
      if (!r) return { err: 'A distância colapsa o objeto.' };
      o.type = 'pline'; o.pts = r.pts; o.closed = r.closed; return { spec: o };
    }
  }
  return { err: 'Tipo sem suporte para deslocamento (use pline, linha, arco ou círculo).' };
}
function distToEnt(e, sp) {
  if (e.type === 'circle' || e.type === 'arc') return Math.abs(dist(e.c, sp) - e.r);
  var Pa = toPath(e); if (!Pa) return 0;
  if (e.type === 'line') return Math.abs(cross(unit(e.p1, e.p2), vsub(sp, e.p1)));
  return locate(Pa, sp).d;
}

/* ---------- FILLET / CHAMFER ---------- */
function operand(e) {
  var Pa = toPath(e);
  if (e.type === 'line') return { e: e, kind: 'line', seg: Pa.segs[0] };
  if (e.type === 'arc') return { e: e, kind: 'arc', seg: Pa.segs[0] };
  if (e.type === 'circle') return { e: e, kind: 'circle', seg: mkCirc(e.c, e.r) };
  return null;
}
function locusSegs(s, rf) {
  if (!s.arc) {
    var u = unit(s.p1, s.p2), n = P(-u.y, u.x);
    return [-1, 1].map(function (k) { var a = P(s.p1.x + n.x * rf * k, s.p1.y + n.y * rf * k); return mkSeg(a, P(a.x + u.x, a.y + u.y), 0); });
  }
  var o = [mkCirc(s.c, s.r + rf)];
  if (Math.abs(s.r - rf) > 1e-9) o.push(mkCirc(s.c, Math.abs(s.r - rf)));
  return o;
}
function tangentPt(s, C, rf) {
  if (!s.arc) return segAt(s, segParam(s, C));
  var d = dist(s.c, C); if (d < EPS) return null;
  var sgn = (rf > s.r && Math.abs(d - (rf - s.r)) < 1e-7 * (1 + rf)) ? -1 : 1;
  return P(s.c.x + sgn * (C.x - s.c.x) / d * s.r, s.c.y + sgn * (C.y - s.c.y) / d * s.r, s.c.z);
}
/* patch para aparar/estender a entidade (linha ou arco) até T, mantendo o lado do ponto de seleção */
function keepTo(op, T, pick) {
  var s = op.seg, e = op.e, t, tp;
  if (op.kind === 'circle') return null;
  t = segParam(s, T, 'near'); tp = segParam(s, pick, 'near');
  if (op.kind === 'line') {
    if (t > 1e-9 && t < 1 - 1e-9) return tp < t ? { p2: pt(T) } : { p1: pt(T) };
    return t <= 1e-9 ? { p1: pt(T) } : { p2: pt(T) };
  }
  var aT = norm360(ang(e.c, T) * R2D);
  if (t > 1e-9 && t < 1 - 1e-9) return tp < t ? { a2: aT } : { a1: aT };
  return t <= 1e-9 ? { a1: aT } : { a2: aT };
}
function filletPair(e1, pk1, e2, pk2, r, trim) { // → {ops}|{err}
  var o1 = operand(e1), o2 = operand(e2), C, cands = [], best = null, ops = [], T1, T2, p1, p2, arcSpec = null;
  if (!o1 || !o2) return { err: 'Concordância: use linhas, arcos, círculos ou segmentos adjacentes da mesma polilinha.' };
  if (r <= 1e-12) {
    segInt(o1.seg, o2.seg).forEach(function (p) { var sc = dist(p, pk1) + dist(p, pk2); if (!best || sc < best.sc) best = { C: p, T1: p, T2: p, sc: sc }; });
    if (!best) return { err: 'Os objetos não se cruzam (paralelos).' };
  } else {
    locusSegs(o1.seg, r).forEach(function (a) { locusSegs(o2.seg, r).forEach(function (b) { segInt(a, b).forEach(function (c) { cands.push(c); }); }); });
    cands.forEach(function (c) {
      var t1 = tangentPt(o1.seg, c, r), t2 = tangentPt(o2.seg, c, r);
      if (!t1 || !t2) return;
      var sc = dist(t1, pk1) + dist(t2, pk2);
      if (!best || sc < best.sc) best = { C: c, T1: t1, T2: t2, sc: sc };
    });
    if (!best) return { err: 'Não existe concordância com esse raio.' };
    var a1 = ang(best.C, best.T1), a2 = ang(best.C, best.T2), dl = a2 - a1;
    while (dl > PI) dl -= TAU; while (dl < -PI) dl += TAU;
    arcSpec = Object.assign(inheritProps(e1), { type: 'arc', c: pt(best.C), r: r, a1: norm360((dl > 0 ? a1 : a2) * R2D), a2: norm360((dl > 0 ? a2 : a1) * R2D) });
  }
  T1 = best.T1; T2 = best.T2;
  if (o1.kind === 'line' && o2.kind === 'line') {
    var X0 = lineLine(o1.seg, o2.seg)[0];
    if (X0) {
      var tooBig = function (o, T, pk) {
        var u = sideDir(o.seg, X0, pk), pf = Math.max(dot(vsub(o.seg.p1, X0), u), dot(vsub(o.seg.p2, X0), u));
        return dot(vsub(T, X0), u) > pf + 1e-9;
      };
      if (tooBig(o1, T1, pk1) || tooBig(o2, T2, pk2)) return { err: 'Raio grande demais para os objetos.' };
    }
  }
  if (trim) {
    p1 = keepTo(o1, T1, pk1); p2 = keepTo(o2, T2, pk2);
    var chk = function (o, p) {
      if (!p) return true;
      if (o.kind === 'line') { var n = Object.assign({}, o.e, p); return dist(n.p1, n.p2) > 1e-9; }
      return Math.abs(norm360(Object.assign({}, o.e, p).a2) - norm360(Object.assign({}, o.e, p).a1)) > 1e-9;
    };
    if (!chk(o1, p1) || !chk(o2, p2)) return { err: 'Raio grande demais para os objetos.' };
    if (p1) ops.push(opUpd(e1, p1));
    if (p2) ops.push(opUpd(e2, p2));
  }
  if (arcSpec) ops.push(opAdd(arcSpec));
  return { ops: ops };
}
function sideDir(s, X, pk) {
  var u = unit(s.p1, s.p2), v = dot(vsub(pk, X), u);
  if (Math.abs(v) < 1e-12) v = (Math.abs(dot(vsub(s.p2, X), u)) >= Math.abs(dot(vsub(s.p1, X), u))) ? dot(vsub(s.p2, X), u) : dot(vsub(s.p1, X), u);
  return v >= 0 ? u : P(-u.x, -u.y);
}
function chamferPair(e1, pk1, e2, pk2, d1, d2, trim) {
  if (e1.type !== 'line' || e2.type !== 'line') return { err: 'Chanfro: use linhas ou segmentos retos da mesma polilinha.' };
  var A = mkSeg(e1.p1, e1.p2, 0), B = mkSeg(e2.p1, e2.p2, 0), X = lineLine(A, B)[0];
  if (!X) return { err: 'As linhas são paralelas.' };
  var u1 = sideDir(A, X, pk1), u2 = sideDir(B, X, pk2);
  var far = function (s, u) { return Math.max(dot(vsub(s.p1, X), u), dot(vsub(s.p2, X), u)); };
  if (d1 > far(A, u1) + 1e-9 || d2 > far(B, u2) + 1e-9) return { err: 'Distância de chanfro grande demais.' };
  var T1 = P(X.x + u1.x * d1, X.y + u1.y * d1, e1.p1.z), T2 = P(X.x + u2.x * d2, X.y + u2.y * d2, e2.p1.z), ops = [];
  if (trim) {
    ops.push(opUpd(e1, keepTo({ kind: 'line', seg: A, e: e1 }, T1, pk1)));
    ops.push(opUpd(e2, keepTo({ kind: 'line', seg: B, e: e2 }, T2, pk2)));
  }
  if (dist(T1, T2) > 1e-9) ops.push(opAdd(Object.assign(inheritProps(e1), { type: 'line', p1: T1, p2: T2 })));
  return { ops: ops };
}
/* canto de polilinha: raio (f) ou distâncias (c); a = d1 no segmento que chega, b = d2 no que sai */
function cornerVertex(pts, closed, v, kind, a, b) {
  var n = pts.length, pi = (v - 1 + n) % n, ni = (v + 1) % n;
  if (!closed && (v < 1 || v > n - 2)) return null;
  if (Math.abs(num(pts[pi].bulge, 0)) > 1e-12 || Math.abs(num(pts[v].bulge, 0)) > 1e-12) return null;
  var V = pts[v], A = pts[pi], B = pts[ni], la = dist(A, V), lb = dist(V, B);
  if (la < EPS || lb < EPS) return null;
  var u1 = P((A.x - V.x) / la, (A.y - V.y) / la), u2 = P((B.x - V.x) / lb, (B.y - V.y) / lb);
  var phi = Math.acos(clamp(dot(u1, u2), -1, 1));
  if (phi < 1e-9 || phi > PI - 1e-9) return null;
  var d1, d2, bulge = 0;
  if (kind === 'f') { if (a <= 1e-12) return null; d1 = d2 = a / Math.tan(phi / 2); } else { d1 = a; d2 = b; }
  if (d1 > la - 1e-9 || d2 > lb - 1e-9) return null;
  if (kind === 'f') bulge = (cross(vsub(V, A), vsub(B, V)) > 0 ? 1 : -1) * Math.tan((PI - phi) / 4);
  var out = clone(pts), z = V.z || 0;
  out.splice(v, 1, { x: V.x + u1.x * d1, y: V.y + u1.y * d1, z: z, bulge: bulge }, { x: V.x + u2.x * d2, y: V.y + u2.y * d2, z: z, bulge: 0 });
  return out;
}
function cornersAll(e, kind, a, b) {
  var pts = clone(e.pts), n = pts.length, v, cnt = 0, r;
  for (v = e.closed ? n - 1 : n - 2; v >= (e.closed ? 0 : 1); v--) {
    r = cornerVertex(pts, !!e.closed, v, kind, a, b);
    if (r) { pts = r; cnt++; }
  }
  return cnt ? { pts: pts, count: cnt } : null;
}
function sameVertex(e, pk1, pk2) { // vértice compartilhado por dois segmentos adjacentes da mesma pline
  var Pa = toPath(e); if (!Pa || e.type !== 'pline') return null;
  var n = Pa.segs.length, i = locate(Pa, pk1).i, j = locate(Pa, pk2).i, nv = e.pts.length;
  if (i === j) return null;
  if (e.closed) { if ((j - i + n) % n === 1) return { v: j % nv, firstIsPrev: true }; if ((i - j + n) % n === 1) return { v: i % nv, firstIsPrev: false }; }
  else { if (j === i + 1) return { v: j, firstIsPrev: true }; if (i === j + 1) return { v: i, firstIsPrev: false }; }
  return null;
}

/* ---------- STRETCH ---------- */
function winOf(a, b) { return { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }; }
function inWin(p, w) { return p.x >= w.x1 - 1e-9 && p.x <= w.x2 + 1e-9 && p.y >= w.y1 - 1e-9 && p.y <= w.y2 + 1e-9; }
function touches(e, w) { var b = bboxE(e); return !(b.x2 < w.x1 || b.x1 > w.x2 || b.y2 < w.y1 || b.y1 > w.y2); }
function shift(p, d) { return P(p.x + d.x, p.y + d.y, p.z || 0); }
function stretchPatch(e, w, d) {
  var b = bboxE(e);
  if (b.x1 >= w.x1 - 1e-9 && b.x2 <= w.x2 + 1e-9 && b.y1 >= w.y1 - 1e-9 && b.y2 <= w.y2 + 1e-9) return xf(e, mTrans(d.x, d.y));
  var in1, in2;
  switch (e.type) {
    case 'line':
      in1 = inWin(e.p1, w); in2 = inWin(e.p2, w);
      if (!in1 && !in2) return null;
      return { p1: in1 ? shift(e.p1, d) : pt(e.p1), p2: in2 ? shift(e.p2, d) : pt(e.p2) };
    case 'pline': {
      var any = false, pts = (e.pts || []).map(function (p) { var q = { x: p.x, y: p.y, z: p.z || 0, bulge: num(p.bulge, 0) }; if (inWin(p, w)) { q.x += d.x; q.y += d.y; any = true; } return q; });
      return any ? { pts: pts } : null;
    }
    case 'arc': {
      var p1 = pol(e.c, e.r, e.a1 * D2R), p2 = pol(e.c, e.r, e.a2 * D2R), sw = sweepRad(e.a1, e.a2);
      in1 = inWin(p1, w); in2 = inWin(p2, w);
      if (!in1 && !in2) return null;
      var n1 = in1 ? shift(p1, d) : p1, n2 = in2 ? shift(p2, d) : p2, a = bulgeArc(n1, n2, Math.tan(sw / 4));
      return a ? { c: a.c, r: a.r, a1: norm360(a.a1 * R2D), a2: norm360(a.a2 * R2D) } : null;
    }
    case 'spline': {
      var anyS = false, fit = (e.fit || []).map(function (p) { if (inWin(p, w)) { anyS = true; return shift(p, d); } return pt(p); });
      return anyS ? { fit: fit } : null;
    }
  }
  var ref = e.c || e.p || e.p1;
  return (ref && inWin(ref, w)) ? xf(e, mTrans(d.x, d.y)) : null;
}

/* ---------- JOIN ---------- */
function endsOf(e) {
  var sw;
  if (e.type === 'line') return [{ x: e.p1.x, y: e.p1.y, z: e.p1.z || 0, bulge: 0 }, { x: e.p2.x, y: e.p2.y, z: e.p2.z || 0, bulge: 0 }];
  if (e.type === 'arc') {
    sw = sweepRad(e.a1, e.a2);
    var a = pol(e.c, e.r, e.a1 * D2R), b = pol(e.c, e.r, e.a2 * D2R);
    return [{ x: a.x, y: a.y, z: a.z, bulge: Math.tan(sw / 4) }, { x: b.x, y: b.y, z: b.z, bulge: 0 }];
  }
  if (e.type === 'pline' && !e.closed && (e.pts || []).length > 1) return e.pts.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0, bulge: num(p.bulge, 0) }; });
  return null;
}
function revPts(v) {
  var m = v.length - 1, out = [], k, p;
  for (k = 0; k <= m; k++) { p = v[m - k]; out.push({ x: p.x, y: p.y, z: p.z || 0, bulge: (k < m) ? -num(v[m - k - 1].bulge, 0) : 0 }); }
  return out;
}
function joinEnts(list, tol) { // → {err} | {remove:[ids], spec, used, left}
  tol = tol || S.settings.joinTol;
  var pieces = [], first = list[0], i, valid = [];
  list.forEach(function (e) { var p = endsOf(e); if (p) { pieces.push({ e: e, pts: p, used: false }); valid.push(e); } });
  if (pieces.length < 2) return { err: 'Selecione ao menos dois objetos abertos (linha, arco ou polilinha aberta).' };
  first = pieces[0].e;
  var props = inheritProps(first), ids;
  // 1) linhas colineares → uma linha
  if (valid.every(function (e) { return e.type === 'line'; })) {
    var u = unit(first.p1, first.p2), ok = dist(first.p1, first.p2) > EPS, lo = Infinity, hi = -Infinity;
    valid.forEach(function (e) {
      [e.p1, e.p2].forEach(function (p) { if (Math.abs(cross(u, vsub(p, first.p1))) > tol) ok = false; var t = dot(u, vsub(p, first.p1)); lo = Math.min(lo, t); hi = Math.max(hi, t); });
    });
    if (ok) {
      var s1 = Object.assign({}, props, { type: 'line', p1: P(first.p1.x + u.x * lo, first.p1.y + u.y * lo, first.p1.z), p2: P(first.p1.x + u.x * hi, first.p1.y + u.y * hi, first.p1.z) });
      return { remove: valid.map(function (e) { return e.id; }), spec: s1, used: valid.length, left: list.length - valid.length };
    }
  }
  // 2) encadeamento por extremidades
  var chain = pieces[0].pts.slice(), changed = true, used = 1;
  pieces[0].used = true;
  while (changed) {
    changed = false;
    for (i = 1; i < pieces.length; i++) {
      var pc = pieces[i]; if (pc.used) continue;
      var head = chain[0], tail = chain[chain.length - 1], a = pc.pts[0], b = pc.pts[pc.pts.length - 1], r;
      if (dist(tail, a) <= tol) r = pc.pts; else if (dist(tail, b) <= tol) r = revPts(pc.pts); else r = null;
      if (r) { chain[chain.length - 1].bulge = r[0].bulge; chain = chain.concat(r.slice(1)); pc.used = true; used++; changed = true; continue; }
      if (dist(head, b) <= tol) r = pc.pts; else if (dist(head, a) <= tol) r = revPts(pc.pts); else r = null;
      if (r) { chain = r.slice(0, -1).concat(chain); pc.used = true; used++; changed = true; }
    }
  }
  if (used < 2) return { err: 'Nenhum objeto tem extremidade coincidente para unir.' };
  var closed = false;
  if (chain.length >= 3 && dist(chain[0], chain[chain.length - 1]) <= tol) { chain.pop(); closed = true; }
  ids = pieces.filter(function (p) { return p.used; }).map(function (p) { return p.e.id; });
  var usedEnts = pieces.filter(function (p) { return p.used; }).map(function (p) { return p.e; });
  // 3) arcos do mesmo círculo → arco (ou círculo)
  if (usedEnts.every(function (e) { return e.type === 'arc' && dist(e.c, usedEnts[0].c) < tol && Math.abs(e.r - usedEnts[0].r) < tol; })) {
    var c0 = usedEnts[0], sp;
    if (closed) sp = Object.assign({}, props, { type: 'circle', c: pt(c0.c), r: c0.r });
    else sp = Object.assign({}, props, { type: 'arc', c: pt(c0.c), r: c0.r, a1: norm360(ang(c0.c, chain[0]) * R2D), a2: norm360(ang(c0.c, chain[chain.length - 1]) * R2D) });
    return { remove: ids, spec: sp, used: used, left: list.length - used };
  }
  return { remove: ids, spec: Object.assign({}, props, { type: 'pline', pts: chain, closed: closed }), used: used, left: list.length - used };
}

/* ---------- EXPLODE ---------- */
function explodeLocal(e) {
  var Pa = toPath(e), o = inheritProps(e);
  if (!Pa) return null;
  return Pa.segs.map(function (s) {
    if (s.arc) return Object.assign({}, o, { type: 'arc', c: pt(s.c), r: s.r, a1: norm360((s.b > 0 ? s.a0 : s.a0 + s.th) * R2D), a2: norm360((s.b > 0 ? s.a0 + s.th : s.a0) * R2D) });
    return Object.assign({}, o, { type: 'line', p1: pt(s.p1), p2: pt(s.p2) });
  });
}
function explodeEnt(e) {
  var d = TY(e.type);
  if (d && typeof d.explode === 'function') {
    try { var r = d.explode(e); if (Array.isArray(r)) return r.length ? r : null; } catch (x) { /* local */ }
  }
  return e.type === 'pline' ? explodeLocal(e) : null;
}

/* ====================== comandos ====================== */
var cmdErase = guard(async function () {
  var ents = await pickSet('ERASE Selecione objetos');
  if (!ents.length) return;
  runOps('Apagar', ents.map(opDel));
  selClear();
  say(ents.length + ' objeto(s) apagado(s).');
});

async function getDisp(ents, verbPrompt, o) { // base + 2º ponto (ou deslocamento); devolve {d, base} | null
  var base = await askPt(verbPrompt + ' Ponto base ou [Deslocamento]', { keywords: ['Deslocamento'] }), k = kw(base, ['Deslocamento']);
  if (k) { var dp = await askPt('Deslocamento'); return isPt(dp) ? { d: P(dp.x, dp.y), base: null } : null; }
  if (!isPt(base)) return null;
  return { base: base };
}
var cmdMove = guard(async function () {
  var ents = await pickSet('MOVE Selecione objetos');
  if (!ents.length) return;
  var g = await getDisp(ents, 'MOVE'), d;
  if (!g) return;
  if (g.base) {
    var b = g.base, p2 = await askPt('Segundo ponto ou <usar o ponto base como deslocamento>', { base: b, preview: function (q) { return ghost(ents, mTrans(q.x - b.x, q.y - b.y)); } });
    d = isPt(p2) ? P(p2.x - b.x, p2.y - b.y) : P(b.x, b.y);
  } else d = g.d;
  runOps('Mover', xfOps(ents, mTrans(d.x, d.y), false));
});
var cmdCopy = guard(async function () {
  var ents = await pickSet('COPY Selecione objetos');
  if (!ents.length) return;
  var g = await getDisp(ents, 'COPY');
  if (!g) return;
  if (!g.base) { runOps('Copiar', xfOps(ents, mTrans(g.d.x, g.d.y), true)); return; }
  var b = g.base, K = ['Desfazer', 'Sair'];
  for (;;) {
    var r = await askPt('Segundo ponto ou [Desfazer/Sair] <Sair>', { base: b, keywords: K, preview: function (q) { return ghost(ents, mTrans(q.x - b.x, q.y - b.y)); } });
    if (isPt(r)) runOps('Copiar', xfOps(ents, mTrans(r.x - b.x, r.y - b.y), true));
    else if (kw(r, K) === 'Desfazer') undoLast();
    else break;
  }
});
var cmdRotate = guard(async function () {
  var ents = await pickSet('ROTATE Selecione objetos');
  if (!ents.length) return;
  var b = await askPt('Ponto base');
  if (!isPt(b)) return;
  var copy = false, al = null, K = ['Copiar', 'Referência'];
  for (;;) {
    var r = await askAng('Ângulo de rotação ou [Copiar/Referência]', b, { keywords: K, preview: function (q) { return ghost(ents, mRot(b, ang(b, q))); } });
    if (!r) return;
    if (r.kw === 'Copiar') { copy = true; say('Rotação em modo cópia.'); continue; }
    if (r.kw === 'Referência') {
      var ref = await askAng('Ângulo de referência', b), nw = ref && ref.a !== undefined ? await askAng('Novo ângulo', b) : null;
      if (!ref || ref.a === undefined || !nw || nw.a === undefined) return;
      al = nw.a - ref.a; break;
    }
    al = r.a; break;
  }
  runOps('Girar', xfOps(ents, mRot(b, al * D2R), copy));
});
var cmdMirror = guard(async function () {
  var ents = await pickSet('MIRROR Selecione objetos');
  if (!ents.length) return;
  var p1 = await askPt('Primeiro ponto da linha de espelho');
  if (!isPt(p1)) return;
  var p2 = await askPt('Segundo ponto da linha de espelho', { base: p1, preview: function (q) { return dist(p1, q) > EPS ? ghost(ents, mMirror(p1, q)) : []; } });
  if (!isPt(p2) || dist(p1, p2) < EPS) { say('Linha de espelho inválida.'); return; }
  var del = await askYN('Apagar objetos de origem? [Sim/Não] <Não>', false);
  runOps('Espelhar', xfOps(ents, mMirror(p1, p2), !del));
});
var cmdScale = guard(async function () {
  var ents = await pickSet('SCALE Selecione objetos');
  if (!ents.length) return;
  var b = await askPt('Ponto base');
  if (!isPt(b)) return;
  var copy = false, f = null, K = ['Copiar', 'Referência'];
  for (;;) {
    var r = await askDist('Fator de escala ou [Copiar/Referência]', b, { keywords: K, preview: function (q) { var s = dist(b, q); return s > EPS ? ghost(ents, mScale(b, s)) : []; } });
    if (!r) return;
    if (r.kw === 'Copiar') { copy = true; say('Escala em modo cópia.'); continue; }
    if (r.kw === 'Referência') {
      var ref = await askDist('Comprimento de referência <1>', b), nw = (ref && ref.d > EPS) ? await askDist('Novo comprimento', b) : null;
      if (!ref || !(ref.d > EPS) || !nw) return;
      f = nw.d / ref.d; break;
    }
    f = r.d; break;
  }
  if (!(f > EPS)) { say('Fator de escala inválido.'); return; }
  runOps('Escala', xfOps(ents, mScale(b, f), copy));
});
var cmdStretch = guard(async function () {
  var c1 = await askPt('STRETCH Primeiro canto da janela (captura)');
  if (!isPt(c1)) return;
  var c2 = await askPt('Canto oposto', { base: c1, rect: true });
  if (!isPt(c2)) return;
  var w = winOf(c1, c2), tg = allEnts().filter(function (e) { return editable(e) && touches(e, w); });
  if (!tg.length) { say('Nenhum objeto na janela.'); return; }
  var b = await askPt('Ponto base');
  if (!isPt(b)) return;
  var prev = function (d) { return tg.map(function (e) { var p = stretchPatch(e, w, d); return p ? Object.assign(clone(e), cleanPatch(p)) : null; }).filter(Boolean).slice(0, 400); };
  var p2 = await askPt('Segundo ponto', { base: b, preview: function (q) { return prev(P(q.x - b.x, q.y - b.y)); } });
  var d = isPt(p2) ? P(p2.x - b.x, p2.y - b.y) : P(b.x, b.y), ops = [];
  tg.forEach(function (e) { var p = stretchPatch(e, w, d); if (p) ops.push(opUpd(e, p)); });
  runOps('Esticar', ops);
});
var cmdOffset = guard(async function () {
  var st = S.settings, d0 = null, through = false, K = ['Através', 'Apagar', 'Camada'];
  for (;;) {
    var r = await IN().point('OFFSET Distância <' + fmt(st.offsetDist) + '> ou [Através/Apagar/Camada]', { keywords: K, allowNumber: true }), k = kw(r, K);
    if (k === 'Através') { through = true; break; }
    if (k === 'Apagar') { st.offsetErase = await askYN('Apagar objeto de origem? [Sim/Não]', st.offsetErase); continue; }
    if (k === 'Camada') {
      var l = await IN().keyword('Camada do objeto deslocado [Atual/Origem]', ['Atual', 'Origem'], { default: st.offsetLayer });
      st.offsetLayer = kw(l, ['Atual', 'Origem']) || st.offsetLayer; continue;
    }
    if (r === null || r === undefined) { d0 = st.offsetDist; break; }
    if (isPt(r)) { var r2 = await askPt('Segundo ponto', { base: r }); if (!isPt(r2)) return; d0 = dist(r, r2); break; }
    var n = toNum(r); if (n !== null) { d0 = n; break; }
    return;
  }
  if (!through) { if (!(d0 > EPS)) { say('Distância inválida.'); return; } st.offsetDist = d0; }
  for (;;) {
    var o = await pickOne('Selecione o objeto a deslocar ou <sair>', { needPt: false });
    if (!o || o.id === undefined) break;
    var e = getEnt(o.id);
    if (!e || !editable(e)) { say('Objeto inválido ou em layer bloqueada.'); continue; }
    var sp = await askPt(through ? 'Ponto de passagem' : 'Ponto do lado a deslocar ou [Sair]', { keywords: ['Sair'] });
    if (!isPt(sp)) { if (kw(sp, ['Sair'])) break; continue; }
    var d = through ? distToEnt(e, sp) : d0;
    if (!(d > EPS)) { say('Distância nula.'); continue; }
    var res = offsetEnt(e, d, sp);
    if (res.err) { say(res.err); continue; }
    if (st.offsetLayer === 'Atual' && CAD.doc && CAD.doc.current && CAD.doc.current.layer) res.spec.layer = CAD.doc.current.layer;
    var ops = [opAdd(res.spec)];
    if (st.offsetErase) ops.push(opDel(e));
    runOps('Deslocar', ops);
  }
});

async function trimExtend(mode) {
  var isTrim = mode === 'trim', name = isTrim ? 'TRIM' : 'EXTEND', ext = !!S.settings.edgeExtend;
  var sel = await pickSet(name + (isTrim ? ' Selecione arestas de corte' : ' Selecione arestas limite') + ' ou <todas>', { ignorePre: true, needEdit: false });
  var ids = sel.map(function (e) { return e.id; }), K = ['Borda', 'Desfazer'];
  for (;;) {
    var o = await pickOne('Selecione o objeto a ' + (isTrim ? 'aparar' : 'estender') + ' ou [Borda/Desfazer]', { keywords: K });
    if (!o) break;
    if (o.kw === 'Borda') {
      var m = await IN().keyword('Modo de borda [Estender/Sem extensão]', ['Estender', 'Sem extensão'], { default: ext ? 'Estender' : 'Sem extensão' });
      ext = kw(m, ['Estender', 'Sem extensão']) === 'Estender'; continue;
    }
    if (o.kw === 'Desfazer') { undoLast(); continue; }
    var T = getEnt(o.id);
    if (!T) continue;
    if (!editable(T)) { say('Objeto em layer bloqueada ou congelada.'); continue; }
    if (!isTarget(T)) { say('Tipo sem suporte para ' + (isTrim ? 'aparar' : 'estender') + ' (use linha, arco, círculo ou polilinha).'); continue; }
    var edges = ids.length ? ids.map(getEnt).filter(Boolean) : allEnts().filter(visible);
    var res = isTrim ? trimOp(T, o.pt, edges, ext) : extendOp(T, o.pt, edges, ext);
    if (res.err) { say(res.err); continue; }
    if (isTrim) runOps('Aparar', [opDel(T)].concat(res.specs.map(opAdd)));
    else runOps('Estender', [opUpd(T, res.patch)]);
  }
}
var cmdTrim = guard(function () { return trimExtend('trim'); });
var cmdExtend = guard(function () { return trimExtend('extend'); });

function plineCorners(e, kind, a, b, name) {
  if (!e || e.type !== 'pline') { say('Selecione uma polilinha.'); return; }
  if (!editable(e)) { say('Objeto em layer bloqueada.'); return; }
  var r = cornersAll(e, kind, a, b);
  if (!r) { say('Nenhum canto pôde ser ' + (kind === 'f' ? 'concordado' : 'chanfrado') + ' (segmentos curtos, arcos ou raio zero).'); return; }
  runOps(name, [opUpd(e, { pts: r.pts })]);
  say(r.count + ' canto(s) processado(s).');
}
async function twoPick(prompt, K) {
  var o1 = await pickOne(prompt, { keywords: K });
  return o1;
}
var cmdFillet = guard(async function () {
  var st = S.settings, multi = false, K = ['Raio', 'Aparar', 'Polilinha', 'Múltiplo'];
  for (;;) {
    var o1 = await twoPick('FILLET (raio=' + fmt(st.filletR) + ', aparar=' + (st.filletTrim ? 'Sim' : 'Não') + ') Primeiro objeto ou [Raio/Aparar/Polilinha/Múltiplo]', K);
    if (!o1) return;
    if (o1.kw === 'Raio') { var v = await askNum('Raio de concordância <' + fmt(st.filletR) + '>', { default: st.filletR }); if (v !== null && v >= 0) st.filletR = v; continue; }
    if (o1.kw === 'Aparar') { st.filletTrim = await askYN('Modo de aparar [Sim/Não]', st.filletTrim); continue; }
    if (o1.kw === 'Múltiplo') { multi = true; continue; }
    if (o1.kw === 'Polilinha') {
      var pp = await pickOne('Selecione a polilinha 2D', { needPt: false });
      if (pp && pp.id !== undefined) plineCorners(getEnt(pp.id), 'f', st.filletR, 0, 'Concordar polilinha');
      if (!multi) return; continue;
    }
    var o2 = await pickOne('Segundo objeto', {});
    if (!o2 || o2.kw) { if (!multi) return; continue; }
    var e1 = getEnt(o1.id), e2 = getEnt(o2.id);
    if (!e1 || !e2 || !editable(e1) || !editable(e2)) say('Objeto inválido ou em layer bloqueada.');
    else if (e1.id === e2.id) {
      var sv = sameVertex(e1, o1.pt, o2.pt);
      if (!sv) say('Selecione dois segmentos adjacentes da polilinha.');
      else {
        var np = cornerVertex(e1.pts, !!e1.closed, sv.v, 'f', st.filletR, 0);
        if (!np) say('Não foi possível concordar (raio zero, arco adjacente ou raio grande demais).'); else runOps('Concordar', [opUpd(e1, { pts: np })]);
      }
    } else {
      var res = filletPair(e1, o1.pt, e2, o2.pt, st.filletR, st.filletTrim);
      if (res.err) say(res.err); else runOps('Concordar', res.ops);
    }
    if (!multi) return;
  }
});
var cmdChamfer = guard(async function () {
  var st = S.settings, multi = false, K = ['Distâncias', 'Ângulo', 'Aparar', 'Polilinha', 'Múltiplo'];
  for (;;) {
    var desc = st.chamferMethod === 'Ângulo' ? 'dist=' + fmt(st.chamferD1) + ', ângulo=' + fmt(st.chamferAng) : 'dist1=' + fmt(st.chamferD1) + ', dist2=' + fmt(st.chamferD2);
    var o1 = await twoPick('CHAMFER (' + desc + ') Primeira linha ou [Distâncias/Ângulo/Aparar/Polilinha/Múltiplo]', K);
    if (!o1) return;
    if (o1.kw === 'Distâncias') {
      var a = await askNum('Primeira distância <' + fmt(st.chamferD1) + '>', { default: st.chamferD1 }), b = a === null ? null : await askNum('Segunda distância <' + fmt(a) + '>', { default: a });
      if (a !== null && a >= 0) { st.chamferD1 = a; st.chamferD2 = (b !== null && b >= 0) ? b : a; st.chamferMethod = 'Distâncias'; }
      continue;
    }
    if (o1.kw === 'Ângulo') {
      var d1 = await askNum('Comprimento do chanfro na primeira linha <' + fmt(st.chamferD1) + '>', { default: st.chamferD1 }), an = d1 === null ? null : await askNum('Ângulo em relação à primeira linha <' + fmt(st.chamferAng) + '>', { default: st.chamferAng });
      if (d1 !== null && d1 >= 0 && an !== null && an > 0 && an < 180) { st.chamferD1 = d1; st.chamferAng = an; st.chamferMethod = 'Ângulo'; }
      continue;
    }
    if (o1.kw === 'Aparar') { st.chamferTrim = await askYN('Modo de aparar [Sim/Não]', st.chamferTrim); continue; }
    if (o1.kw === 'Múltiplo') { multi = true; continue; }
    if (o1.kw === 'Polilinha') {
      var pp = await pickOne('Selecione a polilinha 2D', { needPt: false });
      if (pp && pp.id !== undefined) {
        var pe = getEnt(pp.id);
        plineCorners(pe, 'c', st.chamferD1, st.chamferMethod === 'Ângulo' ? st.chamferD1 : st.chamferD2, 'Chanfrar polilinha');
      }
      if (!multi) return; continue;
    }
    var o2 = await pickOne('Segunda linha', {});
    if (!o2 || o2.kw) { if (!multi) return; continue; }
    var e1 = getEnt(o1.id), e2 = getEnt(o2.id);
    if (!e1 || !e2 || !editable(e1) || !editable(e2)) say('Objeto inválido ou em layer bloqueada.');
    else if (e1.id === e2.id) {
      var sv = sameVertex(e1, o1.pt, o2.pt);
      if (!sv) say('Selecione dois segmentos adjacentes da polilinha.');
      else {
        var dA = st.chamferD1, dB = st.chamferMethod === 'Ângulo' ? chamferDists(e1.pts[sv.v], e1, sv) : st.chamferD2;
        var np = cornerVertex(e1.pts, !!e1.closed, sv.v, 'c', sv.firstIsPrev ? dA : dB, sv.firstIsPrev ? dB : dA);
        if (!np) say('Não foi possível chanfrar (segmento curto, arco adjacente ou segmentos colineares).'); else runOps('Chanfrar', [opUpd(e1, { pts: np })]);
      }
    } else if (e1.type === 'line' && e2.type === 'line') {
      var dd2 = st.chamferD2;
      if (st.chamferMethod === 'Ângulo') {
        var X = lineLine(mkSeg(e1.p1, e1.p2, 0), mkSeg(e2.p1, e2.p2, 0))[0];
        if (!X) { say('As linhas são paralelas.'); if (!multi) return; continue; }
        var uA = sideDir(mkSeg(e1.p1, e1.p2, 0), X, o1.pt), uB = sideDir(mkSeg(e2.p1, e2.p2, 0), X, o2.pt);
        dd2 = angD2(st.chamferD1, st.chamferAng * D2R, Math.acos(clamp(dot(uA, uB), -1, 1)));
        if (dd2 === null) { say('Ângulo de chanfro inválido para estas linhas.'); if (!multi) return; continue; }
      }
      var res = chamferPair(e1, o1.pt, e2, o2.pt, st.chamferD1, dd2, st.chamferTrim);
      if (res.err) say(res.err); else runOps('Chanfrar', res.ops);
    } else say('Chanfro: use linhas ou segmentos retos de uma polilinha.');
    if (!multi) return;
  }
});
function angD2(d1, al, phi) { var s = Math.sin(phi + al); return (s > 1e-9 && al > 0) ? d1 * Math.sin(al) / s : null; }
function chamferDists(V, e, sv) { // método Ângulo em polilinha: d2 a partir de d1/ângulo
  if (!e || !sv) return 0;
  var n = e.pts.length, A = e.pts[(sv.v - 1 + n) % n], B = e.pts[(sv.v + 1) % n];
  var phi = Math.acos(clamp(dot(unit(V, A), unit(V, B)), -1, 1));
  var r = angD2(S.settings.chamferD1, S.settings.chamferAng * D2R, phi);
  return r === null ? S.settings.chamferD1 : r;
}
var cmdJoin = guard(async function () {
  var ents = await pickSet('JOIN Selecione objetos a unir');
  if (!ents.length) return;
  var r = joinEnts(ents);
  if (r.err) { say(r.err); return; }
  var ops = r.remove.map(function (id) { return opDel(getEnt(id)); }).filter(function (o) { return o.spec; });
  ops.push(opAdd(r.spec));
  runOps('Unir', ops);
  say(r.used + ' objeto(s) unido(s).' + (r.left ? ' ' + r.left + ' não pôde(ram) ser unido(s).' : ''));
});
var cmdExplode = guard(async function () {
  var ents = await pickSet('EXPLODE Selecione objetos'), ops = [], skipped = 0, n = 0;
  if (!ents.length) return;
  ents.forEach(function (e) {
    var parts = explodeEnt(e);
    if (!parts || !parts.length) { skipped++; return; }
    ops.push(opDel(e));
    parts.forEach(function (s) { ops.push(opAdd(s)); });
    n++;
  });
  if (skipped) say(skipped + ' objeto(s) não podem ser explodidos.');
  runOps('Explodir', ops);
  if (n) selClear();
});

/* ---------- registro de comandos, menus e toolbar ---------- */
function regCmds() {
  if (!CAD.cmd || !CAD.cmd.register) return;
  [
    { name: 'ERASE', alias: ['E', 'DEL'], run: cmdErase }, { name: 'MOVE', alias: ['M'], run: cmdMove },
    { name: 'COPY', alias: ['CO', 'CP'], run: cmdCopy }, { name: 'ROTATE', alias: ['RO'], run: cmdRotate },
    { name: 'MIRROR', alias: ['MI'], run: cmdMirror }, { name: 'SCALE', alias: ['SC'], run: cmdScale },
    { name: 'STRETCH', alias: ['S'], run: cmdStretch }, { name: 'OFFSET', alias: ['O'], run: cmdOffset },
    { name: 'TRIM', alias: ['TR'], run: cmdTrim }, { name: 'EXTEND', alias: ['EX'], run: cmdExtend },
    { name: 'FILLET', alias: ['F'], run: cmdFillet }, { name: 'CHAMFER', alias: ['CHA'], run: cmdChamfer },
    { name: 'JOIN', alias: ['J'], run: cmdJoin }, { name: 'EXPLODE', alias: ['X'], run: cmdExplode }
  ].forEach(function (c) { CAD.cmd.register(c); });
}
function regUI() {
  var items = [['Apagar', 'ERASE', '✕'], ['Mover', 'MOVE', '✥'], ['Copiar', 'COPY', '⧉'], ['Girar', 'ROTATE', '↻'], ['Espelhar', 'MIRROR', '⇋'],
    ['Escala', 'SCALE', '⤢'], ['Esticar', 'STRETCH', '⇹'], ['Deslocar', 'OFFSET', '≡'], ['Aparar', 'TRIM', '✂'], ['Estender', 'EXTEND', '⇥'],
    ['Concordar', 'FILLET', '◟'], ['Chanfrar', 'CHAMFER', '◿'], ['Unir', 'JOIN', '⌒'], ['Explodir', 'EXPLODE', '✸']];
  items.forEach(function (it) {
    try { if (CAD.ui && CAD.ui.menu && CAD.ui.menu.add) CAD.ui.menu.add('Modificar', it[0], it[1]); } catch (x) { /* degrada */ }
    try { if (CAD.ui && CAD.ui.toolbar && CAD.ui.toolbar.add) CAD.ui.toolbar.add('Modificar', { icone: it[2], rotulo: it[0], cmd: it[1] }); } catch (x) { /* degrada */ }
  });
}
regCmds(); regUI();

/* exportações auxiliares */
S.cmds = { ERASE: cmdErase, MOVE: cmdMove, COPY: cmdCopy, ROTATE: cmdRotate, MIRROR: cmdMirror, SCALE: cmdScale, STRETCH: cmdStretch, OFFSET: cmdOffset, TRIM: cmdTrim, EXTEND: cmdExtend, FILLET: cmdFillet, CHAMFER: cmdChamfer, JOIN: cmdJoin, EXPLODE: cmdExplode };
S.core = { toPath: toPath, subPath: subPath, segInt: segInt, trimOp: trimOp, extendOp: extendOp, offsetEnt: offsetEnt, offsetPath: offsetPath, filletPair: filletPair, chamferPair: chamferPair, cornerVertex: cornerVertex, joinEnts: joinEnts, stretchPatch: stretchPatch, explodeEnt: explodeEnt, matrix: { trans: mTrans, rot: mRot, scale: mScale, mirror: mMirror } };
S._setEnv = function (e) { env = e; };

/* ---------- testes ---------- */
CAD.tests = CAD.tests || {};
CAD.tests.p6 = async function () {
  var ok = 0, bad = 0;
  function A(c, m) { if (c) ok++; else { bad++; console.error('FALHA P6:', m); } }
  function near(a, b, t, m) { A(Math.abs(a - b) <= (t || 1e-6), m + ' (' + a + ' ≠ ' + b + ')'); }
  var C = S.core, p = function (x, y) { return P(x, y); };
  function area(pts, closed) { // área com bulge (shoelace + segmentos circulares)
    var n = pts.length, s = 0, i, cnt = closed ? n : n - 1;
    for (i = 0; i < cnt; i++) {
      var a = pts[i], b = pts[(i + 1) % n], bu = num(a.bulge, 0); s += (a.x * b.y - b.x * a.y) / 2;
      if (Math.abs(bu) > 1e-12) { var th = 4 * Math.atan(bu), r = dist(a, b) / (2 * Math.sin(Math.abs(th) / 2)); s += (bu > 0 ? 1 : -1) * r * r / 2 * (Math.abs(th) - Math.sin(Math.abs(th))); }
    }
    return Math.abs(s);
  }
  // ---- matrizes
  var q1 = mTrans(2, 3).apply(p(1, 1)); near(q1.x, 3, 1e-12, 'translação x'); near(q1.y, 4, 1e-12, 'translação y');
  q1 = mRot(p(1, 1), PI / 2).apply(p(2, 1)); near(q1.x, 1, 1e-12, 'rotação x'); near(q1.y, 2, 1e-12, 'rotação y');
  q1 = mScale(p(1, 1), 2).apply(p(2, 3)); near(q1.x, 3, 1e-12, 'escala x'); near(q1.y, 5, 1e-12, 'escala y');
  q1 = mMirror(p(0, 0), p(1, 1)).apply(p(2, 0)); near(q1.x, 0, 1e-12, 'espelho diagonal x'); near(q1.y, 2, 1e-12, 'espelho diagonal y');
  q1 = mMirror(p(0, 1), p(5, 1)).apply(p(3, 4)); near(q1.x, 3, 1e-12, 'espelho horizontal x'); near(q1.y, -2, 1e-12, 'espelho horizontal y');
  A(xfLocal({ type: 'circle', c: p(0, 0), r: 2 }, mScale(p(0, 0), 3)).r === 6, 'transform local círculo');
  var xa = xfLocal({ type: 'arc', c: p(0, 0), r: 1, a1: 0, a2: 90 }, mMirror(p(0, 0), p(1, 0))); near(xa.a1, 270, 1e-9, 'arco espelhado a1'); near(xa.a2, 0, 1e-9, 'arco espelhado a2');
  // ---- interseções
  var sA = mkSeg(p(0, 0), p(10, 0), 0), sB = mkSeg(p(5, -5), p(5, 5), 0);
  near(segInt(sA, sB)[0].x, 5, 1e-12, 'reta x reta'); A(segInt(sA, mkSeg(p(0, 1), p(10, 1), 0)).length === 0, 'retas paralelas');
  var ci = mkCirc(p(0, 0), 5), li = segInt(mkSeg(p(-10, 0), p(10, 0), 0), ci); A(li.length === 2, 'reta x círculo: 2 pontos'); near(Math.abs(li[0].x), 5, 1e-9, 'reta x círculo: x');
  A(segInt(mkSeg(p(-10, 5), p(10, 5), 0), ci).length === 1, 'reta tangente = 1 ponto');
  var cc = segInt(mkCirc(p(0, 0), 5), mkCirc(p(6, 0), 5)); A(cc.length === 2, 'círculo x círculo'); near(cc[0].x, 3, 1e-9, 'círculo x círculo x');
  // ---- TRIM
  var L0 = { id: 1, type: 'line', layer: '0', p1: p(0, 0), p2: p(10, 0) }, Ve = { id: 2, type: 'line', layer: '0', p1: p(5, -1), p2: p(5, 1) };
  var tr = C.trimOp(L0, p(8, 0), [Ve], false); A(tr.specs.length === 1 && tr.specs[0].type === 'line', 'trim linha: 1 trecho'); near(tr.specs[0].p2.x, 5, 1e-9, 'trim linha: corte em 5'); near(tr.specs[0].p1.x, 0, 1e-9, 'trim linha: mantém início');
  var Ve2 = { id: 3, type: 'line', layer: '0', p1: p(7, -1), p2: p(7, 1) };
  tr = C.trimOp(L0, p(6, 0), [Ve, Ve2], false); A(tr.specs.length === 2, 'trim linha: meio gera 2 trechos'); near(tr.specs[0].p2.x, 5, 1e-9, 'trim meio: 1º até 5'); near(tr.specs[1].p1.x, 7, 1e-9, 'trim meio: 2º de 7');
  A(!!C.trimOp(L0, p(6, 0), [{ id: 9, type: 'line', p1: p(20, -1), p2: p(20, 1) }], false).err, 'trim: sem interseção = erro');
  A(!!C.trimOp(L0, p(8, 0), [{ id: 9, type: 'line', p1: p(12, -1), p2: p(12, 1) }], false).err, 'trim: aresta fora do segmento = erro');
  var Sh = { id: 9, type: 'line', p1: p(5, 2), p2: p(5, 5) };
  A(!!C.trimOp(L0, p(8, 0), [Sh], false).err, 'trim: aresta curta não alcança o objeto'); tr = C.trimOp(L0, p(8, 0), [Sh], true); A(!tr.err && Math.abs(tr.specs[0].p2.x - 5) < 1e-9, 'trim: modo Estender prolonga a aresta até o objeto');
  var Ci = { id: 4, type: 'circle', layer: '0', c: p(0, 0), r: 5 }, Vx = { id: 5, type: 'line', layer: '0', p1: p(3, -10), p2: p(3, 10) };
  tr = C.trimOp(Ci, p(5, 0), [Vx], false); A(tr.specs.length === 1 && tr.specs[0].type === 'arc', 'trim círculo → arco');
  near(tr.specs[0].a1, Math.atan2(4, 3) * R2D, 1e-6, 'trim círculo a1'); near(tr.specs[0].a2, 360 - Math.atan2(4, 3) * R2D, 1e-6, 'trim círculo a2');
  A(!!C.trimOp(Ci, p(5, 0), [{ id: 6, type: 'line', p1: p(3, 0), p2: p(3, 10) }], false).err, 'trim círculo com 1 só corte = erro');
  var Ar = { id: 7, type: 'arc', layer: '0', c: p(0, 0), r: 5, a1: 0, a2: 180 };
  tr = C.trimOp(Ar, p(0, 5), [{ id: 8, type: 'line', p1: p(-10, 3), p2: p(10, 3) }], false); A(tr.specs.length === 2 && tr.specs[0].type === 'arc', 'trim arco no meio: 2 arcos');
  var Pl = { id: 10, type: 'pline', layer: '0', closed: false, pts: [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: 10, bulge: 0 }] };
  tr = C.trimOp(Pl, p(10, 8), [{ id: 11, type: 'line', p1: p(9, 5), p2: p(11, 5) }], false); A(tr.specs.length === 1 && tr.specs[0].type === 'pline' && tr.specs[0].pts.length === 3, 'trim pline: mantém 2 segmentos'); near(tr.specs[0].pts[2].y, 5, 1e-9, 'trim pline: ponta em y=5');
  var Rc = { id: 12, type: 'pline', layer: '0', closed: true, pts: [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: 10, bulge: 0 }, { x: 0, y: 10, bulge: 0 }] };
  tr = C.trimOp(Rc, p(10, 5), [{ id: 13, type: 'line', p1: p(5, -5), p2: p(5, 15) }, { id: 14, type: 'line', p1: p(-5, 3), p2: p(15, 3) }], false);
  A(tr.specs.length === 1 && !tr.specs[0].closed, 'trim pline fechada → uma pline aberta'); near(ptsLen(tr.specs[0].pts), 28, 1e-9, 'trim pline fechada: perímetro restante (40 − 12)');
  // ---- EXTEND
  var ex = C.extendOp({ id: 20, type: 'line', p1: p(0, 0), p2: p(4, 0) }, p(3, 0), [{ id: 21, type: 'line', p1: p(10, -5), p2: p(10, 5) }], false);
  near(ex.patch.p2.x, 10, 1e-9, 'extend linha: fim'); near(ex.patch.p1.x, 0, 1e-9, 'extend linha: início mantido');
  ex = C.extendOp({ id: 20, type: 'line', p1: p(0, 0), p2: p(4, 0) }, p(1, 0), [{ id: 21, type: 'line', p1: p(-3, -5), p2: p(-3, 5) }], false); near(ex.patch.p1.x, -3, 1e-9, 'extend linha: início');
  A(!!C.extendOp({ id: 20, type: 'line', p1: p(0, 0), p2: p(4, 0) }, p(3, 0), [{ id: 21, type: 'line', p1: p(-3, -5), p2: p(-3, 5) }], false).err, 'extend: aresta atrás = erro');
  ex = C.extendOp({ id: 22, type: 'arc', c: p(0, 0), r: 5, a1: 0, a2: 45 }, p(3.5, 3.5), [{ id: 23, type: 'line', p1: p(-10, 0), p2: p(10, 0) }, { id: 24, type: 'line', p1: p(0, 3), p2: p(0, 8) }], false);
  A(!ex.err, 'extend arco'); near(ex.patch.a2, 90, 1e-6, 'extend arco a2 até x=0');
  ex = C.extendOp({ id: 20, type: 'line', p1: p(0, 0), p2: p(4, 0) }, p(3, 0), [{ id: 25, type: 'line', p1: p(10, 2), p2: p(10, 8) }], false); A(!!ex.err, 'extend: aresta curta fora = erro');
  ex = C.extendOp({ id: 20, type: 'line', p1: p(0, 0), p2: p(4, 0) }, p(3, 0), [{ id: 25, type: 'line', p1: p(10, 2), p2: p(10, 8) }], true); A(!ex.err && Math.abs(ex.patch.p2.x - 10) < 1e-9, 'extend: modo Estender prolonga a aresta');
  // ---- OFFSET
  var of = C.offsetEnt({ id: 30, type: 'line', layer: 'A', p1: p(0, 0), p2: p(10, 0) }, 2, p(5, 5)); near(of.spec.p1.y, 2, 1e-9, 'offset linha acima'); A(of.spec.layer === 'A', 'offset herda layer');
  of = C.offsetEnt({ id: 30, type: 'line', p1: p(0, 0), p2: p(10, 0) }, 2, p(5, -1)); near(of.spec.p1.y, -2, 1e-9, 'offset linha abaixo');
  of = C.offsetEnt(Ci, 2, p(10, 0)); near(of.spec.r, 7, 1e-9, 'offset círculo fora'); of = C.offsetEnt(Ci, 2, p(1, 0)); near(of.spec.r, 3, 1e-9, 'offset círculo dentro'); A(!!C.offsetEnt(Ci, 6, p(1, 0)).err, 'offset círculo colapsa');
  of = C.offsetEnt(Ar, 1, p(0, 0)); near(of.spec.r, 4, 1e-9, 'offset arco'); near(of.spec.a2, 180, 1e-9, 'offset arco mantém ângulos');
  of = C.offsetEnt(Rc, 1, p(5, 5)); A(of.spec.closed && of.spec.pts.length === 4, 'offset retângulo interno: 4 vértices'); near(area(of.spec.pts, true), 64, 1e-9, 'offset retângulo interno: área 8x8');
  of = C.offsetEnt(Rc, 1, p(-5, 5)); near(area(of.spec.pts, true), 144, 1e-9, 'offset retângulo externo: área 12x12 (cantos vivos)');
  of = C.offsetEnt(Rc, 6, p(5, 5)); A(!!of.err, 'offset interno grande demais colapsa');
  of = C.offsetEnt(Pl, 1, p(5, 5)); A(!of.err && of.spec.pts.length === 3, 'offset pline aberta'); near(of.spec.pts[1].x, 9, 1e-9, 'offset pline aberta: canto x'); near(of.spec.pts[1].y, 1, 1e-9, 'offset pline aberta: canto y'); near(of.spec.pts[0].y, 1, 1e-9, 'offset pline: início');
  var Pb = { id: 31, type: 'pline', layer: '0', closed: true, pts: [{ x: 0, y: 0, bulge: 1 }, { x: 4, y: 0, bulge: 0 }] }; // “D” (semicírculo + corda)
  of = C.offsetEnt(Pb, 0.5, p(2, -0.5)); A(!of.err, 'offset pline com arco (para dentro)'); if (!of.err) near(area(of.spec.pts, true), 2.25 * Math.acos(1 / 3) - 0.5 * Math.sqrt(2), 1e-6, 'offset pline arco: área do segmento circular');
  of = C.offsetEnt({ type: 'ellipse', c: p(0, 0), major: p(2, 0), ratio: 0.5 }, 1, p(0, 0)); A(!!of.err, 'offset elipse: sem suporte, sem exceção');
  // ---- FILLET
  var F1 = { id: 40, type: 'line', layer: '0', p1: p(0, 0), p2: p(10, 0) }, F2 = { id: 41, type: 'line', layer: '0', p1: p(0, 0), p2: p(0, 10) };
  var fr = C.filletPair(F1, p(8, 0), F2, p(0, 8), 2, true), arcOp = fr.ops.filter(function (o) { return o.t === 'add'; })[0].spec;
  A(arcOp.type === 'arc', 'fillet cria arco'); near(arcOp.r, 2, 1e-9, 'fillet raio'); near(arcOp.c.x, 2, 1e-9, 'fillet centro x'); near(arcOp.c.y, 2, 1e-9, 'fillet centro y');
  near(arcOp.a1, 180, 1e-6, 'fillet a1'); near(arcOp.a2, 270, 1e-6, 'fillet a2');
  var u1 = fr.ops.filter(function (o) { return o.t === 'upd' && o.id === 40; })[0], u2 = fr.ops.filter(function (o) { return o.t === 'upd' && o.id === 41; })[0];
  near(u1.patch.p1.x, 2, 1e-9, 'fillet apara linha 1 em x=2'); near(u2.patch.p1.y, 2, 1e-9, 'fillet apara linha 2 em y=2');
  fr = C.filletPair(F1, p(8, 0), F2, p(0, 8), 0, true); A(fr.ops.length === 2 && fr.ops.every(function (o) { return o.t === 'upd'; }), 'fillet raio 0: só ajusta'); near(fr.ops[0].patch.p1.x, 0, 1e-9, 'fillet raio 0: canto');
  var G1 = { id: 42, type: 'line', layer: '0', p1: p(2, 0), p2: p(10, 0) }, G2 = { id: 43, type: 'line', layer: '0', p1: p(0, 2), p2: p(0, 10) };
  fr = C.filletPair(G1, p(8, 0), G2, p(0, 8), 0, true); near(fr.ops[0].patch.p1.x, 0, 1e-9, 'fillet raio 0 estende linha curta ao canto');
  fr = C.filletPair(G1, p(8, 0), G2, p(0, 8), 1, true); near(fr.ops.filter(function (o) { return o.t === 'upd' && o.id === 42; })[0].patch.p1.x, 1, 1e-9, 'fillet r=1 apara/estende em x=1');
  A(!!C.filletPair({ id: 1, type: 'line', p1: p(0, 0), p2: p(10, 0) }, p(8, 0), { id: 2, type: 'line', p1: p(0, 1), p2: p(10, 1) }, p(8, 1), 0, true).err, 'fillet paralelas raio 0 = erro');
  fr = C.filletPair({ id: 50, type: 'line', layer: '0', p1: p(0, 0), p2: p(10, 0) }, p(8, 0), { id: 51, type: 'line', layer: '0', p1: p(0, 0), p2: p(0, 1) }, p(0, 0.9), 2, true); A(!!fr.err, 'fillet raio grande demais');
  fr = C.filletPair(F1, p(8, 0), F2, p(0, 8), 2, false); A(fr.ops.length === 1 && fr.ops[0].t === 'add', 'fillet sem aparar só adiciona arco');
  var Fc = { id: 52, type: 'circle', layer: '0', c: p(0, 3), r: 2 };
  fr = C.filletPair(F1, p(8, 0), Fc, p(1.5, 1.6), 1, true); A(!fr.err, 'fillet linha x círculo'); if (!fr.err) { var ac = fr.ops.filter(function (o) { return o.t === 'add'; })[0].spec; near(ac.c.y, 1, 1e-9, 'fillet linha x círculo: centro a r da linha'); near(ac.c.x, Math.sqrt(5), 1e-9, 'fillet linha x círculo: centro do lado do clique'); near(dist(ac.c, p(0, 3)), 3, 1e-9, 'fillet linha x círculo: tangente externo (r+rf)'); A(!fr.ops.some(function (o) { return o.id === 52; }), 'fillet não altera círculo'); }
  var Fa = { id: 53, type: 'arc', layer: '0', c: p(0, 0), r: 5, a1: 0, a2: 90 };
  fr = C.filletPair(Fa, p(4.9, 1), { id: 54, type: 'line', layer: '0', p1: p(-10, 0), p2: p(10, 0) }, p(8, 0), 0, true); A(!fr.err, 'fillet arco x linha raio 0');
  // pline: cantos
  var sq = { id: 60, type: 'pline', layer: '0', closed: true, pts: [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: 10, bulge: 0 }, { x: 0, y: 10, bulge: 0 }] };
  var ca = cornersAll(sq, 'f', 2); A(ca && ca.count === 4 && ca.pts.length === 8, 'pline: 4 cantos concordados'); near(area(ca.pts, true), 100 - (4 - PI) * 4, 1e-9, 'pline concordada: área');
  var cb = cornersAll(sq, 'c', 1, 1); near(area(cb.pts, true), 100 - 4 * 0.5, 1e-9, 'pline chanfrada: área'); A(cb.pts.length === 8, 'pline chanfrada: 8 vértices');
  A(cornerVertex(sq.pts, true, 0, 'f', 11) === null && cornerVertex(sq.pts, true, 0, 'f', 6) !== null, 'pline: raio maior que o segmento recusado');
  var open3 = { id: 61, type: 'pline', layer: '0', closed: false, pts: [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: 10, bulge: 0 }] };
  A(cornerVertex(open3.pts, false, 0, 'f', 1) === null && cornerVertex(open3.pts, false, 1, 'f', 1) !== null, 'pline aberta: só cantos internos');
  var ov = cornerVertex(open3.pts, false, 1, 'f', 2); A(ov[1].bulge > 0, 'pline: curva à esquerda gera bulge positivo'); A(cornerVertex([{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: -10, bulge: 0 }], false, 1, 'f', 2)[1].bulge < 0, 'pline: curva à direita gera bulge negativo');
  // ---- CHAMFER
  var ch = C.chamferPair(F1, p(8, 0), F2, p(0, 8), 2, 3, true), nl = ch.ops.filter(function (o) { return o.t === 'add'; })[0].spec;
  A(nl.type === 'line', 'chanfro cria linha'); near(nl.p1.x, 2, 1e-9, 'chanfro T1 x'); near(nl.p2.y, 3, 1e-9, 'chanfro T2 y');
  A(!!C.chamferPair(F1, p(8, 0), F2, p(0, 8), 20, 1, true).err, 'chanfro distância grande demais');
  A(angD2(2, PI / 4, PI / 2) !== null && Math.abs(angD2(2, PI / 4, PI / 2) - 2) < 1e-9, 'chanfro por ângulo: 45° em canto reto → d2 = d1');
  // ---- JOIN
  var jn = C.joinEnts([{ id: 70, type: 'line', layer: 'X', p1: p(0, 0), p2: p(5, 0) }, { id: 71, type: 'line', layer: 'X', p1: p(8, 0), p2: p(20, 0) }]);
  A(jn.spec.type === 'line' && jn.spec.p1.x === 0 && jn.spec.p2.x === 20, 'join: linhas colineares (com vão) → linha');
  jn = C.joinEnts([{ id: 72, type: 'line', layer: 'X', p1: p(0, 0), p2: p(5, 0) }, { id: 73, type: 'line', layer: 'X', p1: p(5, 5), p2: p(5, 0) }, { id: 74, type: 'line', layer: 'X', p1: p(5, 5), p2: p(0, 5) }]);
  A(jn.spec.type === 'pline' && jn.spec.pts.length === 4 && !jn.spec.closed, 'join: 3 linhas encadeadas (sentidos mistos) → pline'); A(jn.remove.length === 3, 'join: remove origens');
  jn = C.joinEnts([{ id: 75, type: 'line', layer: 'X', p1: p(0, 0), p2: p(5, 0) }, { id: 76, type: 'line', layer: 'X', p1: p(5, 0), p2: p(5, 5) }, { id: 77, type: 'line', layer: 'X', p1: p(5, 5), p2: p(0, 0) }]);
  A(jn.spec.closed && jn.spec.pts.length === 3, 'join: triângulo → pline fechada');
  jn = C.joinEnts([{ id: 78, type: 'arc', layer: 'X', c: p(0, 0), r: 1, a1: 0, a2: 180 }, { id: 79, type: 'arc', layer: 'X', c: p(0, 0), r: 1, a1: 180, a2: 0 }]);
  A(jn.spec.type === 'circle' && jn.spec.r === 1, 'join: dois semicírculos → círculo');
  jn = C.joinEnts([{ id: 80, type: 'arc', layer: 'X', c: p(0, 0), r: 1, a1: 0, a2: 90 }, { id: 81, type: 'arc', layer: 'X', c: p(0, 0), r: 1, a1: 90, a2: 200 }]);
  A(jn.spec.type === 'arc' && Math.abs(jn.spec.a1) < 1e-6 && Math.abs(jn.spec.a2 - 200) < 1e-6, 'join: arcos contíguos → arco');
  jn = C.joinEnts([{ id: 82, type: 'arc', layer: 'X', c: p(0, 0), r: 1, a1: 0, a2: 90 }, { id: 83, type: 'line', layer: 'X', p1: p(0, 1), p2: p(-3, 1) }]);
  A(jn.spec.type === 'pline' && jn.spec.pts.length === 3 && jn.spec.pts[0].bulge > 0 && Math.abs(jn.spec.pts[0].bulge - Math.tan(PI / 8)) < 1e-9, 'join: arco + linha → pline com bulge');
  A(!!C.joinEnts([{ id: 84, type: 'line', p1: p(0, 0), p2: p(1, 0) }, { id: 85, type: 'line', p1: p(5, 5), p2: p(6, 6) }]).err, 'join: sem extremidades coincidentes = erro');
  A(!!C.joinEnts([sq, sq]).err, 'join: pline fechada não é unida');
  // ---- STRETCH
  var win = winOf(p(8, -1), p(12, 11));
  var sl = stretchPatch({ type: 'line', p1: p(0, 0), p2: p(10, 0) }, win, p(5, 0)); near(sl.p2.x, 15, 1e-9, 'stretch linha: ponta dentro move'); near(sl.p1.x, 0, 1e-9, 'stretch linha: outra ponta fica');
  A(stretchPatch({ type: 'line', p1: p(0, 0), p2: p(5, 0) }, win, p(5, 0)) === null, 'stretch linha fora da janela: nada');
  var sp2 = stretchPatch(sq, win, p(5, 0)); near(sp2.pts[0].x, 0, 1e-9, 'stretch pline: vértice fora fica'); near(sp2.pts[1].x, 15, 1e-9, 'stretch pline: vértice dentro move'); near(sp2.pts[2].x, 15, 1e-9, 'stretch pline: 2º vértice dentro move'); near(sp2.pts[3].x, 0, 1e-9, 'stretch pline: último fica');
  var sw2 = stretchPatch({ type: 'circle', c: p(10, 5), r: 1 }, winOf(p(0, 0), p(20, 20)), p(3, 3)); near(sw2.c.x, 13, 1e-9, 'stretch: objeto inteiro na janela só move');
  var sa = stretchPatch({ type: 'arc', c: p(0, 0), r: 5, a1: 0, a2: 180 }, winOf(p(4, -1), p(6, 1)), p(0, 1)); A(sa && sa.r > 0, 'stretch arco: ponta dentro recalcula arco');
  // ---- EXPLODE local
  var xe = explodeLocal(Pb); A(xe.length === 2 && xe[0].type === 'arc' && xe[1].type === 'line', 'explode local: arco + linha'); near(xe[0].r, 2, 1e-9, 'explode: raio do arco');
  A(explodeEnt({ type: 'line', p1: p(0, 0), p2: p(1, 1) }) === null, 'explode: linha não explode');
  // ---- comandos (com Engine simulado)
  function mkEnv(script, init, extra) {
    var store = (init || []).map(function (e) { return clone(e); }), nid = 100, stack = [], q = script.slice(), msgs = [], pre = [];
    function idx(id) { for (var i = 0; i < store.length; i++) if (store[i].id === id) return i; return -1; }
    function nxt() { if (!q.length) return null; var v = q.shift(); return typeof v === 'function' ? v() : v; }
    var E = {
      store: store, msgs: msgs, stack: stack, pre: pre,
      ents: {
        add: function (s) { s = clone(s); if (s.id === undefined) s.id = nid++; store.push(s); return s.id; },
        remove: function (id) { var i = idx(id); if (i >= 0) store.splice(i, 1); },
        update: function (id, pa) { var e = store[idx(id)], k; if (!e) return; for (k in pa) { if (pa[k] === undefined) delete e[k]; else e[k] = clone(pa[k]); } },
        get: function (id) { var i = idx(id); return i >= 0 ? store[i] : null; },
        query: function () { return store.slice(); }
      },
      history: { run: function (o) { o.do(); stack.push(o); }, undo: function () { var o = stack.pop(); if (o) o.undo(); } },
      sel: { ids: function () { return pre.slice(); }, clear: function () { pre.length = 0; } },
      input: { point: async function () { return nxt(); }, select: async function () { return nxt(); }, keyword: async function () { return nxt(); }, number: async function () { return nxt(); }, angle: async function () { return nxt(); } },
      print: function (m) { msgs.push(m); }, layers: [{ name: '0' }, { name: 'LOCK', locked: true }, { name: 'OFF', on: false }]
    };
    Object.assign(E, extra || {});
    return E;
  }
  async function run(name, script, init, extra) {
    var E = mkEnv(script, init, extra);
    env = E;
    try { await S.cmds[name](); } finally { env = null; }
    return E;
  }
  var ln = function (id, x1, y1, x2, y2, ly) { return { id: id, type: 'line', layer: ly || '0', color: null, lw: null, ltype: null, space: 'model', p1: p(x1, y1), p2: p(x2, y2) }; };
  var E1;
  E1 = await run('MOVE', [[1, 2], p(0, 0), p(5, 3)], [ln(1, 0, 0, 10, 0), ln(2, 0, 5, 10, 5), ln(3, 0, 9, 1, 9)]);
  A(E1.store[0].p1.x === 5 && E1.store[0].p1.y === 3 && E1.store[1].p2.x === 15 && E1.store[2].p1.x === 0, 'MOVE: move só os selecionados');
  E1.history.undo(); A(E1.store[0].p1.x === 0 && E1.store[1].p2.x === 10, 'MOVE: undo restaura (um passo)');
  E1 = await run('MOVE', [p(0, 0), p(5, 3)], [ln(1, 0, 0, 10, 0)], { sel: { ids: function () { return [1]; }, clear: function () { } } }); A(E1.store[0].p1.x === 5, 'MOVE: usa pré-seleção sem pedir objetos');
  E1 = await run('MOVE', [[1], 'Deslocamento', p(2, 2)], [ln(1, 0, 0, 10, 0)]); A(E1.store[0].p1.x === 2 && E1.store[0].p1.y === 2, 'MOVE: Deslocamento');
  E1 = await run('MOVE', [[1, 2, 3], p(0, 0), p(1, 1)], [ln(1, 0, 0, 1, 0, 'LOCK'), ln(2, 0, 0, 1, 0, 'OFF'), ln(3, 0, 0, 1, 0)]);
  A(E1.store[0].p1.x === 0 && E1.store[1].p1.x === 0 && E1.store[2].p1.x === 1 && E1.msgs.length === 1, 'MOVE: ignora layer bloqueada/desligada e avisa');
  E1 = await run('COPY', [[1], p(0, 0), p(5, 0), p(10, 0), null], [ln(1, 0, 0, 1, 0)]); A(E1.store.length === 3 && E1.store[1].p1.x === 5 && E1.store[2].p1.x === 10, 'COPY: múltiplas cópias');
  E1 = await run('COPY', [[1], p(0, 0), p(5, 0), p(10, 0), 'Desfazer', null], [ln(1, 0, 0, 1, 0)]); A(E1.store.length === 2, 'COPY: Desfazer remove a última cópia');
  A(E1.store.every(function (e) { return e.layer === '0' && e.id !== undefined; }), 'COPY: cópias herdam layer');
  E1 = await run('COPY', [[1], 'Deslocamento', p(1, 1)], [ln(1, 0, 0, 1, 0)]); A(E1.store.length === 2 && E1.store[1].p1.y === 1, 'COPY: Deslocamento');
  E1 = await run('ROTATE', [[1], p(0, 0), 90], [ln(1, 1, 0, 2, 0)]); near(E1.store[0].p1.x, 0, 1e-9, 'ROTATE: ângulo digitado x'); near(E1.store[0].p1.y, 1, 1e-9, 'ROTATE: ângulo digitado y');
  E1 = await run('ROTATE', [[1], p(0, 0), p(0, 5)], [ln(1, 1, 0, 2, 0)]); near(E1.store[0].p2.y, 2, 1e-9, 'ROTATE: ângulo por ponto (90°)');
  E1 = await run('ROTATE', [[1], p(0, 0), 'Copiar', 90], [ln(1, 1, 0, 2, 0)]); A(E1.store.length === 2 && E1.store[0].p1.x === 1, 'ROTATE: Copiar mantém original');
  E1 = await run('ROTATE', [[1], p(0, 0), 'Referência', 30, 120], [ln(1, 1, 0, 2, 0)]); near(Math.atan2(E1.store[0].p2.y, E1.store[0].p2.x) * R2D, 90, 1e-9, 'ROTATE: Referência (30→120 = +90°)');
  E1 = await run('ROTATE', [[1], p(0, 0), 90], [{ id: 1, type: 'circle', layer: '0', c: p(2, 0), r: 1 }]); near(E1.store[0].c.y, 2, 1e-9, 'ROTATE: círculo (usa transform local)');
  E1 = await run('MIRROR', [[1], p(0, 0), p(0, 10), 'Não'], [ln(1, 1, 1, 3, 2)]); A(E1.store.length === 2 && Math.abs(E1.store[1].p1.x + 1) < 1e-9 && Math.abs(E1.store[1].p2.x + 3) < 1e-9 && Math.abs(E1.store[1].p1.y - 1) < 1e-9 && E1.store[0].p1.x === 1, 'MIRROR: cópia espelhada, original fica');
  E1 = await run('MIRROR', [[1], p(0, 0), p(0, 10), 'Sim'], [ln(1, 1, 1, 3, 2)]); A(E1.store.length === 1 && Math.abs(E1.store[0].p1.x + 1) < 1e-9, 'MIRROR: apagar origem');
  E1 = await run('MIRROR', [[1], p(0, 0), p(0, 0)], [ln(1, 1, 1, 3, 2)]); A(E1.store.length === 1 && E1.msgs.length === 1, 'MIRROR: linha de espelho nula recusada');
  E1 = await run('MIRROR', [[1], p(0, 0), p(10, 0), 'Não'], [{ id: 1, type: 'pline', layer: '0', closed: false, pts: [{ x: 0, y: 1, bulge: 0.5 }, { x: 2, y: 3, bulge: 0 }] }]); near(E1.store[1].pts[0].bulge, -0.5, 1e-12, 'MIRROR: bulge troca de sinal');
  E1 = await run('SCALE', [[1], p(0, 0), 2], [ln(1, 1, 1, 3, 1)]); A(E1.store[0].p1.x === 2 && E1.store[0].p2.x === 6, 'SCALE: fator digitado');
  E1 = await run('SCALE', [[1], p(0, 0), 'Referência', 2, 5], [ln(1, 1, 1, 3, 1)]); near(E1.store[0].p2.x, 7.5, 1e-9, 'SCALE: Referência (2→5 = 2,5×)');
  E1 = await run('SCALE', [[1], p(0, 0), 0], [ln(1, 1, 1, 3, 1)]); A(E1.store[0].p2.x === 3 && E1.msgs.length === 1, 'SCALE: fator zero recusado');
  E1 = await run('SCALE', [[1], p(0, 0), 'Copiar', 2], [{ id: 1, type: 'circle', layer: '0', c: p(1, 0), r: 1 }]); A(E1.store.length === 2 && E1.store[1].r === 2 && E1.store[1].c.x === 2, 'SCALE: Copiar em círculo');
  E1 = await run('ERASE', [[1, 3]], [ln(1, 0, 0, 1, 0), ln(2, 0, 0, 1, 0), ln(3, 0, 0, 1, 0)]); A(E1.store.length === 1 && E1.store[0].id === 2, 'ERASE: apaga selecionados');
  E1.history.undo(); A(E1.store.length === 3, 'ERASE: undo restaura');
  E1 = await run('ERASE', [[1]], [ln(1, 0, 0, 1, 0, 'LOCK')]); A(E1.store.length === 1, 'ERASE: layer bloqueada protegida');
  E1 = await run('STRETCH', [p(8, -1), p(12, 1), p(0, 0), p(5, 0)], [ln(1, 0, 0, 10, 0), ln(2, 0, 5, 3, 5)]); A(E1.store[0].p2.x === 15 && E1.store[0].p1.x === 0 && E1.store[1].p2.x === 3, 'STRETCH: só o que está na janela');
  E1 = await run('EXPLODE', [[1, 2]], [{ id: 1, type: 'pline', layer: 'Z', color: 3, lw: null, ltype: null, space: 'model', closed: true, pts: [{ x: 0, y: 0, bulge: 0 }, { x: 4, y: 0, bulge: 0 }, { x: 4, y: 4, bulge: 0 }] }, ln(2, 0, 0, 1, 1)]);
  A(E1.store.length === 4 && E1.store.filter(function (e) { return e.layer === 'Z' && e.color === 3; }).length === 3, 'EXPLODE: pline vira 3 linhas com propriedades; linha ignorada'); A(E1.msgs.length === 1, 'EXPLODE: avisa objeto não explodível');
  E1.history.undo(); A(E1.store.length === 2 && E1.store.some(function (e) { return e.type === 'pline'; }), 'EXPLODE: undo restaura a pline');
  E1 = await run('JOIN', [[1, 2]], [ln(1, 0, 0, 5, 0), ln(2, 5, 0, 5, 5)]); A(E1.store.length === 1 && E1.store[0].type === 'pline' && E1.store[0].pts.length === 3, 'JOIN (comando): duas linhas → pline');
  E1.history.undo(); A(E1.store.length === 2, 'JOIN: undo restaura');
  E1 = await run('TRIM', [[2], { id: 1, pt: p(8, 0) }, null], [ln(1, 0, 0, 10, 0), ln(2, 5, -1, 5, 1)]); A(E1.store.length === 2 && E1.store.filter(function (e) { return e.id === 1; }).length === 0, 'TRIM (comando): original removido');
  var tl = E1.store.filter(function (e) { return e.type === 'line' && e.p1.y === 0; })[0]; near(tl.p2.x, 5, 1e-9, 'TRIM (comando): linha aparada em x=5');
  E1.history.undo(); A(E1.store.length === 2 && E1.store.some(function (e) { return e.id === 1 && e.p2.x === 10; }), 'TRIM: undo restaura');
  E1 = await run('TRIM', [[], { id: 1, pt: p(8, 0) }, null], [ln(1, 0, 0, 10, 0), ln(2, 5, -1, 5, 1)]); A(E1.store.some(function (e) { return e.type === 'line' && e.p1.y === 0 && Math.abs(e.p2.x - 5) < 1e-9; }), 'TRIM: Enter nas arestas = todos os objetos');
  E1 = await run('TRIM', [[2], { id: 1, pt: p(8, 0) }, null], [ln(1, 0, 0, 10, 0), ln(2, 20, -1, 20, 1)]); A(E1.store.length === 2 && E1.msgs.length === 1, 'TRIM: repetir sobre trecho sem cruzamento avisa e não quebra');
  E1 = await run('TRIM', [[2], { id: 1 , pt: p(8, 0) }, null], [ln(1, 0, 0, 10, 0, 'LOCK'), ln(2, 5, -1, 5, 1)]); A(E1.store.length === 2 && E1.msgs.length === 1, 'TRIM: alvo em layer bloqueada recusado');
  E1 = await run('EXTEND', [[2], { id: 1, pt: p(3, 0) }, null], [ln(1, 0, 0, 4, 0), ln(2, 10, -5, 10, 5)]); A(E1.store[0].p2.x === 10, 'EXTEND (comando): linha estendida');
  E1 = await run('EXTEND', [[2], { id: 1, pt: p(3, 0) }, 'Borda', 'Estender', { id: 1, pt: p(3, 0) }, null], [ln(1, 0, 0, 4, 0), ln(2, 10, 2, 10, 8)]); A(E1.store[0].p2.x === 10, 'EXTEND: Borda → Estender');
  E1 = await run('OFFSET', [3, { id: 1 }, p(5, 5), null], [ln(1, 0, 0, 10, 0)]); A(E1.store.length === 2 && E1.store[1].p1.y === 3, 'OFFSET (comando): distância e lado');
  E1 = await run('OFFSET', [3, { id: 1 }, p(5, 5), { id: 2 }, p(5, -5), null], [ln(1, 0, 0, 10, 0), ln(2, 0, 1, 10, 1)]); A(E1.store.length === 4 && E1.store[3].p1.y === -2, 'OFFSET: repete para vários objetos');
  E1 = await run('OFFSET', ['Apagar', 'Sim', 3, { id: 1 }, p(5, 5), null], [ln(1, 0, 0, 10, 0)]); A(E1.store.length === 1 && E1.store[0].p1.y === 3, 'OFFSET: Apagar origem'); S.settings.offsetErase = false;
  E1 = await run('OFFSET', ['Através', { id: 1 }, p(5, 4), null], [ln(1, 0, 0, 10, 0)]); A(E1.store.length === 2 && E1.store[1].p1.y === 4, 'OFFSET: Através');
  E1 = await run('OFFSET', [0, null], [ln(1, 0, 0, 10, 0)]); A(E1.store.length === 1 && E1.msgs.length === 1, 'OFFSET: distância zero recusada');
  E1 = await run('FILLET', [{ id: 1, pt: p(8, 0) }, { id: 2, pt: p(0, 8) }], [ln(1, 0, 0, 10, 0), ln(2, 0, 0, 0, 10)]); A(E1.store.length === 2, 'FILLET (comando): raio 0 não cria arco'); near(E1.store[0].p1.x, 0, 1e-9, 'FILLET (comando): raio 0 ajusta');
  S.settings.filletR = 0;
  E1 = await run('FILLET', ['Raio', 2, { id: 1, pt: p(8, 0) }, { id: 2, pt: p(0, 8) }], [ln(1, 0, 0, 10, 0), ln(2, 0, 0, 0, 10)]);
  A(E1.store.length === 3 && E1.store.some(function (e) { return e.type === 'arc'; }), 'FILLET (comando): Raio + dois objetos cria arco'); A(S.settings.filletR === 2, 'FILLET: raio persiste');
  E1.history.undo(); A(E1.store.length === 2 && E1.store[0].p1.x === 0, 'FILLET: undo desfaz arco e ajustes de uma vez');
  E1 = await run('FILLET', ['Polilinha', { id: 1 }], [{ id: 1, type: 'pline', layer: '0', closed: true, pts: [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: 10, bulge: 0 }, { x: 0, y: 10, bulge: 0 }] }]); A(E1.store[0].pts.length === 8, 'FILLET: opção Polilinha');
  E1 = await run('FILLET', [{ id: 1, pt: p(8, 0) }, { id: 1, pt: p(10, 8) }], [{ id: 1, type: 'pline', layer: '0', closed: false, pts: [{ x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 }, { x: 10, y: 10, bulge: 0 }] }]); A(E1.store[0].pts.length === 4 && E1.store[0].pts[1].bulge !== 0, 'FILLET: dois segmentos adjacentes da mesma pline');
  S.settings.filletR = 0;
  S.settings.chamferD1 = S.settings.chamferD2 = 0; S.settings.chamferMethod = 'Distâncias';
  E1 = await run('CHAMFER', ['Distâncias', 2, 3, { id: 1, pt: p(8, 0) }, { id: 2, pt: p(0, 8) }], [ln(1, 0, 0, 10, 0), ln(2, 0, 0, 0, 10)]);
  A(E1.store.length === 3 && E1.store[2].p1.x === 2 && E1.store[2].p2.y === 3, 'CHAMFER (comando): distâncias 2 e 3'); E1.history.undo(); A(E1.store.length === 2, 'CHAMFER: undo');
  E1 = await run('CHAMFER', ['Ângulo', 2, 45, { id: 1, pt: p(8, 0) }, { id: 2, pt: p(0, 8) }], [ln(1, 0, 0, 10, 0), ln(2, 0, 0, 0, 10)]); near(E1.store[2].p2.y, 2, 1e-9, 'CHAMFER: método Ângulo (45° → 2×2)');
  S.settings.chamferD1 = S.settings.chamferD2 = 0; S.settings.chamferMethod = 'Distâncias';
  // ESC não propaga e preserva o estado
  var Cn = CAD.Cancel; CAD.Cancel = { name: 'Cancel' };
  var thrown = 0;
  E1 = await run('MOVE', [[1], p(0, 0), function () { throw CAD.Cancel; }], [ln(1, 0, 0, 1, 0)]).catch(function () { thrown++; return null; });
  A(thrown === 0 && E1 && E1.store[0].p1.x === 0, 'ESC no MOVE: sem erro e sem alterar');
  E1 = await run('COPY', [[1], p(0, 0), p(2, 0), function () { throw CAD.Cancel; }], [ln(1, 0, 0, 1, 0)]).catch(function () { thrown++; return null; });
  A(thrown === 0 && E1 && E1.store.length === 2, 'ESC no COPY: mantém cópias já feitas');
  CAD.Cancel = Cn;
  // entrada vazia não cria nem altera
  E1 = await run('MOVE', [], [ln(1, 0, 0, 1, 0)]); A(E1.store[0].p1.x === 0 && E1.stack.length === 0, 'MOVE sem seleção: nada acontece, sem histórico');
  console.log('CAD.tests.p6: ' + ok + ' ok, ' + bad + ' falhas');
  return { ok: ok, bad: bad };
};

})(window.CAD = window.CAD || {});
/* ==== END:6 ==== */
