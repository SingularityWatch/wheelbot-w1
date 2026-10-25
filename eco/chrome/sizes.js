// The card's «Размеры» control, shared by every figure in the ecosystem.
//
// The panel beside the drawing is build-time HTML (both languages, switched by one
// attribute), so this module only has to do two things: flip the state the panel and the
// class hang off, and draw the three dimension lines the drawing gets while it is on.
//
// The lines are chrome the page owns: they are drawn in screen coordinates from the
// projected corners of the figure's true bounds (world units, from `sizesOf`), so they
// stay parallel to the edges they measure at any camera, and they never enter the built
// SVG. Labels carry both languages, like the rest of the card.
//
// Contract: mountSizes({ stage, front, P, sizes, markLayers, onToggle })
//   stage      the .pt-stage element (gets `data-pt-sizes`)
//   front      the front SVG (the group is appended to it)
//   P          the figure's projection (the same one the drawing used)
//   sizes      { box: { lo, hi }, units: { ru, en } } in world units
//   markLayers the array live code re-appends after a painter's-order sort
//   onToggle   called with true/false, for the status line

const SVG_NS = "http://www.w3.org/2000/svg";

function mountSizes({ stage, front, P, sizes, markLayers = [], onToggle }) {
  if (!stage || !front || !P || !sizes || !sizes.box) return null;
  const project = (point) => iso(point, P);
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "pt-dims");
  group.setAttribute("data-dims", "");
  group.setAttribute("aria-hidden", "true");

  const { lo, hi } = sizes.box;
  const corner = (x, y, z) => project([x, y, z]);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const shift = (v, s) => [v[0] * s, v[1] * s];
  const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];

  // one screen direction per world axis, so a line offset along it stays parallel to the
  // edge it measures however the camera is set
  const offY = norm(sub2(corner(0, 40, 0), corner(0, 0, 0)));
  const offX = norm(sub2(corner(40, 0, 0), corner(0, 0, 0)));
  const OUT = 19; // how far outside the silhouette the line sits, in screen px
  const TICK = 4.6;
  const EXT = OUT + 5.5;

  const cm = (units) => {
    const value = units * sizes.mmPerUnit / 10;
    return Math.round(value * 10) / 10;
  };
  const ru = (units) => `${cm(units).toFixed(1).replace(".", ",")} см`;
  const en = (units) => `${cm(units).toFixed(1)} cm`;

  const line = (a, b, cls = "pt-dim-line") => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", cls);
    path.setAttribute("d", `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`);
    return path;
  };
  const tick = (at, along) => {
    const n = [-along[1], along[0]];
    const t = shift(n, TICK);
    return line([at[0] - t[0], at[1] - t[1]], [at[0] + t[0], at[1] + t[1]], "pt-dim-tick");
  };
  const label = (at, units, vertical) => {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", `pt-dim-label${vertical ? " pt-dim-vertical" : ""}`);
    const width = Math.max(ru(units).length, en(units).length) * 6.4 + 12;
    const plate = document.createElementNS(SVG_NS, "rect");
    plate.setAttribute("class", "pt-dim-plate");
    plate.setAttribute("x", String(-width / 2));
    plate.setAttribute("y", "-7.5");
    plate.setAttribute("width", String(width));
    plate.setAttribute("height", "15");
    plate.setAttribute("rx", "3.5");
    g.appendChild(plate);
    for (const [lang, text] of [["ru", ru(units)], ["en", en(units)]]) {
      const el = document.createElementNS(SVG_NS, "text");
      el.setAttribute("class", "pt-dim-text");
      el.setAttribute("lang", lang);
      el.setAttribute("text-anchor", "middle");
      el.setAttribute("y", "3.4");
      el.textContent = text;
      g.appendChild(el);
    }
    g.setAttribute("transform", `translate(${at[0].toFixed(2)} ${at[1].toFixed(2)})`);
    return g;
  };

  // the three dimensions, each drawn as a copy of the projected edge pushed outwards
  const dims = [
    // the width runs along x and is pushed out on the near (+y) side,
    // the depth runs along y and is pushed out beyond the +x side,
    // the height stands at the corner the viewer is nearest to
    { a: corner(lo[0], hi[1], lo[2]), b: corner(hi[0], hi[1], lo[2]), out: offY, units: hi[0] - lo[0], vertical: false },
    { a: corner(lo[0], lo[1], lo[2]), b: corner(lo[0], hi[1], lo[2]), out: shift(offX, -1), units: hi[1] - lo[1], vertical: false },
    { a: corner(hi[0], hi[1], lo[2]), b: corner(hi[0], hi[1], hi[2]), out: add2(offX, shift(offY, 0.5)), units: hi[2] - lo[2], vertical: true },
  ];

  const draw = () => {
    while (group.firstChild) group.removeChild(group.firstChild);
    const all = [corner(lo[0], lo[1], lo[2]), corner(hi[0], lo[1], lo[2]), corner(hi[0], hi[1], lo[2]), corner(lo[0], hi[1], lo[2]), corner(hi[0], hi[1], hi[2])];
    const pad = 8;
    const bx = Math.min(...all.map((p) => p[0])) - pad;
    const by = Math.min(...all.map((p) => p[1])) - pad;
    const bw = Math.max(...all.map((p) => p[0])) + pad - bx;
    const bh = Math.max(...all.map((p) => p[1])) + pad - by;
    const frame = document.createElementNS(SVG_NS, "rect");
    frame.setAttribute("class", "pt-dim-frame");
    frame.setAttribute("x", String(bx));
    frame.setAttribute("y", String(by));
    frame.setAttribute("width", String(bw));
    frame.setAttribute("height", String(bh));
    frame.setAttribute("rx", "6");
    group.appendChild(frame);
    for (const dim of dims) {
      const push = shift(dim.out, OUT);
      const a = add2(dim.a, push);
      const b = add2(dim.b, push);
      group.appendChild(line(a, b));
      group.appendChild(tick(a, norm(sub2(b, a))));
      group.appendChild(tick(b, norm(sub2(b, a))));
      // witnesses: a hair from the corner out past the dimension line
      const far = shift(dim.out, EXT);
      group.appendChild(line(dim.a, add2(dim.a, far), "pt-dim-witness"));
      group.appendChild(line(dim.b, add2(dim.b, far), "pt-dim-witness"));
      group.appendChild(label(mid(a, b), dim.units, dim.vertical));
    }
  };

  draw();
  front.appendChild(group);
  markLayers.push(group);

  const isOn = () => stage.hasAttribute("data-pt-sizes");
  function toggle(on = !isOn()) {
    stage.toggleAttribute("data-pt-sizes", on);
    // the layer has to survive a re-sort of the painter's order
    for (const layer of markLayers) if (layer.nextElementSibling) front.appendChild(layer);
    if (onToggle) onToggle(on);
    return on;
  }

  return { toggle, isOn, redraw: draw };
}
