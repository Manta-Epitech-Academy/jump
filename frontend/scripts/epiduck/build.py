"""
EpiDuck, modelled and rendered (#539).

This script is the source of the duck's drawing: it builds him in an empty
Blender scene, renders every layer the talent space stacks, and writes the
atlas and its manifest next to `EpiDuck.svelte`. Nothing it writes is edited by
hand; change this file and run it again:

    cd frontend && bun run art:epiduck

which is `blender -b --factory-startup --python scripts/epiduck/build.py`.
Blender (5.3 or later) is needed only here, never by the app, CI or `verify`,
and the output is committed. On one machine a rerun writes the same bytes, so
a diff in the atlas is a change to this file; another GPU may differ by a few
anti-aliased pixels.

What it writes, in `src/lib/components/mascot/art/`:
  - `epiduck.webp`: one row per pose (profile, front), one cell per layer;
  - `epiduck.json`: where each cell is, each pose's size, where his eyes are
    and how far the pupils travel when he looks somewhere.

The layers are stacked by `EpiDuck.svelte` in this order: body, scarf, pupils
or lids, glasses, hair. Each layer is rendered alone with the body as a holdout,
so it holds only what the body does not hide (the back of a scarf, the far
temple of a pair of glasses), and stacking them gives the same picture as
rendering the dressed duck. That is what makes one atlas enough for every
combination instead of a picture per combination. The eye whites have a cell
of their own besides: the component clips the pupils to it.

He is cel-shaded, flat colours lit by one sun, with no shadows (a shadow cast
by a hat would be missing from the body's layer) and no outline: the white
sticker outline is drawn around the whole stack by the component, so it goes
round whatever he wears.

His colours are read from `art/palette.json`, the only place they are written,
which `art/palette.ts` also reads for the settings card's swatches.
"""

import json
import math
import os
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.normpath(
    os.path.join(HERE, "..", "..", "src", "lib", "components", "mascot", "art")
)

with open(os.path.join(ART, "palette.json"), encoding="utf-8") as f:
    PALETTE = json.load(f)

SCENE = "EpiDuck"
# Pixels per Blender unit in the rendered cells. The duck is about 2.4 units
# tall with a beanie on, so a cell is ~290 px high: the settings card draws the
# front pose 112 px high, which a phone shows at 3x.
PX_PER_UNIT = 120
RENDER_PX = 480
# The white sticker outline the component draws round the stack, in cell
# pixels (it scales with the duck), and the room left for it round each cell.
OUTLINE_PX = 9
MARGIN_PX = OUTLINE_PX + 4
WEBP_QUALITY = 90

POSES = ("side", "front")
HAIRS = ("tuft", "crest", "fringe", "beanie")
GLASSES = ("round", "sun", "geek")
SCARVES = tuple(PALETTE["scarf"].keys())

# ---- Proportions ---------------------------------------------------------------
# The duck faces +X, Z is up, the water line is Z = 0. The profile camera looks
# from -Y, so he faces right in it; the front camera looks from +X.

HEAD = Vector((0.4, 0.0, 1.52))
HEAD_R = 0.6
# Where his eyes sit on the head: turned this far from straight ahead, and
# raised this far above the head's equator.
EYE_TURN = math.radians(36)
EYE_RAISE = math.radians(14)
EYE_R = 0.2
EYE_RADII = Vector((EYE_R, EYE_R * 1.12, EYE_R * 0.92))
PUPIL_R = 0.12

# Where his pupils rest in each pose, and how far (in cell pixels) a gaze of 1
# moves them. Both eyes look at one point, so they converge on it: an eye
# turned outward with its pupil in its own middle looks walleyed. Facing the
# reader he looks at the reader; in profile, ahead of him and a little towards
# the reader, the way he swims. The travel is generous because the component
# clips the pupils to the eye whites: looking hard to one side, a pupil sits
# against the edge of its eye, never past it.
GAZE = {
    "side": {"target": Vector((2.2, -3.0, 1.45)), "travel": (7.0, 8.0)},
    "front": {"target": Vector((14.0, 0.0, 1.3)), "travel": (8.0, 7.5)},
}


# ---- Colour and materials ------------------------------------------------------


def linear(hex_colour):
    """An sRGB hex colour as the linear RGBA a shader node takes."""
    h = hex_colour.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def toon(name, tones, alpha=1.0):
    """
    A cel material: three flat tones (shade, base, light) picked by how much
    sun a point receives, emitted as is so the palette's hex comes out exact.
    `alpha` below 1 lets what is behind show through (a tinted lens).
    """
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    stops = ramp.color_ramp.elements
    stops[0].position = 0.0
    stops[0].color = linear(tones["shade"])
    stops[1].position = 0.22
    stops[1].color = linear(tones["base"])
    light = stops.new(0.93)
    light.color = linear(tones["light"])
    emission = nt.nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    nt.links.new(diffuse.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emission.inputs["Color"])
    if alpha < 1.0:
        # Blended, not dithered: a lens is a tint, never a speckle.
        mat.surface_render_method = "BLENDED"
        transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = alpha
        nt.links.new(transparent.outputs[0], mix.inputs[1])
        nt.links.new(emission.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
    else:
        nt.links.new(emission.outputs[0], out.inputs["Surface"])
    return mat


def flat(name, hex_colour):
    """One colour whatever the light: a catchlight, a lash line."""
    return toon(name, {"shade": hex_colour, "base": hex_colour, "light": hex_colour})


# ---- Geometry helpers ----------------------------------------------------------


def collection(scene, name):
    coll = bpy.data.collections.new(name)
    scene.collection.children.link(coll)
    return coll


def link(obj, coll, mat=None):
    coll.objects.link(obj)
    if mat is not None:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    return obj


def smooth(mesh):
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()


def sphere_mesh(name, segments=48, rings=24):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bm.to_mesh(mesh)
    bm.free()
    smooth(mesh)
    return mesh


def ellipsoid(name, coll, mat, loc, radii, rot=(0, 0, 0)):
    obj = bpy.data.objects.new(name, sphere_mesh(name))
    obj.location = loc
    obj.scale = radii
    obj.rotation_euler = Euler(rot)
    return link(obj, coll, mat)


def tube(name, coll, mat, points, bevel=1.0, closed=False, resolution=12):
    """
    A round stroke through `points`, each `(position, radius)`: a feather, a
    strand of hair, a glasses frame. Radii taper the stroke to a point.
    """
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_mode = "ROUND"
    curve.bevel_depth = bevel
    curve.bevel_resolution = 6
    curve.resolution_u = resolution
    curve.use_fill_caps = True
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for p, (co, radius) in zip(spline.points, points):
        p.co = (*co, 1.0)
        p.radius = radius
    spline.order_u = min(4, len(points))
    spline.use_endpoint_u = not closed
    spline.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, curve)
    return link(obj, coll, mat)


def on_head(turn, raise_, lift=0.0):
    """A point on the head's surface (plus `lift`), and the normal there."""
    n = Vector(
        (
            math.cos(raise_) * math.cos(turn),
            math.cos(raise_) * math.sin(turn),
            math.sin(raise_),
        )
    )
    return HEAD + n * (HEAD_R + lift), n


def facing(normal, roll=0.0):
    """A rotation that turns local +Z onto `normal`."""
    q = Vector((0, 0, 1)).rotation_difference(normal)
    return (q @ Matrix.Rotation(roll, 4, "Z").to_quaternion()).to_euler()


def fused(name, coll, mat, parts, voxel=0.018, iterations=24):
    """
    One smooth surface from overlapping ellipsoids, each `(centre, radii,
    rotation)`: a voxel remesh welds them, a smooth rounds the seams into the
    soft joins of a rubber toy.
    """
    bm = bmesh.new()
    for centre, radii, rot in parts:
        part = bmesh.new()
        bmesh.ops.create_uvsphere(part, u_segments=48, v_segments=24, radius=1.0)
        m = (
            Matrix.Translation(centre)
            @ Euler(rot).to_matrix().to_4x4()
            @ Matrix.Diagonal((*radii, 1.0))
        )
        bmesh.ops.transform(part, matrix=m, verts=part.verts)
        tmp = bpy.data.meshes.new("tmp")
        part.to_mesh(tmp)
        part.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    smooth(mesh)
    obj = link(bpy.data.objects.new(name, mesh), coll, mat)
    remesh = obj.modifiers.new("weld", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = voxel
    remesh.use_smooth_shade = True
    rounding = obj.modifiers.new("round", "SMOOTH")
    rounding.factor = 1.0
    rounding.iterations = iterations
    return obj


# ---- The duck -------------------------------------------------------------------


def eye_point(side, lift):
    """
    The centre of the eye on `side` (-1 his right, 1 his left), set a little
    into the head, moved `lift` along its normal; and that normal.
    """
    at, n = on_head(side * EYE_TURN, EYE_RAISE, lift=-0.06)
    return at + n * lift, n


def build_body(coll):
    """Body, head, beak, wings and eye whites: what every layer stands on."""
    blue = toon("body", PALETTE["body"])
    fused(
        "body",
        coll,
        blue,
        [
            # The hull: long, low, flat underneath like a rubber duck's.
            (Vector((-0.05, 0.0, 0.48)), (0.98, 0.74, 0.46), (0, 0, 0)),
            # The breast, rounder and forward.
            (Vector((0.38, 0.0, 0.6)), (0.6, 0.66, 0.52), (0, 0, 0)),
            # The tail, rising to a point at the back.
            (Vector((-0.8, 0.0, 0.8)), (0.5, 0.3, 0.22), (0, math.radians(40), 0)),
            # The neck, then the head.
            (Vector((0.38, 0.0, 1.0)), (0.4, 0.42, 0.4), (0, 0, 0)),
            (HEAD, (HEAD_R, HEAD_R * 0.97, HEAD_R), (0, 0, 0)),
            # Cheeks, so the face reads round from the front.
            (HEAD + Vector((0.16, 0.0, -0.16)), (0.42, 0.56, 0.36), (0, 0, 0)),
        ],
    )

    wing = toon("wing", PALETTE["wing"])
    for side in (-1, 1):
        ellipsoid(
            f"wing{'L' if side < 0 else 'R'}",
            coll,
            wing,
            (-0.25, side * 0.66, 0.68),
            (0.42, 0.12, 0.22),
            (math.radians(-side * 8), math.radians(24), math.radians(side * 6)),
        )

    beak = toon("beak", PALETTE["beak"])
    tip = HEAD + Vector((HEAD_R * 0.86, 0, -0.16))
    # A rubber duck's bill: wide and flat, the upper half over the lower.
    ellipsoid(
        "beakUpper",
        coll,
        beak,
        tip + Vector((0.12, 0, 0.03)),
        (0.34, 0.34, 0.13),
        (0, math.radians(6), 0),
    )
    ellipsoid(
        "beakLower",
        coll,
        toon("beakLower", PALETTE["beakLower"]),
        tip + Vector((0.08, 0, -0.08)),
        (0.27, 0.27, 0.1),
        (0, math.radians(-4), 0),
    )


def eye_white(side):
    """The eye white on `side`: its centre and its rotation."""
    at, n = eye_point(side, 0.0)
    return at, facing(n)


def build_eyes(coll):
    """
    The eye whites, a layer of their own: drawn with the body, and alone they
    are the shape the component clips the pupils to.
    """
    white = toon("eyeWhite", PALETTE["eyeWhite"])
    for side in (-1, 1):
        at, rot = eye_white(side)
        ellipsoid(f"eye{side}", coll, white, at, EYE_RADII, rot)


def on_eye(side, target):
    """Where the line from the eye's centre to `target` leaves the eye white."""
    at, rot = eye_white(side)
    d = (target - at).normalized()
    local = rot.to_matrix().inverted() @ d
    reach = (
        1
        / Vector(
            (local.x / EYE_RADII.x, local.y / EYE_RADII.y, local.z / EYE_RADII.z)
        ).length
    )
    return at + d * reach, d


def build_pupils(coll, target):
    """
    The pupils and their catchlights, both looking at `target`, moved as one
    when he looks somewhere. Rebuilt for each pose (see `GAZE`).
    """
    for obj in list(coll.objects):
        bpy.data.objects.remove(obj)
    pupil = toon("pupil", PALETTE["pupil"])
    shine = flat("shine", PALETTE["eyeWhite"]["base"])
    up = Vector((0, 0, 1))
    for side in (-1, 1):
        at, d = on_eye(side, target)
        ellipsoid(
            f"pupil{side}",
            coll,
            pupil,
            at - d * PUPIL_R * 0.2,
            (PUPIL_R, PUPIL_R * 1.1, PUPIL_R * 0.45),
            facing(d),
        )
        across = d.cross(up).normalized()
        ellipsoid(
            f"shine{side}",
            coll,
            shine,
            at + d * 0.03 + up * PUPIL_R * 0.42 - across * PUPIL_R * 0.32,
            (PUPIL_R * 0.3,) * 3,
        )


def build_lids(coll):
    """Closed eyes: a lid over each eye white and the line where it shuts."""
    blue = toon("lid", PALETTE["body"])
    ink = flat("lash", PALETTE["ink"]["base"])
    up = Vector((0, 0, 1))
    lid_radii = EYE_RADII * 1.05
    for side in (-1, 1):
        at, rot = eye_white(side)
        ellipsoid(f"lid{side}", coll, blue, at, lid_radii, rot)
        _, n = eye_point(side, 0.0)
        across = n.cross(up).normalized()
        # The lash follows the lid's surface, bowed down a little: a smile.
        pts = []
        for t in (-1, -0.5, 0, 0.5, 1):
            x = t * lid_radii.x * 0.88
            y = -(1 - t * t) * lid_radii.y * 0.28
            depth = lid_radii.z * math.sqrt(
                max(0.0, 1 - (x / lid_radii.x) ** 2 - (y / lid_radii.y) ** 2)
            )
            pts.append(
                (
                    tuple(at + across * x + up * y + n * (depth + 0.012)),
                    0.6 + 0.4 * (1 - abs(t)),
                )
            )
        tube(f"lash{side}", coll, ink, pts, bevel=0.04)


# ---- Hair -------------------------------------------------------------------------

TOP = HEAD + Vector((0, 0, HEAD_R))


def build_tuft(coll):
    """The two curled feathers he is born with."""
    blue = toon("tuft", PALETTE["body"])
    tube(
        "tuftFront",
        coll,
        blue,
        [
            (TOP + Vector((-0.02, 0, -0.14)), 1.0),
            (TOP + Vector((0.0, 0, 0.1)), 0.9),
            (TOP + Vector((0.1, 0, 0.25)), 0.65),
            (TOP + Vector((0.24, 0, 0.27)), 0.38),
            (TOP + Vector((0.28, 0, 0.17)), 0.12),
        ],
        bevel=0.1,
    )
    tube(
        "tuftBack",
        coll,
        blue,
        [
            (TOP + Vector((-0.1, 0, -0.14)), 0.8),
            (TOP + Vector((-0.14, 0, 0.06)), 0.7),
            (TOP + Vector((-0.24, 0, 0.15)), 0.42),
            (TOP + Vector((-0.33, 0, 0.12)), 0.1),
        ],
        bevel=0.08,
    )


def build_crest(coll):
    """A punk's crest of soft orange spikes, tallest over the crown."""
    orange = toon("crest", PALETTE["crest"])
    spikes = [(55, 0.26), (75, 0.38), (95, 0.42), (115, 0.36), (135, 0.24)]
    for i, (angle, length) in enumerate(spikes):
        a = math.radians(angle)
        n = Vector((math.cos(a), 0, math.sin(a)))
        lean = Vector((-0.1, 0, 0.02))
        tube(
            f"spike{i}",
            coll,
            orange,
            [
                (HEAD + n * (HEAD_R - 0.1), 1.0),
                (HEAD + n * (HEAD_R + length * 0.45) + lean * 0.4, 0.75),
                (HEAD + n * (HEAD_R + length) + lean, 0.08),
            ],
            bevel=0.11,
        )


def head_shell(name, coll, mat, lift, keep, scale=(1, 1, 1), ribs=0, rib_depth=0.0):
    """
    A cap over the head, `lift` above it: the part of a sphere where
    `keep(normal)` holds. `ribs` furrows it from the crown down, as knitting.
    """
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0)
    gone = [v for v in bm.verts if not keep(v.co.normalized())]
    bmesh.ops.delete(bm, geom=gone, context="VERTS")
    for v in bm.verts:
        n = v.co.normalized()
        r = HEAD_R + lift
        if ribs:
            r += rib_depth * math.cos(ribs * math.atan2(n.y, n.x))
        v.co = HEAD + Vector((n.x * scale[0], n.y * scale[1], n.z * scale[2])) * r
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.02)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    smooth(mesh)
    return link(bpy.data.objects.new(name, mesh), coll, mat)


def build_fringe(coll):
    """A swept fringe: thick locks from the crown, falling over his brow."""
    hair = toon("fringe", PALETTE["fringe"])
    # (turn, raise) at the crown and at the tip, in degrees, and thickness.
    locks = [
        ((-120, 70), (-70, 30), 0.16),
        ((-170, 78), (-42, 26), 0.19),
        ((150, 80), (-12, 30), 0.19),
        ((110, 72), (16, 38), 0.16),
        ((80, 62), (40, 44), 0.13),
    ]
    for i, ((t0, r0), (t1, r1), bevel) in enumerate(locks):
        pts = []
        for k, f in enumerate((0.0, 0.3, 0.6, 0.85, 1.0)):
            turn = math.radians(t0 + (t1 - t0) * f)
            raise_ = math.radians(r0 + (r1 - r0) * f)
            at, _ = on_head(turn, raise_, lift=0.04 + 0.08 * math.sin(f * math.pi))
            pts.append((tuple(at), (0.8, 1.0, 0.95, 0.6, 0.12)[k]))
        tube(f"lock{i}", coll, hair, pts, bevel=bevel)


def build_beanie(coll):
    """A knitted beanie with a turned-up cuff and a pompom."""
    red = toon("beanie", PALETTE["beanie"])
    white = toon("beanieTrim", PALETTE["beanieTrim"])
    tilt = Vector((-0.25, 0, 1)).normalized()
    rim = 0.5
    head_shell(
        "beanieCrown",
        coll,
        red,
        0.05,
        lambda n: n.dot(tilt) > rim,
        scale=(1, 1, 1.12),
        ribs=28,
        rib_depth=0.012,
    )
    # The cuff: a ribbed band round the rim of the crown.
    u = Vector((1, 0, 0)).cross(tilt).normalized().cross(tilt).normalized()
    v = tilt.cross(u).normalized()
    centre = HEAD + tilt * (HEAD_R + 0.05) * rim
    radius = (HEAD_R + 0.05) * math.sqrt(1 - rim * rim) + 0.02
    bm = bmesh.new()
    rings = []
    for h in (-0.1, -0.05, 0.05, 0.11):
        ring = []
        for k in range(128):
            a = 2 * math.pi * k / 128
            bulge = 0.03 * math.cos(h / 0.11 * math.pi / 2) + 0.01 * math.cos(40 * a)
            d = u * math.cos(a) + v * math.sin(a)
            ring.append(bm.verts.new(centre + tilt * h + d * (radius + bulge)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(128):
            bm.faces.new((r0[k], r0[(k + 1) % 128], r1[(k + 1) % 128], r1[k]))
    mesh = bpy.data.meshes.new("beanieCuff")
    bm.to_mesh(mesh)
    bm.free()
    smooth(mesh)
    link(bpy.data.objects.new("beanieCuff", mesh), coll, white)
    # The pompom: a sphere roughened into fluff, the same fluff on every run.
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.17)
    for vert in bm.verts:
        n = vert.co.normalized()
        bump = (
            0.025
            * math.sin(11 * n.x + 3)
            * math.sin(13 * n.y + 1)
            * math.sin(9 * n.z + 2)
        )
        vert.co = n * (0.17 + bump)
    mesh = bpy.data.meshes.new("pompom")
    bm.to_mesh(mesh)
    bm.free()
    smooth(mesh)
    pompom = link(bpy.data.objects.new("pompom", mesh), coll, white)
    pompom.location = HEAD + tilt * (HEAD_R * 1.12 + 0.15)


HAIR_BUILDERS = {
    "tuft": build_tuft,
    "crest": build_crest,
    "fringe": build_fringe,
    "beanie": build_beanie,
}


# ---- Glasses ------------------------------------------------------------------------


def lens_frame(side):
    """Centre and axes (across, up, out) of the lens in front of one eye."""
    # Halfway between straight ahead and the eye's own direction: a real frame
    # is nearly flat, and his head is round.
    turn = side * EYE_TURN * 0.7
    out = Vector(
        (
            math.cos(EYE_RAISE) * math.cos(turn),
            math.cos(EYE_RAISE) * math.sin(turn),
            math.sin(EYE_RAISE),
        )
    )
    _, eye_n = on_head(side * EYE_TURN, EYE_RAISE)
    centre = HEAD + eye_n * (HEAD_R + EYE_R * 0.75)
    across = Vector((0, 0, 1)).cross(out).normalized()
    up = out.cross(across).normalized()
    return centre, across, up, out


def outline_2d(shape, w, h, steps=48):
    """Points round a lens: an ellipse, or a rounded rectangle."""
    pts = []
    for k in range(steps):
        a = 2 * math.pi * k / steps
        c, s_ = math.cos(a), math.sin(a)
        if shape == "round":
            pts.append((w * c, h * s_))
        else:
            # A superellipse: square with round corners.
            e = 2 / (5 if shape == "square" else 3.2)
            x = w * math.copysign(abs(c) ** e, c)
            y = h * math.copysign(abs(s_) ** e, s_)
            if shape == "sun" and y < 0:
                # Wayfarer lenses narrow towards the cheek.
                x *= 1 + 0.18 * y / h
            pts.append((x, y))
    return pts


def lens_points(side, shape, w, h):
    centre, across, up, _ = lens_frame(side)
    return [tuple(centre + across * x + up * y) for x, y in outline_2d(shape, w, h)]


def lens_fill(name, coll, mat, side, shape, w, h, inset=0.0):
    centre, across, up, out = lens_frame(side)
    bm = bmesh.new()
    rim = [
        bm.verts.new(centre + across * x + up * y - out * inset)
        for x, y in outline_2d(shape, w * 0.98, h * 0.98)
    ]
    bm.faces.new(rim)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new(name, mesh), coll, mat)


def temples(coll, mat, shape, w, bevel):
    """The arms, from each lens's outer edge back to above his ear hole."""
    for side in (-1, 1):
        centre, across, up, out = lens_frame(side)
        hinge = centre + across * w * side
        a, _ = on_head(side * math.radians(70), EYE_RAISE + math.radians(6), lift=0.05)
        b, _ = on_head(side * math.radians(110), EYE_RAISE + math.radians(2), lift=0.03)
        tube(
            f"temple{side}",
            coll,
            mat,
            [(tuple(hinge), 1), (tuple(a), 1), (tuple(b), 1)],
            bevel=bevel,
        )


def bridge(coll, mat, w, bevel, lift=0.06):
    """The bar between the lenses, arched a little forward over the beak."""
    right, right_across, _, right_out = lens_frame(-1)
    left, left_across, _, left_out = lens_frame(1)
    tube(
        "bridge",
        coll,
        mat,
        [
            (tuple(right + right_across * w), 1),
            (
                tuple(
                    (right + left) / 2
                    + (right_out + left_out) / 2 * lift
                    + Vector((0, 0, 0.03))
                ),
                1,
            ),
            (tuple(left - left_across * w), 1),
        ],
        bevel=bevel,
    )


def glasses(coll, shape, w, h, bevel, lens_mat=None):
    ink = toon("frame", PALETTE["ink"])
    for side in (-1, 1):
        tube(
            f"rim{side}",
            coll,
            ink,
            [(p, 1) for p in lens_points(side, shape, w, h)],
            bevel=bevel,
            closed=True,
        )
        if lens_mat is not None:
            lens_fill(f"lens{side}", coll, lens_mat, side, shape, w, h)
    bridge(coll, ink, w, bevel)
    temples(coll, ink, shape, w, bevel * 0.8)


def build_round(coll):
    glasses(coll, "round", EYE_R * 1.3, EYE_R * 1.3, 0.028)


def build_sun(coll):
    lens = toon("sunLens", PALETTE["lens"])
    glasses(coll, "sun", EYE_R * 1.45, EYE_R * 1.1, 0.035, lens)
    shine = flat("sunShine", PALETTE["eyeWhite"]["base"])
    for side in (-1, 1):
        centre, across, up, out = lens_frame(side)
        tube(
            f"glint{side}",
            coll,
            shine,
            [
                (tuple(centre + out * 0.01 + across * -0.1 + up * 0.08), 0.6),
                (tuple(centre + out * 0.01 + across * 0.0 + up * 0.0), 1.0),
                (tuple(centre + out * 0.01 + across * 0.07 + up * -0.06), 0.6),
            ],
            bevel=0.018,
        )


def build_geek(coll):
    tint = toon("geekLens", PALETTE["eyeWhite"], alpha=0.22)
    glasses(coll, "square", EYE_R * 1.35, EYE_R * 1.15, 0.05, tint)


GLASSES_BUILDERS = {"round": build_round, "sun": build_sun, "geek": build_geek}


# ---- Scarf ----------------------------------------------------------------------------


def band(name, coll, path, width, thickness, ups, stripes=(), knit=0.0):
    """
    A flat knitted band along `path` (points), `ups` giving its broad side's
    direction at each point. Faces whose position along the band falls in a
    `stripes` interval take the second material (the white stripes).
    """
    bm = bmesh.new()
    n = len(path)
    sections = []
    for i, (p, up) in enumerate(zip(path, ups)):
        ahead = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        side = ahead.cross(up).normalized()
        up = side.cross(ahead).normalized()
        swell = 1 + knit * math.cos(i * 1.7) if knit else 1
        ring = []
        for k in range(16):
            a = 2 * math.pi * k / 16
            ring.append(
                bm.verts.new(
                    p
                    + up * math.cos(a) * width / 2 * swell
                    + side * math.sin(a) * thickness / 2 * swell
                )
            )
        sections.append(ring)
    for i, (r0, r1) in enumerate(zip(sections, sections[1:])):
        t = (i + 0.5) / (n - 1)
        striped = any(a <= t <= b for a, b in stripes)
        for k in range(16):
            f = bm.faces.new((r0[k], r0[(k + 1) % 16], r1[(k + 1) % 16], r1[k]))
            f.material_index = 1 if striped else 0
    bm.faces.new(sections[0][::-1])
    bm.faces.new(sections[-1])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    smooth(mesh)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    return obj


NECK = Vector((0.34, 0.0, 1.0))


def build_scarf(coll):
    """Wrapped once round the neck, knotted on his left, two ends hanging."""
    loop = []
    ups = []
    tilt = math.radians(14)
    for k in range(65):
        a = 2 * math.pi * k / 64
        p = Vector((0.52 * math.cos(a), 0.54 * math.sin(a), 0))
        p = Matrix.Rotation(tilt, 3, "Y") @ p
        loop.append(NECK + p)
        ups.append(Matrix.Rotation(tilt, 3, "Y") @ Vector((0, 0, 1)))
    wrap = band("scarfWrap", coll, loop, 0.27, 0.13, ups, knit=0.08)
    knot_at = NECK + Matrix.Rotation(tilt, 3, "Y") @ Vector((0.46, -0.3, -0.02))
    ends = []
    for i, (dy, swing) in enumerate(((-0.06, -0.1), (0.07, 0.06))):
        pts = [knot_at + Vector((0.02, dy, -0.02))]
        for f in (k / 16 for k in range(1, 17)):
            pts.append(
                knot_at
                + Vector((0.14 * f + 0.04 * math.sin(f * 3), dy + swing * f, -0.5 * f))
            )
        ends.append(
            band(
                f"scarfEnd{i}",
                coll,
                pts,
                0.22,
                0.08,
                [Vector((-0.2, 1, 0)).normalized()] * len(pts),
                stripes=((0.6, 0.68), (0.76, 0.84)),
            )
        )
    knot = bpy.data.objects.new("knot", sphere_mesh("knot"))
    knot.location = knot_at + Vector((0.03, 0, 0))
    knot.scale = (0.13, 0.15, 0.13)
    coll.objects.link(knot)
    for obj in (wrap, knot, *ends):
        obj.data.materials.append(None)
        obj.data.materials.append(toon("scarfStripe", PALETTE["scarfStripe"]))


def dress_scarf(layers, colour):
    """Give the scarf one of its colours; the stripes stay white."""
    mat = toon(f"scarf.{colour}", PALETTE["scarf"][colour])
    for obj in layers["scarf"].objects:
        obj.data.materials[0] = mat


# ---- Scene, cameras, light --------------------------------------------------------

# Each pose: where its camera stands, and where the sun comes from (above, and
# from the viewer's left, as on every page of the charte's illustrations).
CAMERAS = {
    "side": {"eye": Vector((0.0, -10.0, 1.15)), "sun": Vector((-0.45, -0.6, 0.75))},
    "front": {"eye": Vector((10.0, 0.0, 1.15)), "sun": Vector((0.6, 0.45, 0.75))},
}


def new_scene():
    old = bpy.data.scenes.get(SCENE)
    if old is not None:
        for coll in list(old.collection.children):
            for obj in list(coll.objects):
                bpy.data.objects.remove(obj)
            bpy.data.collections.remove(coll)
        for obj in list(old.collection.objects):
            bpy.data.objects.remove(obj)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new(SCENE)
    world = bpy.data.worlds.get(SCENE) or bpy.data.worlds.new(SCENE)
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Strength"].default_value = 0.0
    scene.world = world

    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.render.film_transparent = True
    scene.render.filter_size = 1.2
    scene.render.resolution_x = RENDER_PX
    scene.render.resolution_y = RENDER_PX
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.display_settings.display_device = "sRGB"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"

    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = RENDER_PX / PX_PER_UNIT
    scene.collection.objects.link(cam)
    scene.camera = cam

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    # Diffuse white under a sun of strength pi comes out at 1 where it faces it.
    sun.data.energy = math.pi
    sun.data.use_shadow = False
    sun.data.angle = 0
    scene.collection.objects.link(sun)
    return scene


def aim(scene, pose):
    """Point the camera and the sun for `pose`."""
    cam = scene.camera
    eye = CAMERAS[pose]["eye"]
    cam.location = eye
    target = Vector((0.0, 0.0, eye.z))
    cam.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    sun = scene.objects["sun"]
    sun.rotation_euler = (
        CAMERAS[pose]["sun"].normalized().to_track_quat("Z", "Y").to_euler()
    )


def build():
    """The scene with every layer in it, each in its own collection."""
    scene = new_scene()
    layers = {}

    def layer(name):
        layers[name] = collection(scene, name)
        return layers[name]

    build_body(layer("body"))
    build_eyes(layer("eyes"))
    build_pupils(layer("pupils"), GAZE["front"]["target"])
    build_lids(layer("lids"))
    for hair in HAIRS:
        HAIR_BUILDERS[hair](layer(f"hair.{hair}"))
    for glasses in GLASSES:
        GLASSES_BUILDERS[glasses](layer(f"glasses.{glasses}"))
    # One scarf, rendered once per colour (see `render_layers`).
    build_scarf(layer("scarf"))
    return scene, layers


# ---- Rendering --------------------------------------------------------------------


def layer_names():
    """Every cell of a pose, in the atlas's order."""
    return [
        "body",
        "eyes",
        "pupils",
        "lids",
        *(f"hair.{h}" for h in HAIRS),
        *(f"glasses.{g}" for g in GLASSES),
        *(f"scarf.{c}" for c in SCARVES),
    ]


# What every layer stands on: drawn by the `body` layer, a holdout for the rest.
BASE = ("body", "eyes")


def render_layer(scene, layers, name, path):
    """
    One layer alone, top row first, as straight RGBA floats: the body and its
    eyes hide what is behind them (a holdout) and every other layer is left
    out. The `body` layer draws both; the `eyes` layer draws the eye whites
    alone, where the body does not hide them.
    """
    collection_name = "scarf" if name.startswith("scarf.") else name
    if name.startswith("scarf."):
        dress_scarf(layers, name.split(".", 1)[1])
    for coll in layers.values():
        coll.hide_render = coll.name not in (collection_name, *BASE)
    for base in BASE:
        for obj in layers[base].objects:
            obj.is_holdout = collection_name not in ("body", base)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return np.flipud(px.reshape(h, w, 4))


def crop_box(images):
    """The smallest box holding every layer of a pose, plus the outline's room."""
    alpha = np.max([im[..., 3] for im in images], axis=0)
    rows = np.where(alpha.max(axis=1) > 0)[0]
    cols = np.where(alpha.max(axis=0) > 0)[0]
    top = max(rows[0] - MARGIN_PX, 0)
    left = max(cols[0] - MARGIN_PX, 0)
    bottom = min(rows[-1] + 1 + MARGIN_PX, alpha.shape[0])
    right = min(cols[-1] + 1 + MARGIN_PX, alpha.shape[1])
    return top, left, bottom, right


def eye_in_cell(scene, pose, top, left):
    """
    Where his eyes are in the pose's cell, in pixels: the near eye in profile,
    between the two facing the reader. The component aims his gaze from there.
    """
    if pose == "side":
        centre, _ = eye_white(-1)
    else:
        centre = (eye_white(-1)[0] + eye_white(1)[0]) / 2
    # The camera is orthographic: a point's place in the frame is its offset
    # from the camera along the frame's own right and up.
    cam = scene.camera
    rot = cam.rotation_euler.to_matrix()
    offset = centre - cam.location
    px = offset.dot(rot @ Vector((1, 0, 0))) * PX_PER_UNIT + RENDER_PX / 2
    py = RENDER_PX / 2 - offset.dot(rot @ Vector((0, 1, 0))) * PX_PER_UNIT
    return {"x": round(px - left, 1), "y": round(py - top, 1)}


def pupil_travel(pose):
    """How far, in cell pixels, the pupils move for a gaze of 1 on each axis."""
    x, y = GAZE[pose]["travel"]
    return {"x": x, "y": y}


def save_webp(pixels, path):
    """Write top-row-first straight RGBA floats as a WebP."""
    h, w = pixels.shape[:2]
    pixels = pixels.copy()
    # Fully transparent pixels carry no colour, which compresses better.
    pixels[pixels[..., 3] == 0] = 0
    img = bpy.data.images.new("epiduck-atlas", w, h, alpha=True)
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.flipud(pixels).ravel())
    img.filepath_raw = path
    img.file_format = "WEBP"
    img.save(filepath=path, quality=WEBP_QUALITY)
    bpy.data.images.remove(img)


def main():
    scene, layers = build()
    names = layer_names()
    rows = {}
    eyes = {}
    with tempfile.TemporaryDirectory() as tmp:
        for pose in POSES:
            aim(scene, pose)
            build_pupils(layers["pupils"], GAZE[pose]["target"])
            images = [
                render_layer(
                    scene, layers, name, os.path.join(tmp, f"{pose}-{name}.png")
                )
                for name in names
            ]
            top, left, bottom, right = crop_box(images)
            rows[pose] = [im[top:bottom, left:right] for im in images]
            eyes[pose] = eye_in_cell(scene, pose, top, left)

    width = max(len(cells) * cells[0].shape[1] for cells in rows.values())
    height = sum(cells[0].shape[0] for cells in rows.values())
    atlas = np.zeros((height, width, 4), dtype=np.float32)
    manifest = {"width": width, "height": height, "outline": OUTLINE_PX, "poses": {}}
    y = 0
    for pose, cells in rows.items():
        h, w = cells[0].shape[:2]
        for i, cell in enumerate(cells):
            atlas[y : y + h, i * w : (i + 1) * w] = cell
        manifest["poses"][pose] = {
            "y": y,
            "width": w,
            "height": h,
            "cells": {name: i * w for i, name in enumerate(names)},
            "eyes": eyes[pose],
            "pupilTravel": pupil_travel(pose),
        }
        y += h

    save_webp(atlas, os.path.join(ART, "epiduck.webp"))
    with open(os.path.join(ART, "epiduck.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    size = os.path.getsize(os.path.join(ART, "epiduck.webp"))
    print(f"epiduck: {width}x{height} atlas, {size // 1024} KB, in {ART}")


if __name__ == "__main__":
    main()
