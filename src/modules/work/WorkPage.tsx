import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Player } from '../auth/player';
import type { ResourceName } from '../map/world';
import { hitWork, needlePosition, startWork, workPools, type WorkHit, type WorkPool, type WorkRound } from './workApi';
import './work.css';

type Props = {player:Player; onPlayerChange:(value:Player)=>void};
const RESOURCES: {code:ResourceName;title:string;icon:string;hue:string}[] = [
  {code:'wood',title:'MADERA',icon:'wood',hue:'#ab7549'},
  {code:'mineral',title:'MINERAL',icon:'ore',hue:'#b6b6b6'},
  {code:'gold',title:'ORO',icon:'gold',hue:'#efc847'},
  {code:'oil',title:'PETRÓLEO',icon:'oil',hue:'#9895c6'},
  {code:'diamond',title:'DIAMANTE',icon:'diamond',hue:'#6bbbed'},
  {code:'uranium',title:'URANIO',icon:'uranium',hue:'#65c86b'},
  {code:'geocracyum',title:'GEOCRACYUM',icon:'geocracyum',hue:'#4d81ff'},
  {code:'aurexium',title:'AUREXIUM',icon:'aurexium',hue:'#ea79df'},
];
const number = new Intl.NumberFormat('es-AR');
const ENERGY_PER_ATTEMPT = 5;
const XP_PER_ATTEMPT = ENERGY_PER_ATTEMPT * 4;
const reward = [{zone:'red',label:'0–5'},{zone:'orange',label:'10'},{zone:'yellow',label:'15'},
  {zone:'lime',label:'20'},{zone:'green',label:'25'}] as const;
function Icon({name}:{name:string}) {return <span className="aog-work-icon" style={{maskImage:`url('/assets/icons/${name}.svg')`,WebkitMaskImage:`url('/assets/icons/${name}.svg')`}} aria-hidden="true"/>;}

export default function WorkPage({player,onPlayerChange}:Props) {
  const [pools,setPools]=useState<WorkPool[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<ResourceName|null>(null);
  const [round,setRound]=useState<WorkRound|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<WorkHit|null>(null);
  const [needle,setNeedle]=useState(0);
  const [attempts,setAttempts]=useState(0);
  const [total,setTotal]=useState(0);
  const offsetRef=useRef(0);
  const busyRef=useRef(false);
  const selectedRef=useRef<ResourceName|null>(null);
  const closeRef=useRef(0);
  const hitRef=useRef<()=>void>(()=>{});
  const closeActionRef=useRef<()=>void>(()=>{});

  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try {setPools(await workPools(player.territoryId));}
    catch(e){setError(e instanceof Error?e.message:'No se pudieron consultar los recursos.');}
    finally {setLoading(false);}
  },[player.territoryId]);
  useEffect(()=>{void refresh();},[refresh]);

  useEffect(()=>{
    if (!round) {setNeedle(0);return;}
    let frame=0;
    const step=()=>{
      setNeedle(needlePosition(Date.now()+offsetRef.current,new Date(round.startedAt).getTime(),round.speed));
      frame=requestAnimationFrame(step);
    };
    frame=requestAnimationFrame(step);
    return()=>cancelAnimationFrame(frame);
  },[round]);

  // Al cambiar de territorio (viaje), cerramos cualquier extracción previa.
  useEffect(()=>{selectedRef.current=null;setSelected(null);setRound(null);setNotice(null);},[player.territoryId]);

  const open=async(code:ResourceName)=>{
    if(busyRef.current)return;
    const ticket=++closeRef.current;
    selectedRef.current=code;setSelected(code);setRound(null);setNotice(null);setError('');
    busyRef.current=true;setBusy(true);
    try {
      const response=await startWork(code);
      if(ticket!==closeRef.current)return;
      offsetRef.current=new Date(response.serverTime).getTime()-Date.now();
      setRound(response);
      setPools(p=>p.map(item=>item.resource===code?response.pool:item));
      onPlayerChange({...player,energy:response.energy,xp:response.xp,level:response.level});
    }catch(e){if(ticket===closeRef.current)setError(e instanceof Error?e.message:'No se pudo iniciar la extracción.');}
    finally {busyRef.current=false;setBusy(false);}
  };
  const close=()=>{++closeRef.current;selectedRef.current=null;setSelected(null);setRound(null);setNotice(null);setError('');};
  const hit=async()=>{
    if(!round||!selected||busyRef.current)return;
    if(player.energy<ENERGY_PER_ATTEMPT||round.pool.current<=0)return;
    busyRef.current=true;setBusy(true);setError('');
    // Registramos el instante del clic, no el instante posterior a la respuesta de red.
    const pressedAt=new Date(Date.now()+offsetRef.current).toISOString();
    const ticket=closeRef.current;
    const target=selected;
    try {
      const response=await hitWork(target,pressedAt);
      if(ticket!==closeRef.current||selectedRef.current!==target)return;
      offsetRef.current=new Date(response.serverTime).getTime()-Date.now();
      setRound(response);setNotice(response);
      setPools(p=>p.map(item=>item.resource===target?response.pool:item));
      setAttempts(a=>a+1);setTotal(t=>t+response.amount);
      onPlayerChange({...player,energy:response.energy,xp:response.xp,level:response.level});
    }catch(e){if(ticket===closeRef.current){setError(e instanceof Error?e.message:'Error al extraer recursos.');setRound(null);}}
    finally {busyRef.current=false;setBusy(false);}
  };
  hitRef.current=()=>{void hit();};
  closeActionRef.current=close;
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if(!selectedRef.current)return;
      if(event.key==='Escape'){event.preventDefault();closeActionRef.current();return;}
      if(event.code==='Space'&&!event.repeat&&!['INPUT','TEXTAREA','SELECT'].includes((event.target as HTMLElement)?.tagName??'')){
        event.preventDefault();hitRef.current();
      }
    };
    window.addEventListener('keydown',keyboard);
    return()=>window.removeEventListener('keydown',keyboard);
  },[]);
  const current=pools.find(item=>item.resource===selected);
  const selectedMeta=RESOURCES.find(item=>item.code===selected);
  const energy=player.energy;
  const maxEnergy=player.premium?250:100;
  const ready=!!round&&!busy&&energy>=ENERGY_PER_ATTEMPT&&(current?.current??0)>0;
  return <main className="aog-work" aria-label="Trabajo y extracción de recursos">
    <section className="aog-work-panel aog-work-intro">
      <h1><Icon name="wood"/> EXTRACCIÓN MANUAL</h1>
      <p>SELECCIONÁ UN RECURSO Y DETENÉ LA AGUJA EN LA ZONA VERDE. CADA ACIERTO VERDE AUMENTA LA VELOCIDAD.</p>
      <div className="aog-work-intro-stats"><span>ENERGÍA <b>{number.format(energy)} / {maxEnergy}</b></span><span>RECUPERACIÓN <b>+{player.premium?2:1} E / MIN</b></span><span>POR INTENTO <b>{ENERGY_PER_ATTEMPT} ENERGÍA · +{XP_PER_ATTEMPT} XP</b></span><span>TERRITORIO <b>#{player.territoryId}</b></span></div>
    </section>
    <section className="aog-work-panel aog-work-resources">
      <h2><Icon name="ore"/> RECURSOS DISPONIBLES</h2>
      {loading?<p className="aog-work-empty">CONSULTANDO DEPÓSITOS...</p>:<div className="aog-work-grid">
        {RESOURCES.map(meta=>{
          const pool=pools.find(item=>item.resource===meta.code);
          return <button type="button" key={meta.code} className={`aog-work-resource ${selected===meta.code?'is-selected':''}`} style={{'--resource-color':meta.hue} as CSSProperties}
            disabled={!pool||pool.current===0||busy} onClick={()=>void open(meta.code)}>
            <Icon name={meta.icon}/><span className="aog-work-resource-label"><strong>{meta.title}</strong><small>{number.format(pool?.current??0)} / {number.format(pool?.maximum??0)} U</small></span>
            <span className="aog-work-resource-action">{pool?.current?'EXTRAER':'AGOTADO'}</span>
          </button>;
        })}
      </div>}
      <div className="aog-work-section-end"><span>DEPÓSITOS COMPARTIDOS SEGÚN TERRITORIO O REGIÓN</span><button type="button" disabled={loading||busy} onClick={()=>void refresh()}>ACTUALIZAR</button></div>
    </section>
    <section className="aog-work-panel aog-work-industry"><h2>INDUSTRIA</h2><p>PRÓXIMAMENTE</p></section>
    {selected&&<div className="aog-work-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
      <section className="aog-work-dialog" role="dialog" aria-modal="true" aria-label={`Extraer ${selectedMeta?.title??selected}`}>
        <header><h2><Icon name={selectedMeta?.icon??'wood'}/>{selectedMeta?.title}</h2><button type="button" onClick={close} aria-label="Cerrar extracción">×</button></header>
        <div className="aog-work-dialog-body">
          <div className="aog-work-info-row"><span>RECURSOS DISPONIBLES <b>{number.format(current?.current??0)} U</b></span><span>VELOCIDAD <b>×{round?.speed.toFixed(2)??'1.00'}</b></span><span>RACHA VERDE <b>{round?.streak??0}</b></span></div>
          <div className="aog-work-energy"><div><span>ENERGÍA</span><strong>{energy} / {maxEnergy}</strong></div><div className="aog-work-energy-track"><span style={{width:`${Math.max(0,Math.min(100,energy/maxEnergy*100))}%`}}/></div></div>
          <p className="aog-work-instruction">PRESIONÁ <strong>EXTRAER</strong> CUANDO LA AGUJA PASE POR EL VERDE CENTRAL.</p>
          <div className="aog-work-range" role="img" aria-label="Barra de precisión: rojo, naranja, amarillo, verde claro y verde central, simétricos">
            <div className="aog-work-swatch"/><span className="aog-work-needle" style={{left:`${needle}%`}}/></div>
          <div className="aog-work-rewards">{reward.map(t=><span key={t.zone} className={`aog-work-reward aog-work-${t.zone}`}>{t.label} U</span>)}</div>
          <button className="aog-work-hit" type="button" disabled={!ready} onClick={()=>void hit()}>{busy?'EXTRAYENDO...':!round?'INICIANDO...':energy<ENERGY_PER_ATTEMPT?'NECESITÁS 5 E':(current?.current??0)<=0?'DEPÓSITO AGOTADO':`EXTRAER · ${ENERGY_PER_ATTEMPT} ENERGÍA`}</button>
          <p className="aog-work-keyhint">TAMBIÉN PODÉS PRESIONAR LA BARRA ESPACIADORA · +{XP_PER_ATTEMPT} XP POR INTENTO</p>
          {notice&&<div className={`aog-work-result aog-work-result-${notice.zone}`} role="status"><strong>{notice.amount>0?`+${notice.amount} ${selectedMeta?.title}`:'SIN RECURSOS'}</strong><span>+{XP_PER_ATTEMPT} XP · {notice.zone==='green'?'PERFECTO':notice.zone==='lime'?'MUY BIEN':notice.zone==='yellow'?'BIEN':notice.zone==='orange'?'REGULAR':'FALLO'}</span></div>}
          <div className="aog-work-session-numbers"><span>INTENTOS <b>{attempts}</b></span><span>EXTRAÍDOS <b>{number.format(total)} U</b></span></div>
          {error&&<div className="aog-work-recovery"><p role="alert" className="aog-work-error">{error}</p><button type="button" disabled={busy} onClick={()=>void open(selected)}>REINICIAR EXTRACCIÓN</button></div>}
        </div>
      </section>
    </div>}
    {!selected&&error&&<p className="aog-work-error" role="alert">{error}</p>}
  </main>;
}
