import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Player } from '../auth/player';
import { getMyInventory, INVENTORY_RESOURCES, formatUnits, type Inventory } from './inventoryApi';
import './storage.css';

type Props = {player: Player; onNavigate: (path:string)=>void};
const HOME = '/assets/icons/icons/';
function Icon({name}:{name:string}) {return <span className="aog-store-home-icon" aria-hidden="true" style={{maskImage:`url(${HOME}${name}.svg)`,WebkitMaskImage:`url(${HOME}${name}.svg)`}}/>;}
function ResourceIcon({name}:{name:string}) {return <span className="aog-store-resource-icon" aria-hidden="true" style={{maskImage:`url(/assets/icons/${name}.svg)`,WebkitMaskImage:`url(/assets/icons/${name}.svg)`}}/>;}

export default function StoragePage({player,onNavigate}:Props){
  const [items,setItems]=useState<Inventory|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [onlyOwned,setOnlyOwned]=useState(false);
  const refresh=useCallback(async()=>{
    setBusy(true);
    try{setItems(await getMyInventory());setError('');}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cargar el inventario.');}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    const onFocus=()=>void refresh();
    window.addEventListener('focus',onFocus);
    const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},30000);
    return ()=>{window.removeEventListener('focus',onFocus);window.clearInterval(timer);};
  },[refresh]);
  const resources=useMemo(()=>INVENTORY_RESOURCES.filter(({code,name})=>(!onlyOwned || Number(items?.[code]||0)>0) && (!search || name.toLowerCase().includes(search.toLowerCase()))),[items,onlyOwned,search]);
  const total=items?INVENTORY_RESOURCES.reduce((n,r)=>n+(items[r.code]||0),0):0;
  const types=items?INVENTORY_RESOURCES.filter(r=>(items[r.code]||0)>0).length:0;
  return <main className="aog-storage">
    <header className="aog-store-heading"><div><span className="aog-store-kicker"><Icon name="statistics"/> INVENTARIO PERSONAL</span><h1>ALMACÉN</h1><p>CONSULTÁ LOS RECURSOS QUE OBTUVISTE EN TRABAJO Y UTILIZALOS PARA FUNDAR NACIONES.</p></div><button type="button" className="aog-store-btn aog-store-refresh" onClick={()=>void refresh()} disabled={busy}>{busy?'ACTUALIZANDO...':'ACTUALIZAR'}</button></header>
    <section className="aog-store-summary" aria-label="Resumen del almacén">
      <div><Icon name="statistics"/><span><strong>{items?formatUnits.format(total):'—'}</strong><small>UNIDADES GUARDADAS</small></span></div>
      <div><Icon name="territory"/><span><strong>{items?types:'—'} / 8</strong><small>TIPOS DISPONIBLES</small></span></div>
      <div><Icon name="location"/><span><strong>#{formatUnits.format(player.territoryId)}</strong><small>TERRITORIO ACTUAL</small></span></div>
    </section>
    <section className="aog-store-panel">
      <div className="aog-store-panel-heading"><h2><Icon name="statistics"/> MIS RECURSOS</h2><div className="aog-store-filters"><input type="search" aria-label="Buscar recurso" placeholder="BUSCAR RECURSO..." value={search} onChange={e=>setSearch(e.target.value)}/><label><input type="checkbox" checked={onlyOwned} onChange={e=>setOnlyOwned(e.target.checked)}/> SOLO DISPONIBLES</label></div></div>
      {error&&<p role="alert" className="aog-store-error">{error}</p>}
      {!items&&!error?<p className="aog-store-empty">CARGANDO RECURSOS...</p>:<div className="aog-store-grid">{resources.map(r=><article key={r.code} className="aog-store-resource" style={{'--store-resource':r.color} as CSSProperties}><div className="aog-store-symbol"><ResourceIcon name={r.icon}/></div><div className="aog-store-item-main"><h3>{r.name}</h3><strong>{items?formatUnits.format(items[r.code]):'—'}</strong><small>UNIDADES EN ALMACÉN</small></div></article>)}</div>}
      {items&&resources.length===0&&<p className="aog-store-empty">NO HAY RECURSOS QUE COINCIDAN CON EL FILTRO.</p>}
      <div className="aog-store-panel-foot">LA EXTRACCIÓN SUMA RECURSOS AUTOMÁTICAMENTE A ESTE ALMACÉN. NO SE MUESTRAN LÍMITES DE CAPACIDAD NO DEFINIDOS EN SUPABASE.</div>
    </section>
    <div className="aog-store-actions"><button type="button" className="aog-store-btn" onClick={()=>onNavigate('/work')}><Icon name="location"/> IR A TRABAJO</button><button type="button" className="aog-store-btn aog-store-quiet" onClick={()=>onNavigate(`/territory/${player.territoryId}`)}><Icon name="foundation"/> VER FUNDACIÓN DEL TERRITORIO</button></div>
  </main>;
}
