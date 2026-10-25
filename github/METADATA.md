# WHEELBOT W1 — GitHub metadata

Copy-paste text for the repository page. Nothing here belongs in the repository tree itself; it is
the text around the code.

## Description (the one-line "About" field)

```
A four-legged robot whose wheels are also its feet and whose brain is the phone in its dock.
1.5 kg, $120 in commodity parts, 3D-printable, ESP32 firmware, one-file phone app.
```

## Topics

```
robotics  quadruped  smartphone  opensource-hardware  esp32  3dprinting  web-bluetooth
mechanism  dog-clutch  platformio  blender
```

## Social preview

`renders/hero-readme.png` — Settings → Social preview → upload.

## Release notes — v0.1.0

**What it is.** A wheel-foot quadruped: four legs of two 40 mm links, a wheel at each ankle, and a
six-dog spring clutch in every hub that turns the wheel into a foot. Spring engaged means the brake
holds with no power, so a flat battery leaves the machine standing. The phone sits on a pan turret,
cameras forward, and does the thinking over BLE.

**What is in the box**

- `figure/phonebot.html` — the whole machine as one self-contained interactive isometric drawing:
  164 parts you can name, a costed bill of materials, the app mock, the size table, zoom, and a live
  walk cycle. Dark and light; no server, no network.
- `firmware/` — ESP32 PlatformIO project: STAND / DRIVE / WALK / STOW, twelve PCA9685 channels,
  four TB6612 channels, brake microswitches, IMU levelling, CRC16-framed BLE.
- `app/index.html` — the phone side: Web Bluetooth in one file, with a simulator (`?demo=1`).
- `mechanical/` — OBJ, MTL and STL exported from the same `parts.json` the drawing is built from.
- `blender/` — the render and animation scripts plus two checks: `check-rig.py` measures how far a
  wheel drifts from its axle through a clip, `check-clashes.py` counts leg-vs-body interpenetration.
- `docs/` — assembly, wiring, use, the change note for the two-link leg, and `ARTICLE.md`.

**Numbers** — 1.31 kg bare, 1.51 kg with a phone; 0.503 m/s driving; 42 mm stride and 35 mm/s
walking; 2.6 h driving while charging the phone; 19.4 h standing; $120 without the phone.

**Known gaps, stated rather than hidden**

1. The firmware has not been compiled (no ESP32 toolchain was available) and still drives four
   joints where the leg now has eight; `docs/SPEC-CHANGE-two-link-leg.md` carries the patch.
2. The app caps at ±127 mm/s because the protocol packs speed into one signed byte.
3. The figure's geometry audit is not at zero: 114 depth-order conflicts, 15 stand-in shapes, and
   nested coaxial parts interpenetrate by design.
4. Renders are flat; the phone's screen has no interface in 3D.
5. `dock.cable` differs from its recorded shape by 0.73 mm in the export.

## First comment to pin (if asked "does it work?")

> The mechanism is proved on paper and in the drawing, the electronics are a bill of materials, and
> the firmware is written but never flashed. Nobody has built one yet. If you do, the two things to
> check first are the brake pulse polarity (`cal 4 2400 600` in the serial console) and that all four
> brake switches read engaged at boot.

## Licence note

MIT, plus a hardware note: build it, sell it, change it. The warning about the machine falling on
what is around it stays.
