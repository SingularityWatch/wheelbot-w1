# WHEELBOT W1 — the phone is the brain, the wheel is the foot

*A four-legged machine built from commodity parts whose wheels are also its feet: a spring-loaded
dog clutch in every hub locks the wheel into the leg so the robot stands on four rigid points, and
a 9 g servo pulls the clutch clear so the same four wheels drive it across the floor.*

![The machine at rest](renders/hero.png)

## The problem with a phone for a brain

A phone already carries the expensive parts of a robot: a camera, an IMU, a screen, a radio, a
battery and a processor that outruns any hobbyist microcontroller. PhoneBot's bet — and this
machine follows it — is that a robot body only has to supply what the phone cannot: a way to move,
and a way to plug in.

## The one mechanism that makes it work

A wheel is a bad foot. It rolls when it should hold. The fix here is a dog clutch inside each hub:

- six slots in the hub, six dogs on a collar riding the axle;
- a **0.6 N/mm spring pushes the collar home**, so the brake engages with *no power at all*;
- a 9 g SG90 pulls the collar 3 mm clear when the robot wants to roll.

That asymmetry is deliberate. A flat battery, a dropped link or a crashed controller leaves the
machine standing, not rolling away. The servos only ever work to *release*.

## Two links per leg, and why it can walk

Each leg is a 40 mm thigh leaving the hip at 45° and a 40 mm shin hanging vertically from the knee,
with the wheel at the ankle. Bending the knee lifts the foot 12 mm — that is the whole gait.

Walking is a **statically stable crawl**, not a trot: with the wheels locked, a foot is a rigid
point, and there is no balancing wheel to catch the body if a diagonal pair leaves the floor. One
foot swings at a time, 0.75 duty factor, in the lateral sequence real quadrupeds use. Rotating the
whole leg about the hip swings the ankle 42 mm, so the stride is 42 mm and the walk is 35 mm/s —
slow on purpose. Driving is 0.50 m/s.

## The phone sits on a pan turret

The dock stands on a printed turret: knurled base ring, an arc slot that mechanically stops the pan
at ±70°, a ring gear, an SG90 with a pinion, two witness marks. The phone is held **cameras
forward**, square to the direction of travel, in an open frame — two rails and a cross member, no
back panel — so the lenses see the road instead of a plate of plastic. The turret is what lets the
same camera look ahead, aside, or back at you.

## Numbers, all computed from one model

| | |
|---|---|
| Mass, no phone / with a 200 g phone | 1.31 kg / 1.51 kg |
| Static load per leg | 3.7 N |
| Worst joint moment | 0.21 N·m — an MG996R has 4.4× margin, 1.8× against a 2.5× dynamic allowance |
| Drive | 4 × N20 6 V 200 rpm → 0.503 m/s on a Ø48 wheel |
| Walk | 42 mm stride, 35 mm/s, 1.6 s cycle |
| Brake | 6 dogs, 12 mm mean radius, 3 mm engagement; shear 0.27 MPa against ~45 MPa PETG |
| Battery | 2S 18650, 3500 mAh, 25.9 Wh |
| Runtime | 2.6 h driving and charging the phone, 19.4 h standing |
| Bill of materials | **$121**, phone excluded |

Every one of those numbers is produced by `figure/model.mjs`; the drawing, the readout in the page,
the BOM total and the 3D export all read it, so they cannot drift apart.

## What is in the box

- `figure/` — a self-contained interactive isometric figure (one HTML file, no dependencies), in
  dark and light, with a parts study, a costed bill of materials, the app mock, the size table, zoom,
  and a live walk cycle.
- `firmware/` — ESP32 (PlatformIO, Arduino framework): state machine STAND/DRIVE/WALK/STOW, PCA9685
  servo channels, TB6612 motor drivers, brake switches read over a PCF8574, IMU levelling, a CRC16
  framed BLE protocol.
- `app/` — the phone side: one HTML file, Web Bluetooth, no install, with a simulator that runs
  without a robot.
- `mechanical/` — OBJ, MTL and STL exported from the same `parts.json` the drawing is built from.
- `docs/` — assembly, wiring, use.
- `blender/` — the render and animation scripts, plus the two checks that keep the rig honest.

## What is not finished

The firmware has never been compiled — there is no ESP32 toolchain on the machine it was written on
— and it still drives four joints where the leg now has eight. The app tops out at ±127 mm/s
because the protocol packs speed into one signed byte. The renders are flat and the phone's screen
carries no interface in 3D. All of it is written down in the README rather than discovered by the
next person.

## Build it

Start with `docs/ASSEMBLY.md`. Buy nothing that is not in the BOM. Check the four brake switches
before the first battery, and keep your fingers out of the wheels when it is powered: the brake is a
spring, and the machine weighs 1.5 kg.
