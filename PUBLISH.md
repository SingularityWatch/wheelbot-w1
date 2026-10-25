# Publishing this repository

Everything here is ready to upload. Nothing in it points at a local path, needs a build step to
read, or depends on the machine it was made on.

## 1. Create the repository and push

The git history is already in this folder, on `main`. Only the remote is missing — but the history
carries several rounds of re-rendered clips, so the **recommended route is the clean one below**: it
publishes one commit and a 12 MB tree instead of 44 MB of superseded renders.

```bash
cd repo
git remote add origin git@github.com:<your-user>/wheelbot-w1.git
git branch -M main
git push -u origin main
```

Recommended: publish the tree, not the working history:

```bash
cd repo && rm -rf .git && git init -b main
git add -A && git commit -m "WHEELBOT W1: wheel-foot robot with a phone for a brain"
git remote add origin git@github.com:<your-user>/wheelbot-w1.git
git push -u origin main
```

## 2. What to fill in first

- `README.md` — the badge and the repository URL are deliberately absent; add them if you want
  them, and put your name in the credits line at the bottom.
- `LICENSE` — currently MIT with a hardware note. Change the copyright line to your name.
- `github/METADATA.md` — the About line, the topic list, the release notes and the pinned comment,
  ready to paste into GitHub.

## 3. Repository metadata (copy-paste)

**About / description:**

> A four-legged robot whose wheels are also its feet and whose brain is the phone in its dock.
> 1.5 kg, $121 in commodity parts, 3D-printable, ESP32 firmware, one-file phone app.

**Topics:** `robotics` `quadruped` `smartphone` `opensource-hardware` `esp32` `3dprinting`
`web-bluetooth` `mechanism` `dog-clutch`

## 4. Files worth reading first

| Path | Why |
|---|---|
| `docs/ARTICLE.md` | the write-up: one mechanism, the numbers, what is not finished |
| `figure/phonebot.html` | the whole machine as one interactive drawing — open it, no server needed |
| `firmware/src/main.cpp` | the state machine and the brake logic |
| `app/index.html` | the phone side, runs in a browser with a simulator |
| `mechanical/wheelbot.stl` | print-ready, millimetres, Z up |
| `SPEC.md` | the design record every other file cites |

## 5. Known gaps, stated up front

Say these in the release notes rather than letting the first commenter find them:

1. The firmware has never been compiled; no ESP32 toolchain was available. It drives four joints,
   not the eight the two-link leg needs — `docs/SPEC-CHANGE-two-link-leg.md` has the patch.
2. The app caps at ±127 mm/s because the protocol carries speed in one signed byte.
3. The figure's geometry audit is not at zero: 114 depth-order conflicts, 15 stand-in shapes, and
   nested coaxial parts interpenetrate by design.
4. The renders are flat; the phone's screen carries no interface in 3D.
5. `dock.cable` differs by 0.73 mm between its recorded shape and the export.

## 6. After the first push

- Tag it: `git tag -a v0.1.0 -m "First public cut: figure, firmware, app, STL, renders" && git push --tags`
- Add the hero image to the repository's social preview (Settings → Social preview) from
  `renders/hero.png`.
- The post is in `TWITTER.md`; the numbers in it come from the model, so they can be checked
  against the repository.
