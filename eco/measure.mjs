// Габариты and a machine-readable dump of the geometry.
//
// Both come from the same place: `boundsOf` over the shapes the recorder holds, which are
// the true shapes the figure was drawn from. So the sizes in the card and the numbers in
// `parts.json` cannot drift from the drawing, and `parts.json` (in millimetres) is the
// hand-off for the 3D pass.

import { boundsOf } from "../kit/audit.mjs";
import { MM_PER_UNIT } from "./units.mjs";

const LO = [Infinity, Infinity, Infinity];
const HI = [-Infinity, -Infinity, -Infinity];

/** The box a list of shapes occupies, in world units. */
export function boxOfShapes(shapes, box = { lo: [...LO], hi: [...HI] }) {
  for (const shape of shapes) {
    const b = boundsOf(shape);
    for (let i = 0; i < 3; i++) {
      if (b.min[i] < box.lo[i]) box.lo[i] = b.min[i];
      if (b.max[i] > box.hi[i]) box.hi[i] = b.max[i];
    }
  }
  return box;
}

export const extentsOf = (box) => ({ w: box.hi[0] - box.lo[0], d: box.hi[1] - box.lo[1], h: box.hi[2] - box.lo[2] });

/**
 * The sizes the card's «Размеры» control shows, in world units (the page prints cm):
 * the whole figure, and one row per group of named parts.
 * A group matches an item when the item's name equals the group's name or starts with it
 * followed by a dot, so `frame` catches `frame.post` but not `frame-something`.
 */
export function sizesOf(items, groups = [], { exclude = [] } = {}) {
  const withShapes = items.filter((item) => item.shapes && item.shapes.length);
  // `exclude` keeps the accessories that stand beside the figure out of its own overall
  // box — the bed's dimensions must not stretch to the phone and the adapter on the floor
  const skip = (item) => exclude.some((prefix) => item.name === prefix || item.name.startsWith(`${prefix}.`));
  const own = withShapes.filter((item) => !skip(item));
  const box = boxOfShapes(own.flatMap((item) => item.shapes));
  const rows = groups.map((group) => {
    const hit = withShapes.filter((item) => item.name === group.name || item.name.startsWith(`${group.name}.`));
    const one = boxOfShapes(hit.flatMap((item) => item.shapes));
    return { name: group.name, ru: group.ru, en: group.en, count: hit.length, box: one, extents: extentsOf(one) };
  }).filter((row) => row.count && Number.isFinite(row.extents.w));
  return { box, extents: extentsOf(box), rows };
}

const round = (v, places = 2) => Number.isFinite(v) ? Math.round(v * 10 ** places) / 10 ** places : null;
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) if (!key.startsWith("_")) out[key] = clean(item);
    return out;
  }
  return value;
};

/**
 * A recorded shape with every length in millimetres. The kit records in world units, so
 * the frame's origin and the profile are scaled; the frame's a/u/v are unit vectors and
 * stay as they are, or the part would be scaled twice as soon as it is placed.
 */
function toMm(shape) {
  const s = MM_PER_UNIT;
  const out = { ...shape };
  if (shape.F) out.F = { ...shape.F, o: shape.F.o.map((v) => v * s) };
  if (Array.isArray(shape.poly)) out.poly = shape.poly.map(([a, b]) => [a * s, b * s]);
  if (Array.isArray(shape.points)) out.points = shape.points.map((p) => p.map((v) => v * s));
  if (Array.isArray(shape.radii)) out.radii = shape.radii.map((v) => v * s);
  if (Array.isArray(shape.profile)) out.profile = shape.profile.map(([a, b]) => [a * s, b * s]);
  if (shape.o) out.o = shape.o.map((v) => v * s);
  if (shape.half) out.half = shape.half.map((v) => v * s);
  for (const key of ["s0", "s1", "r", "radius"]) if (typeof shape[key] === "number") out[key] = shape[key] * s;
  return out;
}

/**
 * Every part, in millimetres, ready to be turned into a 3D model: the shape the audit
 * measured (kind, frame, profile, bounds) plus the group it belongs to and the offset its
 * piece carries. Materials are not here — they live as `data-tone` in the drawing.
 */
export function partsJson(items, meta = {}) {
  const parts = [];
  for (const item of items) {
    for (const [index, shape] of (item.shapes ?? []).entries()) {
      const b = boundsOf(shape);
      parts.push({
        id: (item.shapes.length > 1 ? `${item.name}#${index}` : item.name),
        group: item.name.split(".")[0],
        piece: item.piece,
        kind: shape.kind,
        offset: (item.move ?? [0, 0, 0]).map((v) => round(v * MM_PER_UNIT, 2)),
        shape: toMm(clean(shape)),
        bounds: { min: b.min.map((v) => round(v * MM_PER_UNIT, 2)), max: b.max.map((v) => round(v * MM_PER_UNIT, 2)) },
      });
    }
  }
  const box = boxOfShapes(items.flatMap((item) => item.shapes ?? []));
  return {
    title: meta.title ?? "figure",
    unit: "mm",
    axes: "x and y on the floor, z up",
    scale: { mmPerUnit: round(MM_PER_UNIT, 4), note: "18650 cell drawn 18.8 units = 65 mm" },
    bounds: { min: box.lo.map((v) => round(v * MM_PER_UNIT, 2)), max: box.hi.map((v) => round(v * MM_PER_UNIT, 2)) },
    size: Object.fromEntries(Object.entries(extentsOf(box)).map(([key, v]) => [key, round(v * MM_PER_UNIT, 2)])),
    parts,
  };
}
