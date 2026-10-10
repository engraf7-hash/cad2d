/* ==== PART:14 ==== */
/* P14 Extras de edição: grips, seleção avançada, array, break, lengthen, align, reverse, pedit, edit vertex,
   set base point, xline, ray, donut, boundary, region. Matemática própria; usa CAD.draw (P5) só para ellipse/spline. */
(function (CAD) {
'use strict';
var PI = Math.PI, TAU = PI * 2, D2R = PI / 180, R2D = 180 / PI, EPS = 1e-9;
var X = CAD.extra = CAD.extra || {};
X.settings = X.settings || { donutIn: 0.5, donutOut: 1, boundObj: 'Polilinha', delobj: true, similarBy: ['type', 'layer'], lassoMode: 'Cruzamento', space: 'model' };
var env = null; // injeção para testes: {input, ents:{all,get,add,remove,update}, doc, types, sel:{ids,set}, print, tol}
var LOCAL = {}; // tipos novos desta parte

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
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function cp(v) { // cópia profunda que preserva undefined
  if (Array.isArray(v)) return v.map(cp);
  if (v && typeof v === 'object') { var o = {}, k; for (k in v) o[k] = cp(v[k]); return o; }
  return v;
}
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
function isCancel(x) { return !!x && (x === CAD.Cancel || (typeof CAD.Cancel === 'function' && x instanceof CAD.Cancel) || x.name === 'Cancel'); }
function fmt(n) { return String(Math.round(n * 1e6) / 1e6); }
function unit(v) { var l = Math.hypot(v.x, v.y); return l < EPS ? null : P(v.x / l, v.y / l); }

/* ---------- adaptadores (core real ou injeção de teste) ---------- */
function DOC() { return (env && env.doc) || CAD.doc || { layers: [], entities: [] }; }
function IN() { return (env && env.input) || CAD.input; }
function say(m) { if (env && env.print) env.print(m); else if (CAD.cmd && CAD.cmd.print) CAD.cmd.print(m); }
function TY(name) {
  if (LOCAL[name]) return LOCAL[name];
  if (env && env.types && env.types[name]) return env.types[name];
  var t = CAD.types;
  if (t) {
    if (t.get) { var d = t.get(name); if (d) return d; }
    if (t.map && t.map[name]) return t.map[name];
    if (t.defs && t.defs[name]) return t.defs[name];
  }
  return (CAD.draw && CAD.draw.defs && CAD.draw.defs[name]) || null;
}
function ENTS() {
  if (env && env.ents) return env.ents;
  return {
    all: function () { return DOC().entities || []; },
    get: function (id) { if (CAD.ents && CAD.ents.get) return CAD.ents.get(id); var a = DOC().entities || []; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; },
    add: function (s) { var r = CAD.ents.add(s); return (r && typeof r === 'object') ? r.id : r; },
    remove: function (id) { CAD.ents.remove(id); },
    update: function (id, p) { CAD.ents.update(id, p); }
  };
}
function layerOf(n) { var L = DOC().layers || [], i; for (i = 0; i < L.length; i++) if (L[i].name === n) return L[i]; return null; }
function visible(e) {
  var L = layerOf(e.layer), sp = e.space || 'model';
  return sp === (X.settings.space || 'model') && (!L || (L.on !== false && !L.frozen && !L.locked));
}
function visEnts() { return ENTS().all().filter(visible); }
function selIds() {
  var s = env && env.sel ? env.sel : CAD.sel, r;
  if (!s) return X._sel || [];
  r = typeof s.ids === 'function' ? s.ids() : (s.ids || (s.get && s.get()) || (s.list && s.list()) || []);
  if (r && typeof r.forEach === 'function' && !Array.isArray(r)) { var a = []; r.forEach(function (x) { a.push(x); }); r = a; }
  return Array.isArray(r) ? r.slice() : [];
}
function selSet(ids) { var s = env && env.sel ? env.sel : CAD.sel; X._sel = ids.slice(); if (s && s.set) s.set(ids); }
function normIds(r) { return (Array.isArray(r) ? r : []).map(function (x) { return (x && typeof x === 'object') ? x.id : x; }).filter(function (x) { return x !== undefined && x !== null; }); }

/* batch: uma operação composta = um passo de undo */
function batch(name, ops) {
  var E = ENTS(), st = null, ids = [];
  function doit() {
    if (!st) {
      st = { upd: [], rem: [] };
      (ops.update || []).forEach(function (u) {
        var cur = E.get(u.id); if (!cur) return;
        var old = {}, k; for (k in u.patch) old[k] = cp(cur[k]);
        st.upd.push({ id: u.id, patch: u.patch, old: old });
      });
      (ops.remove || []).forEach(function (id) { var cur = E.get(id); if (cur) st.rem.push(cp(cur)); });
    }
    st.upd.forEach(function (u) { E.update(u.id, cp(u.patch)); });
    st.rem.forEach(function (e) { E.remove(e.id); });
    (ops.add || []).forEach(function (s, i) { var sp = cp(s); if (ids[i] !== undefined) sp.id = ids[i]; ids[i] = E.add(sp); });
  }
  function undo() {
    ids.forEach(function (id) { E.remove(id); });
    st.rem.forEach(function (e) { E.add(cp(e)); });
    st.upd.slice().reverse().forEach(function (u) { E.update(u.id, cp(u.old)); });
  }
  if (!env && CAD.history && CAD.history.run) CAD.history.run({ name: name, do: doit, undo: undo }); else doit();
  return ids;
}
function mk(type, g) {
  var cur = (DOC().current) || {}, e = {
    type: type, layer: cur.layer || '0', color: cur.color == null ? null : cur.color,
    lw: cur.lw == null ? null : cur.lw, ltype: cur.ltype == null ? null : cur.ltype, space: X.settings.space || 'model'
  };
  for (var k in g) e[k] = g[k];
  return e;
}
function inherit(e, g) {
  var o = { layer: e.layer, color: e.color === undefined ? null : e.color, lw: e.lw === undefined ? null : e.lw, ltype: e.ltype === undefined ? null : e.ltype, space: e.space || 'model' };
  for (var k in g) o[k] = g[k];
  return o;
}

/* ---------- matrizes (função com campos a..f: serve aos dois formatos) ---------- */
function mkM(a, b, c, d, e, f) {
  var m = function (p) { return P(a * p.x + c * p.y + e, b * p.x + d * p.y + f, p.z || 0); };
  m.a = a; m.b = b; m.c = c; m.d = d; m.e = e; m.f = f; return m;
}
function mMul(m, n) { // aplica n e depois m
  return mkM(m.a * n.a + m.c * n.b, m.b * n.a + m.d * n.b, m.a * n.c + m.c * n.d, m.b * n.c + m.d * n.d, m.a * n.e + m.c * n.f + m.e, m.b * n.e + m.d * n.f + m.f);
}
function mT(dx, dy) { return mkM(1, 0, 0, 1, dx, dy); }
function mR(rad, c) {
  var co = Math.cos(rad), si = Math.sin(rad), r = mkM(co, si, -si, co, 0, 0);
  return c ? mMul(mT(c.x, c.y), mMul(r, mT(-c.x, -c.y))) : r;
}
function mS(k, c) { var s = mkM(k, 0, 0, k, 0, 0); return c ? mMul(mT(c.x, c.y), mMul(s, mT(-c.x, -c.y))) : s; }
function xpatch(e, m) { var t = TY(e.type); return t && t.transform ? t.transform(e, m) : null; }
function xcopy(e, m) { // nova entidade (sem id) transformada
  var p = xpatch(e, m); if (!p) return null;
  var n = cp(e), k; delete n.id;
  for (k in p) { if (p[k] === undefined) delete n[k]; else n[k] = cp(p[k]); }
  return n;
}

/* ---------- caminhos (line/arc/pline/circle como lista de vértices com bulge) ---------- */
function bulgeArc(p1, p2, b) {
  var d = dist(p1, p2);
  if (d < EPS || Math.abs(b) < EPS) return null;
  var th = 4 * Math.atan(b), r = d / (2 * Math.sin(Math.abs(th) / 2));
  var u = P((p2.x - p1.x) / d, (p2.y - p1.y) / d), n = P(-u.y, u.x), m = mid(p1, p2), h = (d / 2) / Math.tan(th / 2);
  var c = P(m.x + n.x * h, m.y + n.y * h, p1.z || 0);
  return { c: c, r: r, th: th, a0: ang(c, p1) };
}
function sweepRad(a1d, a2d) { var s = norm2pi(a2d * D2R) - norm2pi(a1d * D2R); if (s <= EPS) s += TAU; return s; }
function toPath(e) {
  switch (e.type) {
    case 'line': return { pts: [{ x: e.p1.x, y: e.p1.y, z: e.p1.z || 0, bulge: 0 }, { x: e.p2.x, y: e.p2.y, z: e.p2.z || 0, bulge: 0 }], closed: false };
    case 'arc': {
      var sw = sweepRad(e.a1, e.a2), s = pol(e.c, e.r, e.a1 * D2R), f = pol(e.c, e.r, e.a1 * D2R + sw);
      return { pts: [{ x: s.x, y: s.y, z: s.z, bulge: Math.tan(sw / 4) }, { x: f.x, y: f.y, z: f.z, bulge: 0 }], closed: false };
    }
    case 'pline': return { pts: (e.pts || []).map(function (p) { return { x: p.x, y: p.y, z: p.z || 0, bulge: num(p.bulge, 0) }; }), closed: !!e.closed };
    case 'circle': return { pts: [{ x: e.c.x + e.r, y: e.c.y, z: e.c.z || 0, bulge: 1 }, { x: e.c.x - e.r, y: e.c.y, z: e.c.z || 0, bulge: 1 }], closed: true };
  }
  return null;
}
function segList(path) {
  var v = path.pts, n = v.length, cnt = path.closed ? n : n - 1, o = [], c = 0, i;
  for (i = 0; i < cnt; i++) {
    var p1 = v[i], p2 = v[(i + 1) % n], b = num(p1.bulge, 0), a = bulgeArc(p1, p2, b), L = a ? Math.abs(a.th) * a.r : dist(p1, p2);
    o.push({ i: i, p1: p1, p2: p2, b: b, L: L, c0: c, c1: c + L, arc: a }); c += L;
  }
  o.total = c; return o;
}
function segPt(sg, f) { return sg.arc ? pol(sg.arc.c, sg.arc.r, sg.arc.a0 + sg.arc.th * f) : P(sg.p1.x + (sg.p2.x - sg.p1.x) * f, sg.p1.y + (sg.p2.y - sg.p1.y) * f, (sg.p1.z || 0) + ((sg.p2.z || 0) - (sg.p1.z || 0)) * f); }
function segTan(sg, f) { return sg.arc ? sg.arc.a0 + sg.arc.th * f + (sg.arc.th > 0 ? PI / 2 : -PI / 2) : ang(sg.p1, sg.p2); }
function subB(b, f0, f1) { return Math.abs(b) < EPS ? 0 : Math.tan(Math.atan(b) * (f1 - f0)); }
function slicePath(sl, sA, sB) {
  var out = [];
  sl.forEach(function (sg) {
    var a = Math.max(sA, sg.c0), b = Math.min(sB, sg.c1);
    if (b - a <= 1e-10) return;
    var f0 = (a - sg.c0) / sg.L, f1 = (b - sg.c0) / sg.L, sb = subB(sg.b, f0, f1);
    if (!out.length) { var q = segPt(sg, f0); out.push({ x: q.x, y: q.y, z: q.z || 0, bulge: sb }); } else out[out.length - 1].bulge = sb;
    var e = segPt(sg, f1); out.push({ x: e.x, y: e.y, z: e.z || 0, bulge: 0 });
  });
  return out;
}
function closestOn(sl, p) {
  var best = null;
  sl.forEach(function (sg) {
    var f, q;
    if (sg.arc) {
      var a = sg.arc, phi = ang(a.c, p), d2 = a.th > 0 ? norm2pi(phi - a.a0) : norm2pi(a.a0 - phi), L = Math.abs(a.th);
      f = d2 <= L ? d2 / L : ((d2 - L) < (TAU - d2) ? 1 : 0);
    } else {
      var dx = sg.p2.x - sg.p1.x, dy = sg.p2.y - sg.p1.y, l2 = dx * dx + dy * dy;
      f = l2 ? clamp(((p.x - sg.p1.x) * dx + (p.y - sg.p1.y) * dy) / l2, 0, 1) : 0;
    }
    q = segPt(sg, f);
    var d = dist(p, q);
    if (!best || d < best.d) best = { d: d, s: sg.c0 + f * sg.L, pt: q, seg: sg.i, f: f };
  });
  return best;
}
function revPts(v, closed) {
  var n = v.length, r = [], k;
  for (k = 0; k < n; k++) {
    var src = v[n - 1 - k], j = closed ? (n - 2 - k + n) % n : n - 2 - k;
    r.push({ x: src.x, y: src.y, z: src.z || 0, bulge: (closed || k < n - 1) ? -num(v[j].bulge, 0) : 0 });
  }
  return r;
}
function pathTess(path, tol) {
  var o = [];
  segList(path).forEach(function (sg) {
    o.push(pt(sg.p1));
    if (sg.arc) {
      var da = sg.arc.r > tol ? 2 * Math.acos(clamp(1 - tol / sg.arc.r, -1, 1)) : PI / 2;
      var n = clamp(Math.ceil(Math.abs(sg.arc.th) / Math.max(da, 1e-3)), 2, 2048), k;
      for (k = 1; k < n; k++) o.push(pol(sg.arc.c, sg.arc.r, sg.arc.a0 + sg.arc.th * k / n));
    }
  });
  if (!path.closed && path.pts.length) o.push(pt(path.pts[path.pts.length - 1]));
  return { pts: o, closed: !!path.closed && (path.pts.length > 2 || path.pts.some(function (q) { return Math.abs(num(q.bulge, 0)) > EPS; })) };
}
function bboxOfPts(pts) {
  var b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  pts.forEach(function (p) { b.x1 = Math.min(b.x1, p.x); b.y1 = Math.min(b.y1, p.y); b.x2 = Math.max(b.x2, p.x); b.y2 = Math.max(b.y2, p.y); });
  if (b.x1 === Infinity) b.x1 = b.y1 = b.x2 = b.y2 = 0;
  return { min: { x: b.x1, y: b.y1 }, max: { x: b.x2, y: b.y2 }, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
}
function bboxOfEnt(e) { var t = TY(e.type); return t && t.bbox ? t.bbox(e) : null; }
function bboxUnion(ents) {
  var pts = [];
  ents.forEach(function (e) { var b = bboxOfEnt(e); if (b) { pts.push(P(b.min.x, b.min.y), P(b.max.x, b.max.y)); } });
  return bboxOfPts(pts);
}
// contorno poligonal de qualquer entidade (para seleção e boundary)
function outline(e, tol) {
  tol = tol || 0.01;
  if (e.type === 'xline' || e.type === 'ray') return null;
  if (e.type === 'region') {
    var all = [];
    (e.loops || []).forEach(function (l) { all.push(pathTess({ pts: l.pts, closed: true }, tol)); });
    return { loops: all };
  }
  var p = toPath(e);
  if (p) return { loops: [pathTess(p, tol)] };
  if (CAD.draw && CAD.draw.tess && ['ellipse', 'spline', 'point'].indexOf(e.type) >= 0) return { loops: [CAD.draw.tess(e, tol)] };
  var b = bboxOfEnt(e);
  if (b) return { loops: [{ pts: [P(b.min.x, b.min.y), P(b.max.x, b.min.y), P(b.max.x, b.max.y), P(b.min.x, b.max.y)], closed: true }] };
  return null;
}
function distPoly(p, t) {
  var m = Infinity, n = t.pts.length, i;
  if (n === 1) return dist(p, t.pts[0]);
  function ds(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, k = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
    return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
  }
  for (i = 0; i < n - 1; i++) m = Math.min(m, ds(t.pts[i], t.pts[i + 1]));
  if (t.closed && n > 2) m = Math.min(m, ds(t.pts[n - 1], t.pts[0]));
  return m;
}
function distEnt(e, p) {
  var o = outline(e, 0.01); if (!o) return 0;
  var m = Infinity; o.loops.forEach(function (l) { m = Math.min(m, distPoly(p, l)); });
  return m;
}
function scaleOf(view) {
  view = view || CAD.view; if (!view || !view.toScreen) return 1;
  var a = view.toScreen(P(0, 0)), b = view.toScreen(P(1, 0)), s = Math.hypot(b.x - a.x, b.y - a.y);
  return s > 0 ? s : 1;
}
function strokePts(ctx, view, pts, closed) {
  var i, s; ctx.beginPath();
  for (i = 0; i < pts.length; i++) { s = view.toScreen(pts[i]); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }
  if (closed) ctx.closePath(); ctx.stroke();
}
function pickTol() { return (env && env.tol) || 8 / scaleOf(CAD.view); }
function entAt(p, tol, filter) {
  var best = null;
  visEnts().forEach(function (e) {
    if (filter && !filter(e)) return;
    var t = TY(e.type); if (!t || !t.hit || !t.hit(e, p, tol)) return;
    var d = distEnt(e, p); if (!best || d < best.d) best = { e: e, d: d };
  });
  return best && best.e;
}

/* ---------- tipos novos: xline, ray, region ---------- */
function p3g(p, c) { return [[c, p.x], [c + 10, p.y], [c + 20, p.z || 0]]; }
function gl(g) {
  if (!g) return [];
  if (Array.isArray(g)) return g;
  if (Array.isArray(g.groups)) return g.groups;
  var out = [], k;
  for (k in g) if (/^\d+$/.test(k)) { var v = g[k]; if (Array.isArray(v)) v.forEach(function (x) { out.push([+k, x]); }); else out.push([+k, v]); }
  return out;
}
function g1(L, c, d) { for (var i = 0; i < L.length; i++) if (+L[i][0] === c) { var v = parseFloat(L[i][1]); return isFinite(v) ? v : d; } return d; }
function infDef(label, half, dxfName) {
  function sn(e) { var d = unit(e.dir) || P(1, 0); return d; }
  return {
    label: label, dxf: [dxfName],
    draw: function (ctx, e, view) {
      view = view || CAD.view; var d = sn(e), L = 1e5 / scaleOf(view);
      var a = half ? pt(e.p) : P(e.p.x - d.x * L, e.p.y - d.y * L), b = P(e.p.x + d.x * L, e.p.y + d.y * L);
      strokePts(ctx, view, [a, b], false);
    },
    bbox: function (e) { return bboxOfPts([pt(e.p)]); },
    hit: function (e, p, tol) {
      var d = sn(e), t = (p.x - e.p.x) * d.x + (p.y - e.p.y) * d.y;
      if (half && t < 0) return dist(p, e.p) <= tol;
      return Math.abs((p.x - e.p.x) * d.y - (p.y - e.p.y) * d.x) <= tol;
    },
    snapPts: function (e) { return [{ pt: pt(e.p), mode: half ? 'endpoint' : 'node' }]; },
    grips: function (e) {
      var d = sn(e);
      return [{ id: 'p', kind: 'move', pt: pt(e.p), move: function (e, q) { return { p: pt(q) }; } },
        { id: 'dir', kind: 'angle', pt: P(e.p.x + d.x, e.p.y + d.y), move: function (e, q) { var u = unit(P(q.x - e.p.x, q.y - e.p.y)); return u ? { dir: u } : {}; } }];
    },
    transform: function (e, m) {
      var n = nmat(m), q = P(n.a * e.p.x + n.c * e.p.y + n.e, n.b * e.p.x + n.d * e.p.y + n.f, e.p.z || 0), d = sn(e);
      var u = unit(P(n.a * d.x + n.c * d.y, n.b * d.x + n.d * d.y));
      return { p: q, dir: u || d };
    },
    props: function (e) {
      var d = sn(e);
      return [{ key: 'p', label: half ? 'Início' : 'Ponto base', type: 'point', value: pt(e.p), group: 'Geometria' },
        { key: 'angle', label: 'Ângulo', type: 'angle', value: norm360(Math.atan2(d.y, d.x) * R2D), group: 'Geometria',
          set: function (e, v) { return { dir: P(Math.cos(v * D2R), Math.sin(v * D2R)) }; } }];
    },
    explode: function () { return []; },
    toDXF: function (e) { return { etype: dxfName, groups: p3g(pt(e.p), 10).concat(p3g(sn(e), 11)) }; },
    fromDXF: function (g) {
      var L = gl(g), u = unit(P(g1(L, 11, 1), g1(L, 21, 0))) || P(1, 0);
      return { type: half ? 'ray' : 'xline', p: P(g1(L, 10, 0), g1(L, 20, 0), g1(L, 30, 0)), dir: u };
    },
    toSVG: function (e) {
      var d = sn(e), K = 1e6, a = half ? pt(e.p) : P(e.p.x - d.x * K, e.p.y - d.y * K), b = P(e.p.x + d.x * K, e.p.y + d.y * K);
      return '<line class="cad-inf" x1="' + fmt(a.x) + '" y1="' + fmt(-a.y) + '" x2="' + fmt(b.x) + '" y2="' + fmt(-b.y) + '"/>';
    }
  };
}
function nmat(m) { // aceita função (com ou sem a..f), {a..f} ou [6]
  if (typeof m === 'function') {
    if (typeof m.a === 'number') return m;
    var o = m(P(0, 0)), x = m(P(1, 0)), y = m(P(0, 1));
    return { a: x.x - o.x, b: x.y - o.y, c: y.x - o.x, d: y.y - o.y, e: o.x, f: o.y };
  }
  if (Array.isArray(m) && m.length === 6) return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
  return m && typeof m.a === 'number' ? m : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}
LOCAL.xline = infDef('Linha de construção', false, 'XLINE');
LOCAL.ray = infDef('Raio', true, 'RAY');

function loopArea(l) { return CAD.draw && CAD.draw.plArea ? CAD.draw.plArea({ pts: l.pts, closed: true }) : polyArea(pathTess({ pts: l.pts, closed: true }, 0.001).pts); }
function polyArea(pts) { var s = 0, i, n = pts.length; for (i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; }
function loopLen(l) { var s = 0; segList({ pts: l.pts, closed: true }).forEach(function (g) { s += g.L; }); return s; }
function pip(p, pts) { // ponto em polígono
  var c = false, i, j, n = pts.length;
  for (i = 0, j = n - 1; i < n; j = i++) {
    if (((pts[i].y > p.y) !== (pts[j].y > p.y)) && (p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x)) c = !c;
  }
  return c;
}
function loopSVG(l) {
  var v = l.pts, d = 'M' + fmt(v[0].x) + ' ' + fmt(-v[0].y);
  segList({ pts: v, closed: true }).forEach(function (g) {
    var q = g.p2;
    d += g.arc ? ' A' + fmt(g.arc.r) + ' ' + fmt(g.arc.r) + ' 0 ' + (Math.abs(g.arc.th) > PI ? 1 : 0) + ' ' + (g.arc.th > 0 ? 1 : 0) + ' ' + fmt(q.x) + ' ' + fmt(-q.y) : ' L' + fmt(q.x) + ' ' + fmt(-q.y);
  });
  return d + ' Z';
}
LOCAL.region = {
  label: 'Região', dxf: [],
  draw: function (ctx, e, view) {
    view = view || CAD.view; var tol = 0.25 / scaleOf(view), any = false;
    ctx.beginPath();
    (e.loops || []).forEach(function (l) {
      var t = pathTess({ pts: l.pts, closed: true }, tol);
      t.pts.forEach(function (p, i) { var s = view.toScreen(p); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); any = true; });
      ctx.closePath();
    });
    if (!any) return;
    if (e.fill) { ctx.fillStyle = ctx.strokeStyle; ctx.fill('evenodd'); }
    ctx.stroke();
  },
  bbox: function (e) { var pts = []; (e.loops || []).forEach(function (l) { pts = pts.concat(pathTess({ pts: l.pts, closed: true }, 0.001).pts); }); return bboxOfPts(pts); },
  hit: function (e, p, tol) {
    var ls = (e.loops || []).map(function (l) { return pathTess({ pts: l.pts, closed: true }, Math.max(tol / 4, 1e-6)); }), i;
    for (i = 0; i < ls.length; i++) if (distPoly(p, ls[i]) <= tol) return true;
    if (!e.fill) return false;
    var inside = 0; ls.forEach(function (t) { if (pip(p, t.pts)) inside++; });
    return inside % 2 === 1;
  },
  snapPts: function (e) { var o = []; (e.loops || []).forEach(function (l) { l.pts.forEach(function (p) { o.push({ pt: pt(p), mode: 'endpoint' }); }); }); return o; },
  grips: function () { return []; },
  transform: function (e, m) {
    var n = nmat(m), flip = n.a * n.d - n.b * n.c < 0;
    return { loops: (e.loops || []).map(function (l) {
      return { pts: l.pts.map(function (p) { return { x: n.a * p.x + n.c * p.y + n.e, y: n.b * p.x + n.d * p.y + n.f, z: p.z || 0, bulge: flip ? -num(p.bulge, 0) : num(p.bulge, 0) }; }) };
    }) };
  },
  props: function (e) {
    var ls = e.loops || [], A = ls.length ? loopArea(ls[0]) : 0, per = 0, i;
    for (i = 1; i < ls.length; i++) A -= loopArea(ls[i]);
    ls.forEach(function (l) { per += loopLen(l); });
    return [{ key: 'fill', label: 'Preenchida', type: 'bool', value: !!e.fill, group: 'Geometria' },
      { key: 'loops', label: 'Contornos', type: 'number', value: ls.length, readonly: true, group: 'Medidas' },
      { key: 'area', label: 'Área', type: 'number', value: Math.max(0, A), readonly: true, group: 'Medidas' },
      { key: 'perimeter', label: 'Perímetro', type: 'number', value: per, readonly: true, group: 'Medidas' }];
  },
  explode: function (e) { return (e.loops || []).map(function (l) { return inherit(e, { type: 'pline', pts: clone(l.pts), closed: true }); }); },
  toDXF: function (e) { // REGION exige ACIS: exporta como LWPOLYLINEs fechadas (P12 deve tratar etype 'MULTI')
    return { etype: 'MULTI', items: (e.loops || []).map(function (l) {
      var G = [[90, l.pts.length], [70, 1]];
      l.pts.forEach(function (p) { G.push([10, p.x], [20, p.y]); if (Math.abs(num(p.bulge, 0)) > EPS) G.push([42, p.bulge]); });
      return { etype: 'LWPOLYLINE', groups: G };
    }) };
  },
  fromDXF: function () { return null; },
  toSVG: function (e) { return '<path fill-rule="evenodd" class="cad-region" d="' + (e.loops || []).map(loopSVG).join(' ') + '"' + (e.fill ? '' : ' fill="none"') + '/>'; }
};
if (CAD.types && CAD.types.register) { ['xline', 'ray', 'region'].forEach(function (k) { CAD.types.register(k, LOCAL[k]); }); }
else if (typeof console !== 'undefined') console.warn('P14: CAD.types ausente; tipos xline/ray/region não registrados.');

/* ---------- BREAK ---------- */
function pieceSpecs(e, pcs) { // pcs: listas de vértices; devolve entidades do mesmo tipo da origem
  var out = [];
  pcs.forEach(function (v) {
    if (v.length < 2) return;
    if (e.type === 'line') out.push(inherit(e, { type: 'line', p1: pt(v[0]), p2: pt(v[v.length - 1]) }));
    else if (e.type === 'arc' || e.type === 'circle') out.push(inherit(e, { type: 'arc', c: pt(e.c), r: e.r, a1: norm360(ang(e.c, v[0]) * R2D), a2: norm360(ang(e.c, v[v.length - 1]) * R2D) }));
    else out.push(inherit(e, { type: 'pline', pts: v, closed: false }));
  });
  return out;
}
function ellParam(e, p) { // parâmetro (graus) do ponto da elipse mais próximo
  var P5 = CAD.draw && CAD.draw.defs && CAD.draw.defs.ellipse, best = 0, bd = Infinity, t, d;
  var pe = function (t) { var M = e.major, m = P(-M.y * e.ratio, M.x * e.ratio), r = t * D2R; return P(e.c.x + M.x * Math.cos(r) + m.x * Math.sin(r), e.c.y + M.y * Math.cos(r) + m.y * Math.sin(r)); };
  for (t = 0; t < 360; t += 0.1) { d = dist(p, pe(t)); if (d < bd) { bd = d; best = t; } }
  return norm360(best);
}
function breakEnt(e, pA, pB) { // → array de especificações ou null (impossível)
  if (pB && dist(pA, pB) < EPS) pB = null;
  if (e.type === 'ellipse') {
    var a1 = num(e.a1, 0), a2 = num(e.a2, 360), full = Math.abs(a2 - a1) >= 360 - 1e-9 || a1 === a2;
    var t1 = ellParam(e, pA), t2 = pB ? ellParam(e, pB) : t1;
    if (full) { if (!pB || Math.abs(t1 - t2) < 1e-9) return null; return [inherit(e, { type: 'ellipse', c: pt(e.c), major: pt(e.major), ratio: e.ratio, a1: t2, a2: t1 })]; }
    var sw = sweepRad(a1, a2) * R2D, s1 = clamp(norm360(t1 - a1), 0, sw), s2 = clamp(norm360(t2 - a1), 0, sw), lo = Math.min(s1, s2), hi = Math.max(s1, s2), o = [];
    var mkE = function (x, y) { return inherit(e, { type: 'ellipse', c: pt(e.c), major: pt(e.major), ratio: e.ratio, a1: norm360(a1 + x), a2: norm360(a1 + y) }); };
    if (lo > 1e-9) o.push(mkE(0, lo)); if (sw - hi > 1e-9) o.push(mkE(hi, sw));
    return pB || (o.length === 2) ? o : null;
  }
  var path = toPath(e); if (!path) return null;
  if (e.type === 'circle') {
    if (!pB) return null;
    var c1 = ang(e.c, pA) * R2D, c2 = ang(e.c, pB) * R2D;
    return [inherit(e, { type: 'arc', c: pt(e.c), r: e.r, a1: norm360(c2), a2: norm360(c1) })];
  }
  var sl = segList(path), tot = sl.total, a = closestOn(sl, pA), b = pB ? closestOn(sl, pB) : a;
  var s1b = Math.min(a.s, b.s), s2b = Math.max(a.s, b.s), pcs = [];
  if (path.closed) {
    if (!pB || s2b - s1b < EPS) return null;
    var p1 = s2b >= tot - EPS ? [] : slicePath(sl, s2b, tot), p2 = s1b <= EPS ? [] : slicePath(sl, 0, s1b), v;
    if (p1.length && p2.length) { p1[p1.length - 1].bulge = p2[0].bulge; v = p1.concat(p2.slice(1)); } else v = p1.length ? p1 : p2;
    pcs = v.length >= 2 ? [v] : [];
  } else {
    if (!pB && (s1b <= EPS || tot - s1b <= EPS)) return null;
    if (s1b > EPS) pcs.push(slicePath(sl, 0, s1b));
    if (tot - s2b > EPS) pcs.push(slicePath(sl, s2b, tot));
  }
  return pieceSpecs(e, pcs);
}

/* ---------- LENGTHEN ---------- */
function lengthenPatch(e, pick, mode, val) { // → patch ou null
  var path = toPath(e); if (!path || path.closed || e.type === 'circle') return null;
  var sl0 = segList(path), cl = closestOn(sl0, pick), atStart = cl.s < sl0.total / 2;
  var pts = atStart ? revPts(path.pts, false) : path.pts.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0, bulge: num(p.bulge, 0) }; });
  var sl = segList({ pts: pts, closed: false }), tot = sl.total, last = sl[sl.length - 1];
  var nt = mode === 'Delta' ? tot + val : mode === 'Porcentagem' ? tot * val / 100 : val;
  var L2 = last.L + (nt - tot);
  if (!(L2 > 1e-9)) return null;
  var f = L2 / last.L;
  if (last.arc && Math.abs(last.arc.th) * f >= TAU - 1e-6) return null;
  var np = segPt(last, f), n = pts.length;
  pts[n - 2].bulge = last.arc ? Math.tan(Math.atan(last.b) * f) : 0;
  pts[n - 1] = { x: np.x, y: np.y, z: np.z || 0, bulge: 0 };
  if (atStart) pts = revPts(pts, false);
  if (e.type === 'line') return { p1: pt(pts[0]), p2: pt(pts[pts.length - 1]) };
  if (e.type === 'arc') return { a1: norm360(ang(e.c, pts[0]) * R2D), a2: norm360(ang(e.c, pts[pts.length - 1]) * R2D) };
  return { pts: pts };
}

/* ---------- JOIN (PEDIT) ---------- */
function joinChain(base, others, fuzz) {
  var pts = base.pts.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0, bulge: num(p.bulge, 0) }; }), used = [], changed = true, i;
  others.forEach(function (o) { o.done = false; });
  while (changed) {
    changed = false;
    for (i = 0; i < others.length; i++) {
      var o = others[i]; if (o.done || o.path.closed) continue;
      var qa = o.path.pts, h = pts[0], t = pts[pts.length - 1], qs = qa[0], qe = qa[qa.length - 1], n, r;
      if (dist(t, qs) <= fuzz) { pts[pts.length - 1].bulge = num(qa[0].bulge, 0); pts = pts.concat(clone(qa.slice(1))); }
      else if (dist(t, qe) <= fuzz) { r = revPts(qa, false); pts[pts.length - 1].bulge = r[0].bulge; pts = pts.concat(r.slice(1)); }
      else if (dist(h, qe) <= fuzz) { n = clone(qa); n[n.length - 1].bulge = pts[0].bulge; pts = n.concat(pts.slice(1)); }
      else if (dist(h, qs) <= fuzz) { n = revPts(qa, false); n[n.length - 1].bulge = pts[0].bulge; pts = n.concat(pts.slice(1)); }
      else continue;
      o.done = true; used.push(o.id); changed = true;
    }
  }
  var closed = false;
  if (pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) <= fuzz) { pts.pop(); closed = true; }
  pts.forEach(function (p) { p.bulge = num(p.bulge, 0); });
  return { pts: pts, closed: closed, used: used };
}

/* ---------- seleção avançada ---------- */
function segX(a, b, c, d) { // segmentos se cruzam (inclui toque)
  var r = P(b.x - a.x, b.y - a.y), s = P(d.x - c.x, d.y - c.y), den = r.x * s.y - r.y * s.x, qp = P(c.x - a.x, c.y - a.y);
  if (Math.abs(den) < 1e-14) {
    if (Math.abs(qp.x * r.y - qp.y * r.x) > 1e-12) return false;
    var l2 = r.x * r.x + r.y * r.y; if (!l2) return false;
    var t0 = (qp.x * r.x + qp.y * r.y) / l2, t1 = t0 + (s.x * r.x + s.y * r.y) / l2;
    return Math.max(Math.min(t0, t1), 0) <= Math.min(Math.max(t0, t1), 1);
  }
  var t = (qp.x * s.y - qp.y * s.x) / den, u = (qp.x * r.y - qp.y * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function entPts(e) { var o = outline(e, 0.01); return o ? o.loops : []; }
function crossesPoly(e, poly, closedPoly) {
  var ls = entPts(e), np = poly.length, cnt = closedPoly ? np : np - 1, tol = 1e-9;
  return ls.some(function (t) {
    var n = t.pts.length, m = t.closed ? n : n - 1, i, j;
    if (n === 1) { for (j = 0; j < cnt; j++) { var a = poly[j], b = poly[(j + 1) % np], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, k = l2 ? clamp(((t.pts[0].x - a.x) * dx + (t.pts[0].y - a.y) * dy) / l2, 0, 1) : 0; if (Math.hypot(t.pts[0].x - a.x - k * dx, t.pts[0].y - a.y - k * dy) <= tol + pickTol() * 0.25) return true; } return false; }
    for (i = 0; i < m; i++) for (j = 0; j < cnt; j++) if (segX(t.pts[i], t.pts[(i + 1) % n], poly[j], poly[(j + 1) % np])) return true;
    return false;
  });
}
var SX = CAD.selx = CAD.selx || {};
SX.fence = function (poly) { return visEnts().filter(function (e) { return crossesPoly(e, poly, false); }).map(function (e) { return e.id; }); };
SX.lasso = function (poly, mode) {
  return visEnts().filter(function (e) {
    var ls = entPts(e); if (!ls.length) return false;
    var allIn = ls.every(function (t) { return t.pts.every(function (p) { return pip(p, poly); }); });
    if (mode === 'Janela') return allIn;
    return allIn || ls.some(function (t) { return t.pts.some(function (p) { return pip(p, poly); }); }) || crossesPoly(e, poly, true);
  }).map(function (e) { return e.id; });
};
SX.similar = function (refs, by) {
  by = by || X.settings.similarBy;
  var rs = refs.map(function (id) { return ENTS().get(id); }).filter(Boolean);
  return visEnts().filter(function (e) {
    return rs.some(function (r) { return by.every(function (k) { return (e[k] === undefined ? null : e[k]) === (r[k] === undefined ? null : r[k]); }); });
  }).map(function (e) { return e.id; });
};
SX.byLayer = function (name) { return visEnts().filter(function (e) { return e.layer === name; }).map(function (e) { return e.id; }); };
SX.byType = function (type) { return visEnts().filter(function (e) { return e.type === type; }).map(function (e) { return e.id; }); };
function propVal(e, key) {
  if (['layer', 'color', 'lw', 'ltype', 'type'].indexOf(key) >= 0) return e[key] === undefined ? null : e[key];
  var t = TY(e.type), ps = t && t.props ? t.props(e) : [], i;
  for (i = 0; i < ps.length; i++) if (ps[i].key === key) return ps[i].value;
  return undefined;
}
function cmpVal(op, a, b) {
  var na = toNum(a), nb = toNum(b);
  if (op === 'contem') return plain(a === null || a === undefined ? '' : a).indexOf(plain(b)) >= 0;
  if (na !== null && nb !== null && typeof a !== 'boolean') {
    var d = Math.abs(na - nb) <= 1e-9 * Math.max(1, Math.abs(nb));
    return op === '=' ? d : op === '<>' ? !d : op === '>' ? na > nb && !d : op === '<' ? na < nb && !d : op === '>=' ? na >= nb || d : na <= nb || d;
  }
  var sa = plain(a === null || a === undefined ? 'bylayer' : a), sb = plain(b);
  return op === '=' ? sa === sb : op === '<>' ? sa !== sb : false;
}
SX.quick = function (q) { // {type?, key, op, value}
  return visEnts().filter(function (e) {
    if (q.type && q.type !== 'todos' && e.type !== q.type) return false;
    if (!q.key) return true;
    var v = propVal(e, q.key); if (v === undefined) return false;
    return cmpVal(q.op || '=', v, q.value);
  }).map(function (e) { return e.id; });
};

/* ---------- BOUNDARY (grafo planar) ---------- */
function boundaryAt(p0) {
  var ents = visEnts().filter(function (e) { return e.type !== 'xline' && e.type !== 'ray' && e.type !== 'point'; });
  if (!ents.length) return null;
  var bb = bboxUnion(ents), size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, 1e-6), tg = size * 1e-4, mt = size * 1e-7;
  var segs = [];
  ents.forEach(function (e) {
    var o = outline(e, tg); if (!o) return;
    o.loops.forEach(function (t) {
      var n = t.pts.length, m = t.closed ? n : n - 1, i;
      for (i = 0; i < m; i++) { var a = t.pts[i], b = t.pts[(i + 1) % n]; if (dist(a, b) > 1e-12) segs.push({ a: a, b: b, e: e, pr: [0, 1] }); }
    });
  });
  var N = segs.length, i, j;
  var order = segs.map(function (s, k) { return k; }).sort(function (x, y) { return Math.min(segs[x].a.x, segs[x].b.x) - Math.min(segs[y].a.x, segs[y].b.x); });
  for (var oi = 0; oi < N; oi++) {
    i = order[oi]; var si = segs[i], maxx = Math.max(si.a.x, si.b.x) + mt;
    for (var oj = oi + 1; oj < N; oj++) {
      j = order[oj]; var sj = segs[j];
      if (Math.min(sj.a.x, sj.b.x) > maxx) break;
      if (Math.max(sj.a.y, sj.b.y) < Math.min(si.a.y, si.b.y) - mt || Math.min(sj.a.y, sj.b.y) > Math.max(si.a.y, si.b.y) + mt) continue;
      var r = P(si.b.x - si.a.x, si.b.y - si.a.y), s = P(sj.b.x - sj.a.x, sj.b.y - sj.a.y), den = r.x * s.y - r.y * s.x, q = P(sj.a.x - si.a.x, sj.a.y - si.a.y);
      var li = Math.hypot(r.x, r.y), lj = Math.hypot(s.x, s.y);
      if (Math.abs(den) < 1e-12 * li * lj) { // paralelos: colineares sobrepostos
        if (Math.abs(q.x * r.y - q.y * r.x) > mt * li) continue;
        [sj.a, sj.b].forEach(function (c) { var t = ((c.x - si.a.x) * r.x + (c.y - si.a.y) * r.y) / (li * li); if (t > 0 && t < 1) si.pr.push(t); });
        [si.a, si.b].forEach(function (c) { var u = ((c.x - sj.a.x) * s.x + (c.y - sj.a.y) * s.y) / (lj * lj); if (u > 0 && u < 1) sj.pr.push(u); });
        continue;
      }
      var t = (q.x * s.y - q.y * s.x) / den, u = (q.x * r.y - q.y * r.x) / den, et = mt / li, eu = mt / lj;
      if (t >= -et && t <= 1 + et && u >= -eu && u <= 1 + eu) { si.pr.push(clamp(t, 0, 1)); sj.pr.push(clamp(u, 0, 1)); }
    }
  }
  var nodes = [], nmap = {}, edges = [], emap = {};
  function node(p) {
    var k = Math.round(p.x / (mt * 10)) + ',' + Math.round(p.y / (mt * 10));
    if (nmap[k] === undefined) { nmap[k] = nodes.length; nodes.push({ p: P(p.x, p.y), adj: [] }); }
    return nmap[k];
  }
  segs.forEach(function (s) {
    s.pr.sort(function (x, y) { return x - y; });
    var prev = null, k;
    for (k = 0; k < s.pr.length; k++) {
      if (prev !== null && s.pr[k] - prev < 1e-12) continue;
      if (prev !== null) {
        var pa = P(s.a.x + (s.b.x - s.a.x) * prev, s.a.y + (s.b.y - s.a.y) * prev), pb = P(s.a.x + (s.b.x - s.a.x) * s.pr[k], s.a.y + (s.b.y - s.a.y) * s.pr[k]);
        var u = node(pa), v = node(pb);
        if (u !== v) { var key = Math.min(u, v) + '_' + Math.max(u, v); if (!emap[key]) { emap[key] = true; edges.push({ u: u, v: v, e: s.e, dead: false }); } }
      }
      prev = s.pr[k];
    }
  });
  edges.forEach(function (ed, k) { ed.id = k; nodes[ed.u].adj.push(ed); nodes[ed.v].adj.push(ed); });
  var prune = true; // remove arestas pendentes (grau 1)
  while (prune) {
    prune = false;
    nodes.forEach(function (n) {
      var live = n.adj.filter(function (a) { return !a.dead; });
      if (live.length === 1) { live[0].dead = true; prune = true; }
    });
  }
  var liveE = edges.filter(function (e) { return !e.dead; });
  if (!liveE.length) return null;
  function other(ed, n) { return ed.u === n ? ed.v : ed.u; }
  function trace(ed, fwd) {
    var u = fwd ? ed.u : ed.v, v = fwd ? ed.v : ed.u, startU = u, startV = v, loop = [u], guard = edges.length * 2 + 5, used = [ed];
    while (guard-- > 0) {
      var vn = nodes[v], outs = vn.adj.filter(function (a) { return !a.dead; }).map(function (a) { var w = other(a, v); return { a: a, w: w, ang: ang(vn.p, nodes[w].p) }; });
      outs.sort(function (x, y) { return x.ang - y.ang; });
      var ri = -1, k; for (k = 0; k < outs.length; k++) if (outs[k].w === u && outs[k].a === used[used.length - 1]) { ri = k; break; }
      if (ri < 0) return null;
      var nx = outs[(ri - 1 + outs.length) % outs.length];
      u = v; v = nx.w; used.push(nx.a);
      if (u === startU && v === startV) return { nodes: loop, edges: used.slice(0, -1) };
      loop.push(u);
    }
    return null;
  }
  var dirv = P(Math.cos(0.4137), Math.sin(0.4137)), excluded = {}, tries = 0;
  while (tries++ < 60) {
    var best = null;
    liveE.forEach(function (ed) {
      if (excluded[ed.id]) return;
      var a = nodes[ed.u].p, b = nodes[ed.v].p, s = P(b.x - a.x, b.y - a.y), den = dirv.x * s.y - dirv.y * s.x;
      if (Math.abs(den) < 1e-15) return;
      var q = P(a.x - p0.x, a.y - p0.y), t = (q.x * s.y - q.y * s.x) / den, uu = (q.x * dirv.y - q.y * dirv.x) / den;
      if (t > 1e-12 && uu >= 0 && uu <= 1 && (!best || t < best.t)) best = { t: t, ed: ed };
    });
    if (!best) return null;
    var A = nodes[best.ed.u].p, B = nodes[best.ed.v].p, fwd = ((B.x - A.x) * (p0.y - A.y) - (B.y - A.y) * (p0.x - A.x)) > 0;
    var lp = trace(best.ed, fwd);
    if (lp) {
      var poly = lp.nodes.map(function (k) { return nodes[k].p; }), sa = 0, n2 = poly.length, z;
      for (z = 0; z < n2; z++) sa += poly[z].x * poly[(z + 1) % n2].y - poly[(z + 1) % n2].x * poly[z].y;
      if (sa > 0 && pip(p0, poly)) {
        var srcs = {}; lp.edges.forEach(function (ed) { srcs[ed.e.id === undefined ? 'x' : ed.e.id] = ed.e; });
        var keys = Object.keys(srcs);
        if (keys.length === 1 && srcs[keys[0]].type === 'circle') return { circle: srcs[keys[0]], pts: poly };
        var out = [], m = poly.length;
        for (z = 0; z < m; z++) { // remove vértices colineares
          var a = poly[(z + m - 1) % m], b = poly[z], c = poly[(z + 1) % m];
          if (Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 1e-9 * size * size * 1e-4) out.push(b);
        }
        return { pts: out.length >= 3 ? out : poly };
      }
    }
    var stack = [], seen = {};
    (lp ? lp.nodes : [best.ed.u]).forEach(function (k) { stack.push(k); seen[k] = true; });
    while (stack.length) { var kk = stack.pop(); nodes[kk].adj.forEach(function (a) { excluded[a.id] = true; var w = other(a, kk); if (!seen[w]) { seen[w] = true; stack.push(w); } }); }
    excluded[best.ed.id] = true;
  }
  return null;
}
X.boundaryAt = boundaryAt;

/* ---------- ARRAY (não associativo) ---------- */
function entsOf(ids) { return ids.map(function (id) { return ENTS().get(id); }).filter(Boolean); }
function refPoint(ents) { var b = bboxUnion(ents); return P((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2); }
function copiesWith(ents, ms) { var out = []; ms.forEach(function (m) { ents.forEach(function (e) { var c = xcopy(e, m); if (c) out.push(c); }); }); return out; }
X.arrayRect = function (ents, rows, cols, dx, dy, angDeg) {
  var a = (angDeg || 0) * D2R, ms = [], i, j;
  for (i = 0; i < rows; i++) for (j = 0; j < cols; j++) {
    if (!i && !j) continue;
    var vx = j * dx, vy = i * dy;
    ms.push(mT(vx * Math.cos(a) - vy * Math.sin(a), vx * Math.sin(a) + vy * Math.cos(a)));
  }
  return copiesWith(ents, ms);
};
X.arrayPolar = function (ents, center, n, fillDeg, rotate) {
  var step = Math.abs(fillDeg) >= 360 - 1e-9 ? fillDeg / n : fillDeg / Math.max(1, n - 1), ref = refPoint(ents), ms = [], k;
  for (k = 1; k < n; k++) {
    var th = k * step * D2R;
    if (rotate) ms.push(mR(th, center));
    else { var q = mR(th, center)(ref); ms.push(mT(q.x - ref.x, q.y - ref.y)); }
  }
  return copiesWith(ents, ms);
};
function pathSampler(pe) {
  var p = toPath(pe);
  if (p) {
    var sl = segList(p);
    return { total: sl.total, closed: p.closed, at: function (s) {
      s = clamp(s, 0, sl.total); var i;
      for (i = 0; i < sl.length; i++) if (s <= sl[i].c1 + 1e-9 || i === sl.length - 1) { var f = clamp((s - sl[i].c0) / sl[i].L, 0, 1); return { p: segPt(sl[i], f), t: segTan(sl[i], f) }; }
    } };
  }
  if (CAD.draw && CAD.draw.tess && (pe.type === 'ellipse' || pe.type === 'spline')) {
    var t = CAD.draw.tess(pe, 0.001), pts = t.pts.slice(); if (t.closed) pts.push(pts[0]);
    var cum = [0], i; for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    return { total: cum[cum.length - 1], closed: t.closed, at: function (s) {
      s = clamp(s, 0, cum[cum.length - 1]);
      for (var k = 1; k < pts.length; k++) if (s <= cum[k] + 1e-12 || k === pts.length - 1) { var f = (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return { p: P(pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f), t: ang(pts[k - 1], pts[k]) }; }
    } };
  }
  return null;
}
X.arrayPath = function (ents, pathEnt, mode, val, align) { // mode 'Contar' (val = n) ou 'Medir' (val = espaçamento)
  var sm = pathSampler(pathEnt); if (!sm) return null;
  var ref = refPoint(ents), n, step;
  if (mode === 'Medir') { step = val; n = Math.floor(sm.total / step + 1e-9) + 1; }
  else { n = Math.max(1, Math.round(val)); step = sm.closed ? sm.total / n : (n > 1 ? sm.total / (n - 1) : 0); }
  var t0 = sm.at(0).t, ms = [], k;
  for (k = 0; k < n; k++) {
    var q = sm.at(k * step);
    if (dist(q.p, ref) < 1e-9 && (!align || Math.abs(q.t - t0) < 1e-9)) continue;
    ms.push(align ? mMul(mT(q.p.x, q.p.y), mMul(mR(q.t - t0), mT(-ref.x, -ref.y))) : mT(q.p.x - ref.x, q.p.y - ref.y));
  }
  return copiesWith(ents, ms);
};

/* ---------- GRIPS ---------- */
var GR = CAD.grips = CAD.grips || {};
GR.list = function (ids) {
  var out = [];
  (ids || selIds()).forEach(function (id) {
    var e = ENTS().get(id), t = e && TY(e.type); if (!t || !t.grips) return;
    var L = layerOf(e.layer); if (L && L.locked) return;
    t.grips(e).forEach(function (g) { out.push({ ent: id, gid: g.id, kind: g.kind, pt: g.pt, grip: g }); });
  });
  return out;
};
GR.hit = function (p, tol, ids) {
  var best = null;
  GR.list(ids).forEach(function (g) { var d = dist(p, g.pt); if (d <= tol && (!best || d < best.d)) best = { d: d, g: g }; });
  return best && best.g;
};
GR.patch = function (entId, gid, q) {
  var e = ENTS().get(entId), t = e && TY(e.type), gs = t && t.grips ? t.grips(e) : [], i;
  for (i = 0; i < gs.length; i++) if (gs[i].id === gid) return gs[i].move(e, q);
  return null;
};
GR.apply = function (entId, gid, q, copy) {
  var p = GR.patch(entId, gid, q); if (!p) return false;
  if (copy) { var n = cp(ENTS().get(entId)), k; delete n.id; for (k in p) n[k] = cp(p[k]); batch('Grip (cópia)', { add: [n] }); }
  else batch('Grip', { update: [{ id: entId, patch: p }] });
  return true;
};
GR.begin = async function (hit) { // P1 chama no mouse-down sobre um grip: arrasta com preview até o clique
  var e = ENTS().get(hit.ent), copyMode = false, done = false;
  try {
    while (!done) {
      var r = await IN().point('Novo ponto ou [Copiar]', { base: hit.pt, keywords: ['Copiar'], preview: function (q) { var p = GR.patch(hit.ent, hit.gid, q), n = cp(e), k; for (k in (p || {})) n[k] = cp(p[k]); return n; } });
      if (kw(r, ['Copiar']) === 'Copiar') { copyMode = true; continue; }
      if (!isPt(r)) break;
      GR.apply(hit.ent, hit.gid, r, copyMode); done = !copyMode;
    }
  } catch (x) { if (!isCancel(x)) throw x; }
};
if (CAD.render && CAD.render.overlay && CAD.render.overlay.register) { // opcional: quadradinhos nos grips
  CAD.render.overlay.register(function (ctx, view) {
    ctx.save(); ctx.fillStyle = '#1e6bff'; ctx.strokeStyle = '#ffffff';
    GR.list().forEach(function (g) { var s = view.toScreen(g.pt); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); ctx.strokeRect(s.x - 3, s.y - 3, 6, 6); });
    ctx.restore();
  });
}

/* ---------- entrada ---------- */
function askPt(prompt, o) { return IN().point(prompt, o || {}); }
async function askNum(prompt, o) { var r = await IN().number(prompt, o || {}); return toNum(r); }
async function askKw(prompt, list, dflt) { var r = await IN().keyword(prompt, { keywords: list, options: list, default: dflt }); return kw(r, list) || (r === null || r === undefined ? null : null); }
async function askSel(prompt) { var s = selIds(); if (s.length) return s; return normIds(await IN().select(prompt, {})); }
async function pickEnt(prompt, filter) {
  var r = await askPt(prompt, {}); if (!isPt(r)) return null;
  var e = entAt(r, pickTol(), filter); if (!e) { say('Nenhum objeto encontrado.'); return null; }
  return { e: e, pt: r };
}
function guard(fn) { return async function () { try { await fn(); } catch (x) { if (isCancel(x)) return; throw x; } }; }
function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

/* ---------- comandos de edição ---------- */
var cmdBreak = guard(async function () {
  var s = await pickEnt('BREAK Selecione o objeto'); if (!s) return;
  var p1 = s.pt, r = await askPt('Segundo ponto de interrupção ou [Primeiro ponto]', { keywords: ['Primeiro'] });
  if (kw(r, ['Primeiro']) === 'Primeiro') { p1 = await askPt('Primeiro ponto de interrupção'); if (!isPt(p1)) return; r = await askPt('Segundo ponto de interrupção', { base: p1 }); }
  if (!isPt(r)) return;
  var pcs = breakEnt(s.e, p1, r);
  if (pcs === null) { say('Não é possível interromper este objeto assim.'); return; }
  batch('Quebrar', { remove: [s.e.id], add: pcs });
});
var cmdBreakAt = guard(async function () {
  var s = await pickEnt('BREAKATPOINT Selecione o objeto'); if (!s) return;
  var p = await askPt('Ponto de interrupção', { base: s.pt }); if (!isPt(p)) return;
  var pcs = breakEnt(s.e, p, null);
  if (pcs === null || pcs.length < 2) { say('Não é possível interromper este objeto neste ponto.'); return; }
  batch('Quebrar no ponto', { remove: [s.e.id], add: pcs });
});
var cmdLengthen = guard(async function () {
  var K = ['Delta', 'Porcentagem', 'Total'], m = await askKw('LENGTHEN Opção [Delta/Porcentagem/Total] <Delta>', K, 'Delta') || 'Delta';
  var v = await askNum(m === 'Delta' ? 'Variação de comprimento' : m === 'Porcentagem' ? 'Porcentagem do comprimento' : 'Comprimento total', {});
  if (v === null) return;
  if ((m === 'Porcentagem' || m === 'Total') && !(v > 0)) { say('Valor deve ser maior que zero.'); return; }
  for (;;) {
    var s = await pickEnt('Selecione o objeto perto da extremidade (Enter para sair)', function (e) { return ['line', 'arc', 'pline'].indexOf(e.type) >= 0; });
    if (!s) return;
    var p = lengthenPatch(s.e, s.pt, m, v);
    if (!p) { say('Não foi possível alongar/encurtar este objeto.'); continue; }
    batch('Alongar', { update: [{ id: s.e.id, patch: p }] });
  }
});
var cmdAlign = guard(async function () {
  var ids = await askSel('ALIGN Selecione objetos'); if (!ids.length) return;
  var s1 = await askPt('Primeiro ponto de origem'); if (!isPt(s1)) return;
  var d1 = await askPt('Primeiro ponto de destino', { base: s1 }); if (!isPt(d1)) return;
  var s2 = await askPt('Segundo ponto de origem (Enter para só mover)', { base: s1 }), m;
  if (!isPt(s2)) m = mT(d1.x - s1.x, d1.y - s1.y);
  else {
    var d2 = await askPt('Segundo ponto de destino', { base: d1 }); if (!isPt(d2)) return;
    var sc = (await askKw('Escalar objetos pelos pontos de alinhamento? [Sim/Não] <Não>', ['Sim', 'Não'], 'Não')) === 'Sim';
    if (dist(s1, s2) < EPS) { say('Pontos de origem coincidentes.'); return; }
    var k = sc ? dist(d1, d2) / dist(s1, s2) : 1;
    m = mMul(mT(d1.x, d1.y), mMul(mR(ang(d1, d2) - ang(s1, s2)), mMul(mS(k), mT(-s1.x, -s1.y))));
  }
  var up = [];
  entsOf(ids).forEach(function (e) { var p = xpatch(e, m); if (p) up.push({ id: e.id, patch: p }); });
  if (up.length) batch('Alinhar', { update: up }); else say('Nenhum objeto pôde ser alinhado.');
});
var cmdReverse = guard(async function () {
  var ids = await askSel('REVERSE Selecione linhas, polilinhas ou splines'), up = [], skip = 0;
  entsOf(ids).forEach(function (e) {
    if (e.type === 'line') up.push({ id: e.id, patch: { p1: pt(e.p2), p2: pt(e.p1) } });
    else if (e.type === 'pline') up.push({ id: e.id, patch: { pts: revPts(toPath(e).pts, !!e.closed) } });
    else if (e.type === 'spline') up.push({ id: e.id, patch: { fit: clone(e.fit).reverse() } });
    else skip++;
  });
  if (skip) say(skip + ' objeto(s) ignorado(s).');
  if (up.length) batch('Inverter', { update: up });
});
var cmdPedit = guard(async function () {
  var s = await pickEnt('PEDIT Selecione a polilinha', function (e) { return ['pline', 'line', 'arc'].indexOf(e.type) >= 0; }); if (!s) return;
  var e = s.e, id = e.id;
  if (e.type !== 'pline') {
    var yn = await askKw('Transformar em polilinha? [Sim/Não] <Sim>', ['Sim', 'Não'], 'Sim');
    if (yn === 'Não') return;
    var path = toPath(e), nid = batch('Converter em polilinha', { remove: [id], add: [inherit(e, { type: 'pline', pts: path.pts, closed: false })] })[0];
    id = nid;
  }
  for (;;) {
    e = ENTS().get(id); if (!e) return;
    var K = [e.closed ? 'Abrir' : 'Fechar', 'Juntar', 'Retificar', 'Spline', 'Sair'];
    var o = await askKw('Opção [' + K.join('/') + ']', K, 'Sair');
    if (!o || o === 'Sair') return;
    if (o === 'Fechar') { if ((e.pts || []).length < 3) say('Vértices insuficientes para fechar.'); else batch('Fechar polilinha', { update: [{ id: id, patch: { closed: true } }] }); }
    else if (o === 'Abrir') batch('Abrir polilinha', { update: [{ id: id, patch: { closed: false } }] });
    else if (o === 'Retificar') batch('Retificar polilinha', { update: [{ id: id, patch: { pts: e.pts.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0, bulge: 0 }; }) } }] });
    else if (o === 'Spline') {
      var sp = inherit(e, { type: 'spline', fit: e.pts.map(function (p) { return pt(p); }), closed: !!e.closed });
      id = batch('Polilinha em spline', { remove: [id], add: [sp] })[0]; say('Convertida em spline (ajuste pelos vértices).'); return;
    } else if (o === 'Juntar') {
      if (e.closed) { say('Polilinha fechada não pode receber junção.'); continue; }
      var sel = normIds(await IN().select('Selecione objetos para juntar', {})).filter(function (x) { return x !== id; });
      var others = entsOf(sel).filter(function (x) { return toPath(x) && x.type !== 'circle'; }).map(function (x) { return { id: x.id, path: toPath(x) }; });
      var bb = bboxUnion([e].concat(entsOf(sel))), fz = Math.max((bb.max.x - bb.min.x), (bb.max.y - bb.min.y), 1) * 1e-7;
      var j = joinChain(toPath(e), others, fz);
      if (!j.used.length) { say('Nenhum objeto conectado.'); continue; }
      batch('Juntar', { update: [{ id: id, patch: { pts: j.pts, closed: j.closed } }], remove: j.used });
      say(j.used.length + ' objeto(s) juntado(s).');
    }
  }
});
var cmdEditVertex = guard(async function () {
  var s = await pickEnt('EDITVERTEX Selecione a polilinha perto do vértice', function (e) { return e.type === 'pline'; }); if (!s) return;
  var id = s.e.id, idx = 0, bd = Infinity;
  s.e.pts.forEach(function (p, i) { var d = dist(p, s.pt); if (d < bd) { bd = d; idx = i; } });
  for (;;) {
    var e = ENTS().get(id); if (!e) return;
    var v = clone(e.pts), n = v.length, K = ['Próximo', 'Anterior', 'Mover', 'Inserir', 'Excluir', 'Bulge', 'Sair'];
    var o = await askKw('Vértice ' + (idx + 1) + '/' + n + ' [' + K.join('/') + ']', K, 'Sair');
    if (!o || o === 'Sair') return;
    if (o === 'Próximo') idx = (idx + 1) % n;
    else if (o === 'Anterior') idx = (idx - 1 + n) % n;
    else if (o === 'Mover') { var q = await askPt('Nova posição', { base: v[idx] }); if (isPt(q)) { v[idx].x = q.x; v[idx].y = q.y; batch('Mover vértice', { update: [{ id: id, patch: { pts: v } }] }); } }
    else if (o === 'Inserir') {
      var q2 = await askPt('Posição do novo vértice', { base: v[idx] });
      if (isPt(q2)) { v[idx].bulge = 0; v.splice(idx + 1, 0, { x: q2.x, y: q2.y, z: q2.z || 0, bulge: 0 }); batch('Inserir vértice', { update: [{ id: id, patch: { pts: v } }] }); idx++; }
    } else if (o === 'Excluir') {
      if (n <= 2) { say('A polilinha precisa de ao menos 2 vértices.'); continue; }
      var prev = (idx - 1 + n) % n; if (e.closed || idx > 0) v[prev].bulge = 0;
      v.splice(idx, 1); batch('Excluir vértice', { update: [{ id: id, patch: { pts: v } }] }); idx = Math.min(idx, v.length - 1);
    } else if (o === 'Bulge') {
      if (!e.closed && idx === n - 1) { say('O último vértice de polilinha aberta não tem segmento seguinte.'); continue; }
      var b = await askNum('Bulge do segmento <' + num(v[idx].bulge, 0) + '> (0 = reto, 1 = semicírculo)', { default: num(v[idx].bulge, 0) });
      if (b !== null) { v[idx].bulge = b; batch('Bulge do segmento', { update: [{ id: id, patch: { pts: v } }] }); }
    }
  }
});
var cmdBase = guard(async function () {
  var p = await askPt('BASE Ponto base do desenho'); if (!isPt(p)) return;
  var d = DOC(), old = d.basepoint === undefined ? undefined : cp(d.basepoint), nv = pt(p);
  var apply = function () { d.basepoint = cp(nv); }, undo = function () { if (old === undefined) delete d.basepoint; else d.basepoint = cp(old); };
  if (!env && CAD.history && CAD.history.run) CAD.history.run({ name: 'Ponto base', do: apply, undo: undo }); else apply();
});
var cmdArrayRect = guard(async function () {
  var ids = await askSel('ARRAYRECT Selecione objetos'), ents = entsOf(ids); if (!ents.length) return;
  var st = X.settings.arr = X.settings.arr || { rows: 3, cols: 4, n: 6 };
  var cols = await askNum('Número de colunas <' + st.cols + '>', { default: st.cols, min: 1, integer: true }), rows = await askNum('Número de linhas <' + st.rows + '>', { default: st.rows, min: 1, integer: true });
  cols = Math.round(cols === null ? st.cols : cols); rows = Math.round(rows === null ? st.rows : rows);
  if (cols < 1 || rows < 1 || cols * rows > 100000) { say('Quantidade inválida.'); return; }
  var dx = await askNum('Distância entre colunas', {}), dy = await askNum('Distância entre linhas', {}); if (dx === null || dy === null) return;
  var a = await askNum('Ângulo do eixo <0>', { default: 0 }); st.cols = cols; st.rows = rows;
  var out = X.arrayRect(ents, rows, cols, dx, dy, a === null ? 0 : a);
  if (!out.length) { say('Nada a criar.'); return; }
  batch('Arranjo retangular', { add: out });
});
var cmdArrayPolar = guard(async function () {
  var ids = await askSel('ARRAYPOLAR Selecione objetos'), ents = entsOf(ids); if (!ents.length) return;
  var st = X.settings.arr = X.settings.arr || { rows: 3, cols: 4, n: 6 };
  var c = await askPt('Centro do arranjo'); if (!isPt(c)) return;
  var n = await askNum('Número de itens <' + st.n + '>', { default: st.n, min: 2, integer: true }); n = Math.round(n === null ? st.n : n);
  var f = await askNum('Ângulo a preencher <360>', { default: 360 }); f = f === null ? 360 : f;
  if (n < 2 || n > 100000 || Math.abs(f) < EPS) { say('Parâmetros inválidos.'); return; }
  var rot = (await askKw('Girar itens? [Sim/Não] <Sim>', ['Sim', 'Não'], 'Sim')) !== 'Não'; st.n = n;
  batch('Arranjo polar', { add: X.arrayPolar(ents, c, n, f, rot) });
});
var cmdArrayPath = guard(async function () {
  var ids = await askSel('ARRAYPATH Selecione objetos'), ents = entsOf(ids); if (!ents.length) return;
  var s = await pickEnt('Selecione o caminho', function (e) { return !!pathSampler(e) && ids.indexOf(e.id) < 0; }); if (!s) return;
  var m = (await askKw('Método [Contar/Medir] <Contar>', ['Contar', 'Medir'], 'Contar')) || 'Contar';
  var v = await askNum(m === 'Contar' ? 'Número de itens' : 'Distância entre itens', { min: 0 });
  if (v === null || !(v > 0)) { say('Valor inválido.'); return; }
  if (m === 'Contar' && v > 100000) { say('Quantidade excessiva.'); return; }
  var al = (await askKw('Alinhar itens ao caminho? [Sim/Não] <Sim>', ['Sim', 'Não'], 'Sim')) !== 'Não';
  var out = X.arrayPath(ents, s.e, m, v, al);
  if (!out || !out.length) { say('Nada a criar.'); return; }
  batch('Arranjo em caminho', { add: out });
});
var cmdArray = guard(async function () {
  var k = await askKw('ARRAY Tipo [Retangular/Polar/Caminho] <Retangular>', ['Retangular', 'Polar', 'Caminho'], 'Retangular');
  return (k === 'Polar' ? cmdArrayPolar : k === 'Caminho' ? cmdArrayPath : cmdArrayRect)();
});

/* ---------- desenho: xline, ray, donut, boundary, region ---------- */
var cmdXline = guard(async function () {
  var K = ['Hor', 'Ver', 'Ang', 'Bisect'], r = await askPt('XLINE Ponto base ou [Hor/Ver/Ang/Bisect]', { keywords: K }), k = kw(r, K), dir = null, p;
  async function through(base, d0) {
    for (;;) {
      var q = await askPt('Ponto de passagem' + (d0 ? '' : '') + ' (Enter para sair)', { base: base, preview: d0 ? null : function (z) { var u = unit(P(z.x - base.x, z.y - base.y)); return u && mk('xline', { p: pt(base), dir: u }); } });
      if (!isPt(q)) return;
      var u = d0 || unit(P(q.x - base.x, q.y - base.y));
      if (!u) { say('Ponto coincide com o ponto base.'); continue; }
      batch('Linha de construção', { add: [mk('xline', { p: d0 ? pt(q) : pt(base), dir: u })] });
    }
  }
  if (k === 'Hor' || k === 'Ver' || k === 'Ang') {
    var a;
    if (k === 'Ang') { a = toNum(await IN().angle('Ângulo da linha', {})); if (a === null) return; } else a = k === 'Hor' ? 0 : 90;
    var d = P(Math.cos(a * D2R), Math.sin(a * D2R));
    for (;;) {
      var q = await askPt('Ponto de passagem (Enter para sair)', { preview: function (z) { return mk('xline', { p: pt(z), dir: d }); } });
      if (!isPt(q)) return;
      batch('Linha de construção', { add: [mk('xline', { p: pt(q), dir: d })] });
    }
  }
  if (k === 'Bisect') {
    var v = await askPt('Vértice do ângulo'); if (!isPt(v)) return;
    var s = await askPt('Ponto no primeiro lado', { base: v }); if (!isPt(s)) return;
    var e = await askPt('Ponto no segundo lado', { base: v }); if (!isPt(e)) return;
    var u1 = unit(P(s.x - v.x, s.y - v.y)), u2 = unit(P(e.x - v.x, e.y - v.y));
    if (!u1 || !u2) { say('Pontos coincidentes com o vértice.'); return; }
    var bis = unit(P(u1.x + u2.x, u1.y + u2.y)) || P(-u1.y, u1.x);
    batch('Linha de construção', { add: [mk('xline', { p: pt(v), dir: bis })] }); return;
  }
  if (!isPt(r)) return;
  await through(r, null);
});
var cmdRay = guard(async function () {
  var p = await askPt('RAY Ponto inicial'); if (!isPt(p)) return;
  for (;;) {
    var q = await askPt('Ponto de passagem (Enter para sair)', { base: p, preview: function (z) { var u = unit(P(z.x - p.x, z.y - p.y)); return u && mk('ray', { p: pt(p), dir: u }); } });
    if (!isPt(q)) return;
    var u = unit(P(q.x - p.x, q.y - p.y));
    if (!u) { say('Ponto coincide com o início.'); continue; }
    batch('Raio', { add: [mk('ray', { p: pt(p), dir: u })] });
  }
});
function circLoop(c, r) { return { pts: [{ x: c.x + r, y: c.y, z: c.z || 0, bulge: 1 }, { x: c.x - r, y: c.y, z: c.z || 0, bulge: 1 }] }; }
var cmdDonut = guard(async function () {
  var st = X.settings, di = await askNum('DONUT Diâmetro interno <' + st.donutIn + '>', { default: st.donutIn, min: 0 }), dout;
  di = di === null ? st.donutIn : di;
  dout = await askNum('Diâmetro externo <' + st.donutOut + '>', { default: st.donutOut, min: 0 }); dout = dout === null ? st.donutOut : dout;
  if (!(dout > 0) || di < 0 || di >= dout) { say('Diâmetros inválidos (externo deve ser maior que o interno).'); return; }
  st.donutIn = di; st.donutOut = dout;
  for (;;) {
    var c = await askPt('Centro do donut (Enter para sair)', { preview: function (z) { return mk('region', { loops: di > 0 ? [circLoop(z, dout / 2), circLoop(z, di / 2)] : [circLoop(z, dout / 2)], fill: true }); } });
    if (!isPt(c)) return;
    batch('Donut', { add: [mk('region', { loops: di > 0 ? [circLoop(c, dout / 2), circLoop(c, di / 2)] : [circLoop(c, dout / 2)], fill: true })] });
  }
});
var cmdBoundary = guard(async function () {
  var st = X.settings;
  for (;;) {
    var r = await askPt('BOUNDARY Ponto interno ou [Objeto] (Enter para sair)', { keywords: ['Objeto'] });
    if (kw(r, ['Objeto']) === 'Objeto') { var m = await askKw('Tipo de objeto [Polilinha/Região] <' + st.boundObj + '>', ['Polilinha', 'Região'], st.boundObj); if (m) st.boundObj = m; continue; }
    if (!isPt(r)) return;
    var res = boundaryAt(r);
    if (!res) { say('Não foi possível determinar um contorno fechado.'); continue; }
    var pts = res.circle ? circLoop(res.circle.c, res.circle.r).pts : res.pts.map(function (p) { return { x: p.x, y: p.y, z: 0, bulge: 0 }; });
    batch('Contorno', { add: [st.boundObj === 'Região' ? mk('region', { loops: [{ pts: pts }], fill: false }) : mk('pline', { pts: pts, closed: true })] });
  }
});
function closedLoop(e) {
  if (e.type === 'circle') return circLoop(e.c, e.r);
  if (e.type === 'pline' && e.closed && (e.pts || []).length >= 2) return { pts: toPath(e).pts };
  if (e.type === 'ellipse' && CAD.draw && CAD.draw.tess) { var t = CAD.draw.tess(e, 0.001); if (t.closed) return { pts: t.pts.map(function (p) { return { x: p.x, y: p.y, z: 0, bulge: 0 }; }) }; }
  return null;
}
var cmdRegion = guard(async function () {
  var ids = await askSel('REGION Selecione objetos fechados'), add = [], rem = [], bad = 0;
  entsOf(ids).forEach(function (e) { var l = closedLoop(e); if (l) { add.push(mk('region', { loops: [l], fill: false })); rem.push(e.id); } else bad++; });
  if (bad) say(bad + ' objeto(s) não fechado(s) ignorado(s).');
  if (!add.length) return;
  batch('Região', { add: add, remove: X.settings.delobj ? rem : [] });
});

/* ---------- seleção ---------- */
function addSel(ids) { selSet(uniq(selIds().concat(ids))); say(ids.length + ' objeto(s) encontrado(s); ' + selIds().length + ' selecionado(s).'); }
var cmdFence = guard(async function () {
  var a = await askPt('FENCE Primeiro ponto da cerca'); if (!isPt(a)) return;
  var poly = [a];
  for (;;) {
    var r = await askPt('Próximo ponto da cerca (Enter para concluir)', { base: poly[poly.length - 1], preview: function (q) { return mk('pline', { pts: poly.concat([q]).map(function (p) { return { x: p.x, y: p.y, z: 0, bulge: 0 }; }), closed: false }); } });
    if (!isPt(r)) break; poly.push(r);
  }
  if (poly.length < 2) return;
  addSel(SX.fence(poly));
});
var cmdLasso = guard(async function () {
  var st = X.settings, K = ['Janela', 'Cruzamento'], a = await askPt('LASSO Primeiro ponto ou [Janela/Cruzamento] <' + st.lassoMode + '>', { keywords: K });
  while (kw(a, K)) { st.lassoMode = kw(a, K); a = await askPt('Primeiro ponto do laço (' + st.lassoMode + ')', { keywords: K }); }
  if (!isPt(a)) return;
  var poly = [a];
  for (;;) {
    var r = await askPt('Próximo ponto do laço (Enter para concluir)', { base: poly[poly.length - 1] });
    if (!isPt(r)) break; poly.push(r);
  }
  if (poly.length < 3) { say('O laço precisa de ao menos 3 pontos.'); return; }
  addSel(SX.lasso(poly, st.lassoMode));
});
var cmdSelSimilar = guard(async function () {
  var refs = selIds();
  if (!refs.length) { var s = await pickEnt('SELECTSIMILAR Selecione um objeto de referência'); if (!s) return; refs = [s.e.id]; }
  addSel(SX.similar(refs));
});
var cmdSelLayer = guard(async function () {
  var s = await pickEnt('SELBYLAYER Selecione um objeto (Enter para digitar o nome da layer)'), name;
  if (s) name = s.e.layer; else { name = await IN().string('Nome da layer', {}); if (!name) return; }
  addSel(SX.byLayer(name));
});
var cmdSelType = guard(async function () {
  var s = await pickEnt('SELBYTYPE Selecione um objeto (Enter para digitar o tipo)'), t;
  if (s) t = s.e.type; else { t = await IN().string('Tipo (line, circle, pline...)', {}); if (!t) return; }
  addSel(SX.byType(String(t).toLowerCase()));
});
var cmdQSelect = guard(async function () {
  var t = await IN().string('QSELECT Tipo de objeto (nome ou todos) <todos>', {}); t = t ? String(t).trim().toLowerCase() : 'todos';
  var key = await IN().string('Propriedade (layer, color, lw, ltype ou chave do tipo, ex.: r, length) <layer>', {}); key = key ? String(key).trim() : 'layer';
  var O = ['=', '<>', '>', '<', 'Contém'], op = await askKw('Operador [=/<>/>/</Contém] <=>', O, '=') || '=';
  var val = await IN().string('Valor', {}); if (val === null || val === undefined) return;
  var mode = (await askKw('Aplicar a [Novo/Anexar] <Novo>', ['Novo', 'Anexar'], 'Novo')) || 'Novo';
  var ids = SX.quick({ type: t, key: key, op: plain(op) === 'contem' ? 'contem' : op, value: val });
  if (mode === 'Anexar') addSel(ids); else { selSet(ids); say(ids.length + ' objeto(s) selecionado(s).'); }
});
var cmdGrip = guard(async function () {
  var ids = await askSel('GRIP Selecione objetos'); if (!ids.length) return;
  var p = await askPt('Clique em um grip'); if (!isPt(p)) return;
  var h = GR.hit(p, pickTol(), ids);
  if (!h) { say('Nenhum grip neste ponto.'); return; }
  await GR.begin(h);
});

/* ---------- registro ---------- */
function regCmds() {
  if (!CAD.cmd || !CAD.cmd.register) return;
  [['BREAK', ['BR'], cmdBreak], ['BREAKATPOINT', ['BAP'], cmdBreakAt], ['LENGTHEN', ['LEN'], cmdLengthen], ['ALIGN', ['AL'], cmdAlign],
    ['REVERSE', ['REV'], cmdReverse], ['PEDIT', ['PE'], cmdPedit], ['EDITVERTEX', ['PEV'], cmdEditVertex], ['BASE', [], cmdBase],
    ['ARRAY', ['AR'], cmdArray], ['ARRAYRECT', [], cmdArrayRect], ['ARRAYPOLAR', [], cmdArrayPolar], ['ARRAYPATH', [], cmdArrayPath],
    ['XLINE', ['XL'], cmdXline], ['RAY', [], cmdRay], ['DONUT', ['DO'], cmdDonut], ['BOUNDARY', ['BO'], cmdBoundary], ['REGION', ['REG'], cmdRegion],
    ['FENCE', [], cmdFence], ['LASSO', [], cmdLasso], ['SELECTSIMILAR', ['SELSIM'], cmdSelSimilar], ['SELBYLAYER', [], cmdSelLayer],
    ['SELBYTYPE', [], cmdSelType], ['QSELECT', ['QS'], cmdQSelect], ['GRIP', [], cmdGrip]
  ].forEach(function (c) { CAD.cmd.register({ name: c[0], alias: c[1], run: c[2] }); });
}
function regUI() {
  var M = [['Modificar', 'Interromper', 'BREAK'], ['Modificar', 'Interromper no ponto', 'BREAKATPOINT'], ['Modificar', 'Alongar', 'LENGTHEN'], ['Modificar', 'Alinhar', 'ALIGN'],
    ['Modificar', 'Inverter', 'REVERSE'], ['Modificar', 'Editar polilinha', 'PEDIT'], ['Modificar', 'Editar vértice', 'EDITVERTEX'], ['Modificar', 'Arranjo', 'ARRAY'],
    ['Modificar', 'Editar grip', 'GRIP'], ['Desenhar', 'Linha de construção', 'XLINE'], ['Desenhar', 'Raio', 'RAY'], ['Desenhar', 'Donut', 'DONUT'],
    ['Desenhar', 'Contorno', 'BOUNDARY'], ['Desenhar', 'Região', 'REGION'], ['Formatar', 'Ponto base', 'BASE'], ['Selecionar', 'Cerca', 'FENCE'], ['Selecionar', 'Laço', 'LASSO'],
    ['Selecionar', 'Similares', 'SELECTSIMILAR'], ['Selecionar', 'Por layer', 'SELBYLAYER'], ['Selecionar', 'Por tipo', 'SELBYTYPE'], ['Selecionar', 'Seleção rápida', 'QSELECT']];
  M.forEach(function (m) { try { if (CAD.ui && CAD.ui.menu && CAD.ui.menu.add) CAD.ui.menu.add(m[0], m[1], m[2]); } catch (x) { /* degrada */ } });
  [['Linha de construção', 'XLINE', '↔'], ['Contorno', 'BOUNDARY', '⬚'], ['Arranjo', 'ARRAY', '⁙'], ['Interromper', 'BREAK', '⌿'], ['Alongar', 'LENGTHEN', '⇔'], ['Alinhar', 'ALIGN', '⇥']]
    .forEach(function (t) { try { if (CAD.ui && CAD.ui.toolbar && CAD.ui.toolbar.add) CAD.ui.toolbar.add('Extras', { icone: t[2], rotulo: t[0], cmd: t[1] }); } catch (x) { /* degrada */ } });
}
regCmds(); regUI();

X.breakEnt = breakEnt; X.lengthenPatch = lengthenPatch; X.joinChain = joinChain; X.toPath = toPath; X.revPts = revPts; X.defs = LOCAL;
X.cmds = { BREAK: cmdBreak, BREAKATPOINT: cmdBreakAt, LENGTHEN: cmdLengthen, ALIGN: cmdAlign, REVERSE: cmdReverse, PEDIT: cmdPedit, EDITVERTEX: cmdEditVertex, BASE: cmdBase,
  ARRAYRECT: cmdArrayRect, ARRAYPOLAR: cmdArrayPolar, ARRAYPATH: cmdArrayPath, ARRAY: cmdArray, XLINE: cmdXline, RAY: cmdRay, DONUT: cmdDonut, BOUNDARY: cmdBoundary,
  REGION: cmdRegion, FENCE: cmdFence, LASSO: cmdLasso, SELECTSIMILAR: cmdSelSimilar, SELBYLAYER: cmdSelLayer, SELBYTYPE: cmdSelType, QSELECT: cmdQSelect, GRIP: cmdGrip };
X._setEnv = function (e) { env = e; };

/* ---------- testes ---------- */
CAD.tests = CAD.tests || {};
CAD.tests.p14 = async function () {
  var ok = 0, bad = 0;
  function A(c, m) { if (c) ok++; else { bad++; console.error('FALHA P14:', m); } }
  function near(a, b, t, m) { A(Math.abs(a - b) <= (t || 1e-6), m + ' (' + a + ' ≠ ' + b + ')'); }
  if (!(CAD.draw && CAD.draw.defs)) { console.warn('CAD.tests.p14: carregue a P5 antes (tipos line/circle/arc/pline).'); return { ok: 0, bad: 1 }; }
  var D = CAD.draw.defs, R = Math.PI / 180;
  // fábrica de ambiente em memória
  function mkEnv(list) {
    var m = {}, n = 0, cur = [];
    var E = {
      all: function () { return Object.keys(m).map(function (k) { return m[k]; }); },
      get: function (id) { return m[id] || null; },
      add: function (s) { var id = s.id !== undefined ? s.id : 'e' + (++n); var c = cp(s); c.id = id; m[id] = c; return id; },
      remove: function (id) { delete m[id]; },
      update: function (id, p) { var k; for (k in p) { if (p[k] === undefined) delete m[id][k]; else m[id][k] = cp(p[k]); } }
    };
    (list || []).forEach(function (s) { var c = cp(s); if (!c.layer) c.layer = '0'; c.space = 'model'; E.add(c); });
    return { ents: E, doc: { layers: [{ name: '0', on: true }, { name: 'A', on: true }, { name: 'B', on: true }, { name: 'Z', on: true, locked: true }], current: { layer: '0' } },
      sel: { ids: function () { return cur.slice(); }, set: function (a) { cur = a.slice(); } }, tol: 0.1, msgs: [] };
  }
  var L = function (x1, y1, x2, y2, layer) { return { type: 'line', p1: { x: x1, y: y1, z: 0 }, p2: { x: x2, y: y2, z: 0 }, layer: layer || '0' }; };
  var p = function (x, y) { return { x: x, y: y, z: 0 }; };
  var Cc = function (x, y, r, layer) { return { type: 'circle', c: p(x, y), r: r, layer: layer || '0' }; };
  var PL = function (v, closed) { return { type: 'pline', pts: v.map(function (q) { return { x: q[0], y: q[1], z: 0, bulge: q[2] || 0 }; }), closed: !!closed, layer: '0' }; };
  function run(name, script, list) {
    var e = mkEnv(list), sc = script.slice();
    e.input = {
      point: async function () { var v = sc.length ? sc.shift() : null; if (typeof v === 'function') v(); return v; },
      number: async function () { return sc.length ? sc.shift() : null; }, angle: async function () { return sc.length ? sc.shift() : null; },
      keyword: async function () { return sc.length ? sc.shift() : null; }, string: async function () { return sc.length ? sc.shift() : null; },
      select: async function () { return sc.length ? sc.shift() : null; }
    };
    e.print = function (m) { e.msgs.push(m); };
    env = e;
    return X.cmds[name]().then(function () { env = null; return e; }, function (x) { env = null; throw x; });
  }
  var all = function (e) { return e.ents.all(); }, of = function (e, t) { return all(e).filter(function (x) { return x.type === t; }); };

  // ---- tipos novos ----
  var xl = { type: 'xline', p: p(0, 0), dir: p(1, 0) }, ry = { type: 'ray', p: p(0, 0), dir: p(0, 1) };
  var T = LOCAL;
  A(T.xline.hit(xl, p(500, 0.05), 0.1) && !T.xline.hit(xl, p(5, 1), 0.1), 'hit xline infinita');
  A(T.ray.hit(ry, p(0, 50), 0.1) && !T.ray.hit(ry, p(0, -50), 0.1), 'hit ray só para frente');
  var tx = T.xline.transform(xl, mkM(0, 1, -1, 0, 3, 0)); near(tx.dir.y, 1, 1e-9, 'xline gira dir'); near(tx.p.x, 3, 1e-9, 'xline translada');
  tx = T.xline.transform(xl, [2, 0, 0, 1, 0, 0]); near(tx.dir.x, 1, 1e-9, 'xline dir normalizada');
  near(T.xline.props(xl)[1].set(xl, 90).dir.y, 1, 1e-9, 'set ângulo xline');
  var xd = T.ray.fromDXF(T.ray.toDXF(ry)); A(xd.type === 'ray' && Math.abs(xd.dir.y - 1) < 1e-9, 'dxf ray');
  A(T.xline.toDXF(xl).etype === 'XLINE' && /<line /.test(T.xline.toSVG(xl)), 'dxf/svg xline');
  A(T.xline.bbox(xl).max.x === 0, 'bbox de xline não é infinito');
  var ring = { type: 'region', loops: [circLoop(p(0, 0), 2), circLoop(p(0, 0), 1)], fill: true };
  near(T.region.props(ring)[2].value, Math.PI * 3, 1e-9, 'área do donut'); near(T.region.props(ring)[3].value, 2 * Math.PI * 3, 1e-9, 'perímetro do donut');
  A(T.region.hit(ring, p(1.5, 0), 0.01) && !T.region.hit(ring, p(0.2, 0), 0.01) && !T.region.hit(ring, p(5, 0), 0.01), 'hit região preenchida (anel)');
  A(!T.region.hit({ type: 'region', loops: ring.loops, fill: false }, p(1.5, 0), 0.01), 'região sem preenchimento só pelo contorno');
  var tr = T.region.transform(ring, [1, 0, 0, 1, 10, 0]); near(tr.loops[0].pts[0].x, 12, 1e-9, 'região translada');
  A(T.region.explode(ring).length === 2 && T.region.toDXF(ring).items.length === 2 && /evenodd/.test(T.region.toSVG(ring)), 'região: explode/dxf/svg');
  near(T.region.bbox(ring).max.x, 2, 1e-3, 'bbox região');

  // ---- break ----
  var pcs = breakEnt({ type: 'line', p1: p(0, 0), p2: p(10, 0), layer: 'A' }, p(3, 0), p(6, 0));
  A(pcs.length === 2 && pcs[0].p2.x === 3 && pcs[1].p1.x === 6 && pcs[0].layer === 'A', 'break de linha entre 2 pontos');
  pcs = breakEnt({ type: 'line', p1: p(0, 0), p2: p(10, 0) }, p(6, 0), p(3, 0)); A(pcs.length === 2 && pcs[0].p2.x === 3, 'break com pontos invertidos');
  pcs = breakEnt({ type: 'line', p1: p(0, 0), p2: p(10, 0) }, p(4, 0), null); A(pcs.length === 2 && pcs[0].p2.x === 4 && pcs[1].p1.x === 4, 'break at point linha');
  pcs = breakEnt({ type: 'line', p1: p(0, 0), p2: p(10, 0) }, p(0, 0), null); A(pcs === null, 'break at point na extremidade é inválido');
  pcs = breakEnt({ type: 'line', p1: p(0, 0), p2: p(10, 0) }, p(0, 0), p(4, 0)); A(pcs.length === 1 && pcs[0].p1.x === 4, 'break começando na extremidade');
  pcs = breakEnt(Cc(0, 0, 1), p(0, 1), p(0, -1)); A(pcs.length === 1 && pcs[0].type === 'arc', 'break de círculo vira arco'); near(pcs[0].a1, 270, 1e-9, 'círculo: arco começa no 2º ponto'); near(pcs[0].a2, 90, 1e-9, 'círculo: arco termina no 1º ponto');
  A(breakEnt(Cc(0, 0, 1), p(0, 1), null) === null, 'círculo não quebra em um ponto');
  pcs = breakEnt({ type: 'arc', c: p(0, 0), r: 1, a1: 0, a2: 180 }, p(0, 1), null); A(pcs.length === 2 && pcs[0].type === 'arc', 'break at point arco'); near(pcs[0].a2, 90, 1e-9, 'arco parte 1'); near(pcs[1].a1, 90, 1e-9, 'arco parte 2');
  pcs = breakEnt({ type: 'arc', c: p(0, 0), r: 1, a1: 0, a2: 180 }, p(Math.cos(30 * R), Math.sin(30 * R)), p(Math.cos(120 * R), Math.sin(120 * R)));
  near(pcs[0].a2, 30, 1e-6, 'arco: 1ª parte'); near(pcs[1].a1, 120, 1e-6, 'arco: 2ª parte');
  pcs = breakEnt(PL([[0, 0], [10, 0], [10, 10]]), p(5, 0), p(10, 5)); A(pcs.length === 2 && pcs[0].pts.length === 2 && pcs[1].pts[0].y === 5, 'break de pline aberta');
  pcs = breakEnt(PL([[0, 0], [10, 0], [10, 10], [0, 10]], true), p(5, 0), p(5, 10));
  A(pcs.length === 1 && !pcs[0].closed && pcs[0].pts.length === 4, 'pline fechada vira 1 aberta'); near(CAD.draw.plLength(pcs[0]), 20, 1e-9, 'comprimento mantido (40 - 20)');
  pcs = breakEnt(PL([[0, 0, 1], [10, 0]]), p(5, -5), p(10, 0)); A(pcs.length === 1 && Math.abs(pcs[0].pts[0].bulge) > 0, 'break de pline com arco mantém bulge');
  near(CAD.draw.plLength(pcs[0]), Math.PI * 5 / 2, 1e-6, 'meio semicírculo restante (quarto de volta)');
  pcs = breakEnt({ type: 'ellipse', c: p(0, 0), major: p(4, 0), ratio: 0.5, a1: 0, a2: 360 }, p(4, 0), p(-4, 0)); A(pcs.length === 1 && Math.abs(pcs[0].a1 - 180) < 0.2 && pcs[0].a2 < 0.2, 'break de elipse completa');
  A(breakEnt({ type: 'spline', fit: [p(0, 0), p(1, 1)] }, p(0, 0), p(1, 1)) === null, 'spline não suportada');

  // ---- lengthen ----
  var ln = { type: 'line', p1: p(0, 0), p2: p(10, 0) }, lp;
  lp = lengthenPatch(ln, p(9, 0), 'Delta', 5); near(lp.p2.x, 15, 1e-9, 'lengthen delta no fim');
  lp = lengthenPatch(ln, p(1, 0), 'Delta', 2); near(lp.p1.x, -2, 1e-9, 'lengthen delta no início'); near(lp.p2.x, 10, 1e-9, 'início não mexe no fim');
  lp = lengthenPatch(ln, p(9, 0), 'Porcentagem', 50); near(lp.p2.x, 5, 1e-9, 'lengthen 50%');
  lp = lengthenPatch(ln, p(9, 0), 'Total', 3); near(lp.p2.x, 3, 1e-9, 'lengthen total');
  A(lengthenPatch(ln, p(9, 0), 'Delta', -10) === null && lengthenPatch(ln, p(9, 0), 'Delta', -20) === null, 'lengthen inválido (<=0)');
  lp = lengthenPatch({ type: 'arc', c: p(0, 0), r: 1, a1: 0, a2: 90 }, p(0, 1), 'Delta', Math.PI / 2); near(lp.a2, 180, 1e-6, 'lengthen arco no fim'); near(lp.a1, 0, 1e-6, 'arco: início fixo');
  lp = lengthenPatch({ type: 'arc', c: p(0, 0), r: 1, a1: 0, a2: 90 }, p(1, 0), 'Delta', Math.PI / 2); near(lp.a1, 270, 1e-6, 'lengthen arco no início');
  lp = lengthenPatch(PL([[0, 0], [10, 0], [10, 10]]), p(10, 9), 'Delta', 5); near(lp.pts[2].y, 15, 1e-9, 'lengthen pline (último trecho)');
  lp = lengthenPatch(PL([[0, 0], [10, 0], [10, 10]]), p(1, 0), 'Delta', 5); near(lp.pts[0].x, -5, 1e-9, 'lengthen pline (primeiro trecho)');
  A(lengthenPatch(Cc(0, 0, 1), p(1, 0), 'Delta', 1) === null, 'círculo não alonga');

  // ---- join / reverse ----
  var jc = joinChain(toPath(L(0, 0, 5, 0)), [{ id: 'a', path: toPath(L(5, 0, 5, 5)) }, { id: 'b', path: toPath(L(0, 0, 5, 5)) }], 1e-6);
  A(jc.used.length === 2 && jc.closed && jc.pts.length === 3, 'join fecha o triângulo (segmento invertido incluído)');
  jc = joinChain(toPath(L(0, 0, 5, 0)), [{ id: 'a', path: toPath(L(10, 0, 20, 0)) }], 1e-6); A(jc.used.length === 0 && jc.pts.length === 2, 'join ignora desconectados');
  jc = joinChain(toPath(L(5, 0, 10, 0)), [{ id: 'a', path: toPath(L(0, 0, 5, 0)) }], 1e-6); A(jc.pts[0].x === 0 && jc.pts.length === 3 && !jc.closed, 'join no início');
  jc = joinChain(toPath({ type: 'arc', c: p(0, 0), r: 1, a1: 0, a2: 90 }), [{ id: 'a', path: toPath(L(0, 1, 0, 5)) }], 1e-6); A(jc.pts.length === 3 && Math.abs(jc.pts[0].bulge) > 0, 'join arco + linha mantém bulge');
  var rv = revPts([{ x: 0, y: 0, bulge: 1 }, { x: 2, y: 0, bulge: 0 }], false); A(rv[0].x === 2 && rv[0].bulge === -1 && rv[1].bulge === 0, 'reverse inverte bulge');
  rv = revPts([{ x: 0, y: 0, bulge: 0.5 }, { x: 2, y: 0, bulge: 0 }, { x: 2, y: 2, bulge: 0 }], true); A(rv[0].x === 2 && rv[0].y === 2 && rv[1].bulge === -0.5 && rv[0].bulge === 0 && rv[2].bulge === 0, 'reverse fechada leva bulge ao segmento certo');

  // ---- seleção ----
  var S0 = [L(0, 0, 10, 0, 'A'), Cc(20, 0, 1, 'B'), L(0, 5, 10, 5, 'A'), L(50, 50, 60, 50, 'Z')], se = mkEnv(S0); env = se;
  var ids = all(se).map(function (x) { return x.id; });
  var fence = SX.fence([p(5, -1), p(5, 6)]); A(fence.length === 2 && fence.indexOf(ids[1]) < 0, 'fence pega só os cruzados');
  A(SX.lasso([p(-1, -1), p(11, -1), p(11, 6), p(-1, 6)], 'Janela').length === 2, 'lasso janela: só o que está dentro');
  A(SX.lasso([p(5, -1), p(15, -1), p(15, 6), p(5, 6)], 'Janela').length === 0 && SX.lasso([p(5, -1), p(15, -1), p(15, 6), p(5, 6)], 'Cruzamento').length === 2, 'lasso cruzamento pega os parciais');
  A(SX.lasso([p(19, -5), p(21, -5), p(21, 5), p(19, 5)], 'Cruzamento').length === 1, 'lasso pega círculo');
  A(SX.lasso([p(19.5, -0.2), p(20.5, -0.2), p(20.5, 0.2), p(19.5, 0.2)], 'Cruzamento').length === 0, 'lasso dentro do círculo sem tocar a linha: não seleciona');
  A(SX.fence([p(49, 49), p(61, 51)]).length === 0, 'layer bloqueada não é selecionável');
  A(SX.similar([ids[0]]).length === 2 && SX.similar([ids[0]], ['type']).length === 2, 'similares por tipo+layer');
  A(SX.similar([ids[0]], ['type']).indexOf(ids[3]) < 0, 'similares ignoram layer bloqueada');
  A(SX.byLayer('B').length === 1 && SX.byType('line').length === 2, 'por layer e por tipo');
  A(SX.quick({ type: 'line', key: 'length', op: '>', value: '9' }).length === 2 && SX.quick({ type: 'line', key: 'length', op: '>', value: '10' }).length === 0, 'quick: > numérico');
  A(SX.quick({ type: 'todos', key: 'r', op: '=', value: '1' }).length === 1 && SX.quick({ key: 'layer', op: '=', value: 'a' }).length === 2, 'quick: = e layer sem diferenciar maiúsculas');
  A(SX.quick({ key: 'layer', op: '<>', value: 'A' }).length === 1 && SX.quick({ key: 'layer', op: 'contem', value: 'b' }).length === 1, 'quick: <> e contém');
  A(SX.quick({ key: 'color', op: '=', value: 'bylayer' }).length === 3, 'quick: cor ByLayer');
  env = null;

  // ---- arrays ----
  var a1 = [{ type: 'line', p1: p(0, 0), p2: p(1, 0) }], rr = X.arrayRect(a1, 2, 3, 5, 3, 0);
  A(rr.length === 5 && rr.some(function (c) { return c.p1.x === 10 && c.p1.y === 3; }) && rr.every(function (c) { return c.id === undefined; }), 'array retangular 2x3');
  rr = X.arrayRect(a1, 1, 2, 5, 3, 90); near(rr[0].p1.y, 5, 1e-9, 'array retangular com eixo girado'); near(rr[0].p1.x, 0, 1e-9, 'eixo 90°');
  rr = X.arrayRect(a1, 2, 1, 0, -4, 0); near(rr[0].p1.y, -4, 1e-9, 'espaçamento negativo');
  var pr = X.arrayPolar([{ type: 'line', p1: p(1, 0), p2: p(2, 0) }], p(0, 0), 4, 360, true);
  A(pr.length === 3, 'polar n-1 cópias'); near(pr[0].p1.x, 0, 1e-9, 'polar k=1 x'); near(pr[0].p1.y, 1, 1e-9, 'polar k=1 y'); near(pr[1].p1.x, -1, 1e-9, 'polar k=2');
  pr = X.arrayPolar([{ type: 'line', p1: p(1, 0), p2: p(2, 0) }], p(0, 0), 4, 360, false); near(pr[0].p1.x, -0.5, 1e-9, 'polar sem girar: só translada'); near(pr[0].p2.x - pr[0].p1.x, 1, 1e-9, 'polar sem girar mantém orientação');
  pr = X.arrayPolar([{ type: 'point', p: p(2, 0) }], p(0, 0), 3, 180, true); near(pr[1].p.x, -2, 1e-9, 'polar 180° em 3 itens: último oposto');
  var pa = X.arrayPath([Cc(0, 0, 1)], L(0, 0, 10, 0), 'Contar', 3, false); A(pa.length === 2 && Math.abs(pa[0].c.x - 5) < 1e-9 && Math.abs(pa[1].c.x - 10) < 1e-9, 'array em caminho (contar), pula o item da origem');
  pa = X.arrayPath([Cc(0, 0, 1)], L(0, 0, 10, 0), 'Medir', 4, false); A(pa.length === 2 && Math.abs(pa[1].c.x - 8) < 1e-9, 'array em caminho (medir)');
  pa = X.arrayPath([{ type: 'line', p1: p(0, 0), p2: p(1, 0) }], PL([[0, 0], [10, 0], [10, 10]]), 'Contar', 3, true);
  A(pa.length === 3, 'caminho alinhado: ref fora da origem inclui o item 0'); near(pa[2].p1.x, 10, 1e-9, 'caminho alinhado: x'); near(pa[2].p1.y, 9.5, 1e-9, 'caminho alinhado: gira 90°'); near(pa[2].p2.y, 10.5, 1e-9, 'caminho alinhado: ponta');
  pa = X.arrayPath([Cc(0, 0, 1)], { type: 'circle', c: p(0, 0), r: 5, layer: '0' }, 'Contar', 4, false); A(pa.length >= 3, 'caminho fechado (círculo)');
  A(X.arrayPath(a1, { type: 'text' }, 'Contar', 3, false) === null, 'caminho inválido');

  // ---- boundary ----
  env = mkEnv([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0)]);
  var bd = boundaryAt(p(5, 5)); A(bd && bd.pts.length === 4, 'boundary: quadrado de 4 linhas'); near(polyArea(bd.pts), 100, 1e-6, 'boundary: área 100');
  A(boundaryAt(p(50, 50)) === null, 'boundary: ponto fora = nulo');
  env = mkEnv([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0), L(5, -2, 5, 12)]);
  bd = boundaryAt(p(2, 5)); near(polyArea(bd.pts), 50, 1e-6, 'boundary: metade (linhas se cruzando)'); bd = boundaryAt(p(8, 5)); near(polyArea(bd.pts), 50, 1e-6, 'boundary: outra metade');
  env = mkEnv([PL([[0, 0], [10, 0], [10, 10], [0, 10]], true), PL([[4, 4], [6, 4], [6, 6], [4, 6]], true)]);
  bd = boundaryAt(p(1, 1)); near(polyArea(bd.pts), 100, 1e-6, 'boundary: contorno externo com ilha (ilha ignorada)');
  bd = boundaryAt(p(5, 5)); near(polyArea(bd.pts), 4, 1e-6, 'boundary: dentro da ilha');
  env = mkEnv([Cc(0, 0, 2)]); bd = boundaryAt(p(0.5, 0.5)); A(bd && bd.circle && bd.circle.r === 2, 'boundary: círculo único');
  env = mkEnv([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10)]); A(boundaryAt(p(5, 5)) === null, 'boundary: contorno aberto = nulo');
  env = mkEnv([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0), L(3, 3, 3, 8)]); bd = boundaryAt(p(5, 5)); near(polyArea(bd.pts), 100, 1e-6, 'boundary: linha pendente é ignorada');
  env = mkEnv([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), { type: 'arc', c: p(0, 5), r: 5, a1: 270, a2: 90 }]); bd = boundaryAt(p(8, 5));
  A(bd && bd.pts.length > 8, 'boundary: arco aproximado por segmentos'); near(polyArea(bd.pts), 100 - 12.5 * Math.PI, 0.1, 'boundary: arco + linhas (área ≈ 100 − 12,5π)');
  env = null;

  // ---- grips ----
  env = mkEnv([Cc(0, 0, 1), L(0, 0, 4, 0)]); var gi = all(env).map(function (x) { return x.id; }); env.sel.set(gi);
  A(GR.list().length === 5 + 3, 'grips listados (círculo 5 + linha 3)');
  var gh = GR.hit(p(4.01, 0), 0.1); A(gh && gh.ent === gi[1] && gh.gid === 'p2', 'hit de grip'); A(GR.hit(p(2, 2), 0.1) === null, 'sem grip longe');
  GR.apply(gh.ent, gh.gid, p(4, 3), false); near(env.ents.get(gi[1]).p2.y, 3, 1e-9, 'grip move vértice');
  var n0 = all(env).length; GR.apply(gi[0], 'q0', p(3, 0), true); A(all(env).length === n0 + 1 && env.ents.get(gi[0]).r === 1, 'grip em modo cópia mantém o original');
  A(GR.patch(gi[0], 'xx', p(0, 0)) === null, 'grip inexistente');
  env = null;

  // ---- comandos (entrada simulada) ----
  var e;
  e = await run('BREAK', [p(2, 0), p(7, 0)], [L(0, 0, 10, 0)]); A(of(e, 'line').length === 2, 'BREAK: 2 pontos');
  e = await run('BREAK', [p(2, 0), 'Primeiro', p(4, 0), p(6, 0)], [L(0, 0, 10, 0)]); A(of(e, 'line').length === 2 && of(e, 'line').some(function (l) { return l.p2.x === 4; }), 'BREAK: Primeiro ponto');
  e = await run('BREAK', [p(2, 0), p(2, 0)], [L(0, 0, 10, 0)]); A(of(e, 'line').length === 2, 'BREAK: mesmo ponto = no ponto');
  e = await run('BREAK', [p(50, 50)], [L(0, 0, 10, 0)]); A(of(e, 'line').length === 1 && e.msgs.length === 1, 'BREAK: nada sob o clique');
  e = await run('BREAKATPOINT', [p(3, 0), p(3, 0)], [L(0, 0, 10, 0, 'A')]); A(of(e, 'line').length === 2 && of(e, 'line')[0].layer === 'A', 'BREAKATPOINT');
  e = await run('BREAKATPOINT', [p(1, 0), p(0, 0)], [L(0, 0, 10, 0)]); A(of(e, 'line').length === 1 && e.msgs.length === 1, 'BREAKATPOINT: extremidade recusada');
  e = await run('LENGTHEN', ['Delta', 5, p(9, 0), null], [L(0, 0, 10, 0)]); near(of(e, 'line')[0].p2.x, 15, 1e-9, 'LENGTHEN: delta');
  e = await run('LENGTHEN', ['Total', 4, p(9, 0), p(0, 0.0)], [L(0, 0, 10, 0)]); near(of(e, 'line')[0].p2.x, 4, 1e-9, 'LENGTHEN: total e repetição');
  e = await run('LENGTHEN', ['Porcentagem', 0], [L(0, 0, 10, 0)]); A(e.msgs.length === 1, 'LENGTHEN: porcentagem 0 recusada');
  e = await run('LENGTHEN', ['Delta', -20, p(9, 0)], [L(0, 0, 10, 0)]); A(e.msgs.length === 1 && of(e, 'line')[0].p2.x === 10, 'LENGTHEN: resultado inválido não altera');
  e = await run('ALIGN', [['e1'], p(0, 0), p(5, 5)], [L(0, 0, 10, 0)]); A(of(e, 'line')[0].p1.x === 5 && of(e, 'line')[0].p1.y === 5, 'ALIGN: 1 par (mover)');
  e = await run('ALIGN', [['e1'], p(0, 0), p(0, 0), p(10, 0), p(0, 10), 'Não'], [L(0, 0, 10, 0)]); near(of(e, 'line')[0].p2.y, 10, 1e-9, 'ALIGN: 2 pares (gira 90°)'); near(Math.hypot(of(e, 'line')[0].p2.x, of(e, 'line')[0].p2.y), 10, 1e-9, 'ALIGN: sem escala');
  e = await run('ALIGN', [['e1'], p(0, 0), p(0, 0), p(10, 0), p(0, 20), 'Sim'], [L(0, 0, 10, 0)]); near(of(e, 'line')[0].p2.y, 20, 1e-9, 'ALIGN: com escala');
  e = await run('ALIGN', [['e1'], p(1, 1), p(2, 2), p(1, 1), p(5, 5), 'Não'], [L(0, 0, 10, 0)]); A(e.msgs.length === 1, 'ALIGN: origens coincidentes recusadas');
  e = await run('REVERSE', [['e1', 'e2']], [L(0, 0, 10, 0), PL([[0, 0, 1], [2, 0]])]); A(of(e, 'line')[0].p1.x === 10 && of(e, 'pline')[0].pts[0].bulge === -1 || of(e, 'pline')[0].pts[0].x === 2, 'REVERSE: linha e pline');
  e = await run('REVERSE', [['e1']], [Cc(0, 0, 1)]); A(e.msgs.length === 1, 'REVERSE: círculo ignorado');
  e = await run('PEDIT', [p(5, 0), 'Sim', 'Juntar', ['e2', 'e3'], 'Fechar', 'Sair'], [L(0, 0, 5, 0), L(5, 0, 5, 5), L(5, 5, 0, 0)]);
  A(all(e).length === 1 && of(e, 'pline')[0].closed && of(e, 'pline')[0].pts.length === 3, 'PEDIT: converte, junta e fecha');
  e = await run('PEDIT', [p(5, -5), 'Fechar', 'Retificar', 'Abrir'], [PL([[0, 0, 1], [10, 0], [10, 10], [0, 10]])]); A(!of(e, 'pline')[0].closed && of(e, 'pline')[0].pts[0].bulge === 0, 'PEDIT: fechar, retificar, abrir');
  e = await run('PEDIT', [p(5, 0), 'Spline'], [PL([[0, 0], [10, 0], [10, 10]])]); A(of(e, 'spline').length === 1 && of(e, 'pline').length === 0 && of(e, 'spline')[0].fit.length === 3, 'PEDIT: Spline');
  e = await run('PEDIT', [p(2, 0), 'Não'], [L(0, 0, 10, 0)]); A(of(e, 'line').length === 1, 'PEDIT: recusar conversão');
  e = await run('PEDIT', [p(5, 0), 'Fechar'], [PL([[0, 0], [10, 0]])]); A(!of(e, 'pline')[0].closed && e.msgs.length === 1, 'PEDIT: fechar com 2 vértices recusado');
  e = await run('EDITVERTEX', [p(10, 0), 'Mover', p(12, 1), 'Inserir', p(12, 5), 'Bulge', 0.5, 'Sair'], [PL([[0, 0], [10, 0], [10, 10]])]);
  var ev = of(e, 'pline')[0]; A(ev.pts.length === 4 && ev.pts[1].x === 12 && ev.pts[2].y === 5 && ev.pts[2].bulge === 0.5, 'EDITVERTEX: mover, inserir, bulge');
  e = await run('EDITVERTEX', [p(10, 10), 'Excluir', 'Anterior', 'Excluir', 'Excluir'], [PL([[0, 0], [10, 0], [10, 10]])]); A(of(e, 'pline')[0].pts.length === 2 && e.msgs.length >= 1, 'EDITVERTEX: excluir respeita mínimo de 2');
  e = await run('EDITVERTEX', [p(0, 0), 'Próximo', 'Próximo', 'Bulge'], [PL([[0, 0], [10, 0], [10, 10]])]); A(e.msgs.length === 1, 'EDITVERTEX: bulge no último vértice aberto recusado');
  e = await run('BASE', [p(3, 4)], []); A(e.doc.basepoint.x === 3 && e.doc.basepoint.y === 4, 'BASE');
  e = await run('ARRAYRECT', [['e1'], 3, 2, 5, 4, 0], [L(0, 0, 1, 0)]); A(all(e).length === 6, 'ARRAYRECT: 3 colunas x 2 linhas');
  e = await run('ARRAYRECT', [['e1'], 1, 1, 5, 4], [L(0, 0, 1, 0)]); A(all(e).length === 1 && e.msgs.length === 1, 'ARRAYRECT: 1x1 não cria');
  e = await run('ARRAYRECT', [['e1'], 5000, 5000, 1, 1], [L(0, 0, 1, 0)]); A(all(e).length === 1 && e.msgs.length === 1, 'ARRAYRECT: limite de quantidade');
  e = await run('ARRAYPOLAR', [['e1'], p(0, 0), 6, null, 'Sim'], [L(1, 0, 2, 0)]); A(all(e).length === 6, 'ARRAYPOLAR: 6 itens, 360 por padrão');
  e = await run('ARRAYPOLAR', [['e1'], p(0, 0), 1], [L(1, 0, 2, 0)]); A(e.msgs.length === 1, 'ARRAYPOLAR: 1 item recusado');
  e = await run('ARRAYPATH', [['e1'], p(5, 0), 'Contar', 3, 'Não'], [Cc(0, 0, 1), L(0, 0, 10, 0)]); A(of(e, 'circle').length === 3, 'ARRAYPATH: contar');
  e = await run('ARRAYPATH', [['e1'], p(5, 0), 'Medir', 0], [Cc(0, 0, 1), L(0, 0, 10, 0)]); A(e.msgs.length === 1, 'ARRAYPATH: espaçamento zero recusado');
  e = await run('ARRAY', ['Polar', ['e1'], p(0, 0), 3, 360, 'Não'], [L(1, 0, 2, 0)]); A(all(e).length === 3, 'ARRAY: despacha para polar');
  e = await run('XLINE', ['Hor', p(0, 5), p(3, 7), null], []); A(of(e, 'xline').length === 2 && of(e, 'xline')[0].dir.x === 1, 'XLINE: horizontal, várias');
  e = await run('XLINE', ['Ang', 45, p(0, 0), null], []); near(of(e, 'xline')[0].dir.y, Math.SQRT1_2, 1e-9, 'XLINE: ângulo');
  e = await run('XLINE', [p(0, 0), p(0, 5), p(0, 0), p(3, 0), null], []); A(of(e, 'xline').length === 2 && of(e, 'xline')[0].dir.y === 1 && e.msgs.length === 1, 'XLINE: por 2 pontos (coincidente recusado)');
  e = await run('XLINE', ['Ver', p(2, 2), null], []); A(of(e, 'xline')[0].dir.y === 1, 'XLINE: vertical');
  e = await run('XLINE', ['Bisect', p(0, 0), p(1, 0), p(0, 1)], []); near(of(e, 'xline')[0].dir.x, Math.SQRT1_2, 1e-9, 'XLINE: bissetriz'); 
  e = await run('XLINE', ['Bisect', p(0, 0), p(1, 0), p(-1, 0)], []); near(Math.abs(of(e, 'xline')[0].dir.y), 1, 1e-9, 'XLINE: bissetriz de lados opostos = perpendicular');
  e = await run('RAY', [p(0, 0), p(1, 1), p(0, 0), null], []); A(of(e, 'ray').length === 1 && e.msgs.length === 1, 'RAY');
  e = await run('DONUT', [1, 3, p(0, 0), p(10, 0), null], []); A(of(e, 'region').length === 2 && of(e, 'region')[0].fill, 'DONUT: 2 anéis'); near(T.region.props(of(e, 'region')[0])[2].value, Math.PI * 2, 1e-9, 'DONUT: área π(1,5²−0,5²)');
  e = await run('DONUT', [0, 2, p(0, 0)], []); A(of(e, 'region')[0].loops.length === 1, 'DONUT: interno 0 = disco sólido');
  e = await run('DONUT', [3, 2, p(0, 0)], []); A(of(e, 'region').length === 0 && e.msgs.length === 1, 'DONUT: interno >= externo recusado');
  e = await run('BOUNDARY', [p(5, 5), p(50, 50), null], [L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0)]); A(of(e, 'pline').length === 1 && of(e, 'pline')[0].closed && e.msgs.length === 1, 'BOUNDARY: cria pline e avisa quando falha');
  e = await run('BOUNDARY', ['Objeto', 'Região', p(5, 5)], [L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0)]); A(of(e, 'region').length === 1 && !of(e, 'region')[0].fill, 'BOUNDARY: região');
  X.settings.boundObj = 'Polilinha';
  e = await run('BOUNDARY', [p(0.5, 0.5)], [Cc(0, 0, 2)]); A(of(e, 'pline')[0].pts.length === 2 && of(e, 'pline')[0].pts[0].bulge === 1, 'BOUNDARY: círculo vira pline de 2 arcos');
  e = await run('REGION', [['e1', 'e2', 'e3']], [Cc(0, 0, 1), PL([[0, 0], [1, 0], [1, 1]], true), L(0, 0, 1, 1)]); A(of(e, 'region').length === 2 && of(e, 'circle').length === 0 && of(e, 'line').length === 1 && e.msgs.length === 1, 'REGION: 2 criadas, originais apagadas, aberto ignorado');
  e = await run('FENCE', [p(5, -1), p(5, 6), null], [L(0, 0, 10, 0), L(0, 5, 10, 5), L(20, 0, 30, 0)]); A(e.sel.ids().length === 2, 'FENCE: seleciona os cruzados');
  e = await run('LASSO', ['Janela', p(-1, -1), p(11, -1), p(11, 6), p(-1, 6), null], [L(0, 0, 10, 0), L(5, 5, 15, 5)]); A(e.sel.ids().length === 1, 'LASSO: janela');
  X.settings.lassoMode = 'Cruzamento';
  e = await run('LASSO', [p(0, 0), p(1, 0)], [L(0, 0, 10, 0)]); A(e.msgs.length === 1 && e.sel.ids().length === 0, 'LASSO: menos de 3 pontos recusado');
  e = await run('SELECTSIMILAR', [p(0, 0)], [L(0, 0, 10, 0, 'A'), L(0, 5, 10, 5, 'A'), L(0, 9, 1, 9, 'B')]); A(e.sel.ids().length === 2, 'SELECTSIMILAR: type+layer');
  e = await run('SELBYLAYER', [p(0, 0)], [L(0, 0, 10, 0, 'A'), L(0, 5, 10, 5, 'A'), L(0, 9, 1, 9, 'B')]); A(e.sel.ids().length === 2, 'SELBYLAYER: por clique');
  e = await run('SELBYLAYER', [null, 'B'], [L(0, 0, 10, 0, 'A'), L(0, 9, 1, 9, 'B')]); A(e.sel.ids().length === 1, 'SELBYLAYER: por nome');
  e = await run('SELBYTYPE', [null, 'CIRCLE'], [L(0, 0, 10, 0), Cc(5, 5, 1)]); A(e.sel.ids().length === 1, 'SELBYTYPE: por nome');
  e = await run('QSELECT', ['line', 'length', '>', '4', 'Novo'], [L(0, 0, 10, 0), L(0, 5, 3, 5), Cc(0, 0, 1)]); A(e.sel.ids().length === 1, 'QSELECT: linhas > 4');
  e = await run('QSELECT', [null, null, null, 'A', 'Novo'], [L(0, 0, 10, 0, 'A'), L(0, 5, 3, 5, 'B')]); A(e.sel.ids().length === 1, 'QSELECT: padrões (todos, layer, =)');
  e = await run('QSELECT', ['todos', 'r', 'Contém', '1', 'Novo'], [Cc(0, 0, 1), Cc(0, 0, 5)]); A(e.sel.ids().length === 1, 'QSELECT: contém');
  e = await run('GRIP', [['e1'], p(10, 0), p(10, 4)], [L(0, 0, 10, 0)]); A(of(e, 'line')[0].p2.y === 4, 'GRIP: arrastar vértice');
  e = await run('GRIP', [['e1'], p(10, 0), 'Copiar', p(10, 4), p(10, 8), null], [L(0, 0, 10, 0)]); A(of(e, 'line').length === 3 && of(e, 'line')[0].p2.y === 0, 'GRIP: modo cópia repetido');
  e = await run('GRIP', [['e1'], p(7, 7)], [L(0, 0, 10, 0)]); A(e.msgs.length === 1, 'GRIP: clique sem grip');
  // ESC (Cancel) preserva o que já foi feito
  var Cn = CAD.Cancel; CAD.Cancel = { name: 'Cancel' };
  var escF = function () { throw CAD.Cancel; }, er = 0;
  e = await run('XLINE', ['Hor', p(0, 5), escF], []).catch(function () { er++; return null; }); A(er === 0 && e && of(e, 'xline').length === 1, 'ESC em XLINE mantém as linhas já criadas');
  e = await run('BREAK', [escF], [L(0, 0, 10, 0)]).catch(function () { er++; return null; }); A(er === 0, 'ESC no BREAK não propaga erro');
  CAD.Cancel = Cn;
  // batch: um passo de undo (history simulada)
  var oldH = CAD.history;
  var tcenv = mkEnv([L(0, 0, 10, 0)]); var idl = all(tcenv)[0].id;
  var snapshot = JSON.stringify(all(tcenv)), batchRuns = [];
  CAD.history = { run: function (o) { batchRuns.push(o); o.do(); } };
  env = null; var realEnts = CAD.ents, realDoc = CAD.doc; CAD.ents = tcenv.ents; CAD.doc = tcenv.doc;
  var newIds = batch('teste', { remove: [idl], add: [L(0, 0, 3, 0), L(3, 0, 10, 0)] });
  A(batchRuns.length === 1 && all(tcenv).length === 2 && newIds.length === 2, 'batch: remoção+adição em 1 passo');
  batchRuns[0].undo(); A(JSON.stringify(all(tcenv)) === snapshot, 'batch: undo restaura exatamente');
  batchRuns[0].do(); A(all(tcenv).length === 2 && !!tcenv.ents.get(newIds[0]), 'batch: redo recria com os mesmos ids');
  batch('upd', { update: [{ id: newIds[0], patch: { p2: p(2, 0) } }] }); batchRuns[1].undo(); near(tcenv.ents.get(newIds[0]).p2.x, 3, 1e-9, 'batch: undo de update');
  CAD.history = oldH; CAD.ents = realEnts; CAD.doc = realDoc;
  console.log('CAD.tests.p14: ' + ok + ' ok, ' + bad + ' falhas');
  return { ok: ok, bad: bad };
};

})(window.CAD = window.CAD || {});
/* ==== END:14 ==== */
