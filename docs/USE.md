# WHEELBOT W1 — using it

> **Numbers moved.** These pages were written against the one-hinge leg. The machine in
> `figure/` has two 40 mm links per leg, eight MG996R, twelve servo channels, 1.514 kg and a
> 177 x 144 mm contact box. Where a number here disagrees with `SPEC.md`, `SPEC.md` is right;
> `docs/SPEC-CHANGE-two-link-leg.md` lists every edit this needs, file by file.


The machine does three things: stands as a locked table, rolls, and folds up to be carried. The
phone in the dock is the entire interface — there is no remote, no app to install and no switch
for anything except power and mode.

Read this once before you switch it on. The one behaviour that surprises people is that the brake
is **on** unless something is actively holding it off, so the robot is safe with the power off and
will not free-wheel down a ramp when the battery dies.

## 1. Switching on and pairing

1. Put the phone in the dock: bottom edge at z 116 mm, screen facing out, angled 45° toward you.
2. Plug the right-angle USB-C into the phone. The dock's plug is fixed; the cable is 0.3 m.
3. Switch on. The buzzer is the only self-check signal before the phone connects — it is wired for
   low battery and brake fault (`SPEC.md` line 101), so a brake fault at power-up is the one to
   listen for.
4. Open the app — one HTML file, no install — and pick the robot from the browser's Bluetooth
   chooser. It advertises as **WHEELBOT-W1** with the service
   `6e400001-b5a3-f393-e0a9-e50e24dcca9e`; the firmware's characteristics are `…002` (write) and
   `…003` (notify).
5. The app writes to characteristic `…002` and subscribes to `…003`. Frames are a fixed 12 bytes,
   little endian; telemetry comes back in 20 bytes. You do not have to care unless you are writing
   your own client — but you do have to accept the browser's Bluetooth permission once per session.
6. Wait for telemetry before touching anything. The screen shows mode, brake mask, ride height,
   pitch, roll, pack voltage, current, four wheel speeds and faults. If the pack voltage is not
   there, the app is paired to something else.

**The phone must stay in the dock.** The link is the control path; there is no fallback. Pull the
phone out and the robot brakes within one second, which is the correct behaviour and the reason
the brake is spring-engaged.

## 2. The three modes

| Mode | App label | What the machine is doing | When to use it |
|---|---|---|---|
| STAND | Стоять (Stand) | All four dog clutches engaged by their springs; the four wheels are feet; the four MG996Rs hold a level body. No current in the brake servos. | Default. Any time it is not moving. On a table, on a shelf, in a photo. |
| DRIVE | Ехать (Drive) | The four SG90s pull the forks back 6 mm against their springs; the collars clear the slots; the four N20s drive. Skid steer — differential speed, spin in place. | Flat hard floor. Short bursts on carpet. |
| STOW | Сложить (Stow) | Arms swing up 36°, brakes engaged, body rests on the four rubber feet under the lower deck. | Carrying it. Lift by the handle, not by a leg. |

Ride height inside STAND is adjustable across hip 79–91 mm, which drops or raises the body by
68·cos θ − 64 mm at the arm angle you pick. Higher is better for carpet, lower is better for
filming close to the floor.

Why you should not leave it in DRIVE on a slope: DRIVE means the brakes are released and the
motors are the only thing holding position. The N20 has a gearbox and will mostly hold, but it is
not the brake and it is not rated for it.

## 3. What the four brake dots mean

The screen shows four dots, one per leg, front-left to rear-right, lit when that leg's bit is set
in the brake mask. They are the four KW11 microswitches on the forks, read through the I2C
expander — not a guess by the firmware.

| Dots | Meaning | What to do |
|---|---|---|
| 4 lit | All four dogs seated. The wheels are feet. | Nothing. This is the state you want. |
| 3 lit, 1 dark | That leg's dog is not in its slot. The firmware will refuse STAND. | Look at that leg. Usually a stretched spring — see §8. |
| All dark, in DRIVE | Normal — the brakes are released on purpose. | Nothing. |
| All dark, not in DRIVE | No switch reads engaged. | A microswitch lead, or the expander lost its ground. |
| Dots change while you handle it | The fork levers are being knocked as you lift the machine. | Set it down and let the mask settle; the switches are doing their job. |

The firmware checks for 4/4 before it admits to STAND. If the robot refuses to stand and the dots
say 3, believe the dots.

## 4. Levelling on a slope

The MPU6050 sits on the upper deck and reads the body, not the floor. Front legs against rear
legs set pitch; left against right set roll. The range is **±9 mm at the hip**, which is
**±7.6°** of body tilt — enough for a book under one wheel, not enough for a staircase.

1. Put the robot down in STAND on the surface. Let it settle for a second — the IMU is averaged
   and does not like being dropped.
2. Turn levelling on (flag bit 1 of the mode frame). The hips trim themselves from the IMU.
3. If it settles level but rotated in yaw, that is not levelling — yaw is a drive command, or the
   dock's angle. Levelling only touches pitch and roll.
4. To trim by hand, use the trim frame: hip index 0–3 and an angle offset in signed degrees. This
   is per-leg and persists only as long as the firmware's trim table does.
5. On a real slope, the under-body side sits lower and the wheels on that side carry more load.
   The arm moment the hip servos can take was sized for 0.157 N·m at 36° with 0.5 N of traction —
   a 7.6° trim on flat ground is well inside that. A wedge under two wheels is not.

There is no self-levelling while driving. DRIVE is a skid-steer mode with the brakes off; expect
the body to follow the floor.

## 5. Filming with the dock

The dock is the camera mount; that is what the 45° yaw is for.

| Control | What it does | Number |
|---|---|---|
| Dock yaw | Fixed at 45°, so the screen faces the person in front of the robot | 45° |
| Dock tilt | Two M4 thumbscrews on the base — loosen, tilt, nip | 2 screws |
| Phone seat | 74 × 8.5 × 158 mm phone, foam jaws, no clamp | phone bottom at z 116 |
| Height | Ride height in STAND, hip 79–91 mm | body bottom 71–83 mm |
| Speed for a tracking shot | Half the speed range is 0.25 m/s; full is 0.503 m/s | Ø48 at 200 rpm |

Practical notes:

- **Filming while driving costs battery.** The phone charges from the 5 V rail at about 0.5 A, and
  the machine does 2.6 h driving *while* charging it. Filming with the screen on and the camera
  running is heavier than the app alone; expect closer to the driving figure than the standing one.
- **Stills on a slope:** put it in STAND, level it, and it will hold the pose with the brakes
  engaged and no servo current. That is a tripod that cannot sag when a servo overheats, because
  the pose is held by friction dogs, not by the servos.
- **Low shots:** drop to the lowest ride height before you frame. The dock yaw does not change
  with height, so you can re-frame by rotating the robot, not by moving the phone.
- **Do not hand-hold the robot with the phone in the dock** to "just get the angle". The jaws are
  foam and the phone is 158 mm of lever.

## 6. Battery care

The pack is 2 × 18650 at 3500 mAh, 2S, 25.9 Wh, with a 20 A BMS that cuts off on over-discharge
and balances the cells.

| Situation | Runtime | Source of the number |
|---|---|---|
| Driving, charging the phone | 2.6 h | `SPEC.md` line 71, 9.8 W from the pack |
| Driving, phone on its own battery | 3.9 h | `SPEC.md` line 72 |
| Standing, brakes locked | 21 h | `SPEC.md` line 73, 1.2 W |
| Peak | 3.0 A average at 6 V | `SPEC.md` line 74 |

Rules:

- **Store at about half charge — 7.4 V on the pack, 3.7 V per cell.** The pack's nominal is
  7.4 V for 25.9 Wh at 3.5 Ah, which is exactly 3.7 V per cell. Full is 8.4 V and a full pack left
  in a drawer for a season is a pack you will replace. Do not store it flat either; the BMS's
  over-discharge cut-off is a protection, not a storage strategy.
- **The brake holds with no power, so storage is safe.** The springs push the dogs into the hubs;
  the SG90s are the only thing that ever opens them and they are unpowered when the switch is off.
  A pack that self-discharges to nothing leaves the robot standing on four locked wheels, which is
  the whole point of the mechanism.
- **21 hours of standing is the number for a locked robot, not an idle one.** If the buzzer beeps
  and the pack reads low while the machine is doing nothing, the brake servos are buzzing — they
  should be silent at rest. The 1.2 W standing figure in `SPEC.md` line 73 does not budget for
  four servos holding a position they should have been unpowered in.
- The BMS is 20 A and the fuse is 5 A. The fuse is the part that protects the wiring; the BMS
  protects the cells. Do not bypass either to "get more power out of it" — the machine's peak is
  6.6 A with all four motors stalled, and the buck is 8 A, so the electrics are already sized for
  more than the mechanics want.

## 7. Storage and carrying

- **STOW before you pick it up.** Arms up 36°, brakes engaged, body on the four rubber feet, deck
  bottom at 9 mm. Carry by the handle.
- Do not carry it by an arm. Each arm carries a motor, a wheel, a clutch and a servo, and the arm
  is the part that holds the entire stance.
- It is 214 × 182 × 274 mm with a 158 mm phone in it, and 1.195 kg with a 200 g phone. It fits on
  a shelf; it does not fit in a coat pocket.
- Remove the phone if you are transporting it in a bag. The dock holds it with foam.

## 8. Failure modes you will actually meet

| Symptom | What is happening | What to do |
|---|---|---|
| Slows down and the buzzer beeps on carpet | Battery sag. Carpet is the worst load in the machine's life: four motors, high rolling resistance, and a 5 A fuse that is closer to the limit than on a hard floor. | Drive on hard floor, or accept shorter runs. Charge before the sag starts, not after. |
| One dot hollow, robot refuses STAND | The dog is not seating. The usual cause is a **stretched spring**: 0.5 N/mm is a soft spring and a 20 mm one that has been over-extended once will no longer pull the collar home. Second cause is a fork that has slipped one tooth on the servo horn. | Press the collar in by hand. If it seats and the dot fills, the spring is the fault — replace it, do not stretch it back. If it does not seat by hand, the horn has slipped: re-centre per `ASSEMBLY.md` §6. |
| Robot brakes in the middle of a drive | BLE link lost. The firmware brakes automatically after **more than 1 s** without a frame. | Move the phone closer, or check that the phone has not locked its screen — a locked browser tab stops sending. This is the safety system working. |
| Robot brakes and will not re-enter DRIVE | It is refusing because a brake switch does not read engaged; the firmware will not release brakes it cannot confirm. | Look at the dots. See the row above. |
| One wheel spins but the robot pivots oddly | A dog pair not engaging on one side, so that wheel is dragging. | Lift that corner; the wheel should be locked in STAND. If it turns by hand, the clutch is not seating. |
| Everything dead, nothing beeps | Fuse, or the BMS cut off. | Meter the XT60. If the pack reads low, the BMS did its job — charge it. |
| Servos buzz at rest | A horn fitted off-centre, or a channel not at 1500 µs. | It will hold, but it draws current and heats. Re-centre per `ASSEMBLY.md` §6. |
| Phone does not charge | The 5 V rail is loaded: ESP32, logic and the phone share a 3 A buck. | Unplug the phone, check 5.0 V, plug it back. Do not add loads to the 5 V rail. |
| It drives, but the app shows no telemetry | Subscribed to the wrong characteristic, or the CRC of your frames is wrong (CRC16-CCITT over bytes 0–7). | Reconnect; the nonce in bytes 4–7 must come back in the ack. |

## 9. Limits worth knowing

- **Not waterproof.** Nothing in the bill is sealed, and the brake is an open sliding joint.
- **Carpet is a load, not a surface.** 6.6 A stall on four motors against a 5 A fuse.
- **No self-righting.** If it goes over, pick it up. The arms have one hinge each and no
  parallelogram, so a leg on its side is a leg with a wheel pointing sideways.
- **The trim is per-leg and in degrees, not millimetres.** ±9 mm of hip travel is ±7.6° of body
  tilt; asking for more than that does not level the robot, it just runs the servo into its stop.
- **The BLE link has no pairing step in the design record.** While it is on and in range, anything
  that knows the service UUID is a potential master. Treat it as a bench robot.
