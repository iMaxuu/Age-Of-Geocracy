import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import '../home/home.css';
import './nation.css';

type Nation = { id: number; name: string|null; capital_region_id: number|null; founding_territory_id: number; president_id?:number|null; flag_url?:string|null };
type Official = {id:number;name:string;photo_url:string|null;country_code?:string|null;political_ideology?:string|null;party_name?:string|null;coalition_name?:string|null};
type PublicAffiliations = {party_id?:number|null;party_name?:string|null};
type PublicCoalition = {name?:string|null};
type Region = { id: number; name: string|null; is_capital: boolean; founding_territory_id: number; count: number; flag_url?:string|null };
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
 const [presidentState,setPresidentState]=useState<'loading'|'ready'|'error'>('loading');
 const [otherOfficesLoading,setOtherOfficesLoading]=useState(true);
 const [census,setCensus]=useState<{players_count:number;citizens_count:number}|null>(null);
 const [censusReady,setCensusReady]=useState(false);
 const [partyCount,setPartyCount]=useState<number|null>(null);
 const [partyCountReady,setPartyCountReady]=useState(false);
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
    if(n.president_id){
      const {data:p,error:presidentError}=await supabase.from('players')
        .select('id,name,photo_url,country_code,political_ideology').eq('id',n.president_id).maybeSingle();
      if(presidentError)throw presidentError;
      if(p){
        const official:Official={...p};
        // La membresía está protegida por RLS. Leerla mediante el mismo RPC público de Profile.
        const {data:profile,error:profileError}=await supabase.rpc('aog_public_player_profile',{p_player_id:p.id});
        if(profileError){
          console.warn('No se pudieron cargar las afiliaciones públicas del presidente:',profileError);
        }else if(profile && typeof profile==='object' && !Array.isArray(profile)){
          const membership=profile as PublicAffiliations;
          official.party_name=membership.party_name??null;
          if(membership.party_id){
            const {data:coalition,error:coalitionError}=await supabase.rpc('aog_coalition_for_party',{p_party_id:membership.party_id});
            if(coalitionError){
              console.warn('No se pudo cargar la coalición del presidente:',coalitionError);
            }else if(coalition && typeof coalition==='object' && !Array.isArray(coalition)){
              official.coalition_name=(coalition as PublicCoalition).name??null;
            }
          }else{
            official.coalition_name=null;
          }
        }
        if(live){setPresident(official);setPresidentState('ready');}
      }else if(live){setPresident(null);setPresidentState('ready');}
    }else if(live){setPresident(null);setPresidentState('ready');}
   }catch(err){if(live){setStatus(`NO SE PUDO CARGAR NACIÓN: ${err instanceof Error?err.message:'ERROR'}`);setPresidentState('error');setOtherOfficesLoading(false);}}
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
 // Cada partido pertenece a la nación actual de su territorio fundador.
 // La función SQL evita acceder directamente a aog_parties, protegida por RLS.
 useEffect(()=>{
  const nationId=nation?.id;
  if(!nationId)return;
  let active=true;
  setPartyCount(null);
  setPartyCountReady(false);
  const loadPartyCount=async()=>{
   const {data,error}=await supabase.rpc('aog_nation_party_count',{p_nation_id:nationId});
   if(!active)return;
   setPartyCountReady(true);
   if(error){
    console.warn('No se pudo consultar el número de partidos de la nación:',error);
    setPartyCount(null);
    return;
   }
   const value=Number(data);
   setPartyCount(data!==null && Number.isSafeInteger(value) && value>=0?value:null);
  };
  void loadPartyCount();
  const timer=window.setInterval(()=>{void loadPartyCount()},30000);
  return ()=>{active=false;window.clearInterval(timer)};
 },[nation?.id]);
 const navigateRegion=(id:number)=>{window.location.href=`/region?id=${id}`};
 return <main className="aog-nation-page">
 {status&&!nation?<p className="aog-nation-status">{status}</p>:<>
 <h1>GOBIERNO</h1>
 <div className="aog-nation-top">
  <Box title="NACIÓN" className="aog-nation-identity"><Picture cls="aog-nation-flag" src={nation?.flag_url} alt="Bandera nacional"/><strong>{nation?.name||`NATION #${nation?.id}`}</strong></Box>
  <Box title="ELECCIONES"><p className="aog-nation-pending">SIN ELECCIONES CONFIGURADAS</p></Box>
  <OfficialCard role="PRESIDENTE" person={president} loading={presidentState==='loading'} error={presidentState==='error'}/>
  <OfficialCard role="VICEPRESIDENTE" person={null} loading={otherOfficesLoading}/>
 </div>
 <h2>MINISTROS</h2>
 <div className="aog-nation-ministers">{['ECONOMÍA','MIGRACIÓN','INFRAESTRUCTURA','DEFENSA'].map(name=><Box key={name} title={name}><div className="aog-nation-official"><Picture cls="aog-nation-avatar" alt={name}/><span>{otherOfficesLoading?'CARGANDO':'VACANTE'}</span></div></Box>)}</div>
 <h2>INSTITUCIONES</h2>
 <div className="aog-nation-institutions">{['GOBIERNO','ACCESO AL PODER','DIVISIÓN','COLONIALISMO','ECONOMÍA','PROPIEDAD','COMERCIO','SUFRAGIO','GOBERNADORES','ELECCIÓN PRESIDENCIAL','RENOVACIÓN PARLAMENTARIA','MIGRACIÓN','AUTONOMÍA REGIONAL','MÉTODO LEGISLATIVO','DOCTRINA MILITAR'].map(label=><Box key={label} title={label}><p className="aog-nation-pending">—</p></Box>)}</div>
 <h2>NACIÓN</h2>
 <Box title="PARLAMENTO" className="aog-nation-parliament"><p className="aog-nation-pending">SIN PARLAMENTO</p></Box>
 <div className="aog-nation-facts">{[['JUGADORES',census?String(census.players_count):censusReady?'—':'CARGANDO'],['CIUDADANOS',census?String(census.citizens_count):censusReady?'—':'CARGANDO'],['PARTIDOS',partyCount===null?(partyCountReady?'—':'CARGANDO'):String(partyCount)],['FÁBRICAS','—'],['REGIONES',String(regions.length)],['TERRITORIOS',String(regions.reduce((t,r)=>t+r.count,0))],['FRONTERAS','—'],['CLUBES','—']].map(([label,value])=><Box key={label} title={label}><strong>{value}</strong></Box>)}</div>
 <h2>REGIONES</h2>
 <div className="aog-nation-regions">{regions.length?regions.map(r=><button type="button" className="aog-nation-region" key={r.id} onClick={()=>navigateRegion(r.id)}>
  {r.is_capital&&<span className="aog-nation-star" aria-label="Capital">★</span>}
  <span className="aog-home-panel-title aog-nation-count">{r.count} {r.count===1?'TERRITORIO':'TERRITORIOS'}</span>
  <Picture cls="aog-nation-flag" src={r.flag_url} alt="Bandera regional"/>
  <strong>{r.name||`REGION #${r.id}`}</strong>
 </button>):<p className="aog-nation-status">SIN REGIONES</p>}</div>
 </>}
 </main>;
}
