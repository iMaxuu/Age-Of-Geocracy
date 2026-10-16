import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../../lib/supabase';
import { INVENTORY_RESOURCES, formatUnits } from '../storage/inventoryApi';
import './foundation.css';

type Requirement = {resource_code:string;required_amount:number;amount:number};
type Founder = {id:number;name:string;photo_url:string|null;joined_at:string};
type FoundationStatus = {
  territory_id:number;independent:boolean;state:'recruiting'|'event_ready';outcome:'ongoing'|'failed'|'succeeded';
  event_ready_at:string|null;deadline_at:string|null;cooldown_until:string|null;server_now:string;
  count:number;capacity:number;joined:boolean;cost:number;viewer_territory_id:number|null;viewer_gold:number|null;
  founders:Founder[];requirements:Requirement[];inventory:Record<string,number>;
  founded_nation_id:number|null;founded_region_id:number|null;
};
type ProvisionalStatus={active:boolean;another_territory:boolean;has_permanent:boolean;in_territory:boolean;territory_id:number|null;granted_at:string|null};
const ROOT='/assets/icons/icons/';
const Icon=({name}:{name:string})=><span className="aog-fx-icon" aria-hidden="true" style={{maskImage:`url(${ROOT}${name}.svg)`,WebkitMaskImage:`url(${ROOT}${name}.svg)`}}/>;
const ResourceIcon=({name}:{name:string})=><span className="aog-fx-resource-icon" aria-hidden="true" style={{maskImage:`url(/assets/icons/${name}.svg)`,WebkitMaskImage:`url(/assets/icons/${name}.svg)`}}/>;
function countdown(date:string|null,now:number){
  if(!date)return '—';
  const sec=Math.max(0,Math.ceil((new Date(date).getTime()-now)/1000));
  const hours=Math.floor(sec/3600),minutes=Math.floor(sec/60)%60,seconds=sec%60;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
function dateText(raw:string|null){return raw?new Date(raw).toLocaleString('es-AR',{dateStyle:'medium',timeStyle:'short'}):'—';}

export default function IndependentFoundation({territory,onFounded,onNavigate}:{territory:number;onFounded:()=>void;onNavigate?:(path:string)=>void}){
  const [status,setStatus]=useState<FoundationStatus|null>(null);
  const [provisional,setProvisional]=useState<ProvisionalStatus|null>(null);
  const [busy,setBusy]=useState(false);
  const [citizenBusy,setCitizenBusy]=useState(false);
  const [error,setError]=useState('');
  const [citizenError,setCitizenError]=useState('');
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [code,setCode]=useState('wood');
  const [amount,setAmount]=useState('');
  const [now,setNow]=useState(Date.now());
  const refresh=useCallback(async()=>{
    const {data,error:rpcError}=await supabase.rpc('aog_foundation_status',{p_territory_id:territory});
    if(rpcError){setError(`No se pudo cargar la fundación: ${rpcError.message}`);setLoading(false);return;}
    const next=data as FoundationStatus;
    setStatus(next);setError('');setLoading(false);
    if(next.outcome==='succeeded')onFounded();
  },[territory,onFounded]);
  const refreshCitizen=useCallback(async()=>{
    const {data,error:rpcError}=await supabase.rpc('aog_provisional_status',{p_territory_id:territory});
    // Se informa solo en el bloque ciudadano: no interrumpir la fundación si falta instalar SQL.
    if(rpcError){setCitizenError('La ciudadanía provisoria requiere instalar el SQL de esta actualización.');return;}
    setProvisional(data as ProvisionalStatus);setCitizenError('');
  },[territory]);
  useEffect(()=>{
    setLoading(true);setStatus(null);setProvisional(null);setError('');setCitizenError('');setModal(false);
    void refresh();void refreshCitizen();
    const tick=window.setInterval(()=>setNow(Date.now()),1000);
    const poll=window.setInterval(()=>{if(!document.hidden){void refresh();void refreshCitizen();}},15000);
    const focus=()=>{void refresh();void refreshCitizen();};
    window.addEventListener('focus',focus);
    return ()=>{window.clearInterval(tick);window.clearInterval(poll);window.removeEventListener('focus',focus);};
  },[refresh,refreshCitizen]);
  useEffect(()=>{
    if(!modal)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal(false);};
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[modal]);
  const perform=async(name:string,params:Record<string,unknown>)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      const {data,error:rpcError}=await supabase.rpc(name,params);
      if(rpcError)throw new Error(rpcError.message);
      const next=data as FoundationStatus;
      setStatus(next);
      if(next.outcome==='succeeded'){setModal(false);onFounded();}
      else await refresh();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo realizar la operación.');}
    finally{setBusy(false);}
  };
  const requestCitizen=async()=>{
    if(citizenBusy)return;
    const cancellations: string[] = [];
    if(provisional?.has_permanent)cancellations.push('tu ciudadanía definitiva');
    if(provisional?.another_territory)cancellations.push(`tu ciudadanía provisoria del territorio #${provisional.territory_id}`);
    if(cancellations.length && !window.confirm(`Al solicitar ciudadanía provisoria en el territorio #${territory}, ${cancellations.length===1?'se anulará':'se anularán'} ${cancellations.length===1?cancellations[0]:cancellations.join(' y ')}. ¿Querés continuar?`))return;
    setCitizenBusy(true);setCitizenError('');
    try{
      const {error:rpcError}=await supabase.rpc('aog_request_provisional_citizenship',{p_territory_id:territory});
      if(rpcError)throw new Error(rpcError.message);
      await refreshCitizen();
    }catch(e){setCitizenError(e instanceof Error?e.message:'No se pudo solicitar la ciudadanía provisoria.');}
    finally{setCitizenBusy(false);}
  };
  const ready=status?.outcome==='ongoing'&&status.state==='event_ready';
  const failed=status?.outcome==='failed';
  const count=Math.min(3,Math.max(0,Number(status?.count||0)));
  const joined=!!status?.joined;
  const present=status?.viewer_territory_id===territory;
  const price=Number(status?.cost??1000);
  const canJoin=!!status&&!ready&&!failed&&count<3&&!joined&&present&&Number(status.viewer_gold)>=price&&!busy;
  const requirements=INVENTORY_RESOURCES.filter(r=>['wood','mineral','oil','diamond','uranium','gold'].includes(r.code)).map(r=>{
    const value=status?.requirements?.find(item=>item.resource_code===r.code);
    return {...r,required:Math.max(0,Number(value?.required_amount||0)),amount:Math.max(0,Number(value?.amount||0)),owned:Math.max(0,Number(status?.inventory?.[r.code]||0))};
  });
  const totalRequired=requirements.reduce((sum,r)=>sum+r.required,0);
  const totalDone=requirements.reduce((sum,r)=>sum+Math.min(r.amount,r.required),0);
  const percentage=totalRequired>0?Math.round(totalDone/totalRequired*100):0;
  const selection=requirements.find(r=>r.code===code)??requirements[0];
  const available=Math.max(0,Math.min(selection?.owned??0,(selection?.required??0)-(selection?.amount??0)));
  const parsed=Number(amount);
  const canDonate=ready&&present&&!busy&&Number.isSafeInteger(parsed)&&parsed>0&&parsed<=available;
  const canAsk=!!provisional&&(!provisional.active||provisional.has_permanent)&&provisional.in_territory&&!citizenBusy;
  return <div className="aog-fx">
    <section className="aog-fx-panel aog-fx-hero"><div className="aog-fx-mark"><Icon name="foundation"/></div><div className="aog-fx-hero-content"><div className="aog-fx-eyebrow">TERRITORIO INDEPENDIENTE · #{formatUnits.format(territory)}</div><h2>FUNDAR UNA NACIÓN</h2><p>REUNÍ TRES FUNDADORES PARA ACTIVAR EL EVENTO. UNA VEZ INICIADO, LOS JUGADORES DISPONEN DE 24 HORAS PARA COMPLETAR LOS APORTES DE RECURSOS.</p><div className="aog-fx-hero-tags"><span>3 FUNDADORES</span><span>24 H DE EVENTO</span><span>7 DÍAS DE ESPERA SI FALLA</span></div></div></section>
    <div className="aog-fx-top">
      <section className="aog-fx-panel aog-fx-state"><h3><Icon name="events"/> ESTADO DE FUNDACIÓN</h3><div className="aog-fx-state-value">{loading?'CARGANDO...':failed?'INTENTO FALLIDO':ready?'APORTES ABIERTOS':joined?'ESPERANDO FUNDADORES':'RECLUTANDO FUNDADORES'}</div><p>{failed?'No se alcanzó el objetivo durante las 24 horas.':ready?'Aportá desde tu almacén para completar la fundación.':'Necesitás estar en el territorio para unirte a la fundación.'}</p>{(ready||failed)&&<div className="aog-fx-clock"><strong>{countdown(ready?status?.deadline_at??null:status?.cooldown_until??null,now)}</strong><small>{ready?'TIEMPO RESTANTE':'PRÓXIMO INTENTO'}</small></div>}</section>
      <section className="aog-fx-panel aog-fx-state"><h3><Icon name="players"/> FUNDADORES</h3><div className="aog-fx-count"><strong>{status?count:'—'}</strong><span>/ 3</span></div><div className="aog-fx-members">{Array.from({length:3},(_,i)=>{const founder=status?.founders?.[i];return <div key={i} className={founder?'has-founder':''}><span>{i+1}</span>{founder?(onNavigate?<button type="button" onClick={()=>onNavigate(`/profile/${founder.id}`)}>{founder.name}</button>:<b>{founder.name}</b>):<small>VACANTE</small>}</div>;})}</div></section>
    </div>
    {ready||failed?<section className="aog-fx-panel aog-fx-progress"><div className="aog-fx-progress-head"><h3><Icon name="statistics"/> PROGRESO DE RECURSOS</h3><strong>{percentage}%</strong></div><div className="aog-fx-progress-track" role="progressbar" aria-label="Progreso de fundación" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span style={{width:`${percentage}%`}}/></div><div className="aog-fx-requirements">{requirements.map(r=><div key={r.code} className="aog-fx-req" style={{'--fx-resource':r.color} as CSSProperties}><ResourceIcon name={r.icon}/><div><strong>{r.name}</strong><small>{formatUnits.format(r.amount)} / {formatUnits.format(r.required)}</small><div className="aog-fx-mini-track"><span style={{width:`${r.required?Math.min(100,r.amount/r.required*100):0}%`}}/></div></div></div>)}</div><div className="aog-fx-actions"><button type="button" disabled={!ready||!present||busy} onClick={()=>{setCode('wood');setAmount('');setModal(true);}}>APORTAR RECURSOS</button><button type="button" className="aog-fx-alt" onClick={()=>onNavigate?.('/storage')} disabled={!onNavigate}>VER MI ALMACÉN</button></div>{ready&&!present&&<p className="aog-fx-hint">Debés estar en este territorio para aportar recursos.</p>}{failed&&<p className="aog-fx-hint">Los aportes del intento fallido no se devuelven.</p>}</section>
    :<section className="aog-fx-panel aog-fx-join"><div><h3><Icon name="foundation"/> PARTICIPAR EN LA FUNDACIÓN</h3><p>UNIRSE CUESTA <strong>{formatUnits.format(price)} G</strong>. EL APORTE NO SE DEVUELVE SI TE RETIRÁS ANTES DE REUNIR LOS TRES FUNDADORES.</p></div><button type="button" disabled={busy||(!joined&&!canJoin)} onClick={()=>void perform(joined?'aog_foundation_leave':'aog_foundation_join',{p_territory_id:territory})}>{busy?'PROCESANDO...':joined?'ABANDONAR FUNDACIÓN':`UNIRSE · ${formatUnits.format(price)} G`}</button>{!loading&&!joined&&!present&&<p className="aog-fx-hint">Viajá a este territorio para participar.</p>}{!loading&&!joined&&present&&Number(status?.viewer_gold||0)<price&&<p className="aog-fx-hint">No tenés suficientes G.</p>}</section>}
    <section className="aog-fx-panel aog-fx-citizen"><div><h3><Icon name="territory"/> CIUDADANÍA PROVISORIA</h3><p>LOS TERRITORIOS INDEPENDIENTES PUEDEN REGISTRAR UNA CIUDADANÍA PROVISORIA. SI SE FUNDA UNA NACIÓN, ESTA CIUDADANÍA SE CONSERVA PARA PARTICIPAR EN LAS PRIMERAS ELECCIONES. DESPUÉS, EL PRESIDENTE PODRÁ NACIONALIZAR O DEPORTAR A LOS CIUDADANOS PROVISORIOS.</p>{provisional?.active&&<strong className="aog-fx-citizen-active">CIUDADANÍA PROVISORIA ACTIVA · TERRITORIO #{formatUnits.format(territory)}</strong>}{provisional?.has_permanent&&<small>TENÉS UNA CIUDADANÍA DEFINITIVA. SI SOLICITÁS ESTA PROVISORIA, LA DEFINITIVA QUEDARÁ ANULADA.</small>}{provisional?.another_territory&&<small>TENÉS CIUDADANÍA PROVISORIA EN EL TERRITORIO #{formatUnits.format(provisional.territory_id||0)}. SI LA SOLICITÁS AQUÍ, LA ANTERIOR QUEDARÁ ANULADA.</small>}</div><button type="button" disabled={!canAsk} onClick={()=>void requestCitizen()}>{citizenBusy?'SOLICITANDO...':provisional?.has_permanent||provisional?.another_territory?'CAMBIAR CIUDADANÍA':provisional?.active?'CIUDADANÍA REGISTRADA':'SOLICITAR CIUDADANÍA'}</button>{!provisional?.in_territory&&<small>PARA SOLICITARLA, TENÉS QUE ESTAR EN ESTE TERRITORIO.</small>}{citizenError&&<p className="aog-fx-error" role="alert">{citizenError}</p>}</section>
    {error&&<p role="alert" className="aog-fx-error">{error}</p>}
    {modal&&ready&&<div className="aog-fx-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false);}}><section className="aog-fx-modal" role="dialog" aria-modal="true" aria-label="Aportar recursos"><div className="aog-fx-modal-head"><h2>APORTAR RECURSOS</h2><button type="button" onClick={()=>setModal(false)} aria-label="Cerrar">×</button></div><p>LOS RECURSOS SALEN DIRECTAMENTE DE TU ALMACÉN PERSONAL.</p><label htmlFor="aog-fx-code">RECURSO</label><select id="aog-fx-code" value={code} onChange={e=>{setCode(e.target.value);setAmount('');}}>{requirements.map(r=><option value={r.code} key={r.code}>{r.name}</option>)}</select><div className="aog-fx-donation-facts"><span>EN ALMACÉN <b>{formatUnits.format(selection?.owned||0)}</b></span><span>FALTAN <b>{formatUnits.format(Math.max(0,(selection?.required||0)-(selection?.amount||0)))}</b></span></div><label htmlFor="aog-fx-amount">CANTIDAD A APORTAR</label><div className="aog-fx-input-row"><input id="aog-fx-amount" type="number" min="1" max={available} step="1" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/><button type="button" onClick={()=>setAmount(String(available))} disabled={available<=0}>MÁX.</button></div><button type="button" className="aog-fx-donate-submit" disabled={!canDonate} onClick={()=>void perform('aog_foundation_donate',{p_territory_id:territory,p_resource_code:code,p_amount:parsed}).then(()=>{setAmount('');})}>CONFIRMAR APORTE</button><small>LOS APORTES SON DEFINITIVOS Y NO SE DEVUELVEN SI EL EVENTO FALLA.</small>{error&&<p className="aog-fx-error" role="alert">{error}</p>}</section></div>}
  </div>;
}
