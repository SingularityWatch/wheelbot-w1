"""Which body box does a rear leg pass through while it walks?

Samples the walk clip and reports every pair (leg part, non-leg part) whose bounding boxes
intersect, with the frame and the overlap in millimetres. A box that appears from nowhere mid-step
is usually a body part the leg is cutting through, not a rig fault.
"""
import bpy
import os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "wheelbot-anim2.py")
src = open(SRC, encoding="utf8").read().replace("\nmain()\n", "\n")
ns = {"__file__": SRC, "__name__": "animmod"}
exec(compile(src, SRC, "exec"), ns)

ns["clean"]()
parts = ns["load"]()
body, turret, legs = ns["build_rig"](parts)
ns["clip_walk"](body, turret, legs, 96)

legs_parts = [o for o in parts if o.name.lower().startswith("leg.r")]
other = [o for o in parts if not o.name.lower().startswith("leg.")]


def box(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


hits = {}
sc = bpy.context.scene
for f in range(1, 97, 2):
    sc.frame_set(f)
    bpy.context.view_layer.update()
    lb = [(o.name, box(o)) for o in legs_parts]
    ob = [(o.name, box(o)) for o in other]
    for ln, (lmn, lmx) in lb:
        for on, (omn, omx) in ob:
            over = [min(lmx[i], omx[i]) - max(lmn[i], omn[i]) for i in range(3)]
            if all(v > 0.001 for v in over):
                key = (ln, on)
                depth = min(over) * 1000
                if key not in hits or depth > hits[key][0]:
                    hits[key] = (round(depth, 1), f)

for (ln, on), (depth, f) in sorted(hits.items(), key=lambda kv: -kv[1][0])[:14]:
    print("HIT %-22s x %-24s overlap %5.1f mm at frame %d" % (ln, on, depth, f))
print("HITS", len(hits))
