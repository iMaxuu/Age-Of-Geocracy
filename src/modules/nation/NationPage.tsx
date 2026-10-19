import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AreaResourcesPanel from '../shared/AreaResourcesPanel';
import '../home/home.css';
import './nation.css';

type Nation = {
  id: number;
  name: string | null;
  capital_region_id: number | null;
  founding_territory_id: number;
  president_id?: number | null;
  vice_president_id?: number | null;
  flag_url?: string | null;
  created_at?: string | null;
};

type Official = {
  id: number;
  name: string;
  photo_url: string | null;
  country_code?: string | null;
  political_ideology?: string | null;
  party_name?: string | null;
  coalition_name?: string | null;
};

type PublicAffiliations = { party_id?: number | null; party_name?: string | null };
type PublicCoalition = { name?: string | null };

type Region = {
  id: number;
  name: string | null;
  is_capital: boolean;
  founding_territory_id: number;
  count: number;
  flag_url?: string | null;
};

type ElectionSummary = {
  id: number;
  stage: 'PRE' | 'CURSO' | 'POST';
  pre_starts_at: string;
  voting_starts_at: string;
  voting_ends_at: string;
  completed_at: string | null;
};

type GovernorElection = {
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

function electionIsCurrent(item: GovernorElection, now: number) {
  const begin = new Date(item.pre_starts_at).getTime();
  const end = new Date(item.voting_ends_at).getTime();
  return Number.isFinite(begin) && Number.isFinite(end) && begin <= now && now < end && !item.completed_at;
}

const FLAG = '/assets/photos/noflag.png';
const PHOTO = '/assets/photos/nouser.png';

const dateLabel = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

const longDateLabel = (value?: string | null) =>
  value
    ? new Date(value)
        .toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
        .toUpperCase()
    : '—';

function remaining(until: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days ? `${days}D ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const homeIcon = (name: string) => `/assets/icons/icons/${name}.svg?v=0.0.3-custom-2`;
function HomeIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span
      className={`aog-home-icon ${className}`}
      style={{ maskImage: `url(${homeIcon(name)})`, WebkitMaskImage: `url(${homeIcon(name)})` }}
      aria-hidden="true"
    />
  );
}

function PanelHeading({ title, icon }: { title: string; icon: string }) {
  return (
    <h2 className="aog-home-panel-heading aog-nation-heading">
      <span className="aog-home-heading-tab">
        <HomeIcon name={icon} />
        <span>{title}</span>
      </span>
    </h2>
  );
}

function Picture({ src, alt, cls }: { src?: string | null; alt: string; cls: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <img
      className={cls}
      src={!failed && src ? src : cls.includes('avatar') ? PHOTO : FLAG}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}

function InfoLine({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="aog-nation-info-line">
      <HomeIcon name={icon} />
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
    </div>
  );
}

function EventMiniCard({ event, now }: { event: DisplayElection; now: number }) {
  const inVoting = now >= new Date(event.voting_starts_at).getTime();
  return (
    <a className="aog-nation-event-mini" href={event.href}>
      <span className="aog-nation-event-mini-title">{event.title}</span>
      <small>{inVoting ? 'EN VOTACIÓN' : 'EN PREPARACIÓN'}</small>
      <strong>{remaining(inVoting ? event.voting_ends_at : event.voting_starts_at, now)}</strong>
    </a>
  );
}

function OfficialColumn({ person, role, loading, error }: { person: Official | null; role: string; loading: boolean; error: boolean }) {
  return (
    <div className="aog-nation-government-column">
      <div className="aog-nation-government-role">{role}</div>
      {loading ? (
        <div className="aog-nation-government-empty">CARGANDO</div>
      ) : error ? (
        <div className="aog-nation-government-empty">NO DISPONIBLE</div>
      ) : person ? (
        <>
          <a className="aog-nation-government-photo-link" href={`/profile/${person.id}`} aria-label={`Abrir perfil de ${person.name}`}>
            <Picture cls="aog-nation-government-avatar" src={person.photo_url} alt={person.name} />
          </a>
          <span className="aog-nation-government-name">{person.name}</span>
          <div className="aog-nation-government-party">{person.party_name ? person.party_name : 'SIN PARTIDO'}</div>
          <div className="aog-nation-government-coalition">{person.coalition_name ? person.coalition_name : 'SIN COALICIÓN'}</div>
        </>
      ) : (
        <div className="aog-nation-government-empty">VACANTE</div>
      )}
    </div>
  );
}

export default function NationPage() {
  const [nation, setNation] = useState<Nation | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [status, setStatus] = useState('CARGANDO NACIÓN...');
  const [president, setPresident] = useState<Official | null>(null);
  const [vicePresident, setVicePresident] = useState<Official | null>(null);
  const [presidentState, setPresidentState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [vicePresidentState, setVicePresidentState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [census, setCensus] = useState<{ players_count: number; citizens_count: number } | null>(null);
  const [censusReady, setCensusReady] = useState(false);
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [electionsError, setElectionsError] = useState(false);
  const [governorElections, setGovernorElections] = useState<{ regionId: number; regionName: string; election: GovernorElection }[]>([]);
  const [governorElectionsLoading, setGovernorElectionsLoading] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!nation?.id) return;
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('aog_nation_election_summaries', { p_nation_id: nation.id });
      if (!active) return;
      setElectionsLoading(false);
      if (error) {
        console.warn('No se pudieron obtener las elecciones nacionales:', error);
        setElectionsError(true);
        return;
      }
      setElectionsError(false);
      setElections((Array.isArray(data) ? data : []) as ElectionSummary[]);
    };
    setElectionsLoading(true);
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [nation?.id]);

  // Solo se muestran elecciones regionales realmente registradas en Supabase.
  // La capital no tiene elección de gobernador mientras permanezca administrada por la Nación.
  useEffect(() => {
    let active = true;
    const eligibleRegions = regions.filter(region => !region.is_capital && region.id !== nation?.capital_region_id);
    if (!nation?.id || !eligibleRegions.length) {
      setGovernorElections([]);
      setGovernorElectionsLoading(false);
      return;
    }
    const load = async () => {
      const results = await Promise.all(eligibleRegions.map(async region => {
        const { data, error } = await supabase.rpc('aog_governor_region_elections', { p_region_id: region.id });
        if (error) {
          console.warn(`No se pudieron cargar las elecciones de la región #${region.id}:`, error);
          return [];
        }
        return (Array.isArray(data) ? data : []).map(election => ({
          regionId: region.id,
          regionName: region.name || `REGIÓN #${region.id}`,
          election: election as GovernorElection,
        }));
      }));
      if (active) {
        setGovernorElections(results.flat());
        setGovernorElectionsLoading(false);
      }
    };
    setGovernorElectionsLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [nation?.id, nation?.capital_region_id, regions]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const param = new URLSearchParams(window.location.search).get('id');
        let id = param && /^\d+$/.test(param) ? Number(param) : null;
        if (!id) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw Error('INICIÁ SESIÓN PARA VER TU NACIÓN');
          const { data: player, error: ep } = await supabase.from('players').select('territory_id').eq('auth_id', user.id).single();
          if (ep) throw ep;
          const { data: politics, error: eo } = await supabase
            .from('map_territory_politics')
            .select('nation_id')
            .eq('territory_id', player?.territory_id)
            .maybeSingle();
          if (eo) throw eo;
          id = politics?.nation_id ?? null;
        }
        if (!id) {
          if (live) setStatus('TU TERRITORIO NO PERTENECE A UNA NACIÓN');
          return;
        }
        const { data: n, error: en } = await supabase.from('aog_founded_nations').select('*').eq('id', id).maybeSingle();
        if (en) throw en;
        if (!n) {
          if (live) setStatus('NACIÓN NO ENCONTRADA');
          return;
        }
        if (live) {
          setNation(n as Nation);
          setStatus('');
        }

        const { data: list, error: er } = await supabase
          .from('aog_founded_regions')
          .select('id,name,is_capital,founding_territory_id')
          .eq('nation_id', id)
          .order('id');
        if (er) throw er;
        const arr = await Promise.all(
          (list ?? []).map(async (r) => {
            const { count, error } = await supabase
              .from('map_territory_politics')
              .select('territory_id', { count: 'exact', head: true })
              .eq('nation_id', id)
              .eq('region_id', r.id);
            return { ...r, count: error ? 0 : count ?? 0 } as Region;
          }),
        );
        if (live) setRegions(arr.sort((a, b) => Number(b.is_capital) - Number(a.is_capital) || a.id - b.id));

        const loadOfficial = async (playerId: number | null | undefined): Promise<Official | null> => {
          if (!playerId) return null;
          const { data: p, error: playerError } = await supabase
            .from('players')
            .select('id,name,photo_url,country_code,political_ideology')
            .eq('id', playerId)
            .maybeSingle();
          if (playerError) throw playerError;
          if (!p) return null;
          const official: Official = { ...p };
          const { data: profile, error: profileError } = await supabase.rpc('aog_public_player_profile', { p_player_id: p.id });
          if (profileError) {
            console.warn('No se pudieron cargar las afiliaciones públicas de la autoridad:', profileError);
          } else if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
            const membership = profile as PublicAffiliations;
            official.party_name = membership.party_name ?? null;
            if (membership.party_id) {
              const { data: coalition, error: coalitionError } = await supabase.rpc('aog_coalition_for_party', { p_party_id: membership.party_id });
              if (coalitionError) {
                console.warn('No se pudo cargar la coalición de la autoridad:', coalitionError);
              } else if (coalition && typeof coalition === 'object' && !Array.isArray(coalition)) {
                official.coalition_name = (coalition as PublicCoalition).name ?? null;
              }
            } else {
              official.coalition_name = null;
            }
          }
          return official;
        };

        const [loadedPresident, loadedVice] = await Promise.allSettled([loadOfficial(n.president_id), loadOfficial(n.vice_president_id)]);
        if (live) {
          if (loadedPresident.status === 'fulfilled') {
            setPresident(loadedPresident.value);
            setPresidentState('ready');
          } else {
            console.error('No se pudo cargar al presidente:', loadedPresident.reason);
            setPresident(null);
            setPresidentState('error');
          }

          if (loadedVice.status === 'fulfilled') {
            setVicePresident(loadedVice.value);
            setVicePresidentState('ready');
          } else {
            console.error('No se pudo cargar al vicepresidente:', loadedVice.reason);
            setVicePresident(null);
            setVicePresidentState('error');
          }
        }
      } catch (err) {
        if (live) {
          setStatus(`NO SE PUDO CARGAR NACIÓN: ${err instanceof Error ? err.message : 'ERROR'}`);
          setPresidentState('error');
          setVicePresidentState('error');
        }
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const nationId = nation?.id;
    if (!nationId) return;
    let active = true;
    setCensus(null);
    setCensusReady(false);
    const loadCensus = async () => {
      const { data, error } = await supabase.rpc('aog_nation_population', { p_nation_id: nationId });
      if (!active) return;
      setCensusReady(true);
      if (error) {
        console.warn('No se pudo consultar el censo nacional:', error);
        setCensus(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row && Number.isFinite(Number(row.players_count)) && Number.isFinite(Number(row.citizens_count))) {
        setCensus({ players_count: Number(row.players_count), citizens_count: Number(row.citizens_count) });
      } else setCensus(null);
    };
    void loadCensus();
    const timer = window.setInterval(() => {
      void loadCensus();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [nation?.id]);

  const capitalRegion = regions.find((r) => r.is_capital || r.id === nation?.capital_region_id);
  const totalTerritories = useMemo(() => regions.reduce((total, r) => total + r.count, 0), [regions]);
  const lastElection = [...elections]
    .filter((e) => e.stage === 'POST' || Boolean(e.completed_at))
    .sort((a, b) => new Date(b.voting_ends_at).getTime() - new Date(a.voting_ends_at).getTime())[0];
  const upcomingElection = [...elections]
    .filter((e) => e.stage !== 'POST' && !e.completed_at && new Date(e.voting_ends_at).getTime() > now)
    .sort((a, b) => new Date(a.voting_starts_at).getTime() - new Date(b.voting_starts_at).getTime())[0];
  const currentEvents: DisplayElection[] = [
    ...elections.filter(item => electionIsCurrent(item, now)).map(item => ({
      key: `presidential-${item.id}`,
      heading: 'ELECCIONES NACIONALES',
      subtitle: nation?.name || `NACIÓN #${nation?.id}`,
      title: 'PRESIDENCIALES',
      href: `/election?id=${item.id}`,
      voting_starts_at: item.voting_starts_at,
      voting_ends_at: item.voting_ends_at,
    })),
    ...governorElections.filter(({ election }) => electionIsCurrent(election, now)).map(({ regionId, regionName, election }) => ({
      key: `governor-${regionId}-${election.id}`,
      heading: 'ELECCIONES REGIONALES',
      subtitle: regionName,
      title: 'GUBERNAMENTALES',
      href: `/election?type=governor&id=${election.id}`,
      voting_starts_at: election.voting_starts_at,
      voting_ends_at: election.voting_ends_at,
    })),
  ].sort((a, b) => new Date(a.voting_ends_at).getTime() - new Date(b.voting_ends_at).getTime());
  const visibleEvents = eventsExpanded ? currentEvents : currentEvents.slice(0, 3);
  const extraEvents = currentEvents.length - 3;

  const stats = [
    ['JUGADORES', census ? String(census.players_count) : censusReady ? '—' : '...'],
    ['CIUDADANOS', census ? String(census.citizens_count) : censusReady ? '—' : '...'],
    ['REGIONES', String(regions.length)],
    ['TERRITORIOS', String(totalTerritories)],
    ['PARTIDOS', '—'],
    ['CLUBES', '—'],
  ];

  const navigateRegion = (id: number) => {
    window.location.href = `/region?id=${id}`;
  };

  if (status && !nation) {
    return (
      <main className="aog-nation-page aog-nation-sketch">
        <p className="aog-nation-status">{status}</p>
      </main>
    );
  }

  return (
    <main className="aog-nation-page aog-nation-sketch">
      <div className="aog-nation-grid">
        <section className="aog-home-panel aog-nation-panel aog-nation-summary-panel">
          <PanelHeading title="NACION" icon="nation" />
          <div className="aog-nation-summary-body">
            <div className="aog-nation-summary-flagbox">
              <Picture cls="aog-nation-summary-flag" src={nation?.flag_url} alt={nation?.name || 'Bandera nacional'} />
              <div className="aog-nation-summary-name">{nation?.name || `NACION #${nation?.id}`}</div>
            </div>
            <div className="aog-nation-summary-divider" />
            <div className="aog-nation-summary-info">
              <InfoLine icon="location" label="CAPITAL" value={capitalRegion?.name || '—'} />
              <InfoLine icon="foundation" label="FUNDADO" value={longDateLabel(nation?.created_at)} />
              <InfoLine icon="players" label="CIUDADANOS" value={census ? String(census.citizens_count) : censusReady ? '—' : '...'} />
            </div>
          </div>
        </section>

        <section className="aog-home-panel aog-nation-panel aog-nation-events-panel">
          <PanelHeading title="EVENTOS ACTUALES" icon="events" />
          <div className="aog-nation-events-body">
            {electionsLoading || governorElectionsLoading ? (
              <div className="aog-nation-events-empty">CARGANDO ELECCIONES...</div>
            ) : currentEvents.length === 0 ? (
              <div className="aog-nation-events-empty">
                {electionsError ? 'NO SE PUDIERON CARGAR LAS ELECCIONES NACIONALES' : 'SIN EVENTOS ACTUALES'}
              </div>
            ) : (
              visibleEvents.map(event => (
                <div className="aog-nation-event-block" key={event.key}>
                  <div className="aog-nation-event-title">{event.heading}</div>
                  <div className="aog-nation-event-subtitle">{event.subtitle}</div>
                  <div className="aog-nation-event-mini-grid">
                    <EventMiniCard event={event} now={now} />
                  </div>
                </div>
              ))
            )}
            {extraEvents > 0 && (
              <button className="aog-nation-events-more" type="button" onClick={() => setEventsExpanded(value => !value)}>
                {eventsExpanded ? 'VER MENOS' : `VER ${extraEvents} MÁS`}
              </button>
            )}
          </div>
        </section>

        <section className="aog-home-panel aog-nation-panel aog-nation-government-panel">
          <PanelHeading title="GOBIERNO" icon="players" />
          <div className="aog-nation-government-body">
            <OfficialColumn person={president} role="PRESIDENTE" loading={presidentState === 'loading'} error={presidentState === 'error'} />
            <div className="aog-nation-government-splitter" />
            <OfficialColumn person={vicePresident} role="VICEPRESIDENTE" loading={vicePresidentState === 'loading'} error={vicePresidentState === 'error'} />
          </div>
        </section>

        <section className="aog-home-panel aog-nation-panel aog-nation-parliament-panel">
          <PanelHeading title="PARLAMENTO" icon="parliaments" />
          <div className="aog-nation-placeholder-body">PROXIMAMENTE</div>
        </section>

        <section className="aog-home-panel aog-nation-panel aog-nation-ministers-panel">
          <PanelHeading title="MINISTROS" icon="players" />
          <div className="aog-nation-placeholder-body">PROXIMAMENTE</div>
        </section>

        <section className="aog-home-panel aog-nation-panel aog-nation-laws-panel">
          <PanelHeading title="INSTITUCIONES Y LEYES" icon="organizations" />
          <div className="aog-nation-placeholder-body">PROXIMAMENTE</div>
        </section>

        <section className="aog-home-panel aog-nation-panel aog-nation-stats-panel">
          <PanelHeading title="ESTADISTICAS NACIONALES" icon="statistics" />
          <div className="aog-nation-stats-body">
            <div className="aog-nation-stats-grid">
              {stats.map(([label, value]) => (
                <div className="aog-nation-stat-card" key={label}>
                  <span className="aog-nation-stat-label">{label}</span>
                  <strong className="aog-nation-stat-value">{value}</strong>
                </div>
              ))}
            </div>
            <div className="aog-nation-date-row">
              <div className="aog-nation-date-card">
                <span>PROXIMAS PRESIDENCIALES</span>
                <strong>{dateLabel(upcomingElection?.voting_starts_at)}</strong>
              </div>
              <div className="aog-nation-date-card">
                <span>PROXIMAS PARLAMENTARIAS</span>
                <strong>PRÓXIMAMENTE</strong>
              </div>
            </div>
            <div className="aog-nation-stats-note">MAS ESTADISTICAS PROXIMAMENTE</div>
          </div>
        </section>

        <section className="aog-home-panel aog-nation-panel aog-nation-history-panel">
          <PanelHeading title="HISTORIAL NACIONAL" icon="news" />
          <div className="aog-nation-placeholder-body">PROXIMAMENTE</div>
        </section>

        <AreaResourcesPanel scope="nation" areaId={nation?.id} />

        <section className="aog-home-panel aog-nation-panel aog-nation-regions-panel">
          <PanelHeading title="REGIONES" icon="region" />
          <div className="aog-nation-regions-body">
            <div className="aog-nation-regions-grid">
              {regions.length ? (
                regions.slice(0, 6).map((region) => (
                  <button type="button" className="aog-nation-region-card" key={region.id} onClick={() => navigateRegion(region.id)}>
                    <Picture cls="aog-nation-region-flag" src={region.flag_url} alt={region.name || `Región #${region.id}`} />
                    <div className="aog-nation-region-name">{region.name || `REGION #${region.id}`}</div>
                    <div className="aog-nation-region-type">{region.is_capital ? 'CAPITAL' : 'REGION'}</div>
                  </button>
                ))
              ) : (
                <div className="aog-nation-regions-empty">SIN REGIONES</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
