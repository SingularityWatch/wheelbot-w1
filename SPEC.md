# WHEELBOT W1 — design record

> Prices are in US dollars for an English-speaking reader. The bill of materials is kept in
> the roubles the parts were actually bought for and converted once, at **90 RUB to the
dollar** — the rate is stated so the arithmetic can be checked, not hidden in a total.

A four-legged phone robot. The phone is the brain and the only expensive part; everything
else is a commodity part from a hobby-shop basket. Inspired by PhoneBot (phonebot.dev),
but wheel-legged instead of humanoid: the machine stands on four locked wheels and rolls
when they are released.

**One sentence:** the wheel is the foot. A dog clutch in every hub locks the wheel to the
leg in one 6 mm slide, so the same four wheels either hold the robot up as a rigid table or
roll it across the floor.

## Geometry (mm, the numbers the figure is built from)

| Part | Value |
|---|---|
| Wheel | Ø48 x 12 rubber, hub Ø34, N20 3 mm D shaft |
| Thigh, hip → knee | 40 |
| Shin, knee → axle | 40 |
| Stance | hip 45° forward, knee 0° (shin vertical) |
| Ankle at stance | 28.3 forward of the hip, 68.3 below it |
| Hip pivot height | 92 (axle 24 + 68.3) |
| Hip station, x | ±60; hip plane, y | ±58 |
| Lower deck | 180 x 110, z 92…95, 3 mm PETG |
| Upper deck | 150 x 90, z 120…123, on 4 x 25 mm standoffs |
| Phone dock | square to the machine, centre (0, 0), screen out toward +y |
| Phone | 74 x 158 x 8.5, bottom z 128 |
| Overall envelope (3D export) | 228 x 196 x 290 |
| Servos | 8 x MG996R (hip + knee) + 4 x SG90 (brake) = 12 PCA9685 channels |

## Mechanics

**The dog clutch is the whole idea.** Each hub carries six slots; a collar on the axle carries
six dogs. A 0.6 N/mm spring pulls the collar home — *engaged with no power*. An SG90 pulls it
3 mm clear, so the wheel rolls. Consequences: the brake cannot fail open; the servos only ever
work to release; and the wheel stays in its fork at every joint angle.

**Two links, two hinges.** The thigh leaves the hip at 45°, the shin hangs from the knee, and the
ankle lands under the hip with the wheel on it. Bending the knee lifts the foot 12 mm — that is
the gait. The shin is a fork: the wheel turns between its cheeks, the N20 is bolted to the inner
one, the outer one carries the brake servo and the collar.

**Leveling.** Front legs vs rear legs set pitch, left vs right set roll; MPU6050 → hip offsets,
±14 mm at the hip = ±10.1° of body tilt.

## Numbers that everything else derives from


| Quantity | Value | Where it comes from |
|---|---|---|
| Wheel | Ø48 x 26 mm rubber, N20 shaft | commodity |
| Arm (hip → axle) | L = 68 mm | this record |
| Hip height | 88 mm above the floor at stance | hip z = axle z + L cos θ |
| Stance splay θ | 20° | L cos 20° = 64 mm |
| Wheelbase / track | 166 mm / 156 mm | 2 x (60 + L sin 20°), 2 x 78 |
| Ride height range | hip 79 … 91 mm (body bottom 71 … 83) | θ = 36° … 8° |
| Mass, no phone | 1.314 kg | sum of parts |
| Mass with a 200 g phone | 1.514 kg | |
| Static load per leg | 3.71 N | m g / 4 |
| Worst joint moment | 0.208 N·m (2.1 kg·cm) over the pose library | model.mjs |
| Hip/knee servo | MG996R, 9.4 kg·cm @ 6 V | 4.4x static, 1.8x against a 2.5x dynamic allowance |
| Drive | 4 x N20 6 V 200 rpm | 0.503 m/s on Ø48 |
| Contact box | 177 mm wheelbase x 144 mm track | |
| Brake | 6-dog clutch, 12 mm mean radius, 3 mm engagement, 3 mm travel | shear 0.27 MPa vs ~45 MPa PETG |
| Brake actuator | SG90 pulls a fork, 0.6 N/mm spring engages | power off = locked |
| Battery | 2S 18650 3500 mAh, 25.9 Wh | |
| Runtime, driving + charging the phone | 2.6 h | |
| Runtime, driving, phone on its own battery | 3.8 h | |
| Runtime, walking | 1.8 h | |
| Runtime, standing with brakes locked | 19.4 h | |
| Peak draw | 4.8 A average at 6 V | 8 A buck |
| Cost, everything but the phone | $121 — $40 electrical, $81 mechanical | bom.mjs, priced 10.2026 |

## Modes

1. **STAND** — every dog clutch engaged (spring), the four wheels are feet, the four
   MG996Rs level the body: ride height 84–96 mm, pitch/roll trimmed from the MPU6050.
   No current in the brake servos: the spring holds, the servo only ever *releases*.
2. **DRIVE** — the four SG90s pull the forks back 6 mm against their springs, the collars
   clear the dogs, the N20s drive. Skid steer: differential speed, spin in place.
3. **STOW** — arms swing up 36°, brakes engaged, the body rests on four rubber feet under
   the lower deck. Carry it by the handle.

Safety: the brake is spring-engaged, so a flat battery, a lost BLE link (> 1 s) or a
brown-out leaves the robot standing. Firmware stops the motors before it stops the servos.

## Electronics

| Board | Bus | Address / pins | Job |
|---|---|---|---|
| ESP32-WROOM DevKit 30-pin | — | — | control loop, BLE GATT |
| PCA9685 | I2C 0x40 | SDA 21, SCL 22 | 8 servo channels (4 hip + 4 brake) |
| MPU6050 | I2C 0x68 | same bus | pitch/roll for leveling |
| PCF8574 | I2C 0x20 | same bus | 4 brake-confirm switches |
| TB6612FNG x2 | GPIO | 25/26/27, 32/33/14 (left); 12/13/15, 16/17/18 (right) | 4 wheel motors |
| battery sense | ADC1 | GPIO 34, 100k/100k divider | pack voltage |
| mode button | GPIO | 4 | stand/drive toggle |
| buzzer | GPIO | 19 | low battery, brake fault |

PCA9685 channels: 0 FL hip, 1 FR hip, 2 RL hip, 3 RR hip, 4 FL brake, 5 FR brake,
6 RL brake, 7 RR brake, 8–9 spare (pan servo / light).

## BLE protocol (the phone is the master)

Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`, RX `…002` (write), TX `…003` (notify).
Fixed 12-byte frames, little endian:

```
0  type      0x01 drive, 0x02 mode, 0x03 trim, 0x04 config
1  arg0      drive: speed in 4 mm/s units, signed (-127 -> -508, +127 -> +508)  / mode: 0 stand 1 drive 2 stow  / trim: hip index
2  arg1      drive: steer (0..255, 128 = straight) / trim: angle offset (signed deg)
             (arg0 is scaled, not raw mm/s: a signed byte cannot carry 503)
3  flags     bit0 brakes forced, bit1 leveling on, bit2 buzzer
4..7  u32    nonce, echoed in the ack
8..9  u16    CRC16-CCITT of bytes 0..7
10..11       reserved
```

Telemetry (TX, 20 bytes): mode, brake mask, ride height mm, pitch, roll, pack mV,
current mA, wheel rpm ×4, faults.

## File layout of the delivered repo

```
firmware/     PlatformIO project (ESP32, Arduino framework)
app/          phone app: one HTML file, Web Bluetooth, no install
mechanical/   STL + OBJ + BOM from the figure's parts.json
docs/         ASSEMBLY.md, WIRING.md, USE.md
figure/       the interactive isometric figure (this workspace's build.mjs output)
```
