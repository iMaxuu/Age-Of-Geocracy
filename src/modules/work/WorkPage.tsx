import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Player } from '../auth/player';
import type { ResourceName } from '../map/world';
import { hitWork, startWork, workPools, type WorkHit, type WorkPool, type WorkRound } from './workApi';
import './work.css';
import GeocracyHeading from '../shared/GeocracyHeading';

type Props = { player: Player; onPlayerChange: (value: Player) => void };
const RESOURCES: { code: ResourceName; title: string; icon: string; hue: string; maxAward: number }[] = [
  { code:'wood',       title:'MADERA',     icon:'wood',       hue:'#ab7549', maxAward:25 },
  { code:'mineral',    title:'MINERAL',    icon:'ore',        hue:'#b6b6b6', maxAward:18 },
  { code:'oil',        title:'PETRÓLEO',   icon:'oil',        hue:'#9895c6', maxAward:15 },
  { code:'gold',       title:'ORO',        icon:'gold',       hue:'#efc847', maxAward:13 },
  { code:'diamond',    title:'DIAMANTE',   icon:'diamond',    hue:'#6bbbed', maxAward:9 },
  { code:'uranium',    title:'URANIO',     icon:'uranium',    hue:'#65c86b', maxAward:6 },
  { code:'geocracyum', title:'GEOCRACYUM', icon:'geocracyum', hue:'#4d81ff', maxAward:3 },
  { code:'aurexium',   title:'AUREXIUM',   icon:'aurexium',   hue:'#ea79df', maxAward:1 },
];
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const ENERGY_PER_ATTEMPT = 5;
const STOCK_PER_ATTEMPT = 0.5;

function Icon({ name }: { name: string }) {
  return <span className="aog-work-icon" style={{maskImage:`url('/assets/icons/${name}.svg')`,WebkitMaskImage:`url('/assets/icons/${name}.svg')`}} aria-hidden="true"/>;
}

export default function WorkPage({player,onPlayerChange}: Props) {
  const [pools,setPools]=useState<WorkPool[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<ResourceName|null>(null);
  const [round,setRound]=useState<WorkRound|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<WorkHit|null>(null);
  const busyRef=useRef(false);
  const ticketRef=useRef(0);

  const refresh=useCallback(async()=>{
    setLoading(true);
    setError('');
    try {setPools(await workPools(player.territoryId));}
    catch(e){setError(e instanceof Error?e.message:'No se pudieron consultar los recursos.');}
    finally {setLoading(false);}
  },[player.territoryId]);
  useEffect(()=>{void refresh();},[refresh]);

  // No se conserva una sesión abierta al viajar a otro territorio.
  useEffect(()=>{ticketRef.current++;setSelected(null);setRound(null);setNotice(null);},[player.territoryId]);

  const open=async(code: ResourceName)=>{
    if(busyRef.current)return;
    const ticket=++ticketRef.current;
    setSelected(code);setRound(null);setNotice(null);setError('');
    busyRef.current=true;setBusy(true);
    try {
      const response=await startWork(code);
      if(ticket!==ticketRef.current)return;
      setRound(response);
      setPools(p=>p.map(item=>item.resource===code?response.pool:item));
      onPlayerChange({...player,energy:response.energy,xp:response.xp,level:response.level});
    }catch(e){if(ticket===ticketRef.current)setError(e instanceof Error?e.message:'No se pudo iniciar la extracción.');}
    finally{busyRef.current=false;setBusy(false);}
  };
  const close=()=>{ticketRef.current++;setSelected(null);setRound(null);setNotice(null);setError('');};
  useEffect(()=>{
    if(!selected)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();}};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[selected]);

  const hit=async()=>{
    if(!round||!selected||busyRef.current)return;
    if(round.energy<ENERGY_PER_ATTEMPT || round.pool.current<STOCK_PER_ATTEMPT)return;
    const ticket=ticketRef.current;
    const target=selected;
    busyRef.current=true;setBusy(true);setError('');
    try {
      const response=await hitWork(target);
      if(ticket!==ticketRef.current)return;
      setRound(response);setNotice(response);
      setPools(p=>p.map(item=>item.resource===target?response.pool:item));
      onPlayerChange({...player,energy:response.energy,xp:response.xp,level:response.level});
    }catch(e){if(ticket===ticketRef.current)setError(e instanceof Error?e.message:'No se pudo completar la extracción.');}
    finally{busyRef.current=false;setBusy(false);}
  };

  const current=round?.pool ?? pools.find(item=>item.resource===selected);
  const selectedMeta=RESOURCES.find(item=>item.code===selected);
  const energy=round?.energy ?? player.energy;
  const maxEnergy=player.premium?250:100;
  const ready=!!round && !busy && energy>=ENERGY_PER_ATTEMPT && (current?.current??0)>=STOCK_PER_ATTEMPT;

  return <main className="aog-work" aria-label="Trabajo y extracción de recursos">
    <section className="aog-work-panel aog-work-resources">
      <GeocracyHeading title="EXTRACCION MANUAL" icon="territory"/>
      {loading?<p className="aog-work-empty">CONSULTANDO DEPÓSITOS...</p>:<div className="aog-work-grid">
        {RESOURCES.map(meta=>{
          const pool=pools.find(item=>item.resource===meta.code);
          const currentAmount=Math.max(0,pool?.current??0);
          const maximum=Math.max(0,pool?.maximum??0);
          const percentage=maximum>0?Math.min(100,currentAmount/maximum*100):0;
          return <button type="button" key={meta.code} className={`aog-work-resource ${selected===meta.code?'is-selected':''}`} style={{'--resource-color':meta.hue} as CSSProperties}
            disabled={!pool||pool.current<STOCK_PER_ATTEMPT||busy} onClick={()=>void open(meta.code)}>
            <Icon name={meta.icon}/>
            <span className="aog-work-resource-label">
              <strong>{meta.title}</strong>
              <small>{number.format(pool?.current??0)} / {number.format(pool?.maximum??0)} U</small>
              <span className="aog-work-resource-track" role="progressbar" aria-label={`Disponibilidad de ${meta.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentage)}>
                <span className="aog-work-resource-fill" style={{width:`${percentage}%`}}/>
              </span>
            </span>
          </button>;
        })}
      </div>}
    </section>
    <section className="aog-work-panel aog-work-industry"><GeocracyHeading title="INDUSTRIA" icon="organizations"/><p>PRÓXIMAMENTE</p></section>

    {selected&&<div className="aog-work-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
      <section className="aog-work-dialog" role="dialog" aria-modal="true" aria-label={`Extraer ${selectedMeta?.title??selected}`}>
        <header><h2><Icon name={selectedMeta?.icon??'wood'}/>{selectedMeta?.title}</h2><button type="button" onClick={close} aria-label="Cerrar extracción">×</button></header>
        <div className="aog-work-dialog-body aog-work-dialog-body--minimal">
          <div className="aog-work-available">{number.format(current?.current??0)} / {number.format(current?.maximum??0)} U</div>
          <div className="aog-work-energy"><div><span>ENERGÍA</span><strong>{energy} / {maxEnergy}</strong></div><div className="aog-work-energy-track"><span style={{width:`${Math.max(0,Math.min(100,energy/maxEnergy*100))}%`}}/></div></div>
          <button className={`aog-work-hit aog-work-hit-circle${busy?' is-busy':''}`} style={{'--resource-color': selectedMeta?.hue ?? 'var(--work-accent)'} as CSSProperties} type="button" disabled={!ready} onClick={()=>void hit()} aria-label={busy?'Extrayendo':!round?'Iniciando extracción':energy<ENERGY_PER_ATTEMPT?'Necesitás 5 E':(current?.current??0)<STOCK_PER_ATTEMPT?'Depósito agotado':`Extraer ${selectedMeta?.title ?? selected}`}>
            <Icon name={selectedMeta?.icon??'wood'}/>
          </button>
          {notice&&<div className="aog-work-result aog-work-random-result aog-work-result--compact" role="status">
            <strong>{notice.amount>0?`+${notice.amount} ${selectedMeta?.title}`:'SIN RECURSOS'}</strong>
          </div>}
          {error&&<div className="aog-work-recovery"><p role="alert" className="aog-work-error">{error}</p><button type="button" disabled={busy} onClick={()=>void open(selected)}>REINICIAR EXTRACCIÓN</button></div>}
        </div>
      </section>
    </div>}
    {!selected&&error&&<p className="aog-work-error" role="alert">{error}</p>}
  </main>;
}
