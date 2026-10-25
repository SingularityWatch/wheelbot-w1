// The ecosystem's scale, stated once.
//
// The figures are drawn in world units: x and y on the floor, z up. The scale is pinned
// to one object every figure owns and whose real size is known: the 18650 cell in the
// bed's battery pack. The pack is drawn with cells 18.8 units long, and an 18650 is
// 65 mm — so one world unit is 3.457 mm, and the plate comes out 84 cm wide, the
// mattress 52 cm deep and the top of the cover 44 cm off the floor.
//
// Every size the pages print comes from `boundsOf` over the recorded solids times this
// constant. Nothing is typed in by hand, here or in a figure.

export const CELL_LENGTH_UNITS = 18.8;
export const CELL_LENGTH_MM = 65;
export const MM_PER_UNIT = CELL_LENGTH_MM / CELL_LENGTH_UNITS;

export const toMm = (units) => units * MM_PER_UNIT;
export const toCm = (units) => toMm(units) / 10;
/** Centimetres to one decimal, the way a spec sheet prints them. */
export const cm1 = (units) => Math.round(toCm(units) * 10) / 10;
/** A size read as `84 × 52 × 44`, in centimetres. */
export const cmTriple = ({ w, d, h }) => `${cm1(w)} × ${cm1(d)} × ${cm1(h)} см`;
/** Centimetres in the reader's units: `см` or `cm`. */
export const cmUnit = (ru) => (ru ? "см" : "cm");
