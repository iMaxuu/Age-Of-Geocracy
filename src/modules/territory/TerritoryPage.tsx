import { useEffect, useState, useCallback, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { Player } from '../auth/player';
import { supabase } from '../../lib/supabase';
import type { ResourceName } from '../map/world';
import type { MapOwnership } from '../map/mapApi';
import { getResourceStatus, type ResourceStatus } from '../map/resourcesApi';
import '../home/home.css';
import './territory.css';

type Props = { player?: Player; onNavigate?: (path: string) => void };
type ResourceInfo = { key: ResourceName; name: string; icon: string; abbreviation: string; color: string };
type FoundationRequirement = { resource_code: string; required_amount: number; amount: number };
type FoundationStatus = {
  territory_id: number;
  independent: boolean;
  state: 'recruiting' | 'event_ready';
  outcome: 'ongoing' | 'failed' | 'succeeded';
  event_ready_at: string | null;
  deadline_at: string | null;
  cooldown_until: string | null;
  server_now: string;
  count: number;
  capacity: number;
  joined: boolean;
  cost: number;
  viewer_territory_id: number | null;
  viewer_gold: number | null;
  founders: { id: number; name: string; photo_url: string | null; joined_at: string }[];
  requirements: FoundationRequirement[];
  inventory: Record<string, number>;
  founded_nation_id: number | null;
  founded_region_id: number | null;
};

const EVENT_RESOURCES = [
  { key: 'wood', icon: 'wood', color: '#9b390f', title: 'MADERA' },
  { key: 'mineral', icon: 'ore', color: '#c8d2db', title: 'MINERAL' },
  { key: 'oil', icon: 'oil', color: '#846483', title: 'PETRÓLEO' },
  { key: 'diamond', icon: 'diamond', color: '#79b5e5', title: 'DIAMANTE' },
  { key: 'uranium', icon: 'uranium', color: '#159800', title: 'URANIO' },
  { key: 'gold', icon: 'gold', color: '#ffdf53', title: 'ORO' },
] as const;

function remainingTime(date: string | null, now: number) {
  if (!date) return '—';
  const delta = Math.max(0, Math.floor((new Date(date).getTime() - now) / 1000));
  const days = Math.floor(delta / 86400);
  const hours = Math.floor(delta / 3600) % 24;
  const mins = Math.floor(delta / 60) % 60;
  const secs = delta % 60;
  const part = [hours, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
  return days ? `${days}D ${part}` : part;
}
function shortDate(date: string | null) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date)).toUpperCase();
}


// Primera fila: madera, mineral, petróleo y oro. Segunda: diamante, uranio, geocracyum y aurexium.
const RESOURCES: ResourceInfo[] = [
  { key: 'wood', name: 'MADERA', icon: 'wood', abbreviation: 'MAD', color: '#9b390f' },
  { key: 'mineral', name: 'MINERAL', icon: 'ore', abbreviation: 'MIN', color: '#c8d2db' },
  { key: 'oil', name: 'PETRÓLEO', icon: 'oil', abbreviation: 'PET', color: '#846483' },
  { key: 'gold', name: 'ORO', icon: 'gold', abbreviation: 'ORO', color: '#ffdf53' },
  { key: 'diamond', name: 'DIAMANTE', icon: 'diamond', abbreviation: 'DIA', color: '#79b5e5' },
  { key: 'uranium', name: 'URANIO', icon: 'uranium', abbreviation: 'URA', color: '#159800' },
  { key: 'geocracyum', name: 'GEOCRACYUM', icon: 'geocracyum', abbreviation: 'GEO', color: '#ff50bd' },
  { key: 'aurexium', name: 'AUREXIUM', icon: 'aurexium', abbreviation: 'AUR', color: '#0647bd' },
];
const format = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

function territoryId(fallback?: number): number | null {
  const pathId = window.location.pathname.match(/^\/territory\/(\d+)/i)?.[1];
  const raw = new URLSearchParams(window.location.search).get('id') ?? pathId;
  const value = raw == null ? fallback : Number(raw);
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}
function flagUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^\/assets\/flags\/[a-z0-9-]+\.svg$/i.test(raw)) return raw;
  return /^[a-z]{2,3}(?:-[a-z]{2,3})?$/i.test(raw) ? `/assets/flags/${raw.toLowerCase()}.svg` : null;
}
function ResourceIcon({ name, abbreviation }: { name: string; abbreviation: string }) {
  const [missing, setMissing] = useState(false);
  return missing ? <span className="aog-territory-icon-fallback" aria-hidden="true">{abbreviation}</span>
    : <span className="aog-territory-resource-glyph" aria-hidden="true"
        style={{ WebkitMaskImage: `url(/assets/icons/${name}.svg)`, maskImage: `url(/assets/icons/${name}.svg)` }}>
        <img src={`/assets/icons/${name}.svg`} alt="" onError={() => setMissing(true)} />
      </span>;
}
function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`aog-territory-panel ${className}`}>
    <h2 className="aog-home-panel-title aog-territory-tab">{title}</h2>{children}
  </section>;
}
type PublicAuthority = {
  id: number;
  name: string;
  photo_url: string | null;
  country_code: string | null;
  political_ideology: string | null;
};

// Los nombres provisionales de la fundación no reemplazan los futuros nombres elegidos por jugadores.
function entityName(raw: string | null, id: number | null, kind: 'region' | 'nation'): string {
  if (!id) return kind === 'region' ? 'SIN REGIÓN' : 'SIN NACIÓN';
  const value = raw?.trim() || '';
  const placeholder = kind === 'region'
    ? /^(?:CAPITAL|REGI[ÓO]N|REGION)\s*#\s*\d+$/i
    : /^(?:NACI[ÓO]N|NATION)\s*#\s*\d+$/i;
  if (!value || placeholder.test(value) || /^(?:REGIÓN CAPITAL|NACIÓN EN ORGANIZACIÓN)$/i.test(value))
    return `${kind === 'region' ? 'REGION' : 'NATION'} #${id}`;
  return value;
}

async function publicAuthority(playerId: number | null): Promise<PublicAuthority | null> {
  if (!playerId) return null;
  const { data, error } = await supabase.rpc('aog_public_player_profile', { p_player_id: playerId });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || !('id' in data)) return null;
  const record = data as Record<string, unknown>;
  return {
    id: Number(record.id),
    name: typeof record.name === 'string' ? record.name : `JUGADOR #${playerId}`,
    photo_url: typeof record.photo_url === 'string' ? record.photo_url : null,
    country_code: typeof record.country_code === 'string' ? record.country_code : null,
    political_ideology: typeof record.political_ideology === 'string' ? record.political_ideology : null,
  };
}

function EntityPanel({ title, name, flag, id, path, onNavigate }: {
  title: string; name: string; flag: string | null; id: number | null; path: 'region' | 'nation'; onNavigate?: (path: string) => void;
}) {
  const image = flagUrl(flag) ?? '/assets/photos/noflag.png';
  const destination = id ? `/${path}?id=${id}` : null;
  const content = <>
    <img className="aog-territory-flag" src={image} alt="" onError={event => {
      if (!event.currentTarget.src.endsWith('/assets/photos/noflag.png'))
        event.currentTarget.src = '/assets/photos/noflag.png';
    }} />
    <strong>{name}</strong>
  </>;
  return <Panel title={title} className="aog-territory-entity">
    {destination ? <a className="aog-territory-entity-link" href={destination} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault(); onNavigate(destination);
    }}>{content}</a> : <div className="aog-territory-entity-link">{content}</div>}
  </Panel>;
}
function AuthorityPanel({ title, authority, onNavigate }: {
  title: 'PRESIDENTE' | 'GOBERNADOR'; authority: PublicAuthority | null; onNavigate?: (path: string) => void;
}) {
  const destination = authority ? `/profile/${authority.id}` : null;
  const image = authority?.photo_url || '/assets/photos/nouser.png';
  const countryFlag = authority?.country_code ? flagUrl(authority.country_code) : null;
  const content = <>
    <img className="aog-territory-authority-photo" src={image} alt="" onError={event => {
      if (!event.currentTarget.src.endsWith('/assets/photos/nouser.png'))
        event.currentTarget.src = '/assets/photos/nouser.png';
    }} />
    <div className="aog-territory-authority-description">
      <strong>{authority?.name ?? 'VACANTE'}</strong>
      {authority?.political_ideology && <span>{authority.political_ideology.toUpperCase()}</span>}
      {countryFlag && <img className="aog-territory-authority-flag" src={countryFlag} alt="" />}
    </div>
  </>;
  return <Panel title={title} className="aog-territory-authority">
    {destination ? <a className="aog-territory-authority-link" href={destination} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault(); onNavigate(destination);
    }}>{content}</a> : <div className="aog-territory-authority-link">{content}</div>}
  </Panel>;
}

function IndependentFoundation({ territory, onFounded }: { territory: number; onFounded: () => void }) {
  const [status, setStatus] = useState<FoundationStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [resource, setResource] = useState<string>('wood');
  const [amount, setAmount] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(async () => {
    const { data, error: fetchError } = await supabase.rpc('aog_foundation_status', { p_territory_id: territory });
    if (fetchError) setError(`No se pudo cargar la fundación: ${fetchError.message}`);
    else {
      const next = data as FoundationStatus;
      setStatus(next); setError('');
      if (next.outcome === 'succeeded') onFounded();
    }
    setFetching(false);
  }, [territory, onFounded]);
  useEffect(() => {
    setFetching(true); setStatus(null); setError(''); setModalOpen(false);
    void refresh();
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => { window.clearInterval(poll); window.clearInterval(clock); window.removeEventListener('focus', focus); };
  }, [refresh]);
  useEffect(() => {
    if (!modalOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setModalOpen(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [modalOpen]);

  const call = async (name: string, params: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc(name, params);
      if (rpcError) throw new Error(rpcError.message);
      const next = data as FoundationStatus;
      setStatus(next);
      if (next.outcome === 'succeeded') { setModalOpen(false); onFounded(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };
  const count = Math.min(3, Math.max(0, status?.count ?? 0));
  const ready = status?.state === 'event_ready' && status.outcome === 'ongoing';
  const failed = status?.outcome === 'failed';
  const joined = !!status?.joined;
  const inTerritory = status?.viewer_territory_id === territory;
  const canJoin = !busy && !fetching && !!status && !ready && !failed && count < 3 &&
    inTerritory && (status.viewer_gold ?? 0) >= 1000;
  const requirements = EVENT_RESOURCES.map(r => ({ ...r,
    required_amount: Number(status?.requirements?.find(v => v.resource_code === r.key)?.required_amount ?? 0),
    amount: Number(status?.requirements?.find(v => v.resource_code === r.key)?.amount ?? 0),
    available: Number(status?.inventory?.[r.key] ?? 0),
  }));
  const percentage = requirements.length && requirements.every(r => r.required_amount > 0)
    ? Math.min(100, Math.floor(requirements.reduce((sum, r) => sum +
        Math.min(1, r.amount / r.required_amount), 0) / requirements.length * 100)) : 0;
  const selected = requirements.find(r => r.key === resource) ?? requirements[0];
  const maxDonation = selected ? Math.max(0, Math.min(selected.available, selected.required_amount - selected.amount)) : 0;
  const parsedAmount = Number(amount);
  const canDonate = !busy && ready && inTerritory && Number.isSafeInteger(parsedAmount) &&
    parsedAmount > 0 && parsedAmount <= maxDonation;

  if (ready || failed) return <div className="aog-foundation aog-foundation-event">
    <div className="aog-foundation-grid aog-foundation-event-top">
      <Panel title={failed ? 'PRÓXIMO INTENTO' : 'TIEMPO RESTANTE'} className="aog-foundation-timer">
        <strong>{remainingTime(failed ? status?.cooldown_until ?? null : status?.deadline_at ?? null, now)}</strong>
        <span>{failed ? 'DISPONIBLE ' + shortDate(status?.cooldown_until ?? null) :
          'EL EVENTO TERMINA EL ' + shortDate(status?.deadline_at ?? null)}</span>
      </Panel>
      <section className="aog-territory-panel aog-foundation-action">
        <button type="button" className="aog-foundation-button" disabled={!ready || !inTerritory || busy}
          onClick={() => { setResource('wood'); setAmount(''); setModalOpen(true); }}>
          {failed ? 'FUNDACIÓN NO COMPLETADA' : 'APORTAR RECURSOS'}
        </button>
        {!inTerritory && ready && <p className="aog-foundation-explanation">Solo pueden aportar jugadores presentes en el territorio.</p>}
        {failed && <p className="aog-foundation-explanation">No se alcanzó el 100% antes de las 24 horas. Podrán volver a intentarlo después de 7 días.</p>}
      </section>
    </div>
    <div className="aog-foundation-progress" role="progressbar" aria-label="Progreso de fundación"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
      <div className="aog-foundation-progress-fill" style={{ width: `${percentage}%` }} />
      <strong>{percentage}%</strong>
    </div>
    <div className="aog-foundation-event-resources">{requirements.map(r =>
      <section className="aog-territory-panel aog-territory-resource" key={r.key}
        style={{ '--resource-color': r.color, '--home-accent': r.color } as CSSProperties}
        title={r.title}>
        <h3 className="aog-home-panel-title aog-territory-resource-tab" aria-label={r.title}>
          <ResourceIcon name={r.icon} abbreviation={r.title.slice(0, 3)} />
        </h3><strong>{format.format(r.amount)}/{format.format(r.required_amount)}</strong>
      </section>)}</div>
    {modalOpen && <div className="aog-foundation-modal-backdrop" onMouseDown={e => {
      if (e.target === e.currentTarget) setModalOpen(false);
    }}>
      <section className="aog-foundation-modal" role="dialog" aria-modal="true" aria-label="Aportar recursos">
        <button type="button" className="aog-foundation-modal-close" aria-label="Cerrar" onClick={() => setModalOpen(false)}>×</button>
        <h2>APORTAR RECURSOS</h2>
        <label htmlFor="aog-foundation-resource">RECURSO</label>
        <select id="aog-foundation-resource" value={resource} onChange={e => { setResource(e.target.value); setAmount(''); }}>
          {requirements.map(r => <option key={r.key} value={r.key}>{r.title}</option>)}
        </select>
        <p>ALMACÉN: {format.format(selected?.available ?? 0)}</p>
        <p>FALTAN: {format.format(Math.max(0,(selected?.required_amount ?? 0) - (selected?.amount ?? 0)))}</p>
        <label htmlFor="aog-foundation-amount">CANTIDAD</label>
        <input id="aog-foundation-amount" type="number" min="1" max={maxDonation} step="1"
          value={amount} placeholder="0" onChange={e => setAmount(e.target.value)} />
        <button type="button" className="aog-foundation-button" disabled={!canDonate} onClick={() => void call('aog_foundation_donate',
          { p_territory_id: territory, p_resource_code: resource, p_amount: parsedAmount }).then(() => setAmount(''))}>
          CONFIRMAR APORTE
        </button>
        {maxDonation === 0 && <p className="aog-foundation-modal-note">No tenés recursos disponibles de este tipo en el Almacén. Su obtención y gestión se incorporarán en el siguiente módulo.</p>}
        <p className="aog-foundation-modal-note">Los aportes son definitivos y no se devuelven si el evento fracasa.</p>
      </section>
    </div>}
    {error && <p className="aog-foundation-error" role="alert">{error}</p>}
  </div>;

  if (status?.outcome === 'succeeded') return <div className="aog-foundation-ready-inline">¡NACIÓN FUNDADA!</div>;
  return <div className="aog-foundation">
    <section className="aog-territory-panel aog-foundation-info" aria-label="Información de la fundación">
      <span className="aog-foundation-emblem" aria-hidden="true" />
      <p>Los jugadores podrán fundar una nueva Nación desde un territorio independiente. La fundación requerirá la participación y cooperación de varios jugadores y dará inicio a un evento de fundación.<br />
        Si el proceso tiene éxito, el territorio se convertirá en el punto de partida de una nueva Nación, comenzando posteriormente su organización política y sus primeras elecciones.</p>
    </section>
    <div className="aog-foundation-grid">
      <Panel title="FUNDADORES" className="aog-foundation-count">
        <strong aria-live="polite">{fetching ? '—' : `${count}/3`}</strong>
      </Panel>
      <section className="aog-territory-panel aog-foundation-action">
        {joined ? <button type="button" className="aog-foundation-button aog-foundation-leave" disabled={busy}
            onClick={() => void call('aog_foundation_leave', { p_territory_id: territory })}>ABANDONAR FUNDACIÓN</button>
        : <button type="button" className="aog-foundation-button" disabled={!canJoin}
            onClick={() => void call('aog_foundation_join', { p_territory_id: territory })}>UNIRSE <span>G 1.000</span></button>}
        <p className="aog-foundation-explanation">Si abandonás el territorio antes de reunir tres fundadores, perderás tu puesto y los 1.000 G aportados no serán devueltos.</p>
      </section>
    </div>
    {!fetching && !joined && !inTerritory && <p className="aog-foundation-message">Para unirte, primero debés viajar a este territorio.</p>}
    {!fetching && !joined && inTerritory && (status?.viewer_gold ?? 0) < 1000 &&
      <p className="aog-foundation-message">Necesitás 1.000 G para unirte.</p>}
    {error && <p className="aog-foundation-error" role="alert">{error}</p>}
  </div>;
}

export default function TerritoryPage({ player, onNavigate }: Props) {
  const id = territoryId(player?.territoryId);
  const [ownership, setOwnership] = useState<MapOwnership | null>(null);
  const [ownershipLoaded, setOwnershipLoaded] = useState(false);
  const [isCapital, setIsCapital] = useState(false);
  const [president, setPresident] = useState<PublicAuthority | null>(null);
  const [governor, setGovernor] = useState<PublicAuthority | null>(null);
  const [players, setPlayers] = useState<number | null>(null);
  const [partyCount, setPartyCount] = useState<number | null>(null);
  const [resources, setResources] = useState<Map<ResourceName, ResourceStatus> | null>(null);
  const [resourceError, setResourceError] = useState('');
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  useEffect(() => {
    let active = true;
    setOwnership(null); setOwnershipLoaded(false); setIsCapital(false); setPresident(null); setGovernor(null);
    setPlayers(null); setPartyCount(null); setLoading(true); setWarning('');
    if (!id) { setLoading(false); return; }
    const load = async () => {
      const results = await Promise.allSettled([
        (async () => {
          const { data, error } = await supabase.from('map_territory_politics')
            .select('territory_id,region_id,nation_id,region_name,nation_name,region_flag,nation_flag,color')
            .eq('territory_id', id).maybeSingle();
          if (error) throw Error(error.message);
          let capital = false;
          let governorId: number | null = null;
          let presidentId: number | null = null;
          // La capital carece de gobernador. Las regiones comunes sí pueden tenerlo.
          const [regionResult, nationResult] = await Promise.all([
            data?.region_id
              ? supabase.from('aog_founded_regions').select('is_capital,governor_id')
                  .eq('id', data.region_id).maybeSingle()
              : Promise.resolve(null),
            data?.nation_id
              ? supabase.from('aog_founded_nations').select('capital_region_id,president_id')
                  .eq('id', data.nation_id).maybeSingle()
              : Promise.resolve(null),
          ]);
          if (regionResult && !regionResult.error && regionResult.data) {
            capital = regionResult.data.is_capital === true;
            governorId = regionResult.data.governor_id ?? null;
          }
          if (nationResult && !nationResult.error && nationResult.data) {
            if (data?.region_id && nationResult.data.capital_region_id === data.region_id) capital = true;
            presidentId = nationResult.data.president_id ?? null;
          }
          const [nextGovernor, nextPresident] = await Promise.all([
            !capital && governorId ? publicAuthority(governorId) : Promise.resolve(null),
            presidentId ? publicAuthority(presidentId) : Promise.resolve(null),
          ]);
          if (active) {
            setOwnership(data as MapOwnership | null);
            setIsCapital(capital);
            setGovernor(nextGovernor);
            setPresident(nextPresident);
            setOwnershipLoaded(true);
          }

        })(),
        (async () => {
          const { data, error } = await supabase.rpc('aog_party_count_territory', { p_territory_id: id });
          if (error) throw Error(`Partidos: ${error.message}`);
          if (active) setPartyCount(Number(data ?? 0));
        })(),
        (async () => {
          const { count, error } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('territory_id', id);
          if (error) throw Error(error.message);
          if (active) setPlayers(count);
        })(),
      ]);
      if (!active) return;
      const failures = results.flatMap((result, index) => result.status === 'rejected'
        ? [`${['Información política', 'Partidos', 'Jugadores'][index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`] : []);
      if (failures.length) { console.error('Error al cargar Territory:', failures); setWarning(`No se pudieron consultar: ${failures.map(s => s.split(':')[0]).join(', ')}.`); }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    setResources(null); setResourceError('');
    if (!id) return;
    const refresh = async () => {
      try {
        const result = await getResourceStatus(id);
        if (active) { setResources(result); setResourceError(''); }
      } catch (error) {
        if (active) setResourceError(`No se pudo consultar el stock real: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [id]);

  const handleFounded = useCallback(() => {
    // Una vez que Supabase asigna región y nación, recargar la vista política.
    window.location.reload();
  }, []);

  const independent = ownershipLoaded && !ownership?.region_id && !ownership?.nation_id;

  if (!id) return <main className="aog-territory-page"><h1>SELECCIONÁ UN TERRITORIO</h1></main>;
  return <main className="aog-territory-page"><div className="aog-territory-container">
    <h1 className="aog-territory-heading">TERRITORIO #{format.format(id)}</h1>
    {warning && <p className="aog-territory-warning" role="status">{warning}</p>}
    {independent ? <IndependentFoundation territory={id} onFounded={handleFounded} /> : <div className="aog-territory-pair">
      <div className="aog-territory-political-column">
        <EntityPanel title="REGIÓN" name={entityName(ownership?.region_name ?? null, ownership?.region_id ?? null, 'region')}
          flag={ownership?.region_flag ?? null} id={ownership?.region_id ?? null} path="region" onNavigate={onNavigate} />
        {ownership?.region_id && isCapital && <Panel title="CAPITAL" className="aog-territory-capital"><span aria-label="Región capital" role="img">★</span></Panel>}
        {ownership?.region_id && !isCapital && <AuthorityPanel title="GOBERNADOR" authority={governor} onNavigate={onNavigate} />}
      </div>
      <div className="aog-territory-political-column">
        <EntityPanel title="NACIÓN" name={entityName(ownership?.nation_name ?? null, ownership?.nation_id ?? null, 'nation')}
          flag={ownership?.nation_flag ?? null} id={ownership?.nation_id ?? null} path="nation" onNavigate={onNavigate} />
        {ownership?.nation_id && <AuthorityPanel title="PRESIDENTE" authority={president} onNavigate={onNavigate} />}
      </div>
    </div>}
    <section className="aog-territory-section" aria-label="Datos del territorio">
      <h2 className="aog-territory-section-title">DATOS</h2>
      <div className="aog-territory-stats">{[
        { name: 'JUGADORES', value: players === null ? '—' : format.format(players) },
        { name: 'PARTIDOS', value: partyCount === null ? '—' : format.format(partyCount) }, { name: 'CLUBES', value: '—' }, { name: 'TEMPERATURA', value: '—' },
      ].map(stat => <Panel key={stat.name} title={stat.name} className="aog-territory-stat"><strong>{stat.value}</strong></Panel>)}</div>
    </section>
    <section className="aog-territory-section aog-territory-resources-section" aria-label="Recursos naturales del territorio">
      <h2 className="aog-territory-section-title">RECURSOS</h2>
      {resourceError && <p className="aog-territory-warning" role="alert">{resourceError}</p>}
      <div className="aog-territory-resources">{RESOURCES.map(resource => {
        const entry = resources?.get(resource.key);
        const maximum = entry?.max_amount ?? null;
        const amount = entry?.current_amount ?? null;
        const display = (n: number | null) => n === null ? '—' : n >= 100000 ? compact.format(n) : format.format(n);
        const value = `${display(amount)} / ${display(maximum)}`;
        return <section key={resource.key} className="aog-territory-panel aog-territory-resource"
          style={{ '--resource-color': resource.color, '--home-accent': resource.color } as CSSProperties}
          title={`${resource.name}: ${amount === null ? 'consultando disponibilidad' : format.format(amount)} disponible de ${maximum === null ? '—' : format.format(maximum)}.`}>
          <h3 className="aog-home-panel-title aog-territory-resource-tab" aria-label={resource.name}>
            <ResourceIcon name={resource.icon} abbreviation={resource.abbreviation} />
          </h3><strong>{value}</strong>
        </section>;
      })}</div>
    </section>
  </div></main>;
}
