/** Static world from legacy AOG: Equal Earth EPSG:8857, 59,960 territories, seven continents.
 * Geometry is streamed per chunk and LOD; ownership/travel/player counts are server data.
 */
export type Point=[number,number];
export type Bounds=[number,number,number,number];
export type Territory={id:number;continentId:number;chunkId:string;x:number;y:number;lon:number;lat:number;areaKm2:number;seaAccess:boolean;island:boolean;bbox:Bounds};
export type Continent={id:number;name:string;slug:string;territoryCount:number};
export type ChunkMeta={id:string;continentId:number;slug:string;bbox:Bounds;count:number;files:Record<'low'|'medium'|'high',string>};
export type ChunkFeature={id:number;bbox:Bounds;path:Path2D;rings:Point[][]};
export type Chunk={id:string;features:ChunkFeature[];arcs:Array<{owners:number[];points:Point[]}>};
export type ResourceName='wood'|'mineral'|'gold'|'oil'|'diamond'|'uranium'|'geocracyum'|'aurexium';
export const RESOURCES:ResourceName[]=['wood','mineral','gold','oil','diamond','uranium','geocracyum','aurexium'];
export type ResourceInfo={label:string;p95:number;max:number;palette:string[];regenSeconds:number};
export type ResourceManifest={keys:ResourceName[];resources:Record<ResourceName,ResourceInfo>;territoryCount:number};
export type Overview={frame:Point[];land:Array<{continentId:number;polygons:Point[][][]}>};
const ROOT='/world/';
const getJSON=async <T,>(file:string):Promise<T>=>{const r=await fetch(ROOT+file);if(!r.ok)throw Error(`Error de mapa: ${file} (${r.status})`);return r.json() as Promise<T>;};
export function intersects(a:Bounds,b:Bounds){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function inside(b:Bounds,x:number,y:number){return x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3];}
export function makePath(rings:Point[][]){const path=new Path2D();for(const ring of rings){if(!ring.length)continue;path.moveTo(ring[0][0],ring[0][1]);for(const [x,y] of ring.slice(1))path.lineTo(x,y);path.closePath();}return path;}
function inRing(x:number,y:number,ring:Point[]){let within=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])within=!within;}return within;}
export function geographicDistanceKm(a:Territory,b:Territory){const rad=Math.PI/180;const dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;const q=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371.0088*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));}
export function travelSeconds(distanceKm:number){return Math.max(180,Math.round(distanceKm*1.08));}
export function clock(seconds:number){const s=Math.max(0,Math.ceil(seconds));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');}
export function formatKm(km:number){return `${new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(Math.round(km))} KM`;}
class WorldData {
  readonly territory=new Map<number,Territory>();
  readonly continents=new Map<number,Continent>();
  chunks:ChunkMeta[]=[];
  bounds:Bounds=[-17244,-8393,17244,8393];
  overview:Overview|null=null;
  resourceManifest:ResourceManifest|null=null;
  private stock:DataView|null=null;
  private cache=new Map<string,Chunk>();
  private loading=new Map<string,Promise<Chunk>>();
  async init(){
    const [index,manifest,continents,overview,resManifest]=await Promise.all([
      getJSON<{rows:(string|number)[][]}>('territory-index.json'),
      getJSON<{chunks:ChunkMeta[];bounds:Bounds}>('chunks.json'),
      getJSON<{continents:Continent[]}>('continents.json'),
      getJSON<Overview>('overview.json'),
      getJSON<ResourceManifest>('resources/manifest.json')
    ]);
    this.bounds=manifest.bounds;this.chunks=manifest.chunks;this.overview=overview;this.resourceManifest=resManifest;
    this.territory.clear();this.continents.clear();
    for(const c of continents.continents)this.continents.set(c.id,c);
    for(const r of index.rows){const n=r.map((v,i)=>i===2?v:Number(v)) as (number|string)[];
      this.territory.set(n[0] as number,{id:n[0] as number,continentId:n[1] as number,chunkId:n[2] as string,
        x:n[3] as number,y:n[4] as number,lon:n[5] as number,lat:n[6] as number,areaKm2:n[7] as number,
        seaAccess:!!n[8],island:!!n[9],bbox:n.slice(10,14) as Bounds});
    }
  }
  async loadChunk(id:string,lod:'low'|'medium'|'high'='low'):Promise<Chunk>{
    const key=`${id}:${lod}`;const cached=this.cache.get(key);if(cached){this.cache.delete(key);this.cache.set(key,cached);return cached;}
    const pending=this.loading.get(key);if(pending)return pending;
    const meta=this.chunks.find(c=>c.id===id);if(!meta)throw Error('Sector inexistente');
    const promise=getJSON<{arcs:Array<{owners:number[];points:Point[]}>;features:Array<{id:number;rings:number[][]}>}>(meta.files[lod]).then(raw=>{
      const features:ChunkFeature[]=raw.features.map(f=>{
        const rings=f.rings.map(refs=>{const ring:Point[]=[];for(const ref of refs){const points=raw.arcs[Math.abs(ref)-1]?.points;if(!points)continue;if(ref>0)ring.push(...points);else ring.push(...points.slice().reverse());}return ring;});
        return {id:f.id,bbox:this.territory.get(f.id)?.bbox||meta.bbox,rings,path:makePath(rings)};
      });const result={id,features,arcs:raw.arcs};this.cache.set(key,result);
      // Bounded geometry: at most 26 streamed sectors/LODs remain in memory.
      while(this.cache.size>26){this.cache.delete(this.cache.keys().next().value as string);}
      return result;
    }).finally(()=>{this.loading.delete(key);});
    this.loading.set(key,promise);return promise;
  }
  cached(id:string,lod:'low'|'medium'|'high'){return this.cache.get(`${id}:${lod}`);}
  async hit(x:number,y:number):Promise<number|null>{
    for(const c of this.chunks){if(!inside(c.bbox,x,y))continue;
      const chunk=await this.loadChunk(c.id,'high');for(const f of chunk.features){if(!inside(f.bbox,x,y))continue;
        if(f.rings.length && inRing(x,y,f.rings[0])&&!f.rings.slice(1).some(r=>inRing(x,y,r)))return f.id;
      }
    }return null;
  }
  async ensureStock(){if(this.stock)return;const response=await fetch(ROOT+'resources/maxima.bin');if(!response.ok)throw Error('No se pudieron cargar los recursos naturales');this.stock=new DataView(await response.arrayBuffer());}
  stockFor(id:number,type:ResourceName){const column=RESOURCES.indexOf(type);if(!this.stock||column<0)return null;const offset=(id*8+column)*4;return offset+4<=this.stock.byteLength?this.stock.getUint32(offset,true):null;}
  resourceColor(id:number,type:ResourceName,availableOverride?:number|null){const info=this.resourceManifest?.resources[type],value=availableOverride??this.stockFor(id,type);if(!info||value===null)return '#505050';const normalized=Math.min(1,value/Math.max(1,info.p95));const curve=type==='mineral'?normalized:Math.sqrt(normalized);return info.palette[Math.min(info.palette.length-1,Math.round(curve*(info.palette.length-1)))];}
}
export const world=new WorldData();
