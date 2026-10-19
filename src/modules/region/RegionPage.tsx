import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AreaResourcesPanel from '../shared/AreaResourcesPanel';
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
  created_at: string | null;
};
type Official = {
  id: number;
  name: string;
  photo_url: string | null;
  party_name?: string | null;
  coalition_name?: string | null;
};
type Census = { players_count: number; citizens_count: number; parties_count: number };
type Election = {
  id: number;
  pre_starts_at: string;
  voting_starts_at: string;
  voting_ends_at: string;
  completed_at: string | null;
};
type DisplayElection = {
  key: string;
  heading: string;
  subtitle: string;
  title: string;
  href: string;
  voting_starts_at: string;
  voting_ends_at: string;
};
type FetchState = 'loading' | 'ready' | 'error';

const PHOTO = '/assets/photos/nouser.png';
const FLAG = '/assets/photos/noflag.png';
const format = new Intl.NumberFormat('es-AR');
const iconUrl = (name: string) => `/assets/icons/icons/${name}.svg?v=0.0.3-custom-2`;

function RegionIcon({ name }: { name: string }) {
  return <span className="aog-home-icon" style={{ WebkitMaskImage: `url(${iconUrl(name)})`, maskImage: `url(${iconUrl(name)})` }} aria-hidden="true" />;
}
function PanelHeading({ title, icon }: { title: string; icon: string }) {
  return <h2 className="aog-home-panel-heading aog-nation-heading"><span className="aog-home-heading-tab"><RegionIcon name={icon}/><span>{title}</span></span></h2>;
}
function Picture({ src, alt, className, fallback }: { src: string | null | undefined; alt: string; className: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <img className={className} src={!failed && src ? src : fallback} alt={alt} onError={() => setFailed(true)} />;
}
function InfoLine({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <div className="aog-nation-info-line"><RegionIcon name={icon}/><div><strong>{label}</strong><span>{value}</span></div></div>;
}
function regionName(region: Region | null) {
  if (!region) return 'REGIÓN';
  const name = region.name?.trim();
  if (!name || /^(?:CAPITAL|REGI[ÓO]N|REGION)(?:\s+CAPITAL)?\s*#?\d*$/i.test(name)) return `REGIÓN #${region.id}`;
  return name;
}
function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}
function longDateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : '—';
}
function remaining(until: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days ? `${days}D ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
function isActive(election: Election, now: number) {
  const start = new Date(election.pre_starts_at).getTime();
  const end = new Date(election.voting_ends_at).getTime();
  return !election.completed_at && Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now;
}

async function loadOfficial(id: number): Promise<Official | null> {
  const { data, error } = await supabase.from('players').select('id,name,photo_url').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const official: Official = { ...data };
  const { data: profile, error: profileError } = await supabase.rpc('aog_public_player_profile', { p_player_id: id });
  if (profileError) console.warn('No se pudo cargar el partido regional:', profileError);
  else {
    const current = Array.isArray(profile) ? profile[0] : profile;
    if (current && typeof current === 'object') {
      const membership = current as { party_id?: number | null; party_name?: string | null };
      official.party_name = membership.party_name ?? null;
      if (membership.party_id) {
        const { data: coalition, error: coalitionError } = await supabase.rpc('aog_coalition_for_party', { p_party_id: membership.party_id });
        if (coalitionError) console.warn('No se pudo cargar la coalición regional:', coalitionError);
        else {
          const found = Array.isArray(coalition) ? coalition[0] : coalition;
          if (found && typeof found === 'object') official.coalition_name = (found as { name?: string | null }).name ?? null;
        }
      }
    }
  }
  return official;
}

function OfficialColumn({ person, role, state, isCapital }: { person: Official | null; role: string; state: FetchState; isCapital: boolean }) {
  return <div className="aog-nation-government-column">
    <div className="aog-nation-government-role">{role}</div>
    {isCapital ? <div className="aog-region-authority-empty">BAJO ADMINISTRACIÓN NACIONAL</div>
      : state === 'loading' ? <div className="aog-region-authority-empty">CARGANDO...</div>
      : state === 'error' ? <div className="aog-region-authority-empty">NO DISPONIBLE</div>
      : person ? <>
        <a href={`/profile?id=${person.id}`} className="aog-nation-government-photo-link" aria-label={`Abrir perfil de ${person.name}`}>
          <Picture src={person.photo_url} alt={person.name} className="aog-nation-government-avatar" fallback={PHOTO}/>
        </a>
        <div className="aog-nation-government-name">{person.name}</div>
        <div className="aog-nation-government-party">{person.party_name || 'SIN PARTIDO'}</div>
        <div className="aog-nation-government-coalition">{person.coalition_name || 'SIN COALICIÓN'}</div>
      </> : <div className="aog-region-authority-empty">VACANTE</div>}
  </div>;
}
function ElectionCard({ event, now }: { event: DisplayElection; now: number }) {
  const voting = now >= new Date(event.voting_starts_at).getTime();
  return <div className="aog-nation-event-block">
    <div className="aog-nation-event-title">{event.heading}</div>
    <div className="aog-nation-event-subtitle">{event.subtitle}</div>
    <div className="aog-nation-event-mini-grid">
      <a className="aog-nation-event-mini" href={event.href}>
        <span className="aog-nation-event-mini-title">{event.title}</span>
        <small>{voting ? 'EN VOTACIÓN' : 'EN PREPARACIÓN'}</small>
        <strong>{remaining(voting ? event.voting_ends_at : event.voting_starts_at, now)}</strong>
      </a>
    </div>
  </div>;
}

export default function RegionPage() {
  const [region, setRegion] = useState<Region | null>(null);
  const [nationName, setNationName] = useState('');
  const [nationFlag, setNationFlag] = useState<string | null>(null);
  const [flag, setFlag] = useState<string | null>(null);
  const [message, setMessage] = useState('CARGANDO REGIÓN...');
  const [governor, setGovernor] = useState<Official | null>(null);
  const [vice, setVice] = useState<Official | null>(null);
  const [governorState, setGovernorState] = useState<FetchState>('loading');
  const [viceState, setViceState] = useState<FetchState>('loading');
  const [population, setPopulation] = useState<Census | null>(null);
  const [populationState, setPopulationState] = useState<FetchState>('loading');
  const [territories, setTerritories] = useState<number | null>(null);
  const [presidentialElections, setPresidentialElections] = useState<Election[]>([]);
  const [governorElections, setGovernorElections] = useState<Election[]>([]);
  const [nationalElectionsLoading, setNationalElectionsLoading] = useState(true);
  const [regionalElectionsLoading, setRegionalElectionsLoading] = useState(true);
  const [nationalElectionsError, setNationalElectionsError] = useState(false);
  const [regionalElectionsError, setRegionalElectionsError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [eventsExpanded, setEventsExpanded] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const candidate = params.get('id');
        let id = candidate && /^\d+$/.test(candidate) ? Number(candidate) : null;
        if (!id) {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!user) throw Error('INICIÁ SESIÓN PARA VER TU REGIÓN');
          const { data: player, error: playerError } = await supabase.from('players').select('territory_id').eq('auth_id', user.id).single();
          if (playerError) throw playerError;
          const { data: politics, error: politicsError } = await supabase.from('map_territory_politics').select('region_id').eq('territory_id', player?.territory_id).maybeSingle();
          if (politicsError) throw politicsError;
          id = politics?.region_id ?? null;
        }
        if (!id) { if (active) setMessage('TU TERRITORIO NO PERTENECE A UNA REGIÓN'); return; }
        const { data: row, error } = await supabase.from('aog_founded_regions')
          .select('id,nation_id,name,founding_territory_id,is_capital,governor_id,vice_governor_id,created_at').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!row) { if (active) setMessage('REGIÓN NO ENCONTRADA'); return; }
        if (!active) return;
        const current = row as Region;
        setRegion(current);
        setMessage('');
        const [national, flags, count] = await Promise.all([
          supabase.from('aog_founded_nations').select('name').eq('id', current.nation_id).maybeSingle(),
          supabase.from('map_territory_politics').select('nation_flag,region_flag').eq('territory_id', current.founding_territory_id).maybeSingle(),
          supabase.from('map_territory_politics').select('territory_id', { count: 'exact', head: true }).eq('region_id', current.id),
        ]);
        if (!active) return;
        if (national.error) console.warn('No se pudo cargar la nación de la región:', national.error);
        setNationName(national.data?.name || `NACIÓN #${current.nation_id}`);
        if (flags.error) console.warn('No se pudieron cargar las banderas:', flags.error);
        else { setFlag(flags.data?.region_flag ?? null); setNationFlag(flags.data?.nation_flag ?? null); }
        if (count.error) console.warn('No se pudo contar los territorios regionales:', count.error);
        else setTerritories(count.count ?? 0);
        if (current.is_capital) {
          setGovernorState('ready');
          setViceState('ready');
        } else {
          await Promise.all(([current.governor_id, current.vice_governor_id] as const).map(async (officialId, index) => {
            try {
              const person = officialId ? await loadOfficial(officialId) : null;
              if (!active) return;
              if (index === 0) { setGovernor(person); setGovernorState('ready'); }
              else { setVice(person); setViceState('ready'); }
            } catch (err) {
              console.warn('No se pudo cargar la autoridad regional:', err);
              if (!active) return;
              if (index === 0) setGovernorState('error');
              else setViceState('error');
            }
          }));
        }
      } catch (error) {
        console.error('No se pudo cargar la región:', error);
        if (active) {
          setMessage(`NO SE PUDO CARGAR REGIÓN: ${error instanceof Error ? error.message : 'ERROR'}`);
          setGovernorState('error');
          setViceState('error');
        }
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!region?.id) return;
    let active = true;
    setPopulationState('loading');
    const load = async () => {
      const { data, error } = await supabase.rpc('aog_region_population', { p_region_id: region.id });
      if (!active) return;
      if (error) { console.warn('No se pudo cargar el censo regional:', error); setPopulationState('error'); setPopulation(null); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (row && [row.players_count, row.citizens_count, row.parties_count].every(v => Number.isSafeInteger(Number(v)) && Number(v) >= 0)) {
        setPopulation({ players_count: Number(row.players_count), citizens_count: Number(row.citizens_count), parties_count: Number(row.parties_count) });
        setPopulationState('ready');
      } else { setPopulation(null); setPopulationState('error'); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [region?.id]);

  useEffect(() => {
    const id = region?.id;
    if (!id) return;
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('aog_governor_region_elections', { p_region_id: id });
      if (!active) return;
      setRegionalElectionsLoading(false);
      if (error) { console.warn('No se pudieron cargar las elecciones regionales:', error); setRegionalElectionsError(true); setGovernorElections([]); }
      else { setRegionalElectionsError(false); setGovernorElections((Array.isArray(data) ? data : []) as Election[]); }
    };
    setRegionalElectionsLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [region?.id]);

  useEffect(() => {
    const id = region?.nation_id;
    if (!id) return;
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('aog_nation_election_summaries', { p_nation_id: id });
      if (!active) return;
      setNationalElectionsLoading(false);
      if (error) { console.warn('No se pudieron cargar las elecciones nacionales:', error); setNationalElectionsError(true); setPresidentialElections([]); }
      else { setNationalElectionsError(false); setPresidentialElections((Array.isArray(data) ? data : []) as Election[]); }
    };
    setNationalElectionsLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [region?.nation_id]);

  const currentEvents: DisplayElection[] = [
    ...presidentialElections.filter(e => isActive(e, now)).map(e => ({
      key: `presidential-${e.id}`, heading: 'ELECCIONES NACIONALES', subtitle: nationName || `NACIÓN #${region?.nation_id}`,
      title: 'PRESIDENCIALES', href: `/election?id=${e.id}`,
      voting_starts_at: e.voting_starts_at, voting_ends_at: e.voting_ends_at,
    })),
    ...(region?.is_capital ? [] : governorElections.filter(e => isActive(e, now)).map(e => ({
      key: `governor-${e.id}`, heading: 'ELECCIONES REGIONALES', subtitle: regionName(region),
      title: 'GUBERNAMENTALES', href: `/election?type=governor&id=${e.id}`,
      voting_starts_at: e.voting_starts_at, voting_ends_at: e.voting_ends_at,
    }))),
  ].sort((a, b) => new Date(a.voting_ends_at).getTime() - new Date(b.voting_ends_at).getTime());
  const visibleEvents = eventsExpanded ? currentEvents : currentEvents.slice(0, 3);
  const extraEvents = currentEvents.length - 3;
  const nextGovernorElection = governorElections.filter(e => !e.completed_at && new Date(e.voting_starts_at).getTime() > now)
    .sort((a, b) => new Date(a.voting_starts_at).getTime() - new Date(b.voting_starts_at).getTime())[0];
  const value = (num?: number | null) => populationState === 'loading' ? '...' : num == null ? '—' : format.format(num);
  const stats: [string, string][] = [
    ['JUGADORES', value(population?.players_count)],
    ['CIUDADANOS', value(population?.citizens_count)],
    ['REGIONES', region ? '1' : '—'],
    ['TERRITORIOS', territories == null ? '—' : format.format(territories)],
    ['PARTIDOS', value(population?.parties_count)],
    ['CLUBES', '—'],
  ];

  if (message && !region) return <main className="aog-nation-page aog-nation-sketch aog-region-sketch"><p className="aog-nation-status" role="status">{message}</p></main>;
  return <main className="aog-nation-page aog-nation-sketch aog-region-sketch">
    <div className="aog-nation-grid aog-region-grid">
      <section className="aog-home-panel aog-nation-panel aog-nation-summary-panel aog-region-summary-panel">
        <PanelHeading title="REGIÓN" icon="region"/>
        <div className="aog-nation-summary-body">
          <div className="aog-nation-summary-flagbox">
            <Picture src={flag} alt="Bandera regional" className="aog-nation-summary-flag" fallback={FLAG}/>
            <div className="aog-nation-summary-name">{regionName(region)}</div>
          </div>
          <div className="aog-nation-summary-divider" aria-hidden="true"/>
          <div className="aog-nation-summary-info">
            <InfoLine icon="region" label="REGIÓN" value={`#${region?.id ?? '—'}`}/>
            <InfoLine icon="foundation" label="FUNDADO" value={longDateLabel(region?.created_at)}/>
            <InfoLine icon="players" label="CIUDADANOS" value={value(population?.citizens_count)}/>
          </div>
        </div>
      </section>

      <section className="aog-home-panel aog-nation-panel aog-nation-events-panel aog-region-events-panel">
        <PanelHeading title="EVENTOS ACTUALES" icon="events"/>
        <div className="aog-nation-events-body">
          {nationalElectionsLoading || regionalElectionsLoading
            ? <div className="aog-nation-events-empty">CARGANDO ELECCIONES...</div>
            : currentEvents.length === 0
              ? <div className="aog-nation-events-empty">{nationalElectionsError && regionalElectionsError ? 'NO SE PUDIERON CARGAR LAS ELECCIONES' : 'SIN EVENTOS ACTUALES'}</div>
              : visibleEvents.map(event => <ElectionCard event={event} now={now} key={event.key}/>)}
          {extraEvents > 0 && <button type="button" className="aog-nation-events-more" onClick={() => setEventsExpanded(open => !open)}>
            {eventsExpanded ? 'VER MENOS' : `VER ${extraEvents} MÁS`}
          </button>}
        </div>
      </section>

      <section className="aog-home-panel aog-nation-panel aog-nation-government-panel aog-region-government-panel">
        <PanelHeading title="GOBIERNO" icon="players"/>
        <div className="aog-nation-government-body">
          <OfficialColumn person={governor} role="GOBERNADOR" state={governorState} isCapital={Boolean(region?.is_capital)}/>
          <div className="aog-nation-government-splitter" aria-hidden="true"/>
          <OfficialColumn person={vice} role="VICEGOBERNADOR" state={viceState} isCapital={Boolean(region?.is_capital)}/>
        </div>
      </section>

      <section className="aog-home-panel aog-nation-panel aog-nation-parliament-panel aog-region-parliament-panel">
        <PanelHeading title="PARLAMENTO" icon="parliaments"/>
        <div className="aog-nation-placeholder-body">PRÓXIMAMENTE</div>
      </section>
      <section className="aog-home-panel aog-nation-panel aog-nation-ministers-panel aog-region-ministers-panel">
        <PanelHeading title="MINISTROS" icon="players"/>
        <div className="aog-nation-placeholder-body">PRÓXIMAMENTE</div>
      </section>
      <section className="aog-home-panel aog-nation-panel aog-region-nation-panel">
        <PanelHeading title="NACIÓN" icon="nation"/>
        <a className="aog-region-nation-link" href={`/nation?id=${region?.nation_id}`}>
          <Picture src={nationFlag} alt="Bandera nacional" className="aog-region-nation-flag" fallback={FLAG}/>
          <span className="aog-region-nation-name">{nationName || 'NACIÓN'}</span>
        </a>
      </section>
      <section className="aog-home-panel aog-nation-panel aog-nation-stats-panel aog-region-stats-panel">
        <PanelHeading title="ESTADÍSTICAS REGIONALES" icon="statistics"/>
        <div className="aog-nation-stats-body">
          <div className="aog-nation-stats-grid">
            {stats.map(([label, amount]) => <div className="aog-nation-stat-card" key={label}>
              <span className="aog-nation-stat-label">{label}</span><strong className="aog-nation-stat-value">{amount}</strong>
            </div>)}
          </div>
          <div className="aog-nation-date-row">
            <div className="aog-nation-date-card"><span>PRÓXIMAS GUBERNAMENTALES</span><strong>{dateLabel(nextGovernorElection?.voting_starts_at)}</strong></div>
            <div className="aog-nation-date-card"><span>PRÓXIMAS PARLAMENTARIAS</span><strong>—</strong></div>
          </div>
          <div className="aog-nation-stats-note">MÁS ESTADÍSTICAS PRÓXIMAMENTE</div>
        </div>
      </section>
      <section className="aog-home-panel aog-nation-panel aog-nation-history-panel aog-region-history-panel">
        <PanelHeading title="HISTORIAL REGIONAL" icon="news"/>
        <div className="aog-nation-placeholder-body">PRÓXIMAMENTE</div>
      </section>
      <AreaResourcesPanel scope="region" areaId={region?.id} />
    </div>
  </main>;
}
