# WHEELBOT W1 — firmware

ESP32 firmware for the four-legged phone robot in `../../SPEC.md`. The phone is the brain
and talks over BLE; this chip owns the wheels, the brakes, the legs and the fail-safes.

The whole machine rests on one mechanical fact: **the brake is spring-engaged**. A dog
clutch locks every wheel to its leg with no power applied, and the SG90 only ever *pulls*
the fork to release it. So a flat pack, a brown-out, a crashed firmware or a lost phone
leaves the robot standing on four locked wheels instead of rolling away.

> **Status: never built, never flashed, never run.** There was no ESP32 toolchain
> (`platformio`, `arduino-cli`) on the machine this was written on, so the code has been
> reviewed by eye and by script (brace balance, declaration order) but has not been
> through a compiler. Treat the first power-up as a bring-up, not a test — see
> [First power-up](#first-power-up).

---

## Build and flash

```sh
cd firmware
pio run                 # build
pio run -t upload       # flash over USB (hold BOOT if the auto-reset fails)
pio device monitor      # 115200 8N1, gives you the console
```

PlatformIO pulls the toolchain and the four Adafruit libraries listed in `platformio.ini`
on the first build. No WiFi, no OTA, no credentials, nothing to configure before flashing.

Files:

| File | What is in it |
|---|---|
| `src/main.cpp` | the whole firmware: state machine, brakes, motors, levelling, BLE, console, boot |
| `src/pins.h` | every GPIO, I2C address, PCA9685 channel and mechanical constant |
| `src/protocol.h` | frame and telemetry structs, CRC16-CCITT and CRC8, GATT UUIDs |
| `platformio.ini` | board, framework, library pins |

---

## Pin map

### GPIO

| Signal | GPIO | Notes |
|---|---|---|
| I2C SDA | 21 | 400 kHz, 5 ms transaction timeout |
| I2C SCL | 22 | driven by hand for bus recovery if a slave wedges it |
| FL motor PWM / IN1 / IN2 | 25 / 26 / 27 | TB6612 channel A, left module |
| FR motor PWM / IN1 / IN2 | 12 / 13 / 15 | TB6612 channel A, right module — **12 and 15 are strapping pins** |
| RL motor PWM / IN1 / IN2 | 32 / 33 / 14 | TB6612 channel B, left module |
| RR motor PWM / IN1 / IN2 | 16 / 17 / 18 | TB6612 channel B, right module |
| Battery sense | 34 | ADC1, input-only, 100k/100k divider |
| Mode button | 4 | to GND, internal pull-up, active low — **strapping pin** |
| Buzzer | 19 | passive piezo on LEDC channel 4 |
| TB6612 /STBY | — | tie both modules' /STBY to 3V3; set `PIN_TB_STBY` in `pins.h` only if you wire it to a GPIO |

### I2C devices

| Device | Address | Job |
|---|---|---|
| PCA9685 | 0x40 | 8 servo channels at 50 Hz |
| MPU6050 | 0x68 | pitch/roll |
| PCF8574 | 0x20 | four brake-confirm microswitches |

### PCA9685 channels

| Ch | Signal | Ch | Signal |
|---|---|---|---|
| 0 | FL hip (MG996R) | 4 | FL brake (SG90) |
| 1 | FR hip | 5 | FR brake |
| 2 | RL hip | 6 | RL brake |
| 3 | RR hip | 7 | RR brake |
| 8 | spare (dock pan) | 9 | spare (light) |

Leg order everywhere — arrays, telemetry mask bits, PCF bits — is **0 FL, 1 FR, 2 RL, 3 RR**.

### LEDs and switches

There is no status LED. The buzzer is the only annunciator, on purpose: the pack powers
four servos and four motors, and the firmware's job is to spend as little as possible on
anything that is not a wheel.

---

## How it behaves

### Modes

| Mode | Brakes | Legs | Motors |
|---|---|---|---|
| **STAND** | engaged (spring, servo pulsing the engage value) | MG996Rs level the body from the IMU | off |
| **DRIVE** | released (SG90 holds the fork back) | held at the stance angle | skid steer |
| **STOW** | engaged | arms up at 125°, body on its rubber feet | off |
| **FAULT** | engaged | at stance | off, latched |

A transition is a small state machine, not a jump: `requestMode()` parks the wheels and
records the destination, then `modeService()` waits for the four confirm switches to
actually agree (900 ms to release, 1200 ms to engage) before the mode changes. If they do
not agree in time, that is a fault.

The brake command itself is a pure function of the state we are in *or heading to*
(`updateBrakeCommand()`), computed in one place — no transition can forget to release and
no fault path can leave a wheel unbraked.

### Fail-safes

Every stop does the same three things in the same order: **stop the motors, engage all
four brakes, then raise the flag.** The flag is last because the phone is the slowest part
of the system and the mechanical brake does not need permission.

| Trigger | Threshold | Fault |
|---|---|---|
| no valid command frame while driving | 1000 ms | `0x0001` |
| BLE disconnect while driving | immediate | `0x0001` |
| pack voltage | < 6000 mV | `0x0002` |
| brake did not engage | 1200 ms | `0x0004` |
| brake did not release | 900 ms | `0x0008` |
| command and confirm switch disagree | 400 ms | `0x0010` |
| PCA9685 lost | 3 consecutive I2C errors | `0x0020` |
| PCF8574 lost | 3 consecutive I2C errors | `0x0080` |
| body tilt while driving | > 40° for 300 ms | `0x0400` |
| master sets the force-brakes flag | immediate | `0x0800` (not latched) |

**Motors are gated on the measured brake mask, never on our own command.** `motorsAllowed()`
is the only thing that lets a duty cycle reach a TB6612, and it demands all four switches
reporting "released". A jammed, unplugged or lying fork cannot be driven through.

Only `clear` (serial) unlatches, and only if the pack is back above 6.4 V, all four brakes
are confirmed engaged and the brake hardware is answering. The robot then returns to STAND.

### Levelling

MPU6050 → complementary filter (98 % gyro, 2 % accelerometer) → pitch and roll in degrees
→ four hip offsets in millimetres → four hip angles.

The conversion is the geometry from SPEC.md: hip height is `24 + 68·cos θ`, so near the
20° stance one degree of hip angle buys 0.41 mm of body height and the ±9 mm levelling
range costs up to ±22° of hip travel — clamped to the 8…36° ride-height window, which is
what limits levelling near the height extremes.

This is a **command**, not a servo loop. The MG996R is a position servo that already closes
its own loop on angle; a second loop outside it would only hunt. Levelling runs in STAND
only (with wheels rolling, the accelerometer is reading the floor, not gravity).

---

## BLE protocol

Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`, device name `WHEELBOT-W1`.

| Characteristic | UUID | Direction |
|---|---|---|
| RX | `6e400002-…` | phone → robot, write / write-without-response |
| TX | `6e400003-…` | robot → phone, notify |

### Command frame — 12 bytes, little endian

| Byte | Field | Meaning |
|---|---|---|
| 0 | type | `0x01` drive, `0x02` mode, `0x03` trim, `0x04` config |
| 1 | arg0 | drive: speed, signed; mode: 0 stand / 1 drive / 2 stow; trim: hip 0–3; config: key |
| 2 | arg1 | drive: steer 0–255 (128 straight); trim: signed degrees; config: value |
| 3 | flags | bit0 force brakes, bit1 levelling on, bit2 buzzer |
| 4–7 | nonce | u32, echoed back in the ack |
| 8–9 | crc | CRC16-CCITT, poly 0x1021, init 0xFFFF, over bytes 0..7 |
| 10–11 | — | reserved, must be 0 or the frame is rejected |

`arg0` of a drive frame is int8 and the design speed is 500 mm/s, so **the wire unit is
4 mm/s** (range ±508). An app that wants raw mm/s instead should set
`DRIVE_SPEED_LSB_MMPS = 1.0f` in `main.cpp`.

The flag bits are honoured on **every** frame type, not just drive frames — they are the
master's hand on the dead-man switch.

Every valid frame is answered on TX with 4 bytes: the nonce, little endian. Invalid length,
bad CRC or a non-zero reserved field increments the reject counter and is otherwise ignored.

### Telemetry — 20 bytes, every 100 ms

| Byte | Field | Unit |
|---|---|---|
| 0 | mode | `WbModeCode` |
| 1 | brake mask | bit0–3 = clutch ENGAGED, from the switches |
| 2–3 | ride height | mm, mean hip height above the axle plane |
| 4–5 | pitch | 0.01°, nose up positive, int16 |
| 6–7 | roll | 0.01°, right side down positive, int16 |
| 8–9 | pack | mV |
| 10–11 | current | mA, **estimated** from duty (no shunt in the BOM) |
| 12–15 | wheel rpm | four int8, rpm ÷ 2, **commanded** (no encoders in the BOM) |
| 16–17 | faults | `WbFault` bitfield |
| 18 | flags | bit0 levelling, 1 low battery, 2 motors enabled, 3 brakes forced, 4 BLE up, 5 calibration saved |
| 19 | crc | CRC8 (poly 0x07, init 0x00) over bytes 0..18 |

Telemetry and acks share the TX characteristic; the app distinguishes them by length
(20 vs 4).

---

## Serial console

115200 8N1. Every command is a line; there is no prompt. Commands that change calibration
write NVS immediately and print `[nvs] calibration saved`.

| Command | Effect |
|---|---|
| `help` | command list |
| `status` | mode, faults, brakes (command vs switch), hips, attitude, I2C counters |
| `mon 1` / `mon 0` | repeat `status` every 500 ms |
| `cal` | print the pulse table |
| `cal <ch> <us0> <us1>` | pulse calibration, see below |
| `cal default` | restore factory pulses |
| `trim <leg> <-45..45>` | per-hip zero offset in degrees, saved |
| `hip <leg> <deg>` | the same offset, expressed as an absolute stance angle, saved |
| `adc <mult> <offset_mv>` | pack = pin · mult + offset, saved (default 2.0 / 0) |
| `save` | force an NVS write |
| `mode <0\|1\|2>` | request STAND / DRIVE / STOW |
| `brake <0\|1>` | bench: release / engage all four (refused while the wheels are live) |
| `level <0\|1>` | levelling on/off for this session |
| `clear` | clear latched faults |
| `estop` | stop now, brakes on |

`cal <ch>` takes 0–3 for the hips and 4–7 for the brakes:

* **hip** `us0` is the pulse at 0° and `us1` the pulse at 180°. Defaults 500 / 2500 (MG996R).
* **brake** `us0` is the pulse that **ENGAGES** and `us1` the pulse that **RELEASES**.
  Defaults 600 / 2400 (SG90).

Swapping the two numbers for a channel reverses that channel, which is also how you fix a
servo that is mounted mirrored.

---

## Calibration

Do this in order, on a bench, with the robot standing on its own wheels and nothing in
front of it. Everything here is saved to NVS as soon as it is accepted, and `cal default`
puts the factory numbers back.

### 0. Does the brake pulse go the right way?

Power up and try to roll one wheel by hand while the robot sits in STAND. It must be
**locked**. If any wheel spins free, that brake's engage pulse is on the wrong side:

```
cal 4 2400 600      # brake channel FL (4) with the two pulses swapped
```

Repeat per wheel with channels 5, 6, 7. This is the single most important check in the
whole document — get it wrong and the robot boots with its brakes released.

Confirm with `status`: with the brakes engaged it must print `sw=1111`.

### 1. Hip direction

```
hip 0 30            # leg 0 to 30 degrees of splay
```

The body at that corner must go **down** (hip height = 24 + 68·cos θ, so more θ is lower).
If it goes up, that hip is mounted mirrored:

```
cal 0 2500 500      # swap the two pulses for hip channel 0
```

### 2. Hip zero (trim)

Set the robot level by hand, then read each corner's deck height and trim to match. One
degree of trim is about 0.41 mm of body height at stance, so 1 mm ≈ 2.5°:

```
trim 0 -2           # leg FL 2 degrees up
trim 2 +2           # leg RL 2 degrees down
```

±45° is available, which is far more than any mounting error should need.

### 3. Levelling

Put the robot on a level floor, `mon 1`, and watch `pitch` and `roll` while you lift one
corner by 5 mm. The body should correct towards 0 ± 0.5° and settle without oscillating.
If it hunts, lower `LEVEL_GAIN` (0.55); if it sags, raise it.

### 4. Pack voltage

Measure the pack with a multimeter and match the firmware to it:

```
adc 2.031 -40       # mult, then offset in mV
```

Default is a perfect 100k/100k divider (2.0 / 0). Resistor tolerance is why this exists.

### 5. Brake switch polarity

`status` shows `sw=1111` when all four clutches are engaged. If it shows `0000` while the
wheels are locked, your switches are wired the other way round: set
`BRAKE_SW_ACTIVE_LOW` to 0 in `src/pins.h` and rebuild.

---

## Fault codes

| Bit | Code | Latched | Meaning | What to do |
|---|---|---|---|---|
| 0 | `0x0001` | yes | no valid frame for 1000 ms while driving, or BLE dropped | expected when the phone sleeps; `clear` |
| 1 | `0x0002` | yes | pack below 6.0 V | charge; clears at 6.4 V |
| 2 | `0x0004` | yes | brakes did not confirm engaged in 1200 ms | fork jammed, switch dead, SG90 unplugged |
| 3 | `0x0008` | yes | brakes did not confirm released in 900 ms | fork seized, spring too strong for the SG90 |
| 4 | `0x0010` | yes | a switch disagreed with the command for 400 ms | check that leg's fork and microswitch |
| 5 | `0x0020` | yes | PCA9685 stopped answering | I2C wiring; springs still hold the brakes |
| 6 | `0x0040` | no | MPU6050 glitched | transient; the bus is recovered automatically |
| 7 | `0x0080` | yes | PCF8574 stopped answering | brake state unknown, so the robot will not move |
| 8 | `0x0100` | no | MPU6050 missing at boot | warning only: stands, but cannot level |
| 9 | `0x0200` | yes | pack reading implausible (< 3 V or > 9.5 V) | divider or sense wire |
| 10 | `0x0400` | yes | body past 40° while driving | pick it up, `clear` |
| 11 | `0x0800` | no | force-brakes flag from the master | clears when the flag clears |

`clear` refuses while the fault's cause is still present — it re-checks the pack, the
brake mask and the two brake-side I2C devices before unlatching.

---

## First power-up

In this order, and do not skip 1–3:

1. **Bench, no battery.** USB only, wheels on blocks. `status` must show `pca=ok pcf=ok`,
   and `pack=... mV adc=none` is expected (no pack on the divider).
2. **Battery, robot on the floor.** No wheels should turn. Try to roll each wheel by hand:
   all four locked. If one rolls, fix its brake pulse before going further (§0 above).
3. **`brake 0` / `brake 1`** from the console. Each release should be audible as the fork
   pulls back and each engage as the spring snaps the dog in. `status` must follow:
   `sw=0000` on release, `sw=1111` on engage, within ~200 ms.
4. **`mode 1`, then `mode 0`** with the robot on blocks — motors should spin only in DRIVE.
5. **Phone.** Connect, send a drive frame with speed 0, steer 128. The ack must come back
   within one loop (~5 ms) and telemetry every 100 ms.
6. **Drive on the floor**, small speeds first. If the robot drives backwards when you ask
   for forward, that is a motor-wiring sign, not a firmware bug: swap `IN1`/`IN2` in
   `pins.h` for that wheel or invert both in software.

---

## Assumptions a builder must check

These are the places where the firmware guesses at the hardware. Every one of them is a
single constant in `src/pins.h` or `src/main.cpp`.

1. **TB6612 pin order.** SPEC.md gives the pins as `25/26/27, 32/33/14` and
   `12/13/15, 16/17/18`; the firmware reads each triple as *PWM, IN1, IN2* and assigns
   `25/26/27` → FL, `32/33/14` → RL, `12/13/15` → FR, `16/17/18` → RR. Verify against your
   modules' silkscreen.
2. **TB6612 /STBY** is tied high in hardware. With `/STBY` low the motors never move and
   there is no feedback that says so; `PIN_TB_STBY` exists if you wire it to a GPIO.
3. **Brake pulse direction.** Engage = 600 µs, release = 2400 µs. If your fork geometry is
   the other way round, every brake is inverted — check this first (§0).
4. **Brake switch polarity.** Active low, PCF8574 bits 0–3, FL/FR/RL/RR. `BRAKE_SW_ACTIVE_LOW`.
5. **IMU orientation.** MPU6050 flat on the deck, X right, Y forward, Z up. If the module is
   rotated 90°, pitch and roll swap.
6. **Hip angle convention.** θ measured from vertical, 20° at stance, mapped linearly onto
   0–180° of servo travel. If your horn is installed at a different phase, `trim` absorbs
   it up to ±45°.
7. **Drive frame units.** `arg0` is 4 mm/s per count. Change `DRIVE_SPEED_LSB_MMPS` if the
   app sends something else.
8. **No current sensor and no encoders** in the BOM (`../../figures/phonebot/bom.mjs`), so
   the telemetry's current and rpm fields are computed estimates. They are labelled as such
   in the protocol table and should not be used for closed-loop anything.
9. **GPIO12 and GPIO15 are strapping pins** used as motor PWM/direction here. They are
   driven low before anything else in `boardInit()`, and TB6612 inputs are high-impedance,
   so boot is safe — but do not add a pull-up on those two nets.
10. **GPIO4 (button) is also a strapping pin.** Do not hold the button while powering up.

---

## What is not here

No WiFi, no OTA, no credentials, no filesystem, no dynamic allocation in the loop, and no
blocking wait longer than 10 ms in steady state. The two exceptions are both deliberate
and both outside the control path: the boot brake confirmation (up to 1.2 s, yielding to
the RTOS idle task) and console output, which is buffered to 2 kB so a status dump cannot
stall a control tick. The frame queue, the calibration blob and every per-leg array are
fixed-size. The two `new` calls in `bleInit()` are the GATT callbacks and happen once, at
boot, because the BLE API demands a pointer.
