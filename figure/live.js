// The figure's live half: the mode sets the brakes and the legs, the legs step through the
// pose library built at build time, and every number on the card is the arithmetic of model.mjs.
const D = __DATA__;
const P = D.P;
const M = D.model;
const stage = document.querySelector(".pt-stage");
const front = stage.querySelector("svg.pt-front");
const readout = document.querySelector("[data-readout]");
const status = stage.querySelector("[data-status]");
const drawer = stage.querySelector("[data-drawer]");
const T = () => EN;
document.documentElement.dataset.lang = "en";   // the card speaks English only

// ---------------------------------------------------------------- state
const LEGS = D.legs;                       // [{id, sx, sy}]
const POSES = D.poses;                     // [{name, hip, knee, dz, ground}]
const S = {
  mode: "stand",            // stand | drive | walk | stow
  open: 0,                  // 0 = dogs seated, 1 = collars pulled clear
  ride: 0,                  // pose index the slider asks for (3 crouch … 4 tall)
  phase: 0,                 // walk clock, one cycle per WALK.period
  phaseIdx: 0,              // which of the eight sampled phases is showing
  spin: 0,                  // wheel angle, radians
  speed: 0,                 // mm/s asked of the wheels
  steer: 0,
  tilt: 0,
  level: true,
  pack: 7.8,
  boot: 0,
  pose: {},                  // the pose library index each leg is showing
};
const POSE_OF = { stand: 0, drive: 0, walk: 0, stow: 6 };
const atlasOn = () => S.mode === "walk" || S.mode === "stow";

// ---------------------------------------------------------------- helpers
const at3 = (p) => iso(p, P);
const mm = (v) => v;                        // world units are already converted in DATA
const U = 1 / D.sizes.mmPerUnit;            // units per millimetre
const text = (sel, value) => {
  const el = document.querySelector(sel);
  if (el && el.textContent !== value) el.textContent = value;
};
const bar = (sel, share) => {
  const el = document.querySelector(sel);
  if (el) el.style.setProperty("--w", `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`);
};
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

// the ankle of one leg in the current pose, in world units
function ankleOf(leg, pose) {
  const t = (pose.hip * Math.PI) / 180;
  const k = (pose.knee * Math.PI) / 180;
  const ax = leg.sx * D.hip.x + (M.legA * Math.sin(t) + M.legB * Math.sin(k)) * 0 + (M.legA * Math.sin(t) + M.legB * Math.sin(k)) * leg.sx;
  return {
    x: (leg.sx * D.hip.x + (M.legA * Math.sin(t) + M.legB * Math.sin(k))) * U,
    y: leg.sy * D.hip.y * U,
    z: (D.hip.z + pose.dz - (M.legA * Math.cos(t) + M.legB * Math.cos(k))) * U,
  };
}

// the body rides the same dz as the hips
function bodyShift(dz) {
  const by = at3([0, 0, dz * U]);
  const from = at3([0, 0, 0]);
  const tx = (by[0] - from[0]).toFixed(2);
  const ty = (by[1] - from[1]).toFixed(2);
  for (const group of stage.querySelectorAll(".it")) {
    if (/^leg\./.test(group.dataset.name ?? "")) continue;
    group.setAttribute("transform", `translate(${tx} ${ty})`);
  }
  for (const group of stage.querySelectorAll(".leg-atlas")) group.setAttribute("transform", `translate(${tx} ${ty})`);
}

// collars slide 3 mm along the axle: closed (seated) to open (clear)
function placeCollars() {
  for (const group of stage.querySelectorAll('.it[data-name$=".collar"]')) {
    const id = group.dataset.name.split(".")[1] || "";
    const sy = id[1] === "r" ? -1 : 1;
    const shift = at3([0, 3 * S.open * sy * U, 0]);
    const zero = at3([0, 0, 0]);
    group.setAttribute("transform", `translate(${(shift[0] - zero[0]).toFixed(2)} ${(shift[1] - zero[1]).toFixed(2)})`);
  }
}

// one visible pose per leg, and the static legs hidden while the library is on
function placeLegs() {
  const on = atlasOn();
  const want = S.mode === "walk" ? S.phaseIdx : 8;
  for (const group of stage.querySelectorAll(".it.leg-mover")) group.style.display = on ? "none" : "";
  for (const group of stage.querySelectorAll(".leg-atlas")) {
    const mine = Number(group.dataset.atlas);
    group.style.display = on && mine === want ? "inline" : "none";
  }
  for (const group of stage.querySelectorAll(".leg-pose")) group.style.display = "";
}

// the leg angles at this instant: the gait table in walk, the folded pose in stow, stance otherwise
function legPose(id) {
  if (S.mode === "walk") {
    const w = D.gait[S.phaseIdx] ?? D.gait[0];
    return w.legs[id] ?? { hip: 45, knee: 0 };
  }
  if (S.mode === "stow") return { hip: POSES[8 - 2].hip, knee: POSES[8 - 2].knee };
  return { hip: 45, knee: 0 };
}

// four marks on the rims: the only way a circle can show that it is turning
let marks = null;
function buildMarks() {
  const NS = "http://www.w3.org/2000/svg";
  marks = LEGS.map((leg) => {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "pt-wheelmark");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "2.6");
    const line = document.createElementNS(NS, "path");
    g.append(line, dot);
    front.append(g);
    return { leg, g, dot, line };
  });
}
function placeMarks() {
  if (!marks) buildMarks();
  for (const mark of marks) {
    const pose = legPose(mark.leg.id);
    const a = ankleOf(mark.leg, pose);
    const r = (24 - 3) * U;
    const rIn = 6 * U;
    const ang = S.spin * mark.leg.sx + (mark.leg.sy > 0 ? 0.4 : 0);
    const pt = (rad) => at3([a.x + Math.cos(ang) * rad, a.y, a.z + Math.sin(ang) * rad]);
    const p0 = pt(rIn);
    const p1 = pt(r);
    mark.line.setAttribute("d", `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`);
    mark.dot.setAttribute("cx", p1[0].toFixed(1));
    mark.dot.setAttribute("cy", p1[1].toFixed(1));
  }
}

// ---------------------------------------------------------------- the model, restated
const ridePose = () => (S.ride > 0 ? POSES[3] : S.ride < 0 ? POSES[4] : POSES[0]);
const hipHeight = () => D.hip.z + ridePose().dz;
const brakes = () => 4 - Math.round(S.open * 4);
const drawing = () => {
  const motor = S.mode === "drive" ? 4 : 0;
  const moving = S.mode === "walk" ? 4 : 0;
  return (motor * 0.18 * 6 + ((8 - moving) * 0.012 + moving * 0.45) * 6 + 0.48) / 0.88;
};

function step(dt) {
  S.boot = Math.min(1, S.boot + dt * 3);
  // the brake servo takes 0.35 s to pull a collar clear, and springs back faster
  const wantOpen = S.mode === "drive" ? 1 : 0;
  const rate = wantOpen > S.open ? dt / 0.35 : dt / 0.18;
  S.open = Math.max(0, Math.min(1, S.open + Math.sign(wantOpen - S.open) * rate));
  // wheels
  const wantSpeed = S.mode === "drive" ? S.speed : 0;
  const target = (wantSpeed / 1000) * 60 / (Math.PI * (M.wheelD / 1000));   // rpm
  const omega = (target * Math.PI * 2) / 60;                                // rad/s
  S.spin += omega * dt;
  // walk clock
  if (S.mode === "walk") S.phase = (S.phase + dt / D.walkSeconds) % 1;
  const phase = Math.floor(S.phase * D.gait.length) % D.gait.length;
  S.phaseIdx = phase;
  // the pack drains with the draw
  S.pack = Math.max(6.4, S.pack - (drawing() * dt) / 600);
  return { phase };
}

function draw(state) {
  const pose = ridePose();
  bodyShift(S.mode === "stow" ? POSES[6].dz : pose.dz);
  placeCollars();
  placeLegs();
  placeMarks();
  const locked = brakes();
  const speedNow = S.mode === "drive" ? S.speed : 0;
  text("[data-r-dogs]", `${locked}/4`);
  text("[data-r-hip]", `${Math.round(hipHeight())} mm`);
  text("[data-r-tilt]", `${f1(S.tilt)}°`);
  text("[data-r-rpm]", `${Math.round((speedNow / 1000) * 60 / (Math.PI * (M.wheelD / 1000)))} rpm`);
  text("[data-r-pack]", `${f2(S.pack)} V`);
  text("[data-r-draw]", `${f2(drawing())} A`);
  const lasts = S.mode === "drive" ? M.runtime.drive : S.mode === "walk" ? M.runtime.walk : M.runtime.stand;
  text("[data-r-lasts]", `${Math.round(lasts)} h`);
  text("[data-r-ride]", `${Math.round(hipHeight())} mm`);
  text("[data-r-speed]", `${f2(speedNow / 1000)} m/s`);
  text("[data-r-steer]", Math.abs(S.steer) < 6 ? "straight" : `${S.steer > 0 ? "right" : "left"} ${Math.abs(Math.round(S.steer))}`);
  for (const dot of stage.querySelectorAll("[data-brake-dot]")) dot.toggleAttribute("data-on", S.open < 0.5);
  for (const button of document.querySelectorAll("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === S.mode));
  const brakeBtn = document.querySelector("[data-brake]");
  if (brakeBtn) brakeBtn.setAttribute("aria-pressed", String(S.open < 0.5));
  stage.dataset.mode = S.mode;
  stage.toggleAttribute("data-pose", atlasOn());
  stage.toggleAttribute("data-stow", S.mode === "stow");
  text("[data-app-state]", `${T()[S.mode]} · brake ${locked}/4`);
  const words = `${T()[S.mode]} · ${T().brakes} ${locked}/4 · ${T().ride} ${Math.round(hipHeight())} mm · ${f2(speedNow / 1000)} m/s`;
  if (readout && readout.textContent !== words) readout.textContent = words;
}

let frame = 0;
let previous = 0;
let visible = true;
function tick(now) {
  const dt = previous ? Math.min((now - previous) / 1000, 1 / 30) : 1 / 60;
  previous = now;
  draw(step(dt));
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { previous = 0; frame = requestAnimationFrame(tick); } };

// ---------------------------------------------------------------- controls
function setMode(mode) {
  S.mode = mode;
  if (mode === "stand" || mode === "stow") S.speed = 0;
  const said = { stand: T().standSet, drive: T().driveSet, walk: T().walkSet, stow: T().stowSet }[mode];
  if (status) status.textContent = said;
  const speedInput = document.querySelector("[data-speed]");
  if (speedInput && mode !== "drive") { speedInput.value = "0"; S.speed = 0; }
  run();
}
for (const button of document.querySelectorAll("[data-mode]")) button.addEventListener("click", () => setMode(button.dataset.mode));
const cycle = document.querySelector("[data-cycle]");
if (cycle) cycle.addEventListener("click", () => {
  const order = ["stand", "drive", "walk", "stow"];
  setMode(order[(order.indexOf(S.mode) + 1) % order.length]);
});
const brakeBtn = document.querySelector("[data-brake]");
if (brakeBtn) brakeBtn.addEventListener("click", () => {
  if (S.open < 0.5) { setMode("drive"); S.speed = 0; } else { setMode("stand"); }
  if (status) status.textContent = S.open < 0.5 ? T().brakeOff : T().brakeOn;
});
const rideInput = document.querySelector("[data-ride]");
if (rideInput) rideInput.addEventListener("input", () => {
  S.ride = Number(rideInput.value) === 0 ? 0 : Number(rideInput.value) === 1 ? -1 : 1;
  if (status) status.textContent = T().heightSet;
  run();
});
const speedInput = document.querySelector("[data-speed]");
if (speedInput) speedInput.addEventListener("input", () => {
  S.speed = Number(speedInput.value);
  if (Math.abs(S.speed) > 1 && S.mode !== "drive") setMode("drive");
  run();
});
const steerInput = document.querySelector("[data-steer]");
if (steerInput) steerInput.addEventListener("input", () => { S.steer = Number(steerInput.value); run(); });
const levelBtn = document.querySelector("[data-level]");
if (levelBtn) levelBtn.addEventListener("click", () => {
  S.level = !S.level;
  levelBtn.setAttribute("aria-pressed", String(S.level));
  S.tilt = S.level ? 0 : S.tilt;
  if (status) status.textContent = S.level ? T().levelOn : T().noLink;
  run();
});

// keyboard: 1-4 pick a mode, arrows drive, space cycles
addEventListener("keydown", (event) => {
  const k = event.key;
  if (k === "1") setMode("stand");
  else if (k === "2") setMode("drive");
  else if (k === "3") setMode("walk");
  else if (k === "4") setMode("stow");
  else if (k === "ArrowLeft" || k === "ArrowRight") {
    S.steer = Math.max(-60, Math.min(60, S.steer + (k === "ArrowRight" ? 10 : -10)));
    if (steerInput) steerInput.value = String(S.steer);
    run();
  } else if (k === "ArrowUp" || k === "ArrowDown") {
    S.speed = Math.max(-250, Math.min(250, S.speed + (k === "ArrowUp" ? 50 : -50)));
    if (speedInput) speedInput.value = String(S.speed);
    if (S.mode !== "drive") setMode("drive");
    run();
  } else if (k === " ") { setMode(S.mode === "drive" ? "stand" : "drive"); event.preventDefault(); }
});

// the drawing itself: a wheel locks or releases, the phone cycles the mode
front.addEventListener("click", (event) => {
  const group = event.target.closest(".it");
  if (!group) return;
  const name = group.dataset.name ?? "";
  if (/\.tyre$|\.hub$|\.collar$/.test(name)) brakeBtn?.click();
  else if (name.startsWith("phone.") || name.startsWith("dock.")) cycle?.click();
});

// ---------------------------------------------------------------- the drawer
const panels = [
  { key: "parts", button: ".pt-parts-btn" },
  { key: "cost", button: ".pt-cost-btn" },
  { key: "app", button: ".pt-app-btn" },
  { key: "sizes", button: ".pt-size-btn" },
];
const open = () => (drawer ? drawer.dataset.panel : "");
let sizeControl = null;
function openPanel(name) {
  const on = Boolean(drawer && name && open() !== name);
  if (drawer) {
    if (on) drawer.dataset.panel = name;
    else delete drawer.dataset.panel;
    drawer.toggleAttribute("data-open", on);
  }
  document.body.toggleAttribute("data-pt-drawer", on);
  for (const panel of panels) {
    const button = stage.querySelector(panel.button);
    if (button) button.setAttribute("aria-pressed", String(on && name === panel.key));
  }
  const title = drawer ? drawer.querySelector("[data-drawer-title]") : null;
  if (title) title.textContent = on ? T()[`${name}Title`] : "";
  stage.classList.toggle("pt-showparts", on && name === "parts");
  if (sizeControl) sizeControl.toggle(on && name === "sizes");
  if (!on) clearLeader();
  if (status) status.textContent = on ? T()[`${name}Title`] : "";
  run();
}
if (drawer) {
  drawer.querySelector("[data-drawer-close]").addEventListener("click", () => openPanel(""));
  for (const panel of panels) {
    const button = stage.querySelector(panel.button);
    if (button) button.addEventListener("click", () => openPanel(open() === panel.key ? "" : panel.key));
  }
}
addEventListener("keydown", (event) => {
  const k = event.key;
  if (k === "c" || k === "C") openPanel(open() === "parts" ? "" : "parts");
  else if (k === "x" || k === "X") openPanel(open() === "cost" ? "" : "cost");
  else if (k === "a" || k === "A") openPanel(open() === "app" ? "" : "app");
  else if (k === "s" || k === "S") openPanel(open() === "sizes" ? "" : "sizes");
  else if (k === "Escape") openPanel("");
});

// ---------------------------------------------------------------- zoom
const ZOOM = [1, 1.25, 1.5, 2];
let zoomIndex = 0;
const zoomLevel = stage.querySelector("[data-zoom-level]");
function setZoom(index) {
  zoomIndex = Math.max(0, Math.min(ZOOM.length - 1, index));
  document.documentElement.style.setProperty("--pt-zoom", String(ZOOM[zoomIndex]));
  if (zoomLevel) zoomLevel.textContent = `${Math.round(ZOOM[zoomIndex] * 100)}%`;
}
for (const button of stage.querySelectorAll(".pt-zoom")) button.addEventListener("click", () => setZoom(zoomIndex + Number(button.dataset.zoom)));
addEventListener("keydown", (event) => {
  if (event.key === "+" || event.key === "=") setZoom(zoomIndex + 1);
  else if (event.key === "-" || event.key === "_") setZoom(zoomIndex - 1);
});
setZoom(0);

// ---------------------------------------------------------------- the parts study
const leader = stage.querySelector("[data-leader]");
const leaderPath = leader ? leader.querySelector("[data-leader-path]") : null;
let leaderRow = null;
function clearLeader() {
  if (!leader || !leaderPath) return;
  leader.removeAttribute("data-on");
  leaderPath.setAttribute("d", "");
  if (leaderRow) leaderRow.classList.remove("pt-part-on");
  leaderRow = null;
  for (const badge of stage.querySelectorAll(".pt-badge")) badge.removeAttribute("data-on");
}
function showLeader(row) {
  if (!leader || !leaderPath || !row) return;
  clearLeader();
  leaderRow = row;
  row.classList.add("pt-part-on");
  const badge = stage.querySelector(`.pt-badge[data-item="${row.dataset.item}"]`);
  if (badge) badge.setAttribute("data-on", "");
  const from = row.getBoundingClientRect();
  const target = badge ? badge.querySelector("circle") : null;
  if (!target) return;
  const point = front.createSVGPoint();
  point.x = Number(target.getAttribute("cx"));
  point.y = Number(target.getAttribute("cy"));
  const screen = point.matrixTransform(front.getScreenCTM());
  const box = stage.getBoundingClientRect();
  const x0 = from.left - box.left;
  const y0 = from.top + from.height / 2 - box.top;
  const x1 = screen.x - box.left;
  const y1 = screen.y - box.top;
  leader.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  leaderPath.setAttribute("d", `M${x0.toFixed(1)} ${y0.toFixed(1)}L${(x0 + 22).toFixed(1)} ${y0.toFixed(1)}L${(x1 - 10).toFixed(1)} ${y1.toFixed(1)}`);
  leader.setAttribute("data-on", "");
}
for (const row of stage.querySelectorAll(".pt-parts li")) {
  row.addEventListener("mouseenter", () => showLeader(row));
  row.addEventListener("mouseleave", clearLeader);
  row.addEventListener("blur", clearLeader);
}
for (const group of front.querySelectorAll(".it")) {
  const name = group.dataset.name ?? "";
  const row = stage.querySelector(`.pt-parts li[data-item="${name}"]`);
  if (!row) continue;
  group.addEventListener("mouseenter", () => row.classList.add("pt-part-on"));
  group.addEventListener("mouseleave", () => row.classList.remove("pt-part-on"));
}

// ---------------------------------------------------------------- start
clearLeader();
sizeControl = mountSizes({ stage, front, P, sizes: D.sizes, markLayers: [] });
buildMarks();
if (status) status.textContent = T().standSet;
draw(step(0));
run();

const still = matchMedia("(prefers-reduced-motion: reduce)");
if (still.matches) {
  visible = false;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  draw(step(0.5));
}
still.addEventListener?.("change", (event) => {
  visible = !event.matches;
  if (visible) run();
  else if (frame) { cancelAnimationFrame(frame); frame = 0; }
});
