"""
Renders one building's Meshy model at the game camera, framed exactly on its footprint (common.frame_footprint),
so the game can scale the image to the footprint as it is.

  Blender -b -P art/blender/building.py -- <model.glb> <size in tiles> <out.png> [rot degrees] [fill]

The model must be made from a straight-on front view (Meshy then puts its front toward -Y, aligned to the axes;
a three-quarter input image gives a diagonal, broken model, 2026-11-14). rot turns it about its vertical axis;
with the game camera (azimuth -45) rot 0 puts the front to the lower right, as every building faces.
fill is how much of the footprint the model's widest side covers (default 0.96).
Uses the objects' bounding boxes only (reading every vertex of a 50 MB model in Python took minutes).
"""
import bpy, sys, os, math
from mathutils import Vector

sys.path.append(os.path.dirname(__file__))
from common import reset, frame_footprint, tile, render

argv = sys.argv[sys.argv.index("--") + 1:]
src, size, out = argv[0], float(argv[1]), argv[2]
rot = float(argv[3]) if len(argv) > 3 else 0.0
fill = float(argv[4]) if len(argv) > 4 else 0.96

scene, cam = reset()
before = set(scene.objects)
bpy.ops.import_scene.gltf(filepath=src)
new = [o for o in scene.objects if o not in before]
root = bpy.data.objects.new("root", None); scene.collection.objects.link(root)
for o in new:
    if o.parent is None: o.parent = root
root.rotation_euler = (0, 0, math.radians(rot))
bpy.context.view_layer.update()

pts = [o.matrix_world @ Vector(c) for o in new if o.type == 'MESH' for c in o.bound_box]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
k = size * fill / max(mx.x - mn.x, mx.y - mn.y)
mid = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
print("SIZE", round(mx.x - mn.x, 3), round(mx.y - mn.y, 3), round(mx.z - mn.z, 3), "SCALE", round(k, 4))
root.scale = (k, k, k)
root.location = tile(size / 2, size / 2) - mid * k
frame_footprint(scene, cam, 0, 0, int(size))
scene.render.resolution_percentage = 200  # 256 px per tile: the palace fills much of a phone screen when zoomed
render(scene, out)
