# Change note: the leg became two links

The robot was drawn and specified once with a single hinge per leg (one 68 mm arm from the hip
to the axle). The figure showed that it could stand and roll, but not *step*, so the leg was
rebuilt as two 40 mm links, 45° at the hip with the shin hanging vertical. This note records
exactly what changed, so the firmware and the assembly text can be brought to the same machine.

Everything below is millimetres.

## What the machine is now

| Joint | Value |
|---|---|
| Thigh, hip → knee | 40 |
| Shin, knee → axle | 40 |
| Stance | hip 45° forward, knee 0° (shin vertical) |
| Ankle at stance | 28.3 forward of the hip, 68.3 below it |
| Hip height at stance | 92 |
| Servos per leg | 2 (hip MG996R + knee MG996R) + 1 brake SG90 |
| Servos total | 8 MG996R + 4 SG90 = 12 PCA9685 channels |

Walking is the knee: bending it lifts the foot 12 mm. The gait in `model.mjs` is a **statically
stable crawl**, not a trot: the wheels are locked while it steps, so a foot is a rigid point and
nothing catches the body if a diagonal pair leaves the floor. One foot swings at a time, 0.75 duty,
in the lateral sequence rl → fl → rr → fr, at a 1.6 s cycle. Rotating the whole leg about the hip
moves the ankle 42 mm, so the stride is 42 mm and the walking speed 35 mm/s.

## Channel map (pins.h)

```
0..3   hip    FL, FR, RL, RR
4..7   knee   FL, FR, RL, RR
8..11  brake  FL, FR, RL, RR   (pulse pulls the collar 3 mm off its slots; the spring does the rest)
12..15 spare
```

## The kinematics the firmware needs

```cpp
// Two links of 40 mm, foot held a fixed 28.3 mm ahead of the hip at stance. Height in,
// joint angles out; the elbow solution with the knee forward is the one to use.
static const float LINK_A_MM = 40.0f;
static const float LINK_B_MM = 40.0f;
static const float STANCE_OFFSET_MM = 28.3f;

static void legIk(float heightMm, float *hipDeg, float *kneeDeg) {
  const float x = STANCE_OFFSET_MM;                  // forward offset of the contact
  const float z = -(heightMm - AXLE_Z_MM);           // down from the hip
  float r = sqrtf(x * x + z * z);
  r = clampf(r, fabsf(LINK_A_MM - LINK_B_MM) + 0.5f, LINK_A_MM + LINK_B_MM - 0.5f);
  const float alpha = atan2f(x, -z);                                       // target from vertical
  const float beta = acosf(clampf((r * r + LINK_A_MM * LINK_A_MM - LINK_B_MM * LINK_B_MM)
                                  / (2.0f * r * LINK_A_MM), -1.0f, 1.0f));
  const float h = alpha + beta;                                            // thigh from vertical
  const float dx = x - LINK_A_MM * sinf(h);
  const float dz = z + LINK_A_MM * cosf(h);
  const float k = atan2f(dx, -dz);                                         // shin from vertical
  *hipDeg = h / DEG_TO_RAD;
  *kneeDeg = k / DEG_TO_RAD;
}
```

The stance check: `legIk(92.0f, ...)` must return hip 45.0° and knee 0.0°. If it does not, the
sign of `beta` or the order of `atan2` is wrong — check that before touching the servos.

Servo angles are not joint angles: `servoDeg = jointDeg + cal.hipTrimDeg[leg]` for the hip and
`servoDeg = (k - h) + cal.kneeTrimDeg[leg]` for the knee, because the knee servo is bolted to
the thigh and drives the shin *relative to it*. At stance that is −45°.

## Files that still describe the one-link leg

| File | What to change |
|---|---|
| `firmware/src/pins.h` | channel map above, plus `LINK_A_MM`, `LINK_B_MM`, `STANCE_OFFSET_MM` (the map is already updated; the constants are not) |
| `firmware/src/main.cpp` | add `kneeCurDeg[]`, `kneeTargetDeg[]`, `kneePulseUs[]` beside the hip arrays; `computeHipTargets()` calls `legIk()` per leg; `servoService()` writes both channels; `meanHipHeightMm()` becomes `AXLE_Z_MM + A·cos h + B·cos k`; `degPerMmAt()` becomes a numerical derivative of `legIk()` |
| `docs/ASSEMBLY.md` | two servos per leg: the knee servo is bolted to the thigh and its horn drives the shin; centre **both** joints before fitting horns; the shin must hang vertical at hip 45° |
| `docs/WIRING.md` | 12 servo channels, not 8; the harness now carries two servo leads per leg |
| `docs/USE.md` | WALK is a real mode: the brakes stay locked while the legs step |

Until those edits land, treat the firmware as a control core that drives four joints, not
twelve. It is not compiled or tested — there is no ESP32 toolchain on the machine this was
written on.
