import { useEffect, useState, useCallback, type CSSProperties, type MouseEvent } from 'react';
import type { Player } from '../auth/player';
import { supabase } from '../../lib/supabase';
import type { ResourceName } from '../map/world';
import type { MapOwnership } from '../map/mapApi';
import { getResourceStatus, type ResourceStatus } from '../map/resourcesApi';
import IndependentFoundation from './IndependentFoundation';
import './territory.css';

type Props = { player?: Player; onNavigate?: (path: string) => void };
type ResourceInfo = { key: ResourceName; name: string; icon: string; color: string; bg: string; fill: string };
const RESOURCES: ResourceInfo[] = [
  { key: 'wood', name: 'MADERA', icon: 'wood', color: '#99502a', bg: '#271109', fill: '#ad5429' },
  { key: 'mineral', name: 'MINERAL', icon: 'ore', color: '#d0d6dc', bg: '#353638', fill: '#d0d6dc' },
  { key: 'oil', name: 'PETRÓLEO', icon: 'oil', color: '#6f6f6f', bg: '#080808', fill: '#a8a8a8' },
  { key: 'gold', name: 'ORO', icon: 'gold', color: '#ffe167', bg: '#625518', fill: '#ffe167' },
  { key: 'diamond', name: 'DIAMANTE', icon: 'diamond', color: '#81b4e0', bg: '#294f70', fill: '#81b4e0' },
  { key: 'uranium', name: 'URANIO', icon: 'uranium', color: '#81e25f', bg: '#03590b', fill: '#81e25f' },
  { key: 'geocracyum', name: 'GEOCRACYUM', icon: 'geocracyum', color: '#f267bb', bg: '#591037', fill: '#f267bb' },
  { key: 'aurexium', name: 'AUREXIUM', icon: 'aurexium', color: '#1279e8', bg: '#06112d', fill: '#137cec' },
];
const format = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const iconUrl = (name: string) => `/assets/icons/icons/${name}.svg?v=0.0.3-custom-2`;

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`aog-territory-icon ${className}`} aria-hidden="true" style={{maskImage:`url(${iconUrl(name)})`,WebkitMaskImage:`url(${iconUrl(name)})`}}/>;
}
function PanelHeading({ title, icon }: {title: string; icon: string}) {
  return <h2 className="aog-territory-panel-heading"><span className="aog-territory-heading-tab"><Icon name={icon}/><span>{title}</span></span></h2>;
}
function Panel({ title, icon, className = '', children }: {title: string; icon: string; className?: string; children: React.ReactNode}) {
  return <section className={`aog-territory-panel ${className}`}><PanelHeading title={title} icon={icon}/>{children}</section>;
}
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
function entityName(raw: string | null, id: number | null, kind: 'region' | 'nation'): string {
  if (!id) return kind === 'region' ? 'SIN REGIÓN' : 'SIN NACIÓN';
  const value = raw?.trim() || '';
  const placeholder = kind === 'region'
    ? /^(?:CAPITAL|REGI[ÓO]N|REGION)\s*#\s*\d+$/i
    : /^(?:NACI[ÓO]N|NATION)\s*#\s*\d+$/i;
  if (!value || placeholder.test(value) || /^(?:REGIÓN CAPITAL|NACIÓN EN ORGANIZACIÓN)$/i.test(value))
    return `${kind === 'region' ? 'REGIÓN' : 'NACIÓN'} #${id}`;
  return value;
}

type PublicAuthority = {
  id: number; name: string; photo_url: string | null;
  country_code: string | null; political_ideology: string | null; party_name: string | null;
};
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

function EntityCard({ kind, id, name, flag, onNavigate }: {
  kind: 'nation' | 'region'; id: number | null; name: string; flag: string | null;
  onNavigate?: (path: string) => void;
}) {
  const destination = id ? `/${kind}?id=${id}` : null;
  const image = flagUrl(flag);
  const body = <>
    {id && image ? <img className="aog-territory-entity-flag" src={image} alt="" onError={event=>{event.currentTarget.style.visibility='hidden';}}/> : null}
    <strong>{name}</strong>
  </>;
  return destination ? <a className="aog-territory-entity-card" href={destination} onClick={event=>{
    if (!onNavigate || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();onNavigate(destination);
  }}>{body}</a> : <div className="aog-territory-entity-card is-empty">{body}</div>;
}
function AuthorityCard({ title, person, onNavigate }: {
  title: string; person: PublicAuthority | null; onNavigate?: (path: string) => void;
}) {
  const profile = person ? `/profile/${person.id}` : null;
  return <div className="aog-territory-authority-card">
    <strong className="aog-territory-authority-role">{title}</strong>
    {profile ? <a className="aog-territory-authority-picture" href={profile} aria-label={`Ver perfil de ${person!.name}`} onClick={event=>{
      if (!onNavigate || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();onNavigate(profile);
    }}><img src={person!.photo_url || '/assets/photos/nouser.png'} alt={person!.name} onError={event=>{event.currentTarget.src='/assets/photos/nouser.png';}}/></a>
      : <img className="aog-territory-authority-photo" src="/assets/photos/nouser.png" alt="Autoridad vacante"/>}
    <span className="aog-territory-authority-name">{person?.name ?? 'VACANTE'}</span>
    {person && <small>{person.party_name ? `PARTIDO ${person.party_name}` : 'SIN PARTIDO'}</small>}
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
  const nationId = Number(ownership?.nation_id) || null;
  const regionId = Number(ownership?.region_id) || null;
  const capitalLabel = isCapital && regionId ? 'CAPITAL NACIONAL' : nationId ? 'TERRITORIO NACIONAL' : 'INDEPENDIENTE';
  const navigate = (path: string) => onNavigate ? onNavigate(path) : (window.location.href = path);
  if (!id) return <main className="aog-territory-redesign"><p className="aog-territory-loading">SELECCIONÁ UN TERRITORIO</p></main>;

  const stats = [
    {name:'JUGADORES',value:players===null?'—':format.format(players)},
    {name:'PARTIDOS',value:partyCount===null?'—':format.format(partyCount)},
    {name:'CIUDADANOS',value:'—'},
    {name:'CLUBES',value:'—'},
    {name:'TAMAÑO',value:'—'},
  ];
  const regionalStock = Array.from(resources?.values() ?? []).some(item=>item.scope_kind==='region');
  return <main className="aog-territory-redesign">
    {warning && <p className="aog-territory-warning" role="status">{warning}</p>}
    <div className="aog-territory-layout">
      <Panel title="TERRITORIO" icon="territory" className="aog-territory-summary-panel">
        <div className="aog-territory-summary-body">
          <div className="aog-territory-identity">
            <span className="aog-territory-large-id">#{format.format(id)}</span>
            <strong>{capitalLabel}</strong>
            <span>{player?.territoryId===id?'TU UBICACIÓN ACTUAL':'TERRITORIO DEL MAPA MUNDIAL'}</span>
          </div>
          <div className="aog-territory-summary-divider"/>
          <div className="aog-territory-summary-facts">
            <div><Icon name="players"/><span><b>JUGADORES</b><strong>{players===null?'—':format.format(players)}</strong></span></div>
            <div><Icon name="party"/><span><b>PARTIDOS</b><strong>{partyCount===null?'—':format.format(partyCount)}</strong></span></div>
            <button type="button" className="aog-territory-map-link" onClick={()=>navigate('/map')}>VER EN MAPA</button>
          </div>
        </div>
      </Panel>
      <Panel title="ORGANIZACIÓN POLÍTICA" icon="nation" className="aog-territory-political-panel">
        <div className="aog-territory-political-grid">
          <div className="aog-territory-political-item">
            <span>NACIÓN</span>
            <EntityCard kind="nation" id={nationId} name={entityName(ownership?.nation_name??null,nationId,'nation')} flag={ownership?.nation_flag??null} onNavigate={onNavigate}/>
          </div>
          <div className="aog-territory-political-item">
            <span>REGIÓN</span>
            <EntityCard kind="region" id={regionId} name={entityName(ownership?.region_name??null,regionId,'region')} flag={ownership?.region_flag??null} onNavigate={onNavigate}/>
          </div>
        </div>
      </Panel>
      {!independent && <Panel title="AUTORIDADES" icon="players" className="aog-territory-government-panel">
        <div className="aog-territory-government-grid">
          <AuthorityCard title="PRESIDENTE" person={president} onNavigate={onNavigate}/>
          <AuthorityCard title={isCapital?'ADMINISTRACIÓN NACIONAL':'GOBERNADOR'} person={isCapital?president:governor} onNavigate={onNavigate}/>
        </div>
      </Panel>}
      <Panel title="ESTADÍSTICAS TERRITORIALES" icon="statistics" className="aog-territory-stats-panel">
        <div className="aog-territory-stats-grid">
          {stats.map(stat=><div className="aog-territory-stat-card" key={stat.name}>
            <span>{stat.name}</span><strong>{stat.value}</strong>
          </div>)}
        </div>
      </Panel>
      {independent && <Panel title="FUNDACIÓN Y CIUDADANÍA" icon="foundation" className="aog-territory-foundation-panel">
        <div className="aog-territory-foundation-inner"><IndependentFoundation territory={id} onFounded={handleFounded} onNavigate={onNavigate}/></div>
      </Panel>}
      <Panel title="RECURSOS" icon="statistics" className="aog-territory-resources-panel">
        {resourceError && <p className="aog-territory-resource-error" role="alert">{resourceError}</p>}
        {!resources && !resourceError && <p className="aog-territory-resource-loading">CARGANDO RECURSOS...</p>}
        {resources && <>
          {regionalStock && <p className="aog-territory-stock-note">DEPÓSITOS COMPARTIDOS DE LA REGIÓN</p>}
          <div className="aog-territory-resource-grid">{RESOURCES.map(resource=>{
            const entry=resources.get(resource.key);
            const amount=entry?.current_amount??null, max=entry?.max_amount??null;
            const percent=amount!==null&&max!==null&&max>0?Math.max(0,Math.min(100,amount/max*100)):0;
            const style={'--resource-color':resource.color,'--resource-bg':resource.bg,'--resource-fill':resource.fill} as CSSProperties;
            return <div className="aog-territory-resource-card" key={resource.key} style={style}>
              <span className="aog-territory-resource-icon" style={{maskImage:`url('/assets/icons/${resource.icon}.svg')`,WebkitMaskImage:`url('/assets/icons/${resource.icon}.svg')`}} aria-hidden="true"/>
              <div className="aog-territory-resource-detail"><strong>{resource.name}</strong>
                <span>{amount!==null&&max!==null?`${format.format(amount)}/${format.format(max)}`:'—'}</span>
                <div className="aog-territory-resource-track" role="progressbar" aria-label={`Disponibilidad de ${resource.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{width:`${percent}%`}}/></div>
              </div>
            </div>;
          })}</div>
        </>}
      </Panel>
      <Panel title="HISTORIAL TERRITORIAL" icon="news" className="aog-territory-history-panel">
        <div className="aog-territory-placeholder">PRÓXIMAMENTE</div>
      </Panel>
    </div>
  </main>;
}
