import { coalitionForParty, type PartyCoalition } from '../coalition/coalitionApi';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { getXp } from '../auth/player';
import type { Player } from '../auth/player';
import './profile.css';

const PHOTO = '/assets/photos/nophoto.png';
const FLAG = '/assets/photos/noflag.png';
const formatter = new Intl.NumberFormat('es-AR');
const countryNames = new Intl.DisplayNames(['es'], { type: 'region' });
const SPECIAL_FLAG_NAMES: Record<string, string> = {
  ARAB: 'Liga Árabe', ASEAN: 'ASEAN', CEFTA: 'CEFTA', EAC: 'Comunidad de África Oriental',
  'ES-CT': 'Cataluña', 'ES-GA': 'Galicia', 'ES-PV': 'País Vasco',
  'GB-ENG': 'Inglaterra', 'GB-NIR': 'Irlanda del Norte', 'GB-SCT': 'Escocia', 'GB-WLS': 'Gales',
  'SH-AC': 'Ascensión', 'SH-HL': 'Santa Elena', 'SH-TA': 'Tristán de Acuña',
};
const STAT_LABELS = {
  attack: 'ATAQUE', defense: 'DEFENSA', efficiency: 'EFICIENCIA', strength: 'FUERZA',
} as const;

type PublicPlayer = {
  id: number;
  name: string;
  photo_url: string | null;
  biography: string | null;
  country_code: string | null;
  political_ideology: string | null;
  created_at: string;
  territory_id: number | null;
  xp: number;
  attack: number;
  defense: number;
  efficiency: number;
  strength: number;
  party_id: number | null;
  party_name: string | null;
  party_photo: string | null;
  region_id: number | null;
  region_name: string | null;
  region_flag: string | null;
  nation_id: number | null;
  nation_name: string | null;
  nation_flag: string | null;
  // Son opcionales hasta que el servidor publique esos datos en la función RPC.
  total_damage?: number | null;
  friends_count?: number | null;
  citizenship_region_id?: number | null;
  citizenship_nation_id?: number | null;
};

function formatDate(raw: string): string {
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? '—' : value.toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase();
}
function countryName(code: string): string {
  if (!code) return '';
  const normalized = code.toUpperCase();
  if (SPECIAL_FLAG_NAMES[normalized]) return SPECIAL_FLAG_NAMES[normalized];
  try { return countryNames.of(normalized) || normalized; }
  catch { return normalized; }
}
function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function EntityPanel({ title, empty, id, label, image, type }: {
  title: string;
  empty: string;
  id: number | null;
  label: string | null;
  image: string | null;
  type: 'party' | 'coalition' | 'region' | 'nation';
}) {
  const entityId = positiveId(id);
  const content = <>
    {entityId && <img src={image || (type === 'region' || type === 'nation' ? FLAG : PHOTO)} alt="" />}
    <span>{entityId ? label || `#${entityId}` : empty}</span>
  </>;
  return <section className={`pr-card pr-entity pr-${type}`}>
    <h2>{title}</h2>
    {entityId
      ? <a className="pr-entity-link" href={`/${type}/${entityId}`}>{content}</a>
      : <div className="pr-entity-link" aria-disabled="true">{content}</div>}
  </section>;
}
function InformationCard({ title, children, href }: {
  title: string;
  children: ReactNode;
  href?: string;
}) {
  const contents = <><h2>{title}</h2><strong>{children}</strong></>;
  return href
    ? <a className="pr-card pr-info-card pr-info-link" href={href}>{contents}</a>
    : <section className="pr-card pr-info-card">{contents}</section>;
}

export default function PublicProfilePage({ playerId }: { playerId: number }) {
  const [profile, setProfile] = useState<PublicPlayer | null>(null);
  const [partyCoalition,setPartyCoalition]=useState<PartyCoalition|null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setProfile(null);
    setPartyCoalition(null);
    setError('');
    setLoading(true);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('aog_public_player_profile', { p_player_id: playerId });
        if (!active) return;
        if (rpcError) throw new Error(rpcError.message);
        if (!data) throw new Error('No existe ningún jugador con ese ID.');
        const person=data as PublicPlayer;
        setProfile(person);
        if(person.party_id){
          try{
            const coalition=await coalitionForParty(person.party_id);
            if(active)setPartyCoalition(coalition);
          }catch(e){console.warn('No se pudo cargar la coalición del perfil público',e);}
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar este perfil.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [playerId]);

  if (loading) return <main className="profile-page is-public-profile" aria-busy="true"><p className="pr-public-status">CARGANDO PERFIL...</p></main>;
  if (error || !profile) return <main className="profile-page is-public-profile"><p className="pr-public-status" role="alert">{error || 'PERFIL NO ENCONTRADO'}</p></main>;

  const xp = getXp({ xp: profile.xp } as Player);
  const xpPercentage = xp.required > 0 ? Math.max(0, Math.min(100, xp.xp / xp.required * 100)) : 0;
  const level = xp.level;
  const nationalSeatLimit = Math.min(10, 1 + Math.floor(level / 10));
  const regionalSeatLimit = Math.min(10, 1 + Math.floor(level / 5));
  const territoryId = positiveId(profile.territory_id);
  const citizenshipRegion = positiveId(profile.citizenship_region_id);
  const citizenshipNation = positiveId(profile.citizenship_nation_id);
  const code = profile.country_code?.toLowerCase();
  const countryLabel = countryName(profile.country_code || '');
  const stat = {
    attack: profile.attack, defense: profile.defense,
    efficiency: profile.efficiency, strength: profile.strength,
  };

  return <main className="profile-page is-public-profile" aria-label={`Perfil de ${profile.name}`}>
    <section className="pr-top-grid">
      <section className="pr-card pr-documentation">
        <h2>IDENTIFICACIÓN</h2>
        <div className="pr-documentation-body">
          <div className="pr-avatar-column">
            <div className="pr-photo-button"><img src={profile.photo_url || PHOTO} alt={`Foto de ${profile.name}`} /></div>
            <div className="pr-level-track" role="progressbar" aria-label="Experiencia"
              aria-valuenow={xp.xp} aria-valuemax={xp.required} aria-valuemin={0}>
              <span style={{ width: `${xpPercentage}%` }} />
              <strong className="pr-level-number">{xp.level}</strong>
            </div>
          </div>
          <div className="pr-personal">
            <div className="pr-name">
              <span>{profile.name || `PLAYER #${profile.id}`}</span>
              <span className="pr-id">#{profile.id}</span>
            </div>
            <div className="pr-country" title={countryLabel || 'Sin país de origen'}>
              {code ? <img src={`/assets/flags/${code}.svg`} alt={countryLabel || code} /> : 'SIN PAÍS DE ORIGEN'}
            </div>
            <div className="pr-ideology-inline">{profile.political_ideology || 'SIN IDEOLOGÍA'}</div>
          </div>
        </div>
      </section>
      <section className="pr-card pr-biography-card">
        <h2>BIOGRAFÍA</h2>
        <div className="pr-biography">{profile.biography || 'SIN BIOGRAFÍA'}</div>
      </section>
    </section>

    <section className="pr-affiliations" aria-label="Afiliaciones del jugador">
      <EntityPanel title="PARTIDO" empty="SIN PARTIDO" id={profile.party_id} label={profile.party_name} image={profile.party_photo} type="party" />
      <EntityPanel title="COALICIÓN" empty="SIN COALICIÓN" id={partyCoalition?.id??null} label={partyCoalition?.name??null} image={partyCoalition?.photo_url??null} type="coalition" />
      <EntityPanel title="REGIÓN" empty="SIN REGIÓN" id={profile.region_id} label={profile.region_name} image={profile.region_flag} type="region" />
      <EntityPanel title="NACIÓN" empty="SIN NACIÓN" id={profile.nation_id} label={profile.nation_name} image={profile.nation_flag} type="nation" />
    </section>

    <section className="pr-section pr-information-section">
      <h1>DATOS</h1>
      <div className="pr-info-grid">
        <InformationCard title="REGISTRO">{formatDate(profile.created_at)}</InformationCard>
        <InformationCard title="EXPERIENCIA">{formatter.format(xp.totalXp)}</InformationCard>
        <InformationCard title="DAÑO TOTAL">{numberOrNull(profile.total_damage) !== null ? formatter.format(Number(profile.total_damage)) : '—'}</InformationCard>
        <InformationCard title="TERRITORIO" href={territoryId ? `/territory/${territoryId}` : undefined}>{territoryId ?? '—'}</InformationCard>
        <InformationCard title="CIUDADANÍA">{citizenshipRegion ? `REGIÓN #${citizenshipRegion}` : citizenshipNation ? `NACIÓN #${citizenshipNation}` : '—'}</InformationCard>
        <InformationCard title="AMIGOS">{numberOrNull(profile.friends_count) !== null ? formatter.format(Number(profile.friends_count)) : '—'}</InformationCard>
        <InformationCard title="REGIONAL MÁX.">{regionalSeatLimit}</InformationCard>
        <InformationCard title="NACIONAL MÁX.">{nationalSeatLimit}</InformationCard>
      </div>
    </section>

    <section className="pr-section pr-statistics-section">
      <h1>ESTADÍSTICAS</h1>
      <div className="pr-stats">
        {(Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map(key => (
          <section className="pr-card pr-stat-card" key={key}>
            <h2>{STAT_LABELS[key]}</h2>
            <strong className="pr-stat-value">{formatter.format(Math.max(1, Number(stat[key]) || 1))}</strong>
          </section>
        ))}
      </div>
    </section>
  </main>;
}
