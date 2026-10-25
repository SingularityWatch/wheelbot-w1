"""Per-frame audit of every clip: does anything leave its rest station?

For each clip the rig keys the animation, then this walks the frame range and reports, per leg,
how far the tyre centre and the motor centre travel from where they sit at rest. A spinning wheel
must keep its centre still (the tyre turns about its own axis); a leg that steps may move its
wheel by the stride, but nothing may move by hundreds of millimetres, and no wheel may go below
the floor.

    blender -b -P blender/_audit.py
"""
import bpy
import math
import os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "wheelbot-anim2.py")
src = open(SRC, encoding="utf8").read().replace("\nmain()\n", "\n")
ns = {"__file__": SRC, "__name__": "animmod"}
exec(compile(src, SRC, "exec"), ns)

ns["clean"]()
parts = ns["load"]()
ns["tune_materials"]()
ns["accent"](parts)
body, turret, legs = ns["build_rig"](parts)

groups = {}
for o in parts:
    n = o.name.lower()
    if not n.startswith("leg."):
        continue
    lid = n.split(".")[1]
    kind = "tyre" if ".tyre" in n else "motor" if ".motor" in n else None
    if kind:
        groups.setdefault(lid, {}).setdefault(kind, []).append(o)


def centre(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return (mn + mx) / 2


def sample(label, frames):
    sc = bpy.context.scene
    sc.frame_set(1)
    bpy.context.view_layer.update()
    rest = {lid: {k: centre(v) for k, v in g.items()} for lid, g in groups.items()}
    worst = {lid: {k: 0.0 for k in g} for lid, g in groups.items()}
    low = 1e9
    for f in range(1, frames + 1, 3):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        for lid, g in groups.items():
            for k, objs in g.items():
                d = (centre(objs) - rest[lid][k]).length * 1000
                worst[lid][k] = max(worst[lid][k], d)
                if k == "tyre":
                    mnm = min((o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box)
                    low = min(low, mnm * 1000)
    bad = [(lid, k, round(v, 1)) for lid, d in worst.items() for k, v in d.items() if v > 60]
    print("AUDIT %-8s worst travel(mm) %s" % (label,
          {lid: {k: round(v, 1) for k, v in d.items()} for lid, d in worst.items()}))
    print("AUDIT %-8s lowest tyre point %.1f mm | violations: %s" % (label, low, bad or "none"))
    return bad


problems = {}
for name, frames in (("stand", 60), ("drive", 72), ("walk", 96), ("turret", 72)):
    for objs in groups.values():
        for v in objs.values():
            pass
    ns["clear_anim"]()
    ns["CLIPS"][name](body, turret, legs, frames)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, frames
    problems[name] = sample(name, frames)
print("AUDIT RESULT", "PASS" if not any(problems.values()) else "FAIL", problems)
