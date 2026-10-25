# Draft posts

Three lengths. Numbers are the machine's own (model.mjs), so they can be checked against the
repo. Swap the link once the repository is public.

**Attach `renders/wheelbot-twitter.gif`** to any of these — 1280×720, 9 s, 9.6 MB (under the 15 MB
GIF limit). It opens on the interactive figure, then shows the four Blender clips as a 2×2 grid:
walk, turret, drive, stand. Rebuild it with `bash blender/twitter-gif.sh`.

---

## 1. The one that leads with the idea (recommended)

The wheel is the foot.

Every hub on this robot carries six slots and a spring-loaded six-dog collar. Spring on: the
wheel is locked to the leg and the machine stands on four wheels like a table. Pull the collar
3 mm: the same wheels drive it at 0.5 m/s.

The brain is a phone you already own.

1.5 kg · $121 in parts · 19 h standing · open source ↓

## 2. Short, for a quote-tweet

Four legs, two 40 mm links each, a phone in the dock and a dog clutch in every wheel.

Locked = a stable platform that levels itself. Released = a 0.5 m/s rover. Bending the knees =
it walks. Springs hold the brake with no power, so a flat battery leaves it standing.

Files, firmware, app, STLs: <link>

## 3. Thread skeleton (5 posts)

1/ A phone is the most capable sensor pack most people already own: camera, IMU, screen, BLE,
   battery. So why buy a brain? This robot borrows one.
2/ The mechanism is a dog clutch. Spring pushes a collar into the hub, so the brake is engaged
   with no power at all; a 9 g servo pulls it 3 mm clear to roll. Fail-safe by construction.
3/ Two 40 mm links per leg: 45° thigh, vertical shin, wheel at the ankle. Hip and knee are both
   MG996R. Bend the knee and the foot lifts 12 mm — that is the whole gait.
4/ Everything is commodity: N20 motors, 18650 cells, a PCA9685, an ESP32. $121 in parts,
   no phone included, because you already have one.
5/ Open source: figure, firmware, the phone app (one HTML file, Web Bluetooth, no install),
   STLs and the design record. <link>

---

Alt text for the hero render: "Isometric render of a four-legged robot made of printed plastic
and hobby servos, standing on four small rubber wheels, a smartphone held upright in a dock on
its top deck, its screen lit."

Suggested tags: #opensource #robotics #3Dprinting
