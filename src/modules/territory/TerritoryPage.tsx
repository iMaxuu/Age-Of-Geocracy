import { useEffect, useState, useCallback, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { Player } from '../auth/player';
import { supabase } from '../../lib/supabase';
import type { ResourceName } from '../map/world';
import type { MapOwnership } from '../map/mapApi';
import { getResourceStatus, type ResourceStatus } from '../map/resourcesApi';
import '../home/home.css';
import IndependentFoundation from './IndependentFoundation';
import './territory.css';

type Props = { player?: Player; onNavigate?: (path: string) => void };
type ResourceInfo = { key: ResourceName; name: string; icon: string; abbreviation: string; color: string };
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
  party_name: string | null;
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
    party_name: typeof record.party_name === 'string' ? record.party_name : null,
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
  const blocks = [
    {kind: 'NACIÓN', name: entityName(ownership?.nation_name ?? null, ownership?.nation_id ?? null, 'nation'),
      flag: ownership?.nation_flag ?? null, id: ownership?.nation_id ?? null, route: 'nation', role: 'PRESIDENTE', authority: president},
    {kind: 'REGIÓN', name: entityName(ownership?.region_name ?? null, ownership?.region_id ?? null, 'region'),
      flag: ownership?.region_flag ?? null, id: ownership?.region_id ?? null, route: 'region', role: isCapital ? 'ADMINISTRACIÓN NACIONAL' : 'GOBERNADOR',
      authority: isCapital ? president : governor},
  ] as const;
  const linked = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault(); onNavigate(path);
  };
  return <main className="aog-territory-page aog-territory-redesign"><div className="aog-territory-container">
    {warning && <p className="aog-territory-warning" role="status">{warning}</p>}
    {independent ? <div className="aog-territory-founding"><h1>TERRITORIO #{format.format(id)}</h1><IndependentFoundation territory={id} onFounded={handleFounded} onNavigate={onNavigate}/></div>
    : <div className="aog-territory-overview">
        {blocks.map(block => {
          const path = `/${block.route}?id=${block.id}`;
          const picture = flagUrl(block.flag) || '/assets/photos/noflag.png';
          return <section className="aog-territory-banner" key={block.kind}>
            <a className="aog-territory-banner-flag" href={block.id ? path : undefined} onClick={block.id ? linked(path) : undefined}>
              <img src={picture} alt={`Bandera de ${block.name}`} onError={event => {event.currentTarget.src='/assets/photos/noflag.png';}}/>
            </a>
            <div className="aog-territory-banner-title"><div className="aog-territory-banner-type">{block.kind}</div>
              {block.id ? <a href={path} onClick={linked(path)}>{block.name}</a> : <span>{block.name}</span>}
            </div>
            <div className="aog-territory-banner-authority">
              <div className="aog-territory-banner-role">{block.role}</div>
              {block.authority ? <a className="aog-territory-banner-person" href={`/profile/${block.authority.id}`} onClick={linked(`/profile/${block.authority.id}`)}>
                <img src={block.authority.photo_url || '/assets/photos/nouser.png'} alt="" onError={event=>{event.currentTarget.src='/assets/photos/nouser.png';}} />
                <span><span className="aog-territory-banner-person-name">{block.authority.name}</span>
                  <small>{block.authority.party_name ? `PARTIDO ${block.authority.party_name}` : 'SIN PARTIDO'}</small></span>
              </a> : <div className="aog-territory-banner-person"><img src="/assets/photos/nouser.png" alt=""/><span>VACANTE</span></div>}
            </div>
          </section>;
        })}
      </div>}
    <div className="aog-territory-dashboard">
      <section className="aog-territory-box aog-territory-resource-box">
        <h2 className="aog-territory-box-head"><span className="aog-territory-shared-icon" style={{WebkitMaskImage:"url('/assets/icons/icons/location.svg')",maskImage:"url('/assets/icons/icons/location.svg')"}}/> RECURSOS</h2>
        {resourceError && <p className="aog-territory-warning" role="alert">{resourceError}</p>}
        <div className="aog-territory-resource-grid">{RESOURCES.map(resource=>{
          const entry=resources?.get(resource.key);
          const amount=entry?.current_amount ?? null; const maximum=entry?.max_amount ?? null;
          const display=(n: number|null)=>n===null?'—':format.format(n);
          const percent=amount!==null && maximum && maximum>0?Math.min(100,Math.max(0,amount/maximum*100)):0;
          return <div className="aog-territory-resource-card" key={resource.key} style={{'--territory-resource-color':resource.color} as CSSProperties}>
            <ResourceIcon name={resource.icon} abbreviation={resource.abbreviation}/>
            <div className="aog-territory-resource-info"><span>{resource.name}</span>
              {amount!==null && maximum!==null && <><small>{display(amount)}/{display(maximum)}</small><div className="aog-territory-resource-bar"><span style={{width:`${percent}%`}}/></div></>}
              {amount===null && <small>—</small>}
            </div>
          </div>;
        })}</div>
      </section>
      <div className="aog-territory-dashboard-right">
        <section className="aog-territory-box aog-territory-stats-box">
          <h2 className="aog-territory-box-head"><span className="aog-territory-shared-icon" style={{WebkitMaskImage:"url('/assets/icons/icons/statistics.svg')",maskImage:"url('/assets/icons/icons/statistics.svg')"}}/> ESTADÍSTICAS TERRITORIALES</h2>
          <div className="aog-territory-stat-grid">
            {[
              {key:'players',name:'JUGADORES',value:players===null?'—':format.format(players)},
              {key:'players',name:'CIUDADANOS',value:'—'},
              {key:'party',name:'PARTIDOS',value:partyCount===null?'—':format.format(partyCount)},
              {key:'clubs',name:'CLUBES',value:'—'},
              {key:'territory',name:'TAMAÑO',value:'—'},
            ].map(stat=><div className="aog-territory-stat-item" key={stat.name}>
              <span className="aog-territory-stat-icon" style={{WebkitMaskImage:`url('/assets/icons/icons/${stat.key}.svg')`,maskImage:`url('/assets/icons/icons/${stat.key}.svg')`}}/>
              <div><span className="aog-territory-stat-value">{stat.value}</span><span>{stat.name}</span></div>
            </div>)}
          </div>
        </section>
        <section className="aog-territory-box aog-territory-history-box">
          <h2 className="aog-territory-box-head"><span className="aog-territory-shared-icon" style={{WebkitMaskImage:"url('/assets/icons/icons/news.svg')",maskImage:"url('/assets/icons/icons/news.svg')"}}/> HISTORIAL TERRITORIAL</h2>
          <div className="aog-territory-placeholder">PRÓXIMAMENTE</div>
        </section>
      </div>
    </div>
  </div></main>;
}
