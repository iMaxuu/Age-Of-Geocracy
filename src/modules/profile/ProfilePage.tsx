import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent, type ReactNode } from 'react';
import { fetchPlayer, getXp, updatePlayerProfile, type Player } from '../auth/player';
import { supabase } from '../../lib/supabase';
import { ownParty, partyDetails } from '../party/partyApi';
import { coalitionForParty } from '../coalition/coalitionApi';
import './profile.css';
import { FLAG_COUNTRY_CODES } from './countryFlags';
import { IDEOLOGIES } from './ideologies';
import { ProfileIcon, PROFILE_INFO_ICONS } from './ProfileIcon';

const PHOTO = '/assets/photos/nophoto.png';
const FLAG = '/assets/photos/noflag.png';
const COUNTRIES: readonly string[] = FLAG_COUNTRY_CODES;
const STAT_LABELS = {
  attack: 'ATAQUE', defense: 'DEFENSA', efficiency: 'EFICIENCIA', strength: 'FUERZA',
} as const;
const formatter = new Intl.NumberFormat('es-AR');
const countryNames = new Intl.DisplayNames(['es'], { type: 'region' });
const SPECIAL_FLAG_NAMES: Record<string, string> = {
  ARAB: 'Liga Árabe', ASEAN: 'ASEAN', CEFTA: 'CEFTA', EAC: 'Comunidad de África Oriental',
  'ES-CT': 'Cataluña', 'ES-GA': 'Galicia', 'ES-PV': 'País Vasco',
  'GB-ENG': 'Inglaterra', 'GB-NIR': 'Irlanda del Norte', 'GB-SCT': 'Escocia', 'GB-WLS': 'Gales',
  'SH-AC': 'Ascensión', 'SH-HL': 'Santa Elena', 'SH-TA': 'Tristán de Acuña',
};
function countryName(code: string): string {
  if (!code) return '';
  const normalized = code.toUpperCase();
  if (SPECIAL_FLAG_NAMES[normalized]) return SPECIAL_FLAG_NAMES[normalized];
  try { return countryNames.of(normalized) || normalized; }
  catch { return normalized; }
}

type Training = { stat: StatKey; target_level: number; method: 'money' | 'gold'; price: number; ends_at: string; server_now: string };
const METHODS = ['money', 'gold'] as const;
function statPrice(target: number, method: 'money' | 'gold'): number {
  const blocks = Math.floor((target - 1) / 5);
  return method === 'gold' ? 20 + 20 * blocks : Math.round(1000 * 1.05 ** blocks);
}
function statSeconds(target: number, method: 'money' | 'gold'): number {
  const steps = Math.min(target - 2, 998);
  return Math.round((method === 'money' ? 120 : 60) *
    1.03 ** Math.min(steps, 48) *
    1.02 ** Math.max(0, Math.min(steps - 48, 50)) *
    1.01 ** Math.max(0, Math.min(steps - 98, 150)) *
    1.005 ** Math.max(0, Math.min(steps - 248, 250)) *
    1.0025 ** Math.max(0, steps - 498));
}
function countdown(total: number) {
  const seconds = Math.max(0, Math.ceil(total));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}
type StatKey = keyof typeof STAT_LABELS;
type ProfileProps = {
  player: Player;
  onPlayerChange: (player: Player) => void;
  onLogout: () => void;
};
type Relationship = {
  id: number | null;
  label: string;
  image: string | null;
};

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function numeric(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function formatDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase();
}
function relationship(player: Player, key: 'party' | 'coalition' | 'region' | 'nation'): Relationship | null {
  const object = player[key];
  const record = object && typeof object === 'object' && !Array.isArray(object)
    ? object as Record<string, unknown>
    : null;
  const id = positiveId(record?.id ?? player[`${key}Id`]);
  if (!id) return null;
  const label = stringOrNull(record?.name) ?? stringOrNull(player[`${key}Name`]) ?? `#${id}`;
  const image = stringOrNull(record?.photo) ?? stringOrNull(record?.flag)
    ?? stringOrNull(player[`${key}Photo`]) ?? stringOrNull(player[`${key}Flag`]);
  return { id, label, image };
}
function EntityPanel({
  title, empty, entity, type,
}: {
  title: string;
  empty: string;
  entity: Relationship | null;
  type: 'party' | 'coalition' | 'region' | 'nation';
}) {
  const content = <>
    {entity?.image ? <img src={entity.image} alt="" /> : entity ? <img src={type === 'region' || type === 'nation' ? FLAG : PHOTO} alt="" /> : null}
    <span>{entity?.label ?? empty}</span>
  </>;
  return <section className={`pr-card pr-entity pr-${type}`}>
    <h2><ProfileIcon name={type}/>{title}</h2>
    {entity?.id
      ? <a className="pr-entity-link" href={`/${type}/${entity.id}`}>{content}</a>
      : <div className="pr-entity-link" aria-disabled="true">{content}</div>}
  </section>;
}

function InformationCard({ title, children, href }: {
  title: string; children: ReactNode; href?: string;
}) {
  const contents = <><ProfileIcon name={PROFILE_INFO_ICONS[title] || 'statistics'}/><span className="pr-info-copy"><strong>{children}</strong><small>{title}</small></span></>;
  return href
    ? <a className="pr-card pr-info-card pr-info-link" href={href}>{contents}</a>
    : <section className="pr-card pr-info-card">{contents}</section>;
}

export function ProfilePage({ player, onPlayerChange, onLogout }: ProfileProps) {
  const [editing, setEditing] = useState(false);
  const [actualParty, setActualParty] = useState<Relationship | null>(null);
  const [actualCoalition, setActualCoalition] = useState<Relationship | null>(null);
  useEffect(() => {
    let active = true;
    void ownParty().then(async state => {
      if (!state?.party_id) { if (active) {setActualParty(null);setActualCoalition(null);} return; }
      const data = await partyDetails(state.party_id);
      if (active) setActualParty(data ? { id: data.id, label: data.name, image: data.photo_url } : null);
      const coalition=await coalitionForParty(state.party_id);
      if(active)setActualCoalition(coalition?{id:coalition.id,label:coalition.name,image:coalition.photo_url}:null);
    }).catch(error => console.warn('No se pudo consultar el partido del perfil:', error));
    return () => { active = false; };
  }, [player.authId]);
  const [currentRegion, setCurrentRegion] = useState<Relationship | null>(null);
  const [currentNation, setCurrentNation] = useState<Relationship | null>(null);
  useEffect(() => {
    let active = true;
    setCurrentRegion(null); setCurrentNation(null);
    if (!player.territoryId) return;
    void supabase.from('map_territory_politics')
      .select('region_id,region_name,region_flag,nation_id,nation_name,nation_flag')
      .eq('territory_id', player.territoryId).maybeSingle()
      .then(({data,error}) => {
        if (!active || error) return;
        setCurrentRegion(data?.region_id ? { id:data.region_id, label:data.region_name || `REGION #${data.region_id}`, image:data.region_flag || null } : null);
        setCurrentNation(data?.nation_id ? { id:data.nation_id, label:data.nation_name || `NATION #${data.nation_id}`, image:data.nation_flag || null } : null);
      });
    return () => { active = false; };
  }, [player.territoryId]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [trainingError, setTrainingError] = useState('');
  const [trainingBusy, setTrainingBusy] = useState<StatKey | null>(null);
  const trainingBusyRef = useRef(false);
  async function refreshTrainings(refreshBalance = false) {
    const { data, error: rpcError } = await supabase.rpc('get_own_stat_trainings');
    if (rpcError) throw new Error(rpcError.message);
    const items = (data ?? []) as Training[];
    setTrainings(items);
    if (items[0]?.server_now) setServerOffset(new Date(items[0].server_now).getTime() - Date.now());
    if (refreshBalance) {
      const updated = await fetchPlayer(player.authId);
      onPlayerChange(updated);
    }
  }
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try { await refreshTrainings(true); if (!cancelled) setTrainingError(''); }
      catch (e) { if (!cancelled) setTrainingError(e instanceof Error ? e.message : 'No se pudo leer el entrenamiento'); }
    };
    void load();
    const tick = window.setInterval(() => setClock(Date.now()), 1000);
    const sync = window.setInterval(() => { void load(); }, 15000);
    return () => { cancelled = true; window.clearInterval(tick); window.clearInterval(sync); };
  }, [player.authId]);
  async function upgradeStat(key: StatKey, method: 'money' | 'gold') {
    if (trainingBusyRef.current || trainings.length > 0) return;
    trainingBusyRef.current = true;
    setTrainingBusy(key);
    setTrainingError('');
    try {
      const { error: rpcError } = await supabase.rpc('start_stat_training', { p_stat: key, p_method: method });
      if (rpcError) throw new Error(rpcError.message);
      await refreshTrainings(true);
    } catch (e) { setTrainingError(e instanceof Error ? e.message : 'No se pudo iniciar el entrenamiento'); }
    finally { trainingBusyRef.current = false; setTrainingBusy(null); }
  }

  const [name, setName] = useState(player.name || '');
  const [biography, setBiography] = useState(stringOrNull(player.biography) ?? '');
  const [country, setCountry] = useState(stringOrNull(player.countryCode) ?? '');
  const [ideology, setIdeology] = useState(stringOrNull(player.politicalIdeology) ?? '');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cropCanvas = useRef<HTMLCanvasElement>(null);
  const dragStart = useRef<{ x: number; y: number; centerX: number; centerY: number } | null>(null);
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropCenter, setCropCenter] = useState({ x: 0, y: 0 });
  const cropSide = cropImage ? Math.min(cropImage.naturalWidth, cropImage.naturalHeight) / cropZoom : 0;
  const cropX = cropImage ? Math.max(cropSide / 2, Math.min(cropImage.naturalWidth - cropSide / 2, cropCenter.x)) : 0;
  const cropY = cropImage ? Math.max(cropSide / 2, Math.min(cropImage.naturalHeight - cropSide / 2, cropCenter.y)) : 0;
  useEffect(() => {
    const canvas = cropCanvas.current;
    if (!canvas || !cropImage || !cropSide) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cropImage, cropX - cropSide / 2, cropY - cropSide / 2, cropSide, cropSide,
      0, 0, canvas.width, canvas.height);
  }, [cropImage, cropSide, cropX, cropY]);
  function cropPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!cropImage) return;
    dragStart.current = { x: event.clientX, y: event.clientY, centerX: cropX, centerY: cropY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function cropPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!dragStart.current || !cropImage) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = cropSide / bounds.width;
    setCropCenter({
      x: dragStart.current.centerX - (event.clientX - dragStart.current.x) * ratio,
      y: dragStart.current.centerY - (event.clientY - dragStart.current.y) * ratio,
    });
  }
  function cropPointerUp() { dragStart.current = null; }
  function confirmCrop() {
    if (!cropImage) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setError('No se pudo preparar la foto.'); return; }
    // No pintar fondo: la transparencia del PNG se conserva.
    ctx.drawImage(cropImage, cropX - cropSide / 2, cropY - cropSide / 2, cropSide, cropSide, 0, 0, 256, 256);
    setPhoto(canvas.toDataURL('image/png'));
    setCropImage(null);
    setError('');
  }


  const xp = getXp(player);
  const xpPercentage = xp.required > 0 ? Math.max(0, Math.min(100, (xp.xp / xp.required) * 100)) : 0;
  const level = xp.level;
  const nationalSeatLimit = Math.min(10, 1 + Math.floor(level / 10));
  const regionalSeatLimit = Math.min(10, 1 + Math.floor(level / 5));
  const citizenshipRegion = positiveId(player.citizenship?.regionId);
  const citizenshipNation = positiveId(player.citizenship?.nationId);
  const friends = Array.isArray(player.friends) ? player.friends.length
    : Array.isArray(player.friendIds) ? player.friendIds.length
      : numeric(player.friendsCount, 0);
  const territoryId = positiveId(player.territoryId);

  function beginEdit() {
    setName(player.name || '');
    setBiography(stringOrNull(player.biography) ?? '');
    setCountry(stringOrNull(player.countryCode) ?? '');
    setIdeology(stringOrNull(player.politicalIdeology) ?? '');
    setPhoto(null);
    setCropImage(null);
    setError('');
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setCropImage(null);
    setPhoto(null);
    setError('');
  }
  async function save() {
    try {
      const changes: Record<string, unknown> = {
        name: name.trim(),
        biography: biography.slice(0, 500),
        countryCode: country || null,
        politicalIdeology: ideology || null,
      };
      if (photo) changes.photo = { ...player.photo, url: photo };
      const updated = await updatePlayerProfile(changes);
      onPlayerChange(updated);
      cancelEdit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el perfil.');
    }
  }
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Usá una imagen PNG, JPG o WebP de hasta 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('No se pudo leer la foto.');
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const img = new Image();
      img.onerror = () => setError('La imagen no se pudo abrir.');
      img.onload = () => {
        setCropImage(img);
        setCropZoom(1);
        setCropCenter({ x: img.naturalWidth / 2, y: img.naturalHeight / 2 });
        setError('');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  const stat = player.stats ?? { attack: 1, defense: 1, efficiency: 1, strength: 1 };
  return <main className={`profile-page is-own-profile${editing ? ' is-editing' : ''}`}>
    <section className="pr-top-grid">
      <section className="pr-card pr-documentation">
        <h2><ProfileIcon name="players"/>IDENTIFICACIÓN</h2>
        <div className="pr-documentation-body">
          <div className="pr-avatar-column">
            <button
              className="pr-photo-button" type="button"
              aria-label={editing ? 'Seleccionar foto' : 'Foto del jugador'}
              disabled={!editing}
              onClick={() => fileInput.current?.click()}
            ><img src={photo || player.photo?.url || PHOTO} alt="Foto del jugador" /></button>
            <strong className="pr-level-label">NIVEL: {xp.level}</strong>
            <div className="pr-level-track" role="progressbar" aria-label="Experiencia"
              aria-valuenow={xp.xp} aria-valuemax={xp.required} aria-valuemin={0}>
              <span style={{ width: `${xpPercentage}%` }} />
            </div>
          </div>
          <div className="pr-personal">
            <div className="pr-name">
              {editing
                ? <input className="pr-inline-input pr-inline-name" aria-label="Nombre del jugador" value={name} maxLength={30} onChange={event => setName(event.target.value)} />
                : <span>{player.name || `PLAYER #${player.id}`}</span>}
              <span className="pr-id">#{player.id}</span>
            </div>
            <div className="pr-ideology-inline">
              {editing
                ? <select className="pr-inline-select pr-inline-ideology" aria-label="Ideología política" value={ideology} onChange={event => setIdeology(event.target.value)}>
                    <option value="">SIN IDEOLOGÍA</option>
                    {IDEOLOGIES.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}
                  </select>
                : stringOrNull(player.politicalIdeology) ?? 'SIN IDEOLOGÍA'}
            </div>
            <div className="pr-country" title={country ? (countryName(country) || country) : 'Sin país de origen'}>
              {editing
                ? <div className="pr-inline-flag-wrap">
                    {country && <img src={`/assets/flags/${country.toLowerCase()}.svg`} alt="" />}
                    <select aria-label="País de origen" className="pr-inline-select pr-inline-country-select" value={country} onChange={event => setCountry(event.target.value)}>
                      <option value="">SIN PAÍS DE ORIGEN</option>
                      {COUNTRIES.map(code => <option key={code} value={code}>{countryName(code) || code} ({code})</option>)}
                    </select>
                  </div>
                : player.countryCode
                  ? <img src={`/assets/flags/${player.countryCode.toLowerCase()}.svg`} alt={countryName(player.countryCode) || player.countryCode} />
                  : 'SIN PAÍS DE ORIGEN'}
            </div>
          </div>
          <div className="pr-actions">
            {editing
              ? <div className="pr-action-group"><button type="button" className="pr-green" onClick={save}>GUARDAR</button><button type="button" onClick={cancelEdit}>CANCELAR</button></div>
              : <div className="pr-action-group"><button type="button" className="pr-red" onClick={onLogout}>CERRAR SESIÓN</button><button type="button" onClick={beginEdit}>EDITAR</button></div>}
          </div>
        </div>
        <div className="pr-biography-area" aria-label="Biografía">
          {editing
            ? <textarea className="pr-control pr-biography-input" rows={5} maxLength={500} value={biography} onChange={event => setBiography(event.target.value)} placeholder="Biografía (máximo 500 caracteres)" />
            : <div className="pr-biography">{player.biography || 'SIN BIOGRAFÍA'}</div>}
          {editing && <small className="pr-character-count">{biography.length}/500</small>}
        </div>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choosePhoto} />
      </section>
    </section>

    {cropImage && <div className="pr-crop-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setCropImage(null);
    }}>
      <section className="pr-crop-dialog" role="dialog" aria-modal="true" aria-label="Recortar foto de perfil">
        <h2>AJUSTAR FOTO 1:1</h2>
        <p>Arrastrá la imagen para centrarla. La transparencia se conserva.</p>
        <div className="pr-crop-stage">
          <canvas ref={cropCanvas} width={300} height={300} onPointerDown={cropPointerDown}
            onPointerMove={cropPointerMove} onPointerUp={cropPointerUp} onPointerCancel={cropPointerUp}
            aria-label="Vista previa del recorte cuadrado" />
        </div>
        <label className="pr-crop-zoom">ZOOM
          <input type="range" min="1" max="4" step="0.05" value={cropZoom}
            onChange={event => setCropZoom(Number(event.target.value))} />
        </label>
        <div className="pr-crop-actions">
          <button type="button" onClick={() => setCropImage(null)}>CANCELAR</button>
          <button type="button" onClick={confirmCrop}>USAR FOTO</button>
        </div>
      </section>
    </div>}

    {error && <p className="pr-profile-error" role="alert">{error}</p>}

    <section className="pr-affiliations" aria-label="Afiliaciones del jugador">
      <EntityPanel title="PARTIDO" empty="SIN PARTIDO" entity={actualParty ?? relationship(player, 'party')} type="party" />
      <EntityPanel title="COALICIÓN" empty="SIN COALICIÓN" entity={actualCoalition} type="coalition" />
      <EntityPanel title="REGIÓN" empty="SIN REGIÓN" entity={currentRegion} type="region" />
      <EntityPanel title="NACIÓN" empty="SIN NACIÓN" entity={currentNation} type="nation" />
    </section>

    <section className="pr-section pr-information-section pr-card">
      <h2><ProfileIcon name="statistics"/>ESTADÍSTICAS DEL JUGADOR</h2>
      <div className="pr-info-grid">
        <InformationCard title="REGISTRO">{formatDate(player.createdAt)}</InformationCard>
        <InformationCard title="EXPERIENCIA">{formatter.format(xp.totalXp)}</InformationCard>
        <InformationCard title="DAÑO TOTAL">{formatter.format(numeric(player.totalDamage))}</InformationCard>
        <InformationCard title="TERRITORIO" href={territoryId ? `/territory/${territoryId}` : undefined}>{territoryId ?? '—'}</InformationCard>
        <InformationCard title="CIUDADANÍA">{citizenshipRegion ? `REGIÓN #${citizenshipRegion}` : citizenshipNation ? `NACIÓN #${citizenshipNation}` : 'SIN CIUDADANÍA'}</InformationCard>
        <InformationCard title="AMIGOS">{formatter.format(Math.max(0, friends))}</InformationCard>
        <InformationCard title="REGIONAL MÁX.">{regionalSeatLimit}</InformationCard>
        <InformationCard title="NACIONAL MÁX.">{nationalSeatLimit}</InformationCard>
      </div>
    </section>

    <section className="pr-section pr-statistics-section" aria-label="Estadísticas y entrenamiento">
      <div className="pr-stats">
        {(Object.keys(STAT_LABELS) as StatKey[]).map(key => {
          const currentLevel = Math.max(1, numeric(stat[key], 1));
          const training = trainings.find(item => item.stat === key);
          const anotherTrainingActive = trainings.length > 0 && !training;
          const remaining = training ? Math.max(0, (new Date(training.ends_at).getTime() - clock - serverOffset) / 1000) : 0;
          return <section className="pr-card pr-stat-card" key={key}>
            <h2>{STAT_LABELS[key]}</h2>
            <strong className="pr-stat-value">{formatter.format(currentLevel)}</strong>
            <div className={`pr-upgrade-actions${anotherTrainingActive ? ' pr-upgrade-actions-hidden' : ''}`}>
              {(training ? [training.method] as ('money' | 'gold')[] : anotherTrainingActive ? [] : METHODS).map(method => {
                const target = currentLevel + 1;
                const price = statPrice(target, method);
                const duration = statSeconds(target, method);
                const affordable = (method === 'money' ? player.money : player.gold) >= price;
                return <button key={method} type="button" data-currency={method}
                  disabled={Boolean(training) || trainingBusy !== null || trainings.length > 0 || !affordable || !Number.isSafeInteger(price)}
                  onClick={() => void upgradeStat(key, method)}
                  title={training ? 'Mejora en curso' : !affordable ? 'Saldo insuficiente' : `Mejorar ${STAT_LABELS[key]} a ${target}`}>
                  {!training && <strong className="pr-price-auto" style={{ '--pr-price-chars': formatter.format(price).length + 2 } as React.CSSProperties}>{method === 'money' ? '$' : 'G'} {formatter.format(price)}</strong>}
                  <small>{training ? countdown(remaining) : countdown(duration)}</small>
                </button>;
              })}
            </div>
          </section>;
        })}
      </div>
      {trainingError && <p className="pr-job-status" role="alert">{trainingError}</p>}
    </section>
  </main>;
}
