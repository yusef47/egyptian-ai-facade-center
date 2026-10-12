/** Executed by FreeCADCmd inside an isolated Vercel Sandbox. */
export const FREECAD_HARNESS = String.raw`import FreeCAD as App
import Part
import json
import math
import os
import shutil
import sys
import traceback
from html import escape

ROOT = os.environ['QATTAN_CAD_PROJECT_ROOT']
PROJECT = ROOT + '/project.FCStd'
ACTION = ROOT + '/action.py'
RESULT = ROOT + '/result.json'
SVG = ROOT + '/plan.svg'
DXF = ROOT + '/plan.dxf'
BACKUP = ROOT + '/project.backup.FCStd'
SITE = json.load(open(ROOT + '/site.json', encoding='utf-8'))
os.makedirs(ROOT, exist_ok=True)

def layer_of(obj):
    label = obj.Label.upper()
    for word in ('SITE', 'WALL', 'DOOR', 'WINDOW', 'STAIR', 'FURNITURE', 'DIMENSION', 'COLUMN', 'TEXT'):
        if label.startswith(word):
            return word
    return 'OTHER'

def emit_preview(doc):
    lines = []
    labels = []
    summary = []
    warnings = []
    max_x = float(SITE['width']) * 1000
    max_y = float(SITE['depth']) * 1000
    limits = [0.0, 0.0, max_x, max_y]
    for obj in doc.Objects:
        kind = layer_of(obj)
        entry = {'name': obj.Name, 'label': obj.Label, 'type': obj.TypeId, 'layer': kind}
        if hasattr(obj, 'Shape') and not obj.Shape.isNull():
            bb = obj.Shape.BoundBox
            entry['boundsMm'] = [round(bb.XMin, 1), round(bb.YMin, 1), round(bb.XMax, 1), round(bb.YMax, 1)]
            limits[0] = min(limits[0], bb.XMin)
            limits[1] = min(limits[1], bb.YMin)
            limits[2] = max(limits[2], bb.XMax)
            limits[3] = max(limits[3], bb.YMax)
            if bb.XMin < -1 or bb.YMin < -1 or bb.XMax > max_x + 1 or bb.YMax > max_y + 1:
                warnings.append(obj.Label + ' extends outside the site')
            for edge in obj.Shape.Edges:
                try:
                    points = edge.discretize(Deflection=25.0)
                except Exception:
                    points = [edge.Vertexes[0].Point, edge.Vertexes[-1].Point]
                coords = [(round(p.x, 2), round(p.y, 2)) for p in points]
                if len(coords) > 1:
                    lines.append((kind, coords))
        if hasattr(obj, 'Text') and hasattr(obj, 'Position'):
            labels.append((str(obj.Text)[:90], float(obj.Position.x), float(obj.Position.y)))
        summary.append(entry)
    if len(lines) > 4500:
        raise RuntimeError('CAD drawing exceeds the preview limit')
    palette = {'SITE':'#64748b','WALL':'#d8e8ef','DOOR':'#ffc66d','WINDOW':'#65d4e6','STAIR':'#db8ef7','FURNITURE':'#f79a90','DIMENSION':'#8da4b6','COLUMN':'#facc15','TEXT':'#f4e6c5','OTHER':'#b4c3cc'}
    w = max(1.0, limits[2]-limits[0]); h = max(1.0, limits[3]-limits[1])
    pad = max(w,h) * .055
    minx,miny = limits[0]-pad,limits[1]-pad
    vieww,viewh = w+2*pad,h+2*pad
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+str(round(vieww,1))+' '+str(round(viewh,1))+'" width="1100" height="800">',
             '<rect width="100%" height="100%" fill="#09151d"/>']
    def xy(x,y): return (round(x-minx,2), round(viewh-(y-miny),2))
    x0,y0=xy(0,max_y)
    parts.append('<rect x="'+str(x0)+'" y="'+str(y0)+'" width="'+str(max_x)+'" height="'+str(max_y)+'" fill="none" stroke="#38546a" stroke-width="25" stroke-dasharray="120 80"/>')
    for kind,points in lines:
        coords = ' '.join(str(xy(x,y)[0])+','+str(xy(x,y)[1]) for x,y in points)
        parts.append('<polyline fill="none" stroke="'+palette.get(kind,palette['OTHER'])+'" stroke-width="'+str(36 if kind=='WALL' else 17 if kind in ('DOOR','WINDOW') else 11)+'" stroke-linejoin="round" points="'+coords+'"/>')
    for value,x,y in labels:
        px,py=xy(x,y)
        parts.append('<text x="'+str(px)+'" y="'+str(py)+'" fill="#f4e6c5" font-size="190" text-anchor="middle">'+escape(value)+'</text>')
    parts.append('</svg>')
    open(SVG,'w',encoding='utf-8').write(''.join(parts))

    out=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1009','0','ENDSEC','0','SECTION','2','TABLES','0','TABLE','2','LAYER','70',str(len(palette))]
    for index,kind in enumerate(palette):
        out += ['0','LAYER','2',kind,'70','0','62',str((index%7)+1),'6','CONTINUOUS']
    out += ['0','ENDTAB','0','ENDSEC','0','SECTION','2','ENTITIES']
    def pair(*values): out.extend(str(v) for v in values)
    for kind,points in lines:
        for (ax,ay),(bx,by) in zip(points,points[1:]):
            if abs(ax-bx)+abs(ay-by)<.01: continue
            pair(0,'LINE',8,kind,10,round(ax,2),20,round(ay,2),11,round(bx,2),21,round(by,2))
    for value,x,y in labels:
        clean=''.join(ch for ch in value if ch not in '\r\n\x00')
        pair(0,'TEXT',8,'TEXT',10,round(x,2),20,round(y,2),40,200,1,clean)
    pair(0,'ENDSEC',0,'EOF')
    open(DXF,'w',encoding='utf-8').write('\n'.join(out)+'\n')
    counts={kind:sum(1 for o in summary if o['layer']==kind) for kind in palette}
    if counts['DOOR']==0: warnings.append('No door objects were drawn')
    if counts['WALL']<4: warnings.append('Fewer than four wall objects were drawn')
    return {'objects':summary[:250], 'counts':counts, 'warnings':warnings[:30], 'segments':len(lines), 'siteMm':[max_x,max_y]}

doc = None
try:
    if os.path.exists(PROJECT):
        shutil.copy2(PROJECT, BACKUP)
        doc = App.openDocument(PROJECT)
    else:
        doc = App.newDocument('QattanCAD')
    scope={'App':App,'Part':Part,'Vector':App.Vector,'doc':doc,'SITE_WIDTH_MM':float(SITE['width'])*1000,'SITE_DEPTH_MM':float(SITE['depth'])*1000}
    def add_label(name, value, x_mm, y_mm):
        obj=doc.addObject('App::FeaturePython',name)
        obj.addProperty('App::PropertyString','Text')
        obj.addProperty('App::PropertyVector','Position')
        obj.Text=str(value)
        obj.Position=App.Vector(float(x_mm),float(y_mm),0)
        obj.Label='TEXT_'+name
        return obj
    scope['add_label']=add_label
    code=open(ACTION,encoding='utf-8').read()
    exec(compile(code,ACTION,'exec'),scope,scope)
    doc.recompute()
    details=emit_preview(doc)
    if details['segments']==0: raise RuntimeError('FreeCAD produced no visible geometry')
    doc.saveAs(PROJECT)
    json.dump({'ok':True,**details},open(RESULT,'w',encoding='utf-8'),ensure_ascii=False)
    print('QATTAN_CAD_OK',len(doc.Objects),details['segments'])
except Exception as err:
    traceback.print_exc()
    json.dump({'ok':False,'error':str(err)[:900]},open(RESULT,'w',encoding='utf-8'))
    if doc:
        try: App.closeDocument(doc.Name)
        except Exception: pass
    if os.path.exists(BACKUP): shutil.copy2(BACKUP,PROJECT)
    sys.exit(1)
finally:
    if doc:
        try: App.closeDocument(doc.Name)
        except Exception: pass
sys.exit(0)
`;
