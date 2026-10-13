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
FAILURE = ROOT + '/failure.json'
SVG = ROOT + '/plan.svg'
DXF = ROOT + '/plan.dxf'
BACKUP = ROOT + '/project.backup.FCStd'
SVG_BACKUP = ROOT + '/preview.backup.svg'
DXF_BACKUP = ROOT + '/drawing.backup.dxf'
SITE = json.load(open(ROOT + '/site.json', encoding='utf-8'))
os.makedirs(ROOT, exist_ok=True)
if os.path.exists(FAILURE): os.remove(FAILURE)

def layer_of(obj):
    label = obj.Label.upper()
    for word in ('SITE', 'WALL', 'BEAM', 'DOOR', 'WINDOW', 'STAIR', 'FURNITURE', 'DIMENSION', 'COLUMN', 'TEXT', 'HATCH'):
        if label.startswith(word):
            return word
    return 'OTHER'

def emit_preview(doc):
    lines = []
    labels = []
    summary = []
    warnings = []
    geometry_errors = []
    max_x = float(SITE['width']) * 1000
    max_y = float(SITE['depth']) * 1000
    limits = [0.0, 0.0, max_x, max_y]
    for obj in doc.Objects:
        kind = layer_of(obj)
        entry = {'name': obj.Name, 'label': obj.Label, 'type': obj.TypeId, 'layer': kind}
        if hasattr(obj, 'CadAgentId'):
            entry['id'] = str(obj.CadAgentId)
        if hasattr(obj, 'CadWallStart') and hasattr(obj, 'CadWallEnd'):
            entry['wallStartMm'] = [round(obj.CadWallStart.x, 2), round(obj.CadWallStart.y, 2)]
            entry['wallEndMm'] = [round(obj.CadWallEnd.x, 2), round(obj.CadWallEnd.y, 2)]
            entry['wallThicknessMm'] = round(float(obj.CadWallThickness), 2)
            try: entry['wallOpenings'] = [o['id'] for o in json.loads(obj.CadOpenings)]
            except Exception: entry['wallOpenings'] = []
        if hasattr(obj, 'CadLineStart') and hasattr(obj, 'CadLineEnd'):
            entry['lineStartMm'] = [round(obj.CadLineStart.x, 2), round(obj.CadLineStart.y, 2)]
            entry['lineEndMm'] = [round(obj.CadLineEnd.x, 2), round(obj.CadLineEnd.y, 2)]
        if hasattr(obj, 'CadPolylinePoints'):
            entry['polylinePointsMm'] = json.loads(obj.CadPolylinePoints)
            entry['closed'] = bool(getattr(obj, 'CadPolylineClosed', False))
        if hasattr(obj, 'CadHatchHost'):
            entry['hatchHostId'] = str(obj.CadHatchHost)
        if hasattr(obj, 'CadHostWall'):
            entry['hostWallId'] = str(obj.CadHostWall)
        if hasattr(obj, 'CadSemantic'):
            entry['semantic'] = str(obj.CadSemantic)
        if hasattr(obj, 'CadKind'):
            entry['kind'] = str(obj.CadKind)
        if hasattr(obj, 'CadOpeningOffset'):
            entry['openingOffsetMm'] = round(float(obj.CadOpeningOffset), 2)
            entry['openingWidthMm'] = round(float(obj.CadOpeningWidth), 2)
        if hasattr(obj, 'Text'):
            entry['text'] = str(obj.Text)[:90]
        if hasattr(obj, 'Position'):
            entry['positionMm'] = [round(obj.Position.x, 2), round(obj.Position.y, 2)]
        if hasattr(obj, 'Shape') and not obj.Shape.isNull():
            bb = obj.Shape.BoundBox
            entry['boundsMm'] = [round(bb.XMin, 1), round(bb.YMin, 1), round(bb.XMax, 1), round(bb.YMax, 1)]
            limits[0] = min(limits[0], bb.XMin)
            limits[1] = min(limits[1], bb.YMin)
            limits[2] = max(limits[2], bb.XMax)
            limits[3] = max(limits[3], bb.YMax)
            if bb.XMin < -1 or bb.YMin < -1 or bb.XMax > max_x + 1 or bb.YMax > max_y + 1:
                raw_id = str(getattr(obj, 'CadAgentId', ''))
                safe_id = raw_id if raw_id and len(raw_id) <= 40 and raw_id[0].isalpha() and all(ch.isascii() and (ch.isalnum() or ch in '_-') for ch in raw_id) else 'unknown'
                geometry_errors.append({'code':'OUTSIDE_SITE','id':safe_id,'label':kind+'_'+safe_id,'boundsMm':[round(bb.XMin,1),round(bb.YMin,1),round(bb.XMax,1),round(bb.YMax,1)],'siteMm':[max_x,max_y]})
                warnings.append(kind+'_'+safe_id+' extends outside the site')
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
    palette = {'SITE':'#64748b','WALL':'#d8e8ef','BEAM':'#ff6b6b','DOOR':'#ffc66d','WINDOW':'#65d4e6','STAIR':'#db8ef7','FURNITURE':'#f79a90','DIMENSION':'#8da4b6','COLUMN':'#facc15','TEXT':'#f4e6c5','HATCH':'#6ca6a3','OTHER':'#b4c3cc'}
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
        parts.append('<polyline fill="none" stroke="'+palette.get(kind,palette['OTHER'])+'" stroke-width="'+str(36 if kind=='WALL' else 30 if kind=='BEAM' else 17 if kind in ('DOOR','WINDOW') else 11)+'" stroke-linejoin="round" points="'+coords+'"/>')
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
    # Completion checks use semantic metadata, never a user-controlled label/layer.
    counts={kind:sum(1 for o in summary if o['layer']==kind) for kind in palette}
    counts['WALL']=sum(1 for o in summary if 'wallStartMm' in o and 'wallEndMm' in o)
    wall_ids=set(o.get('id') for o in summary if 'wallStartMm' in o and 'wallEndMm' in o)
    counts['DOOR']=sum(1 for o in summary if o.get('hostWallId') in wall_ids and o.get('text')=='DOOR')
    counts['WINDOW']=sum(1 for o in summary if o.get('hostWallId') in wall_ids and o.get('text')=='WINDOW')
    by_id={o.get('id'):o for o in summary if o.get('id')}
    for wall in [o for o in summary if 'wallStartMm' in o]:
        openings=[]
        try: openings=json.loads(next(x.CadOpenings for x in doc.Objects if getattr(x,'CadAgentId','')==wall['id']))
        except Exception: warnings.append('Wall '+wall['id']+' has unreadable opening metadata')
        declared=set(item.get('id') for item in openings)
        hosted=set(o.get('id') for o in summary if o.get('hostWallId')==wall['id'])
        if declared != hosted: warnings.append('Wall '+wall['id']+' opening metadata does not match opening symbols')
        ax,ay=wall['wallStartMm']; bx,by=wall['wallEndMm']; dx=bx-ax; dy=by-ay; length=math.hypot(dx,dy)
        if length:
            ux,uy=dx/length,dy/length; nx,ny=-uy,ux; half=float(wall.get('wallThicknessMm',0))/2
            try: wall_obj=next(x for x in doc.Objects if getattr(x,'CadAgentId','')==wall['id'])
            except StopIteration: wall_obj=None
            for opening in openings:
                op=by_id.get(opening.get('id'))
                if not op or op.get('hostWallId')!=wall['id'] or abs(float(op.get('openingOffsetMm',-1))-float(opening.get('offset',-2)))>1 or abs(float(op.get('openingWidthMm',-1))-float(opening.get('width',-2)))>1:
                    warnings.append('Opening '+str(opening.get('id'))+' does not match its host wall interval')
                    continue
                lo=float(opening['offset'])+25; hi=float(opening['offset'])+float(opening['width'])-25; occupied=False
                if wall_obj:
                    for edge in wall_obj.Shape.Edges:
                        try: samples=edge.discretize(Deflection=20.0)
                        except Exception: samples=[v.Point for v in edge.Vertexes]
                        for p in samples:
                            along=(p.x-ax)*ux+(p.y-ay)*uy; across=abs((p.x-ax)*nx+(p.y-ay)*ny)
                            if lo < along < hi and across <= half+2: occupied=True; break
                        if occupied: break
                if occupied: warnings.append('Opening '+str(opening.get('id'))+' has wall geometry crossing its declared gap')
    for obj in summary:
        if obj.get('semantic')=='room':
            position=obj.get('positionMm'); label=obj.get('text','').strip()
            if not label: warnings.append('Room '+str(obj.get('id','?'))+' has no room label')
            if not position or len(position)!=2 or position[0]<0 or position[0]>max_x or position[1]<0 or position[1]>max_y: warnings.append('Room '+str(obj.get('id','?'))+' label position is outside the site')
        if obj.get('semantic') in ('furniture','stair'):
            bb=obj.get('boundsMm')
            if not bb or bb[0]<-1 or bb[1]<-1 or bb[2]>max_x+1 or bb[3]>max_y+1: warnings.append(str(obj.get('semantic'))+' '+str(obj.get('id','?'))+' has invalid plan bounds')
    if len(summary)>1200: raise RuntimeError('CAD drawing exceeds the inspection limit')
    return {'objects':summary, 'objectIds':[o['id'] for o in summary if o.get('id')], 'counts':counts, 'warnings':warnings[:30], 'geometryErrors':geometry_errors[:8], 'unverifiedChecks':['Room enclosure and room-to-exit accessibility are not automatically verified','No code, structural, or professional-plan review is performed'], 'segments':len(lines), 'siteMm':[max_x,max_y]}

doc = None
had_project = os.path.exists(PROJECT)
try:
    if os.path.exists(PROJECT):
        shutil.copy2(PROJECT, BACKUP)
        if os.path.exists(SVG): shutil.copy2(SVG, SVG_BACKUP)
        if os.path.exists(DXF): shutil.copy2(DXF, DXF_BACKUP)
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
    inspect_only = os.environ.get('QATTAN_CAD_INSPECT_ONLY') == '1'
    if not inspect_only:
        code=open(ACTION,encoding='utf-8').read()
        exec(compile(code,ACTION,'exec'),scope,scope)
    doc.recompute()
    details=emit_preview(doc)
    if details['segments']==0: raise RuntimeError('FreeCAD produced no visible geometry')
    if details['geometryErrors']:
        raise RuntimeError('CAD_BOUNDS_ERROR:'+json.dumps(details['geometryErrors'][:4],separators=(',',':')))
    if os.path.exists(PROJECT) and not inspect_only:
        versions=ROOT+'/versions'
        os.makedirs(versions,exist_ok=True)
        shutil.copy2(BACKUP,versions+'/v-'+str(__import__('time').time_ns())+'.FCStd')
        old=sorted([versions+'/'+n for n in os.listdir(versions) if n.endswith('.FCStd')],key=os.path.getmtime,reverse=True)
        for path in old[20:]: os.remove(path)
    doc.saveAs(PROJECT)
    json.dump({'ok':True,**details},open(RESULT,'w',encoding='utf-8'),ensure_ascii=False)
    if os.path.exists(FAILURE): os.remove(FAILURE)
    print('QATTAN_CAD_OK',len(doc.Objects),details['segments'])
except Exception as err:
    traceback.print_exc()
    json.dump({'ok':False,'error':str(err)[:900]},open(FAILURE,'w',encoding='utf-8'))
    if doc:
        try: App.closeDocument(doc.Name)
        except Exception: pass
    if had_project and os.path.exists(BACKUP): shutil.copy2(BACKUP,PROJECT)
    elif not had_project and os.path.exists(PROJECT): os.remove(PROJECT)
    if os.path.exists(SVG_BACKUP): shutil.copy2(SVG_BACKUP,SVG)
    elif os.path.exists(SVG): os.remove(SVG)
    if os.path.exists(DXF_BACKUP): shutil.copy2(DXF_BACKUP,DXF)
    elif os.path.exists(DXF): os.remove(DXF)
    sys.exit(1)
finally:
    if doc:
        try: App.closeDocument(doc.Name)
        except Exception: pass
sys.exit(0)
`;
