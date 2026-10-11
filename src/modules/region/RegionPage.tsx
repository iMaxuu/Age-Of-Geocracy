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

  const factValue = (value: number | null | undefined) =>
    populationState === 'loading' ? 'CARGANDO' : value == null ? '—' : format.format(value);

  return <main className="aog-nation-page aog-region-page">
    {message && !region ? <p className="aog-nation-status" role="status">{message}</p> : <>
      <h1>GOBIERNO</h1>
      <div className="aog-nation-top">
        <Panel title="REGIÓN" className="aog-nation-identity">
          <Picture className="aog-nation-flag" src={flag} fallback={FLAG} alt="Bandera regional" />
          <strong>{regionName(region)}</strong>
        </Panel>
        <Panel title="ELECCIONES"><p className="aog-nation-pending">SIN ELECCIONES CONFIGURADAS</p></Panel>
        <OfficialCard role="GOBERNADOR" person={governor} state={governorState} isCapital={region?.is_capital} />
        <OfficialCard role="VICEGOBERNADOR" person={vice} state={viceState} isCapital={region?.is_capital} />
      </div>
      <h2>MINISTROS</h2>
      <div className="aog-nation-ministers">
        {['ECONOMÍA', 'MIGRACIÓN', 'INFRAESTRUCTURA', 'DEFENSA'].map(name =>
          <Panel key={name} title={name}>
            <div className="aog-nation-official">
              <Picture className="aog-nation-avatar" fallback={PHOTO} alt={name} />
              <span>{ministersLoading ? 'CARGANDO' : region?.is_capital ? 'ADMINISTRACIÓN NACIONAL' : 'VACANTE'}</span>
            </div>
          </Panel>)}
      </div>
      <h2>REGIÓN</h2>
      <Panel title="PARLAMENTO" className="aog-nation-parliament">
        <p className="aog-nation-pending">SIN PARLAMENTO</p>
      </Panel>
      <div className="aog-nation-facts">
        {([
          ['JUGADORES', factValue(population?.players_count)],
          ['CIUDADANOS', factValue(population?.citizens_count)],
          ['PARTIDOS', factValue(population?.parties_count)],
          ['FÁBRICAS', '—'],
          ['TERRITORIOS', territories == null ? 'CARGANDO' : format.format(territories)],
          ['CLUBES', '—'],
          ['ÚLTIMA ELECCIÓN PAR.', '—'],
          ['PRÓXIMA ELECCIÓN PAR.', '—'],
          ['ÚLTIMA ELECCIÓN GOB.', '—'],
          ['PRÓXIMA ELECCIÓN GOB.', '—'],
        ] as const).map(([label, value]) => <Panel key={label} title={label}><strong>{value}</strong></Panel>)}
      </div>
    </>}
  </main>;
}
