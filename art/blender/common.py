"""
Shared setup for the «سرزمین» renders: the game camera, light, render settings and materials.

The game's tiles are a 2:1 isometric grid (TW = 64, TH = 32 in js/ui/gameArt.js). In Blender one tile is
one unit, and tile (tx, ty) sits at world (-ty, -tx), so with the camera at azimuth -45° and 30° down the
tile x axis runs to the lower right and the tile y axis to the lower left, exactly as in the game.
Every building's front faces the lower right (the palace, 2026-11-13).
"""
import bpy, math
from mathutils import Vector

AZIMUTH, ELEVATION = -45.0, 30.0
PX_PER_TILE = 128          # rendered pixels for one tile's width (the game shows 64, so 2× for sharp phones)
SQ2 = math.sqrt(2)


def tile(tx, ty, z=0.0):
    return Vector((-ty, -tx, z))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            pass
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    world = bpy.data.worlds.new("w"); scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.86, 0.84, 0.86, 1)
    bg.inputs[1].default_value = 0.35
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN'))
    sun.data.energy = 4.5
    sun.data.color = (1.0, 0.92, 0.80)
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-45))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = 'ORTHO'
    cam.data.sensor_fit = 'HORIZONTAL'
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def aim(cam, center, dist=60.0):
    az, el = math.radians(AZIMUTH), math.radians(ELEVATION)
    cam.location = center + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = dist * 4


def frame_footprint(scene, cam, tx, ty, size, height_factor=1.6):
    """Frames a size × size footprint so the image is exactly as wide as the footprint's diamond and the
    diamond's front (bottom) corner sits on the image's bottom edge. The game then puts the image with
    origin (0.5, 1) on that corner and scales it to size × TW pixels wide."""
    w_world = size * SQ2
    w_px = round(size * PX_PER_TILE)
    h_px = round(w_px * height_factor)
    scene.render.resolution_x, scene.render.resolution_y = w_px, h_px
    cam.data.ortho_scale = w_world
    center = tile(tx + size / 2, ty + size / 2)
    aim(cam, center)
    h_world = w_world * h_px / w_px
    half_diamond = size * SQ2 / 2 * math.sin(math.radians(ELEVATION))
    cam.data.shift_x = 0
    cam.data.shift_y = (h_world / 2 - half_diamond) / w_world


def mat(name, color, rough=0.85, noise=None, bump=0.0):
    """A simple material: a base colour, optionally varied by noise (noise = (scale, second colour))."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    if noise:
        scale, color2 = noise
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = scale
        tex.inputs["Detail"].default_value = 6
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (*color, 1)
        ramp.color_ramp.elements[1].color = (*color2, 1)
        nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        if bump:
            b = nt.nodes.new("ShaderNodeBump")
            b.inputs["Strength"].default_value = bump
            nt.links.new(tex.outputs["Fac"], b.inputs["Height"])
            nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
