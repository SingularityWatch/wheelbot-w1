// The robot's arithmetic: millimetres and SI. Nothing here is drawn — this module is the one
// place the numbers live, and both the figure (build.mjs) and the page (live.js, through
// DATA.model) read it.
//
// THE LEG. Two links of 40 mm. The thigh leaves the hip at 45° and the shin hangs vertical
// from the knee, so the ankle sits 28 mm forward of the hip and 68 mm below it: the wheel
// lands on the floor with the hip at 92 mm. Bend the knee and the foot lifts — that is the
// walking gait. Fold both links for STOW and the whole leg swings clear of the floor.
//
// THE BRAKE. A six-dog collar on every hub, pushed into the wheel's slots by a spring, so the
// brake is engaged with no power at all; an SG90 pulls it 3 mm clear to roll.

// ---------------------------------------------------------------- geometry, mm
export const WHEEL = { d: 48, r: 24, w: 12, hub: 34 };
export const LEG = { a: 40, b: 40, hipZ: 92, hipX: 60, hipY: 58, thighW: 24, shinW: 30 };
export const DECK = { lower: { x: 180, y: 110, t: 3, z: 92 }, upper: { x: 150, y: 90, t: 3, z: 120 }, standoff: 25 };
export const DOCK = {
  yaw: 90,           // turret angle: local +y (the screen) maps to world -x, so the cameras face +x
  centre: { x: 0, y: 0 },
  phone: { w: 74, h: 158, t: 8.5 },
  bottom: 128,
};
/** The pan turret the dock stands on. yaw 0 = cameras dead ahead, along +x. */
export const TURRET = { base: 74, platter: 60, plate: 6, range: 70, rate: 45, servo: "SG90" };
export const FOOT = { h: 9, r: 7 };
export const BATT = { x: 40, y: 20.5, z0: 75, h: 17 };

/** Ankle of one leg, measured from the hip: x forward, z up (so z is negative below). */
export const ankle = (hipDeg, kneeDeg) => {
  const a = (hipDeg * Math.PI) / 180;
  const b = (kneeDeg * Math.PI) / 180;
  return { x: LEG.a * Math.sin(a) + LEG.b * Math.sin(b), z: -(LEG.a * Math.cos(a) + LEG.b * Math.cos(b)) };
};
/** Hip height that puts the ankle on the axle line at this leg pose. */
export const hipFor = (hipDeg, kneeDeg) => WHEEL.r - ankle(hipDeg, kneeDeg).z;

// ---------------------------------------------------------------- the pose library
// `ground` poses are the ones the robot can carry its weight in: dz is whatever keeps the
// wheels on the floor. Swing poses lift the foot and ride the dz of the pose beside them.
const P = (name, hip, knee, ground = true) => ({ name, hip, knee, ground });
export const POSES = [
  P("stance", 45, 0),          // 0 — the pose the figure is drawn in
  P("lift", 52, 26, false),    // 1 — foot up
  P("reach", 62, 10, false),   // 2 — foot up and forward
  P("crouch", 58, 26),         // 3 — body low
  P("tall", 36, -8),           // 4 — body high
  P("push", 34, 6),            // 5 — leg extended
  P("stow", 128, 40),          // 6 — folded for carrying
];
export const STANCE = POSES[0];
for (const pose of POSES) {
  // a ground pose sets dz so the wheels stay on the floor; a swing pose keeps the hip put and
  // lets the bent knee carry the foot up
  pose.dz = !pose.ground ? 0 : pose.name === "stow" ? -(DECK.lower.z - FOOT.h) : WHEEL.r - (LEG.hipZ + ankle(pose.hip, pose.knee).z);
}
/**
 * A statically stable crawl, which is the only gait this machine can honestly use: the wheels are
 * locked (the dog clutches are engaged) so each foot is a rigid point, and with no ankle and no
 * balancing wheel there is nothing to catch the body if a diagonal pair leaves the floor. So one
 * foot swings at a time, duty factor 0.75, in the lateral sequence real quadrupeds walk in:
 * left hind, left fore, right hind, right fore.
 *
 * The hip sweeps +-18 deg about the 45 deg stance, which moves the ankle 18 mm along the ground;
 * the knee bends 26 deg during the swing, lifting the foot 11.5 mm. Slow on purpose: 18 mm per
 * step at 0.75 duty on a 1.6 s cycle is 15 mm/s. Driving is 500.
 */
export const WALK = {
  duty: 0.75,
  period: 1.6,
  stride: 42,   // the whole leg turns about the hip, so the ankle swings 42 mm, not 18
  lift: 11.5,
  hipSweep: 18,
  kneeSwing: 26,
  order: { rl: 0, fl: 0.25, rr: 0.5, fr: 0.75 },   // lateral sequence
  speed: 35,                                        // mm/s: 42 mm per step at 0.75 duty on 1.6 s
};
const frac = (v) => v - Math.floor(v);
const smooth = (t) => t * t * (3 - 2 * t);

/** One instant of the crawl: per-leg hip/knee, and how far the body shifts over its support. */
export function walkAt(phase) {
  const legs = {};
  const feet = [];
  for (const id of ["fl", "fr", "rl", "rr"]) {
    const u = frac(phase - WALK.order[id]);
    const swing = u >= WALK.duty;
    let hip, knee;
    if (!swing) {
      const t = u / WALK.duty;                    // planted: the foot slides back under the body
      hip = 45 + WALK.hipSweep - 2 * WALK.hipSweep * t;
      knee = 0;
    } else {
      const s2 = (u - WALK.duty) / (1 - WALK.duty);
      hip = 45 - WALK.hipSweep + 2 * WALK.hipSweep * smooth(s2);
      knee = WALK.kneeSwing * Math.sin(Math.PI * s2);
    }
    legs[id] = { hip, knee, lift: swing ? WALK.lift * Math.sin(Math.PI * ((u - WALK.duty) / (1 - WALK.duty))) : 0 };
    const a = (hip * Math.PI) / 180;
    const b = (knee * Math.PI) / 180;
    const x = LEG.a * Math.sin(a) + LEG.b * Math.sin(b);
    feet.push({ id, x, down: !swing });
  }
  // shift the body toward the middle of the three feet that are down, so the centre of mass stays
  // inside the support triangle
  const sup = feet.filter((f) => f.down);
  const meanX = sup.reduce((a2, f) => a2 + f.x, 0) / sup.length;
  const width = { fl: -1, fr: 1, rl: -1, rr: 1 };
  const meanY = sup.reduce((a2, f) => a2 + width[f.id], 0) / sup.length;
  return {
    legs,
    sway: { x: 0, y: -meanY * 26 },
    dz: 0,
  };
}
/** Eight sampled phases, for the pose library the figure and the app both step through. */
export const GAIT = Array.from({ length: 8 }, (_, i) => walkAt(i / 8));

// ---------------------------------------------------------------- mass, grams
export const MASS = {
  "deck.lower": 46, "deck.upper": 28, "standoff": 4 * 3, "bracket": 4 * 22, "thigh": 4 * 18,
  "shin": 4 * 26, "wheel": 4 * 20, "hip-servo": 8 * 55, "brake-servo": 4 * 13, "motor": 4 * 10,
  "clutch": 4 * 8, "dock": 52, "battery": 2 * 48, "holder": 12, "electronics": 84, "harness": 30, "hardware": 46,
};
export const MASS_PHONE = 200;
export const massOf = (phone = MASS_PHONE) => Object.values(MASS).reduce((a, b) => a + b, 0) + phone;
export const MASS_NO_PHONE = massOf(0);

// ---------------------------------------------------------------- the servos
export const G = 9.81;
export const SERVO = { stall: 9.4, volts: 6, mass: 55 };
export const DYNAMIC = 2.5;
/** Moment on one joint: this leg's share of the load at the ankle, plus traction at the contact. */
export function jointMoment(hipDeg, kneeDeg, traction = 0.5, phone = MASS_PHONE) {
  const m = massOf(phone) / 1000;
  const load = (m * G) / 4;
  const a = (hipDeg * Math.PI) / 180;
  const b = (kneeDeg * Math.PI) / 180;
  const an = ankle(hipDeg, kneeDeg);
  const atHip = load * ((LEG.a * Math.sin(a) + LEG.b * Math.sin(b)) / 1000) + traction * ((LEG.hipZ + an.z) / 1000);
  const atKnee = load * ((LEG.b * Math.sin(b)) / 1000) + traction * (WHEEL.r / 1000);
  return { hip: atHip, knee: atKnee, worst: Math.max(atHip, atKnee) };
}
export const servoMargin = (phone = MASS_PHONE) => {
  const worst = Math.max(...POSES.filter((p) => p.name !== "stow").map((p) => jointMoment(p.hip, p.knee, 0.5, phone).worst));
  return (SERVO.stall * 0.0980665) / (worst * DYNAMIC);
};

// ---------------------------------------------------------------- drive
export const MOTOR = { rpm: 200, volts: 6, stallNm: 0.118 };
export const speed = (rpm = MOTOR.rpm) => (Math.PI * WHEEL.d * rpm) / 60000;
export const contact = () => ({
  wheelbase: 2 * (LEG.hipX + Math.abs(ankle(STANCE.hip, STANCE.knee).x)),
  track: 2 * (LEG.hipY + 4 + WHEEL.w / 2 + 4),
});
export const SPIN = 1.2;
export const STEP = { seconds: 0.42, phases: GAIT.length };

// ---------------------------------------------------------------- the brake
export const BRAKE = { dogs: 6, radius: 12, depth: 3, width: 2, travel: 3 };
export const dogShear = () => (MOTOR.stallNm / (BRAKE.radius / 1000)) / (BRAKE.dogs * BRAKE.depth * BRAKE.width);
export const SPRING = { rate: 0.6, preload: 4, engaged: 2.2 };

// ---------------------------------------------------------------- power
export const PACK = { cells: 2, mah: 3500, nominal: 3.7, usable: 0.9 };
export const packWh = () => PACK.cells * PACK.nominal * (PACK.mah / 1000);
export const BUCK = 0.88;
export const LOADS = { motor: 0.18, servoHold: 0.012, servoMove: 0.45, logic: 0.09, sensor: 0.006, phone: 0.5 };
const watts = ({ motors = 0, moving = 0, phone = false }) =>
  motors * LOADS.motor * 6 + ((8 - moving) * LOADS.servoHold + moving * LOADS.servoMove) * 6 + (LOADS.logic + LOADS.sensor) * 5 + (phone ? LOADS.phone * 5 : 0);
const hours = (w) => (packWh() * PACK.usable) / (w / BUCK);
export const RUNTIME = {
  drive: hours(watts({ motors: 4, phone: true })),
  driveOwn: hours(watts({ motors: 4 })),
  stand: hours(watts({})),
  walk: hours(watts({ moving: 4 })),
  peak: watts({ motors: 4, moving: 8, phone: true }) / 6,
};
export const drawOf = (motors, moving, phone) => watts({ motors, moving, phone }) / BUCK;

// ---------------------------------------------------------------- leveling
export const LEVEL = { range: 14, speed: 40 };
export const tiltOf = (mm) => (Math.asin(Math.min(1, mm / (2 * LEG.b))) * 180) / Math.PI;
