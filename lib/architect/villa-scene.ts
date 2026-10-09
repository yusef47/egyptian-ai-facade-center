/** Fixed Blender primitives for the first live villa experiment. The model only chooses bounded design parameters. */
export const VILLA_SCENE_SCRIPT = String.raw`import bpy
import sys
import math
import json
from mathutils import Vector

STAGE = int(sys.argv[-1])
ROOT = '/vercel/sandbox/'
with open(ROOT + 'villa-design.json', encoding='utf-8') as handle:
    design = json.load(handle)

if STAGE == 1:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
else:
    bpy.ops.wm.open_mainfile(filepath=ROOT + 'villa.blend')

def material(name, color, roughness=0.75, metallic=0.0, transmission=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Transmission Weight' in bsdf.inputs:
        bsdf.inputs['Transmission Weight'].default_value = transmission
    elif 'Transmission' in bsdf.inputs:
        bsdf.inputs['Transmission'].default_value = transmission
    return mat

style = design.get('style', 'warm')
grass = material('Lawn | lush green', (0.115, 0.27, 0.13))
stone = material('Stone | limestone', (0.78, 0.75, 0.69) if style == 'minimal' else (0.76, 0.72, 0.61) if style == 'coastal' else (0.72, 0.67, 0.56))
white = material('Walls | stucco', (0.9, 0.9, 0.87) if style == 'minimal' else (0.87, 0.9, 0.84) if style == 'coastal' else (0.88, 0.86, 0.79))
dark = material('Frames | charcoal metal', (0.07, 0.09, 0.10), 0.35, 0.55)
wood = material('Timber | architectural wood', (0.20, 0.16, 0.13) if style == 'minimal' else (0.54, 0.36, 0.20) if style == 'coastal' else (0.31, 0.17, 0.09))
water = material('Pool | clear turquoise', (0.04, 0.45, 0.57), 0.09, 0.05, 0.25)
glass = material('Glazing | blue grey', (0.42, 0.68, 0.74), 0.08, 0.02, 0.2)
tile = material('Pool tile | pale blue', (0.33, 0.72, 0.78), 0.22)
fabric = material('Upholstery | oatmeal', (0.78, 0.69, 0.56))
leaf = material('Leaves | olive', (0.11, 0.28, 0.08))
pink = material('Flowers | terracotta', (0.72, 0.25, 0.18))

def box(name, xyz, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
    return obj

def cylinder(name, xyz, radius, depth, mat, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj

def sphere(name, xyz, radius, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radius, location=xyz)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj

def wall_x(name, x1, x2, y, z1=0.24, z2=3.25, mat=white):
    return box(name, ((x1+x2)/2,y,(z1+z2)/2), (x2-x1,0.18,z2-z1), mat)

def wall_y(name, x, y1, y2, z1=0.24, z2=3.25, mat=white):
    return box(name, (x,(y1+y2)/2,(z1+z2)/2), (0.18,y2-y1,z2-z1), mat)

def window_x(name, x1, x2, y, bottom=0.9, top=2.7):
    wall_x(name+' sill', x1, x2, y, 0.24, bottom)
    wall_x(name+' lintel', x1, x2, y, top, 3.25)
    box(name+' glass', ((x1+x2)/2,y,(bottom+top)/2), (x2-x1,0.035,top-bottom), glass)
    for xx in (x1, x2):
        box(name+' frame', (xx,y,(bottom+top)/2), (0.06,0.09,top-bottom), dark)
    box(name+' mullion', ((x1+x2)/2,y,(bottom+top)/2), (0.045,0.08,top-bottom), dark)

if STAGE == 1:
    box('SITE | level grass 12 x 20 m', (0,0,-0.17), (12,20,0.24), grass)
    box('SITE | stone approach', (3.6,5.7,-0.015), (1.5,8.4,0.07), stone)
    for x in (-5.85,5.85):
        box('SITE | low boundary', (x,0,0.22), (0.18,20,0.44), stone)
    for y in (-9.85,9.85):
        box('SITE | low boundary', (0,y,0.22), (12,0.18,0.44), stone)

if STAGE == 2:
    box('HOUSE | raised ground floor slab', (0,-3,0.13), (10,10,0.26), stone)
    box('HOUSE | living room floor', (0,0,0.28), (9.7,3.8,0.04), wood)
    box('HOUSE | bedroom floor', (-2.55,-5.1,0.28), (4.6,5.6,0.04), wood)
    box('HOUSE | second bedroom floor', (2.55,-5.1,0.28), (4.6,5.6,0.04), wood)
    wall_x('HOUSE | rear exterior', -5,5,-8)
    wall_y('HOUSE | left exterior', -5,-8,2)
    wall_y('HOUSE | right exterior', 5,-8,2)
    wall_x('HOUSE | front left', -5,-2.8,2)
    window_x('HOUSE | living panoramic window', -2.8,2.0,2,0.35,2.9)
    wall_x('HOUSE | front entrance pier', 2,2.6,2)
    wall_x('HOUSE | front right', 3.75,5,2)
    wall_x('HOUSE | entrance header', 2.6,3.75,2,2.55,3.25)
    box('HOUSE | timber entrance door', (3.16,2.02,1.37), (1.08,0.065,2.18), wood, 0.025)
    cylinder('HOUSE | entrance handle', (3.58,2.10,1.12), 0.045, 0.1, dark)
    wall_x('HOUSE | bedroom hall left', -5,-3.65,-2)
    wall_x('HOUSE | bedroom hall center', -2.65,1.35,-2)
    wall_x('HOUSE | bedroom hall right', 2.35,5,-2)
    wall_y('HOUSE | bedroom divider', 0,-8,-2)
    box('HOUSE | covered terrace deck', (-1.2,2.85,0.13), (6.3,1.55,0.2), wood)
    for x in (-4.3,1.9):
        cylinder('HOUSE | terrace column', (x,3.55,1.68), 0.08, 3.1, dark)
    box('Roof | overhanging flat canopy', (0,-2.5,3.42), (10.8,11.2,0.24), white)
    box('Roof | charcoal parapet front', (0,3.02,3.65), (10.8,0.17,0.30), dark)
    box('Roof | charcoal parapet rear', (0,-8.02,3.65), (10.8,0.17,0.30), dark)
    for x in (-5.32,5.32):
        box('Roof | side parapet', (x,-2.5,3.65), (0.17,11.1,0.30), dark)

if STAGE == 3:
    # Furniture is placed in the actual interior rooms, with circulation kept in the middle.
    for x, name in ((-2.55,'master'),(2.55,'guest')):
        box('FURNITURE | '+name+' bed frame', (x,-5.9,0.56), (2.25,2.2,0.34), wood, 0.04)
        box('FURNITURE | '+name+' mattress', (x,-5.9,0.78), (2.08,2.03,0.16), fabric, 0.04)
        box('FURNITURE | '+name+' headboard', (x,-7.06,1.12), (2.35,0.14,1.1), wood, 0.04)
        for dx in (-0.52,0.52):
            box('FURNITURE | '+name+' pillow', (x+dx,-6.65,0.91), (0.74,0.42,0.12), white, 0.05)
        box('FURNITURE | '+name+' wardrobe', (x+1.55,-4.2,1.15), (0.67,1.6,1.75), wood, 0.03)
    box('FURNITURE | lounge sectional long', (-2.5,-0.7,0.57), (2.9,0.95,0.65), fabric, 0.09)
    box('FURNITURE | lounge sectional short', (-3.5,0.0,0.57), (0.9,1.1,0.65), fabric, 0.09)
    box('FURNITURE | coffee table', (-1.15,-0.22,0.5), (1.25,0.72,0.12), wood, 0.06)
    box('FURNITURE | dining table', (1.8,-0.15,0.77), (1.65,0.95,0.11), wood, 0.045)
    for x in (1.25,2.35):
        for y in (-0.92,0.63):
            box('FURNITURE | dining chair', (x,y,0.48), (0.46,0.44,0.52), fabric, 0.045)
    box('FURNITURE | kitchen base cabinets', (4.35,-0.17,0.69), (0.7,3.0,0.85), wood)
    box('FURNITURE | kitchen countertop', (4.35,-0.17,1.13), (0.8,3.1,0.06), stone, 0.02)
    box('FURNITURE | kitchen island', (3.0,-0.55,0.95), (0.8,1.3,0.14), stone, 0.04)
    box('FURNITURE | media wall', (-2.4,1.82,1.36), (2.5,0.08,1.42), dark)

if STAGE == 4:
    pool_x = -2.3 if design['poolSide'] == 'left' else 0.25
    box('POOL | excavated blue basin', (pool_x,6.05,-0.09), (4.6,5.45,0.15), tile)
    box('POOL | water surface', (pool_x,6.05,-0.003), (4.24,5.08,0.03), water)
    for xx in (pool_x-2.39,pool_x+2.39):
        box('POOL | stone coping', (xx,6.05,0.06), (0.22,5.75,0.12), stone)
    for yy in (3.22,8.88):
        box('POOL | stone coping', (pool_x,yy,0.06), (4.8,0.22,0.12), stone)
    for ix in range(3):
        box('POOL | entry step', (pool_x-1.5+ix*0.22,3.72+ix*0.18,-0.005+ix*0.02), (0.38,0.38,0.05), stone)
    for x,y in ((4.25,5.5),(4.25,7.2)):
        box('GARDEN | pool lounger', (x,y,0.27), (0.74,1.55,0.18), fabric, 0.05)
        box('GARDEN | lounger pillow', (x,y-0.55,0.42), (0.62,0.32,0.12), white, 0.04)
    for x,y in ((-5.18,5.1),(-5.1,8.4),(5.1,8.7),(5.14,-5.5),(-5.1,-6.7)):
        cylinder('GARDEN | tree trunk', (x,y,1.02), 0.12,2.1,wood,10)
        for offset in ((0,0,0),(0.35,0.12,-0.22),(-0.28,-0.1,-0.12)):
            sphere('GARDEN | olive canopy', (x+offset[0],y+offset[1],2.2+offset[2]), 0.6, leaf)
    for x,y in ((-4.6,3.7),(1.0,4.3),(4.6,3.7),(-4.3,9.1),(1.0,9.1)):
        box('GARDEN | raised planter', (x,y,0.23), (0.85,0.85,0.38), stone, 0.025)
        for dx,dy in ((-0.2,0),(.2,.17),(0,-.2)):
            sphere('GARDEN | flowering shrub', (x+dx,y+dy,0.62), 0.24, pink if dx > 0 else leaf)
    for x,y in ((-4.5,3.6),(3.5,3.5),(3.5,8.8),(-4.5,8.8)):
        cylinder('GARDEN | bollard light', (x,y,0.38), 0.06,0.65,dark,12)
        sphere('GARDEN | warm lamp', (x,y,0.73),0.1,white)

required = {1:'SITE | level grass',2:'HOUSE | raised ground floor',3:'FURNITURE | lounge sectional',4:'POOL | water surface'}
for phase in range(1, STAGE+1):
    if not any(obj.name.startswith(required[phase]) for obj in bpy.data.objects):
        raise RuntimeError('Missing expected scene group at phase '+str(phase))
if len([obj for obj in bpy.data.objects if obj.type == 'MESH']) > 500:
    raise RuntimeError('Too many mesh objects')
bpy.ops.wm.save_as_mainfile(filepath=ROOT + 'villa.blend')
bpy.ops.export_scene.gltf(filepath=ROOT + 'villa-stage-' + str(STAGE) + '.glb', export_format='GLB')
print('QATTAN_STAGE_COMPLETE', STAGE, len(bpy.data.objects))
`;
