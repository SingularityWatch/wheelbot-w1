//
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../kit/tube.mjs";
import * as A from "../../kit/audit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import { BOM, SEARCH, PRICED_ON, usd, rowTotal, bomTotal, electronicsTotal, WHAT_HUB_PAYS_EN } from "./bom.mjs";
import { RU, EN } from "./lang.mjs";
import * as M from "./model.mjs";
import { MM_PER_UNIT, cm1 } from "../../eco/units.mjs";
import { sizesOf, partsJson } from "../../eco/measure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const W = 660;
const H = 480;

// ---------------------------------------------------------------- world frame
const AZIMUTH = 45;
const ELEVATION = 30;
const U = (mm) => mm / MM_PER_UNIT;
const mm = (units) => units * MM_PER_UNIT;

// ---------------------------------------------------------------- the robot, in mm
// hip axis: the servo shaft points outboard through the bracket cheek
const HIP = { x: M.LEG.hipX, y: M.LEG.hipY, z: M.LEG.hipZ };
const HIP_SY = 58;   // |y| of the hip plane
const DECK = {
  x: M.DECK.lower.x, y: M.DECK.lower.y, z: M.DECK.lower.z, t: M.DECK.lower.t,
  ux: M.DECK.upper.x, uy: M.DECK.upper.y, uz: M.DECK.upper.z,
};
const FOOT = { x: 82, y: 44, r: 7, h: 9 };
const RAIL = { y: 51, w: 8, h: 12 };
const BATT = { x: M.BATT.x, y: M.BATT.y, z0: M.BATT.z0, h: M.BATT.h };
const TURRET_H = 10;   // deck top -> platter top: base ring, ring gear, platter
const DOCKAT = { x: 0, y: 0, z: DECK.uz + DECK.t + TURRET_H };
const PHONE = { w: M.DOCK.phone.w, h: M.DOCK.phone.h, t: M.DOCK.phone.t, bottom: M.DOCK.bottom + TURRET_H };
const FLOOR = -3.2;

// ---------------------------------------------------------------- projection
const EXT = { x0: -110, x1: 110, y0: -90, y1: 90, z0: 0, z1: PHONE.bottom + PHONE.h };
const P = k.fitProjection(
  [
    [U(EXT.x0), U(EXT.y0), U(EXT.z1)], [U(EXT.x1), U(EXT.y0), U(EXT.z1)],
    [U(EXT.x1), U(EXT.y1), U(EXT.z0)], [U(EXT.x0), U(EXT.y1), U(EXT.z0)],
  ],
  W, H, { pad: 54, azimuth: AZIMUTH, elevation: ELEVATION },
);
const at = (point) => k.iso(point, P);
const V = A.cameraBasis(P).V;

// ---------------------------------------------------------------- frames
const FZ = (o) => ({ o, a: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] });
const FY = (o) => ({ o, a: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] });
const FX = (o) => ({ o, a: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] });
const F_AT = (o, a, u) => {
  const A1 = G.unit3(a);
  const U1 = G.unit3(G.sub3(u, G.mul3(A1, G.dot3(u, A1))));
  return { o, a: A1, u: U1, v: G.cross3(A1, U1) };
};
const YAW = (M.DOCK.yaw * Math.PI) / 180;
const DOCK = {
  n: [Math.cos(YAW), Math.sin(YAW), 0],
  t: [-Math.sin(YAW), Math.cos(YAW), 0],
  up: [0, 0, 1],
};

// ---------------------------------------------------------------- polygon helpers
function rectPoly(w, h, r = 1, steps = 4) {
  const x = w / 2;
  const y = h / 2;
  const rr = Math.max(0.05, Math.min(r, Math.min(x, y) * 0.92));
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  };
  corner(x - rr, y - rr, 0);
  corner(-(x - rr), y - rr, Math.PI / 2);
  corner(-(x - rr), -(y - rr), Math.PI);
  corner(x - rr, -(y - rr), (Math.PI * 3) / 2);
  return pts;
}
function bladePoly(len, wTop, wBot, r = 6, steps = 5) {
  const pts = [];
  const arc = (cx, cy, rad, a0, a1, n) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
  };
  pts.push([wTop / 2, 0]);
  pts.push([wBot / 2 - r, -len + r]);
  arc(wBot / 2 - r, -len + r, r, 0, -Math.PI / 2, steps);
  pts.push([-(wBot / 2 - r), -len]);
  arc(-(wBot / 2 - r), -len + r, r, -Math.PI / 2, -Math.PI, steps);
  pts.push([-wTop / 2, 0]);
  return pts;
}

// ---------------------------------------------------------------- the recorder
const STAGGER = { stagger: 0.035, stiffness: 58, damping: 13.4, substeps: 4 };
const R = A.recorder(P, { order: [], spring: STAGGER });
const ITEMS = R.items;
const { nameFor } = R;
const record = R.solid;
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);

// When COLLECT is an array, parts are built but not registered: the pose library uses this
// to draw the same builders at other joint angles without touching parts.json or the audit.
let COLLECT = null;
function put(name, ref, svg, { bias = 0, shapes = [], piece = "robot" } = {}) {
  if (COLLECT) { COLLECT.push({ name, at: ref, svg, shapes, bias }); return; }
  R.put({ piece, at: ref, bias, svg, name, shapes, move: [0, 0, 0] });
}

function plate(name, F, poly, s0, s1, { tone = "mid", crease = "faint", at: ref, bias = 0, extra = "", inner = "", shapes } = {}) {
  const paths = G.prismOf(F, poly, s0, s1, P);
  put(name, ref ?? F.o, S(paths, { tone, crease }) + extra, {
    bias, shapes: shapes ?? [record(A.prism(F, poly, s0, s1, { name }))],
  });
  return paths;
}
function turned(name, F, meridian, { tone = "mid", crease = "faint", at: ref, bias = 0, extra = "", options = {}, shapes } = {}) {
  put(name, ref ?? F.o, S(G.lathe(meridian, F, P, options), { tone, crease }) + extra, {
    bias, shapes: shapes ?? [record(A.lathe(F, meridian, { name }))],
  });
}
const cyl = (name, o, a, s0, s1, r, opts = {}) =>
  turned(name, G.frameAlong(o, a), [[s0, 0], [s0, r], [s1, r], [s1, 0]], { options: { steps: 30 }, ...opts });

// ---------------------------------------------------------------- the body
const LAY = {
  posts: [[-58, -32], [58, -32], [-58, 32], [58, 32]],
  feet: [[-FOOT.x, -FOOT.y], [FOOT.x, -FOOT.y], [-FOOT.x, FOOT.y], [FOOT.x, FOOT.y]],
  hipStations: [[1, -1], [1, 1], [-1, -1], [-1, 1]],
};
const STATION_ID = (sx, sy) => (sx > 0 ? "f" : "r") + (sy > 0 ? "l" : "r");   // fr, fl, rr, rl

function decks() {
  const lower = { x: -DECK.x / 2, y: -DECK.y / 2, w: DECK.x, d: DECK.y, r: 8 };
  plate("body.deck.lower", FZ([0, 0, U(DECK.z)]), rectPoly(U(DECK.x), U(DECK.y), U(8), 6), 0, U(DECK.t),
    { tone: "lo", at: [0, 0, U(DECK.z + DECK.t / 2)] });
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const F = F_AT([U(sx * 20), U(sy * 20), U(DECK.z)], [0, 0, -1], [U(sx), U(sy), 0]);
    plate("body.deck.rib", F, rectPoly(U(58), U(9), U(2), 3), 0, U(3.4), { tone: "lo", at: [U(sx * 40), U(sy * 40), U(DECK.z)] });
  }
  plate("body.deck.upper", FZ([0, 0, U(DECK.uz)]), rectPoly(U(DECK.ux), U(DECK.uy), U(7), 6), 0, U(DECK.t),
    { tone: "mid", at: [0, 0, U(DECK.uz + DECK.t / 2)] });
  for (const [px, py] of LAY.posts) {
    const z0 = U(DECK.z + DECK.t);
    const z1 = U(DECK.uz);
    cyl("body.post", [U(px), U(py), z0], [0, 0, 1], 0, z1 - z0, U(3.2),
      { tone: "lo", at: [U(px), U(py), (z0 + z1) / 2], extra: Ln(k.knurl(U(px), U(py), U(3.2), z0 + 0.6, z0 + 2, 12, P, 0.25), { tone: "faint" }) });
  }
  for (const sy of [-1, 1]) {
    const F = FY([0, U(sy * RAIL.y), U(DECK.z - RAIL.h)]);
    plate("body.rail", F, rectPoly(U(DECK.x - 6), U(RAIL.h), U(3), 4), -U(RAIL.w / 2) * sy, U(RAIL.w / 2) * sy,
      { tone: "lo", at: [0, U(sy * RAIL.y), U(DECK.z - RAIL.h / 2)], extra: Ln(k.sideRing([0, U(sy * (RAIL.y + RAIL.w / 2)), U(DECK.z - 4)], U(1.6), [0, 1, 0], P, 10), { tone: "faint" }) });
  }
  for (const [fx, fy] of LAY.feet) {
    cyl("body.foot", [U(fx), U(fy), U(DECK.z)], [0, 0, -1], 0, U(FOOT.h), U(FOOT.r),
      { tone: "hi", at: [U(fx), U(fy), U(DECK.z - FOOT.h / 2)], bias: -0.2 });
  }
  const HY = U(-DECK.y / 2 + 6);
  for (const sx of [-1, 1]) {
    plate("body.handle.post", FY([U(sx * 26), HY, U(DECK.uz + DECK.t)]), rectPoly(U(9), U(26), U(3), 3), 0, U(6),
      { tone: "mid", at: [U(sx * 26), HY + U(3), U(DECK.uz + DECK.t + 13)] });
  }
  plate("body.handle", FY([0, HY, U(DECK.uz + DECK.t + 20)]), rectPoly(U(60), U(9), U(4), 4), -U(3), U(3),
    { tone: "mid", at: [0, HY, U(DECK.uz + DECK.t + 24)] });
  plate("body.label", FZ([U(30), U(28), U(DECK.z + DECK.t)]), rectPoly(U(46), U(20), U(2.5), 3), 0, U(0.7),
    { tone: "hi", at: [U(30), U(28), U(DECK.z + DECK.t + 0.4)],
      extra: Ln(k.lineOnTop([U(10), U(21)], [U(35), U(21)], U(DECK.z + DECK.t + 0.75), P), { tone: "lo", free: true })
        + Ln(k.lineOnTop([U(10), U(26.5)], [U(50), U(26.5)], U(DECK.z + DECK.t + 0.75), P), { tone: "lo", free: true })
        + Ln(k.lineOnTop([U(10), U(32)], [U(40), U(32)], U(DECK.z + DECK.t + 0.75), P), { tone: "lo", free: true })
        + Dots([[U(48), U(34), U(DECK.z + DECK.t + 0.8)], [U(12), U(34), U(DECK.z + DECK.t + 0.8)]], { size: 0.42 }) });
}

function battery() {
  plate("elec.batt-tray", FZ([0, 0, U(BATT.z0)]), rectPoly(U(BATT.x * 2), U(BATT.y * 2), U(4), 4), 0, U(3),
    { tone: "lo", at: [0, 0, U(BATT.z0 + 1.5)] });
  for (const sy of [-1, 1]) {
    const F = FX([U(-30), U(sy * 10), U(BATT.z0 + 10)]);
    turned("elec.cell", F, [[0, 0], [0, U(9.3)], [0.7, U(9.3)], [0.9, U(9)], [U(18.8) - 0.9, U(9)], [U(18.8) - 0.7, U(9.3)], [U(18.8), U(9.3)], [U(18.8), 0]],
      { tone: "mid", at: [U(0), U(sy * 10), U(BATT.z0 + 10)],
        extra: Ln(k.ring(U(-30) + 0, 0, 0, 0, P, 4), { tone: "faint" }) });
  }
  plate("elec.bms", FZ([U(28), U(0), U(BATT.z0 - 4)]), rectPoly(U(45), U(22), U(2), 3), 0, U(4),
    { tone: "mid", at: [U(28), 0, U(BATT.z0 - 2)], extra: Dots([[U(20), U(-6), U(BATT.z0 - 4.3)], [U(36), U(6), U(BATT.z0 - 4.3)]], { size: 0.4 }) });
}

function electronics() {
  const top = DECK.z + DECK.t;
  const board = (name, x, y, w, d, h, tone, chips) => {
    plate(name, FZ([U(x), U(y), U(top)]), rectPoly(U(w), U(d), U(1.2), 2), 0, U(h * 0.35),
      { tone, at: [U(x), U(y), U(top + h * 0.2)] });
    for (const [cx, cy, cw, cd] of chips) {
      plate(`${name}.chip`, FZ([U(cx), U(cy), U(top + h * 0.35)]), rectPoly(U(cw), U(cd), U(0.4), 1), 0, U(h * 0.65),
        { tone: "hi", at: [U(cx), U(cy), U(top + h * 0.35 + h * 0.3)] });
    }
  };
  board("elec.esp32", 34, -24, 55, 28, 1.6, "mid", [[30, -24, 16, 16], [56, -24, 10, 10]]);
  board("elec.pca9685", 30, 6, 62, 25.5, 1.6, "mid", [[22, 6, 12, 12], [56, 6, 8, 8]]);
  board("elec.tb6612.left", 52, 34, 21, 21, 1.4, "mid", [[52, 34, 9, 9]]);
  board("elec.tb6612.right", 22, 34, 21, 21, 1.4, "mid", [[22, 34, 9, 9]]);
  board("elec.mpu", 8, -30, 21, 16, 1.2, "mid", [[8, -30, 7, 7]]);
  board("elec.pcf", -14, -30, 24, 19, 1.2, "mid", [[-14, -30, 8, 8]]);
  board("elec.buck6", -44, 22, 65, 32, 1.6, "mid", [[-44, 22, 20, 14]]);
  board("elec.buck5", -56, -18, 22, 17, 1.2, "mid", [[-56, -18, 8, 8]]);
  plate("elec.switch", FX([U(-DECK.x / 2 + 2), U(-14), U(top - 16)]), rectPoly(U(20), U(13), U(1.5), 2), 0, U(4),
    { tone: "hi", at: [U(-DECK.x / 2 + 2), U(-14), U(top - 16)] });
  cyl("elec.fuse", [U(-DECK.x / 2 + 4), U(-32), U(top - 16)], [1, 0, 0], 0, U(20), U(3.4), { tone: "mid", at: [U(-DECK.x / 2 + 14), U(-32), U(top - 16)] });
  plate("elec.xt60", FX([U(-DECK.x / 2 + 2), U(4), U(top - 18)]), rectPoly(U(9), U(7), U(1), 1), 0, U(16),
    { tone: "hi", at: [U(-DECK.x / 2 + 10), U(4), U(top - 18)] });
  cyl("elec.buzzer", [U(66), U(-6), U(top)], [0, 0, 1], 0, U(9), U(5.5), { tone: "mid", at: [U(66), U(-6), U(top + 4.5)] });
  cyl("elec.led", [U(-40), U(-6), U(top)], [0, 0, 1], 0, U(2.4), U(1.6), { tone: "hi", at: [U(-40), U(-6), U(top + 1.2)] });
}

function harness() {
  const z = U(DECK.z + DECK.t) + U(2.2);
  const path = [
    [U(-DECK.x / 2 + 6), U(4), z], [U(-DECK.x / 2 + 16), U(6), z], [U(-46), U(10), z],
    [U(-30), U(16), z], [U(-4), U(20), z], [U(20), U(22), z], [U(40), U(18), z],
  ];
  const pieces = tubePieces(path, U(2.6), P, { maxLength: U(22), gaps: [], caps: true, rings: { every: 3, tone: "faint" } });
  const svg = pieces.map((piece) => tubeSvg(piece, { tone: "lo" })).join("");
  put("elec.harness", [U(0), U(14), z], svg, {
    bias: 0.3,
    shapes: [record(A.tube(path, U(1.4), { name: "elec.harness", limp: true }))],
  });

  const down = [[U(6), U(-18), z], [U(6), U(-18), U(DECK.z - 4)], [U(10), U(-14), U(BATT.z0 + 16)]];
  const downSvg = tubePieces(down, U(2.2), P, { maxLength: U(14), caps: true }).map((piece) => tubeSvg(piece, { tone: "lo" })).join("");
  put("elec.power-lead", [U(6), U(-18), U(DECK.z)], downSvg, {
    bias: 0.3, shapes: [record(A.tube(down, U(1.2), { name: "elec.power-lead", limp: true }))],
  });
}

// ---------------------------------------------------------------- a leg
// Two links, one hinge each. The thigh leaves the hip at 45° and the shin hangs from the knee,
// so the ankle lands 28 mm forward of the hip and 68 mm below it — the wheel sits on the floor
// with the hip at 92 mm, and bending the knee lifts the foot: that is the walking gait.
// The shin is a fork: the wheel turns between its cheeks, the N20 is bolted to the inner one,
// and the outer one carries the brake servo and the six-dog collar.
//
// Positions are millimetres; polygon sizes are world units (U(mm)).
function legParts(pose, sx, sy) {
  const id = STATION_ID(sx, sy);
  const out = [];
  const dz = pose.dz;
  const th = (pose.hip * Math.PI) / 180;
  const kn = (pose.knee * Math.PI) / 180;
  const out3 = [0, sy, 0];
  const LT = M.LEG.a;
  const LS = M.LEG.b;
  const hip = [sx * HIP.x, sy * HIP.y, HIP.z + dz];
  const thighDir = [sx * Math.sin(th), 0, -Math.cos(th)];
  const shinDir = [sx * Math.sin(kn), 0, -Math.cos(kn)];
  const knee = [hip[0] + thighDir[0] * LT, hip[1], hip[2] + thighDir[2] * LT];
  const ankle = [knee[0] + shinDir[0] * LS, knee[1], knee[2] + shinDir[2] * LS];
  const faceY = (x, yMag, z, u = [1, 0, 0]) => F_AT([U(x), U(yMag) * sy, U(z)], out3, u);
  const along = (x, yMag, z, a = out3) => G.frameAlong([U(x), U(yMag) * sy, U(z)], a);
  const part = (name, ref, svg, shapes, bias = 0.12) => out.push({ name, at: ref, svg, shapes, bias });

  // ---- hip bracket: two cheeks and a web; the hip servo sits between them
  {
    const zc = HIP.z + dz - 18;
    plate(`leg.${id}.bracket`, faceY(HIP.x, 52, zc - 17), rectPoly(U(58), U(34), U(4), 4), 0, U(3),
      { tone: "lo", at: [U(sx * HIP.x), U(sy * 53.5), U(zc)], bias: 0.1,
        extra: Ln(G.circleOf(faceY(HIP.x, 52, zc - 17), U(1.5), U(11), P, 24), { tone: "faint" }) });
    plate(`leg.${id}.bracket-inner`, faceY(HIP.x, 16, zc - 17), rectPoly(U(58), U(34), U(4), 4), 0, U(3),
      { tone: "lo", at: [U(sx * HIP.x), U(sy * 17.5), U(zc)], bias: 0.1 });
    plate(`leg.${id}.bracket-web`, FZ([U(sx * HIP.x), U(sy * 34), U(zc - 17)]), rectPoly(U(16), U(36), U(3), 3), 0, U(3),
      { tone: "lo", at: [U(sx * HIP.x), U(sy * 34), U(zc - 15.5)] });
  }

  // ---- hip servo: MG996R, shaft outboard through the bracket cheek
  {
    const F = faceY(HIP.x, 52, HIP.z + dz - 10, thighDir);
    const body = G.prismOf(F, rectPoly(U(40.7), U(19.7), U(3), 4), 0, -U(36), P);
    const cap = G.lathe([[0, U(6.5)], [U(1.6), U(6.5)], [U(2.2), U(5.2)], [U(2.4), 0]], along(HIP.x, 52, HIP.z + dz), P);
    part(`leg.${id}.servo`, [U(sx * HIP.x), U(sy * 34), U(HIP.z + dz - 10)],
      S(body, { tone: "mid", crease: "lo" }) + S(cap, { tone: "hi" }),
      [record(A.prism(F, rectPoly(U(40.7), U(19.7), U(3), 4), -U(36), 0, { name: `leg.${id}.servo` })),
       record(A.disc(along(HIP.x, 52, HIP.z + dz), 0, U(2.4), U(6.5), { name: `leg.${id}.servo-boss` }))], 0.14);
  }

  // ---- thigh: one printed bar, clevis at the knee, boss at the hip
  {
    const F = faceY(hip[0], 56, hip[2], thighDir);
    const poly = [[-U(11), -U(13)], [U(LT), -U(11)], [U(LT), U(11)], [-U(11), U(13)]];
    const svg = S(G.prismOf(F, poly, 0, U(4), P), { tone: "mid", crease: "lo" })
      + Ln(G.circleOf(F, 0, U(7), P, 22), { tone: "faint" })
      + Ln(G.circleOf(F, U(LT), U(6), P, 20), { tone: "faint" })
      + Dots([[U(hip[0] + thighDir[0] * LT * 0.5), U(sy * 61), U(hip[2] + thighDir[2] * LT * 0.5)]], { size: 0.42 });
    part(`leg.${id}.thigh`, [U(hip[0] + thighDir[0] * LT / 2), U(sy * 58), U(hip[2] + thighDir[2] * LT / 2)], svg,
      [record(A.prism(F, poly, 0, U(4), { name: `leg.${id}.thigh` }))], 0.16);
  }

  // ---- knee servo: bolted to the thigh, its horn drives the shin
  {
    const F = faceY(knee[0], 56, knee[2] - 10, shinDir);
    const body = G.prismOf(F, rectPoly(U(40.7), U(19.7), U(3), 4), 0, -U(36), P);
    const cap = G.lathe([[0, U(6.5)], [U(1.6), U(6.5)], [U(2.2), U(5.2)], [U(2.4), 0]], along(knee[0], 56, knee[2]), P);
    part(`leg.${id}.knee-servo`, [U(knee[0]), U(sy * 38), U(knee[2] - 10)],
      S(body, { tone: "mid", crease: "lo" }) + S(cap, { tone: "hi" }),
      [record(A.prism(F, rectPoly(U(40.7), U(19.7), U(3), 4), -U(36), 0, { name: `leg.${id}.knee-servo` }))], 0.14);
  }

  // ---- knee pin: a clevis pin through the joint
  {
    const F = along(knee[0], 52, knee[2]);
    part(`leg.${id}.knee-pin`, [U(knee[0]), U(sy * 58), U(knee[2])],
      S(G.lathe([[0, U(4)], [U(1), U(4)], [U(1.4), U(3.4)], [U(17), U(3.4)], [U(17.4), U(4)], [U(18), U(4)], [U(18), 0]],
        G.frameAlong([U(knee[0]), U(sy * 52), U(knee[2])], out3), P), { tone: "hi" }),
      [record(A.disc(G.frameAlong([U(knee[0]), U(sy * 52), U(knee[2])], out3), 0, U(18), U(4), { name: `leg.${id}.knee-pin` }))], 0.26);
  }

  // ---- shin: inner cheek, outer cheek and the bridge over the tyre
  {
    const F = faceY(knee[0], 60, knee[2], shinDir);
    const cheek = [[-U(14), -U(14)], [U(LS + 4), -U(16)], [U(LS + 4), U(16)], [-U(14), U(14)]];
    const svg = S(G.prismOf(F, cheek, 0, U(4), P), { tone: "mid", crease: "lo" })
      + Ln(G.circleOf(F, U(LS), U(10), P, 24), { tone: "faint" });
    part(`leg.${id}.shin`, [U(knee[0] + shinDir[0] * LS / 2), U(sy * 62), U(knee[2] + shinDir[2] * LS / 2)], svg,
      [record(A.prism(F, cheek, 0, U(4), { name: `leg.${id}.shin` }))], 0.16);
    const FOut = along(ankle[0], 79, ankle[2]);
    const outer = G.ringBand(0, U(4), U(13), U(24), FOut, P);
    part(`leg.${id}.fork-outer`, [U(ankle[0]), U(sy * 81), U(ankle[2])], S(outer, { tone: "mid", crease: "lo" }),
      [record(A.ring(FOut, 0, U(4), U(13), U(24), { name: `leg.${id}.fork-outer` }))], 0.18);
    plate(`leg.${id}.fork-bridge`, FZ([U(ankle[0] - 14), U(sy * 60), U(ankle[2] + 26)]), rectPoly(U(26), U(22), U(4), 3), 0, U(8),
      { tone: "mid", at: [U(ankle[0] - 14), U(sy * 64), U(ankle[2] + 26)] });
  }

  // ---- N20 bolted to the inner cheek, its shaft through it into the hub
  {
    const F = faceY(ankle[0], 60, ankle[2], shinDir);
    const poly = rectPoly(U(24), U(12), U(2.5), 3).map(([a, b]) => [a - U(12), b]);
    part(`leg.${id}.motor`, [U(ankle[0] + shinDir[0] * -12), U(sy * 54), U(ankle[2] + shinDir[2] * -12)],
      S(G.prismOf(F, poly, 0, -U(12), P), { tone: "hi", crease: "lo" })
        + Dots([[U(ankle[0] + shinDir[0] * 6), U(sy * 48), U(ankle[2] + shinDir[2] * 6)]], { size: 0.4 }),
      [record(A.prism(F, poly, -U(12), 0, { name: `leg.${id}.motor` }))], 0.2);
  }

  // ---- axle, hub, tyre
  {
    const F = along(ankle[0], 56, ankle[2]);
    part(`leg.${id}.axle`, [U(ankle[0]), U(sy * 62), U(ankle[2])], S(G.lathe([[0, U(1.5)], [U(22), U(1.5)], [U(22), 0]], F, P), { tone: "hi" }),
      [record(A.disc(F, 0, U(22), U(1.5), { name: `leg.${id}.axle` }))], 0.24);
  }
  {
    const F = along(ankle[0], 64, ankle[2]);
    const mer = [[0, U(17)], [U(10), U(17)], [U(11), U(14)], [U(11), 0]];
    part(`leg.${id}.hub`, [U(ankle[0]), U(sy * 70), U(ankle[2])],
      S(G.lathe(mer, F, P), { tone: "mid" }) + Ln(G.ribsOf(F, U(10.4), U(11), U(16), 6, P, { phase: 0.25, least: 0.12 }), { tone: "lo" }),
      [record(A.lathe(F, mer, { name: `leg.${id}.hub` }))], 0.22);
  }
  {
    const F = along(ankle[0], 64, ankle[2]);
    const mer = [[0, U(17)], [0, U(21)], [U(1.6), U(24)], [U(10.4), U(24)], [U(12), U(21)], [U(12), U(17)], [0, U(17)]];
    part(`leg.${id}.tyre`, [U(ankle[0]), U(sy * 70), U(ankle[2])],
      S(G.lathe(mer, F, P, { smooth: "auto" }), { tone: "lo" })
        + Ln(G.ribsOf(F, U(2.6), U(9.6), U(23.7), 20, P, { seams: true, least: 0.12 }), { tone: "faint" }),
      [record(A.lathe(F, mer, { name: `leg.${id}.tyre` }))], 0.22);
  }
  // ---- hub cap and the boss the collar rides on
  {
    const F = along(ankle[0], 76, ankle[2]);
    const mer = [[0, U(17)], [U(2), U(17)], [U(3), U(7)], [U(12), U(7)], [U(12), 0]];
    part(`leg.${id}.boss`, [U(ankle[0]), U(sy * 82), U(ankle[2])], S(G.lathe(mer, F, P), { tone: "hi" }),
      [record(A.lathe(F, mer, { name: `leg.${id}.boss` }))], 0.24);
  }
  // ---- the six-dog collar: its face a whisker from the outer cheek, six teeth drawn on it
  {
    const F = along(ankle[0], 83, ankle[2]);
    const ring = G.ringBand(0, U(6), U(7), U(13), F, P);
    const teeth = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + 0.2;
      const p0 = at([U(ankle[0] + Math.cos(a) * 8.5), U(sy * 89.1), U(ankle[2] + Math.sin(a) * 8.5)]);
      const p1 = at([U(ankle[0] + Math.cos(a) * 12.4), U(sy * 89.1), U(ankle[2] + Math.sin(a) * 12.4)]);
      return Ln(k.pathOf([p0, p1]), { tone: "hi" });
    }).join("");
    part(`leg.${id}.collar`, [U(ankle[0]), U(sy * 86), U(ankle[2])], S(ring, { tone: "hi", crease: "lo" }) + teeth,
      [record(A.ring(F, 0, U(6), U(7), U(13), { name: `leg.${id}.collar` }))], 0.3);
  }
  // ---- tension spring pulls the collar home: the brake holds with no power
  {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = t * Math.PI * 2 * 3.5;
      pts.push([U(ankle[0] + Math.cos(a) * 6), U(sy * (89 + 4 * t)), U(ankle[2] + Math.sin(a) * 6)]);
    }
    part(`leg.${id}.spring`, [U(ankle[0]), U(sy * 90), U(ankle[2])], Ln(k.pathOf(pts.map((p) => at(p))), { tone: "mid" }),
      [record(A.tube(pts, U(0.5), { name: `leg.${id}.spring` }))], 0.34);
  }
  // ---- brake servo above the wheel, with the lever that pulls the collar
  {
    const F = F_AT([U(ankle[0] - 10), U(sy * 83), U(ankle[2] + 40)], out3, shinDir);
    const poly = rectPoly(U(22), U(12), U(2), 3);
    part(`leg.${id}.brake-servo`, [U(ankle[0] - 10), U(sy * 89), U(ankle[2] + 40)],
      S(G.prismOf(F, poly, 0, U(12), P), { tone: "mid" }) + S(G.prismOf(F, poly, U(12), U(15), P), { tone: "hi" }),
      [record(A.prism(F, poly, 0, U(12), { name: `leg.${id}.brake-servo` }))], 0.2);
    const FL = FX([U(ankle[0]), U(sy * 93), U(ankle[2] + 6)]);
    const lever = [[-U(4), 0], [U(4), 0], [U(2), U(34)], [-U(6), U(34)]];
    part(`leg.${id}.fork`, [U(ankle[0]), U(sy * 93), U(ankle[2] + 23)], S(G.prismOf(FL, lever, 0, U(4) * sy, P), { tone: "hi" }),
      [record(A.prism(FL, lever, Math.min(0, U(4) * sy), Math.max(0, U(4) * sy), { name: `leg.${id}.fork` }))], 0.28);
  }
  // ---- microswitch: confirms the collar is home
  {
    const F = FX([U(ankle[0] - 16), U(sy * 84), U(ankle[2] + 6)]);
    part(`leg.${id}.switch`, [U(ankle[0] - 16), U(sy * 85), U(ankle[2] + 6)],
      S(G.prismOf(F, rectPoly(U(9), U(6.5), U(1.2), 2), 0, U(4) * sy, P), { tone: "hi" }),
      [record(A.prism(F, rectPoly(U(9), U(6.5), U(1.2), 2), Math.min(0, U(4) * sy), Math.max(0, U(4) * sy), { name: `leg.${id}.switch` }))], 0.2);
  }
  return out;
}

// ---------------------------------------------------------------- the dock
// The dock sits square to the machine: the phone's plane is the x-z plane, so it reads as an
// isometric slab like every other face of the drawing, screen out toward +y.
function dock() {
  // The dock is drawn in its own frame and then turned by the turret. Local +y is the screen's
  // normal, so at yaw 90 the screen faces -x and the camera island faces +x: the cameras look
  // down the direction of travel, which is what the reader expects of a phone-brained machine.
  // There is no back panel: the frame is two rails and a cross-member, so nothing stands between
  // the lenses and the world.
  const CY = Math.cos(YAW);
  const SY = Math.sin(YAW);
  const p = (x, y, z) => [U(x * CY - y * SY), U(x * SY + y * CY), U(z)];
  const N = [-SY, CY, 0];          // screen normal
  const T = [CY, SY, 0];           // the phone s width, along the turret s tangent
  const F = (x, y, z) => F_AT(p(x, y, z), N, T);
  const H = (x, y, z) => FY(p(x, y, z));
  const DECKTOP = DECK.uz + DECK.t;
  const TOP = DECKTOP + TURRET_H;

  // ---- the turret
  turned("turret.base", G.frameAlong(p(0, 0, DECKTOP), [0, 0, 1]),
    [[0, U(37)], [U(1.2), U(37)], [U(2.4), U(35.4)], [U(5), U(35.4)], [U(6), U(33)], [U(6), 0]],
    { tone: "lo", at: p(0, 21, DECKTOP + 3),
      extra: Ln(k.knurl(0, 0, U(34.6), U(DECKTOP + 1.4), U(DECKTOP + 5), 48, P, 0.55), { tone: "faint" }) });
  {
    const arc = [];
    for (let i = 0; i <= 28; i++) {
      const a2 = (-M.TURRET.range + (2 * M.TURRET.range * i) / 28) * Math.PI / 180;
      arc.push([U(Math.sin(a2) * 31.4), U(Math.cos(a2) * 31.4), U(DECKTOP + 6.06)]);
    }
    put("turret.slot", p(0, 31, DECKTOP + 6.1), Ln(k.pathOf(arc.map((q) => at(q))), { tone: "faint" }), { bias: 0.2 });
  }
  turned("turret.gear", G.frameAlong(p(0, 0, DECKTOP + 4.4), [0, 0, 1]),
    [[0, U(30)], [U(2.4), U(30)], [U(2.4), U(27.6)], [U(0.2), U(27.6)]],
    { tone: "mid", extra: Ln(k.knurl(0, 0, U(29), U(DECKTOP + 4.6), U(DECKTOP + 6.6), 40, P, 0.9), { tone: "lo" }) });
  turned("turret.platter", G.frameAlong(p(0, 0, DECKTOP + 6.8), [0, 0, 1]),
    [[0, U(30)], [U(1), U(30)], [U(2), U(29)], [U(3.2), U(29)], [U(3.2), 0]],
    { tone: "hi", at: p(0, 0, DECKTOP + 9) });
  turned("turret.pin", G.frameAlong(p(0, 26.5, DECKTOP + 5.6), [0, 0, 1]),
    [[0, U(3.6)], [U(3.6), U(3.6)], [U(4.6), U(3)], [U(4.6), 0]],
    { tone: "hi", at: p(0, 26.5, DECKTOP + 9) });
  plate("turret.servo", H(-40, 6, DECKTOP + 9), rectPoly(U(23), U(12.2), U(2), 3), 0, U(22.5),
    { tone: "mid", at: p(-40, 6, DECKTOP + 14) });
  turned("turret.pinion", G.frameAlong(p(-26, 12, DECKTOP + 9.4), [0, 0, 1]),
    [[0, U(7)], [U(2), U(7)], [U(3), U(6)], [U(3), 0]],
    { tone: "hi", extra: Ln(k.knurl(-26, 12, U(6.2), U(DECKTOP + 9.6), U(DECKTOP + 11.6), 12, P, 0.7), { tone: "lo" }) });
  for (const [name, zz, hh, tone] of [["turret.witness", DECKTOP + 7.0, 3.0, "lit"], ["turret.index", DECKTOP + 1.4, 3.2, "hi"]]) {
    plate(name, F(0, 28.6, zz + hh / 2), rectPoly(U(2.6), U(hh), U(0.6), 2), 0, U(2),
      { tone, at: p(0, 28.6, zz + hh) });
  }

  // ---- the frame
  for (const x of [-40, 40]) {
    plate("dock.rail", F(x, -7, PHONE.bottom + 66), rectPoly(U(8), U(150), U(3), 3), 0, U(7),
      { tone: "mid", at: p(x, -4, PHONE.bottom + 66) });
  }
  plate("dock.cross", F(0, -7, PHONE.bottom + 4), rectPoly(U(88), U(16), U(3), 3), 0, U(7),
    { tone: "mid", at: p(0, -4, PHONE.bottom + 4) });
  for (const x of [-40, 40]) {
    plate("dock.cheek", F(x, -2, TOP + 24), rectPoly(U(8), U(40), U(3), 3), 0, U(10),
      { tone: "mid", at: p(x, 3, TOP + 24) });
  }
  for (const x of [-30, 30]) {
    plate("dock.lip", F(x, -4, PHONE.bottom - 7), rectPoly(U(26), U(14), U(3), 3), 0, U(18),
      { tone: "mid", at: p(x, 5, PHONE.bottom - 7) });
  }
  plate("dock.jaw.fixed", F(-42, -2, PHONE.bottom + 118), rectPoly(U(10), U(52), U(3), 3), 0, U(18),
    { tone: "hi", at: p(-42, 7, PHONE.bottom + 118) });
  plate("dock.jaw.slide", F(42, -2, PHONE.bottom + 118), rectPoly(U(10), U(52), U(3), 3), 0, U(18),
    { tone: "hi", at: p(42, 7, PHONE.bottom + 118) });
  {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a2 = t * Math.PI * 2 * 5;
      pts.push(p(46 + 12 * t, 8 + Math.cos(a2) * 4, PHONE.bottom + 118 + Math.sin(a2) * 4));
    }
    put("dock.spring", p(52, 8, PHONE.bottom + 118), Ln(k.pathOf(pts.map((q) => at(q))), { tone: "mid" }),
      { shapes: [record(A.tube(pts, U(0.5), { name: "dock.spring" }))], bias: 0.3 });
  }
  for (const x of [-40, 40]) {
    turned("dock.knob", G.frameAlong(p(x, 12, TOP + 30), [0, 1, 0]),
      [[0, U(7)], [U(1), U(7)], [U(2), U(6)], [U(6), U(6)], [U(7), U(5)], [U(7), 0]],
      { tone: "hi", at: p(x, 16, TOP + 30) });
  }

  // ---- the phone
  plate("phone.body", F(0, -4, PHONE.bottom + PHONE.h / 2), rectPoly(U(PHONE.w), U(PHONE.h), U(7), 5), 0, U(PHONE.t),
    { tone: "mid", at: p(0, 0.2, PHONE.bottom + PHONE.h / 2),
      extra: Ln(k.pathOf([[-33, 6], [33, 6], [33, 150], [-33, 150], [-33, 6]].map(([a2, b2]) => at(p(a2, 4.75, PHONE.bottom + b2))), true), { tone: "faint" }) });
  plate("phone.screen", F(0, 4.7, PHONE.bottom + 79), rectPoly(U(66), U(142), U(5), 4), 0, U(0.35),
    { tone: "lo", at: p(0, 4.5, PHONE.bottom + 79) });
  {
    const cz = PHONE.bottom + 124;
    plate("phone.camera-island", F(-4, -4.9, cz), rectPoly(U(40), U(46), U(9), 5), 0, U(3.4),
      { tone: "hi", at: p(-4, -8.5, cz) });
    for (const spec of [[-9, 11, 5.4], [-9, -2, 5.4], [7, 5, 4.2]]) {
      const dx = spec[0];
      const dz = spec[1];
      const r = spec[2];
      turned("phone.lens", G.frameAlong(F(-4 + dx, -7.9, cz + dz).o, N),
        [[0, U(r)], [U(1.4), U(r)], [U(2.0), U(r - 1.1)], [U(2.0), 0]],
        { tone: "lo", at: p(-4 + dx, -9.8, cz + dz) });
    }
    plate("phone.flash", F(9, -7.8, cz + 19), rectPoly(U(7), U(7), U(2), 3), 0, U(0.6),
      { tone: "hi", at: p(9, -8.2, cz + 19) });
  }
  for (const b of [-1, 1]) {
    plate("phone.button", F(b * 37, 0, PHONE.bottom + 62), rectPoly(U(3.4), U(14), U(1.2), 2), 0, U(1.6),
      { tone: "hi", at: p(b * 37, 0, PHONE.bottom + 69) });
  }
  plate("dock.plug", F(0, 0, PHONE.bottom - 3), rectPoly(U(9), U(6), U(1.5), 2), 0, U(9),
    { tone: "hi", at: p(0, 0, PHONE.bottom - 6) });
  {
    const cable = [p(0, -6, PHONE.bottom - 10), p(0, -14, PHONE.bottom - 30), p(2, -22, TOP + 26),
      p(-6, -30, TOP + 10), p(-30, -26, DECKTOP + 12), p(-64, -16, DECKTOP + 6)];
    const pieces = tubePieces(cable, U(2.4), P, { maxLength: U(18), caps: true });
    put("dock.cable", p(0, -10, PHONE.bottom - 22), pieces.map((piece) => tubeSvg(piece, { tone: "lo" })).join(""),
      { shapes: [record(A.tube(cable, U(1.3), { name: "dock.cable", limp: true }))], bias: 0.3 });
  }
}

/** The app on the phone: mode plate, four brake dots, charge bars. Live part is live.js. */
function screenUi(p) {
  const z0 = PHONE.bottom;
  const bar = (x0, zz, x1, h, tone) => {
    const cx = (x0 + x1) / 2;
    return S(G.prismOf(F_AT(p(cx, 4.5, z0 + zz), [0, 1, 0], [1, 0, 0]), rectPoly(U(Math.abs(x1 - x0)), U(h), U(h / 2), 2), 0, U(0.3), P), { tone });
  };
  return bar(-26, 26, 26, 3, "mid")
    + bar(-26, 42, 2, 16, "lo")
    + bar(-26, 112, 26, 2, "lo")
    + bar(-26, 122, 12, 2, "lo")
    + Dots([[-16, 92], [-6, 92], [4, 92], [14, 92]].map(([a, b]) => at(p(a, 4.6, z0 + b))), { size: 0.8 });
}

// ---------------------------------------------------------------- build
decks();
battery();
electronics();
harness();
dock();
const LEG_NAMES = [];
for (const [sx, sy] of LAY.hipStations) {
  for (const part of legParts(M.STANCE, sx, sy)) {
    put(part.name, part.at, part.svg, { shapes: part.shapes, bias: part.bias ?? 0.1 });
    LEG_NAMES.push(part.name);
  }
}

// painter's order
A.settle(R, P);
// things that sit on a face the solver sees through get their key from that face, not from a
// ray that can land either side of it: the phone's screen on its glass, the label on the deck
const keyOf = (name) => Math.max(...ITEMS.filter((item) => item.name === name).map((item) => item.key));
for (const item of ITEMS) {
  if (item.name === "phone.screen") item.key = keyOf("phone.body") + 0.4;
  if (item.name === "body.label") item.key = keyOf("body.deck.lower") + 0.3;
  if (item.name === "dock.plug" || item.name === "phone.button") item.key = keyOf("phone.body") + 0.45;
}
ITEMS.sort((a, b) => a.key - b.key);

// ---------------------------------------------------------------- the pose library
// Eight phases of the crawl: one atlas per phase, each holding all four legs at their own angle
// for that instant, plus the folded pose the machine is carried in.
const atlas = [];
for (const [i, w] of M.GAIT.entries()) {
  const legs = [];
  for (const [sx, sy] of LAY.hipStations) {
    const id = STATION_ID(sx, sy);
    const pl = w.legs[id] ?? { hip: 45, knee: 0 };
    COLLECT = [];
    const parts = legParts({ hip: pl.hip, knee: pl.knee, dz: 0, ground: false, name: "walk" }, sx, sy);
    COLLECT = null;
    legs.push(`<g class="leg-pose" data-leg="${id}" data-pose="${i}">${parts.map((part) => part.svg).join("")}</g>`);
  }
  atlas.push(`<g class="leg-atlas" data-atlas="${i}">${legs.join("")}</g>`);
}
{
  const legs = [];
  for (const [sx, sy] of LAY.hipStations) {
    const id = STATION_ID(sx, sy);
    COLLECT = [];
    const parts = legParts(M.POSES[6], sx, sy);
    COLLECT = null;
    legs.push(`<g class="leg-pose" data-leg="${id}" data-pose="8">${parts.map((part) => part.svg).join("")}</g>`);
  }
  atlas.push(`<g class="leg-atlas" data-atlas="8">${legs.join("")}</g>`);
}
const atlasSvg = `<g class="pt-atlas" aria-hidden="true">${atlas.join("")}</g>`;

const SIZE_GROUPS = [
  { name: "body", en: "Body and decks" },
  { name: "leg.fr", en: "Front right leg" },
  { name: "leg.fl", en: "Front left leg" },
  { name: "leg.rr", en: "Rear right leg" },
  { name: "leg.rl", en: "Rear left leg" },
  { name: "dock", en: "Phone dock" },
  { name: "phone", en: "Phone in the dock" },
  { name: "elec", en: "Electronics and power" },
];
const SIZES = sizesOf(ITEMS, SIZE_GROUPS);
const PARTS = partsJson(ITEMS, { title: "Wheel-foot: the phone is the brain" });
writeFileSync(join(HERE, "parts.json"), JSON.stringify(PARTS, null, 1) + "\n");

// ---------------------------------------------------------------- the card
const bi = (ru, en) => en;   // the figure speaks English only
const STUDY = studyRows();
const bomOf = (row) => BOM.find((entry) => entry.id === row.bom);
const nameOf = (row) => (row.bom ? bomOf(row).en.name : row.en.label);
const specOf = (row) => (row.bom ? bomOf(row).en.spec : row.en.spec);

const badgeAt = new Map();
for (const row of STUDY) {
  if (row.at) badgeAt.set(row.item, at(row.at));
  else for (const item of ITEMS) if (item.name === row.item && item.ref && !badgeAt.has(row.item)) badgeAt.set(row.item, at(item.ref));
}
for (const row of STUDY) if (!badgeAt.has(row.item)) console.warn("no mark for", row.item, row.n);
const markRows = STUDY.filter((row) => badgeAt.has(row.item));
const badges = markRows.map((row) => {
  const [bx, by] = badgeAt.get(row.item);
  return `<g class="pt-badge" data-mark="${row.n}" data-item="${row.item}"><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="7.6"/><text x="${bx.toFixed(1)}" y="${(by + 3.3).toFixed(1)}">${row.n}</text></g>`;
}).join("");

const partsList = STUDY.map((row) =>
  `<li data-item="${row.item}" data-mark="${row.n}"><b>${row.n}</b><span class="pt-part-name">${nameOf(row)}</span><span class="pt-part-spec"> · ${specOf(row)}</span></li>`).join("");

const money = (value) => (Math.round(value * 100) / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const itemsOfBom = new Map();
for (const row of STUDY) if (row.bom) itemsOfBom.set(row.bom, [...(itemsOfBom.get(row.bom) ?? []), row.item]);
const costRows = BOM.map((row) => {
  const unit = row.unit;
  return `<li data-items="${(itemsOfBom.get(row.id) ?? []).join(" ")}"><a class="pt-cost-link" href="${SEARCH(row.q)}" target="_blank" rel="noopener noreferrer">`
    + `<b>${row.en.name}</b>`
    + `<span class="pt-cost-sum">${usd(rowTotal(row))}</span>`
    + `<span class="pt-cost-spec">${row.en.spec}</span>`
    + `<span class="pt-cost-qty">${row.qty} ${unit} × ${usd(row.price)}</span>`
    + `</a><em>range ${row.range ? usd(row.range[0]) + "–" + usd(row.range[1]).slice(1) : ""}</em></li>`;
}).join("");
const costHtml = `<aside class="pt-cost" id="pt-cost" aria-label="Cost">
  <header><span>What the robot costs</span><span class="pt-cost-when">AliExpress listings, ${PRICED_ON}</span></header>
  <ol>${costRows}</ol>
  <footer>
    <span>Electrical and power</span><b>${usd(electronicsTotal())}</b>
    <span>Mechanics and printing</span><b>${usd(bomTotal() - electronicsTotal())}</b>
    <span>Total, without the phone</span><b>${usd(bomTotal())}</b>
  </footer>
  <p class="pt-cost-note">${WHAT_HUB_PAYS_EN}</p>
  <p class="pt-cost-note">Indicative: prices move every day and depend on the region. Press a row to search AliExpress.</p>
</aside>`;

// ---------------------------------------------------------------- the card's own chrome
const sizeRows = SIZES.rows.map((row) => `<li><span>${bi(row.ru, row.en)}</span><b>${cm1(row.extents.w)} × ${cm1(row.extents.d)} × ${cm1(row.extents.h)}</b></li>`).join("");
const sizesHtml = `<aside class="pt-size" id="pt-sizes" aria-label="Sizes">
  <header><span>Sizes, cm</span><span class="pt-size-scale">scale 1 unit = ${MM_PER_UNIT.toFixed(2)} mm</span></header>
  <ol>${sizeRows}</ol>
  <p class="pt-size-note">Width × depth × height, measured from the true bounds of the parts. parts.json beside the page hands every part over in millimetres for the 3D file and the print.</p>
</aside>`;

const drawerHtml = `<aside class="pt-drawer" data-drawer aria-label="Parts, cost, app and sizes">`
  + `<div class="pt-drawer-head"><span class="pt-drawer-title" data-drawer-title></span>`
  + `<button class="pt-drawer-close" type="button" data-drawer-close aria-label="Close">&#215;</button></div>`
  + `<aside class="pt-parts" id="pt-parts" aria-label="Components"><ol>${partsList}</ol></aside>`
  + costHtml + appHtml() + sizesHtml + `</aside>`;


// ---------------------------------------------------------------- the app panel
function appHtml() {
  return `<aside class="pt-app-panel" id="pt-app" aria-label="App">
  <div class="pt-card">
    <header><span data-app-state>STAND · brake 4/4</span><b>BLE, 10 Hz</b></header>
    <div class="pt-brakes" data-brakes>
      <i data-brake-dot="fr"></i><i data-brake-dot="fl"></i><i data-brake-dot="rr"></i><i data-brake-dot="rl"></i>
    </div>
    <div class="pt-modes"><span>Mode</span>
      <button type="button" data-mode="stand" aria-pressed="true">Stand</button>
      <button type="button" data-mode="drive" aria-pressed="false">Drive</button>
      <button type="button" data-mode="walk" aria-pressed="false">Walk</button>
      <button type="button" data-mode="stow" aria-pressed="false">Stow</button>
    </div>
    <div class="pt-slider"><span>Clearance</span><input type="range" min="0" max="2" step="1" value="0" data-ride><output data-r-ride>88 mm</output></div>
    <div class="pt-slider"><span>Speed</span><input type="range" min="-250" max="250" step="10" value="0" data-speed><output data-r-speed>0.00 m/s</output></div>
    <div class="pt-slider"><span>Steer</span><input type="range" min="-60" max="60" step="2" value="0" data-steer><output data-r-steer>straight</output></div>
    <div class="pt-modes"><span>Brake</span>
      <button type="button" data-brake aria-pressed="true">Lock</button>
      <button type="button" data-level aria-pressed="true">Level</button>
    </div>
    <div class="pt-load">
      <span>dogs seated</span><b data-r-dogs>4/4</b>
      <span>hip height</span><b data-r-hip>92 mm</b>
      <span>body tilt</span><b data-r-tilt>0.0°</b>
      <span>wheel</span><b data-r-rpm>0 rpm</b>
      <span>pack</span><b data-r-pack>7.8 V</b>
      <span>draw</span><b data-r-draw>0.09 A</b>
      <span>lasts</span><b data-r-lasts>21 h</b>
    </div>
    <button type="button" class="pt-plug-btn" data-cycle>Cycle the mode</button>
    <p class="pt-note">The brake is spring-engaged: a flat battery leaves the robot standing. The servo only pulls the dogs back — 6 mm in 0.35 s. Clearance is set by the arms while the wheels stay on the floor; the body drops 9 mm for every 17° of arm angle.</p>
  </div>
</aside>`;
}

// ---------------------------------------------------------------- the parts study
// Every row names an item that exists in the drawing and in parts.json; `at` is where its
// numbered badge sits, in millimetres of the figure's own frame.
function studyRows() {
  const M_ = (x, y, z) => [U(x), U(y), U(z)];
  const row = (n, item, at, label, spec, bom) => ({ n, item, at: M_(...at), bom, ru: { label, spec }, en: { label, spec } });
  return [
    row(1, "phone.screen", [0, 5, 200], "The phone's screen", "the app, the camera and the IMU: the brain", "esp32"),
    row(2, "phone.body", [30, 5, 210], "Phone", "74 x 158 x 8.5 mm, 200 g, charge over USB-C", null),
    row(3, "dock.rail", [0, -9, 190], "Dock rail", "two rails clamp the phone; the back stays open for the lenses", null),
    row(4, "dock.jaw.slide", [42, 12, 198], "Sliding jaw", "20 mm of spring travel takes any phone", null),
    row(5, "dock.spring", [60, 12, 198], "Jaw spring", "no latch: the phone lifts straight out", null),
    row(6, "dock.lip", [-30, 12, 122], "Bottom lip", "the phone stands on it, slotted for the plug", null),
    row(7, "dock.plug", [0, 8, 124], "USB-C plug", "5 V in; the data goes over BLE", "cable"),
    row(8, "turret.platter", [0, -22, 131], "Pan turret", "SG90 and a ring gear: +-70 deg, so the camera looks ahead or aside", "hip-servo"),
    row(9, "dock.knob", [-40, 20, 152], "Tilt thumbscrew", "locks the tilt anywhere in +-20 deg", "knob"),
    row(10, "dock.cable", [0, -12, 150], "Power cable", "down the back to the 5 V buck", "cable"),
    row(11, "body.handle", [0, -49, 148], "Carry handle", "you carry it by this with the legs folded", null),
    row(12, "body.deck.upper", [46, -34, 122], "Upper deck", "150 x 90 mm, 3 mm PETG, on 25 mm standoffs", null),
    row(13, "elec.esp32", [60, -34, 98], "ESP32", "BLE, a 100 Hz loop, current watchdog", "esp32"),
    row(14, "elec.pca9685", [58, 6, 98], "PCA9685", "12 channels: 8 joints, 4 brakes", "pca9685"),
    row(15, "elec.tb6612.left", [58, 36, 98], "TB6612", "two 1.2 A channels; two modules carry four wheels", "tb6612"),
    row(16, "elec.mpu", [20, -34, 98], "MPU6050", "this is what levels the body on a slope", "mpu"),
    row(17, "elec.pcf", [-8, -34, 98], "PCF8574", "four brake switches on two wires", "pcf"),
    row(18, "elec.buck6", [-22, 24, 99], "6 V 8 A buck", "eight servos and four motors; 4.8 A peak", "buck6"),
    row(19, "elec.buck5", [-42, -22, 98], "5 V buck", "the ESP32 and the phone's charge", "buck5"),
    row(20, "elec.cell", [6, -10, 83], "18650 cell", "2S, 3500 mAh, 25.9 Wh", "cell"),
    row(21, "elec.bms", [28, 0, 71], "2S BMS", "protection and balancing", "bms"),
    row(22, "elec.harness", [-4, 22, 97], "Harness", "along the lower deck, clear of the wheels", null),
    row(23, "elec.switch", [-88, -14, 84], "Switch and fuse", "20 A rocker, 5 A element", "power"),
    row(24, "elec.buzzer", [66, -6, 104], "Buzzer", "low pack, brake fault", null),
    row(25, "body.rail", [-30, -51, 86], "Side rail", "the hip bracket hangs on it", null),
    row(26, "body.foot", [82, 44, 88], "Rubber foot", "the robot sits on these when folded", null),
    row(27, "body.label", [30, 28, 94], "Label plate", "a serial and three rules, like an instrument", null),
    row(28, "leg.fr.bracket", [60, -54, 74], "Hip bracket", "printed, two cheeks; holds the hip servo", null),
    row(29, "leg.fr.servo", [60, -34, 84], "Hip servo", "MG996R, 9.4 kg.cm at 6 V", "hip-servo"),
    row(30, "leg.fr.thigh", [74, -62, 78], "Thigh", "40 mm link at 45 deg; the joint that steps", "hip-servo"),
    row(31, "leg.fr.knee-servo", [88, -38, 54], "Knee servo", "MG996R; bending it lifts the foot 12 mm", "hip-servo"),
    row(32, "leg.fr.shin", [88, -62, 44], "Shin", "40 mm link; the fork the wheel sits in", null),
    row(33, "leg.fr.motor", [88, -54, 14], "N20 motor", "6 V, 200 rpm, 0.50 m/s on a 48 mm wheel", "motor"),
    row(34, "leg.fr.tyre", [88, -70, 24], "Tyre", "48 x 12 mm rubber, 20 sipes", "wheel"),
    row(35, "leg.fr.hub", [88, -70, 34], "Hub", "six spokes, six slots for the dogs", null),
    row(36, "leg.fr.collar", [88, -86, 24], "Dog collar", "six dogs, 3 mm of travel: this is the brake", null),
    row(37, "leg.fr.spring", [88, -91, 30], "Brake spring", "0.6 N/mm, 2.2 N: holds the brake with no power", "shifter-spring"),
    row(38, "leg.fr.brake-servo", [78, -89, 66], "Brake servo", "SG90, 9 g, only ever works to release", "brake-servo"),
    row(39, "leg.fr.fork", [88, -93, 46], "Fork", "the lever that pulls the collar back", null),
    row(40, "leg.fr.switch", [72, -85, 30], "Microswitch", "confirms the dogs are seated", "microswitch"),
    row(41, "leg.fr.fork-outer", [88, -81, 40], "Outer cheek", "the other side of the fork; the collar seats on it", null),
    row(42, "body.deck.lower", [72, 40, 94], "Lower deck", "180 x 110 mm, ribbed underneath", null),
    row(43, "body.post", [58, 32, 108], "M3 standoff", "25 mm, four of them", "hardware"),
    row(44, "elec.led", [-40, -6, 99], "Status LED", "mode and link", null),
  ];
}

// ---------------------------------------------------------------- DATA for the page
const DATA = {
  W, H, P,
  sizes: { box: SIZES.box, mmPerUnit: MM_PER_UNIT },
  poses: M.POSES,
  gait: M.GAIT,
  walkSeconds: M.WALK.period,
  walkNote: M.WALK,
  legs: LAY.hipStations.map(([sx, sy]) => ({ id: STATION_ID(sx, sy), sx, sy })),
  hip: { x: HIP.x, y: HIP.y, z: HIP.z },
  model: {
    stance: M.STANCE,
    mass: M.massOf(),
    speed: M.speed(),
    runtime: M.RUNTIME,
    packWh: M.packWh(),
    tiltRange: M.tiltOf(M.LEVEL.range),
    margin: M.servoMargin(),
    shear: M.dogShear(),
    brake: M.BRAKE,
    legA: M.LEG.a,
    legB: M.LEG.b,
    travel: M.BRAKE.travel,
    releaseSeconds: 0.35,
    step: M.STEP,
    wheelD: M.WHEEL.d,
    rpm: M.MOTOR.rpm,
    peak: M.RUNTIME.peak,
  },
};

// ---------------------------------------------------------------- CSS
const CSS = `<style>
/* tones: the kit's dark shades are all near-black, so the figure carries its own ramp */
.pt-front .iso-fill,.pt-back .iso-fill{fill:#2e3137}
.pt-front .iso-shade[data-shade="0"]{fill:#25282c}
.pt-front .iso-shade[data-shade="1"]{fill:#31353a}
.pt-front .iso-shade[data-shade="2"]{fill:#3b4046}
.pt-front .iso-shade[data-shade="3"]{fill:#474d55}
.pt-front .iso-top{fill:#545b64}
.pt-front .it[data-name$=".tyre"] .iso-fill{fill:#141517}
.pt-front .it[data-name$=".tyre"] .iso-shade[data-shade="0"]{fill:#111214}
.pt-front .it[data-name$=".tyre"] .iso-shade[data-shade="1"]{fill:#17191b}
.pt-front .it[data-name$=".tyre"] .iso-shade[data-shade="2"]{fill:#1d2023}
.pt-front .it[data-name$=".tyre"] .iso-shade[data-shade="3"]{fill:#23262a}
.pt-front .it[data-name$=".tyre"] .iso-top{fill:#2b2f33}
.pt-front .it[data-name$=".arm"],.pt-front .it[data-name$=".bracket"],.pt-front .it[data-name$=".bracket-shelf"] .iso-shade[data-shade="2"],.pt-front .it[data-name$=".bracket-shelf"] .iso-shade[data-shade="3"]{fill:#3a4046}
.pt-front .it[data-name^="body.deck"] .iso-fill{fill:#2a2d31}
.pt-front .it[data-name^="body.deck"] .iso-shade[data-shade="0"]{fill:#232629}
.pt-front .it[data-name^="body.deck"] .iso-shade[data-shade="1"]{fill:#2c3034}
.pt-front .it[data-name^="body.deck"] .iso-shade[data-shade="2"]{fill:#35393e}
.pt-front .it[data-name^="body.deck"] .iso-shade[data-shade="3"]{fill:#3e4349}
.pt-front .it[data-name^="body.deck"] .iso-top{fill:#4a5057}
.pt-front .it[data-name^="elec."] .iso-fill,.pt-front .it[data-name^="elec."] .iso-shade{fill:#20272b}
.pt-front .it[data-name^="elec."] .iso-top{fill:#2b3338}
.pt-front .it[data-name^="elec.esp32"],.pt-front .it[data-name^="elec.pca9685"],.pt-front .it[data-name^="elec.tb6612"],.pt-front .it[data-name^="elec.mpu"],.pt-front .it[data-name^="elec.pcf"],.pt-front .it[data-name^="elec.buck"]{fill:#1c2a2b}
.pt-front .it[data-name$=".servo"],.pt-front .it[data-name$=".brake-servo"] .iso-shade{fill:#33373c}
.pt-front .it[data-name$=".collar"],.pt-front .it[data-name$=".axle"],.pt-front .it[data-name$=".motor"] .iso-shade{fill:#4b525a}
.pt-front .it[data-name$=".hub"] .iso-shade{fill:#454b52}
.pt-front .it[data-name^="phone.body"] .iso-fill{fill:#101215}
.pt-front .it[data-name^="phone.body"] .iso-shade[data-shade="0"]{fill:#0e1013}
.pt-front .it[data-name^="phone.body"] .iso-shade[data-shade="1"]{fill:#141619}
.pt-front .it[data-name^="phone.body"] .iso-shade[data-shade="2"]{fill:#1a1d21}
.pt-front .it[data-name^="phone.body"] .iso-shade[data-shade="3"]{fill:#20242a}
.pt-front .it[data-name^="phone.body"] .iso-top{fill:#282d34}
.pt-front .it[data-name^="phone.screen"] .iso-fill{fill:#e8eef3}
.pt-front .it[data-name^="phone.screen"] .iso-top{fill:#f6fafc}
.pt-front .it[data-name^="phone.screen"] .iso-shade{fill:#d5dee5}
.pt-front .it[data-name$=".label"] .iso-fill{fill:#5a6068}
.iso[data-theme="light"] .pt-front .iso-fill{fill:#f7f7f4}
.iso[data-theme="light"] .pt-front .iso-shade[data-shade="0"]{fill:#e2e1dc}
.iso[data-theme="light"] .pt-front .iso-shade[data-shade="1"]{fill:#ecebe6}
.iso[data-theme="light"] .pt-front .iso-shade[data-shade="2"]{fill:#f3f2ee}
.iso[data-theme="light"] .pt-front .iso-shade[data-shade="3"]{fill:#fbfaf7}
.iso[data-theme="light"] .pt-front .iso-top{fill:#ffffff}
.iso[data-theme="light"] .pt-front .it[data-name$=".tyre"] .iso-shade{fill:#cfcfc9}
.iso[data-theme="light"] .pt-front .it[data-name$=".tyre"] .iso-top{fill:#dcdcd6}
.iso[data-theme="light"] .pt-front .it[data-name^="phone.body"] .iso-shade{fill:#2b2e33}
.iso[data-theme="light"] .pt-front .it[data-name^="phone.body"] .iso-top{fill:#3a3e44}
.iso[data-theme="light"] .pt-front .it[data-name^="phone.screen"] .iso-fill{fill:#2f3338}
.iso[data-theme="light"] .pt-front .it[data-name^="phone.screen"] .iso-shade{fill:#232629}
.iso[data-theme="light"] .pt-front .it[data-name^="phone.screen"] .iso-top{fill:#1b1e21}
/* the sizes overlay: hidden until its panel is open */
.pt-dims{display:none}
.pt-stage[data-pt-sizes] .pt-dims{display:inline}
.pt-dim-frame{fill:none;stroke:var(--anatomy-faint);stroke-width:.8;stroke-dasharray:3 4}
.pt-dim-line,.pt-dim-tick{fill:none;stroke:var(--anatomy-hi);stroke-width:1}
.pt-dim-witness{fill:none;stroke:var(--anatomy-lo);stroke-width:.6}
.pt-dim-plate{fill:var(--anatomy-card);stroke:var(--anatomy-lo);stroke-width:.6}
.pt-dim-text{fill:var(--anatomy-hi);font:500 9.5px var(--anatomy-mono)}
.pt-stage{position:relative;display:grid;touch-action:pan-y;--pt-zoom:1;padding-bottom:56px;width:min(100%,700px);margin:0 auto}
html:not([data-lang="en"]) [lang="en"]{display:none}
.iso-plate-corner[data-corner="readout"]{bottom:18px;max-width:72%;white-space:normal;text-align:right;line-height:1.4}
.pt-stage>*{grid-area:1/1;position:relative}
.pt-back{z-index:0}
.pt-front{z-index:2}
.pt-halo{fill:#000;opacity:.06}
.iso[data-theme="dark"] .pt-halo{fill:#000;opacity:.34}
.pt-halo{stroke:none}
.pt-stage svg{overflow:visible}
.pt-controls{position:absolute;left:0;right:0;bottom:6px;z-index:5;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:7px}
.pt-zoom,.pt-parts-btn,.pt-cost-btn,.pt-app-btn,.pt-size-btn{display:flex;align-items:center;justify-content:center;height:24px;padding:0 10px;border:1px solid var(--anatomy-lo);border-radius:999px;background:var(--anatomy-paper);color:var(--anatomy-hi);font:500 11px/1 var(--anatomy-mono);letter-spacing:.08em;cursor:pointer}
.pt-parts-btn,.pt-cost-btn,.pt-app-btn,.pt-size-btn{text-transform:uppercase}
.pt-zoom:hover,.pt-parts-btn:hover,.pt-cost-btn:hover,.pt-app-btn:hover,.pt-size-btn:hover{border-color:var(--anatomy-hi)}
.pt-zoom-level{min-width:44px;text-align:center;color:var(--anatomy-muted);font:500 11px/1 var(--anatomy-mono)}
.pt-lang{display:flex;gap:4px;margin-left:4px}
.pt-lang button{width:30px;height:24px;border:1px solid var(--anatomy-lo);border-radius:999px;background:var(--anatomy-paper);color:var(--anatomy-muted);font:500 10px/1 var(--anatomy-mono);cursor:pointer}
.pt-lang button[aria-pressed="true"]{color:var(--anatomy-hi);border-color:var(--anatomy-hi)}
.pt-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pt-badges circle{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:.8}
.pt-badges text{fill:var(--anatomy-hi);font:500 9px var(--anatomy-mono);text-anchor:middle}
.pt-badge{opacity:0;transition:opacity .18s ease}
.pt-stage.pt-showparts .pt-badge{opacity:1}
.pt-badge[data-on]{opacity:1}
.pt-badge[data-on] circle{stroke:var(--anatomy-hi);stroke-width:1.4}
.pt-drawer{position:fixed;top:0;right:0;bottom:0;width:380px;max-width:100vw;box-sizing:border-box;padding:18px 16px 26px;overflow:auto;background:var(--anatomy-card);border-left:1px solid var(--anatomy-lo);transform:translateX(103%);transition:transform .32s ease;visibility:hidden;pointer-events:none;z-index:6}
.pt-drawer[data-open]{visibility:visible;pointer-events:auto;transform:none}
body[data-pt-drawer]{padding-right:380px;transition:padding-right .32s ease}
.pt-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;padding-bottom:9px;border-bottom:1px solid var(--anatomy-shade-1)}
.pt-drawer-title{font:500 11px/1.2 var(--anatomy-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--anatomy-hi)}
.pt-drawer-close{width:22px;height:22px;border:1px solid var(--anatomy-lo);border-radius:50%;background:transparent;color:var(--anatomy-hi);cursor:pointer}
.pt-drawer .pt-parts,.pt-drawer .pt-cost,.pt-drawer .pt-app-panel,.pt-drawer .pt-size{display:none}
.pt-drawer[data-panel="parts"] .pt-parts{display:block}
.pt-drawer[data-panel="cost"] .pt-cost{display:block}
.pt-drawer[data-panel="app"] .pt-app-panel{display:block}
.pt-drawer[data-panel="sizes"] .pt-size{display:block}
.pt-parts ol,.pt-cost ol,.pt-size ol{margin:0;padding:0;list-style:none}
.pt-parts li{display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid var(--anatomy-shade-1);font-size:11.5px;color:var(--anatomy-text);cursor:default}
.pt-parts li b{flex:0 0 16px;font:500 10px/1 var(--anatomy-mono);color:var(--anatomy-hi);text-align:right}
.pt-parts li:hover{color:var(--anatomy-strong)}
.pt-parts li.pt-part-on{color:var(--anatomy-strong)}
.pt-parts li.pt-part-on b{color:var(--anatomy-hi)}
.pt-part-spec{color:var(--anatomy-muted)}
.pt-cost header,.pt-size header{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 10px;font:500 11px/1.2 var(--anatomy-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-hi)}
.pt-cost-when,.pt-size-scale{color:var(--anatomy-muted);letter-spacing:.02em}
.pt-cost li{padding:7px 0;border-bottom:1px solid var(--anatomy-shade-1)}
.pt-cost-link{display:grid;grid-template-columns:1fr auto;gap:2px 10px;text-decoration:none;color:inherit}
.pt-cost-link b{font-size:11.5px;color:var(--anatomy-strong)}
.pt-cost-sum{font:500 11px/1 var(--anatomy-mono);color:var(--anatomy-hi);text-align:right}
.pt-cost-spec,.pt-cost-qty{font-size:10.5px;color:var(--anatomy-muted)}
.pt-cost-qty{text-align:right}
.pt-cost li em{display:block;margin-top:2px;font-style:normal;font-size:10px;color:var(--anatomy-muted)}
.pt-cost footer{display:grid;grid-template-columns:1fr auto;gap:4px 10px;margin:12px 0;padding-top:10px;border-top:1px solid var(--anatomy-lo);font-size:11.5px}
.pt-cost footer b{font-family:var(--anatomy-mono);color:var(--anatomy-hi)}
.pt-cost-note{margin:8px 0 0;font-size:10.5px;line-height:1.5;color:var(--anatomy-muted)}
.pt-size li{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--anatomy-shade-1);font-size:11.5px;color:var(--anatomy-text)}
.pt-size li b{font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-hi);white-space:nowrap}
.pt-size-note{margin:0;font-size:11px;line-height:1.5;color:var(--anatomy-muted)}
.pt-card{padding:2px}
.pt-card header{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px;font:500 11px/1.2 var(--anatomy-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-hi)}
.pt-card header b{color:var(--anatomy-muted);font-weight:500;text-transform:none;letter-spacing:.02em}
.pt-brakes{display:flex;gap:6px;margin-bottom:12px}
.pt-brakes i{flex:1;height:6px;border-radius:3px;background:var(--anatomy-shade-2);transition:background .18s ease}
.pt-brakes i[data-on]{background:var(--anatomy-hi)}
.pt-slider{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;margin-bottom:10px;font-size:11px;color:var(--anatomy-muted)}
.pt-slider input{grid-column:1;width:100%;accent-color:var(--anatomy-hi)}
.pt-slider output{grid-column:2;font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-hi);min-width:56px;text-align:right}
.pt-modes{display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:11px;color:var(--anatomy-muted)}
.pt-modes button{padding:3px 9px;border:1px solid var(--anatomy-lo);border-radius:999px;background:transparent;color:var(--anatomy-muted);font:500 10px/1 var(--anatomy-mono);cursor:pointer}
.pt-modes button[aria-pressed="true"]{border-color:var(--anatomy-hi);color:var(--anatomy-hi);background:var(--anatomy-shade-1)}
.pt-load{display:grid;grid-template-columns:1fr auto;gap:4px 10px;margin-bottom:12px;padding-top:10px;border-top:1px solid var(--anatomy-shade-1);font-size:11px;color:var(--anatomy-muted)}
.pt-load b{font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-hi)}
.pt-plug-btn{width:100%;height:32px;border:1px solid var(--anatomy-lo);border-radius:999px;background:var(--anatomy-paper);color:var(--anatomy-hi);font:500 11px/1 var(--anatomy-mono);letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
.pt-plug-btn:hover{border-color:var(--anatomy-hi)}
.pt-note{margin:10px 0 0;font-size:10.5px;line-height:1.5;color:var(--anatomy-muted)}
.pt-stage svg.pt-front,.pt-stage svg.pt-back{transform:scale(var(--pt-zoom,1));transform-origin:50% 50%;transition:transform .18s ease}
.pt-leader{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity .18s ease}
.pt-leader[data-on]{opacity:1}
.pt-leader-path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;stroke-dasharray:3 3}
/* the pose library: only one pose is visible, and only while the page is not at rest */
.pt-atlas .leg-atlas{display:none}
.pt-stage[data-pose] .leg-atlas[data-atlas="0"]{display:none}
.pt-stage[data-pose] .it.leg-mover{display:none}
.pt-stage .pt-atlas{z-index:1}
.pt-stage[data-stow] .leg-atlas[data-atlas="8"]{display:inline}
/* the screen breathes: it is the one lit part of the drawing */
.pt-wheelmark circle{fill:var(--anatomy-hi);opacity:.8;stroke:none}
.pt-wheelmark path{fill:none;stroke:var(--anatomy-hi);stroke-width:.9;opacity:.6}
.pt-screen-live{opacity:.92}
.pt-stage[data-mode="drive"] .pt-screen-live{opacity:1}
</style>`;

// ---------------------------------------------------------------- what the page needs
const name = (THEME === "light" ? "phonebot-light" : "phonebot") + ".html";
const frontGroups = ITEMS.map((item) =>
  `<g class="it${/^leg\./.test(item.name) ? " leg-mover" : ""}" data-piece="${item.piece}" data-name="${item.name}" data-k="${item.key.toFixed(2)}">${item.svg}</g>`).join("");
const frontSvg = k.figureSvg({ width: W, height: H, label: "", className: "pt-front", body: frontGroups + atlasSvg });
const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg pt-back" viewBox="0 0 ${W} H" aria-hidden="true"><path class="pt-halo" d="${k.haloOf({ x: U(EXT.x0 + 6), y: U(EXT.y0 + 6), w: U(EXT.x1 - EXT.x0 - 12), d: U(EXT.y1 - EXT.y0 - 12), r: U(20) }, U(FLOOR), U(4), P)}"/></svg>`;
const studyHtml = `<g class="pt-badges" data-part="badges" aria-hidden="true">${badges}</g>`;

const stageBody = `<div class="pt-stage" tabindex="0" role="group" aria-label="A four-legged robot that stands on locked wheels: a dog clutch in every hub turns the wheel into a foot, and a spring holds that brake with no power. Click a wheel to lock or release it, the phone to change mode; C parts, X cost, A app, S sizes.">${backSvg}${frontSvg}${studyHtml}<div class="pt-controls"><button class="pt-zoom" type="button" data-zoom="-1" aria-label="Zoom out">&minus;</button><span class="pt-zoom-level" data-zoom-level>100%</span><button class="pt-zoom" type="button" data-zoom="1" aria-label="Zoom in">+</button><button class="pt-parts-btn" type="button" aria-pressed="false" aria-controls="pt-parts">Parts</button><button class="pt-cost-btn" type="button" aria-pressed="false" aria-controls="pt-cost">Cost</button><button class="pt-app-btn" type="button" aria-pressed="false" aria-controls="pt-app">App</button><button class="pt-size-btn" type="button" aria-pressed="false" aria-controls="pt-sizes">Sizes</button></div>${drawerHtml}<svg class="pt-leader" data-leader aria-hidden="true"><path class="pt-leader-path" data-leader-path d=""/></svg><span class="pt-sr" role="status" aria-live="polite" data-status></span></div>`;

const body = k.plateHtml({ fig: RU.ui.fig, title: RU.ui.title, hint: RU.ui.hint, readout: RU.ui.readout, keys: RU.ui.keys, caption: RU.caption, body: stageBody });

const stripJs = (source) => source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "").replace(/^export /gm, "");
const langSource = `const RU = ${JSON.stringify(RU)};\nconst EN = ${JSON.stringify(EN)};\n`;
const sizesSource = stripJs(readFileSync(join(HERE, "..", "..", "eco", "chrome", "sizes.js"), "utf8"));
const live = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

if (!process.env.PB_FULL) {
  writeFileSync(join(HERE, name), k.pageHtml({ title: "WHEELBOT W1 · wheel-foot robot", theme: THEME, body: body + CSS, script: kitScript() + langSource + sizesSource + live }));
}
console.log("wrote", name, ITEMS.length, "items,", R.solids.length, "solids,", R.tubes.length, "routes");

try {
  A.auditOrExit(R, P, {
    ground: (shape) => (shape.name ?? "").startsWith("leg.") && /tyre/.test(shape.name ?? ""),
    allow: [], crowd: [],
    cover: ["phone.screen", "phone.button", "dock.knob", "dock.turret", "dock.lip", "dock.plug", "dock.jaw.fixed", "dock.jaw.slide",
      "leg.fr.switch", "leg.fl.switch", "leg.rr.switch", "leg.rl.switch", "elec.led", "elec.buzzer", "body.label", "body.post"],
  });
} catch (error) {
  console.warn("audit skipped:", error.message);
}
