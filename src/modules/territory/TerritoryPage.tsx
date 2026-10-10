import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { Player } from '../auth/player';
import { supabase } from '../../lib/supabase';
import type { ResourceName } from '../map/world';
import type { MapOwnership } from '../map/mapApi';
import { getResourceStatus, type ResourceStatus } from '../map/resourcesApi';
import '../home/home.css';
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
function EntityPanel({ title, name, flag, id, path, onNavigate }: {
  title: string; name: string; flag: string | null; id: number | null; path: 'region' | 'nation'; onNavigate?: (path: string) => void;
}) {
  const image = flagUrl(flag);
  const destination = id ? `/${path}?id=${id}` : null;
  const content = <>{image && <img className="aog-territory-flag" src={image} alt="" onError={event => { event.currentTarget.src = '/assets/photos/noflag.png'; }} />}<strong>{name}</strong></>;
  return <Panel title={title} className="aog-territory-entity">
    {destination ? <a className="aog-territory-entity-link" href={destination} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault(); onNavigate(destination);
    }}>{content}</a> : <div className="aog-territory-entity-link">{content}</div>}
  </Panel>;
}
function AuthorityPanel({ title }: { title: string }) {
  return <Panel title={title} className="aog-territory-authority">
    <img src="/assets/photos/nophoto.png" alt="" />
    <div className="aog-territory-authority-description"><strong>DATOS NO DISPONIBLES</strong><span>Autoridad pendiente de conectar</span></div>
  </Panel>;
}

export default function TerritoryPage({ player, onNavigate }: Props) {
  const id = territoryId(player?.territoryId);
  const [ownership, setOwnership] = useState<MapOwnership | null>(null);
  const [ownershipLoaded, setOwnershipLoaded] = useState(false);
  const [players, setPlayers] = useState<number | null>(null);
  const [resources, setResources] = useState<Map<ResourceName, ResourceStatus> | null>(null);
  const [resourceError, setResourceError] = useState('');
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  useEffect(() => {
    let active = true;
    setOwnership(null); setOwnershipLoaded(false); setPlayers(null); setLoading(true); setWarning('');
    if (!id) { setLoading(false); return; }
    const load = async () => {
      const results = await Promise.allSettled([
        (async () => {
          const { data, error } = await supabase.from('map_territory_politics')
            .select('territory_id,region_id,nation_id,region_name,nation_name,region_flag,nation_flag,color')
            .eq('territory_id', id).maybeSingle();
          if (error) throw Error(error.message);
          if (active) { setOwnership(data as MapOwnership | null); setOwnershipLoaded(true); }
        })(),
        (async () => {
          const { count, error } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('territory_id', id);
          if (error) throw Error(error.message);
          if (active) setPlayers(count);
        })(),
      ]);
      if (!active) return;
      if (results.some(result => result.status === 'rejected')) setWarning('Algunos datos todavía no están disponibles.');
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

  const independent = ownershipLoaded && !ownership?.region_id && !ownership?.nation_id;

  if (!id) return <main className="aog-territory-page"><h1>SELECCIONÁ UN TERRITORIO</h1></main>;
  return <main className="aog-territory-page"><div className="aog-territory-container">
    <h1 className="aog-territory-heading">TERRITORIO #{format.format(id)}</h1>
    {warning && <p className="aog-territory-warning" role="status">{warning}</p>}
    {independent ? <div className="aog-territory-independent" role="status">INDEPENDIENTE</div> : <div className="aog-territory-pair">
      <EntityPanel title="REGIÓN" name={ownership?.region_name || (loading ? 'CARGANDO...' : 'SIN REGIÓN')}
        flag={ownership?.region_flag || null} id={ownership?.region_id || null} path="region" onNavigate={onNavigate} />
      <EntityPanel title="NACIÓN" name={ownership?.nation_name || (loading ? 'CARGANDO...' : 'SIN NACIÓN')}
        flag={ownership?.nation_flag || null} id={ownership?.nation_id || null} path="nation" onNavigate={onNavigate} />
      <AuthorityPanel title="GOBERNADOR" /><AuthorityPanel title="PRESIDENTE" />
    </div>}
    <section className="aog-territory-section" aria-label="Datos del territorio">
      <h2 className="aog-territory-section-title">DATOS</h2>
      <div className="aog-territory-stats">{[
        { name: 'JUGADORES', value: players === null ? '—' : format.format(players) },
        { name: 'PARTIDOS', value: '—' }, { name: 'CLUBES', value: '—' }, { name: 'TEMPERATURA', value: '—' },
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
