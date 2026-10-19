import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Player } from '../auth/player';
import { getMyInventory, INVENTORY_RESOURCES, formatUnits, type InventorySnapshot } from './inventoryApi';
import './storage.css';
import GeocracyHeading from '../shared/GeocracyHeading';

type Props = {player: Player; onNavigate: (path:string)=>void};
type ResourceCode = typeof INVENTORY_RESOURCES[number]['code'];

function ResourceIcon({name,color}:{name:string;color:string}) {
  return <span className="aog-store-resource-icon" aria-hidden="true" style={{background:color,maskImage:`url(/assets/icons/${name}.svg)`,WebkitMaskImage:`url(/assets/icons/${name}.svg)`}}/>;
}

export default function StoragePage({player,onNavigate: _onNavigate}:Props){
  const [snapshot,setSnapshot]=useState<InventorySnapshot|null>(null);
  const items=snapshot?.amounts ?? null;
  const limits=snapshot?.limits ?? null;
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const refresh=useCallback(async()=>{
    setBusy(true);
    try{setSnapshot(await getMyInventory());setError('');}
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

  const resources=useMemo(()=>INVENTORY_RESOURCES,[items]);

  const getPercent=(code:ResourceCode)=>{
    const amount=items?.[code]??0;
    const maximum=limits?.[code]??0;
    return maximum>0?Math.min(100,Math.floor(amount/maximum*100)):0;
  };

  return <main className="aog-storage">
    <section className="aog-store-panel aog-store-inventory-panel">
      <GeocracyHeading title="RECURSOS" icon="statistics"/>
      {error&&<p role="alert" className="aog-store-error">{error}</p>}
      {!items&&!error?<p className="aog-store-empty">CARGANDO RECURSOS...</p>:<div className="aog-store-grid">{resources.map(r=>{
        const amount=items?.[r.code]??0;
        const maximum=limits?.[r.code]??0;
        const percent=getPercent(r.code);
        return <article key={r.code} className="aog-store-resource" style={{'--store-resource':r.color} as CSSProperties}>
          <div className="aog-store-symbol"><ResourceIcon name={r.icon} color={r.color}/></div>
          <div className="aog-store-item-main">
            <h3>{r.name}</h3>
            <strong>{items&&limits?`${formatUnits.format(amount)} / ${formatUnits.format(maximum)}`:'—'}</strong>
            <div className="aog-store-capacity-track" role="progressbar" aria-label={`Capacidad de ${r.name}`} aria-valuemin={0} aria-valuemax={maximum||1} aria-valuenow={Math.min(amount,maximum)}>
              <div className="aog-store-capacity-fill" style={{width:`${percent}%`}}/>
            </div>
          </div>
        </article>;
      })}</div>}
    </section>

    <section className="aog-store-panel aog-store-placeholder-panel">
      <GeocracyHeading title="INVENTARIO" icon="storage"/>
      <div className="aog-store-placeholder">PRÓXIMAMENTE</div>
    </section>
  </main>;
}
