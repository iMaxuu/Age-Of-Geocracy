import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '../auth/player';
import { MapCanvas, type MapHandle, type MapMode } from './MapCanvas';
import { world, RESOURCES, formatKm, clock, geographicDistanceKm, travelSeconds, type ResourceName } from './world';
import { cancelTravel, getOwnership, getPlayerHeatmap, startTravel, travelStatus, type MapOwnership, type TravelStatus } from './mapApi';
import { getResourceMapSnapshot, getResourceStatus, type ResourcePools, type ResourceStatus } from './resourcesApi';
import { getPartyHeatmap } from './partyHeatmapApi';
import '../home/home.css';
import './map.css';

type Props={player:Player;onPlayerChange:(p:Player)=>void;onNavigate:(path:string)=>void};
const nfmt=new Intl.NumberFormat('es-AR');
function flagSrc(raw:string|null|undefined):string{
  if(!raw)return '/assets/photos/noflag.png';
  if(/^https:\/\//.test(raw))return raw;
  if(/^\/assets\/flags\/[a-z0-9-]+\.svg$/i.test(raw))return raw;
  if(/^[a-z]{2,3}(-[a-z]{2,3})?$/i.test(raw))return `/assets/flags/${raw.toLowerCase()}.svg`;
  return '/assets/photos/noflag.png';
}
function MapCard({title,body,flag,showFlag=false,onClick,disabled=false,small=false}:{title:string;body:string;flag?:string|null;showFlag?:boolean;onClick?:()=>void;disabled?:boolean;small?:boolean}){
  const content=<><span className="aog-home-panel-title aog-map-tab">
    <span className={`aog-map-shared-icon aog-map-shared-${title === 'NACIÓN' ? 'nation' : title === 'REGIÓN' ? 'region' : 'territory'}`} aria-hidden="true"/>
    {title}
  </span>{showFlag?<img className="aog-map-card-flag" src={flagSrc(flag)} alt="Bandera" onError={e=>{if(!e.currentTarget.src.endsWith('/assets/photos/noflag.png'))e.currentTarget.src='/assets/photos/noflag.png';}}/>:null}<strong className={small?'aog-map-card-small':''}>{body}</strong></>;
  return onClick&&!disabled?<button type="button" className="aog-map-card" onClick={onClick}>{content}</button>:<div className="aog-map-card" aria-disabled="true">{content}</div>;
}
export default function MapPage({player,onPlayerChange,onNavigate}:Props){
  const renderer=useRef<MapHandle>(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<number|null>(player.territoryId);
  const [home,setHome]=useState(player.territoryId);
  const [mode,setMode]=useState<MapMode>('political');
  const [borders,setBorders]=useState(false);
  const [ownership,setOwnership]=useState(new Map<number,MapOwnership>());
  const [counts,setCounts]=useState(new Map<number,number>());
  const [partyCounts,setPartyCounts]=useState(new Map<number,number>());
  const [showPlayerPosition,setShowPlayerPosition]=useState(true);
  const [resourcePools,setResourcePools]=useState<ResourcePools>(()=>new Map());
  const [resourcePoolMode,setResourcePoolMode]=useState<ResourceName|null>(null);
  const [selectedResources,setSelectedResources]=useState<Map<ResourceName,ResourceStatus>|null>(null);
  const [status,setStatus]=useState<TravelStatus|null>(null);
  const [serverOffset,setServerOffset]=useState(0);
  const [tick,setTick]=useState(Date.now());
  const [showControls,setShowControls]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const mounted=useRef(true);
  const syncStatus=useCallback(async()=>{
    try{const result=await travelStatus();if(!mounted.current)return;
      setStatus(result);setServerOffset(new Date(result.serverNow).getTime()-Date.now());
      setHome(result.territoryId);
      if(player.territoryId!==result.territoryId)onPlayerChange({...player,territoryId:result.territoryId});
    }catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'No se pudo comprobar el viaje');}
  },[player,onPlayerChange]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{let cancelled=false;
    async function setup(){try{await world.init();if(cancelled)return;setReady(true);setSelected(p=>p??player.territoryId);
      void Promise.allSettled([
        getOwnership().then(result=>{if(!cancelled)setOwnership(result);}),
        getPlayerHeatmap().then(result=>{if(!cancelled)setCounts(result);}),
        syncStatus()
      ]).then(results=>{if(cancelled)return;const rejected=results.find(p=>p.status==='rejected');if(rejected?.status==='rejected')setMessage(`Funciones del servidor pendientes: ${String(rejected.reason)}. Ejecutá supabase/mapa-mundial.sql.`);});
    }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Error al cargar el mapa');}}
    void setup();return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{const t=window.setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{const t=window.setInterval(()=>{void syncStatus();},15000);return()=>clearInterval(t);},[syncStatus]);
  useEffect(()=>{if(mode==='players')void getPlayerHeatmap().then(setCounts).catch(e=>setMessage(String(e)));if(mode==='parties')void getPartyHeatmap().then(setPartyCounts).catch(e=>setMessage(String(e)));if(mode!=='political'&&mode!=='players'&&mode!=='parties')void world.ensureStock().then(()=>renderer.current?.redraw()).catch(e=>setMessage(String(e)));},[mode]);
  useEffect(()=>{
    if(!ready||mode==='political'||mode==='players'||mode==='parties')return;
    const resource=mode;
    let active=true;
    setResourcePoolMode(null);setResourcePools(new Map());
    const refresh=async()=>{
      try{
        const pools=await getResourceMapSnapshot(resource);
        if(active){setResourcePools(pools);setResourcePoolMode(resource);setMessage(current=>current.startsWith('Stock del mapa sin sincronizar')?'':current);}
      }catch(e){if(active){setResourcePools(new Map());setResourcePoolMode(null);setMessage(`Stock del mapa sin sincronizar. Ejecutá SQL/05_mapa_recursos_actuales.sql: ${e instanceof Error?e.message:String(e)}`);}}
    };
    void refresh();const timer=window.setInterval(()=>void refresh(),20000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[ready,mode]);
  useEffect(()=>{
    if(!selected||mode==='political'||mode==='players'||mode==='parties')return;
    let active=true;
    setSelectedResources(null);
    const refresh=async()=>{
      try{const stocks=await getResourceStatus(selected);if(active)setSelectedResources(stocks);}
      catch(e){if(active){setSelectedResources(null);setMessage(`No se pudo leer el recurso seleccionado: ${e instanceof Error?e.message:String(e)}`);}}
    };
    void refresh();const timer=window.setInterval(()=>void refresh(),15000);
    return()=>{active=false;window.clearInterval(timer);};
  },[selected,mode]);
  const territory=world.territory.get(selected||-1);
  const current=world.territory.get(home);
  const owner=ownership.get(selected||-1);
  const fromTo=territory&&current?geographicDistanceKm(current,territory):0;
  const duration=travelSeconds(fromTo);
  const trip=status?.trip||null;
  const remaining=trip?Math.max(0,Math.ceil((new Date(trip.endsAt).getTime()-(tick+serverOffset))/1000)):0;
  const started=trip?new Date(trip.startedAt).getTime():0;
  const progress=trip?Math.max(0,Math.min(1,(tick+serverOffset-started)/Math.max(1,new Date(trip.endsAt).getTime()-started))):0;
  const modeInfo=mode!=='political'&&mode!=='players'&&mode!=='parties'?world.resourceManifest?.resources[mode]:null;
  const selectedStock=mode!=='political'&&mode!=='players'&&mode!=='parties'?selectedResources?.get(mode):null;
  const maxRegionPlayers=useMemo(()=>{
    const totals=new Map<string,number>();
    for(const [id,count] of counts){
      const region=ownership.get(id)?.region_id;
      const key=region!=null?`r:${region}`:`t:${id}`;
      totals.set(key,(totals.get(key)||0)+count);
    }
    return Math.max(0,...totals.values());
  },[counts,ownership]);
  const maxPartyCount=useMemo(()=>Math.max(0,...partyCounts.values()),[partyCounts]);
  const runAction=async(fn:()=>Promise<TravelStatus>)=>{if(busy)return;setBusy(true);setMessage('');try{const s=await fn();setStatus(s);setServerOffset(new Date(s.serverNow).getTime()-Date.now());setHome(s.territoryId);if(s.territoryId!==player.territoryId)onPlayerChange({...player,territoryId:s.territoryId});}catch(e){setMessage(e instanceof Error?e.message:'Error al viajar');}finally{setBusy(false);}};
  const canTravel=selected!=null&&selected!==home&&!trip;
  return <main className="aog-map-root">
    {ready?<MapCanvas ref={renderer} mode={mode} selectedId={selected} homeId={home} onSelect={setSelected} onError={setMessage} showBorders={borders} playerCounts={counts} partyCounts={partyCounts} showPlayerPosition={showPlayerPosition} ownership={ownership} resourcePools={resourcePools}/>:<div className="aog-map-loading">{error||'CARGANDO MAPA MUNDIAL…'}</div>}
    <div className={`aog-map-panel-wrap${sidebarOpen?'':' is-collapsed'}`}>
      <aside className="aog-map-sidebar" aria-label="Datos del territorio seleccionado" aria-hidden={!sidebarOpen} inert={!sidebarOpen}>
        <MapCard title="NACIÓN" body={owner?.nation_id != null ? (owner.nation_name || `NATION #${owner.nation_id}`) : 'SIN NACIÓN'} flag={owner?.nation_flag} showFlag={owner?.nation_id != null} disabled={!owner?.nation_id} onClick={()=>onNavigate(`/nation?id=${owner?.nation_id}`)}/>
        <MapCard title="REGIÓN" body={owner?.region_id != null ? (owner.region_name || `REGION #${owner.region_id}`) : 'SIN REGIÓN'} flag={owner?.region_flag} showFlag={owner?.region_id != null} disabled={!owner?.region_id} onClick={()=>onNavigate(`/region?id=${owner?.region_id}`)}/>
        <MapCard title="TERRITORIO" body={selected?`TERRITORIO #${nfmt.format(selected)}`:'—'} onClick={selected?()=>onNavigate(`/territory?id=${selected}`):undefined} small/>
        <button type="button" className="aog-map-travel" disabled={busy||(!canTravel&&!trip)||trip?.state==='returning'} onClick={()=>void runAction(trip?cancelTravel:()=>startTravel(selected!))}>
          <span className="aog-map-travel-heading">{trip?trip.state==='returning'?'REGRESANDO':'CANCELAR VIAJE':`VIAJAR ${territory&&current&&selected!==home?formatKm(fromTo):''}`}</span>
          <span className="aog-map-travel-time">{trip?clock(remaining):clock(duration)}</span>
          {trip?<i className="aog-map-progress" style={{width:`${(trip.state==='returning'?1-progress:progress)*100}%`}}/>:null}
        </button>
      </aside>
      <button type="button" className="aog-map-panel-toggle" aria-label={sidebarOpen?'Ocultar panel de territorio':'Mostrar panel de territorio'} aria-expanded={sidebarOpen} onClick={()=>setSidebarOpen(v=>!v)}><span className="aog-map-chevron" aria-hidden="true" /></button>
    </div>
    <div className="aog-map-controls">
      <button type="button" onClick={()=>renderer.current?.zoom(true)} aria-label="Acercar">+</button>
      <button type="button" onClick={()=>renderer.current?.zoom(false)} aria-label="Alejar">−</button>
      <button type="button" onClick={()=>renderer.current?.focus(home)} title="Mi territorio">⌖</button>
      <button type="button" onClick={()=>setShowPlayerPosition(v=>!v)} aria-pressed={!showPlayerPosition} title={showPlayerPosition?"Ocultar mi posición":"Mostrar mi posición"} style={{width:"clamp(30px,3vw,40px)",minWidth:"clamp(30px,3vw,40px)",height:"clamp(30px,3vw,40px)",padding:0,borderRadius:"50%",display:"grid",placeItems:"center",fontSize:"18px"}} aria-label={showPlayerPosition?"Ocultar mi posición":"Mostrar mi posición"}>{showPlayerPosition?"◉":"◎"}</button>
      <button type="button" onClick={()=>renderer.current?.reset()} title="Mundo entero" className="aog-map-reset">MUNDO</button>
      <button type="button" onClick={()=>setBorders(v=>!v)} aria-pressed={borders} className={borders?'is-active':''} title="Fronteras territoriales">BORDES</button>
    </div>
    <div className="aog-map-layer-tools">
      <button className="aog-map-layer-trigger" type="button" aria-expanded={showControls} onClick={()=>setShowControls(x=>!x)}><span className="aog-map-layer-label">MODO DE MAPA</span><span className="aog-map-layer-current">{mode==='political'?'POLÍTICO':mode==='players'?'JUGADORES':mode==='parties'?'PARTIDOS':world.resourceManifest?.resources[mode]?.label||mode} <span aria-hidden="true">▾</span></span></button>
      {showControls&&<div className="aog-map-layers"><button onClick={()=>{setMode('political');setShowControls(false);}}>POLÍTICO</button><button onClick={()=>{setMode('players');setShowControls(false);}}>JUGADORES</button><button onClick={()=>{setMode('parties');setShowControls(false);}}>PARTIDOS</button>{RESOURCES.map(resource=><button key={resource} onClick={()=>{setMode(resource);setShowControls(false);}}>{world.resourceManifest?.resources[resource]?.label||resource}</button>)}</div>}
    </div>
    {modeInfo&&<div className="aog-map-legend"><strong>{modeInfo.label}</strong><span style={{background:`linear-gradient(to right,${modeInfo.palette[0]},${modeInfo.palette[30]},${modeInfo.palette[63]})`}}/><small>0 — {nfmt.format(modeInfo.p95)}+</small><small>{selectedStock?`DISPONIBLE: ${nfmt.format(selectedStock.current_amount)} / ${nfmt.format(selectedStock.max_amount)}`:'CONSULTANDO DISPONIBILIDAD...'}</small><small>{resourcePoolMode===mode?'MAPA ACTUALIZADO':'SINCRONIZANDO MAPA...'}</small></div>}
    {(mode==='players'||mode==='parties')&&<div className="aog-map-legend"><strong>{mode==='players'?'JUGADORES':'PARTIDOS'}</strong><span style={{background:'linear-gradient(to right,#2461da,#ed8b2c,#dc1b28)'}}/><small>0: GRIS · {((mode==='players'?maxRegionPlayers:maxPartyCount)>0)?`1 — ${nfmt.format(mode==='players'?maxRegionPlayers:maxPartyCount)}`:'SIN REGISTROS'} {mode==='players'?'jugadores en una región':'partidos en un territorio'}</small></div>}
    {message&&<div className="aog-map-warning" role="alert" onClick={()=>setMessage('')} title="Cerrar aviso">{message} ×</div>}
  </main>;
}
