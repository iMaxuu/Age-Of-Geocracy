import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { world, makePath, intersects, type Bounds, type Point, type ResourceName } from './world';
import type { MapOwnership } from './mapApi';
import { availableForTerritory, type ResourcePools } from './resourcesApi';
export type MapMode='political'|'players'|ResourceName;
export type MapHandle={ zoom:(inward:boolean)=>void; reset:()=>void; focus:(id:number,zoom?:number)=>void; focusContinent:(id:number)=>void; redraw:()=>void };
type Props={mode:MapMode;selectedId:number|null;homeId:number;onSelect:(id:number)=>void;onError:(error:string)=>void;showBorders:boolean;playerCounts:Map<number,number>;ownership:Map<number,MapOwnership>;resourcePools:ResourcePools};
const CONTINENT_ZOOM:Record<number,{x:number;y:number;zoom:number}>={
  1:{x:-5940,y:3550,zoom:3.5},2:{x:-7950,y:-2600,zoom:2.9},3:{x:900,y:-4750,zoom:6},
  4:{x:170,y:1150,zoom:3.6},5:{x:6700,y:-2600,zoom:2.6},6:{x:11700,y:2700,zoom:3.9},7:{x:0,y:7280,zoom:2.6}
};
function makeImage(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('No se pudo cargar: '+src));image.src=src;});}
type PlayerLowChunk={arcs:Array<{points:Point[]}>;features:Array<{id:number;rings:number[][]}>};
const lowChunkCache=new Map<string,Promise<PlayerLowChunk>>();
async function loadPlayerLowChunk(id:string):Promise<PlayerLowChunk>{
  const previous=lowChunkCache.get(id);if(previous)return previous;
  const meta=world.chunks.find(chunk=>chunk.id===id);
  if(!meta)throw Error(`Sector inexistente: ${id}`);
  const loading=fetch(`/world/${meta.files.low}`).then(response=>{
    if(!response.ok)throw Error(`No se pudo cargar el sector ${id}`);
    return response.json() as Promise<PlayerLowChunk>;
  }).catch(error=>{lowChunkCache.delete(id);throw error;});
  lowChunkCache.set(id,loading);
  while(lowChunkCache.size>96)lowChunkCache.delete(lowChunkCache.keys().next().value!);
  return loading;
}
const SEA_COLOR='#202020';
const BACKGROUND_COLOR='#080808';
const EMPTY_PLAYER_COLOR='#303030';
function playerColor(count:number,max:number){
  if(count<=0)return EMPTY_PLAYER_COLOR;
  const intensity=Math.log1p(count)/Math.log1p(Math.max(1,max));
  const red=Math.round(64+181*intensity),green=Math.round(47-13*intensity);
  return `rgb(${red},${green},${green})`;
}
class CanvasMap {
  canvas:HTMLCanvasElement;
  ctx:CanvasRenderingContext2D;
  width=1;height=1;dpr=1;fit=1;
  camera={x:0,y:0,zoom:1};
  base:HTMLCanvasElement|null=null;
  framePath:Path2D|null=null;
  playerAtlas:HTMLCanvasElement|null=null;
  playerAtlasCounts:Map<number,number>|null=null;
  playerAtlasVersion=0;
  playerMax=1;
  resourceOverlay:HTMLCanvasElement|null=null;
  resourceOverlayMode:ResourceName|null=null;
  resourceOverlayPools:ResourcePools|null=null;
  resourceOverlayOwnership:Map<number,MapOwnership>|null=null;
  resourceOverlayVersion=0;
  atlas=new Map<string,HTMLImageElement>();
  loadingAtlases=new Set<string>();
  dragging:{id:number;x:number;y:number,startX:number,startY:number,moved:boolean}|null=null;
  fingers=new Map<number,Point>();
  ignoreClick=false;
  generation=0;
  clickVersion=0;
  displayKeys:string[]=[];
  raf=0;preloadTimer=0;
  props:Props;
  observer:ResizeObserver;
  disposed=false;
  constructor(canvas:HTMLCanvasElement,props:Props){
    this.canvas=canvas;this.props=props;this.ctx=canvas.getContext('2d')!;
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.bind();this.resize();
    this.camera={...(CONTINENT_ZOOM[world.territory.get(props.homeId)?.continentId||1]||this.camera)};this.changed();
    this.prepareBase();
    if(props.mode==='players')void this.preparePlayerAtlas();
  }
  async prepareBase(){
    if(!world.overview)return;
    const [a,b,c,d]=world.bounds,base=document.createElement('canvas');base.width=2400;base.height=Math.round(base.width*(d-b)/(c-a));
    const ctx=base.getContext('2d')!,scale=base.width/(c-a);
    ctx.setTransform(scale,0,0,scale,-a*scale,-b*scale);
    this.framePath=makePath([world.overview.frame]);
    ctx.fillStyle=SEA_COLOR;ctx.fill(this.framePath);
    for(const part of world.overview.land){
      ctx.fillStyle='#302a29';ctx.fill(makePath(part.polygons.flat()),'evenodd');
    }
    this.base=base;this.requestDraw();
  }
  async preparePlayerAtlas(){
    const counts=this.props.playerCounts;
    if(!world.overview||this.playerAtlasCounts===counts)return;
    const version=++this.playerAtlasVersion;
    const [a,b,c,d]=world.bounds,atlas=document.createElement('canvas');
    atlas.width=2400;atlas.height=Math.round(atlas.width*(d-b)/(c-a));
    const ctx=atlas.getContext('2d')!,scale=atlas.width/(c-a);
    ctx.setTransform(scale,0,0,scale,-a*scale,-b*scale);
    // La misma base terrestre que los mapas de recursos; el mar queda transparente.
    ctx.fillStyle=EMPTY_PLAYER_COLOR;
    for(const part of world.overview.land)ctx.fill(makePath(part.polygons.flat()),'evenodd');
    const byChunk=new Map<string,Map<number,number>>();
    this.playerMax=1;
    for(const [id,count] of counts){
      const territory=world.territory.get(id);
      if(!territory||count<=0)continue;
      this.playerMax=Math.max(this.playerMax,count);
      const active=byChunk.get(territory.chunkId)||new Map<number,number>();
      active.set(id,count);byChunk.set(territory.chunkId,active);
    }
    // El atlas mundial pinta exclusivamente los polígonos con jugadores.
    // Se cargan solo sus sectores, sin descargar los 60.000 territorios.
    this.playerAtlas=atlas;this.playerAtlasCounts=counts;this.requestDraw();
    const groups=Array.from(byChunk);
    let next=0;
    const worker=async()=>{
      while(next<groups.length&&!this.disposed&&version===this.playerAtlasVersion){
        const [chunkId,active]=groups[next++];
        try{
          // No modificar la caché de sectores visibles mientras se arma el atlas.
          const chunk=await loadPlayerLowChunk(chunkId);
          if(this.disposed||version!==this.playerAtlasVersion)return;
          for(const feature of chunk.features){
            const count=active.get(feature.id);
            if(!count)continue;
            const rings=feature.rings.map(refs=>{
              const ring:Point[]=[];
              for(const ref of refs){
                const points=chunk.arcs[Math.abs(ref)-1]?.points;
                if(points)ring.push(...(ref>0?points:points.slice().reverse()));
              }
              return ring;
            });
            ctx.fillStyle=playerColor(count,this.playerMax);ctx.fill(makePath(rings),'evenodd');
          }
          this.requestDraw();
        }catch(error){
          if(version===this.playerAtlasVersion)this.props.onError(error instanceof Error?error.message:'No se pudo cargar el calor de jugadores');
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(3,groups.length)},worker));
  }
  async prepareResourceOverlay(){
    const mode=this.props.mode;
    if(this.disposed||mode==='political'||mode==='players')return;
    if(this.resourceOverlayMode===mode&&this.resourceOverlayPools===this.props.resourcePools&&this.resourceOverlayOwnership===this.props.ownership)return;
    const version=++this.resourceOverlayVersion;
    this.resourceOverlayMode=mode;this.resourceOverlayPools=this.props.resourcePools;
    this.resourceOverlayOwnership=this.props.ownership;
    const pools=this.props.resourcePools,ownership=this.props.ownership;
    const individual=new Set<number>(),regions=new Set<number>();
    for(const pool of pools.values()){
      if(pool.resource_code!==mode||pool.max_amount<=0||pool.current_amount>=pool.max_amount)continue;
      if(pool.scope_kind==='region')regions.add(pool.scope_id);
      else individual.add(pool.scope_id);
    }
    for(const [id,owner] of ownership){if(owner.region_id&&regions.has(owner.region_id))individual.add(id);}
    const groups=new Map<string,Set<number>>();
    for(const id of individual){const territory=world.territory.get(id);if(!territory)continue;
      const active=groups.get(territory.chunkId)||new Set<number>();active.add(id);groups.set(territory.chunkId,active);
    }
    const [a,b,c,d]=world.bounds,overlay=document.createElement('canvas');
    overlay.width=2400;overlay.height=Math.round(overlay.width*(d-b)/(c-a));
    const ctx=overlay.getContext('2d')!,scale=overlay.width/(c-a);
    ctx.setTransform(scale,0,0,scale,-a*scale,-b*scale);
    this.resourceOverlay=overlay;this.requestDraw();
    if(!groups.size)return;
    try{await world.ensureStock();}catch(error){this.props.onError(String(error));return;}
    if(this.disposed||version!==this.resourceOverlayVersion)return;
    const pending=Array.from(groups);let next=0;
    const worker=async()=>{
      while(next<pending.length&&!this.disposed&&version===this.resourceOverlayVersion){
        const [chunkId,active]=pending[next++];
        try{
          const chunk=await loadPlayerLowChunk(chunkId);
          if(this.disposed||version!==this.resourceOverlayVersion)return;
          for(const feature of chunk.features){if(!active.has(feature.id))continue;
            const rings=feature.rings.map(refs=>{
              const ring:Point[]=[];
              for(const ref of refs){const points=chunk.arcs[Math.abs(ref)-1]?.points;
                if(points)ring.push(...(ref>0?points:points.slice().reverse()));
              }return ring;
            });
            const available=availableForTerritory(feature.id,mode,ownership,pools);
            ctx.fillStyle=world.resourceColor(feature.id,mode,available);
            ctx.fill(makePath(rings),'evenodd');
          }
          this.requestDraw();
        }catch(error){if(version===this.resourceOverlayVersion)this.props.onError(error instanceof Error?error.message:'Error al actualizar recursos del mapa');}
      }
    };
    await Promise.all(Array.from({length:Math.min(3,pending.length)},worker));
  }
  resize(){if(this.disposed)return;const bounds=this.canvas.getBoundingClientRect();this.width=Math.max(1,bounds.width);this.height=Math.max(1,bounds.height);this.dpr=Math.min(2,window.devicePixelRatio||1);
    const [a,b,c,d]=world.bounds;this.fit=Math.min(this.width/(c-a),this.height/(d-b))*.98;
    this.canvas.width=Math.ceil(this.width*this.dpr);this.canvas.height=Math.ceil(this.height*this.dpr);this.requestDraw();this.scheduleLoad();
  }
  scale(){return this.fit*this.camera.zoom;}
  worldAt(clientX:number,clientY:number):Point{const r=this.canvas.getBoundingClientRect(),s=this.scale();return [this.camera.x+(clientX-r.left-this.width/2)/s,this.camera.y+(clientY-r.top-this.height/2)/s];}
  visible(pad=0):Bounds{const s=this.scale();const x=this.width*(.5+pad)/s,y=this.height*(.5+pad)/s;return [this.camera.x-x,this.camera.y-y,this.camera.x+x,this.camera.y+y];}
  zoom(factor:number,cx?:number,cy?:number){const r=this.canvas.getBoundingClientRect(),px=cx??r.left+this.width/2,py=cy??r.top+this.height/2;
    const before=this.worldAt(px,py);this.camera.zoom=Math.max(.8,Math.min(240,this.camera.zoom*factor));const after=this.worldAt(px,py);
    this.camera.x+=before[0]-after[0];this.camera.y+=before[1]-after[1];this.changed();}
  focus(id:number,zoom=26){const t=world.territory.get(id);if(!t)return;this.camera={x:t.x,y:t.y,zoom};this.changed();}
  focusContinent(id:number){const target=CONTINENT_ZOOM[id];if(!target)return;this.camera={...target};this.changed();}
  reset(){this.camera={x:0,y:0,zoom:1};this.changed();}
  changed(){const [x,y,xx,yy]=world.bounds;this.camera.x=Math.max(x,Math.min(xx,this.camera.x));this.camera.y=Math.max(y,Math.min(yy,this.camera.y));this.scheduleLoad();this.requestDraw();}
  scheduleLoad(){clearTimeout(this.preloadTimer);this.preloadTimer=window.setTimeout(()=>void this.loadVisible(),100);}
  async loadVisible(){if(this.disposed)return;const gen=++this.generation,bounds=this.visible(.12),near=world.chunks.filter(c=>intersects(c.bbox,bounds));
    const count=near.reduce((sum,c)=>sum+c.count,0);
    if(this.camera.zoom<2.7||count>12000){this.displayKeys=[];this.requestDraw();return;}
    const lod=this.camera.zoom>=15?'high':this.camera.zoom>=5?'medium':'low';
    const chunks=near.sort((a,b)=>Math.hypot((a.bbox[0]+a.bbox[2])/2-this.camera.x,(a.bbox[1]+a.bbox[3])/2-this.camera.y)-Math.hypot((b.bbox[0]+b.bbox[2])/2-this.camera.x,(b.bbox[1]+b.bbox[3])/2-this.camera.y)).slice(0,22);
    this.displayKeys=chunks.map(c=>`${c.id}:${lod}`);this.requestDraw();let i=0;
    const worker=async()=>{while(i<chunks.length&&!this.disposed&&gen===this.generation){const c=chunks[i++];try{await world.loadChunk(c.id,lod);if(gen===this.generation)this.requestDraw();}catch(err){this.props.onError(err instanceof Error?err.message:'No se pudo cargar un sector');}}};
    await Promise.all(Array.from({length:Math.min(3,chunks.length)},worker));
  }
  async loadAtlas(key:string){if(this.atlas.has(key)||this.loadingAtlases.has(key))return;this.loadingAtlases.add(key);try{const image=await makeImage(`/world/resources/overview-${key}.png`);if(this.disposed)return;this.atlas.set(key,image);this.requestDraw();}catch(err){this.props.onError(err instanceof Error?err.message:'Error de recurso');}finally{this.loadingAtlases.delete(key);}}
  requestDraw(){if(this.disposed||this.raf)return;this.raf=requestAnimationFrame(()=>{this.raf=0;this.draw();});}
  draw(){if(this.disposed)return;const ctx=this.ctx,dpr=this.dpr,s=this.scale(),[a,b,c,d]=world.bounds;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=BACKGROUND_COLOR;ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    ctx.setTransform(dpr*s,0,0,dpr*s,(this.width/2-this.camera.x*s)*dpr,(this.height/2-this.camera.y*s)*dpr);
    const mode=this.props.mode,details=this.camera.zoom>2.7 && this.displayKeys.length>0;
    // En todos los modos, reemplazar los atlas simplificados por polígonos
    // detallados cuando se hayan cargado; evita costas borrosas y sombras.
    const detailedLod=this.camera.zoom>=15?'high':this.camera.zoom>=5?'medium':'low';
    const visibleChunks=this.camera.zoom>=5?world.chunks.filter(c=>intersects(c.bbox,this.visible())):[];
    const exactLand=details&&visibleChunks.length>0&&visibleChunks.length<=22&&visibleChunks.every(c=>
      this.displayKeys.includes(`${c.id}:${detailedLod}`)&&!!world.cached(c.id,detailedLod));
    if(exactLand&&this.framePath){ctx.fillStyle=SEA_COLOR;ctx.fill(this.framePath);}
    else if(this.base)ctx.drawImage(this.base,a,b,c-a,d-b);
    if(mode==='players'){
      if(!exactLand&&this.playerAtlas)ctx.drawImage(this.playerAtlas,a,b,c-a,d-b);
    }else if(mode!=='political'){
      const atlas=this.atlas.get(mode);if(!exactLand&&atlas)ctx.drawImage(atlas,a,b,c-a,d-b);
      if(!exactLand&&this.resourceOverlay&&this.resourceOverlayMode===mode)ctx.drawImage(this.resourceOverlay,a,b,c-a,d-b);
    }
    if(details){
      const bounds=this.visible();
      for(const key of this.displayKeys){const [id,lod]=key.split(':');const chunk=world.cached(id,lod as 'low'|'medium'|'high');if(!chunk)continue;
        for(const f of chunk.features){if(!intersects(f.bbox,bounds))continue;
          const owner=this.props.ownership.get(f.id);
          if(mode==='political'){ctx.fillStyle=owner?.color || '#302a29';ctx.fill(f.path,'evenodd');}
          else if(mode!=='players'){
            const available=availableForTerritory(f.id,mode,this.props.ownership,this.props.resourcePools);
            ctx.fillStyle=world.resourceColor(f.id,mode,available);ctx.fill(f.path,'evenodd');
          }
          else {ctx.fillStyle=playerColor(this.props.playerCounts.get(f.id)||0,this.playerMax);ctx.fill(f.path,'evenodd');}
          if(this.props.showBorders||this.camera.zoom>30){ctx.lineWidth=Math.max(.5/s,.5);ctx.strokeStyle='rgba(0,0,0,.42)';ctx.stroke(f.path);}
        }
      }
    }
    // Resaltado preciso del polígono seleccionado sin alterar el mapa base.
    const selectedTerritory=world.territory.get(this.props.selectedId||-1);
    if(selectedTerritory){
      const chunk=world.cached(selectedTerritory.chunkId,'high');
      const polygon=chunk?.features.find(f=>f.id===selectedTerritory.id);
      if(polygon){
        ctx.strokeStyle=getComputedStyle(this.canvas).getPropertyValue('--map-accent').trim()||'#d62718';
        // El territorio puede ocupar apenas unos píxeles con el mapa alejado.
        // Reforzar su propio contorno sin agregar un marcador circular.
        const visibleWidth=this.camera.zoom<2.7?6:this.camera.zoom<5?4.5:3.5;
        ctx.lineWidth=visibleWidth/s;ctx.stroke(polygon.path);
      }
    }
    const home=world.territory.get(this.props.homeId);
    if(home&&home.id!==selectedTerritory?.id){ctx.fillStyle='#fff3a1';ctx.strokeStyle='#111';ctx.lineWidth=1.5/s;ctx.beginPath();ctx.arc(home.x,home.y,5/s,0,Math.PI*2);ctx.fill();ctx.stroke();}
  }
  bind(){const canvas=this.canvas;
    canvas.addEventListener('wheel',this.onWheel,{passive:false});canvas.addEventListener('pointerdown',this.onDown);canvas.addEventListener('pointermove',this.onMove);
    canvas.addEventListener('pointerup',this.onUp);canvas.addEventListener('pointercancel',this.onUp);canvas.addEventListener('click',this.onClick);
    canvas.addEventListener('dblclick',this.onDoubleClick);
  }
  onWheel=(e:WheelEvent)=>{e.preventDefault();this.zoom(e.deltaY<0?1.25:.8,e.clientX,e.clientY);};
  onDown=(e:PointerEvent)=>{if(e.pointerType==='mouse'&&e.button!==0)return;this.fingers.set(e.pointerId,[e.clientX,e.clientY]);this.canvas.setPointerCapture(e.pointerId);
    this.dragging={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};};
  onMove=(e:PointerEvent)=>{
    if(!this.fingers.has(e.pointerId))return;
    const prev=[...this.fingers.values()];this.fingers.set(e.pointerId,[e.clientX,e.clientY]);
    if(this.fingers.size===2){const next=[...this.fingers.values()];const dist=(p:Point[])=>Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(dist(prev)>0)this.zoom(dist(next)/dist(prev),(next[0][0]+next[1][0])/2,(next[0][1]+next[1][1])/2);this.ignoreClick=true;return;}
    const d=this.dragging;if(!d||d.id!==e.pointerId)return;
    if(!d.moved&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<5)return;
    d.moved=true;this.camera.x-=(e.clientX-d.x)/this.scale();this.camera.y-=(e.clientY-d.y)/this.scale();d.x=e.clientX;d.y=e.clientY;this.changed();
  };
  onUp=(e:PointerEvent)=>{this.fingers.delete(e.pointerId);if(this.dragging?.id===e.pointerId){this.ignoreClick ||=this.dragging.moved;this.dragging=null;}if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);};
  onClick=(e:MouseEvent)=>{if(this.ignoreClick){this.ignoreClick=false;return;}const gen=++this.clickVersion;const [x,y]=this.worldAt(e.clientX,e.clientY);
    void world.hit(x,y).then(id=>{if(!this.disposed&&gen===this.clickVersion&&id)this.props.onSelect(id);}).catch(err=>this.props.onError(String(err)));};
  onDoubleClick=(e:MouseEvent)=>{e.preventDefault();this.zoom(1.7,e.clientX,e.clientY);};
  destroy(){this.disposed=true;this.playerAtlasVersion++;this.resourceOverlayVersion++;cancelAnimationFrame(this.raf);clearTimeout(this.preloadTimer);this.observer.disconnect();this.canvas.removeEventListener('wheel',this.onWheel);this.canvas.removeEventListener('pointerdown',this.onDown);this.canvas.removeEventListener('pointermove',this.onMove);this.canvas.removeEventListener('pointerup',this.onUp);this.canvas.removeEventListener('pointercancel',this.onUp);this.canvas.removeEventListener('click',this.onClick);this.canvas.removeEventListener('dblclick',this.onDoubleClick);this.atlas.clear();this.base=null;this.framePath=null;this.playerAtlas=null;this.playerAtlasCounts=null;this.resourceOverlay=null;}
}
export const MapCanvas=forwardRef<MapHandle,Props>(function MapCanvas(props,ref){
  const canvas=useRef<HTMLCanvasElement>(null),instance=useRef<CanvasMap|null>(null);
  useEffect(()=>{if(!canvas.current||!world.overview)return;const renderer=new CanvasMap(canvas.current,props);instance.current=renderer;return()=>{instance.current=null;renderer.destroy();};},[]);
  useEffect(()=>{if(!instance.current)return;instance.current.props=props;instance.current.requestDraw();if(props.mode==='players')void instance.current.preparePlayerAtlas();else if(props.mode!=='political'){void instance.current.loadAtlas(props.mode);void instance.current.prepareResourceOverlay();}if(props.selectedId){const t=world.territory.get(props.selectedId);if(t)void world.loadChunk(t.chunkId,'high').then(()=>instance.current?.requestDraw()).catch(()=>{});}},[props.mode,props.selectedId,props.homeId,props.showBorders,props.playerCounts,props.ownership,props.resourcePools,props.onError,props.onSelect]);
  useImperativeHandle(ref,()=>({zoom:inward=>instance.current?.zoom(inward?1.35:1/1.35),reset:()=>instance.current?.reset(),focus:(id,z)=>instance.current?.focus(id,z),focusContinent:id=>instance.current?.focusContinent(id),redraw:()=>instance.current?.requestDraw()}),[]);
  return <canvas ref={canvas} className="aog-world-canvas" role="application" aria-label="Mapa mundial Equal Earth. Arrastrá para mover, rueda para acercar, tocá para seleccionar" tabIndex={0}/>;
});
