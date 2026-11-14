"""
Fits a building picture made by an image model onto the game's grid (2026-11-14).

The model draws each building on its own square pad, but never at exactly the game's angle: the pad's
diamond is a little tilted or squashed, so the building looks crooked on its tiles. This finds the pad's
left, right and front (bottom) corners from the transparency and warps the picture (one affine map) so
they land exactly on a 2:1 diamond: left and right corners level, the front corner in the middle and a
quarter of the width below them. Whatever sticks out past the pad (a catapult arm, crossbows) is kept:
the canvas grows the same on both sides, and the script prints the FIT factor the game needs
(image width ÷ footprint width; js/ui/game.js, FIT).

  Blender -b -P art/blender/fit_sprite.py -- <in.png> <out.webp> [pad width px, default 600]
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
PW = int(argv[2]) if len(argv) > 2 else 600

img = bpy.data.images.load(src)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top-down rows
a = px[..., 3] > 0.5
ys, xs = np.nonzero(a)
top, bot = ys.min(), ys.max()

# The pad's corners: search the lower part of the object, where the pad is the widest thing.
low = ys > top + 0.45 * (bot - top)
lx, ly = xs[low], ys[low]
# The pad is a slab: at its side corners the outline runs down its thickness. Its corners on the ground
# are the bottom of those runs (and the lowest point in front), as for any block standing on the tiles.
def corner(sel, at_bottom=True):
    return np.array([lx[sel].mean(), ly[sel].max() if at_bottom else ly[sel].mean()])
L = corner(lx <= lx.min() + 2)
R = corner(lx >= lx.max() - 2)
B = corner(ly >= ly.max() - 2)
print("CORNERS L", L.round(1), "R", R.round(1), "B", B.round(1))

# Target: L → (0, 0), R → (PW, 0), B → (PW/2, PW/4); solve the affine map src → dst.
S = np.array([[L[0], L[1], 1], [R[0], R[1], 1], [B[0], B[1], 1]])
D = np.array([[0, 0], [PW, 0], [PW / 2, PW / 4]])
M = np.linalg.solve(S, D)            # 3×2: [x y 1] @ M = [x' y']

# Where every opaque pixel lands, to size the canvas (symmetric round the pad).
pts = np.stack([xs, ys, np.ones_like(xs)], 1) @ M
over = max(0.0, -pts[:, 0].min(), pts[:, 0].max() - PW)
x0, x1 = -over, PW + over
y0, y1 = pts[:, 1].min(), PW / 4  # the front corner is the bottom edge
OW, OH = int(np.ceil(x1 - x0)), int(np.ceil(y1 - y0))

# Inverse map: for each output pixel, where to sample in the source (bilinear).
A = np.vstack([M.T, [0, 0, 1]])      # [x' y' 1]^T = A [x y 1]^T
Ai = np.linalg.inv(A)
gx, gy = np.meshgrid(np.arange(OW) + x0 + 0.5, np.arange(OH) + y0 + 0.5)
sx = Ai[0, 0] * gx + Ai[0, 1] * gy + Ai[0, 2] - 0.5
sy = Ai[1, 0] * gx + Ai[1, 1] * gy + Ai[1, 2] - 0.5
x_0 = np.floor(sx).astype(int); y_0 = np.floor(sy).astype(int)
fx = (sx - x_0)[..., None]; fy = (sy - y_0)[..., None]
def at(yy, xx):
    ok = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
    v = px[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)]
    return v * ok[..., None]
pre = px.copy(); pre[..., :3] *= pre[..., 3:4]   # premultiply so edges don't darken
px = pre
out = (at(y_0, x_0) * (1 - fx) * (1 - fy) + at(y_0, x_0 + 1) * fx * (1 - fy)
       + at(y_0 + 1, x_0) * (1 - fx) * fy + at(y_0 + 1, x_0 + 1) * fx * fy)
alpha = out[..., 3:4]
out[..., :3] = np.where(alpha > 1e-4, out[..., :3] / np.maximum(alpha, 1e-4), 0)

o = bpy.data.images.new("o", OW, OH, alpha=True)
o.pixels[:] = out[::-1].ravel()
scene = bpy.context.scene
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.quality = 90
o.save_render(dst, scene=scene)
print("SAVED", dst, OW, OH, "FIT", round(OW / PW, 3))
