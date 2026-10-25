# WHEELBOT W1 — wiring

> **Numbers moved.** These pages were written against the one-hinge leg. The machine in
> `figure/` has two 40 mm links per leg, eight MG996R, twelve servo channels, 1.514 kg and a
> 177 x 144 mm contact box. Where a number here disagrees with `SPEC.md`, `SPEC.md` is right;
> `docs/SPEC-CHANGE-two-link-leg.md` lists every edit this needs, file by file.


Everything an ESP32-WROOM DevKit (30-pin) talks to, and every wire that carries current, on one
page. The pin map is transcribed from `SPEC.md` lines 92–104; nothing here is a guess except the
wire colours, which are a suggestion so that your harness matches this document.

## 1. Pin map

| ESP32 pin | Goes to | Drives | Suggested colour |
|---|---|---|---|
| GPIO 21 | PCA9685 SDA, MPU6050 SDA, PCF8574 SDA | I2C data | yellow |
| GPIO 22 | PCA9685 SCL, MPU6050 SCL, PCF8574 SCL | I2C clock | green |
| GPIO 25 | TB6612 #1 (left), PWMA | front-left N20 speed | orange |
| GPIO 26 | TB6612 #1, AIN1 | front-left N20 direction | orange |
| GPIO 27 | TB6612 #1, AIN2 | front-left N20 direction | orange |
| GPIO 32 | TB6612 #1, PWMB | rear-left N20 speed | grey |
| GPIO 33 | TB6612 #1, BIN1 | rear-left N20 direction | grey |
| GPIO 14 | TB6612 #1, BIN2 | rear-left N20 direction | grey |
| GPIO 12 | TB6612 #2 (right), PWMA | front-right N20 speed | white |
| GPIO 13 | TB6612 #2, AIN1 | front-right N20 direction | white |
| GPIO 15 | TB6612 #2, AIN2 | front-right N20 direction | white |
| GPIO 16 | TB6612 #2, PWMB | rear-right N20 speed | brown |
| GPIO 17 | TB6612 #2, BIN1 | rear-right N20 direction | brown |
| GPIO 18 | TB6612 #2, BIN2 | rear-right N20 direction | brown |
| GPIO 34 | 100k/100k divider from the pack | battery voltage, ADC1 | violet |
| GPIO 4 | mode button to GND | stand / drive / stow toggle | blue |
| GPIO 19 | buzzer | low battery, brake fault | black (signal) |

Notes that cost people an evening:

- **GPIO 34 is input-only.** It is the right pin for the divider and the wrong pin for anything
  that drives. Do not put a pull-up on it.
- **The eight motor pins are listed in `SPEC.md` as four groups of three.** Read each triple as
  PWM / IN1 / IN2 in the order written. If your firmware's pin table disagrees, the firmware is
  authoritative — but only after you have checked that `SPEC.md`'s grouping is left module first
  (25/26/27, 32/33/14) and right module second (12/13/15, 16/17/18).
- **GPIO 12 is a strapping pin.** It floats high at boot; the TB6612's IN1 is a high-impedance
  input so this is harmless, but do not hang an LED on it.
- **Battery sense divider** is 100 k / 100 k, so the ADC sees half the pack. A 2S pack at 8.4 V
  reads 4.2 V at the pin, which is inside the ESP32's range.

## 2. PCA9685 channels

The PCA9685 is a 16-channel, 12-bit, 50 Hz servo driver on I2C. Eight of its channels are used.

| Channel | Drives | Servo | Range in use |
|---|---|---|---|
| 0 | front-left hip | MG996R | centre 1500 µs |
| 1 | front-right hip | MG996R | centre 1500 µs |
| 2 | rear-left hip | MG996R | centre 1500 µs |
| 3 | rear-right hip | MG996R | centre 1500 µs |
| 4 | front-left brake | SG90 | engaged / released only |
| 5 | front-right brake | SG90 | engaged / released only |
| 6 | rear-left brake | SG90 | engaged / released only |
| 7 | rear-right brake | SG90 | engaged / released only |
| 8–9 | spare — pan servo or light | — | unused in W1 |

Channel order in `SPEC.md` line 103 is FL, FR, RL, RR for hips (0–3) and the same order for
brakes (4–7). Keep the same leg order in the switch mask and in the telemetry or you will spend a
day debugging a robot that levels itself in a diagonal.

The brake servos only ever travel between two positions. If the firmware is ramping them, it is
wasting current and wearing the SG90s for nothing.

The shipped constants in `firmware/src/pins.h` are 500–2500 µs over the hips' 180° of travel and
two fixed brake pulses (600 µs engage, 2400 µs release, both marked as assumptions in that file).
If your linkage works the other way round, swap them with the firmware's `cal <ch> <us_engage>
<us_release>` command rather than re-printing a horn.

## 3. Power tree

```
 2S 18650 pack (2 x 3500 mAh, 25.9 Wh)
        |
        |  XT60
        v
   2S BMS 20 A  -------- over-discharge cut-off, balancing
        |
        v
   rocker switch 20 A
        |
        v
   5 A fuse  (5 x 20 mm, in holder)
        |
        +---------------------------+
        |                           |
        v                           v
  SZBK07 buck  6 V / 8 A       MP1584 buck  5 V / 3 A
        |                           |
        +--> PCA9685 V+ (servo rail)   +--> ESP32 VIN / 5V
        |    = 4 x MG996R + 4 x SG90   |
        +--> TB6612 #1 VM             +--> PCA9685 VCC (logic)
        +--> TB6612 #2 VM             +--> PCF8574 VCC, MPU6050 VCC
                                      +--> phone USB-C (via 0.3 m
                                           right-angle cable in the dock)
```

| Rail | Source | Load | Number |
|---|---|---|---|
| Pack | 2S 18650 | everything | 7.4 V nominal, 25.9 Wh |
| 6 V | SZBK07, 8 A | 4 servos + 4 motors | 3.0 A average, 6.6 A with all four motors stalled |
| 5 V | MP1584, 3 A | ESP32, logic, phone charge | one 3 A module for all of it — the pack draws 9.8 W with the phone charging (`SPEC.md` line 71) |
| Protection | BMS 20 A, switch 20 A, fuse 5 A | — | `bom.mjs` `bms`, `power` |

Three things to get right:

1. **Set both bucks before connecting anything to them.** An SZBK07 straight out of the bag is
   not at 6.0 V. Turn the pot with a meter on the output, no load, until it reads 6.0 V. Same for
   the MP1584 at 5.0 V. Servos and an ESP32 both die at pack voltage.
2. **PCA9685 has two supplies and they are not the same pin.** VCC is 5 V logic; V+ is the servo
   rail and is 6 V here. Bridging them puts 6 V on a 3.3 V logic part through the level shifters.
   Cut the default V+/VCC jumper on the module if it has one.
3. **The fuse is 5 A and the stall figure is 6.6 A.** That is the record's own arithmetic
   (`SPEC.md` line 74: 3.0 A average at 6 V, 6.6 A with all four motors stalled, 8 A buck). A
   blade fuse tolerates a few seconds of that, and you should never sit on a four-wheel stall —
   but if you blow fuses on thick carpet, this is why, and it is a design margin question, not a
   wiring fault. Do not "fix" it by fitting a bigger fuse without deciding what is now unprotected.

## 4. The I2C bus

One bus, three devices, two pins. All three are 3.3 V-compatible modules and all three share the
ESP32's 3.3 V logic — but VCC for the PCA9685's logic side and the PCF8574 must come from the
**5 V** rail if your modules are the common 5 V boards; their I2C lines are open-drain and the
ESP32's internal pull-ups will only just carry the bus at these lengths. If the scan is flaky, add
external pull-ups to 3.3 V on SDA and SCL at the ESP32 end.

| Device | Address | Pins | Job |
|---|---|---|---|
| PCA9685 | 0x40 | SDA 21, SCL 22 | 8 servo channels: 4 hip + 4 brake |
| MPU6050 | 0x68 | same bus | pitch and roll for leveling |
| PCF8574 | 0x20 | same bus | the 4 brake-confirm switches |

Address conflicts are not possible here — the three defaults are distinct. If a scan shows nothing
at 0x40, the PCA9685's OE or its VCC is the usual culprit; if it shows 0x68 only, the expander is
on the wrong pair of pins.

**The four brake switches.** One microswitch per leg, on the fork, closed when the collar is home.
Four switches on a PCF8574 is four bits on two wires, which is why the expander is in the bill at
all. Wire each switch from its expander pin to GND and let the expander's internal pull-up do the
work; `firmware/src/pins.h` sets `BRAKE_SW_ACTIVE_LOW 1`, so a closed switch reads 0 = engaged. A
PCF8574's pins are quasi-bidirectional, so the firmware has to write a 1 to a pin before reading
it — and a floating bit then reads **1 = not engaged**, which makes the robot refuse STAND. That
is the safe direction to fail, but it does mean one bad switch costs you the mode.

## 5. Connectors

| Connection | Connector | Notes |
|---|---|---|
| Pack → harness | XT60 | `bom.mjs` `power`; solder, heatshrink both pins |
| Pack → BMS | tabbed holder leads | `bom.mjs` `holder`, 2 × 18650 tabbed |
| Switch / fuse | 5 × 20 mm fuse holder, 20 A rocker | in the rear face of the lower deck |
| SZBK07 / MP1584 input and output | screw terminals on the module | strip 6 mm, tin the wire |
| PCA9685 servo headers | 3-pin 2.54 mm | 8 used, 8–9 spare; **check polarity**, brown/black is GND |
| MG996R / SG90 leads | their own 3-pin plugs | do not cut them; extend with a male-female lead |
| N20 motors | 2 solder tabs | solder, heatshrink; no connector survives a wheel |
| TB6612 outputs | screw terminals | one motor per channel, A and B |
| Microswitch KW11 | 3 solder tabs (COM / NO / NC) | use COM + NO so a broken wire reads "not engaged" |
| MPU6050 / PCF8574 | 4-pin 2.54 mm headers | VCC, GND, SDA, SCL |
| Phone | USB-C, 0.3 m right-angle | `bom.mjs` `cable`; angled plug in the dock |
| Battery sense | direct solder to a 2-pin header | 100k/100k, into GPIO 34 |

Two polarity rules, both learned the expensive way by everyone: **servo plugs are not
keyed reliably** — brown or black is ground on every servo in this bill, and it goes to the pin
nearest the board edge on a PCA9685; and **the XT60 goes on the pack last**, after every other
solder joint in the machine has been checked.

## 6. Multimeter checks before the first battery

Do all of these with the pack **out** of the holder. Each one is a two-minute check that saves a
board.

| # | Where | Expect | Meaning if wrong |
|---|---|---|---|
| 1 | XT60, ohms, switch OFF | open circuit | switch wired across itself, or the fuse holder is shorted |
| 2 | XT60, ohms, switch ON | not 0 Ω (the bucks' input capacitors will make the meter climb) | a dead short — find it before the pack does |
| 3 | 6 V rail to GND, ohms | > 1 kΩ | a servo plugged in backwards |
| 4 | 5 V rail to GND, ohms | > 1 kΩ | ESP32 in backwards, or a buck output shorted |
| 5 | 6 V rail to 5 V rail | open circuit | the two bucks share a wire they should not |
| 6 | PCA9685 V+ to VCC | open circuit | the module's supply jumper is still fitted — cut it |
| 7 | SDA to SCL | open circuit | a solder bridge across the two bus wires |
| 8 | SDA or SCL to GND | > 1 kΩ | the bus is shorted; a scan will never work |
| 9 | Each N20 tab to the other tab | a few ohms — not open, not 0 Ω | open motor, or a broken solder joint under the heatshrink |
| 10 | Each N20 tab to the motor can | open circuit | a short through the gearbox — do not power that motor |
| 11 | Each microswitch COM to NO | closed when the collar is home, open when released | the switch is set wrong, see `ASSEMBLY.md` step 4.7 |
| 12 | Battery sense divider, pack side to GPIO 34 | equal halves (100k / 100k) | wrong resistor, or a 10k in the wrong place |

Then, and only then: fit the pack, switch on with **no servos and no motors connected**, and
measure 6.0 V and 5.0 V at the rails. Connect the servo rail. Measure again under the servos'
idle load. The full checklist that follows this one is in `ASSEMBLY.md` §13.

## 7. Signal budget

| Thing | Value | Why it matters here |
|---|---|---|
| Servo pulse rate | 50 Hz | PCA9685 default, all eight servos expect it |
| Hip centre | 1500 µs | the value the horns are fitted at; standard hobby centre, not a number from the record |
| Brake positions | two, 6 mm apart | no intermediate positions are useful |
| Motor supply | 6 V | N20 rated 6 V, 200 rpm |
| Wheel speed at 200 rpm | 0.503 m/s | on a Ø48 wheel |
| Peak 6 V draw | 3.0 A average, 6.6 A all four stalled | SZBK07 is 8 A |
| Pack | 2S, 7.4 V nominal, 25.9 Wh | fuse 5 A |

If you add anything to the 5 V rail, remember the MP1584 is a 3 A part feeding the ESP32, the
logic, and a phone charging at roughly 0.5 A — there is not much headroom left, and a phone that
negotiates a fast-charge profile will find it.
