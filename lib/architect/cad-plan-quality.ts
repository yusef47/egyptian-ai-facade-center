export type CadPlanObject = {
  id?: string; semantic?: string; text?: string; kind?: string; boundsMm?: number[];
  positionMm?: number[]; wallStartMm?: number[]; wallEndMm?: number[]; wallThicknessMm?: number;
  hostWallId?: string; openingOffsetMm?: number; openingWidthMm?: number;
};
export type CadPlanQualityIssue = {
  code: "furniture_opening_clearance" | "furniture_wall_collision" | "room_inaccessible" | "wet_room_ventilation" | "habitable_daylight" | "stair_fit" | "room_labels_missing" | "program_count" | "duplicate_opening";
  severity: "blocking" | "improvement";
  ids: string[];
  message: string;
};
type PlanInspection = { objects: CadPlanObject[]; siteMm: number[] };

const topologyCodes = new Set<CadPlanQualityIssue["code"]>(["program_count", "room_labels_missing", "duplicate_opening", "room_inaccessible", "wet_room_ventilation", "stair_fit"]);
export type CadPlanFocus = { phase: "topology" | "furnishing"; blockingCodes: CadPlanQualityIssue["code"][]; allowedOps: string[] };

function numberToken(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return ({ one: 1, two: 2, three: 3, four: 4, five: 5, واحد: 1, واحدة: 1, اثنين: 2, اثنتين: 2, شقة: 1, شقتين: 2, شقتان: 2, ثلاث: 3, ثلاثة: 3, أربع: 4, أربعة: 4 } as Record<string, number>)[normalized.toLowerCase()] ?? null;
}

function requestedBedroomCount(brief: string): number | null {
  const apartmentsMatch = brief.match(/\b(\d+|one|two|three|four|five)\s+apartments?\b/i) ?? brief.match(/(\d+|[٠-٩]+|شقة|شقتين|شقتان)\s*(?:مستقلة|مستقلتين|مستقلتان)?\s*شقق?/i) ?? brief.match(/(شقتين|شقتان|شقة واحدة)/i);
  const apartmentCount = numberToken(apartmentsMatch?.[1]) ?? numberToken(apartmentsMatch?.[2]) ?? (apartmentsMatch?.[1] === "شقة" ? 1 : null);
  const perApartment = brief.match(/\b(\d+|one|two|three|four|five)\s+(?:bedrooms?|bed\s*rooms?)\s+(?:per|each)\s+apartment\b/i)
    ?? brief.match(/(?:لكل\s+شقة|في\s+كل\s+شقة|كل\s+شقة\s+(?:فيها|بها)?|كل\s+واحدة\s+(?:فيها|بها)?|each\s+apartment\s+has)\s*(\d+|[٠-٩]+|ثلاث|ثلاثة|أربع|أربعة)\s*غرف?\s*(?:نوم)?/i)
    ?? brief.match(/(\d+|[٠-٩]+|ثلاث|ثلاثة|أربع|أربعة)\s*غرف\s+نوم\s+لكل\s+شقة/i);
  const each = numberToken(perApartment?.[1]);
  if (each && apartmentCount) return each * apartmentCount;
  const total = brief.match(/\b(\d+|one|two|three|four|five)\s+(?:bedrooms?|bed\s*rooms?)\b/i)
    ?? brief.match(/(\d+|[٠-٩]+|ثلاث|ثلاثة|أربع|أربعة)\s+غرف\s+نوم/i);
  return numberToken(total?.[1]);
}

export function cadPlanFocus(issues: CadPlanQualityIssue[], brief: string, inspection: PlanInspection | null): CadPlanFocus {
  const blockers = new Set(issues.filter((issue) => issue.severity === "blocking" && topologyCodes.has(issue.code)).map((issue) => issue.code));
  if (!inspection && /(apartment|bedroom|شقة|غرف)/i.test(brief)) blockers.add("room_labels_missing");
  return blockers.size
    ? { phase: "topology", blockingCodes: [...blockers], allowedOps: ["wall", "opening", "room", "shaft", "stair", "delete", "move", "rotate"] }
    : { phase: "furnishing", blockingCodes: [], allowedOps: ["wall", "opening", "room", "shaft", "stair", "furniture", "delete", "move", "rotate", "dimension", "hatch", "line", "polyline", "circle", "arc", "beam", "column", "copy", "offset", "set-layer"] };
}

const validId = (value?: string) => value && /^[a-z][a-z0-9_-]{1,39}$/i.test(value) ? value : "unknown";
const isBedroomLabel = (object: CadPlanObject) => /\bbed(?:room)?\b|غرف?\s+نوم|نوم/i.test(object.text ?? "");
const center = (object: CadPlanObject): [number, number] | null => {
  const b = object.boundsMm;
  if (b?.length === 4 && b.every(Number.isFinite)) return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const p = object.positionMm;
  return p?.length === 2 && p.every(Number.isFinite) ? [p[0], p[1]] : null;
};
const bounds = (object: CadPlanObject) => object.boundsMm?.length === 4 && object.boundsMm.every(Number.isFinite) ? object.boundsMm as [number, number, number, number] : null;
function distancePointSegment(point: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}
function segmentRectDistance(a: [number, number], b: [number, number], rect: [number, number, number, number]) {
  const inside = (p: [number, number]) => p[0] >= rect[0] && p[0] <= rect[2] && p[1] >= rect[1] && p[1] <= rect[3];
  const orient = (p: [number, number], q: [number, number], r: [number, number]) => (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const intersects = (p: [number, number], q: [number, number], r: [number, number], s: [number, number]) => orient(p,q,r)*orient(p,q,s) <= 0 && orient(r,s,p)*orient(r,s,q) <= 0;
  if (inside(a) || inside(b)) return 0;
  const corners: [number, number][] = [[rect[0],rect[1]],[rect[2],rect[1]],[rect[2],rect[3]],[rect[0],rect[3]]];
  let best = Math.min(...corners.map((p) => distancePointSegment(p, a, b)));
  for (let i=0;i<4;i++) {
    const c=corners[i], d=corners[(i+1)%4];
    if (intersects(a,b,c,d)) return 0;
    best = Math.min(best, distancePointSegment(a,c,d), distancePointSegment(b,c,d));
  }
  return best;
}
function segmentSegmentDistance(a:[number,number],b:[number,number],c:[number,number],d:[number,number]){
  const orient=(p:[number,number],q:[number,number],r:[number,number])=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  if(orient(a,b,c)*orient(a,b,d)<=0&&orient(c,d,a)*orient(c,d,b)<=0)return 0;
  return Math.min(distancePointSegment(a,c,d),distancePointSegment(b,c,d),distancePointSegment(c,a,b),distancePointSegment(d,a,b));
}

function roomReachability(inspection: PlanInspection, rooms: CadPlanObject[], walls: CadPlanObject[], openings: CadPlanObject[], furniture: CadPlanObject[]) {
  const [width, height] = inspection.siteMm;
  if (!(width > 0 && height > 0) || !walls.length || !rooms.length) return { missingEntry: rooms.length > 0, unreachable: rooms };
  const step = Math.max(250, Math.max(width, height) / 200);
  const nx = Math.ceil(width / step), ny = Math.ceil(height / step);
  if (nx * ny > 45_000) return { missingEntry: false, unreachable: [] as CadPlanObject[] };
  const doors = openings.filter((o) => o.text === "DOOR" && o.hostWallId);
  const doorByWall = new Map<string, CadPlanObject[]>();
  for (const door of doors) doorByWall.set(door.hostWallId!, [...(doorByWall.get(door.hostWallId!) ?? []), door]);
  const wallBlocks = (x: number, y: number) => walls.some((wall) => {
    if (!wall.wallStartMm || !wall.wallEndMm) return false;
    const a=wall.wallStartMm as [number,number], b=wall.wallEndMm as [number,number];
    if (distancePointSegment([x,y],a,b) > (wall.wallThicknessMm ?? 200)/2 + step*.55) return false;
    const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy); if (!len) return true;
    const along=((x-a[0])*dx+(y-a[1])*dy)/len;
    return !(doorByWall.get(wall.id ?? "") ?? []).some((door) => Math.abs(along - ((door.openingOffsetMm ?? 0)+(door.openingWidthMm ?? 0)/2)) < (door.openingWidthMm ?? 0)/2 - step*.45);
  });
  const furnitureBlocks = (x: number, y: number) => furniture.some((item) => { const b=bounds(item); return !!b && x>=b[0]-step*.5 && x<=b[2]+step*.5 && y>=b[1]-step*.5 && y<=b[3]+step*.5; });
  const blocked = (i:number,j:number) => { const x=Math.min(width,(i+.5)*step), y=Math.min(height,(j+.5)*step); return wallBlocks(x,y)||furnitureBlocks(x,y); };
  const entrySeeds: [number,number][]=[];
  for (const door of doors) {
    const wall=walls.find((item)=>item.id===door.hostWallId); if (!wall?.wallStartMm||!wall.wallEndMm) continue;
    const a=wall.wallStartMm as [number,number], b=wall.wallEndMm as [number,number], dx=b[0]-a[0],dy=b[1]-a[1], len=Math.hypot(dx,dy); if (!len) continue;
    const along=(door.openingOffsetMm??0)+(door.openingWidthMm??0)/2, px=a[0]+dx/len*along, py=a[1]+dy/len*along;
    const edge=Math.min(Math.abs(py),Math.abs(height-py),Math.abs(px),Math.abs(width-px)); if (edge> (wall.wallThicknessMm??200)+300) continue;
    let vx=width/2-px, vy=height/2-py; const norm=Math.hypot(vx,vy)||1; vx/=norm;vy/=norm;
    const si=Math.max(0,Math.min(nx-1,Math.floor((px+vx*(step+100))/step))), sj=Math.max(0,Math.min(ny-1,Math.floor((py+vy*(step+100))/step)));
    for(let ox=-1;ox<=1;ox++) for(let oy=-1;oy<=1;oy++){const i=si+ox,j=sj+oy;if(i>=0&&j>=0&&i<nx&&j<ny&&!blocked(i,j))entrySeeds.push([i,j]);}
  }
  const queue=entrySeeds, seen=new Set<string>();
  for(let qi=0;qi<queue.length;qi++){const [i,j]=queue[qi], key=`${i},${j}`;if(seen.has(key))continue;seen.add(key);for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=i+di,y=j+dj,k=`${x},${y}`;if(x>=0&&y>=0&&x<nx&&y<ny&&!seen.has(k)&&!blocked(x,y)){seen.add(k);queue.push([x,y]);}}}
  const unreachable=rooms.filter((room)=>{const p=center(room);if(!p)return true;const i=Math.floor(p[0]/step),j=Math.floor(p[1]/step);for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)if(seen.has(`${i+ox},${j+oy}`))return false;return true;});
  return { missingEntry: entrySeeds.length===0, unreachable };
}

export function evaluateCadPlanQuality(inspection: PlanInspection, brief = ""): CadPlanQualityIssue[] {
  const issues: CadPlanQualityIssue[]=[];
  const objects=inspection.objects, rooms=objects.filter((o)=>o.semantic==="room"), walls=objects.filter((o)=>o.wallStartMm&&o.wallEndMm), openings=objects.filter((o)=>o.semantic==="opening"), furniture=objects.filter((o)=>o.semantic==="furniture"), stairs=objects.filter((o)=>o.semantic==="stair"), shafts=objects.filter((o)=>o.semantic==="shaft");
  if(rooms.length===0 && /(apartment|bedroom|bath|kitchen|شقة|غرفة|حمام|مطبخ)/i.test(brief)) issues.push({code:"room_labels_missing",severity:"blocking",ids:[],message:"The brief requests residential rooms but the drawing has no semantic room labels to review."});
  const requestedBedrooms = requestedBedroomCount(brief);
  if (requestedBedrooms !== null) {
    const bedroomLabels = rooms.filter(isBedroomLabel);
    const labeledBedrooms = bedroomLabels.length;
    if (labeledBedrooms !== requestedBedrooms) issues.push({ code: "program_count", severity: "blocking", ids: bedroomLabels.map((room) => validId(room.id)).slice(0, 8), message: `The brief requests ${requestedBedrooms} bedrooms, but ${labeledBedrooms} semantic bedroom labels are present; resolve the room program before furnishing.` });
  }
  const openingGroups = new Map<string, CadPlanObject[]>();
  for (const opening of openings) if (opening.hostWallId && typeof opening.openingOffsetMm === "number" && typeof opening.openingWidthMm === "number") {
    openingGroups.set(opening.hostWallId, [...(openingGroups.get(opening.hostWallId) ?? []), opening]);
  }
  for (const [wallId, hosted] of openingGroups) {
    const ordered = [...hosted].sort((a, b) => (a.openingOffsetMm ?? 0) - (b.openingOffsetMm ?? 0));
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1], current = ordered[i];
      if ((current.openingOffsetMm ?? 0) < (previous.openingOffsetMm ?? 0) + (previous.openingWidthMm ?? 0) - 1) {
        issues.push({ code: "duplicate_opening", severity: "blocking", ids: [validId(previous.id), validId(current.id), validId(wallId)], message: "Hosted openings " + validId(previous.id) + " and " + validId(current.id) + " overlap on wall " + validId(wallId) + "; keep one opening or reposition one before adding more doors or windows." });
      }
    }
  }
  for(const furnishing of furniture){const fb=bounds(furnishing);if(!fb)continue;
    for(const opening of openings){const ob=bounds(opening);if(!ob)continue;const clearance=opening.text==="WINDOW"?300:150;const overlap=fb[0]<ob[2]+clearance&&fb[2]>ob[0]-clearance&&fb[1]<ob[3]+clearance&&fb[3]>ob[1]-clearance;if(overlap){issues.push({code:"furniture_opening_clearance",severity:"blocking",ids:[validId(furnishing.id),validId(opening.id)],message:`Furniture ${validId(furnishing.id)} conflicts with ${opening.text?.toLowerCase()??"opening"} ${validId(opening.id)}; relocate it to preserve access, door swing, and window clearance.`});break;}}
    for(const wall of walls){if(!wall.wallStartMm||!wall.wallEndMm)continue;const penetration=(wall.wallThicknessMm??200)/2-30;if(penetration>0&&segmentRectDistance(wall.wallStartMm as [number,number],wall.wallEndMm as [number,number],fb)<penetration){issues.push({code:"furniture_wall_collision",severity:"blocking",ids:[validId(furnishing.id),validId(wall.id)],message:`Furniture ${validId(furnishing.id)} penetrates wall ${validId(wall.id)} beyond its face; shift the symbol out of the wall footprint.`});break;}}
  }
  for(const room of rooms){const name=room.text??"", id=validId(room.id), p=center(room);if(!p)continue;
    const wet=/(bath|bathroom|toilet|wc|kitchen|حمام|دورة مياه|مطبخ|مغسلة)/i.test(name);
    const habitable=/(bed|bedroom|living|reception|معيشة|نوم|ريسبشن|صالة)/i.test(name);
    const hostById=new Map(walls.map((wall)=>[wall.id,wall]));
    const exteriorWindows=openings.filter((opening)=>{
      if(opening.text!=="WINDOW"||!opening.hostWallId)return false;
      const wall=hostById.get(opening.hostWallId);if(!wall?.wallStartMm||!wall.wallEndMm)return false;
      const [width,height]=inspection.siteMm,a=wall.wallStartMm as [number,number],b=wall.wallEndMm as [number,number],tol=(wall.wallThicknessMm??200)/2+250;
      const onWest=Math.abs(a[0])<=tol&&Math.abs(b[0])<=tol;
      const onEast=Math.abs(a[0]-width)<=tol&&Math.abs(b[0]-width)<=tol;
      const onSouth=Math.abs(a[1])<=tol&&Math.abs(b[1])<=tol;
      const onNorth=Math.abs(a[1]-height)<=tol&&Math.abs(b[1]-height)<=tol;
      return onWest||onEast||onSouth||onNorth;
    });
    const clearPath=(target:CadPlanObject)=>{const q=center(target);if(!q)return false;return !walls.some((wall)=>wall.id!==target.hostWallId&&wall.wallStartMm&&wall.wallEndMm&&segmentSegmentDistance(p,q,wall.wallStartMm as [number,number],wall.wallEndMm as [number,number])<Math.max(80,(wall.wallThicknessMm??200)/2));};
    const nearShaft=shafts.some((shaft)=>{const b=bounds(shaft);if(!b)return false;const dx=Math.max(b[0]-p[0],0,p[0]-b[2]),dy=Math.max(b[1]-p[1],0,p[1]-b[3]);return Math.hypot(dx,dy)<=2500;});
    const nearbyExteriorWindow=(radius:number)=>exteriorWindows.some((window)=>{const c=center(window);return !!c&&Math.hypot(c[0]-p[0],c[1]-p[1])<=radius&&clearPath(window);});
    if(wet&&!nearShaft&&!nearbyExteriorWindow(4000))issues.push({code:"wet_room_ventilation",severity:"blocking",ids:[id],message:`Wet room ${id} has no nearby labeled shaft symbol or clear nearby exterior-window path. Consider placing the wet core beside a shaft symbol or near an exterior window; symbol proximity does not verify a duct connection or ventilation performance.`});
    if(habitable&&!nearbyExteriorWindow(6000))issues.push({code:"habitable_daylight",severity:"improvement",ids:[id],message:`Habitable room ${id} has no clear nearby exterior-window path; consider an exterior window or revise the room placement.`});
  }
  if(rooms.length){const access=roomReachability(inspection,rooms,walls,openings,furniture);if(access.missingEntry)issues.push({code:"room_inaccessible",severity:"blocking",ids:rooms.map((o)=>validId(o.id)).slice(0,8),message:"No accessible exterior door was found to seed a circulation check; provide an entry and connect the room labels to it through door gaps."});for(const room of access.unreachable.slice(0,8))issues.push({code:"room_inaccessible",severity:"blocking",ids:[validId(room.id)],message:`Room ${validId(room.id)} is not reachable from an exterior entry through the measured wall gaps; check its door and circulation route.`});}
  for(const stair of stairs){const b=bounds(stair);if(!b||b[2]-b[0]<800||b[3]-b[1]<800)issues.push({code:"stair_fit",severity:"blocking",ids:[validId(stair.id)],message:`Stair ${validId(stair.id)} has no usable measured footprint; move or resize the flight and confirm it connects to the circulation route.`});}
  return issues.sort((a, b) => Number(topologyCodes.has(b.code)) - Number(topologyCodes.has(a.code)) || Number(b.severity === "blocking") - Number(a.severity === "blocking")).slice(0,30);
}
