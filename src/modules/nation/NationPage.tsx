import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import '../home/home.css';
import './nation.css';

type Nation = { id: number; name: string|null; capital_region_id: number|null; founding_territory_id: number; president_id?:number|null; vice_president_id?:number|null; flag_url?:string|null };
type Official = {id:number;name:string;photo_url:string|null;country_code?:string|null;political_ideology?:string|null;party_name?:string|null;coalition_name?:string|null};
type PublicAffiliations = {party_id?:number|null;party_name?:string|null};
type PublicCoalition = {name?:string|null};
type Region = { id: number; name: string|null; is_capital: boolean; founding_territory_id: number; count: number; flag_url?:string|null };
type ElectionSummary={id:number;stage:'PRE'|'CURSO'|'POST';pre_starts_at:string;voting_starts_at:string;voting_ends_at:string;completed_at:string|null};
const dateLabel=(value?:string|null)=>value?new Date(value).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
function remaining(until:string, now:number){
 const seconds=Math.max(0,Math.ceil((new Date(until).getTime()-now)/1000));
 const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),secs=seconds%60;
 return `${days?`${days}D `:''}${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}
function ElectionPanel({items,loading,error,now}:{items:ElectionSummary[];loading:boolean;error:boolean;now:number}){
 const displayed=items.filter(e=>e.stage!=='POST' && !e.completed_at && new Date(e.voting_ends_at).getTime()>now)
  .sort((a,b)=>new Date(a.pre_starts_at).getTime()-new Date(b.pre_starts_at).getTime()).slice(0,4);
 return <Box title="ELECCIONES" className="aog-nation-elections">
  {loading?<p className="aog-nation-pending">CARGANDO...</p>:error?<p className="aog-nation-pending">NO SE PUDIERON CARGAR</p>:!displayed.length?<p className="aog-nation-pending">SIN ELECCIONES ACTIVAS</p>:
   <div className="aog-nation-election-list">{displayed.map(e=>{
    const stage=e.stage==='POST'?'FINALIZADA':e.stage==='CURSO'?'EN VOTACIÓN':'EN PREPARACIÓN';
    const deadline=e.stage==='PRE'?e.voting_starts_at:e.voting_ends_at;
    return <a className="aog-nation-election-link" key={e.id} href={`/election?id=${e.id}`}>
      <span>ELECCIÓN PRESIDENCIAL</span><strong>{stage}</strong>
      <small>{e.stage==='POST'?`FINALIZÓ ${dateLabel(e.voting_ends_at)}`:new Date(e.pre_starts_at).getTime()>now?`COMIENZA EN ${remaining(e.pre_starts_at,now)}`:remaining(deadline,now)}</small>
    </a>;
   })}</div>}
 </Box>;
}

const FLAG = '/assets/photos/noflag.png';
const PHOTO = '/assets/photos/nouser.png';
function Picture({src, alt, cls}: {src?:string|null;alt:string;cls:string}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return <img className={cls} src={!failed&&src?src:cls.includes('avatar')?PHOTO:FLAG} alt={alt} onError={()=>setFailed(true)}/>;
}
function Box({title,children, className=''}:{title:string;children:React.ReactNode;className?:string}){
 return <section className={`aog-nation-box ${className}`}><h3 className="aog-home-panel-title">{title}</h3>{children}</section>;
}
function OfficialCard({person, role, loading=false, error=false}:{person:Official|null;role:string;loading?:boolean;error?:boolean}){
 return <Box title={role} className="aog-nation-official-box"><div className="aog-nation-official">
   <Picture cls="aog-nation-avatar" src={person?.photo_url} alt={person?.name||role}/>
   {loading?<span className="aog-nation-vacant">CARGANDO</span>:error?<span className="aog-nation-vacant">NO DISPONIBLE</span>:person?<div className="aog-nation-official-details">
     <div className="aog-nation-official-name">{person.name} <small>#{person.id}</small></div>
     {person.country_code&&<img className="aog-nation-official-country" src={`/assets/flags/${person.country_code.toLowerCase()}.svg`} alt={person.country_code}/>}
     {person.political_ideology&&<div>{person.political_ideology}</div>}
     <div>{person.party_name===undefined?'—':person.party_name?.trim()?`PARTIDO ${person.party_name}`:'SIN PARTIDO'}</div>
     <div>{person.coalition_name===undefined?'—':person.coalition_name?.trim()?`COALICIÓN ${person.coalition_name}`:'SIN COALICIÓN'}</div>
   </div>:<span className="aog-nation-vacant">VACANTE</span>}
 </div></Box>;
}
export default function NationPage(){
 const [nation,setNation]=useState<Nation|null>(null);
 const [regions,setRegions]=useState<Region[]>([]);
 const [status,setStatus]=useState('CARGANDO NACIÓN...');
 const [president,setPresident]=useState<Official|null>(null);
  const [vicePresident,setVicePresident]=useState<Official|null>(null);
  const [vicePresidentState,setVicePresidentState]=useState<'loading'|'ready'|'error'>('loading');
 const [presidentState,setPresidentState]=useState<'loading'|'ready'|'error'>('loading');
 const [otherOfficesLoading,setOtherOfficesLoading]=useState(true);
 const [census,setCensus]=useState<{players_count:number;citizens_count:number}|null>(null);
 const [censusReady,setCensusReady]=useState(false);
 const [elections,setElections]=useState<ElectionSummary[]>([]);
 const [electionsLoading,setElectionsLoading]=useState(true);
 const [electionsError,setElectionsError]=useState(false);
 const [now,setNow]=useState(()=>Date.now());
 const [modal,setModal]=useState<'calendar'|'regions'|null>(null);
 useEffect(()=>{if(!modal)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setModal(null)};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey)},[modal]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return ()=>window.clearInterval(timer)},[]);
 useEffect(()=>{
  if(!nation?.id)return;
  let active=true;
  const load=async()=>{
   const {data,error}=await supabase.rpc('aog_nation_election_summaries',{p_nation_id:nation.id});
   if(!active)return;
   setElectionsLoading(false);
   if(error){console.warn('No se pudieron obtener las elecciones nacionales:',error);setElectionsError(true);return;}
   setElectionsError(false);setElections((Array.isArray(data)?data:[]) as ElectionSummary[]);
  };
  setElectionsLoading(true);void load();
  const timer=window.setInterval(()=>{void load()},15000);
  return ()=>{active=false;window.clearInterval(timer)};
 },[nation?.id]);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   try {
    const param=new URLSearchParams(window.location.search).get('id');
    let id=param&&/^\d+$/.test(param)?Number(param):null;
    if(!id){
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)throw Error('INICIÁ SESIÓN PARA VER TU NACIÓN');
      const {data:player,error:ep}=await supabase.from('players').select('territory_id').eq('auth_id',user.id).single();
      if(ep)throw ep;
      const {data:politics,error:eo}=await supabase.from('map_territory_politics').select('nation_id').eq('territory_id',player?.territory_id).maybeSingle();
      if(eo)throw eo;
      id=politics?.nation_id??null;
    }
    if(!id){if(live)setStatus('TU TERRITORIO NO PERTENECE A UNA NACIÓN');return;}
    const {data:n,error:en}=await supabase.from('aog_founded_nations').select('*').eq('id',id).maybeSingle();
    if(en)throw en;
    if(!n){if(live)setStatus('NACIÓN NO ENCONTRADA');return;}
    if(live){setNation(n as Nation);setStatus('');}
    const {data:list,error:er}=await supabase.from('aog_founded_regions').select('id,name,is_capital,founding_territory_id').eq('nation_id',id).order('id');
    if(er)throw er;
    const arr=await Promise.all((list??[]).map(async r=>{
      const {count,error}=await supabase.from('map_territory_politics').select('territory_id',{count:'exact',head:true}).eq('nation_id',id).eq('region_id',r.id);
      return {...r,count:error?0:(count??0)} as Region;
    }));
    if(live){setRegions(arr.sort((a,b)=>Number(b.is_capital)-Number(a.is_capital)||a.id-b.id));setOtherOfficesLoading(false);}
     const loadOfficial=async(playerId:number|null|undefined):Promise<Official|null>=>{
       if(!playerId)return null;
       const {data:p,error:playerError}=await supabase.from('players')
         .select('id,name,photo_url,country_code,political_ideology').eq('id',playerId).maybeSingle();
       if(playerError)throw playerError;
       if(!p)return null;
       const official:Official={...p};
        // La membresía está protegida por RLS. Leerla mediante el mismo RPC público de Profile.
        const {data:profile,error:profileError}=await supabase.rpc('aog_public_player_profile',{p_player_id:p.id});
        if(profileError){
          console.warn('No se pudieron cargar las afiliaciones públicas de la autoridad:',profileError);
        }else if(profile && typeof profile==='object' && !Array.isArray(profile)){
          const membership=profile as PublicAffiliations;
          official.party_name=membership.party_name??null;
          if(membership.party_id){
            const {data:coalition,error:coalitionError}=await supabase.rpc('aog_coalition_for_party',{p_party_id:membership.party_id});
            if(coalitionError){
              console.warn('No se pudo cargar la coalición de la autoridad:',coalitionError);
            }else if(coalition && typeof coalition==='object' && !Array.isArray(coalition)){
              official.coalition_name=(coalition as PublicCoalition).name??null;
            }
          }else{
            official.coalition_name=null;
          }
        }
       return official;
     };
     const [loadedPresident,loadedVice]=await Promise.allSettled([
       loadOfficial(n.president_id),loadOfficial(n.vice_president_id)
     ]);
     if(live){
       if(loadedPresident.status==='fulfilled'){
         setPresident(loadedPresident.value);
         setPresidentState('ready');
       }else{
         console.error('No se pudo cargar al presidente:',loadedPresident.reason);
         setPresidentState('error');
       }
       if(loadedVice.status==='fulfilled'){
         setVicePresident(loadedVice.value);
         setVicePresidentState('ready');
       }else{
         console.error('No se pudo cargar al vicepresidente:',loadedVice.reason);
         setVicePresidentState('error');
       }
     }
   }catch(err){if(live){setStatus(`NO SE PUDO CARGAR NACIÓN: ${err instanceof Error?err.message:'ERROR'}`);setPresidentState('error');setVicePresidentState('error');setOtherOfficesLoading(false);}}
  };
  void load();return ()=>{live=false};
 },[]);
 // Jugadores = presentes en territorios de la nación; ciudadanos = ciudadanía persistente.
 // La consulta se renueva sin volver a cargar el resto de la página.
 useEffect(()=>{
  const nationId=nation?.id;
  if(!nationId)return;
  let active=true;
  setCensus(null);
  setCensusReady(false);
  const loadCensus=async()=>{
   const {data,error}=await supabase.rpc('aog_nation_population',{p_nation_id:nationId});
   if(!active)return;
   setCensusReady(true);
   if(error){console.warn('No se pudo consultar el censo nacional:',error);setCensus(null);return;}
   const row=Array.isArray(data)?data[0]:data;
   if(row && Number.isFinite(Number(row.players_count)) && Number.isFinite(Number(row.citizens_count))){
    setCensus({players_count:Number(row.players_count),citizens_count:Number(row.citizens_count)});
   }else setCensus(null);
  };
  void loadCensus();
  const timer=window.setInterval(()=>{void loadCensus()},30000);
  return ()=>{active=false;window.clearInterval(timer)};
 },[nation?.id]);
 const navigateRegion=(id:number)=>{window.location.href=`/region?id=${id}`};
 const lastElection=[...elections].filter(e=>e.stage==='POST'||Boolean(e.completed_at)).sort((a,b)=>new Date(b.voting_ends_at).getTime()-new Date(a.voting_ends_at).getTime())[0];
 const upcomingElection=[...elections].filter(e=>e.stage!=='POST'&&!e.completed_at&&new Date(e.voting_ends_at).getTime()>now).sort((a,b)=>new Date(a.voting_starts_at).getTime()-new Date(b.voting_starts_at).getTime())[0];
 const capitalRegion=regions.find(r=>r.is_capital||r.id===nation?.capital_region_id);
 const nationNumbers:[string,string][]=[['JUGADORES',census?String(census.players_count):censusReady?'—':'...'],['CIUDADANOS',census?String(census.citizens_count):censusReady?'—':'...'],['REGIONES',String(regions.length)],['TERRITORIOS',String(regions.reduce((total,r)=>total+r.count,0))],['PARTIDOS','—'],['CLUBES','—']];
 const nationalOfficials=(person:Official|null, role:string, state:'loading'|'ready'|'error')=><div className="aog-nation-red-official">
  <div className="aog-nation-red-role">{role}</div><div className="aog-nation-red-person">
  <Picture cls="aog-nation-avatar" src={person?.photo_url} alt={role}/>
  <div className="aog-nation-red-person-info">{state==='loading'?'CARGANDO':state==='error'?'NO DISPONIBLE':person?<>
  <a href={`/profile?id=${person.id}`} className="aog-nation-red-person-name">{person.name}</a>
  <div>{person.party_name?`PARTIDO ${person.party_name}`:'SIN PARTIDO'}</div>
  <div>{person.coalition_name?`COALICIÓN ${person.coalition_name}`:'SIN COALICIÓN'}</div>
  </>:'VACANTE'}</div></div></div>;
 return <main className="aog-nation-page aog-nation-redesign">
 {status&&!nation?<p className="aog-nation-status">{status}</p>:<>
 <section className="aog-nation-red-hero">
   <Picture cls="aog-nation-red-hero-flag" src={nation?.flag_url} alt="Bandera nacional"/>
   <div className="aog-nation-red-hero-info">
    <h1>{nation?.name||`NATION #${nation?.id}`}</h1><div className="aog-nation-red-government-type">REPÚBLICA PRESIDENCIAL</div>
    <div className="aog-nation-red-hero-facts"><div><span className="aog-nation-red-hero-emoji aog-nation-svg-icon aog-nation-icon-location" aria-hidden="true"/><div><span>CAPITAL</span><b>{capitalRegion?.name||'—'}</b></div></div>
    <div><span className="aog-nation-red-hero-emoji aog-nation-svg-icon aog-nation-icon-foundation" aria-hidden="true"/><div><span>FUNDACIÓN</span><b>—</b></div></div>
    <div><span className="aog-nation-red-hero-emoji aog-nation-svg-icon aog-nation-icon-players" aria-hidden="true"/><div><span>CIUDADANOS</span><b>{census?census.citizens_count:censusReady?'—':'...'}</b></div></div></div>
   </div>
 </section>
 <div className="aog-nation-red-layout">
  <section className="aog-nation-red-panel aog-nation-red-government">
   <h2><span className="aog-nation-svg-icon aog-nation-icon-players" aria-hidden="true"/>GOBIERNO</h2><div className="aog-nation-red-panel-body">
    {nationalOfficials(president,'PRESIDENTE',presidentState)}
    {nationalOfficials(vicePresident,'VICEPRESIDENTE',vicePresidentState)}
    <div className="aog-nation-red-ministers"><span>MINISTROS</span><p>{otherOfficesLoading?'CARGANDO...':'SIN MINISTROS'}</p></div>
   </div>
  </section>
  <div className="aog-nation-red-column">
   <section className="aog-nation-red-panel aog-nation-red-parliament"><h2><span className="aog-nation-svg-icon aog-nation-icon-parliaments" aria-hidden="true"/>PARLAMENTO</h2><div className="aog-nation-red-panel-body aog-nation-red-center">SIN PARLAMENTO</div></section>
   <section className="aog-nation-red-panel aog-nation-red-placeholder"><h2><span className="aog-nation-svg-icon aog-nation-icon-organizations" aria-hidden="true"/>INSTITUCIONES Y LEYES</h2><div className="aog-nation-red-panel-body aog-nation-red-center">PRÓXIMAMENTE</div></section>
  </div>
  <div className="aog-nation-red-column">
   <section className="aog-nation-red-panel aog-nation-red-votes"><h2><span className="aog-nation-svg-icon aog-nation-icon-events" aria-hidden="true"/>ELECCIONES</h2><div className="aog-nation-red-panel-body">
    <ElectionPanel items={elections} loading={electionsLoading} error={electionsError} now={now}/>
    <div className="aog-nation-red-parliamentary-pending">ELECCIONES PARLAMENTARIAS <span>PRÓXIMAMENTE</span></div>
    <button className="aog-nation-modal-trigger" type="button" onClick={()=>setModal('calendar')}>VER CALENDARIO ELECTORAL</button>
   </div></section>
   <section className="aog-nation-red-panel aog-nation-red-placeholder"><h2><span className="aog-nation-svg-icon aog-nation-icon-news" aria-hidden="true"/>HISTORIAL NACIONAL</h2><div className="aog-nation-red-panel-body aog-nation-red-center">PRÓXIMAMENTE</div></section>
  </div>
  <section className="aog-nation-red-panel aog-nation-red-regions"><h2><span className="aog-nation-svg-icon aog-nation-icon-region" aria-hidden="true"/>REGIONES</h2><div className="aog-nation-red-panel-body">
   <div className="aog-nation-red-region-list">{regions.length?regions.slice(0,3).map(r=><button type="button" className="aog-nation-red-region-row" key={r.id} onClick={()=>navigateRegion(r.id)}>
    <Picture cls="aog-nation-red-region-flag" src={r.flag_url} alt="Bandera regional"/>
    <span className="aog-nation-red-region-name">{r.name||`REGION #${r.id}`}<small>{r.is_capital?'CAPITAL':'REGIÓN'}</small></span>
    <span className="aog-nation-red-region-count">{r.count} TERRITORIOS</span>
   </button>):<p>SIN REGIONES</p>}</div>
   <button className="aog-nation-modal-trigger" type="button" onClick={()=>setModal('regions')}>VER TODAS LAS REGIONES</button>
  </div></section>
 </div>
 <section className="aog-nation-red-panel aog-nation-red-statistics"><h2><span className="aog-nation-svg-icon aog-nation-icon-statistics" aria-hidden="true"/>ESTADÍSTICAS NACIONALES</h2><div className="aog-nation-red-stat-grid">{nationNumbers.map(([name,value])=><div key={name} className="aog-nation-red-stat"><span className={`aog-nation-red-stat-icon aog-nation-stat-${({JUGADORES:"players",CIUDADANOS:"players",REGIONES:"region",TERRITORIOS:"territory",PARTIDOS:"party",CLUBES:"clubs"} as Record<string,string>)[name] ?? "players"}`} aria-hidden="true"/><span className="aog-nation-red-stat-value">{value}<small>{name}</small></span></div>)}</div>
 <div className="aog-nation-red-election-dates"><span>ÚLT. PRESIDENCIALES: {dateLabel(lastElection?.voting_ends_at)}</span><span>PRÓX. PRESIDENCIALES: {dateLabel(upcomingElection?.voting_starts_at)}</span></div></section>
 {modal&&<div className="aog-nation-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}>
  <section className="aog-nation-modal" role="dialog" aria-modal="true" aria-label={modal==='calendar'?'CALENDARIO ELECTORAL':'TODAS LAS REGIONES'}>
   <header className="aog-nation-modal-heading"><h2>{modal==='calendar'?'CALENDARIO ELECTORAL':'TODAS LAS REGIONES'}</h2><button type="button" onClick={()=>setModal(null)} aria-label="Cerrar modal">×</button></header>
   {modal==='calendar'?<div className="aog-nation-modal-content">
    <h3>ELECCIONES PRESIDENCIALES</h3>
    {electionsLoading?<p>CARGANDO ELECCIONES...</p>:electionsError?<p>NO SE PUDIERON CARGAR LAS ELECCIONES</p>:!elections.length?<p>SIN ELECCIONES REGISTRADAS</p>:
     [...elections].sort((a,b)=>new Date(b.voting_starts_at).getTime()-new Date(a.voting_starts_at).getTime()).map(e=>{
       const completed=e.stage==='POST'||Boolean(e.completed_at)||new Date(e.voting_ends_at).getTime()<=now;
       const inVoting=!completed&&new Date(e.voting_starts_at).getTime()<=now;
       return <a key={e.id} className="aog-nation-calendar-row" href={`/election?id=${e.id}`}>
        <div><span>ELECCIÓN PRESIDENCIAL</span><small>{completed?'FINALIZADA':inVoting?'EN VOTACIÓN':'EN PREPARACIÓN'}</small></div>
        <div><span>{dateLabel(e.voting_starts_at)}</span><small>{completed?'VER RESULTADOS':remaining(inVoting?e.voting_ends_at:e.voting_starts_at,now)}</small></div>
       </a>;
     })}
    <h3>ELECCIONES PARLAMENTARIAS</h3><p className="aog-nation-modal-placeholder">PRÓXIMAMENTE</p>
   </div>:<div className="aog-nation-modal-content">
    {regions.length?regions.map(r=><button type="button" className="aog-nation-modal-region" key={r.id} onClick={()=>navigateRegion(r.id)}>
     <Picture cls="aog-nation-modal-region-flag" src={r.flag_url} alt="Bandera regional"/>
     <span><span>{r.name||`REGION #${r.id}`}</span><small>{r.is_capital?'CAPITAL · ':''}{r.count} {r.count===1?'TERRITORIO':'TERRITORIOS'}</small></span><span aria-hidden="true">›</span>
    </button>):<p>SIN REGIONES</p>}
   </div>}
  </section>
 </div>}
 </>}
 </main>;
}
