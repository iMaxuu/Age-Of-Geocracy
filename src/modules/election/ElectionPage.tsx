import { useCallback, useEffect, useState, type ReactNode, type KeyboardEvent } from 'react';
import { supabase } from '../../lib/supabase';
import type { Player } from '../auth/player';
import '../home/home.css';
import './election.css';

type Eligible = { id: number; name: string; photo: string | null; party_id: number; party: string };
type Candidate = {
  id: number; president_id: number; president_name: string; president_photo: string | null;
  vice_id: number; vice_name: string; vice_photo: string | null;
  party: string; coalition: string | null; votes: number | null;
};
type Election = {
  id: number; nation: { id: number; name: string | null; flag_url: string | null };
  stage: 'PRE' | 'CURSO' | 'POST'; voting_starts_at: string; voting_ends_at: string;
  completed_at: string | null; winner_candidacy_id: number | null;
  candidacies: Candidate[]; my_vote: number | null; has_voted: boolean;
  can_vote: boolean; blank_votes: number | null;
};
const FOTO = '/assets/photos/nouser.png';
const BANDERA = '/assets/photos/noflag.png';
const regionalElection = new URLSearchParams(window.location.search).has('region') || new URLSearchParams(window.location.search).get('type') === 'governor';
const formatNum = new Intl.NumberFormat('es-AR');
const roles = regionalElection ? ['GOBERNADOR', 'VICEGOBERNADOR'] : ['PRESIDENTE', 'VICEPRESIDENTE'];

function countdown(iso: string, now: number) {
  const ms = Math.max(0, new Date(iso).getTime() - now), seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 86400)).padStart(2, '0')}:${String(Math.floor(seconds % 86400 / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function Image({ src, alt }: { src?: string | null; alt: string }) {
  return <img src={src || FOTO} alt={alt} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = FOTO; }} />;
}
// Mismos SVG que utiliza Home (sin nuevos recursos ni dependencias).
function ElectionIcon({ name, className = '' }: { name: string; className?: string }) {
  const url = `/assets/icons/icons/${name}.svg`;
  return <span className={`aog-home-icon aog-election-icon ${className}`} style={{ maskImage: `url(${url})`, WebkitMaskImage: `url(${url})` }} aria-hidden="true" />;
}
function Panel({ title, icon, children, className = '' }: { title: string; icon: string; children: ReactNode; className?: string }) {
  return <section className={`aog-election-panel ${className}`}>
    <h2 className="aog-election-panel-title"><ElectionIcon name={icon} />{title}</h2>
    {children}
  </section>;
}
function Person({ id, name, photo, role, onNavigate }: { id: number; name: string; photo: string | null; role: string; onNavigate?: (path: string) => void }) {
  return <div className="aog-election-person">
    <span className="aog-election-role">{role}</span>
    <div className="aog-election-person-body">
      <button className="aog-election-photo" onClick={e => { e.stopPropagation(); onNavigate?.(`/profile/${id}`); }} type="button" aria-label={`Ver perfil de ${name}`}><Image src={photo} alt={name} /></button>
      <div className="aog-election-person-text"><strong>{name}</strong><small>#{id}</small></div>
    </div>
  </div>;
}
function Metric({ icon, label, value }: { icon: string; label: string; value: ReactNode }) {
  return <div className="aog-election-metric">
    <ElectionIcon name={icon} />
    <div><strong>{value}</strong><span>{label}</span></div>
  </div>;
}

export default function ElectionPage({ player, onNavigate }: { player: Player; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<Election | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [selection, setSelection] = useState<number | null | 'blank'>(null);
  const [busy, setBusy] = useState(false);
  const [showNomination, setShowNomination] = useState(false);
  const [president, setPresident] = useState('');
  const [vice, setVice] = useState('');
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [picker, setPicker] = useState<'president' | 'vice' | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [alreadyNominated, setAlreadyNominated] = useState(false);

  const load = useCallback(async () => {
    try {
      const search = new URLSearchParams(window.location.search), id = Number(search.get('id'));
      const paramNation = Number(search.get(regionalElection ? 'region' : 'nation'));
      let nationId = paramNation > 0 ? paramNation : null;
      if (!id && !nationId) {
        const { data: pol, error: polError } = await supabase.from('map_territory_politics')
          .select(regionalElection ? 'region_id' : 'nation_id').eq('territory_id', player.territoryId).maybeSingle();
        if (polError) throw polError;
        nationId = Number(regionalElection ? (pol as { region_id?: number } | null)?.region_id : (pol as { nation_id?: number } | null)?.nation_id) || null;
      }
      if (!id && !nationId) {
        setData(null);
        setError(regionalElection ? 'No hay región seleccionada.' : 'No hay nación seleccionada.');
        return;
      }
      const { data: result, error: rpcError } = await supabase.rpc(
        regionalElection ? 'aog_governor_detail' : 'aog_election_detail',
        regionalElection ? { p_election_id: id > 0 ? id : null, p_region_id: id > 0 ? null : nationId }
          : { p_election_id: id > 0 ? id : null, p_nation_id: id > 0 ? null : nationId }
      );
      if (rpcError) throw rpcError;
      const election = result as (Election & { region?: Election['nation'] }) | null;
      if (election && regionalElection) {
        election.nation = election.region ?? election.nation;
        election.candidacies = (election.candidacies || []).map((c: Candidate & { governor_id?: number; governor_name?: string; governor_photo?: string | null }) => ({
          ...c, president_id: c.governor_id ?? c.president_id,
          president_name: c.governor_name ?? c.president_name,
          president_photo: c.governor_photo ?? c.president_photo
        }));
      }
      setData(election);
      setError(election ? '' : regionalElection ? 'No hay elecciones de gobernador en esta región.' : 'No hay elecciones presidenciales en esta nación.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al consultar elección'); }
    finally { setLoading(false); }
  }, [player.territoryId]);

  useEffect(() => {
    void load();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = window.setInterval(() => void load(), 15000);
    return () => { clearInterval(clock); clearInterval(refresh); };
  }, [load]);

  useEffect(() => {
    if (data?.stage !== 'PRE') { setShowNomination(false); setPicker(null); return; }
    let cancelled = false;
    const fetchEligible = async () => {
      const { data: result, error: e } = await supabase.rpc(
        regionalElection ? 'aog_governor_eligible_candidates' : 'aog_election_eligible_candidates', { p_election_id: data.id }
      );
      if (cancelled) return;
      if (e) { setAllowed(false); setAlreadyNominated(false); setEligible([]); return; }
      setAllowed(Boolean(result?.can_nominate));
      setAlreadyNominated(Boolean(result?.already_nominated));
      setEligible(Array.isArray(result?.players) ? result.players : []);
    };
    void fetchEligible();
    const refreshEligible = window.setInterval(() => void fetchEligible(), 15000);
    return () => { cancelled = true; window.clearInterval(refreshEligible); };
  }, [data?.id, data?.stage]);

  async function nominate() {
    if (!data || busy) return;
    setBusy(true); setError('');
    try {
      const { error: e } = await supabase.rpc(
        regionalElection ? 'aog_governor_nominate' : 'aog_election_nominate',
        regionalElection ? { p_election_id: data.id, p_governor_id: Number(president), p_vice_id: Number(vice) }
          : { p_election_id: data.id, p_president_id: Number(president), p_vice_id: Number(vice) }
      );
      if (e) throw e;
      setShowNomination(false); setPicker(null); setPresident(''); setVice('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo presentar la candidatura'); }
    finally { setBusy(false); }
  }
  async function vote() {
    if (!data || selection === null || busy || !data.can_vote || data.has_voted) return;
    setBusy(true); setError('');
    try {
      const { error: e } = await supabase.rpc(
        regionalElection ? 'aog_governor_cast_vote' : 'aog_election_cast_vote',
        { p_election_id: data.id, p_candidacy_id: selection === 'blank' ? null : selection }
      );
      if (e) throw e;
      await load();
      setSelection(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo votar'); }
    finally { setBusy(false); }
  }

  const stage = data?.stage;
  const cards = data?.candidacies ?? [];
  const total = cards.reduce((n, c) => n + (c.votes || 0), 0) + (data?.blank_votes || 0);
  const canSelect = stage === 'CURSO' && !!data?.can_vote && !data.has_voted && !busy;
  const winner = cards.find(c => c.id === data?.winner_candidacy_id);
  const stageLabel = stage === 'PRE' ? 'PRÓXIMA' : stage === 'CURSO' ? 'EN CURSO' : 'FINALIZADA';
  const timeLabel = stage === 'PRE' ? 'HASTA EL INICIO' : stage === 'CURSO' ? 'HASTA EL CIERRE' : 'ELECCIÓN FINALIZADA';
  const timeValue = data ? stage === 'PRE' ? countdown(data.voting_starts_at, now)
    : stage === 'CURSO' ? countdown(data.voting_ends_at, now) : '00:00:00:00' : '00:00:00:00';
  const intro = regionalElection
    ? 'Para participar en las elecciones regionales, deberás presentar una fórmula de Gobernador y Vicegobernador, ambos del mismo partido o coalición y con ciudadanía regional. Solo un líder de partido puede presentarla.'
    : 'Para participar en las elecciones presidenciales, deberás presentar una fórmula de Presidente y Vicepresidente, ambos pertenecientes al mismo Partido o Coalición y con ciudadanía nacional. La candidatura deberá ser presentada por el líder del Partido o Coalición.';
  const voteStatus = !data ? '—' : stage === 'PRE' ? 'NO INICIÓ' : stage === 'POST' ? `${formatNum.format(total)} VOTOS`
    : data.has_voted ? 'REGISTRADO' : data.can_vote ? 'PENDIENTE' : 'NO HABILITADO';

  function selectCard(event: KeyboardEvent<HTMLElement>, id: number) {
    if (canSelect && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); setSelection(id);
    }
  }

  return <main className="aog-election-page">
    {loading && <p className="aog-election-feedback">CARGANDO ELECCIÓN...</p>}
    {error && <p className="aog-election-feedback" role="alert">{error}</p>}
    {data && <>
      <section className="aog-election-panel aog-election-overview">
        <div className="aog-election-panel-title aog-election-title-row">
          <span className="aog-election-title-text"><ElectionIcon name="parliaments" />{regionalElection ? 'ELECCIÓN DE GOBERNADOR' : 'ELECCIÓN PRESIDENCIAL'}</span>
          <span className={`aog-election-stage aog-election-stage-${stage?.toLowerCase()}`}>{stageLabel}</span>
        </div>
        <div className="aog-election-overview-body">
          <img className="aog-election-flag" src={data.nation.flag_url || BANDERA} alt={regionalElection ? 'Bandera regional' : 'Bandera nacional'} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = BANDERA; }} />
          <div className="aog-election-jurisdiction"><small>{regionalElection ? 'REGIÓN' : 'NACIÓN'}</small><strong>{data.nation.name || `${regionalElection ? 'REGIÓN' : 'NACIÓN'} #${data.nation.id}`}</strong><span>{stage === 'PRE' ? 'PERÍODO DE PRESENTACIÓN DE CANDIDATURAS' : stage === 'CURSO' ? 'VOTACIÓN ABIERTA' : 'ESCRUTINIO FINALIZADO'}</span></div>
        </div>
        <div className="aog-election-metrics">
          <Metric icon="events" value={<span className="aog-election-timer" aria-label={`${timeLabel.toLowerCase()}: ${timeValue}`}>{timeValue}</span>} label={timeLabel} />
          <Metric icon="players" value={formatNum.format(cards.length)} label="CANDIDATURAS" />
          <Metric icon="events" value={formatDate(stage === 'PRE' ? data.voting_starts_at : data.voting_ends_at)} label={stage === 'PRE' ? 'INICIO DE VOTACIÓN' : 'CIERRE DE VOTACIÓN'} />
          <Metric icon="statistics" value={voteStatus} label={stage === 'POST' ? 'VOTOS EMITIDOS' : 'TU VOTO'} />
        </div>
        <p className="aog-election-notice">{stage === 'PRE' ? intro : stage === 'CURSO' ? data.has_voted ? '¡TU VOTO FUE REGISTRADO!' : data.can_vote ? 'ELECCIÓN EN CURSO. SELECCIONÁ UNA FÓRMULA O EL VOTO EN BLANCO.' : `NECESITÁS CIUDADANÍA ${regionalElection ? 'REGIONAL' : 'NACIONAL'} DESDE HACE 24 HORAS PARA VOTAR.` : 'ELECCIONES FINALIZADAS. CONSULTÁ LOS RESULTADOS Y LOS CARGOS ELECTOS.'}</p>
      </section>

      <Panel title={stage === 'POST' ? 'CARGOS ELECTOS' : 'CARGOS EN DISPUTA'} icon="players" className="aog-election-offices">
        <div className="aog-election-office-people">
          {roles.map((role, i) => {
            const chosen = eligible.find(p => String(p.id) === (i ? vice : president));
            const canPick = stage === 'PRE' && showNomination && allowed;
            const person = stage === 'POST' && winner
              ? { name: i ? winner.vice_name : winner.president_name, photo: i ? winner.vice_photo : winner.president_photo }
              : chosen ? { name: chosen.name, photo: chosen.photo } : null;
            return <div className="aog-election-office" key={role}>
              <b>{role}</b>
              <button type="button" className={`aog-election-office-photo ${canPick ? 'pickable' : ''} ${picker === (i ? 'vice' : 'president') ? 'active' : ''}`} disabled={!canPick} onClick={() => setPicker(i ? 'vice' : 'president')} aria-label={`Seleccionar ${role.toLowerCase()}`}>
                <Image src={person?.photo} alt={role} />
              </button>
              <span className="aog-election-office-name">{person?.name || (canPick ? 'SELECCIONAR JUGADOR' : stage === 'POST' ? 'VACANTE' : 'POR DEFINIR')}</span>
            </div>;
          })}
        </div>
        {stage === 'PRE' && <div className="aog-election-nomination-inline">
          {alreadyNominated ? <p className="aog-election-hint">TU PARTIDO YA PRESENTÓ UNA CANDIDATURA.</p>
            : showNomination ? <>
              <p className="aog-election-hint">SELECCIONÁ LAS FOTOS PARA ARMAR LA FÓRMULA.</p>
              <div className="aog-election-nomination-actions">
                <button type="button" className="aog-election-action" disabled={busy || !president || !vice || president === vice} onClick={() => void nominate()}>CONFIRMAR CANDIDATURA</button>
                <button type="button" className="aog-election-action aog-election-action-outline" disabled={busy} onClick={() => { setShowNomination(false); setPicker(null); }}>CANCELAR</button>
              </div>
            </> : <button type="button" className="aog-election-action" disabled={!allowed} onClick={() => { setShowNomination(true); setPicker('president'); }}>{allowed ? 'PRESENTAR CANDIDATURA' : 'SOLO LÍDERES DE PARTIDO'}</button>}
        </div>}
        {stage === 'POST' && winner && <span className="aog-election-elected">FÓRMULA ELECTA</span>}
      </Panel>

      <Panel title={stage === 'POST' ? 'RESULTADOS DE LA ELECCIÓN' : 'CANDIDATURAS'} icon="party" className="aog-election-candidate-section">
        <div className="aog-election-candidates" role={canSelect ? 'radiogroup' : undefined} aria-label={canSelect ? 'Elegir candidatura' : undefined}>
          {cards.map(c => {
            const selected = selection === c.id && canSelect;
            const percentage = total ? Math.round((c.votes || 0) / total * 100) : 0;
            return <article key={c.id}
              className={`aog-election-candidate ${selected ? 'selected' : ''} ${stage === 'POST' && c.id === data.winner_candidacy_id ? 'is-winner' : ''} ${canSelect ? 'selectable' : ''}`}
              onClick={canSelect ? () => setSelection(c.id) : undefined}
              onKeyDown={canSelect ? event => selectCard(event, c.id) : undefined}
              role={canSelect ? 'radio' : undefined} aria-checked={canSelect ? selected : undefined} tabIndex={canSelect ? 0 : undefined}>
              <div className="aog-election-candidate-heading"><ElectionIcon name="party" /><span>{c.party}</span>{canSelect && <span className="aog-election-check" aria-hidden="true">{selected ? '●' : '○'}</span>}{stage === 'POST' && c.id === data.winner_candidacy_id && <span className="aog-election-winner-label">ELECTOS</span>}</div>
              <div className="aog-election-candidate-content">
                <Person id={c.president_id} name={c.president_name} photo={c.president_photo} role={roles[0]} onNavigate={onNavigate} />
                <div className="aog-election-person-divider" />
                <Person id={c.vice_id} name={c.vice_name} photo={c.vice_photo} role={roles[1]} onNavigate={onNavigate} />
              </div>
              <div className="aog-election-candidate-footer"><ElectionIcon name="coalition" /><span>{c.coalition || 'SIN COALICIÓN'}</span></div>
              {stage === 'POST' && <div className="aog-election-result"><div><strong>{percentage}%</strong><span>{formatNum.format(c.votes || 0)} VOTOS</span></div><div className="aog-election-result-track"><span style={{ width: `${percentage}%` }} /></div></div>}
            </article>;
          })}
          {!cards.length && <p className="aog-election-empty">SIN CANDIDATURAS</p>}
        </div>
        {stage === 'CURSO' && <div className="aog-election-vote-area">
          <button type="button" className={`aog-election-blank ${selection === 'blank' && canSelect ? 'selected' : ''}`} disabled={!canSelect} onClick={() => setSelection('blank')}>{selection === 'blank' && canSelect ? '●' : '○'} VOTO EN BLANCO</button>
          <button type="button" className="aog-election-action aog-election-vote-button" disabled={!canSelect || selection === null} onClick={() => void vote()}>{busy ? 'REGISTRANDO...' : data.has_voted ? 'YA VOTASTE' : 'VOTAR'}</button>
        </div>}
        {stage === 'POST' && <div className="aog-election-blank-results"><span>VOTOS EN BLANCO</span><strong>{formatNum.format(data.blank_votes || 0)}</strong><span>{total ? Math.round((data.blank_votes || 0) / total * 100) : 0}%</span></div>}
      </Panel>
    </>}
    {stage === 'PRE' && showNomination && picker && <div className="aog-election-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPicker(null); }}>
      <section className="aog-election-modal" role="dialog" aria-modal="true" aria-label={`Elegir ${picker === 'president' ? roles[0].toLowerCase() : roles[1].toLowerCase()}`}>
        <div className="aog-election-modal-header"><h3>SELECCIONAR {picker === 'president' ? roles[0] : roles[1]}</h3><button type="button" onClick={() => setPicker(null)} aria-label="Cerrar selector">✕</button></div>
        <p>JUGADORES DE TU PARTIDO O COALICIÓN</p>
        <div className="aog-election-picker" role="listbox" aria-label={`Elegir ${picker === 'president' ? roles[0].toLowerCase() : roles[1].toLowerCase()}`}>
          {eligible.filter(p => String(p.id) !== (picker === 'president' ? vice : president)).map(p => <button type="button" key={p.id} onClick={() => { if (picker === 'president') setPresident(String(p.id)); else setVice(String(p.id)); setPicker(null); }}><Image src={p.photo} alt="" /><span>{p.name}<small>#{p.id} · {p.party}</small></span></button>)}
          {!eligible.filter(p => String(p.id) !== (picker === 'president' ? vice : president)).length && <p>NO HAY CANDIDATOS DISPONIBLES</p>}
        </div>
      </section>
    </div>}
  </main>;
}
