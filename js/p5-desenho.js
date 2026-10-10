/* ==== PART:5 ==== */
/* P5 Desenho: line, pline (rect/polygon), circle, arc, ellipse, spline, point + comandos.
   Depende só do contrato (P1 registros, input, ents, history). Não usa CAD.geom (matemática própria). */
(function (CAD) {
'use strict';
var PI = Math.PI, TAU = PI * 2, D2R = PI / 180, R2D = 180 / PI, EPS = 1e-9;
var S = CAD.draw = CAD.draw || {};
S.settings = S.settings || { rectFillet: 0, rectChamfer: [0, 0], polySides: 4, polyMode: 'Inscrito', space: 'model' };
var env = null; // injeção para testes: {input, add(spec), undo(), print}

/* ---------- utilitários ---------- */
function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function P(x, y, z) { return { x: x, y: y, z: z || 0 }; }
function pt(p) { return p ? P(num(p.x, 0), num(p.y, 0), num(p.z, 0)) : P(0, 0, 0); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function ang(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function mid(a, b) { return P((a.x + b.x) / 2, (a.y + b.y) / 2, ((a.z || 0) + (b.z || 0)) / 2); }
function pol(c, r, a) { return P(c.x + r * Math.cos(a), c.y + r * Math.sin(a), c.z || 0); }
function norm2pi(a) { a %= TAU; return a < 0 ? a + TAU : a; }
function normPi(a) { a = norm2pi(a); return a > PI ? a - TAU : a; }
function sweepRad(a1d, a2d) { var s = norm2pi(a2d * D2R) - norm2pi(a1d * D2R); if (s <= EPS) s += TAU; return s; }
function inSweep(a, a1, sw) { return norm2pi(a - a1) <= sw + 1e-12; }
function fmt(n) { return String(Math.round(n * 1e6) / 1e6); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
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

/* ---------- matriz afim (aceita função, {a..f}, [6], [9], 3x3) ---------- */
function nm(m) {
  var I = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, fn = null;
  if (!m) return I;
  if (typeof m === 'function') fn = m;
  else if (!Array.isArray(m) && typeof m.apply === 'function') fn = function (p) { return m.apply(p); };
  else if (!Array.isArray(m) && typeof m.point === 'function') fn = function (p) { return m.point(p); };
  if (fn) {
    var o = fn(P(0, 0)), X = fn(P(1, 0)), Y = fn(P(0, 1));
    return { a: X.x - o.x, b: X.y - o.y, c: Y.x - o.x, d: Y.y - o.y, e: o.x, f: o.y };
  }
  if (Array.isArray(m)) {
    if (m.length === 6) return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
    if (m.length === 9) return { a: m[0], c: m[1], e: m[2], b: m[3], d: m[4], f: m[5] };
    if (m.length >= 2 && Array.isArray(m[0])) return { a: m[0][0], c: m[0][1], e: m[0][2] || 0, b: m[1][0], d: m[1][1], f: m[1][2] || 0 };
  }
  if (typeof m.a === 'number') return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e || 0, f: m.f || 0 };
  return I;
}
function T(n, p) { return P(n.a * p.x + n.c * p.y + n.e, n.b * p.x + n.d * p.y + n.f, p.z || 0); }
function Lv(n, v) { return P(n.a * v.x + n.c * v.y, n.b * v.x + n.d * v.y, 0); }
function det(n) { return n.a * n.d - n.b * n.c; }

/* ---------- bulge ---------- */
// arco do segmento p1→p2 com bulge b: {c,r,th (ângulo incluído com sinal), a0 (ang. de p1 em rad), a1,a2 (rad, ccw)}
function bulgeArc(p1, p2, b) {
  var d = dist(p1, p2);
  if (d < EPS || Math.abs(b) < EPS) return null;
  var th = 4 * Math.atan(b), r = d / (2 * Math.sin(Math.abs(th) / 2));
  var u = P((p2.x - p1.x) / d, (p2.y - p1.y) / d), n = P(-u.y, u.x), m = mid(p1, p2);
  var h = (d / 2) / Math.tan(th / 2);
  var c = P(m.x + n.x * h, m.y + n.y * h, p1.z || 0);
  var a0 = ang(c, p1), a3 = ang(c, p2);
  return { c: c, r: r, th: th, a0: a0, a1: b > 0 ? a0 : a3, a2: b > 0 ? a3 : a0 };
}
function bulgeFromTangent(p, q, t) { // t em rad; retorna bulge do arco tangente a t em p até q
  var al = normPi(ang(p, q) - t);
  if (Math.abs(al) > PI - 0.01) al = (al > 0 ? 1 : -1) * (PI - 0.01);
  return Math.tan(al / 2);
}
function segLen(p1, p2, b) {
  var a = bulgeArc(p1, p2, b); return a ? Math.abs(a.th) * a.r : dist(p1, p2);
}
function plSegs(e) {
  var v = e.pts || [], n = v.length, out = [], i, cnt = e.closed ? n : n - 1;
  for (i = 0; i < cnt; i++) out.push({ i: i, p1: v[i], p2: v[(i + 1) % n], b: num(v[i].bulge, 0) });
  return out;
}

/* ---------- elipse ---------- */
function eMin(e) { var M = e.major; return P(-M.y * e.ratio, M.x * e.ratio); }
function ePt(e, tDeg) {
  var t = tDeg * D2R, M = e.major, m = eMin(e), c = e.c;
  return P(c.x + M.x * Math.cos(t) + m.x * Math.sin(t), c.y + M.y * Math.cos(t) + m.y * Math.sin(t), c.z || 0);
}
function eFull(e) { return Math.abs(sweepRad(num(e.a1, 0), num(e.a2, 360)) - TAU) < 1e-9 && (norm2pi(num(e.a1, 0) * D2R) === norm2pi(num(e.a2, 360) * D2R)); }
function dirToParam(e, worldDeg) { // direção world (graus) a partir do centro → parâmetro da elipse (graus)
  var M = e.major, a = Math.hypot(M.x, M.y), b = a * e.ratio, th = Math.atan2(M.y, M.x), w = worldDeg * D2R - th;
  return norm2pi(Math.atan2(Math.sin(w) / (b || 1), Math.cos(w) / (a || 1))) * R2D;
}
// elipse c + u cos t + v sin t sob matriz linear → patch de elipse padrão
function affEllipse(n, c, u, v, a1d, a2d) {
  var U = Lv(n, u), V = Lv(n, v), c2 = T(n, c);
  var t0 = 0.5 * Math.atan2(2 * (U.x * V.x + U.y * V.y), (U.x * U.x + U.y * U.y) - (V.x * V.x + V.y * V.y));
  var ct = Math.cos(t0), st = Math.sin(t0);
  var M = P(U.x * ct + V.x * st, U.y * ct + V.y * st), m = P(-U.x * st + V.x * ct, -U.y * st + V.y * ct);
  var lm = Math.hypot(M.x, M.y) || EPS, ratio = Math.hypot(m.x, m.y) / lm;
  var s1 = a1d - t0 * R2D, s2 = a2d - t0 * R2D;
  if (M.x * m.y - M.y * m.x < 0) { var t = -s2; s2 = -s1; s1 = t; }
  return { c: c2, major: M, ratio: ratio, a1: norm360(s1), a2: (a2d - a1d >= 360 - 1e-9) ? norm360(s1) + 360 : norm360(s2) };
}
function norm360(a) { a %= 360; if (a < 0) a += 360; return a > 360 - 1e-9 ? 0 : a; }

/* ---------- tesselação (world) ---------- */
function segsFor(r, sw, tol, min) {
  var da = r > tol ? 2 * Math.acos(clamp(1 - tol / r, -1, 1)) : PI / 2;
  return clamp(Math.ceil(Math.abs(sw) / Math.max(da, 1e-3)), min || 2, 4096);
}
function arcMid(c, r, a0, sw, tol) {
  var n = segsFor(r, sw, tol), o = [], k;
  for (k = 1; k < n; k++) o.push(pol(c, r, a0 + sw * k / n));
  return o;
}
function crSeg(p0, p1, p2, p3, n, out) {
  var d = function (a, b) { return Math.max(Math.pow(dist(a, b), 0.5), 1e-9); };
  var t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), k;
  function mix(a, b, wa, wb) { return P(a.x * wa + b.x * wb, a.y * wa + b.y * wb, (a.z || 0) * wa + (b.z || 0) * wb); }
  for (k = 0; k < n; k++) {
    var t = t1 + (t2 - t1) * k / n;
    var A1 = mix(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
    var A2 = mix(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
    var A3 = mix(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
    var B1 = mix(A1, A2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
    var B2 = mix(A2, A3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
    out.push(mix(B1, B2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)));
  }
}
function splinePts(e, per) {
  var f = e.fit || [], n = f.length, out = [], i;
  if (n < 3) return f.map(pt);
  per = per || 16;
  var g = function (i) { return f[(i + n) % n]; };
  if (e.closed) {
    for (i = 0; i < n; i++) crSeg(g(i - 1), g(i), g(i + 1), g(i + 2), per, out);
    return out; // fechada: o último ponto volta ao primeiro
  }
  for (i = 0; i < n - 1; i++) {
    var p0 = i === 0 ? P(2 * f[0].x - f[1].x, 2 * f[0].y - f[1].y) : f[i - 1];
    var p3 = i + 2 >= n ? P(2 * f[n - 1].x - f[n - 2].x, 2 * f[n - 1].y - f[n - 2].y) : f[i + 2];
    crSeg(p0, f[i], f[i + 1], p3, per, out);
  }
  out.push(pt(f[n - 1]));
  return out;
}
function tess(e, tol) {
  tol = tol > 0 ? tol : 0.01;
  var o = [], i;
  switch (e.type) {
    case 'line': return { pts: [pt(e.p1), pt(e.p2)], closed: false };
    case 'point': return { pts: [pt(e.p)], closed: false };
    case 'circle': {
      var n = segsFor(e.r, TAU, tol, 12);
      for (i = 0; i < n; i++) o.push(pol(e.c, e.r, TAU * i / n));
      return { pts: o, closed: true };
    }
    case 'arc': {
      var sw = sweepRad(e.a1, e.a2), a0 = e.a1 * D2R, nn = segsFor(e.r, sw, tol);
      for (i = 0; i <= nn; i++) o.push(pol(e.c, e.r, a0 + sw * i / nn));
      return { pts: o, closed: false };
    }
    case 'ellipse': {
      var full = eFull(e), a1 = num(e.a1, 0), sw2 = full ? 360 : sweepRad(a1, num(e.a2, 360)) * R2D;
      var R = Math.hypot(e.major.x, e.major.y), n2 = segsFor(R, sw2 * D2R, tol, 16);
      for (i = 0; i < (full ? n2 : n2 + 1); i++) o.push(ePt(e, a1 + sw2 * i / n2));
      return { pts: o, closed: full };
    }
    case 'spline': return { pts: splinePts(e, 16), closed: !!e.closed && (e.fit || []).length >= 3 };
    case 'pline': {
      var s = plSegs(e), v = e.pts || [];
      s.forEach(function (g) {
        o.push(pt(g.p1));
        var a = bulgeArc(g.p1, g.p2, g.b);
        if (a) o.push.apply(o, arcMid(a.c, a.r, a.a0, a.th, tol));
      });
      if (!e.closed && v.length) o.push(pt(v[v.length - 1]));
      return { pts: o, closed: !!e.closed && v.length > 2 };
    }
  }
  return { pts: [], closed: false };
}
function distSeg(p, a, b) {
  var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  var t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function distPoly(p, pts, closed) {
  var m = Infinity, i, n = pts.length;
  if (n === 1) return dist(p, pts[0]);
  for (i = 0; i < n - 1; i++) m = Math.min(m, distSeg(p, pts[i], pts[i + 1]));
  if (closed && n > 2) m = Math.min(m, distSeg(p, pts[n - 1], pts[0]));
  return m;
}

/* ---------- bbox ---------- */
function box() { return { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }; }
function bAdd(b, p) { b.x1 = Math.min(b.x1, p.x); b.y1 = Math.min(b.y1, p.y); b.x2 = Math.max(b.x2, p.x); b.y2 = Math.max(b.y2, p.y); }
function bOut(b) { return { min: { x: b.x1, y: b.y1 }, max: { x: b.x2, y: b.y2 }, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 }; }
function arcBox(b, c, r, a0, sw) {
  bAdd(b, pol(c, r, a0)); bAdd(b, pol(c, r, a0 + sw));
  for (var q = 0; q < 4; q++) if (inSweep(q * PI / 2, a0, sw)) bAdd(b, pol(c, r, q * PI / 2));
}
function bboxOf(e) {
  var b = box(), i;
  switch (e.type) {
    case 'line': bAdd(b, e.p1); bAdd(b, e.p2); break;
    case 'point': bAdd(b, e.p); break;
    case 'circle': bAdd(b, P(e.c.x - e.r, e.c.y - e.r)); bAdd(b, P(e.c.x + e.r, e.c.y + e.r)); break;
    case 'arc': arcBox(b, e.c, e.r, e.a1 * D2R, sweepRad(e.a1, e.a2)); break;
    case 'ellipse': {
      var a1 = num(e.a1, 0), sw = eFull(e) ? 360 : sweepRad(a1, num(e.a2, 360)) * R2D;
      var m = eMin(e), cands = [a1, a1 + sw];
      [Math.atan2(m.x, e.major.x), Math.atan2(m.y, e.major.y)].forEach(function (t) {
        [t, t + PI].forEach(function (u) { var d = norm360(u * R2D); if (norm360(d - a1) <= sw + 1e-9) cands.push(d); });
      });
      cands.forEach(function (t) { bAdd(b, ePt(e, t)); });
      break;
    }
    case 'pline':
      (e.pts || []).forEach(function (p) { bAdd(b, p); });
      plSegs(e).forEach(function (g) { var a = bulgeArc(g.p1, g.p2, g.b); if (a) arcBox(b, a.c, a.r, a.a1, Math.abs(a.th)); });
      break;
    case 'spline': splinePts(e, 24).forEach(function (p) { bAdd(b, p); }); (e.fit || []).forEach(function (p) { bAdd(b, p); }); break;
  }
  if (b.x1 === Infinity) { b.x1 = b.y1 = b.x2 = b.y2 = 0; }
  return bOut(b);
}

/* ---------- medidas ---------- */
function plLength(e) { return plSegs(e).reduce(function (s, g) { return s + segLen(g.p1, g.p2, g.b); }, 0); }
function plArea(e) {
  var v = e.pts || [], n = v.length, A = 0;
  if (n < 3 && !(n === 2 && e.closed)) return 0;
  plSegs(e).forEach(function (g) {
    A += (g.p1.x * g.p2.y - g.p2.x * g.p1.y) / 2;
    var a = bulgeArc(g.p1, g.p2, g.b);
    if (a) A += (g.b > 0 ? 1 : -1) * a.r * a.r / 2 * (Math.abs(a.th) - Math.sin(Math.abs(a.th)));
  });
  return Math.abs(A);
}
function arcLen(e) { return e.r * sweepRad(e.a1, e.a2); }
function ellLen(e) {
  var t = tess(e, 1e-4).pts, s = 0, i;
  for (i = 1; i < t.length; i++) s += dist(t[i - 1], t[i]);
  return s;
}
function splLen(e) { var t = splinePts(e, 24), s = 0, i; for (i = 1; i < t.length; i++) s += dist(t[i - 1], t[i]); return s; }

/* ---------- geradores (retângulo, polígono, círculo/arco 3P) ---------- */
function rectPts(p1, p2, o) {
  o = o || {};
  var x0 = Math.min(p1.x, p2.x), x1 = Math.max(p1.x, p2.x), y0 = Math.min(p1.y, p2.y), y1 = Math.max(p1.y, p2.y), z = p1.z || 0;
  var w = x1 - x0, h = y1 - y0, B = Math.tan(PI / 8), v;
  var f = num(o.fillet, 0), ch = o.chamfer || [0, 0];
  if (f > 0) {
    f = Math.min(f, w / 2, h / 2);
    if (f > EPS) return [
      { x: x0 + f, y: y0, z: z, bulge: 0 }, { x: x1 - f, y: y0, z: z, bulge: B }, { x: x1, y: y0 + f, z: z, bulge: 0 },
      { x: x1, y: y1 - f, z: z, bulge: B }, { x: x1 - f, y: y1, z: z, bulge: 0 }, { x: x0 + f, y: y1, z: z, bulge: B },
      { x: x0, y: y1 - f, z: z, bulge: 0 }, { x: x0, y: y0 + f, z: z, bulge: B }];
  }
  var c1 = Math.min(num(ch[0], 0), w / 2), c2 = Math.min(num(ch[1], 0), h / 2);
  if (c1 > EPS && c2 > EPS) return [[x0 + c1, y0], [x1 - c1, y0], [x1, y0 + c2], [x1, y1 - c2], [x1 - c1, y1], [x0 + c1, y1], [x0, y1 - c2], [x0, y0 + c2]]
    .map(function (q) { return { x: q[0], y: q[1], z: z, bulge: 0 }; });
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(function (q) { return { x: q[0], y: q[1], z: z, bulge: 0 }; });
}
function polygonPts(c, n, r, rot, circ) {
  var o = [], k, R = circ ? r / Math.cos(PI / n) : r, off = circ ? rot + PI / n : rot;
  for (k = 0; k < n; k++) { var p = pol(c, R, off + TAU * k / n); o.push({ x: p.x, y: p.y, z: c.z || 0, bulge: 0 }); }
  return o;
}
function polygonByEdge(e1, e2, n) {
  var o = [{ x: e1.x, y: e1.y, z: e1.z || 0, bulge: 0 }], dx = e2.x - e1.x, dy = e2.y - e1.y, k, cur = pt(e1);
  for (k = 0; k < n - 1; k++) {
    var a = TAU * k / n, vx = dx * Math.cos(a) - dy * Math.sin(a), vy = dx * Math.sin(a) + dy * Math.cos(a);
    cur = P(cur.x + vx, cur.y + vy, e1.z || 0);
    o.push({ x: cur.x, y: cur.y, z: cur.z, bulge: 0 });
  }
  return o;
}
function circle3(a, b, c) {
  var d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPS) return null;
  var a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  var ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  var uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  var cc = P(ux, uy, a.z || 0);
  return { c: cc, r: dist(cc, a) };
}
function arc3(p1, p2, p3) {
  var k = circle3(p1, p2, p3); if (!k) return null;
  var ccw = ((p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x)) > 0;
  var s = ccw ? p1 : p3, e = ccw ? p3 : p1;
  return { c: k.c, r: k.r, a1: norm360(ang(k.c, s) * R2D), a2: norm360(ang(k.c, e) * R2D) };
}
function arcSER(p1, p3, R) { // ccw de p1 a p3; R<0 = arco maior
  var d = dist(p1, p3), ar = Math.abs(R);
  if (d < EPS || ar < d / 2 - 1e-12) return null;
  var h = Math.sqrt(Math.max(0, ar * ar - d * d / 4)), u = P((p3.x - p1.x) / d, (p3.y - p1.y) / d), m = mid(p1, p3);
  var s = R > 0 ? 1 : -1, c = P(m.x - u.y * h * s, m.y + u.x * h * s, p1.z || 0);
  return { c: c, r: ar, a1: norm360(ang(c, p1) * R2D), a2: norm360(ang(c, p3) * R2D) };
}

/* ---------- desenho em canvas ---------- */
function scaleOf(view) {
  view = view || CAD.view; if (!view || !view.toScreen) return 1;
  var a = view.toScreen(P(0, 0)), b = view.toScreen(P(1, 0)), s = Math.hypot(b.x - a.x, b.y - a.y);
  return s > 0 ? s : 1;
}
function strokePts(ctx, view, pts, closed) {
  var i, s;
  ctx.beginPath();
  for (i = 0; i < pts.length; i++) { s = view.toScreen(pts[i]); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }
  if (closed) ctx.closePath();
  ctx.stroke();
}
function drawGeneric(ctx, e, view) {
  view = view || CAD.view;
  var t = tess(e, 0.25 / scaleOf(view));
  if (t.pts.length >= 2) strokePts(ctx, view, t.pts, t.closed);
}
function pdGet() { var d = CAD.doc || {}; return { mode: num(d.pdmode, 0), size: num(d.pdsize, 0) }; }
function drawPoint(ctx, e, view) {
  view = view || CAD.view;
  var s = view.toScreen(e.p), pd = pdGet(), m = pd.mode, base = m & 7, sz = pd.size > 0 ? pd.size * scaleOf(view) : 8, h = sz / 2;
  if (base === 0) { ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1.5, sz / 5), 0, TAU); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); }
  ctx.beginPath();
  if (base === 2) { ctx.moveTo(s.x - h, s.y); ctx.lineTo(s.x + h, s.y); ctx.moveTo(s.x, s.y - h); ctx.lineTo(s.x, s.y + h); }
  if (base === 3) { ctx.moveTo(s.x - h, s.y - h); ctx.lineTo(s.x + h, s.y + h); ctx.moveTo(s.x - h, s.y + h); ctx.lineTo(s.x + h, s.y - h); }
  if (base === 4) { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - h); }
  if (m & 32) { ctx.moveTo(s.x + h, s.y); ctx.arc(s.x, s.y, h, 0, TAU); }
  if (m & 64) ctx.rect(s.x - h, s.y - h, sz, sz);
  ctx.stroke();
}

/* ---------- SVG (Y negado; sem estilo, P11 aplica) ---------- */
function sp(p) { return fmt(p.x) + ' ' + fmt(-p.y); }
function svgPath(t, closed) { return t.map(function (p, i) { return (i ? 'L' : 'M') + sp(p); }).join(' ') + (closed ? ' Z' : ''); }
function svgArcTo(r, th, p2) { return 'A' + fmt(r) + ' ' + fmt(r) + ' 0 ' + (Math.abs(th) > PI ? 1 : 0) + ' ' + (th > 0 ? 1 : 0) + ' ' + sp(p2); }

/* ---------- DXF ---------- */
function gl(g) {
  if (!g) return [];
  if (Array.isArray(g)) return g;
  if (Array.isArray(g.groups)) return g.groups;
  var out = [], k;
  for (k in g) if (/^\d+$/.test(k)) { var v = g[k]; if (Array.isArray(v)) v.forEach(function (x) { out.push([+k, x]); }); else out.push([+k, v]); }
  return out;
}
function g1(L, c, d) { for (var i = 0; i < L.length; i++) if (+L[i][0] === c) { var v = parseFloat(L[i][1]); return isFinite(v) ? v : d; } return d; }
function gpt(L, cx, cy, cz) { return P(g1(L, cx, 0), g1(L, cy, 0), g1(L, cz, 0)); }
function p3g(p, c) { return [[c, p.x], [c + 10, p.y], [c + 20, p.z || 0]]; }

/* ---------- propriedades ---------- */
function mkProp(key, label, type, value, extra) {
  var o = { key: key, label: label, type: type, value: value, group: 'Geometria' };
  for (var k in extra) o[k] = extra[k];
  return o;
}
function pProp(e, key, label) { return mkProp(key, label, 'point', pt(e[key]), { set: function (_, v) { var o = {}; o[key] = pt(v); return o; } }); }
function rotv(v, deg) { var a = deg * D2R; return P(v.x * Math.cos(a) - v.y * Math.sin(a), v.x * Math.sin(a) + v.y * Math.cos(a), v.z || 0); }
function ro(key, label, type, value) { return mkProp(key, label, type, value, { readonly: true, group: 'Medidas' }); }

/* ---------- definições dos tipos ---------- */
function snp(p, mode) { return { pt: p, mode: mode }; }
function inherit(e, g) { var o = { layer: e.layer, color: e.color === undefined ? null : e.color, lw: e.lw === undefined ? null : e.lw, ltype: e.ltype === undefined ? null : e.ltype, space: e.space || 'model' }; for (var k in g) o[k] = g[k]; return o; }
function tr(n, p) { return T(n, pt(p)); }
function simil(n) { // linear é semelhança (escala uniforme + rotação/espelho)?
  var u = Lv(n, P(1, 0)), v = Lv(n, P(0, 1)), lu = Math.hypot(u.x, u.y);
  return Math.abs(lu - Math.hypot(v.x, v.y)) < 1e-9 * (lu || 1) && Math.abs(u.x * v.x + u.y * v.y) < 1e-9 * lu * lu;
}

var DEFS = {};

DEFS.line = {
  label: 'Linha', dxf: ['LINE'],
  draw: drawGeneric, bbox: bboxOf,
  hit: function (e, p, tol) { return distSeg(p, e.p1, e.p2) <= tol; },
  snapPts: function (e) { return [snp(pt(e.p1), 'endpoint'), snp(pt(e.p2), 'endpoint'), snp(mid(e.p1, e.p2), 'midpoint')]; },
  grips: function (e) {
    return [
      { id: 'p1', kind: 'vertex', pt: pt(e.p1), move: function (e, q) { return { p1: pt(q) }; } },
      { id: 'mid', kind: 'move', pt: mid(e.p1, e.p2), move: function (e, q) { var m = mid(e.p1, e.p2), dx = q.x - m.x, dy = q.y - m.y; return { p1: P(e.p1.x + dx, e.p1.y + dy, e.p1.z), p2: P(e.p2.x + dx, e.p2.y + dy, e.p2.z) }; } },
      { id: 'p2', kind: 'vertex', pt: pt(e.p2), move: function (e, q) { return { p2: pt(q) }; } }];
  },
  transform: function (e, m) { var n = nm(m); return { p1: tr(n, e.p1), p2: tr(n, e.p2) }; },
  props: function (e) {
    var L = dist(e.p1, e.p2), A = ang(e.p1, e.p2) * R2D;
    return [pProp(e, 'p1', 'Início'), pProp(e, 'p2', 'Fim'),
      mkProp('length', 'Comprimento', 'number', L, { min: 0, group: 'Medidas', set: function (e, v) { var a = ang(e.p1, e.p2); return { p2: pol(e.p1, Math.max(0, v), a) }; } }),
      mkProp('angle', 'Ângulo', 'angle', norm360(A), { group: 'Medidas', set: function (e, v) { return { p2: pol(e.p1, dist(e.p1, e.p2), v * D2R) }; } }),
      ro('dx', 'Delta X', 'number', e.p2.x - e.p1.x), ro('dy', 'Delta Y', 'number', e.p2.y - e.p1.y)];
  },
  explode: function () { return []; },
  toDXF: function (e) { return { etype: 'LINE', groups: p3g(pt(e.p1), 10).concat(p3g(pt(e.p2), 11)) }; },
  fromDXF: function (g) { var L = gl(g); return { type: 'line', p1: gpt(L, 10, 20, 30), p2: gpt(L, 11, 21, 31) }; },
  toSVG: function (e) { return '<line x1="' + fmt(e.p1.x) + '" y1="' + fmt(-e.p1.y) + '" x2="' + fmt(e.p2.x) + '" y2="' + fmt(-e.p2.y) + '"/>'; }
};

DEFS.pline = {
  label: 'Polilinha', dxf: ['LWPOLYLINE', 'POLYLINE'],
  draw: drawGeneric, bbox: bboxOf,
  hit: function (e, p, tol) { var t = tess(e, Math.max(tol / 4, 1e-9)); return distPoly(p, t.pts, t.closed) <= tol; },
  snapPts: function (e) {
    var o = [];
    (e.pts || []).forEach(function (p) { o.push(snp(pt(p), 'endpoint')); });
    plSegs(e).forEach(function (g) {
      var a = bulgeArc(g.p1, g.p2, g.b);
      o.push(snp(a ? pol(a.c, a.r, a.a0 + a.th / 2) : mid(g.p1, g.p2), 'midpoint'));
    });
    return o;
  },
  grips: function (e) {
    var o = [];
    (e.pts || []).forEach(function (p, i) {
      o.push({ id: 'v' + i, kind: 'vertex', pt: pt(p), move: function (e, q) { var v = clone(e.pts); v[i].x = q.x; v[i].y = q.y; return { pts: v }; } });
    });
    plSegs(e).forEach(function (g) {
      var i = g.i, j = (i + 1) % e.pts.length;
      o.push({ id: 'm' + i, kind: 'move', pt: mid(g.p1, g.p2), move: function (e, q) {
        var m = mid(e.pts[i], e.pts[j]), dx = q.x - m.x, dy = q.y - m.y, v = clone(e.pts);
        v[i].x += dx; v[i].y += dy; v[j].x += dx; v[j].y += dy; return { pts: v };
      } });
    });
    return o;
  },
  transform: function (e, m) {
    var n = nm(m), flip = det(n) < 0;
    return { pts: (e.pts || []).map(function (p) { var q = tr(n, p); q.bulge = flip ? -num(p.bulge, 0) : num(p.bulge, 0); return q; }) };
  },
  props: function (e) {
    var o = [mkProp('closed', 'Fechada', 'bool', !!e.closed),
      ro('vertices', 'Vértices', 'number', (e.pts || []).length), ro('length', 'Comprimento', 'number', plLength(e))];
    if (e.closed) o.push(ro('area', 'Área', 'number', plArea(e)));
    return o;
  },
  explode: function (e) {
    return plSegs(e).map(function (g) {
      var a = bulgeArc(g.p1, g.p2, g.b);
      return a ? inherit(e, { type: 'arc', c: a.c, r: a.r, a1: norm360(a.a1 * R2D), a2: norm360(a.a2 * R2D) })
        : inherit(e, { type: 'line', p1: pt(g.p1), p2: pt(g.p2) });
    });
  },
  toDXF: function (e) {
    var G = [[90, (e.pts || []).length], [70, e.closed ? 1 : 0]];
    (e.pts || []).forEach(function (p) { G.push([10, p.x], [20, p.y]); if (Math.abs(num(p.bulge, 0)) > EPS) G.push([42, p.bulge]); });
    return { etype: 'LWPOLYLINE', groups: G };
  },
  fromDXF: function (g) {
    var pts = [], closed = false, L = gl(g), cur = null;
    if (g && g.vertices) {
      g.vertices.forEach(function (vg) { var V = gl(vg); pts.push({ x: g1(V, 10, 0), y: g1(V, 20, 0), z: g1(V, 30, 0), bulge: g1(V, 42, 0) }); });
    } else {
      L.forEach(function (r) {
        var c = +r[0], v = parseFloat(r[1]);
        if (c === 10) { cur = { x: v, y: 0, z: 0, bulge: 0 }; pts.push(cur); }
        else if (c === 20 && cur) cur.y = v;
        else if (c === 42 && cur) cur.bulge = v;
      });
    }
    closed = (g1(L, 70, 0) & 1) === 1;
    return { type: 'pline', pts: pts, closed: closed };
  },
  toSVG: function (e) {
    var v = e.pts || [], s = plSegs(e), d = '';
    if (!v.length) return '';
    d = 'M' + sp(v[0]);
    s.forEach(function (g) {
      var a = bulgeArc(g.p1, g.p2, g.b);
      d += ' ' + (a ? svgArcTo(a.r, a.th, g.p2) : 'L' + sp(g.p2));
    });
    return '<path d="' + d + (e.closed ? ' Z' : '') + '"/>';
  }
};

DEFS.circle = {
  label: 'Círculo', dxf: ['CIRCLE'],
  draw: drawGeneric, bbox: bboxOf,
  hit: function (e, p, tol) { return Math.abs(dist(p, e.c) - e.r) <= tol; },
  snapPts: function (e) {
    var o = [snp(pt(e.c), 'center')], k;
    for (k = 0; k < 4; k++) o.push(snp(pol(e.c, e.r, k * PI / 2), 'quadrant'));
    return o;
  },
  grips: function (e) {
    var o = [{ id: 'c', kind: 'move', pt: pt(e.c), move: function (e, q) { return { c: pt(q) }; } }];
    [0, 1, 2, 3].forEach(function (k) {
      o.push({ id: 'q' + k, kind: 'radius', pt: pol(e.c, e.r, k * PI / 2), move: function (e, q) { return { r: Math.max(EPS, dist(e.c, q)) }; } });
    });
    return o;
  },
  transform: function (e, m) {
    var n = nm(m);
    if (simil(n)) { var s = Math.hypot(n.a, n.b); return { c: tr(n, e.c), r: e.r * s }; }
    var p = affEllipse(n, pt(e.c), P(e.r, 0), P(0, e.r), 0, 360);
    return { type: 'ellipse', c: p.c, major: p.major, ratio: p.ratio, a1: 0, a2: 360, r: undefined };
  },
  props: function (e) {
    return [pProp(e, 'c', 'Centro'),
      mkProp('r', 'Raio', 'number', e.r, { min: 0 }),
      mkProp('diameter', 'Diâmetro', 'number', e.r * 2, { min: 0, group: 'Medidas', set: function (e, v) { return { r: Math.max(0, v) / 2 }; } }),
      ro('circ', 'Circunferência', 'number', TAU * e.r), ro('area', 'Área', 'number', PI * e.r * e.r)];
  },
  explode: function () { return []; },
  toDXF: function (e) { return { etype: 'CIRCLE', groups: p3g(pt(e.c), 10).concat([[40, e.r]]) }; },
  fromDXF: function (g) { var L = gl(g); return { type: 'circle', c: gpt(L, 10, 20, 30), r: g1(L, 40, 0) }; },
  toSVG: function (e) { return '<circle cx="' + fmt(e.c.x) + '" cy="' + fmt(-e.c.y) + '" r="' + fmt(e.r) + '"/>'; }
};

DEFS.arc = {
  label: 'Arco', dxf: ['ARC'],
  draw: drawGeneric, bbox: bboxOf,
  hit: function (e, p, tol) {
    var d = dist(p, e.c), a = ang(e.c, p), sw = sweepRad(e.a1, e.a2);
    if (inSweep(a, e.a1 * D2R, sw)) return Math.abs(d - e.r) <= tol;
    return Math.min(dist(p, pol(e.c, e.r, e.a1 * D2R)), dist(p, pol(e.c, e.r, e.a2 * D2R))) <= tol;
  },
  snapPts: function (e) {
    var a0 = e.a1 * D2R, sw = sweepRad(e.a1, e.a2), o = [snp(pol(e.c, e.r, a0), 'endpoint'), snp(pol(e.c, e.r, a0 + sw), 'endpoint'), snp(pol(e.c, e.r, a0 + sw / 2), 'midpoint'), snp(pt(e.c), 'center')], k;
    for (k = 0; k < 4; k++) if (inSweep(k * PI / 2, a0, sw)) o.push(snp(pol(e.c, e.r, k * PI / 2), 'quadrant'));
    return o;
  },
  grips: function (e) {
    var a0 = e.a1 * D2R, sw = sweepRad(e.a1, e.a2);
    return [
      { id: 'c', kind: 'move', pt: pt(e.c), move: function (e, q) { return { c: pt(q) }; } },
      { id: 'start', kind: 'angle', pt: pol(e.c, e.r, a0), move: function (e, q) { return { a1: norm360(ang(e.c, q) * R2D) }; } },
      { id: 'end', kind: 'angle', pt: pol(e.c, e.r, a0 + sw), move: function (e, q) { return { a2: norm360(ang(e.c, q) * R2D) }; } },
      { id: 'mid', kind: 'radius', pt: pol(e.c, e.r, a0 + sw / 2), move: function (e, q) { return { r: Math.max(EPS, dist(e.c, q)) }; } }];
  },
  transform: function (e, m) {
    var n = nm(m), s = pol(e.c, e.r, e.a1 * D2R), f = pol(e.c, e.r, e.a2 * D2R);
    if (simil(n)) {
      var c2 = tr(n, e.c), s2 = tr(n, s), f2 = tr(n, f), flip = det(n) < 0;
      var A = norm360(ang(c2, s2) * R2D), B = norm360(ang(c2, f2) * R2D);
      return { c: c2, r: e.r * Math.hypot(n.a, n.b), a1: flip ? B : A, a2: flip ? A : B };
    }
    var p = affEllipse(n, pt(e.c), P(e.r, 0), P(0, e.r), e.a1, e.a1 + sweepRad(e.a1, e.a2) * R2D);
    return { type: 'ellipse', c: p.c, major: p.major, ratio: p.ratio, a1: p.a1, a2: p.a2, r: undefined };
  },
  props: function (e) {
    var sw = sweepRad(e.a1, e.a2);
    return [pProp(e, 'c', 'Centro'), mkProp('r', 'Raio', 'number', e.r, { min: 0 }),
      mkProp('a1', 'Ângulo inicial', 'angle', e.a1), mkProp('a2', 'Ângulo final', 'angle', e.a2),
      ro('total', 'Ângulo total', 'angle', sw * R2D), ro('length', 'Comprimento', 'number', e.r * sw),
      ro('area', 'Área (setor)', 'number', e.r * e.r * sw / 2)];
  },
  explode: function () { return []; },
  toDXF: function (e) { return { etype: 'ARC', groups: p3g(pt(e.c), 10).concat([[40, e.r], [50, norm360(e.a1)], [51, norm360(e.a2)]]) }; },
  fromDXF: function (g) { var L = gl(g); return { type: 'arc', c: gpt(L, 10, 20, 30), r: g1(L, 40, 0), a1: g1(L, 50, 0), a2: g1(L, 51, 360) }; },
  toSVG: function (e) {
    var sw = sweepRad(e.a1, e.a2), p1 = pol(e.c, e.r, e.a1 * D2R), p2 = pol(e.c, e.r, e.a1 * D2R + sw);
    return '<path d="M' + sp(p1) + ' ' + svgArcTo(e.r, sw, p2) + '"/>';
  }
};

DEFS.ellipse = {
  label: 'Elipse', dxf: ['ELLIPSE'],
  draw: drawGeneric, bbox: bboxOf,
  hit: function (e, p, tol) { var t = tess(e, Math.max(tol / 4, 1e-9)); return distPoly(p, t.pts, t.closed) <= tol; },
  snapPts: function (e) {
    var o = [snp(pt(e.c), 'center')], a1 = num(e.a1, 0), full = eFull(e), sw = full ? 360 : sweepRad(a1, num(e.a2, 360)) * R2D;
    [0, 90, 180, 270].forEach(function (t) { if (full || norm360(t - a1) <= sw + 1e-9) o.push(snp(ePt(e, t), 'quadrant')); });
    if (!full) { o.push(snp(ePt(e, a1), 'endpoint'), snp(ePt(e, a1 + sw), 'endpoint'), snp(ePt(e, a1 + sw / 2), 'midpoint')); }
    return o;
  },
  grips: function (e) {
    var M = e.major, lm = Math.hypot(M.x, M.y);
    return [
      { id: 'c', kind: 'move', pt: pt(e.c), move: function (e, q) { return { c: pt(q) }; } },
      { id: 'major', kind: 'axis', pt: ePt(e, 0), move: function (e, q) { return { major: P(q.x - e.c.x, q.y - e.c.y, 0) }; } },
      { id: 'major2', kind: 'axis', pt: ePt(e, 180), move: function (e, q) { return { major: P(e.c.x - q.x, e.c.y - q.y, 0) }; } },
      { id: 'minor', kind: 'ratio', pt: ePt(e, 90), move: function (e, q) { return { ratio: clamp(dist(e.c, q) / (Math.hypot(e.major.x, e.major.y) || 1), 1e-4, 1) }; } },
      { id: 'minor2', kind: 'ratio', pt: ePt(e, 270), move: function (e, q) { return { ratio: clamp(dist(e.c, q) / (Math.hypot(e.major.x, e.major.y) || 1), 1e-4, 1) }; } }];
  },
  transform: function (e, m) {
    var n = nm(m), a1 = num(e.a1, 0), a2 = num(e.a2, 360);
    var sw = eFull(e) ? 360 : sweepRad(a1, a2) * R2D;
    var p = affEllipse(n, pt(e.c), e.major, eMin(e), a1, a1 + sw);
    return { c: p.c, major: p.major, ratio: p.ratio, a1: eFull(e) ? 0 : p.a1, a2: eFull(e) ? 360 : p.a2 };
  },
  props: function (e) {
    var a = Math.hypot(e.major.x, e.major.y), full = eFull(e);
    var o = [pProp(e, 'c', 'Centro'),
      mkProp('ratio', 'Razão dos eixos', 'number', e.ratio, { min: 0.0001, max: 1 }),
      mkProp('majorR', 'Semi-eixo maior', 'number', a, { min: 0, set: function (e, v) { var l = Math.hypot(e.major.x, e.major.y) || 1; return { major: P(e.major.x / l * v, e.major.y / l * v, 0) }; } }),
      ro('minorR', 'Semi-eixo menor', 'number', a * e.ratio),
      mkProp('rot', 'Rotação', 'angle', norm360(Math.atan2(e.major.y, e.major.x) * R2D), { set: function (e, v) { return { major: pol(P(0, 0), Math.hypot(e.major.x, e.major.y), v * D2R) }; } }),
      mkProp('a1', 'Parâmetro inicial', 'angle', num(e.a1, 0)), mkProp('a2', 'Parâmetro final', 'angle', num(e.a2, 360)),
      ro('length', 'Comprimento', 'number', ellLen(e))];
    if (full) o.push(ro('area', 'Área', 'number', PI * a * a * e.ratio));
    return o;
  },
  explode: function () { return []; },
  toDXF: function (e) {
    var full = eFull(e);
    return { etype: 'ELLIPSE', groups: p3g(pt(e.c), 10).concat(p3g(pt(e.major), 11), [[40, e.ratio], [41, full ? 0 : norm360(num(e.a1, 0)) * D2R], [42, full ? TAU : norm360(num(e.a2, 360)) * D2R]]) };
  },
  fromDXF: function (g) {
    var L = gl(g), s = g1(L, 41, 0), f = g1(L, 42, TAU), full = Math.abs(f - s - TAU) < 1e-6 || Math.abs(f - s) < 1e-9;
    return { type: 'ellipse', c: gpt(L, 10, 20, 30), major: gpt(L, 11, 21, 31), ratio: g1(L, 40, 1), a1: full ? 0 : norm360(s * R2D), a2: full ? 360 : norm360(f * R2D) };
  },
  toSVG: function (e) {
    var a = Math.hypot(e.major.x, e.major.y), b = a * e.ratio, rot = -Math.atan2(e.major.y, e.major.x) * R2D;
    if (eFull(e)) return '<ellipse cx="' + fmt(e.c.x) + '" cy="' + fmt(-e.c.y) + '" rx="' + fmt(a) + '" ry="' + fmt(b) + '" transform="rotate(' + fmt(rot) + ' ' + fmt(e.c.x) + ' ' + fmt(-e.c.y) + ')"/>';
    var a1 = num(e.a1, 0), sw = sweepRad(a1, num(e.a2, 360)) * R2D, p1 = ePt(e, a1), p2 = ePt(e, a1 + sw);
    return '<path d="M' + sp(p1) + ' A' + fmt(a) + ' ' + fmt(b) + ' ' + fmt(rot) + ' ' + (sw > 180 ? 1 : 0) + ' 1 ' + sp(p2) + '"/>';
  }
};

DEFS.spline = {
  label: 'Spline', dxf: ['SPLINE'],
  draw: drawGeneric, bbox: bboxOf,
  hit: function (e, p, tol) { var t = tess(e, 0); return distPoly(p, t.pts, t.closed) <= tol; },
  snapPts: function (e) {
    var f = e.fit || [];
    if (!f.length) return [];
    return e.closed ? [snp(pt(f[0]), 'endpoint')] : [snp(pt(f[0]), 'endpoint'), snp(pt(f[f.length - 1]), 'endpoint')];
  },
  grips: function (e) {
    return (e.fit || []).map(function (p, i) {
      return { id: 'f' + i, kind: 'vertex', pt: pt(p), move: function (e, q) { var f = clone(e.fit); f[i].x = q.x; f[i].y = q.y; return { fit: f }; } };
    });
  },
  transform: function (e, m) { var n = nm(m); return { fit: (e.fit || []).map(function (p) { return tr(n, p); }) }; },
  props: function (e) {
    return [mkProp('closed', 'Fechada', 'bool', !!e.closed), ro('count', 'Pontos de ajuste', 'number', (e.fit || []).length), ro('length', 'Comprimento', 'number', splLen(e))];
  },
  explode: function () { return []; },
  toDXF: function (e) {
    var G = [[70, (e.closed ? 1 : 0) + 8], [71, 3], [72, 0], [73, 0], [74, (e.fit || []).length]];
    (e.fit || []).forEach(function (p) { G.push([11, p.x], [21, p.y], [31, p.z || 0]); });
    return { etype: 'SPLINE', groups: G };
  },
  fromDXF: function (g) {
    var L = gl(g), fit = [], cur = null;
    L.forEach(function (r) {
      var c = +r[0], v = parseFloat(r[1]);
      if (c === 11) { cur = P(v, 0, 0); fit.push(cur); } else if (c === 21 && cur) cur.y = v; else if (c === 31 && cur) cur.z = v;
    });
    if (!fit.length) { // sem fit points: usa pontos de controle (10/20/30) como aproximação
      L.forEach(function (r) { var c = +r[0], v = parseFloat(r[1]); if (c === 10) { cur = P(v, 0, 0); fit.push(cur); } else if (c === 20 && cur) cur.y = v; else if (c === 30 && cur) cur.z = v; });
    }
    return { type: 'spline', fit: fit, closed: (g1(L, 70, 0) & 1) === 1 };
  },
  toSVG: function (e) { var t = splinePts(e, 16); return t.length ? '<path d="' + svgPath(t, !!e.closed) + '"/>' : ''; }
};

DEFS.point = {
  label: 'Ponto', dxf: ['POINT'],
  draw: drawPoint,
  bbox: bboxOf,
  hit: function (e, p, tol) { return dist(p, e.p) <= tol; },
  snapPts: function (e) { return [snp(pt(e.p), 'node')]; },
  grips: function (e) { return [{ id: 'p', kind: 'move', pt: pt(e.p), move: function (e, q) { return { p: pt(q) }; } }]; },
  transform: function (e, m) { return { p: tr(nm(m), e.p) }; },
  props: function (e) { return [pProp(e, 'p', 'Posição')]; },
  explode: function () { return []; },
  toDXF: function (e) { return { etype: 'POINT', groups: p3g(pt(e.p), 10) }; },
  fromDXF: function (g) { return { type: 'point', p: gpt(gl(g), 10, 20, 30) }; },
  toSVG: function (e) { return '<circle class="cad-point" cx="' + fmt(e.p.x) + '" cy="' + fmt(-e.p.y) + '" r="0.2"/>'; }
};

/* registro */
if (CAD.types && CAD.types.register) {
  Object.keys(DEFS).forEach(function (k) { CAD.types.register(k, DEFS[k]); });
} else if (typeof console !== 'undefined') console.warn('P5: CAD.types ausente; tipos não registrados.');

/* DXF: despacho por nome de entidade */
S.dxfMap = { LINE: 'line', LWPOLYLINE: 'pline', POLYLINE: 'pline', CIRCLE: 'circle', ARC: 'arc', ELLIPSE: 'ellipse', SPLINE: 'spline', POINT: 'point' };
S.fromDXF = function (g) { var n = g && (g.etype || g.type || g.name), t = S.dxfMap[String(n).toUpperCase()]; return t ? DEFS[t].fromDXF(g) : null; };
S.defs = DEFS;

/* ---------- criação de entidades ---------- */
function IN() { return (env && env.input) || CAD.input; }
function say(m) { if (env && env.print) env.print(m); else if (CAD.cmd && CAD.cmd.print) CAD.cmd.print(m); }
function mk(type, g) {
  var cur = (CAD.doc && CAD.doc.current) || {}, e = {
    type: type, layer: cur.layer || '0',
    color: cur.color == null ? null : cur.color, lw: cur.lw == null ? null : cur.lw, ltype: cur.ltype == null ? null : cur.ltype,
    space: S.settings.space || 'model'
  };
  for (var k in g) e[k] = g[k];
  return e;
}
function commit(name, spec) {
  if (env && env.add) return env.add(clone(spec));
  var id = null;
  function add() {
    var s = clone(spec); if (id !== null) s.id = id;
    var r = CAD.ents.add(s); id = (r && typeof r === 'object') ? r.id : r;
  }
  if (CAD.history && CAD.history.run) CAD.history.run({ name: name, do: add, undo: function () { CAD.ents.remove(id); } });
  else add();
  return id;
}
function undoLast() { if (env && env.undo) env.undo(); else if (CAD.history && CAD.history.undo) CAD.history.undo(); }

/* entradas: ponto (ou palavra-chave / null = Enter) e distância (clique ou número digitado) */
function askPt(prompt, o) { return IN().point(prompt, o || {}); }
async function askDist(prompt, base, o) {
  o = Object.assign({ base: base, allowNumber: true }, o || {});
  var r = await IN().point(prompt, o);
  if (isPt(r)) return { d: dist(base, r), ang: ang(base, r), pt: r };
  var k = typeof r === 'string' ? kw(r, o.keywords) : null;
  if (k) return { kw: k };
  var n = toNum(r);
  return n !== null ? { d: n, ang: 0, pt: null } : null;
}
async function askNum(prompt, o) { var r = await IN().number(prompt, o || {}); return toNum(r); }
function guard(fn) {
  return async function () {
    try { await fn(); }
    catch (x) { if (isCancel(x)) return; throw x; }
  };
}

/* ---------- comandos ---------- */
var cmdLine = async function () {
  var first = await askPt('LINE Primeiro ponto');
  if (!isPt(first)) return;
  var pts = [first], n = 0;
  try {
    for (;;) {
      var prev = pts[pts.length - 1], kws = [];
      if (n > 0) kws.push('Desfazer');
      if (n > 1) kws.push('Fechar');
      var r = await askPt('Próximo ponto' + (kws.length ? ' ou [' + kws.join('/') + ']' : ''), {
        base: prev, keywords: kws, preview: function (q) { return mk('line', { p1: prev, p2: q }); }
      });
      var k = kw(r, kws);
      if (isPt(r)) { commit('Linha', mk('line', { p1: pt(prev), p2: pt(r) })); pts.push(r); n++; }
      else if (k === 'Desfazer') { undoLast(); pts.pop(); n--; }
      else if (k === 'Fechar') { commit('Linha', mk('line', { p1: pt(prev), p2: pt(first) })); break; }
      else break;
    }
  } catch (x) { if (!isCancel(x)) throw x; }
};

function tangentEnd(v, closedUnused) { // direção (rad) no último vértice, ou null
  var n = v.length; if (n < 2) return null;
  var p = v[n - 2], q = v[n - 1], b = num(p.bulge, 0), a = bulgeArc(p, q, b);
  if (!a) return ang(p, q);
  return ang(a.c, q) + (b > 0 ? PI / 2 : -PI / 2);
}
var cmdPline = async function () {
  var first = await askPt('PLINE Ponto inicial');
  if (!isPt(first)) return;
  var v = [{ x: first.x, y: first.y, z: first.z || 0, bulge: 0 }], closed = false, arcMode = false, t0 = null;
  async function tangent(last) {
    var t = tangentEnd(v);
    if (t !== null) return t;
    if (t0 === null) { var a = await IN().angle('Direção da tangente do arco', { base: last }); t0 = (toNum(a) || 0) * D2R; }
    return t0;
  }
  function preview(q, t) {
    var w = clone(v), last = w[w.length - 1];
    last.bulge = (arcMode && t !== null) ? bulgeFromTangent(last, q, t) : 0;
    w.push({ x: q.x, y: q.y, z: q.z || 0, bulge: 0 });
    return mk('pline', { pts: w, closed: false });
  }
  try {
    for (;;) {
      var last = v[v.length - 1], kws = [arcMode ? 'Linha' : 'Arco'];
      if (v.length > 1) kws.push('Desfazer');
      if (v.length > 2 || (arcMode && v.length > 1)) kws.push('Fechar');
      var tcur = arcMode ? await tangent(last) : null;
      var r = await askPt('Próximo ponto' + (arcMode ? ' do arco' : '') + ' ou [' + kws.join('/') + ']', {
        base: last, keywords: kws, preview: function (q) { return preview(q, tcur); }
      });
      var k = kw(r, kws);
      if (isPt(r)) {
        last.bulge = arcMode ? bulgeFromTangent(last, r, tcur) : 0;
        v.push({ x: r.x, y: r.y, z: r.z || 0, bulge: 0 });
      } else if (k === 'Arco') arcMode = true;
      else if (k === 'Linha') arcMode = false;
      else if (k === 'Desfazer') { v.pop(); v[v.length - 1].bulge = 0; }
      else if (k === 'Fechar') {
        last.bulge = arcMode ? bulgeFromTangent(last, v[0], tcur) : 0;
        closed = true; break;
      } else break;
    }
  } catch (x) { if (!isCancel(x)) throw x; }
  if (v.length >= 2) commit('Polilinha', mk('pline', { pts: v, closed: closed }));
};

var cmdCircle = guard(async function () {
  var K = ['3P', '2P'];
  var r0 = await askPt('CIRCLE Centro do círculo ou [3P/2P]', { keywords: K });
  var k = kw(r0, K), c, a, b;
  if (k === '3P') {
    a = await askPt('Primeiro ponto'); if (!isPt(a)) return;
    b = await askPt('Segundo ponto', { base: a }); if (!isPt(b)) return;
    c = await askPt('Terceiro ponto', { base: b, preview: function (q) { var z = circle3(a, b, q); return z && mk('circle', { c: z.c, r: z.r }); } });
    if (!isPt(c)) return;
    var z = circle3(a, b, c); if (!z) { say('Os três pontos são colineares.'); return; }
    commit('Círculo', mk('circle', { c: z.c, r: z.r })); return;
  }
  if (k === '2P') {
    a = await askPt('Primeira extremidade do diâmetro'); if (!isPt(a)) return;
    b = await askPt('Segunda extremidade do diâmetro', { base: a, preview: function (q) { return mk('circle', { c: mid(a, q), r: dist(a, q) / 2 }); } });
    if (!isPt(b) || dist(a, b) < EPS) return;
    commit('Círculo', mk('circle', { c: mid(a, b), r: dist(a, b) / 2 })); return;
  }
  if (!isPt(r0)) return;
  c = r0;
  var d = await askDist('Raio ou [Diâmetro]', c, { keywords: ['Diâmetro'], preview: function (q) { return mk('circle', { c: c, r: dist(c, q) }); } });
  if (!d) return;
  var R;
  if (d.kw === 'Diâmetro') {
    var dd = await askDist('Diâmetro', c, { preview: function (q) { return mk('circle', { c: c, r: dist(c, q) / 2 }); } });
    if (!dd || dd.kw) return; R = dd.d / 2;
  } else R = d.d;
  if (!(R > EPS)) { say('Raio inválido.'); return; }
  commit('Círculo', mk('circle', { c: pt(c), r: R }));
});

var cmdArc = guard(async function () {
  var r1 = await askPt('ARC Ponto inicial do arco ou [Centro]', { keywords: ['Centro'] }), p1, c, a, e;
  function fromCenter(cc, s) {
    return async function () {
      var rad = dist(cc, s);
      var f = await askPt('Ponto final (ângulo)', { base: cc, preview: function (q) { return mk('arc', { c: cc, r: rad, a1: norm360(ang(cc, s) * R2D), a2: norm360(ang(cc, q) * R2D) }); } });
      if (!isPt(f) || rad < EPS) return;
      commit('Arco', mk('arc', { c: pt(cc), r: rad, a1: norm360(ang(cc, s) * R2D), a2: norm360(ang(cc, f) * R2D) }));
    };
  }
  if (kw(r1, ['Centro']) === 'Centro') {
    c = await askPt('Centro do arco'); if (!isPt(c)) return;
    p1 = await askPt('Ponto inicial', { base: c }); if (!isPt(p1)) return;
    return fromCenter(c, p1)();
  }
  if (!isPt(r1)) return;
  p1 = r1;
  var K = ['Centro', 'Fim'];
  var r2 = await askPt('Segundo ponto ou [Centro/Fim]', { base: p1, keywords: K });
  var k = kw(r2, K);
  if (k === 'Centro') { c = await askPt('Centro do arco'); if (!isPt(c)) return; return fromCenter(c, p1)(); }
  if (k === 'Fim') {
    e = await askPt('Ponto final', { base: p1 }); if (!isPt(e)) return;
    var rr = await askDist('Raio (negativo = arco maior)', e, { preview: null });
    if (!rr || rr.kw) return;
    var s = arcSER(p1, e, rr.d); if (!s) { say('Raio menor que metade da corda.'); return; }
    commit('Arco', mk('arc', s)); return;
  }
  if (!isPt(r2)) return;
  a = r2;
  e = await askPt('Ponto final', { base: a, preview: function (q) { var z = arc3(p1, a, q); return z && mk('arc', z); } });
  if (!isPt(e)) return;
  var A = arc3(p1, a, e); if (!A) { say('Os três pontos são colineares.'); return; }
  commit('Arco', mk('arc', A));
});

var cmdRect = guard(async function () {
  var st = S.settings, K0 = ['Chanfro', 'Filete', 'Dimensões'], first;
  for (;;) {
    var r = await askPt('RECTANG Primeiro canto ou [Chanfro/Filete/Dimensões]', { keywords: K0 });
    var k = kw(r, K0);
    if (k === 'Chanfro') {
      var d1 = await askNum('Primeira distância do chanfro <' + st.rectChamfer[0] + '>', { default: st.rectChamfer[0], min: 0 });
      var d2 = await askNum('Segunda distância do chanfro <' + st.rectChamfer[1] + '>', { default: st.rectChamfer[1], min: 0 });
      st.rectChamfer = [d1 === null ? st.rectChamfer[0] : d1, d2 === null ? st.rectChamfer[1] : d2]; st.rectFillet = 0; continue;
    }
    if (k === 'Filete') {
      var f = await askNum('Raio do filete <' + st.rectFillet + '>', { default: st.rectFillet, min: 0 });
      st.rectFillet = f === null ? st.rectFillet : f; st.rectChamfer = [0, 0]; continue;
    }
    if (!isPt(r)) return;
    first = r; break;
  }
  var opts = function () { return { fillet: st.rectFillet, chamfer: st.rectChamfer }; };
  var r2 = await askPt('Outro canto ou [Dimensões]', {
    base: first, keywords: ['Dimensões'],
    preview: function (q) { return mk('pline', { pts: rectPts(first, q, opts()), closed: true }); }
  });
  var p2;
  if (kw(r2, ['Dimensões']) === 'Dimensões') {
    var L = await askNum('Comprimento (X)', {}), W = await askNum('Largura (Y)', {});
    if (L === null || W === null) return;
    var dir = await askPt('Indique o outro canto para definir a direção', { base: first });
    var sx = isPt(dir) && dir.x < first.x ? -1 : 1, sy = isPt(dir) && dir.y < first.y ? -1 : 1;
    p2 = P(first.x + sx * Math.abs(L), first.y + sy * Math.abs(W), first.z || 0);
  } else if (isPt(r2)) p2 = r2; else return;
  if (Math.abs(p2.x - first.x) < EPS || Math.abs(p2.y - first.y) < EPS) { say('Retângulo com dimensão nula.'); return; }
  commit('Retângulo', mk('pline', { pts: rectPts(first, p2, opts()), closed: true }));
});

var cmdPolygon = guard(async function () {
  var st = S.settings;
  var n = await askNum('POLYGON Número de lados <' + st.polySides + '>', { default: st.polySides, min: 3, max: 1024, integer: true });
  if (n === null) n = st.polySides;
  n = Math.round(n);
  if (n < 3 || n > 1024) { say('Número de lados inválido (3 a 1024).'); return; }
  st.polySides = n;
  var K = ['Aresta'], r0 = await askPt('Centro do polígono ou [Aresta]', { keywords: K });
  if (kw(r0, K) === 'Aresta') {
    var e1 = await askPt('Primeira extremidade da aresta'); if (!isPt(e1)) return;
    var e2 = await askPt('Segunda extremidade da aresta', { base: e1, preview: function (q) { return mk('pline', { pts: polygonByEdge(e1, q, n), closed: true }); } });
    if (!isPt(e2) || dist(e1, e2) < EPS) return;
    commit('Polígono', mk('pline', { pts: polygonByEdge(e1, e2, n), closed: true })); return;
  }
  if (!isPt(r0)) return;
  var M = ['Inscrito', 'Circunscrito'];
  var m = await IN().keyword('Inscrito ou circunscrito [Inscrito/Circunscrito] <' + st.polyMode + '>', { keywords: M, options: M, default: st.polyMode });
  m = kw(m, M) || st.polyMode; st.polyMode = m;
  var circ = m === 'Circunscrito';
  var d = await askDist('Raio do círculo', r0, { preview: function (q) { return mk('pline', { pts: polygonPts(r0, n, Math.max(dist(r0, q), EPS), ang(r0, q), circ), closed: true }); } });
  if (!d || d.kw || !(d.d > EPS)) return;
  commit('Polígono', mk('pline', { pts: polygonPts(r0, n, d.d, d.ang, circ), closed: true }));
});

var cmdEllipse = guard(async function () {
  var K = ['Arco', 'Centro'], isArc = false, c, major, r;
  for (;;) {
    r = await askPt('ELLIPSE Extremidade do eixo ou [Arco/Centro]', { keywords: K });
    var k = kw(r, K);
    if (k === 'Arco') { isArc = true; continue; }
    if (k === 'Centro') {
      c = await askPt('Centro da elipse'); if (!isPt(c)) return;
      var e1 = await askPt('Extremidade do eixo', { base: c }); if (!isPt(e1)) return;
      major = P(e1.x - c.x, e1.y - c.y, 0); break;
    }
    if (!isPt(r)) return;
    var e2 = await askPt('Outra extremidade do eixo', { base: r }); if (!isPt(e2)) return;
    c = mid(r, e2); major = P(e2.x - r.x, e2.y - r.y, 0)
    major = P(major.x / 2, major.y / 2, 0); break;
  }
  var lm = Math.hypot(major.x, major.y);
  if (lm < EPS) { say('Eixo com comprimento nulo.'); return; }
  var d = await askDist('Distância ao outro eixo', c, { preview: function (q) { var dd = dist(c, q); return dd > EPS && mk('ellipse', mkEll(c, major, dd)); } });
  if (!d || d.kw || !(d.d > EPS)) return;
  var g = mkEll(c, major, d.d);
  if (isArc) {
    var s = await IN().angle('Ângulo inicial', { base: c }), f = await IN().angle('Ângulo final', { base: c });
    if (toNum(s) === null || toNum(f) === null) return;
    var base = mk('ellipse', g);
    g.a1 = dirToParam(base, toNum(s)); g.a2 = dirToParam(base, toNum(f));
  }
  commit('Elipse', mk('ellipse', g));
});
function mkEll(c, major, d) { // d > semi-eixo maior troca os eixos
  var lm = Math.hypot(major.x, major.y);
  if (d <= lm) return { c: pt(c), major: P(major.x, major.y, 0), ratio: d / lm, a1: 0, a2: 360 };
  return { c: pt(c), major: P(-major.y / lm * d, major.x / lm * d, 0), ratio: lm / d, a1: 0, a2: 360 };
}

var cmdSpline = async function () {
  var first = await askPt('SPLINE Primeiro ponto');
  if (!isPt(first)) return;
  var f = [pt(first)], closed = false;
  try {
    for (;;) {
      var kws = []; if (f.length > 1) kws.push('Desfazer'); if (f.length > 2) kws.push('Fechar');
      var r = await askPt('Próximo ponto' + (kws.length ? ' ou [' + kws.join('/') + ']' : '') + ' (Enter para terminar)', {
        base: f[f.length - 1], keywords: kws, preview: function (q) { return mk('spline', { fit: f.concat([pt(q)]), closed: false }); }
      });
      var k = kw(r, kws);
      if (isPt(r)) f.push(pt(r));
      else if (k === 'Desfazer') f.pop();
      else if (k === 'Fechar') { closed = true; break; }
      else break;
    }
  } catch (x) { if (!isCancel(x)) throw x; }
  if (f.length >= 2) commit('Spline', mk('spline', { fit: f, closed: closed }));
};

var cmdPoint = async function () {
  try {
    for (;;) {
      var r = await askPt('POINT Ponto (Esc para terminar)');
      if (!isPt(r)) break;
      commit('Ponto', mk('point', { p: pt(r) }));
    }
  } catch (x) { if (!isCancel(x)) throw x; }
};

function setPd(key, label, dflt) {
  return guard(async function () {
    var d = CAD.doc || {}, cur = num(d[key], dflt);
    var v = await askNum(label + ' <' + cur + '>', { default: cur });
    if (v === null) return;
    var nv = Math.round(v * 1e6) / 1e6, old = d[key];
    var apply = function () { d[key] = nv; if (CAD.render && CAD.render.request) CAD.render.request(); };
    if (CAD.history && CAD.history.run) CAD.history.run({ name: label, do: apply, undo: function () { d[key] = old; if (CAD.render && CAD.render.request) CAD.render.request(); } });
    else apply();
  });
}

/* registro de comandos, menus e toolbar */
function regCmds() {
  if (!CAD.cmd || !CAD.cmd.register) return;
  [
    { name: 'LINE', alias: ['L'], run: cmdLine }, { name: 'PLINE', alias: ['PL'], run: cmdPline },
    { name: 'CIRCLE', alias: ['C'], run: cmdCircle }, { name: 'ARC', alias: ['A'], run: cmdArc },
    { name: 'RECTANG', alias: ['REC', 'RECT'], run: cmdRect }, { name: 'POLYGON', alias: ['POL'], run: cmdPolygon },
    { name: 'ELLIPSE', alias: ['EL'], run: cmdEllipse }, { name: 'SPLINE', alias: ['SPL'], run: cmdSpline },
    { name: 'POINT', alias: ['PO'], run: cmdPoint },
    { name: 'PDMODE', alias: [], run: setPd('pdmode', 'PDMODE (0 ponto, 2 +, 3 x, 4 traço; +32 círculo, +64 quadrado)', 0) },
    { name: 'PDSIZE', alias: [], run: setPd('pdsize', 'PDSIZE (0 = 8 px; >0 = unidades de desenho)', 0) }
  ].forEach(function (c) { CAD.cmd.register(c); });
}
function regUI() {
  var items = [['Linha', 'LINE', '╱'], ['Polilinha', 'PLINE', '⌇'], ['Círculo', 'CIRCLE', '○'], ['Arco', 'ARC', '◜'],
    ['Retângulo', 'RECTANG', '▭'], ['Polígono', 'POLYGON', '⬡'], ['Elipse', 'ELLIPSE', '⬭'], ['Spline', 'SPLINE', '∿'], ['Ponto', 'POINT', '·']];
  items.forEach(function (it) {
    try { if (CAD.ui && CAD.ui.menu && CAD.ui.menu.add) CAD.ui.menu.add('Desenhar', it[0], it[1]); } catch (x) { /* degrada */ }
    try { if (CAD.ui && CAD.ui.toolbar && CAD.ui.toolbar.add) CAD.ui.toolbar.add('Desenhar', { icone: it[2], rotulo: it[0], cmd: it[1] }); } catch (x) { /* degrada */ }
  });
  try { if (CAD.ui && CAD.ui.menu && CAD.ui.menu.add) { CAD.ui.menu.add('Desenhar', 'Estilo de ponto', 'PDMODE'); CAD.ui.menu.add('Desenhar', 'Tamanho de ponto', 'PDSIZE'); } } catch (x) { /* degrada */ }
}
regCmds(); regUI();

/* exportações auxiliares */
S.mk = mk; S.commit = commit; S.tess = tess; S.bulgeArc = bulgeArc; S.rectPts = rectPts; S.polygonPts = polygonPts;
S.polygonByEdge = polygonByEdge; S.circle3 = circle3; S.arc3 = arc3; S.arcSER = arcSER; S.plArea = plArea; S.plLength = plLength;
S.cmds = { LINE: cmdLine, PLINE: cmdPline, CIRCLE: cmdCircle, ARC: cmdArc, RECTANG: cmdRect, POLYGON: cmdPolygon, ELLIPSE: cmdEllipse, SPLINE: cmdSpline, POINT: cmdPoint };
S._setEnv = function (e) { env = e; };

/* ---------- testes ---------- */
CAD.tests = CAD.tests || {};
CAD.tests.p5 = async function () {
  var ok = 0, bad = 0;
  function A(c, m) { if (c) ok++; else { bad++; console.error('FALHA P5:', m); } }
  function near(a, b, t, m) { A(Math.abs(a - b) <= (t || 1e-6), m + ' (' + a + ' ≠ ' + b + ')'); }
  var D = DEFS, id = [1, 0, 0, 1, 0, 0];
  var ln = { type: 'line', p1: P(0, 0), p2: P(10, 0) };
  var ci = { type: 'circle', c: P(5, 5), r: 2 };
  var ar = { type: 'arc', c: P(0, 0), r: 1, a1: 270, a2: 90 };
  var el = { type: 'ellipse', c: P(0, 0), major: P(4, 0), ratio: 0.5, a1: 0, a2: 360 };
  var pl = { type: 'pline', pts: [{ x: 0, y: 0, bulge: 1 }, { x: 2, y: 0, bulge: 0 }], closed: true };
  var sp = { type: 'spline', fit: [P(0, 0), P(2, 3), P(5, 1), P(8, 4)], closed: false };
  var pn = { type: 'point', p: P(3, 4) };
  // tipos registrados
  if (CAD.types && CAD.types.get) ['line', 'pline', 'circle', 'arc', 'ellipse', 'spline', 'point'].forEach(function (t) { A(!!CAD.types.get(t), 'tipo ' + t + ' registrado'); });
  // bulge e medidas
  var ba = bulgeArc(P(0, 0), P(2, 0), 1);
  near(ba.r, 1, 1e-9, 'bulge raio'); near(ba.c.x, 1, 1e-9, 'bulge centro x'); near(ba.c.y, 0, 1e-9, 'bulge centro y');
  near(plArea(pl), PI / 2, 1e-9, 'área semicírculo por bulge'); near(plLength(pl), PI + 2, 1e-9, 'perímetro semicírculo');
  var rc = { type: 'pline', pts: rectPts(P(0, 0), P(10, 6)), closed: true }; near(plArea(rc), 60, 1e-9, 'área retângulo');
  var rf = { type: 'pline', pts: rectPts(P(0, 0), P(10, 6), { fillet: 1 }), closed: true }; near(plArea(rf), 60 - (4 - PI), 1e-9, 'área retângulo com filete');
  near(plArea({ type: 'pline', pts: rectPts(P(0, 0), P(10, 6), { chamfer: [1, 1] }), closed: true }), 58, 1e-9, 'área retângulo com chanfro');
  near(plArea({ type: 'pline', pts: polygonPts(P(0, 0), 6, 1, 0, false), closed: true }), 3 * Math.sqrt(3) / 2, 1e-9, 'hexágono inscrito');
  near(plArea({ type: 'pline', pts: polygonPts(P(0, 0), 6, 1, 0, true), closed: true }), 2 * Math.sqrt(3), 1e-9, 'hexágono circunscrito');
  near(plArea({ type: 'pline', pts: polygonByEdge(P(0, 0), P(2, 0), 4), closed: true }), 4, 1e-9, 'quadrado por aresta');
  var c3 = circle3(P(1, 0), P(0, 1), P(-1, 0)); near(c3.r, 1, 1e-9, 'círculo 3P'); A(circle3(P(0, 0), P(1, 1), P(2, 2)) === null, '3P colinear');
  var a3 = arc3(P(1, 0), P(0, 1), P(-1, 0)); near(a3.a1, 0, 1e-9, 'arco 3P a1'); near(a3.a2, 180, 1e-9, 'arco 3P a2');
  var a3c = arc3(P(-1, 0), P(0, 1), P(1, 0)); near(a3c.a1, 0, 1e-9, 'arco 3P horário a1'); near(a3c.a2, 180, 1e-9, 'arco 3P horário a2');
  var ser = arcSER(P(1, 0), P(-1, 0), 1); near(ser.c.x, 0, 1e-9, 'arco SER centro'); near(ser.a2, 180, 1e-9, 'arco SER a2');
  var bt = bulgeFromTangent(P(0, 0), P(2, 0), PI / 2); near(Math.abs(bt), 1, 1e-9, 'bulge tangente = semicírculo');
  // bbox
  var b = D.arc.bbox(ar); near(b.max.x, 1, 1e-9, 'bbox arco x2'); near(b.min.y, -1, 1e-9, 'bbox arco y1'); near(b.min.x, 0, 1e-9, 'bbox arco x1 (meia-lua direita)');
  b = D.circle.bbox(ci); near(b.min.x, 3, 1e-9, 'bbox círculo');
  b = D.ellipse.bbox({ type: 'ellipse', c: P(0, 0), major: P(1, 1), ratio: 1, a1: 0, a2: 360 }); near(b.max.x, Math.SQRT2, 1e-6, 'bbox elipse girada');
  b = D.pline.bbox(pl); near(b.min.y, -1, 1e-9, 'bbox pline bulge+'); near(b.max.x, 2, 1e-9, 'bbox pline x2');
  b = D.pline.bbox({ type: 'pline', pts: [{ x: 0, y: 0, bulge: -1 }, { x: 2, y: 0 }], closed: false }); near(b.max.y, 1, 1e-9, 'bbox pline bulge-');
  // hit
  A(D.line.hit(ln, P(5, 0.05), 0.1) && !D.line.hit(ln, P(5, 0.5), 0.1), 'hit linha');
  A(D.circle.hit(ci, P(7, 5), 0.01) && !D.circle.hit(ci, P(5, 5), 0.01), 'hit círculo');
  A(D.arc.hit(ar, P(1, 0), 0.01) && !D.arc.hit(ar, P(-1, 0), 0.01), 'hit arco');
  A(D.ellipse.hit(el, P(4, 0), 0.01) && D.ellipse.hit(el, P(0, 2), 0.01), 'hit elipse');
  A(D.spline.hit(sp, P(2, 3), 0.01) && D.spline.hit(sp, P(8, 4), 0.01), 'spline passa pelos pontos de ajuste');
  A(D.pline.hit(pl, P(1, -1), 0.01), 'hit pline arco'); A(D.point.hit(pn, P(3, 4.05), 0.1), 'hit ponto');
  // snap
  var sm = function (e, mode) { return D[e.type].snapPts(e).filter(function (s) { return s.mode === mode; }); };
  A(sm(ln, 'midpoint')[0].pt.x === 5, 'snap meio linha'); A(sm(ci, 'quadrant').length === 4, 'quadrantes círculo'); A(sm(ar, 'quadrant').length === 3, 'quadrantes arco meia-lua (270,0,90)');
  A(sm(ar, 'center').length === 1, 'centro arco'); A(sm(pn, 'node').length === 1, 'node ponto'); A(sm(pl, 'midpoint').length === 2, 'midpoints pline');
  near(sm(pl, 'midpoint')[0].pt.y, -1, 1e-9, 'meio do arco da pline'); A(sm(el, 'quadrant').length === 4, 'quadrantes elipse');
  // transform
  var tm = [1, 0, 0, 1, 5, 7], p = D.line.transform(ln, tm); near(p.p2.x, 15, 1e-9, 'translada linha'); near(p.p2.y, 7, 1e-9, 'translada linha y');
  var rot90 = [0, 1, -1, 0, 0, 0]; p = D.line.transform(ln, rot90); near(p.p2.y, 10, 1e-9, 'gira linha'); near(p.p2.x, 0, 1e-9, 'gira linha x');
  p = D.circle.transform(ci, [2, 0, 0, 2, 0, 0]); near(p.r, 4, 1e-9, 'escala círculo'); near(p.c.x, 10, 1e-9, 'escala círculo centro');
  p = D.circle.transform({ type: 'circle', c: P(0, 0), r: 1 }, [2, 0, 0, 1, 0, 0]); A(p.type === 'ellipse', 'círculo vira elipse'); near(p.ratio, 0.5, 1e-9, 'razão'); near(Math.hypot(p.major.x, p.major.y), 2, 1e-9, 'eixo maior');
  p = D.arc.transform(ar, [-1, 0, 0, 1, 0, 0]); near(p.a1, 90, 1e-9, 'espelho arco a1'); near(p.a2, 270, 1e-9, 'espelho arco a2');
  p = D.arc.transform(ar, rot90); near(p.a1, 0, 1e-9, 'gira arco a1'); near(p.a2, 180, 1e-9, 'gira arco a2');
  p = D.arc.transform(ar, [2, 0, 0, 1, 0, 0]); A(p.type === 'ellipse', 'arco vira arco de elipse');
  var pe = D.ellipse.transform(el, rot90); near(pe.major.y, 4, 1e-9, 'gira elipse'); near(pe.ratio, 0.5, 1e-9, 'razão elipse mantida');
  pe = D.ellipse.transform(el, { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 }); near(pe.ratio, 0.5, 1e-9, 'espelho elipse razão');
  p = D.pline.transform(pl, [-1, 0, 0, 1, 0, 0]); near(p.pts[0].bulge, -1, 1e-9, 'espelho inverte bulge');
  p = D.pline.transform(pl, function (q) { return P(q.x + 1, q.y, 0); }); near(p.pts[1].x, 3, 1e-9, 'matriz como função');
  p = D.point.transform(pn, tm); near(p.p.x, 8, 1e-9, 'translada ponto');
  p = D.spline.transform(sp, tm); near(p.fit[3].y, 11, 1e-9, 'translada spline');
  // props
  var pp = function (e, k) { return D[e.type].props(e).filter(function (x) { return x.key === k; })[0]; };
  near(pp(ln, 'length').value, 10, 1e-9, 'prop comprimento'); p = pp(ln, 'length').set(ln, 5); near(p.p2.x, 5, 1e-9, 'set comprimento');
  p = pp(ln, 'angle').set(ln, 90); near(p.p2.y, 10, 1e-9, 'set ângulo');
  p = pp(ci, 'diameter').set(ci, 10); near(p.r, 5, 1e-9, 'set diâmetro'); near(pp(ci, 'area').value, PI * 4, 1e-9, 'área círculo');
  A(pp(ci, 'area').readonly === true, 'área readonly'); near(pp(ar, 'length').value, PI, 1e-9, 'comprimento arco');
  p = pp(el, 'majorR').set(el, 8); near(p.major.x, 8, 1e-9, 'set semi-eixo maior'); p = pp(el, 'rot').set(el, 90); near(p.major.y, 4, 1e-9, 'set rotação elipse');
  near(pp(el, 'area').value, PI * 4 * 2, 1e-9, 'área elipse'); A(!!pp(pl, 'closed') && pp(pl, 'closed').type === 'bool', 'prop closed');
  near(pp(pl, 'area').value, PI / 2, 1e-9, 'área pline (prop)');
  ['line', 'pline', 'circle', 'arc', 'ellipse', 'spline', 'point'].forEach(function (t) {
    var e = { line: ln, pline: pl, circle: ci, arc: ar, ellipse: el, spline: sp, point: pn }[t];
    D[t].props(e).forEach(function (x) { A(x.key && x.label && x.type && 'value' in x, 'prop completa ' + t + '.' + x.key); });
  });
  // grips
  p = D.line.grips(ln)[1].move(ln, P(5, 5)); near(p.p1.y, 5, 1e-9, 'grip meio move linha');
  p = D.circle.grips(ci)[1].move(ci, P(9, 5)); near(p.r, 4, 1e-9, 'grip quadrante muda raio');
  p = D.arc.grips(ar)[1].move(ar, P(0, -2)); near(p.a1, 270, 1e-9, 'grip início do arco');
  p = D.pline.grips(pl)[1].move(pl, P(3, 1)); near(p.pts[1].x, 3, 1e-9, 'grip vértice pline'); near(pl.pts[1].x, 2, 1e-9, 'grip não muta original');
  p = D.ellipse.grips(el)[3].move(el, P(0, 4)); near(p.ratio, 1, 1e-9, 'grip eixo menor');
  p = D.spline.grips(sp)[1].move(sp, P(2, 9)); near(p.fit[1].y, 9, 1e-9, 'grip spline');
  // explode
  var ex = D.pline.explode({ type: 'pline', layer: 'L1', pts: [{ x: 0, y: 0, bulge: 1 }, { x: 2, y: 0 }, { x: 2, y: 2 }], closed: false });
  A(ex.length === 2 && ex[0].type === 'arc' && ex[1].type === 'line' && ex[0].layer === 'L1', 'explode pline');
  near(ex[0].r, 1, 1e-9, 'explode arco raio'); near(ex[0].a1, 180, 1e-9, 'explode arco a1'); near(ex[0].a2, 0, 1e-9, 'explode arco a2 (ccw 180→0)');
  // DXF ida e volta
  [ln, ci, ar, el, pl, sp, pn].forEach(function (e) {
    var d = D[e.type].toDXF(e), back = D[e.type].fromDXF(d), t = e.type;
    A(back.type === t, 'dxf tipo ' + t);
    var b1 = D[t].bbox(e), b2 = D[t].bbox(back);
    near(b1.max.x, b2.max.x, 1e-6, 'dxf bbox x2 ' + t); near(b1.min.y, b2.min.y, 1e-6, 'dxf bbox y1 ' + t);
    A(S.fromDXF(d).type === t, 'despacho dxf ' + t); A(S.dxfMap[d.etype] === t, 'nome dxf ' + d.etype);
  });
  var ea = { type: 'ellipse', c: P(1, 1), major: P(3, 1), ratio: 0.4, a1: 30, a2: 200 }, eb = D.ellipse.fromDXF(D.ellipse.toDXF(ea));
  near(eb.a1, 30, 1e-6, 'dxf elipse arco a1'); near(eb.a2, 200, 1e-6, 'dxf elipse arco a2');
  A(D.line.fromDXF({ 10: 1, 20: 2, 11: 3, 21: 4 }).p2.y === 4, 'fromDXF aceita objeto por código');
  var pv = D.pline.fromDXF({ etype: 'POLYLINE', groups: [[70, 1]], vertices: [[[10, 0], [20, 0], [42, 0.5]], [[10, 1], [20, 1]], [[10, 2], [20, 0]]] });
  A(pv.pts.length === 3 && pv.closed && pv.pts[0].bulge === 0.5, 'fromDXF POLYLINE com vértices');
  // SVG
  A(/<line /.test(D.line.toSVG(ln)) && /<circle /.test(D.circle.toSVG(ci)) && /A1 1 0 0 1/.test(D.arc.toSVG({ type: 'arc', c: P(0, 0), r: 1, a1: 0, a2: 90 })) && /<ellipse /.test(D.ellipse.toSVG(el)) &&
    /<path /.test(D.pline.toSVG(pl)) && /<path /.test(D.spline.toSVG(sp)) && /<circle /.test(D.point.toSVG(pn)), 'SVG de todos os tipos');
  near(+/y1="(-?[\d.]+)"/.exec(D.line.toSVG({ type: 'line', p1: P(0, 3), p2: P(1, 3) }))[1], -3, 1e-9, 'SVG com Y invertido');
  // desenho em canvas simulado
  var calls = 0, cx = { beginPath: function () { }, moveTo: function () { calls++; }, lineTo: function () { calls++; }, closePath: function () { }, stroke: function () { }, arc: function () { }, fill: function () { }, rect: function () { }, strokeStyle: '#000' };
  var vw = { toScreen: function (q) { return { x: q.x * 10, y: -q.y * 10 }; } };
  [ln, ci, ar, el, pl, sp].forEach(function (e) { calls = 0; D[e.type].draw(cx, e, vw); A(calls >= 2, 'draw ' + e.type); });
  D.point.draw(cx, pn, vw); A(true, 'draw point sem erro');
  // comandos com entrada simulada
  var added = [], script = [], msgs = [], er = 0;
  function runCmd(name, resp) {
    added.length = 0; script = resp.slice(); msgs.length = 0;
    env = {
      input: {
        point: async function () { var v = script.length ? script.shift() : null; if (typeof v === 'function') v(); return v; },
        number: async function () { return script.length ? script.shift() : null; },
        angle: async function () { return script.length ? script.shift() : null; },
        keyword: async function () { return script.length ? script.shift() : null; }
      },
      add: function (s) { added.push(s); return added.length; },
      undo: function () { added.pop(); },
      print: function (m) { msgs.push(m); }
    };
    return S.cmds[name]().then(function () { env = null; }, function (x) { env = null; throw x; });
  }
  var pp2 = function (x, y) { return P(x, y); };
  await runCmd('LINE', [pp2(0, 0), pp2(1, 0), pp2(1, 1), 'Desfazer', pp2(2, 2), pp2(0, 2), 'Fechar']);
  A(added.length === 4 && added[0].type === 'line' && added[1].p1.x === 1 && added[1].p2.x === 2 && added[2].p2.x === 0 && added[3].p2.y === 0, 'LINE: segmentos, Desfazer e Fechar');
  await runCmd('LINE', [pp2(0, 0)]); A(added.length === 0, 'LINE: só 1 ponto não cria nada');
  await runCmd('PLINE', [pp2(0, 0), pp2(4, 0), 'Arco', pp2(4, 4), 'Linha', pp2(0, 4), 'Fechar']);
  A(added.length === 1 && added[0].type === 'pline' && added[0].closed && added[0].pts.length === 4, 'PLINE: arco/linha/fechar');
  A(Math.abs(added[0].pts[1].bulge) > 0 && added[0].pts[0].bulge === 0, 'PLINE: bulge só no segmento em arco');
  var a0 = bulgeArc(added[0].pts[1], added[0].pts[2], added[0].pts[1].bulge);
  near(a0.c.y, 2, 1e-9, 'PLINE: arco tangente (semicírculo, centro)'); near(a0.r, 2, 1e-9, 'PLINE: raio tangente');
  await runCmd('PLINE', [pp2(0, 0), pp2(5, 0), pp2(5, 5)]); A(added.length === 1 && !added[0].closed && added[0].pts.length === 3, 'PLINE: Enter finaliza aberta');
  await runCmd('PLINE', [pp2(0, 0), 'Arco', 90, pp2(2, 2)]); A(added.length === 1 && added[0].pts.length === 2 && Math.abs(added[0].pts[0].bulge) > 0, 'PLINE: primeiro arco pede direção');
  await runCmd('PLINE', [pp2(0, 0), pp2(1, 0), pp2(1, 1), 'Desfazer']); A(added[0].pts.length === 2, 'PLINE: Desfazer');
  await runCmd('CIRCLE', [pp2(1, 1), pp2(4, 1)]); A(added[0].type === 'circle' && added[0].r === 3, 'CIRCLE: centro e raio por ponto');
  await runCmd('CIRCLE', [pp2(1, 1), 5]); A(added[0].r === 5, 'CIRCLE: raio digitado');
  await runCmd('CIRCLE', [pp2(1, 1), 'D', 8]); A(added[0].r === 4, 'CIRCLE: diâmetro');
  await runCmd('CIRCLE', ['3P', pp2(1, 0), pp2(0, 1), pp2(-1, 0)]); near(added[0].r, 1, 1e-9, 'CIRCLE: 3P');
  await runCmd('CIRCLE', ['2P', pp2(0, 0), pp2(6, 0)]); near(added[0].r, 3, 1e-9, 'CIRCLE: 2P'); near(added[0].c.x, 3, 1e-9, 'CIRCLE: 2P centro');
  await runCmd('CIRCLE', [pp2(0, 0), 0]); A(added.length === 0 && msgs.length === 1, 'CIRCLE: raio zero rejeitado');
  await runCmd('ARC', [pp2(1, 0), pp2(0, 1), pp2(-1, 0)]); A(added[0].type === 'arc', 'ARC: 3 pontos'); near(added[0].a2, 180, 1e-9, 'ARC 3P a2');
  await runCmd('ARC', ['Centro', pp2(0, 0), pp2(2, 0), pp2(0, 5)]); near(added[0].r, 2, 1e-9, 'ARC: CSE raio'); near(added[0].a2, 90, 1e-9, 'ARC: CSE a2');
  await runCmd('ARC', [pp2(2, 0), 'Centro', pp2(0, 0), pp2(0, 2)]); near(added[0].a1, 0, 1e-9, 'ARC: S-C-E a1');
  await runCmd('ARC', [pp2(1, 0), 'Fim', pp2(-1, 0), 1]); A(added.length === 1, 'ARC: S-E-R cria'); near(added[0].a1, 0, 1e-9, 'ARC S-E-R a1'); near(added[0].a2, 180, 1e-9, 'ARC S-E-R a2'); near(added[0].r, 1, 1e-9, 'ARC S-E-R raio');
  await runCmd('ARC', [pp2(1, 0), 'Fim', pp2(-1, 0), 0.5]); A(added.length === 0 && msgs.length === 1, 'ARC: S-E-R raio pequeno rejeitado');
  await runCmd('RECTANG', [pp2(0, 0), pp2(10, 6)]); A(added[0].type === 'pline' && added[0].closed, 'RECTANG: dois cantos'); near(plArea(added[0]), 60, 1e-9, 'RECT área');
  await runCmd('RECTANG', [pp2(0, 0), 'Dimensões', 4, 3, pp2(-1, -1)]); near(plArea(added[0]), 12, 1e-9, 'RECT: dimensões'); near(Math.min.apply(null, added[0].pts.map(function (q) { return q.x; })), -4, 1e-9, 'RECT: direção negativa');
  S.settings.rectFillet = 0;
  await runCmd('RECTANG', ['Filete', 1, pp2(0, 0), pp2(10, 6)]); near(plArea(added[0]), 60 - (4 - PI), 1e-9, 'RECT: filete'); A(added[0].pts.length === 8, 'RECT: filete 8 vértices');
  S.settings.rectFillet = 0; S.settings.rectChamfer = [0, 0];
  await runCmd('RECTANG', ['Chanfro', 1, 1, pp2(0, 0), pp2(10, 6)]); near(plArea(added[0]), 58, 1e-9, 'RECT: chanfro');
  S.settings.rectChamfer = [0, 0];
  await runCmd('POLYGON', [6, pp2(0, 0), 'Inscrito', pp2(1, 0)]); near(plArea(added[0]), 3 * Math.sqrt(3) / 2, 1e-9, 'POLYGON: inscrito'); A(added[0].pts.length === 6, 'POLYGON: 6 lados');
  await runCmd('POLYGON', [null, pp2(0, 0), 'Circunscrito', 1]); A(added[0].pts.length === 6, 'POLYGON: Enter usa o padrão (6 lados da última vez)'); near(plArea(added[0]), 2 * Math.sqrt(3), 1e-9, 'POLYGON: circunscrito');
  await runCmd('POLYGON', [5, 'Aresta', pp2(0, 0), pp2(2, 0)]); A(added[0].pts.length === 5, 'POLYGON: por aresta');
  await runCmd('POLYGON', [2]); A(added.length === 0 && msgs.length === 1, 'POLYGON: 2 lados rejeitado');
  S.settings.polySides = 4;
  await runCmd('ELLIPSE', [pp2(-4, 0), pp2(4, 0), pp2(0, 2)]); near(added[0].ratio, 0.5, 1e-9, 'ELLIPSE: eixos'); near(added[0].major.x, 4, 1e-9, 'ELLIPSE: semi-eixo');
  await runCmd('ELLIPSE', ['Centro', pp2(0, 0), pp2(4, 0), pp2(0, 8)]); near(added[0].ratio, 0.5, 1e-9, 'ELLIPSE: eixo menor maior que o maior troca eixos'); near(added[0].major.y, 8, 1e-9, 'ELLIPSE: major girado');
  await runCmd('ELLIPSE', ['Arco', 'Centro', pp2(0, 0), pp2(4, 0), pp2(0, 2), 0, 90]); near(added[0].a1, 0, 1e-9, 'ELLIPSE: arco a1'); near(added[0].a2, 90, 1e-6, 'ELLIPSE: arco a2');
  await runCmd('SPLINE', [pp2(0, 0), pp2(1, 2), pp2(3, 1)]); A(added[0].type === 'spline' && added[0].fit.length === 3, 'SPLINE: pontos');
  await runCmd('SPLINE', [pp2(0, 0), pp2(1, 2), pp2(3, 1), 'Fechar']); A(added[0].closed === true, 'SPLINE: fechar');
  await runCmd('POINT', [pp2(1, 1), pp2(2, 2)]); A(added.length === 2 && added[1].type === 'point', 'POINT: vários pontos');
  // cancelamento (ESC) não propaga erro e preserva o que foi feito
  var Cn = CAD.Cancel, esc = function () { throw CAD.Cancel; };
  CAD.Cancel = { name: 'Cancel' };
  await runCmd('PLINE', [pp2(0, 0), pp2(1, 0), esc]).catch(function () { er++; });
  A(er === 0 && added.length === 1 && added[0].pts.length === 2, 'ESC no PLINE mantém a polilinha já desenhada');
  await runCmd('LINE', [pp2(0, 0), pp2(1, 0), esc]).catch(function () { er++; });
  A(er === 0 && added.length === 1, 'ESC no LINE mantém o segmento');
  await runCmd('CIRCLE', [pp2(0, 0), esc]).catch(function () { er++; });
  A(er === 0 && added.length === 0, 'ESC no CIRCLE não cria nada nem propaga');
  CAD.Cancel = Cn;
  console.log('CAD.tests.p5: ' + ok + ' ok, ' + bad + ' falhas');
  return { ok: ok, bad: bad };
};

})(window.CAD = window.CAD || {});
/* ==== END:5 ==== */
