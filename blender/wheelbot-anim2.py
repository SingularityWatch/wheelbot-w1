"""WHEELBOT W1 — animation pass.

Reads figures/phonebot/3d/phonebot.obj (one group per part, millimetres, exported from the same
parts.json the figure is built from) and drives it with a joint hierarchy, so nothing comes apart:
the body carries four hip empties, each hip carries a knee, each knee carries a wheel, and the
turret sits on the body and carries the dock and the phone.

Gait is a statically stable crawl, not a trot: the wheels are locked (the dog clutches are
engaged) so a foot is a rigid point, and with no ankle and no balancing wheel the body would fall
if a diagonal pair left the floor. One foot swings at a time in the lateral sequence, 0.75 duty.

    blender -b -P blender/wheelbot-anim2.py -- [--quick] [--still] [--clip walk|drive|stand|turret]

Units: the OBJ is millimetres, so everything is scaled by 0.001 on import and every number below
is metres.
"""
import bpy
import json
import math
import os
import sys
from mathutils import Vector

MM = 0.001
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBJ = os.path.join(ROOT, "figures", "phonebot", "3d", "phonebot.obj")
OUT = os.path.join(ROOT, "renders", "anim2")

# geometry, from figures/phonebot/model.mjs
HIP_X, HIP_Y, HIP_Z = 60.0, 58.0, 92.0
THIGH, SHIN = 40.0, 40.0
STANCE = 45.0
KNEE_DROP = THIGH * math.sin(math.radians(STANCE))          # 28.3 forward
KNEE_DOWN = THIGH * math.cos(math.radians(STANCE))          # 28.3 down
DECK_TOP = 123.0
TURRET_Z = DECK_TOP + 10.0

WALK = dict(duty=0.75, period=1.6, sweep=18.0, knee=26.0, order={"rl": 0.0, "fl": 0.25, "rr": 0.5, "fr": 0.75})
FPS = 24


# ---------------------------------------------------------------- scene
def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.film_transparent = False
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = -0.9
    sc.eevee.taa_render_samples = 32
    world = bpy.data.worlds.new("studio")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.045, 0.048, 0.055, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0


def mat(name, rgb, rough=0.45, metal=0.0, emit=None, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    bsdf.inputs["Base Color"].default_value = (*rgb, alpha)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = 2.2
    m.diffuse_color = (*rgb, alpha)
    return m


# One rule per part family. The figure is a machine, so every family gets a material a reader can
# name: printed plastic, rubber, steel, aluminium, PCB, cell, glass, and one accent for the turret.
# Materials are created after the scene is wiped, never at import time (a factory reset removes
# them and every later struct reference dies).
RULES = [
    (("phone.screen",), ("glass", (0.015, 0.018, 0.022), 0.10, 0.0, (0.05, 0.22, 0.30))),
    (("phone.",), ("phone", (0.06, 0.065, 0.075), 0.28, 0.5, None)),
    (("turret.platter", "turret.pinion", "turret.pin", "turret.witness"), ("turret", (0.75, 0.28, 0.05), 0.38, 0.0, None)),
    (("turret.gear",), ("gear", (0.22, 0.24, 0.27), 0.32, 0.8, None)),
    (("tyre", "rubber"), ("rubber", (0.030, 0.030, 0.034), 0.88, 0.0, None)),
    (("hub", "alu"), ("alu", (0.78, 0.80, 0.83), 0.24, 1.0, None)),
    (("collar", "boss", "axle", "knee-pin", "fork", "screw", "post", "spring"), ("steel", (0.62, 0.64, 0.68), 0.22, 1.0, None)),
    (("motor",), ("motor", (0.30, 0.32, 0.36), 0.42, 0.8, None)),
    (("pcb", "elec.esp32", "elec.mpu", "elec.pcf", "elec.bms"), ("pcb", (0.045, 0.20, 0.09), 0.55, 0.0, None)),
    (("cell",), ("cell", (0.04, 0.09, 0.36), 0.40, 0.3, None)),
    (("led",), ("led", (0.10, 0.90, 0.55), 0.30, 0.0, (0.10, 0.90, 0.55))),
    (("buck", "buzzer", "switch", "fuse"), ("module", (0.10, 0.11, 0.13), 0.55, 0.0, None)),
    (("servo", "bracket", "thigh", "shin", "leg.", "dock.", "turret.", "body.", "elec."), ("bracket", (0.30, 0.32, 0.35), 0.55, 0.0, None)),
]

_CACHE = {}


def material_for(name):
    for keys, spec in RULES:
        for k in keys:
            if k in name:
                return cached(spec)
    return cached(("bracket", (0.30, 0.32, 0.35), 0.55, 0.0, None))


def cached(spec):
    key, rgb, rough, metal, emit = spec
    if key in _CACHE:
        return _CACHE[key]
    m = mat(key, rgb, rough, metal, emit)
    _CACHE[key] = m
    return m



    for keys, m in MATS:
        for k in keys:
            if k in name:
                return m
    return mat("pa12", (0.58, 0.58, 0.56), 0.52)


def empty(name, at, size=0.012):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = size
    e.location = Vector(at)
    bpy.context.collection.objects.link(e)
    return e


def parent_keep(obj, parent):
    # parent_set(keep_transform) lets Blender solve the inverse matrix. Setting the inverse by
    # hand looked right at rest and threw parts off their joints as soon as a parent rotated.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    parent.select_set(True)
    bpy.context.view_layer.objects.active = parent
    bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)
    bpy.ops.object.select_all(action="DESELECT")


def load():
    bpy.ops.wm.obj_import(filepath=OBJ, use_split_groups=True, global_scale=MM)
    parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.context.view_layer.update()
    return parts


TUNED = {
    # name in the exported MTL -> (colour, roughness, metallic, emission)
    "pa12": ((0.085, 0.090, 0.100), 0.52, 0.0, None),
    "abs": ((0.115, 0.120, 0.140), 0.45, 0.0, None),
    "alu": ((0.55, 0.57, 0.61), 0.22, 1.0, None),
    "steel": ((0.38, 0.40, 0.44), 0.26, 1.0, None),
    "steel-ni": ((0.48, 0.50, 0.54), 0.20, 1.0, None),
    "rubber": ((0.008, 0.008, 0.010), 0.92, 0.0, None),
    "pcb": ((0.035, 0.16, 0.075), 0.55, 0.0, None),
    "cell": ((0.02, 0.05, 0.26), 0.38, 0.3, None),
    "led": ((0.06, 0.42, 0.34), 0.25, 0.0, (0.06, 0.42, 0.34)),
}


def tune_materials():
    tuned = []
    for m in bpy.data.materials:
        key = m.name.lower().split(".")[0]
        spec = TUNED.get(key)
        if not spec:
            continue
        rgb, rough, metal, emit = spec
        m.use_nodes = True
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        tuned.append(m.name)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        if emit:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1)
            bsdf.inputs["Emission Strength"].default_value = 0.55
        m.diffuse_color = (*rgb, 1)
    print("[anim] materials tuned:", len(tuned), tuned[:12])


def accent(parts):
    """The turret is the one part the reader must find: paint its platter and pin orange."""
    orange = mat("turret-accent", (0.55, 0.13, 0.02), 0.42)
    for o in parts:
        n = o.name.lower()
        if n.startswith("turret.") and not any(k in n for k in ("gear", "servo", "slot")):
            o.data.materials.clear()
            o.data.materials.append(orange)


# ---------------------------------------------------------------- rig
def build_rig(parts):
    body = empty("body", (0, 0, 0), 0.05)
    turret = empty("turret", (0, 0, TURRET_Z * MM), 0.04)
    parent_keep(turret, body)

    # the true centre of each wheel, measured from the tyre it will carry: the origin of a part
    # that spins has to be the axis it spins about, not a number recomputed from the model
    wheel_centres = {}
    for o in parts:
        n = o.name.lower()
        if n.startswith("leg.") and ".tyre" in n:
            lid = n.split(".")[1]
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            c = sum(pts, Vector()) / 8.0
            wheel_centres[lid] = (c.x, c.y, c.z)

    legs = {}
    for lid in ("fl", "fr", "rl", "rr"):
        # Front legs hang off the front of the deck (hip x = +60, thigh 45 deg forward) and the rear
        # legs off the back (hip x = -60, thigh 45 deg backwards): the machine is a diamond, not a
        # table. Side comes from the second letter: l is +y, r is -y.
        sx = 1.0 if lid[0] == "f" else -1.0
        sy = 1.0 if lid[1] == "l" else -1.0
        hip_p = (sx * HIP_X * MM, sy * HIP_Y * MM, HIP_Z * MM)
        knee_p = (hip_p[0] + sx * KNEE_DROP * MM, hip_p[1], hip_p[2] - KNEE_DOWN * MM)
        wheel_p = wheel_centres.get(lid, (knee_p[0], knee_p[1], knee_p[2] - SHIN * MM))

        hip = empty("hip_" + lid, hip_p, 0.02)
        knee = empty("knee_" + lid, knee_p, 0.016)
        wheel = empty("wheel_" + lid, wheel_p, 0.014)
        # parent with the operator and re-evaluate between levels: a hand-written
        # matrix_parent_inverse taken before the depsgraph updates chains the offsets twice and the
        # wheel ends up orbiting a point a hand's width from its own axle.
        parent_keep(knee, hip)
        bpy.context.view_layer.update()
        parent_keep(wheel, knee)
        bpy.context.view_layer.update()
        parent_keep(hip, body)
        bpy.context.view_layer.update()
        legs[lid] = dict(hip=hip, knee=knee, wheel=wheel)
    bpy.context.view_layer.update()

    bpy.context.view_layer.update()

    # what actually turns: the tyre, its hub, the spokes and the rim. Everything else that sits
    # near the axle — the N20 gearbox, the axle itself, the dog collar, the fork, the brake servo
    # and its switch — is bolted to the shin and must not orbit the axle.
    WHEEL_PARTS = ("tyre", "hub", "spoke", "rim")
    SHIN_PARTS = ("shin", "knee", "fork", "collar", "spring", "brake", "switch", "boss",
                  "motor", "axle", "collar", "pin")
    loose = []
    for o in parts:
        n = o.name.lower()
        target = body
        if n.startswith("leg."):
            lid = n.split(".")[1] if len(n.split(".")) > 1 else ""
            leg = legs.get(lid)
            tail = n.split(".", 2)[-1]
            if leg is None:
                loose.append(o.name)
                target = body
            elif any(k in tail for k in WHEEL_PARTS):
                target = leg["wheel"]
            elif any(k in tail for k in SHIN_PARTS):
                target = leg["knee"]
            else:
                target = leg["hip"]
        elif n.startswith("turret.") or n.startswith("dock.") or n.startswith("phone."):
            target = turret
        parent_keep(o, target)
    if loose:
        print("[anim] WARNING unparented legs:", loose[:6])
    bpy.context.view_layer.update()
    return body, turret, legs


# ---------------------------------------------------------------- gait
def frac(v):
    return v - math.floor(v)


def smooth(t):
    return t * t * (3 - 2 * t)


def walk_at(phase):
    """Hip offset from stance (deg) and knee bend (deg) per leg, plus the body sway in mm."""
    out = {}
    for lid, off in WALK["order"].items():
        u = frac(phase - off)
        if u < WALK["duty"]:
            t = u / WALK["duty"]
            hip = WALK["sweep"] - 2 * WALK["sweep"] * t
            knee = 0.0
        else:
            s = (u - WALK["duty"]) / (1 - WALK["duty"])
            hip = -WALK["sweep"] + 2 * WALK["sweep"] * smooth(s)
            knee = WALK["knee"] * math.sin(math.pi * s)
        out[lid] = (hip, knee)
    down = [lid for lid, (h, k) in out.items() if k < 0.5]
    sway = 0.0
    if down:
        side = sum(1 if l[1] == "r" else -1 for l in down) / len(down)
        sway = -side * 9.0
    return out, sway


def key_rot(obj, frame, axis, deg):
    obj.rotation_mode = "XYZ"
    r = list(obj.rotation_euler)
    r[axis] = math.radians(deg)
    obj.rotation_euler = r
    obj.keyframe_insert("rotation_euler", frame=frame)


def key_loc(obj, frame):
    obj.keyframe_insert("location", frame=frame)


def clear_anim():
    for o in bpy.context.scene.objects:
        if o.animation_data:
            o.animation_data_clear()


# ---------------------------------------------------------------- clips
def clip_stand(body, turret, legs, frames):
    """Standing: the collars are home, the hips trim the body level, the turret scans."""
    for f in range(1, frames + 1, 2):
        t = (f - 1) / max(1, frames - 1)
        for lid, leg in legs.items():
            trim = 1.6 * math.sin(2 * math.pi * t + (0.5 if lid[1] == "r" else 0))
            key_rot(leg["hip"], f, 1, trim * (1.0 if lid[0] == "f" else -1.0))
            key_rot(leg["knee"], f, 1, 0)
            key_rot(leg["wheel"], f, 1, 0)
        key_rot(turret, f, 2, 34 * math.sin(2 * math.pi * t))
        body.location = (0, 0, 0)
        key_loc(body, f)


def clip_drive(body, turret, legs, frames):
    """Driving: brakes released, wheels turning, the body alive on its springs."""
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames - 1)
        spin = -360 * 1.6 * t
        for lid, leg in legs.items():
            key_rot(leg["hip"], f, 1, 0.8 * math.sin(2 * math.pi * 2 * t + (1.1 if lid[0] == "f" else 0)))
            key_rot(leg["knee"], f, 1, 0)
            key_rot(leg["wheel"], f, 1, spin)
        body.location = (0, 0.0012 * math.sin(2 * math.pi * 3 * t), 0.0006 * math.sin(2 * math.pi * 4 * t))
        key_loc(body, f)
        key_rot(turret, f, 2, 12 * math.sin(2 * math.pi * t))


def clip_walk(body, turret, legs, frames):
    """The crawl: one foot at a time in the lateral sequence, the body swaying over its support."""
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames - 1)
        phase = frac(t / WALK["period"] * WALK["period"] * 1.0) if False else frac(t * (frames / FPS) / WALK["period"])
        poses, sway = walk_at(phase)
        for lid, leg in legs.items():
            hip, knee = poses[lid]
            sgn = 1.0 if lid[0] == "f" else -1.0     # rear legs are mirrored about the hip
            # walk_at already speaks in deltas from stance: +-sweep for the hip, 0..knee for the
            # knee. Subtracting STANCE here asked for 63 deg where the geometry sits at 45.
            key_rot(leg["hip"], f, 1, hip * sgn)
            key_rot(leg["knee"], f, 1, -knee * sgn)
            key_rot(leg["wheel"], f, 1, 0)
        body.location = (0, sway * MM, 0.005 + 0.0008 * math.sin(2 * math.pi * 2 * t))
        key_loc(body, f)
        key_rot(turret, f, 2, 20 * math.sin(2 * math.pi * t))


def clip_turret(body, turret, legs, frames):
    """The pan turret alone: cameras ahead, then a sweep to the side and back."""
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames - 1)
        key_rot(turret, f, 2, 70 * math.sin(2 * math.pi * t + 0.9))
        for leg in legs.values():
            key_rot(leg["hip"], f, 1, 0)
            key_rot(leg["knee"], f, 1, 0)


CLIPS = dict(stand=clip_stand, drive=clip_drive, walk=clip_walk, turret=clip_turret)


# ---------------------------------------------------------------- camera and light
def look_from(az, el, dist, target):
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if cam.name not in bpy.context.scene.objects:
        bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    a, e = math.radians(az), math.radians(el)
    cam.location = Vector((target[0] + dist * math.cos(a) * math.cos(e),
                           target[1] + dist * math.sin(a) * math.cos(e),
                           target[2] + dist * math.sin(e)))
    d = Vector(target) - cam.location
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = d.to_track_quat("-Z", "Y")
    cam.data.lens = 62
    return cam


def area(name, at, rot, size, power, colour=(1, 1, 1)):
    lamp = bpy.data.lights.new(name, "AREA")
    lamp.energy = power
    lamp.size = size
    lamp.color = colour
    o = bpy.data.objects.new(name, lamp)
    o.location = Vector(at)
    o.rotation_mode = "XYZ"
    o.rotation_euler = rot
    bpy.context.collection.objects.link(o)
    return o


def light_rig():
    area("key", (0.55, -0.42, 0.72), (math.radians(52), 0, math.radians(52)), 0.55, 17)
    area("fill", (-0.62, -0.30, 0.40), (math.radians(72), 0, math.radians(-58)), 0.75, 5.5, (0.85, 0.90, 1.0))
    area("rim", (-0.20, 0.70, 0.55), (math.radians(58), 0, math.radians(196)), 0.40, 9, (1.0, 0.92, 0.82))
    area("top", (0.0, 0.0, 0.95), (0, 0, 0), 0.85, 3.5)


def floor():
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    p = bpy.context.object
    p.name = "floor"
    p.data.materials.append(mat("floor", (0.055, 0.058, 0.065), 0.55))
    return p


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    quick = "--quick" in argv
    only = None
    for a in argv:
        if a.startswith("--clip="):
            only = a.split("=", 1)[1]

    clean()
    parts = load()
    tune_materials()
    accent(parts)
    body, turret, legs = build_rig(parts)
    light_rig()
    floor()
    print("[anim] %d part objects" % len(parts))

    os.makedirs(OUT, exist_ok=True)
    target = (0.0, 0.0, 0.155)
    look_from(-58, 19, 1.42, target)
    bpy.context.scene.render.resolution_x = 1280
    bpy.context.scene.render.resolution_y = 960
    bpy.context.scene.render.resolution_percentage = 50 if quick else 100
    bpy.context.scene.render.fps = FPS

    plan = [("stand", 60), ("drive", 72), ("walk", 96), ("turret", 72)]
    for name, frames in plan:
        if only and name != only:
            continue
        clear_anim()
        if quick:
            frames = min(frames, 12)
        CLIPS[name](body, turret, legs, frames)
        sc = bpy.context.scene
        sc.frame_start, sc.frame_end = 1, frames
        folder = os.path.join(OUT, name)
        os.makedirs(folder, exist_ok=True)
        sc.render.filepath = os.path.join(folder, "f####")
        if quick:
            sc.frame_set(max(2, int(frames * 0.62)))
            sc.render.filepath = os.path.join(OUT, name + "-still.png")
            bpy.ops.render.render(write_still=True)
            print("[anim] %s: still -> %s" % (name, sc.render.filepath))
        else:
            bpy.ops.render.render(animation=True)
            print("[anim] %s: %d frames -> %s" % (name, frames, folder))
    print("[anim] done")


main()
