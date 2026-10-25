# WHEELBOT W1 — assembly

> **Numbers moved.** These pages were written against the one-hinge leg. The machine in
> `figure/` has two 40 mm links per leg, eight MG996R, twelve servo channels, 1.514 kg and a
> 177 x 144 mm contact box. Where a number here disagrees with `SPEC.md`, `SPEC.md` is right;
> `docs/SPEC-CHANGE-two-link-leg.md` lists every edit this needs, file by file.


Everything here can be done at a kitchen table with a 2.5 mm hex driver, a soldering iron, a
multimeter and a printer. There is no machining, no glue-only joint and no part that needs a
second pair of hands except the phone when you test the dock.

The one idea the whole build hangs on: **a six-dog collar on each axle is pushed into a slotted
hub ring by a spring, so the brake is ON with no power.** An SG90 pulls the collar 6 mm out of
the slots to let the wheel roll. Get that one mechanism right on the first leg and the other
three are repetitions.

## 0. Before you start

| Item | Why you need it |
|---|---|
| 2.5 mm hex driver | every M3 in the machine |
| 1.5 mm / 1.4 mm hex or a PH0 driver | M2 servo screws |
| Soldering iron, 0.8 mm solder | N20 leads, microswitch, XT60 |
| Multimeter | the whole first power-up checklist is voltage |
| Small flat pliers | spring ends, microswitch levers |
| 6 mm drill bit, or a 6 mm rod | checking the collar travel (see step 5) |
| Loctite 243 (optional) | the two M4 thumbscrews only |

**Printed or bought.** This document marks every part. Nothing is assumed:

- Printed parts are the arm, the hip bracket, both decks, the battery tray, the hub ring, the
  dog collar, the fork, the dock base, the four rubber feet and the handle. PETG is listed in the
  bill for "brackets, arms, deck, dock" (`bom.mjs`, `petg`); the collar, hub ring and fork are
  printed because the brake is a printed mechanism — its shear check is written against PETG at
  45 MPa (`SPEC.md` line 68). The record says "carry it by the handle" (`SPEC.md` line 85) but does
  not define the handle: print it as a strap off the upper deck, or omit it and carry the deck.
- Everything else — servos, motors, wheels, boards, cells, springs, switches, screws — is bought.
  The full bill with Russian names and AliExpress search strings is in `mechanical/` next to this
  folder, generated from `bom.mjs`.

**Cost.** The bill totals **$100** at the listed prices: $40 electronics and $60
mechanical (`bom.mjs`, all 22 rows, quantity × price, priced 10.2026). `SPEC.md` line 75 quotes
the same bill as "≈ $92" — the row-by-row sum is the number to budget with, and the phone is
not in either figure.

## 1. Print settings

Every printed part, same profile. PETG, because the collar and the dogs run dry against each
other and PLA creeps out of a press fit in a warm room.

| Setting | Value | Applies to |
|---|---|---|
| Material | PETG | all printed parts |
| Layer height | 0.2 mm | all |
| Perimeters | 4 | all |
| Infill | 35 % | all |
| Nozzle / bed | 240 °C / 80 °C | all |
| Supports | only under the dock's jaw and the arm's servo shelf | arm, dock base |
| Orientation | arm flat on its blade, deck faces down, bracket on its cheek | see table |

| Part | Qty | Structural | Orientation note |
|---|---|---|---|
| Arm (blade + motor pad + servo shelf) | 4 | yes | flat on the blade, so layer lines cross the bending load; this is the part that carries the whole stance |
| Hip bracket | 4 | yes | on its cheek; the axle hole must print round, so no supports inside it |
| Lower deck | 1 | yes | flat; the 4 standoff bosses print upward |
| Upper deck | 1 | yes | flat |
| Dock base | 1 | yes | jaws up, supports under the jaw overhang |
| Hub ring (6 slots) | 4 | yes | flat, slots up; check the slots with a fingernail before fitting |
| Dog collar (6 dogs) | 4 | yes | dogs up; the dogs are what the shear check at 0.27 MPa is about |
| Fork | 4 | yes | flat |
| Battery tray | 1 | no | flat; holds 2 × 48 g cells |
| Rubber foot | 4 | no | flat, 9 mm tall, r 7 mm |
| Handle | 1 | no | on its side; the record asks for one but does not shape it |

Print one leg's full set first (one arm, one bracket, one hub ring, one collar, one fork) and
build it before printing the rest. The bill budgets **300 g of PETG** for the machine, which is
enough for one attempt at every part plus one spare arm.

## 2. Heat-set inserts and bosses

The two decks and the four hip brackets take M3 screws. You have two acceptable routes and the
design allows either:

- **Self-tapping into the printed boss** — drill nothing, drive the M3x8 straight in. Use this on
  the decks. The boss is the hole as printed; the first turn cuts its own thread and it holds for
  the handful of assembly cycles this robot needs.
- **M3 heat-set insert** — press in with a soldering iron at 240 °C, set flat and let it cool
  before touching a screw. Use this on the four hip brackets, because those screws come out every
  time you service a leg.

Do not use both in the same hole. Whichever you choose, drive the screw to the point where the
boss seats and **stop**: PETG creeps, and a screw turned "one more quarter" is the usual cause of
a stripped hip bracket two weeks later.

## 3. Lower deck and the four hip brackets

1. Lay the lower deck on the table, top face up. It is 180 × 110 mm, 3 mm thick, and it sits at
   z 80–83 mm in the finished machine.
2. Fit the four hip brackets at x ±60 mm, y ±61 mm. The bracket cheek is at ±56 mm, so the hip
   shaft passes outboard through the cheek and the arm hangs outside it. Left and right brackets
   are mirror images — dry-fit all four before driving any screw.
3. Drive 2 × M3x8 per bracket. Snug, alternating sides so the bracket does not cock.
4. Check the four brackets are square to the deck by eye down the row: the two front axles must
   be parallel to each other, and both parallel to the two rear ones. A bracket that is 1° off
   shows up later as a wheel that scrubs while the robot is standing.

## 4. One leg

Build one complete leg on the bench, off the robot.

1. **Motor.** Push the N20 into the motor pad of the arm, shaft pointing outboard, and fix it with
   its two M2 screws. The N20 is a 12 mm gearbox on a 3 mm D shaft; the flat goes against the
   wheel's grub screw.
2. **Hub ring.** Press the printed slotted hub ring onto the wheel's Ø26 hub. The wheel is a
   commodity Ø48 × 26 mm rubber wheel; the six slots are printed, not moulded, so they are the
   one part you must check by feel — six distinct detents under a fingernail.
3. **Wheel.** Slide the wheel onto the N20 shaft, flat to flat, and tighten the grub screw. The
   wheel is 26 mm wide and the axle is 24 mm above the floor at stance.
4. **Collar.** Slide the dog collar onto the axle inboard of the wheel, dogs facing outboard
   toward the hub ring. It must slide freely along the axle with no rocking.
5. **Fork.** Hook the fork into the collar's groove and fix the SG90 to the arm's servo shelf with
   its two M2 screws. The SG90's arm engages the fork, so the servo's rotation becomes the
   collar's 6 mm of axial travel.
6. **Spring.** Hook the extension spring (0.5 × 5 × 20 mm, 0.5 N/mm) between the arm and the fork
   so it pulls the collar **into** the hub ring. This is the direction that matters: the spring
   engages the brake, the servo releases it. See step 9.
7. **Microswitch.** Fit the KW11 so its lever is pressed by the fork only when the collar is fully
   home. Set it by hand: push the collar in by finger, listen for the click; pull it out 6 mm,
   the click must release. If it clicks halfway, bend the lever, do not move the switch.
8. Repeat for the other three legs. Build all four before fitting them to the brackets — a leg
   that binds is much easier to find on the bench.

## 5. Pressing the collar on and setting the 6 mm travel

This is the measurement that decides whether the brake holds or slips.

| Check | Target | How |
|---|---|---|
| Collar free travel, engaged → released | 6.0 mm | mark the axle, pull the collar out by hand against the spring, measure with calipers |
| Dog engagement depth when seated | 3 mm | dogs fully inside the slots, not half in |
| Brake mean radius | 12 mm | centre of the dog row to the axle centre |
| Dog count | 6 | all six slots filled |
| Spring tension when engaged | 2 N (4 mm of stretch at 0.5 N/mm) | spring hooks, not stretched by hand |

Procedure:

1. Press the collar on with the spring **off**. It must slide the full 6 mm by thumb with light
   pressure and return without help.
2. Set the SG90 to its released position, hook the fork, then hook the spring. The spring now
   holds the collar in.
3. Measure the gap between the collar face and the hub ring face at rest — that is your 3 mm
   engagement plus clearance. Write it on the arm with a marker; you will want it after the third
   leg.
4. Command the brake servo to release and measure again: the change must be 6.0 mm, and the dogs
   must be clear of the slots with the wheel spinning free by hand.
5. If travel is short, the servo horn is one spline off. Reposition the horn, do not lengthen the
   fork.

The brake's numbers, for reference: 6 dogs at 12 mm mean radius, 3 mm engagement, shear on one
dog at motor stall **0.27 MPa** against **45 MPa** for PETG — a factor of roughly 166, which is
why the collar can be printed.

## 6. Centring the hip servos — do this before the horns go on

**This is the step people get wrong**, and it cannot be fixed afterwards without cutting a horn
off. An MG996R is sold with its output shaft wherever the factory left it; if you press a horn on
at that position, "centre" becomes some arbitrary angle and every stance is tilted.

1. Do **not** fit any horn yet. All four MG996Rs are bare, in their brackets, unpowered.
2. Wire only the servos and the PCA9685, and power the 6 V rail. Nothing else.
3. Command all four hip channels to 1500 µs — the mechanical centre. The PCA9685 is a 12-bit,
   50 Hz driver, so the pulse is one value of a 20 ms frame, not a percentage. 1500 µs is the
   standard centre for every analogue hobby servo including the MG996R, but the design record does
   not name a pulse width: if your servos sit visibly off centre at 1500 µs, use their datasheet's
   centre instead, and make the firmware's number match.
4. Let each servo settle. It will rotate to its centre and hold there, humming.
5. **Now** press each horn on with the arm pointing at the stance angle you want, which for this
   machine is the arm that puts the axle on the floor: hip at 88 mm, arm 68 mm, axle at 24 mm —
   a splay of 20° from vertical. Fit the horn at that pose, screw it down.
6. Only now fit the arms to the horns.
7. With all four arms on, command 1500 µs again and check the machine is level on a flat table.
   If one corner is high, its horn is one spline off: take that arm off, move the horn one spline,
   retry.

Why it matters numerically: the four hip servos are the only thing holding the stance, and they
have **9.4 kg·cm at 6 V** against a worst arm moment of **0.157 N·m** — a margin of **2.35×**
with a 2.5× dynamic factor already applied for bumps and landings. A horn fitted off-centre does
not lose you torque, it loses you range: you need the full travel both ways to reach ride heights
between hip 79 and 91 mm.

## 7. Battery tray and the power parts

1. Screw the 2 × 18650 holder to the battery tray with 2 × M3x8. The tray is 80 × 41 × 17 mm and
   hangs under the lower deck at z 63–80 mm.
2. Fix the tray under the lower deck, 4 × M3x8. Check the cells clear the deck by eye — the tray
   is 17 mm deep and the space it lives in is 17 mm.
3. Mount the BMS and the two bucks on the underside of the lower deck with foam tape, not screws.
   A shorted buck against a PETG deck is a fire; keep the boards' undersides on tape.
4. Fit the rocker switch and the 5 × 20 mm fuse holder through the rear face of the lower deck.
   The switch is rated 20 A, the fuse is 5 A. Terminate the pack on an XT60.
5. Leave every lead long enough to reach the upper deck before you cut anything. You will re-cut
   once, not four times.

## 8. Upper deck and standoffs

1. Stand the four 25 mm M3 standoffs on the lower deck's bosses (z 83 → 108 mm) with 4 × M3x8.
2. Drop the upper deck (150 × 90 mm, z 108–111 mm) on and fix with 4 × M3x8 from above.
3. Mount the ESP32, PCA9685, the two TB6612s, the MPU6050 and the PCF8574 on the upper deck with
   foam tape or M2 standoffs. Keep the MPU6050 flat and as close to the deck's centre as you can —
   it is what levels the body, and it reads the deck, not the floor.
4. Before you close anything up, run the wiring per `WIRING.md`. It is much easier with the
   upper deck off the standoffs and in your hand.

## 9. Setting the springs

The spring is the safety system. It is also the only part you can install backwards without
noticing until the robot rolls away down a slope.

| Spring | Value | Source |
|---|---|---|
| Type | extension, 0.5 × 5 × 20 mm | `bom.mjs` `shifter-spring` |
| Rate | 0.5 N/mm | `SPEC.md` line 33 |
| Force engaged | 2 N | `bom.mjs` `shifter-spring` ("2 N hold the brake engaged with no power") |
| Stretch at that force | 4 mm | 2 N ÷ 0.5 N/mm |
| Travel it must allow | 6 mm | `SPEC.md` line 34 |

1. Hook the spring with the collar **engaged** (spring relaxed to its installed length, giving
   2 N). Do not pre-stretch it by hand to reach the hook — if it only reaches when stretched,
   the hook is in the wrong hole.
2. Pull the collar out 6 mm by hand: the spring must extend by 6 mm and still be inside its
   elastic range. A 20 mm spring stretched to 10 mm extra is at the end of its travel; if yours
   is, the spring has already been stretched once and is scrap.
3. Test each leg: with the servo unpowered, press the wheel hard toward the leg — it must not
   move. That is the brake doing its job with no current anywhere in the machine.
4. Fit the four rubber feet (9 mm tall) under the lower deck at the same time. The STOW pose rests
   the body on them, deck bottom at 9 mm.

## 10. Dock and phone

1. Fix the turret base to the upper deck at the deck centre, ring of four M3 screws. The dock sits on
   the platter **square to the machine**: the camera island faces +x, the direction of travel, and
   the screen faces back. The pan servo drives a pinion on the platter's ring gear through ±70°.
   the person in front of the robot.
2. Line the jaws with foam and hook tape. The jaws are what hold a 74 × 8.5 × 158 mm phone; the
   fit is foam, not a clamp, so the phone goes in and out by hand.
3. Set the tilt with the two M4 thumbscrews and nip them. This is the only fastener in the machine
   that benefits from a drop of Loctite.
4. Run the 0.3 m right-angle USB-C cable up through the dock and into the phone's socket. The
   angled plug lives in the dock, the straight end goes to the MP1584's 5 V output.
5. Phone bottom sits at z 116 mm and the screen face 5.5 mm outboard (`SPEC.md` line 25, "screen
   outboard at n 5.5"). Overall the machine is 214 × 182 × 274 mm with a 158 mm phone in it.

## 11. The wiring harness, in order

Full pin map and connector list are in `WIRING.md`. Build in this order; each step is testable
before the next one starts.

| Order | Harness | Test before moving on |
|---|---|---|
| 1 | Pack → XT60 → fuse → switch | continuity through the switch, fuse fitted |
| 2 | Switch → SZBK07 input, MP1584 input | 7.4 V at both inputs |
| 3 | SZBK07 output → 6 V rail, set to 6.0 V **before** any servo is connected | 6.0 V no-load |
| 4 | MP1584 output → 5 V rail, set to 5.0 V | 5.0 V no-load |
| 5 | 5 V → ESP32, PCA9685 VCC, PCF8574, MPU6050 | ESP32 boots, I2C scan sees three devices |
| 6 | 6 V → PCA9685 V+ (servo rail), TB6612 VM | 6.0 V at the servo rail with all four servos connected |
| 7 | I2C: SDA 21, SCL 22, all three boards | addresses 0x40, 0x68, 0x20 |
| 8 | Servo signals: four hip, four brake | one channel at a time, see step 6 |
| 9 | Motor leads: four N20 → two TB6612 | wheels turn the way the firmware thinks they do |
| 10 | Microswitches → PCF8574 | four bits change, none floating |
| 11 | Battery sense (100k/100k), mode button, buzzer | pack voltage reads correctly |
| 12 | USB-C to the phone | phone charges, BLE connects |

Two rules while you do it: **all grounds meet at the bucks' output terminals, not at the
boards**, and keep the four motor leads twisted and routed away from the I2C pair. The I2C bus
runs at hobby speed but a stalled N20 will still corrupt it if the wiring is lazy.

## 12. Screws and torque

The design record gives screw sizes, not torque figures, so this table does not invent any: every
joint here is "drive until the part seats, then stop". If you own a torque driver, 0.3 N·m is
plenty for an M3 in PETG and 0.1 N·m for an M2 — those are material limits, not record numbers,
so treat them as a ceiling, not a target.

| Fastener | Where | Count | Source |
|---|---|---|---|
| M3x8 | upper deck → 4 standoffs | 4 | `SPEC.md` line 22 (4 × 25 mm M3 standoffs) |
| M3x8 | 4 standoffs → lower deck | 4 | same |
| M3x8 | hip bracket → lower deck | 8 (2 each) | §3, counted from the bracket's two cheeks |
| M3x8 | battery tray → lower deck | 4 | §7 |
| M3x8 | battery holder → tray | 2 | §7 |
| M2 | N20 → arm motor pad | 8 (2 each) | counted from the motor's own holes |
| M2 | SG90 → servo shelf | 8 (2 each) | counted from the servo's ears |
| M2 | MG996R → hip bracket flange | 16 (4 each) | counted from the servo's flange |
| horn screw | MG996R / SG90 output | 8 | supplied with the servo |
| M4 thumbscrew | dock tilt | 2 | `bom.mjs` `knob`, qty 2 |
| 5 × 20 mm fuse | fuse holder | 1 | `bom.mjs` `power` |
| M3 nut / washer | as required by the bracket cheeks | — | `bom.mjs` `hardware` kit |

The `hardware` line in the bill is one assorted M2/M3 kit with 25 mm standoffs — buy the kit, do
not try to source 40 individual screws.

## 13. First power-up checklist

Do this with the robot on a table, wheels off the ground, and the phone **out** of the dock.

| # | Check | Pass | If it fails |
|---|---|---|---|
| 1 | 6.0 V rail, no servos moving | 6.0 V ±0.1 | adjust the SZBK07 pot before connecting servos |
| 2 | 5.0 V rail | 5.0 V ±0.1 | adjust the MP1584 before connecting the ESP32 |
| 3 | I2C scan | 0x40, 0x68, 0x20 | one board's SDA/SCL swapped |
| 4 | No servo buzz at rest | silence | horn fitted off-centre, or a channel commanded off 1500 µs |
| 5 | All four brake switches closed in STAND | 4/4, mask = 0x0F | a fork not pushing its lever; see step 4.7 |
| 6 | Brake release, one leg at a time | wheel spins free, 6.0 mm travel | horn spline, or spring hooked backwards |
| 7 | Brake engage, power removed | wheel locked, no current drawn | spring not seated |
| 8 | Battery sense | pack mV within 0.2 V of a multimeter on the XT60 | divider wiring |
| 9 | Motors, one at a time at low speed | correct wheel, correct direction | swap the two motor leads |
| 10 | Mode button | cycles STAND → DRIVE → STOW | GPIO 4 not wired, or debounce |
| 11 | BLE | phone sees the service `6e400001-…`, gets a 20-byte telemetry frame | RX/TX characteristic swapped |
| 12 | Drop the BLE link | brakes engage within 1 s | firmware link timeout |

Only when all twelve pass, put the phone in the dock and stand the robot on the floor.

## 14. Two numbers in the record that disagree

Worth knowing before you cut anything, because both are load-bearing:

- **Ride height.** `SPEC.md` line 27 and line 60 give the ride height as hip 79–91 mm. Line 80,
  in the Modes section, says "ride height 84–96 mm". Build to **79–91 mm** — it is the figure the
  geometry is derived from, and it is what the arm at 68 mm can actually reach with a 24 mm axle.
  If the firmware's height table turns out to be written against 84–96, the top 5 mm of travel
  will be geometry the arms do not have.
- **Stance splay.** The geometry table says 19.7°, the numbers table says 20°. The difference at
  the wheel is 68 × (cos 19.7° − cos 20°) ≈ 0.12 mm. Either is fine; use 20° and do not chase it.
- **Cost.** `SPEC.md` says ≈ $92, the bill's rows sum to $100. Budget the larger number.
