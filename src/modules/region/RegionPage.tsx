import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import '../home/home.css';
import '../nation/nation.css';
import './region.css';

type Region = {
  id: number;
  nation_id: number;
  name: string | null;
  founding_territory_id: number;
  is_capital: boolean;
  governor_id: number | null;
  vice_governor_id: number | null;
};
type Official = {
  id: number;
  name: string;
  photo_url: string | null;
  country_code: string | null;
  political_ideology: string | null;
  party_name?: string | null;
  coalition_name?: string | null;
};
type Census = { players_count: number; citizens_count: number; parties_count: number };
type GovernorElection={id:number;pre_starts_at:string;voting_starts_at:string;voting_ends_at:string;completed_at:string|null};
const timerText=(date:string,now:number)=>{const seconds=Math.max(0,Math.floor((new Date(date).getTime()-now)/1000));return `${Math.floor(seconds/86400)}D ${String(Math.floor(seconds%86400/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
type State = 'loading' | 'ready' | 'error';
const FLAG = '/assets/photos/noflag.png';
const PHOTO = '/assets/photos/nouser.png';
const format = new Intl.NumberFormat('es-AR');
function regionName(region: Region | null): string {
  if (!region) return 'CARGANDO';
  const label = region.name?.trim();
  // Las denominaciones provisionales de fundación no son nombres personalizados.
  if (!label || /^(?:CAPITAL|REGI[ÓO]N|REGION)(?:\s+CAPITAL)?\s*#?\d*$/i.test(label)) {
    return `REGION #${region.id}`;
  }
  return label;
}


function Picture({ src, alt, className, fallback }: {
  src?: string | null;
  alt: string;
  className: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <img className={className} src={failed || !src ? fallback : src}
    alt={alt} onError={() => setFailed(true)} />;
}

function Panel({ title, children, className = '' }: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`aog-nation-box ${className}`}>
    <h3 className="aog-home-panel-title">{title}</h3>{children}
  </section>;
}

async function loadOfficial(id: number): Promise<Official | null> {
  const { data, error } = await supabase.from('players')
    .select('id,name,photo_url,country_code,political_ideology')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const person: Official = { ...data };
  const { data: profile, error: profileError } = await supabase.rpc('aog_public_player_profile', { p_player_id: id });
  if (profileError) {
    console.warn('No se pudo cargar el partido de la autoridad regional:', profileError);
    return person;
  }
  const publicProfile = Array.isArray(profile) ? profile[0] : profile;
  if (publicProfile && typeof publicProfile === 'object') {
    const fields = publicProfile as { party_id?: number | null; party_name?: string | null };
    person.party_name = fields.party_name ?? null;
    if (fields.party_id) {
      const { data: coalition, error: coalitionError } = await supabase.rpc('aog_coalition_for_party', { p_party_id: fields.party_id });
      if (coalitionError) console.warn('No se pudo cargar la coalición de la autoridad regional:', coalitionError);
      else {
        const current = Array.isArray(coalition) ? coalition[0] : coalition;
        if (current && typeof current === 'object') {
          person.coalition_name = (current as { name?: string | null }).name ?? null;
        }
      }
    } else person.coalition_name = null;
  }
  return person;
}

function OfficialCard({ role, person, state, isCapital = false }: {
  role: string;
  person: Official | null;
  state: State;
  isCapital?: boolean;
}) {
  return <Panel title={role} className="aog-nation-official-box">
    <div className="aog-nation-official">
      {!isCapital && (person ? <a className="aog-region-official-photo-link" href={`/profile/${person.id}`}
          aria-label={`Abrir perfil de ${person.name}`}><Picture className="aog-nation-avatar" fallback={PHOTO}
          src={person.photo_url} alt={person.name} /></a>
        : <Picture className="aog-nation-avatar" fallback={PHOTO} alt={role} />)}
      {isCapital ? <span className="aog-region-capital-authority">BAJO ADMINISTRACIÓN NACIONAL</span>
        : state === 'loading' ? <span className="aog-nation-vacant">CARGANDO</span>
        : state === 'error' ? <span className="aog-nation-vacant">NO DISPONIBLE</span>
        : person ? <div className="aog-nation-official-details">
          <a className="aog-region-official-link" href={`/profile/${person.id}`}>
            <span className="aog-nation-official-name">{person.name} <small>#{person.id}</small></span>
          </a>
          {person.country_code && <img className="aog-nation-official-country"
            src={`/assets/flags/${person.country_code.toLowerCase()}.svg`} alt={person.country_code} />}
          {person.political_ideology && <div>{person.political_ideology}</div>}
          <div>{person.party_name === undefined ? '—' : person.party_name ? `PARTIDO ${person.party_name}` : 'SIN PARTIDO'}</div>
          <div>{person.coalition_name === undefined ? '—' : person.coalition_name ? `COALICIÓN ${person.coalition_name}` : 'SIN COALICIÓN'}</div>
        </div>
        : <span className="aog-nation-vacant">VACANTE</span>}
    </div>
  </Panel>;
}

export default function RegionPage() {
  const [region, setRegion] = useState<Region | null>(null);
  const [nationName, setNationName] = useState<string>('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [governorElections,setGovernorElections]=useState<GovernorElection[]>([]);
  const [electionError,setElectionError]=useState('');
  const [timeNow,setTimeNow]=useState(Date.now());
  const [flag, setFlag] = useState<string | null>(null);
  const [message, setMessage] = useState('CARGANDO REGIÓN...');
  const [governor, setGovernor] = useState<Official | null>(null);
  const [vice, setVice] = useState<Official | null>(null);
  const [governorState, setGovernorState] = useState<State>('loading');
  const [viceState, setViceState] = useState<State>('loading');
  const [ministersLoading, setMinistersLoading] = useState(true);
  const [population, setPopulation] = useState<Census | null>(null);
  const [populationState, setPopulationState] = useState<State>('loading');
  const [territories, setTerritories] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const candidate = query.get('id');
        let id: number | null = candidate && /^\d+$/.test(candidate) ? Number(candidate) : null;
        if (!id) {
          const { data: auth, error: authError } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!auth.user) throw new Error('INICIÁ SESIÓN PARA VER TU REGIÓN');
          const { data: player, error: playerError } = await supabase.from('players')
            .select('territory_id').eq('auth_id', auth.user.id).single();
          if (playerError) throw playerError;
          const { data: politics, error: politicsError } = await supabase.from('map_territory_politics')
            .select('region_id').eq('territory_id', player.territory_id).maybeSingle();
          if (politicsError) throw politicsError;
          id = politics?.region_id ?? null;
        }
        if (!id) {
          if (active) setMessage('TU TERRITORIO NO PERTENECE A UNA REGIÓN');
          return;
        }
        const { data: row, error } = await supabase.from('aog_founded_regions')
          .select('id,nation_id,name,founding_territory_id,is_capital,governor_id,vice_governor_id')
          .eq('id', id).maybeSingle();
        if (error) throw error;
        if (!row) {
          if (active) setMessage('REGIÓN NO ENCONTRADA');
          return;
        }
        if (!active) return;
        const current = row as Region;
        setRegion(current);
        setMessage('');
        void supabase.from('aog_founded_nations').select('name').eq('id',current.nation_id).maybeSingle().then(({data})=>{
          if(active) setNationName(data?.name || `NATION #${current.nation_id}`);
        });
        const [flagResult, countResult] = await Promise.all([
          supabase.from('map_territory_politics').select('region_flag')
            .eq('territory_id', current.founding_territory_id).maybeSingle(),
          supabase.from('map_territory_politics').select('territory_id', { count: 'exact', head: true })
            .eq('region_id', current.id),
        ]);
        if (active) {
          if (flagResult.error) console.warn('No se pudo cargar la bandera regional:', flagResult.error);
          else setFlag(flagResult.data?.region_flag ?? null);
          if (countResult.error) console.warn('No se pudo contar territorios regionales:', countResult.error);
          else setTerritories(countResult.count ?? 0);
        }
        if (current.is_capital) {
          if (active) {
            setGovernorState('ready'); setViceState('ready'); setMinistersLoading(false);
          }
        } else {
          const ids = [current.governor_id, current.vice_governor_id];
          await Promise.all(ids.map(async (officialId, index) => {
            try {
              const person = officialId ? await loadOfficial(officialId) : null;
              if (active) {
                if (index === 0) { setGovernor(person); setGovernorState('ready'); }
                else { setVice(person); setViceState('ready'); }
              }
            } catch (officialError) {
              console.warn('No se pudo cargar la autoridad regional:', officialError);
              if (active) {
                if (index === 0) setGovernorState('error');
                else setViceState('error');
              }
            }
          }));
          if (active) setMinistersLoading(false);
        }
      } catch (error) {
        console.error('No se pudo cargar la región:', error);
        if (active) {
          setMessage(`NO SE PUDO CARGAR REGIÓN: ${error instanceof Error ? error.message : 'ERROR'}`);
          setGovernorState('error'); setViceState('error'); setMinistersLoading(false);
        }
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!region) return;
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('aog_region_population', { p_region_id: region.id });
      if (!active) return;
      if (error) {
        console.warn('Error al consultar la población regional:', error);
        setPopulation(null);
        setPopulationState('error');
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row && [row.players_count, row.citizens_count, row.parties_count].every(v =>
        Number.isSafeInteger(Number(v)) && Number(v) >= 0)) {
        setPopulation({
          players_count: Number(row.players_count),
          citizens_count: Number(row.citizens_count),
          parties_count: Number(row.parties_count),
        });
        setPopulationState('ready');
      } else {
        setPopulation(null);
        setPopulationState('error');
      }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [region?.id]);

  useEffect(()=>{const id=region?.id;if(!id)return;let active=true;const fetchElections=async()=>{const {data,error}=await supabase.rpc('aog_governor_region_elections',{p_region_id:id});if(!active)return;if(error){setElectionError(error.message);return;}setElectionError('');setGovernorElections((data||[]) as GovernorElection[]);};void fetchElections();const refresh=window.setInterval(()=>void fetchElections(),15000);const clock=window.setInterval(()=>setTimeNow(Date.now()),1000);return()=>{active=false;clearInterval(refresh);clearInterval(clock)}},[region?.id]);
  const currentGovernorElections=governorElections.filter(e=>!e.completed_at && new Date(e.voting_ends_at).getTime()>timeNow && new Date(e.pre_starts_at).getTime()<=timeNow);
  const lastGovernorElection=governorElections.filter(e=>Boolean(e.completed_at)).sort((a,b)=>new Date(b.voting_ends_at).getTime()-new Date(a.voting_ends_at).getTime())[0];
  const nextGovernorElection=governorElections.filter(e=>!e.completed_at && new Date(e.voting_starts_at).getTime()>timeNow).sort((a,b)=>new Date(a.voting_starts_at).getTime()-new Date(b.voting_starts_at).getTime())[0];
  const electoralDate=(date?:string)=>date?new Date(date).toLocaleDateString('es-AR'):'—';

  const factValue = (value: number | null | undefined) =>
    populationState === 'loading' ? 'CARGANDO' : value == null ? '—' : format.format(value);

  const title=(person:Official|null,role:string,state:State)=><div className="aog-nation-red-official">
    <div className="aog-nation-red-role">{role}</div><div className="aog-nation-red-person">
      <a href={person?`/profile?id=${person.id}`:'#'} onClick={e=>{if(!person)e.preventDefault()}}>
        <Picture className="aog-nation-red-person-photo" src={person?.photo_url} fallback={PHOTO} alt={role}/>
      </a>
      <div className="aog-nation-red-person-info">{region?.is_capital?'BAJO ADMINISTRACIÓN NACIONAL':state==='loading'?'CARGANDO':state==='error'?'NO DISPONIBLE':person?<>
      <a href={`/profile?id=${person.id}`} className="aog-nation-red-person-name">{person.name}</a>
      <span>{person.party_name?`PARTIDO ${person.party_name}`:'SIN PARTIDO'}</span>
      {person.coalition_name&&<span>COALICIÓN {person.coalition_name}</span>}
      </>:'VACANTE'}</div></div></div>;
  const formatDate=(value?:string|null)=>value?new Date(value).toLocaleDateString('es-AR'):'—';
  const numbers:[string,string,string][]=[
    ['JUGADORES',factValue(population?.players_count),'players'],
    ['CIUDADANOS',factValue(population?.citizens_count),'players'],
    ['TERRITORIOS',territories==null?'—':format.format(territories),'territory'],
    ['PARTIDOS',factValue(population?.parties_count),'party'],
    ['CLUBES','—','clubs'],
  ];
  const electionsList=<div className="aog-region-red-election-list">
    {electionError?<p>NO SE PUDIERON CARGAR LAS ELECCIONES</p>:region?.is_capital?<p>ADMINISTRACIÓN NACIONAL</p>:currentGovernorElections.length===0?<p>SIN ELECCIONES ACTIVAS</p>:
      currentGovernorElections.map(e=>{const voting=timeNow>=new Date(e.voting_starts_at).getTime();return <a href={`/election?type=governor&id=${e.id}`} key={e.id} className="aog-region-red-election">
        <span>ELECCIÓN DE GOBERNADOR</span><span>{voting?'EN VOTACIÓN':'EN PREPARACIÓN'}</span>
        <span className="aog-region-red-election-clock">{timerText(voting?e.voting_ends_at:e.voting_starts_at,timeNow)}</span>
      </a>})}
    <div className="aog-region-red-parliament-pending"><span>ELECCIONES PARLAMENTARIAS</span><span>PRÓXIMAMENTE</span></div>
  </div>;
  return <main className="aog-nation-page aog-nation-redesign aog-region-redesign">
    {message&&!region?<p className="aog-nation-status" role="status">{message}</p>:<>
    <section className="aog-nation-red-hero">
      <Picture className="aog-nation-red-hero-flag" src={flag} fallback={FLAG} alt="Bandera regional"/>
      <div className="aog-nation-red-hero-info"><h1>{regionName(region)}</h1>
        <div className="aog-nation-red-government-type"><a href={`/nation?id=${region?.nation_id}`}>{nationName||'NACIÓN'}</a></div>
        <div className="aog-nation-red-hero-facts">
          <div><span className="aog-nation-red-hero-emoji aog-nation-svg-icon aog-nation-icon-territory" aria-hidden="true"/><div><span>TERRITORIOS</span><b>{territories==null?'—':format.format(territories)}</b></div></div>
          <div><span className="aog-nation-red-hero-emoji aog-nation-svg-icon aog-nation-icon-foundation" aria-hidden="true"/><div><span>FUNDACIÓN</span><b>—</b></div></div>
          <div><span className="aog-nation-red-hero-emoji aog-nation-svg-icon aog-nation-icon-players" aria-hidden="true"/><div><span>CIUDADANOS</span><b>{factValue(population?.citizens_count)}</b></div></div>
        </div></div>
    </section>
    <div className="aog-nation-red-layout aog-region-red-layout">
      <section className="aog-nation-red-panel aog-nation-red-government">
        <h2><span className="aog-nation-svg-icon aog-nation-icon-players" aria-hidden="true"/>GOBIERNO</h2>
        <div className="aog-nation-red-panel-body">
          {title(governor,'GOBERNADOR',governorState)}
          {title(vice,'VICEGOBERNADOR',viceState)}
          <div className="aog-nation-red-ministers"><span>MINISTROS</span><p>{ministersLoading?'CARGANDO...':region?.is_capital?'ADMINISTRACIÓN NACIONAL':'SIN MINISTROS'}</p></div>
        </div>
      </section>
      <div className="aog-nation-red-column">
        <section className="aog-nation-red-panel aog-nation-red-parliament"><h2><span className="aog-nation-svg-icon aog-nation-icon-parliaments" aria-hidden="true"/>PARLAMENTO</h2><div className="aog-nation-red-panel-body aog-nation-red-center">SIN PARLAMENTO</div></section>
        <section className="aog-nation-red-panel aog-nation-red-placeholder"><h2><span className="aog-nation-svg-icon aog-nation-icon-organizations" aria-hidden="true"/>INSTITUCIONES Y LEYES</h2><div className="aog-nation-red-panel-body aog-nation-red-center">PRÓXIMAMENTE</div></section>
      </div>
      <div className="aog-nation-red-column">
        <section className="aog-nation-red-panel aog-nation-red-votes"><h2><span className="aog-nation-svg-icon aog-nation-icon-events" aria-hidden="true"/>ELECCIONES</h2><div className="aog-nation-red-panel-body aog-region-red-voting-body">
          {electionsList}
          <button type="button" className="aog-nation-modal-trigger" onClick={()=>setCalendarOpen(true)}>VER CALENDARIO ELECTORAL</button>
        </div></section>
        <section className="aog-nation-red-panel aog-nation-red-placeholder"><h2><span className="aog-nation-svg-icon aog-nation-icon-news" aria-hidden="true"/>HISTORIAL REGIONAL</h2><div className="aog-nation-red-panel-body aog-nation-red-center">PRÓXIMAMENTE</div></section>
      </div>
    </div>
    <section className="aog-nation-red-panel aog-nation-red-statistics"><h2><span className="aog-nation-svg-icon aog-nation-icon-statistics" aria-hidden="true"/>ESTADÍSTICAS REGIONALES</h2>
      <div className="aog-nation-red-stat-grid">{numbers.map(([label,value,icon])=><div className="aog-nation-red-stat" key={label}>
        <span className={`aog-nation-red-stat-icon aog-nation-stat-${icon}`} aria-hidden="true"/>
        <span className="aog-nation-red-stat-value">{value}<small>{label}</small></span>
      </div>)}</div>
      <div className="aog-nation-red-election-dates"><span>ÚLT. GOBERNADOR: {electoralDate(lastGovernorElection?.completed_at||undefined)}</span><span>PRÓX. GOBERNADOR: {electoralDate(nextGovernorElection?.voting_starts_at)}</span></div>
    </section>
    {calendarOpen&&<div className="aog-nation-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCalendarOpen(false)}}>
      <section className="aog-nation-modal" role="dialog" aria-modal="true" aria-label="CALENDARIO ELECTORAL REGIONAL">
        <header className="aog-nation-modal-heading"><h2>CALENDARIO ELECTORAL</h2><button type="button" onClick={()=>setCalendarOpen(false)} aria-label="Cerrar">×</button></header>
        <div className="aog-nation-modal-content"><h3>ELECCIONES DE GOBERNADOR</h3>
        {region?.is_capital?<p>REGIÓN BAJO ADMINISTRACIÓN NACIONAL</p>:electionError?<p>NO SE PUDIERON CARGAR LAS ELECCIONES</p>:governorElections.length===0?<p>SIN ELECCIONES REGISTRADAS</p>:[...governorElections].sort((a,b)=>new Date(b.voting_starts_at).getTime()-new Date(a.voting_starts_at).getTime()).map(e=>{
          const ended=Boolean(e.completed_at)||new Date(e.voting_ends_at).getTime()<=timeNow;
          const voting=!ended&&new Date(e.voting_starts_at).getTime()<=timeNow;
          return <a key={e.id} href={`/election?type=governor&id=${e.id}`} className="aog-nation-calendar-row"><div><span>ELECCIÓN DE GOBERNADOR</span><small>{ended?'FINALIZADA':voting?'EN VOTACIÓN':'EN PREPARACIÓN'}</small></div><div><span>{formatDate(e.voting_starts_at)}</span><small>{ended?'VER RESULTADOS':timerText(voting?e.voting_ends_at:e.voting_starts_at,timeNow)}</small></div></a>
        })}
        <h3>ELECCIONES PARLAMENTARIAS</h3><p>PRÓXIMAMENTE</p>
        </div>
      </section></div>}
    </>}
  </main>;
}
