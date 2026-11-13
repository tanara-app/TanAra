import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst, out_w = argv[0], argv[1], int(argv[2])
mode = argv[3] if len(argv) > 3 else ""
nocrop = mode == "nocrop"  # keep the whole frame (renders framed by common.frame_footprint)
top = mode == "top"        # cut only the empty rows above: keeps the footprint framing (art/blender/building.py)

img = bpy.data.images.load(src)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)  # rows bottom-up
alpha = px[:, :, 3] > 0.02
ys, xs = np.where(alpha)
x0, x1, y0, y1 = (0, w, 0, h) if nocrop else (0, w, 0, ys.max() + 1) if top else (xs.min(), xs.max() + 1, ys.min(), ys.max() + 1)
print("BBOX", x0, x1, y0, y1, "of", w, h)
crop = px[y0:y1, x0:x1].copy()
ch, cw = crop.shape[:2]

out = bpy.data.images.new("out", cw, ch, alpha=True)
out.pixels[:] = crop.ravel()
out_h = round(ch * out_w / cw)
out.scale(out_w, out_h)
out.filepath_raw = dst
out.file_format = 'WEBP'
scene = bpy.context.scene
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.quality = 90
out.save_render(dst, scene=scene)
print("SAVED", dst, out_w, out_h)
