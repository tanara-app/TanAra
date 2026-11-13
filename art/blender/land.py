"""
The land of «سرزمین» and its obstacles, rendered with the game camera (common.py).

  Blender -b --python art/blender/land.py -- <out dir>

Uses the ChatGPT ground textures in art/refs (tex-plot.png for the plot, tex-sand.png for the desert) and the
Meshy models in art/models (palm, rock, dune, tree, bush .glb; not in git, see GAME.md for their task ids).
Writes land.png (the whole ground: the SIZE × SIZE plot inside a low mud-brick curb, desert round it with
palms) and rock.png, dune.png, tree.png, bush.png (each framed on its own footprint, see
common.frame_footprint). SIZE and MARGIN must match js/domain/game.js and js/ui/game.js.
"""
import bpy, math, random, sys, os
from mathutils import Vector
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, aim, frame_footprint, tile, mat, render, PX_PER_TILE, SQ2

SIZE, MARGIN = 18, 6
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REFS, MODELS = os.path.join(ROOT, 'refs'), os.path.join(ROOT, 'models')
out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)


def textured(name, image, tiles_per_repeat):
    """A material that repeats a top-down texture every `tiles_per_repeat` tiles (world coordinates)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / tiles_per_repeat,) * 3
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(REFS, image))
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.35
    nt.links.new(tex.outputs["Color"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def plane(name, center, size, material, z=0.0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(center.x, center.y, z))
    o = bpy.context.active_object; o.name = name
    o.scale = (size, size, 1)
    bpy.ops.object.transform_apply(scale=True)  # so Object coordinates are in world units
    o.data.materials.append(material)
    return o


def box(name, c, dims, material):
    bpy.ops.mesh.primitive_cube_add(location=c)
    o = bpy.context.active_object; o.name = name
    o.scale = (dims[0] / 2, dims[1] / 2, dims[2] / 2)
    o.data.materials.append(material)
    return o


def place_model(file, at, fit, rot=0.0, height=None):
    """Imports a Meshy model, scales it so its footprint fits `fit` units (or its height is `height`), and
    stands it on the ground at `at`, turned by `rot` degrees."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, file))
    new = [o for o in bpy.context.scene.objects if o not in before]
    root = bpy.data.objects.new(file + "_root", None); bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.parent is None: o.parent = root
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in new if o.type == 'MESH' for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    span = max(mx.x - mn.x, mx.y - mn.y)
    s = (height / (mx.z - mn.z)) if height else (fit / span)
    mid = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in new:
        if o.parent is root: o.location -= mid
    root.scale = (s, s, s)
    root.rotation_euler = (0, 0, math.radians(rot))
    root.location = at
    return root


# ---------------- the land ----------------
scene, cam = reset()
random.seed(7)
full = SIZE + 2 * MARGIN
c = tile(SIZE / 2, SIZE / 2)
plane("desert", c, full * 2.2, textured("sand", "tex-sand.png", 4.0))  # big enough to fill the image's corners
plane("plot", c, SIZE, textured("plot", "tex-plot.png", 3.0), z=0.012)
BRICK = mat("brick", (0.55, 0.36, 0.22), noise=(30.0, (0.46, 0.29, 0.18)), bump=0.3)
t, hgt = 0.22, 0.16
for dx, dy, w, d in [(0, -(SIZE / 2 + t / 2), SIZE + 2 * t, t), (0, SIZE / 2 + t / 2, SIZE + 2 * t, t), (-(SIZE / 2 + t / 2), 0, t, SIZE), (SIZE / 2 + t / 2, 0, t, SIZE)]:
    box("curb", c + Vector((dx, dy, hgt / 2)), (w, d, hgt), BRICK)
for i, (tx, ty) in enumerate([(-3, 3), (-4, 9), (-2.5, 14), (SIZE + 3, 2), (SIZE + 2.5, 8), (SIZE + 3.5, 13), (4, -3), (10, -3.5), (15, -2.5), (3, SIZE + 3), (9, SIZE + 2.5), (14, SIZE + 3.5)]):
    place_model("palm.glb", tile(tx, ty), 0, rot=random.uniform(0, 360), height=random.uniform(3.0, 4.2))
for i in range(10):
    while True:
        tx, ty = random.uniform(-MARGIN + 1, SIZE + MARGIN - 1), random.uniform(-MARGIN + 1, SIZE + MARGIN - 1)
        if not (-1.5 < tx < SIZE + 1.5 and -1.5 < ty < SIZE + 1.5): break
    place_model(random.choice(["bush.glb", "rock.glb", "dune.glb"]), tile(tx, ty), random.uniform(0.8, 1.6), rot=random.uniform(0, 360))

scene.render.resolution_x = round(full * PX_PER_TILE)
scene.render.resolution_y = round(full * PX_PER_TILE / 2)
cam.data.ortho_scale = full * SQ2
cam.data.shift_x = cam.data.shift_y = 0
aim(cam, c)
scene.render.film_transparent = False
render(scene, os.path.join(out, "land.png"))

# ---------------- obstacles, one per image ----------------
for name, size, fit in [("rock", 2, 1.8), ("dune", 2, 1.9), ("tree", 1, 1.0), ("bush", 1, 0.95)]:
    scene, cam = reset()
    place_model(f"{name}.glb", tile(size / 2, size / 2), fit, rot=0)
    frame_footprint(scene, cam, 0, 0, size)
    render(scene, os.path.join(out, f"{name}.png"))
print("DONE")
