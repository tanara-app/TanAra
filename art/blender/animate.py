"""
A building with a moving part (GAME.md step 4, «حرکت»; the video's way: low-poly Meshy model → Blender
→ frames). Renders, at the game camera and framed on the footprint like building.py:
  - <name>.webp: the building without the moving part (cut only above, so the footprint framing holds);
  - <name>-anim.webp: the moving part's frames side by side, each cut to the part's box over all frames;
    pixels hidden behind the rest of the building are left transparent (holdout), so the frames simply
    lie on top of the still picture;
  - <name>-anim.json: { frames, w, h, x, y, W } where x, y are the frames' place in the still picture and
    W its width (the game scales both together).

  Blender -b -P art/blender/animate.py -- <spec.json> <out dir>
  spec: { "model": "art/models/qanat.glb", "name": "qanat", "size": 3, "rot": 0,
          "part": { "min": [x, y, z], "max": [x, y, z],     // a box (model units) holding the part's pieces
                    "hub": [x, y, z], "radius": r,           // optional: only pieces within r of the hub
                    "floor": z },                            // optional: pieces reaching below z stay still
          "axis": "x", "turn": 360, "frames": 24 }            // spins about its own centre
"""
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector

sys.path.append(os.path.dirname(__file__))
from common import reset, frame_footprint, tile, render

argv = sys.argv[sys.argv.index("--") + 1:]
spec = json.load(open(argv[0])); out = argv[1]
os.makedirs(out, exist_ok=True)
name, size, rot = spec["name"], spec["size"], spec.get("rot", 0)

scene, cam = reset()
bpy.ops.import_scene.gltf(filepath=spec["model"])
mesh = [o for o in scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
# bake the import's own turn (glTF is Y-up) into the vertices, so the part's rotation below starts at zero
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in scene.objects if o.type == 'MESH']

lo, hi = Vector(spec["part"]["min"]), Vector(spec["part"]["max"])
def centre(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return sum(pts, Vector()) / 8
P = spec["part"]
def bounds(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
def moves(o):
    c = centre(o)
    if not all(lo[i] <= c[i] <= hi[i] for i in range(3)): return False
    if "hub" in P:  # a wheel: pieces within its radius of the hub, across the spin axis
        h, ax = Vector(P["hub"]), "xyz".index(spec.get("axis", "x"))
        d = c - h; d[ax] = 0
        if d.length > P["radius"]: return False
    if "floor" in P and bounds(o)[0].z < P["floor"]: return False  # posts standing on the ground stay
    return True
moving = [o for o in parts if moves(o)]
spin_axis = None
if "hub" in P:
    # Find the wheel's real plane and hub from its shape: the spin axis is the direction the pieces vary
    # least along (the plane's normal), the hub the middle of the rim. Pieces that reach past the rim or
    # stand off the plane (the trough, the post) are not part of the wheel.
    V = np.array([tuple(o.matrix_world @ v.co) for o in moving for v in o.data.vertices])
    m = V.mean(0); w, vecs = np.linalg.eigh(np.cov((V - m).T)); n = vecs[:, 0]
    e1, e2 = vecs[:, 2], vecs[:, 1]
    u, v = (V - m) @ e1, (V - m) @ e2
    hub = m + e1 * (u.min() + u.max()) / 2 + e2 * (v.min() + v.max()) / 2
    def inplane(X): d = X - hub; d = d - np.outer(d @ n, n); return np.linalg.norm(d, axis=1)
    R = np.percentile(inplane(V), 97); T = np.percentile(np.abs((V - hub) @ n), 97)
    keep = []
    for o in moving:
        X = np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices])
        if inplane(X).max() <= R * 1.04 and np.abs((X - hub) @ n).max() <= T * 1.3: keep.append(o)
    print("WHEEL axis", n.round(3), "hub", hub.round(3), "R", round(R, 3), "kept", len(keep), "of", len(moving))
    moving, spin_axis, spin_R = keep, Vector(n), float(R)
    spin_hub = Vector(hub)
still = [o for o in parts if o not in moving]
print("PARTS", len(parts), "MOVING", len(moving))
bpy.ops.object.select_all(action='DESELECT')
for o in moving: o.select_set(True)
bpy.context.view_layer.objects.active = moving[0]
bpy.ops.object.join()
part = bpy.context.view_layer.objects.active
if spin_axis is not None:
    scene.cursor.location = spin_hub
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    part.rotation_mode = 'AXIS_ANGLE'
else:
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    part.rotation_mode = 'XYZ'  # glTF imports use quaternions; the turn below is an Euler angle

# Place everything as building.py does: front to the lower right, scaled to the footprint.
root = bpy.data.objects.new("root", None); scene.collection.objects.link(root)
for o in still + [part]: o.parent = root
root.rotation_euler = (0, 0, math.radians(rot))
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in still + [part] for c in o.bound_box]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
k = size * 0.96 / max(mx.x - mn.x, mx.y - mn.y)
mid = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
root.scale = (k, k, k)
root.location = tile(size / 2, size / 2) - mid * k
frame_footprint(scene, cam, 0, 0, int(size))
scene.render.resolution_percentage = 200

def load(path):
    im = bpy.data.images.load(path); w, h = im.size
    return np.array(im.pixels[:], np.float32).reshape(h, w, 4)[::-1].copy()  # top-down
def save(arr, path):
    h, w = arr.shape[:2]
    im = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    im.pixels[:] = arr[::-1].ravel()
    scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.color_mode = 'RGBA'; scene.render.image_settings.quality = 90
    im.save_render(path, scene=scene)
    scene.render.image_settings.file_format = 'PNG'

tmp = os.path.join(out, "_tmp"); os.makedirs(tmp, exist_ok=True)
n_fr, turn = spec.get("frames", 24), spec.get("turn", 360)
H, W = int(scene.render.resolution_y * 2), int(scene.render.resolution_x * 2)

# the still picture, without the moving part
part.hide_render = True
render(scene, os.path.join(tmp, "base.png"))
base = load(os.path.join(tmp, "base.png"))
layers = {}

if spin_axis is not None:
    # A wheel is turned in 2D, not in 3D: the model's hidden side is only the image model's guess and
    # looks broken once it comes round. Its visible face is turned inside its own (tilted) plane: the
    # plane maps to the picture by an affine map A, so turning by θ there is A·R(θ)·A⁻¹ on the pixels.
    from bpy_extras.object_utils import world_to_camera_view
    for o in still: o.hide_render = True
    part.hide_render = False
    render(scene, os.path.join(tmp, "wheel.png")); wheel = load(os.path.join(tmp, "wheel.png"))
    Mw = root.matrix_world
    hub_w = Mw @ spin_hub
    nrm = (Mw.to_3x3() @ spin_axis).normalized()
    e1 = nrm.orthogonal().normalized(); e2 = nrm.cross(e1).normalized()
    def pix(pw):
        c = world_to_camera_view(scene, cam, pw)
        return np.array([c.x * W, (1 - c.y) * H])
    p0, p1, p2 = pix(hub_w), pix(hub_w + e1), pix(hub_w + e2)
    A = np.stack([p1 - p0, p2 - p0], 1); Ai = np.linalg.inv(A)
    gx, gy = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    Q = np.stack([gx - p0[0], gy - p0[1]], -1) @ Ai.T          # plane coordinates of every pixel
    # only what lies inside the rim turns (sticks of the trough that came with the pieces are cut away)
    rim = spin_R * k * 1.03
    wheel = wheel * (np.linalg.norm(Q, axis=-1) <= rim)[..., None]
    pre = wheel.copy(); pre[..., :3] *= pre[..., 3:4]
    def sample(img, sx, sy):
        h, w = img.shape[:2]
        x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int); fx = (sx - x0)[..., None]; fy = (sy - y0)[..., None]
        def at(yy, xx):
            ok = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
            return img[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)] * ok[..., None]
        return at(y0, x0) * (1 - fx) * (1 - fy) + at(y0, x0 + 1) * fx * (1 - fy) + at(y0 + 1, x0) * (1 - fx) * fy + at(y0 + 1, x0 + 1) * fx * fy
    frames = []
    for f in range(n_fr):
        t = -math.radians(turn * f / n_fr)
        c, s_ = math.cos(t), math.sin(t)
        U = Q[..., 0] * c - Q[..., 1] * s_; V2 = Q[..., 0] * s_ + Q[..., 1] * c
        S = p0 + np.stack([U, V2], -1) @ A.T
        out_ = sample(pre, S[..., 0] - 0.5, S[..., 1] - 0.5)
        a_ = out_[..., 3:4]; out_[..., :3] = np.where(a_ > 1e-4, out_[..., :3] / np.maximum(a_, 1e-4), 0)
        frames.append(out_)
    # what of the building stands in front of the wheel: the still parts, with a disc over the wheel's
    # swept area held out, kept only inside that disc
    ext = rim
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=ext * 1.02, depth=0.02, location=hub_w)
    disc = bpy.context.active_object
    disc.rotation_mode = 'QUATERNION'; disc.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(nrm)
    part.hide_render = True
    for o in still: o.hide_render = True
    render(scene, os.path.join(tmp, "disc.png")); dmask = load(os.path.join(tmp, "disc.png"))[..., 3:4]
    for o in still: o.hide_render = False
    disc.is_holdout = True
    render(scene, os.path.join(tmp, "front.png")); front = load(os.path.join(tmp, "front.png"))
    front = front * (dmask > 0.5)
    layers["fg"] = front
else:
    for o in still: o.is_holdout = True
    part.hide_render = False
    axis = "xyz".index(spec.get("axis", "x"))
    frames = []
    for f in range(n_fr):
        r = [0.0, 0.0, 0.0]; r[axis] = math.radians(turn * f / n_fr); part.rotation_euler = r
        p = os.path.join(tmp, f"f{f}.png"); render(scene, p); frames.append(load(p))

def box(mask):
    ys, xs = np.nonzero(mask)
    return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
union = np.any([fr[..., 3] > 0.02 for fr in frames], axis=0)
alls = (base[..., 3] > 0.02) | union
if "fg" in layers: alls |= layers["fg"][..., 3] > 0.02
top = int(np.nonzero(alls.any(1))[0].min())
y0, y1, x0, x1 = box(union)
strip = np.concatenate([fr[y0:y1, x0:x1] for fr in frames], axis=1)
save(base[top:], os.path.join(out, f"{name}.webp"))
save(strip, os.path.join(out, f"{name}-anim.webp"))
meta = {"frames": n_fr, "w": int(x1 - x0), "h": int(y1 - y0), "x": int(x0), "y": int(y0 - top), "W": int(base.shape[1])}
if "fg" in layers and (layers["fg"][..., 3] > 0.02).any():
    a0, a1, b0, b1 = box(layers["fg"][..., 3] > 0.02)
    save(layers["fg"][a0:a1, b0:b1], os.path.join(out, f"{name}-front.webp"))
    meta["front"] = {"x": int(b0), "y": int(a0 - top), "w": int(b1 - b0), "h": int(a1 - a0)}
json.dump(meta, open(os.path.join(out, f"{name}-anim.json"), "w"))
print("META", meta)
