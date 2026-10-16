import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import './home.css';

const counters = [
  ['JUGADORES','players'],['NACIONES','nation'],['REGIONES','region'],['TERRITORIOS','territory'],
  ['PARTIDOS','party'],['COALICIONES','coalition'],['PARLAMENTOS','parliaments'],['ORGANIZACIONES','organizations'],['CLUBES','clubs'],
] as const;

const homeIcon = (name:string) => `/assets/icons/icons/${name}.svg?v=0.0.3-custom-2`;
function HomeIcon({name,className=''}:{name:string,className?:string}) { return <span className={`aog-home-icon ${className}`} style={{maskImage:`url(${homeIcon(name)})`,WebkitMaskImage:`url(${homeIcon(name)})`}} aria-hidden="true"/>; }
type LocalEvent={key:string;label:string;stage:string;ends:string;href:string};
const localClock=(ends:string,now:number)=>{const d=Math.max(0,Math.ceil((new Date(ends).getTime()-now)/1000));const days=Math.floor(d/86400);const h=Math.floor((d%86400)/3600);const m=Math.floor((d%3600)/60);const sec=d%60;return `${days?`${days}D `:''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;};

type WorldNews = { id: number; kind:'foundation'|'update'; title:string; body:string; territory_id:number|null; nation_id:number|null; is_pinned:boolean; pinned_until:string|null; created_at:string };
const newsTime = (iso:string) => { const minutes=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/60000)); return minutes<1?'AHORA':minutes<60?`HACE ${minutes} MIN`:minutes<1440?`HACE ${Math.floor(minutes/60)} H`:`HACE ${Math.floor(minutes/1440)} D`; };
type ChatMessage = {
  id: number;
  player_id: number;
  channel: string;
  content: string;
  created_at: string;
  players: { name: string; photo_url: string | null } | null;
};

const LANGUAGES = [
  { code: 'es', flag: '/assets/flags/es.svg', name: 'Español' },
  { code: 'en', flag: '/assets/flags/gb.svg', name: 'English' },
  { code: 'pt', flag: '/assets/flags/br.svg', name: 'Português' },
  { code: 'fr', flag: '/assets/flags/fr.svg', name: 'Français' },
  { code: 'de', flag: '/assets/flags/de.svg', name: 'Deutsch' },
  { code: 'it', flag: '/assets/flags/it.svg', name: 'Italiano' },
] as const;
type ChatLanguage = typeof LANGUAGES[number]['code'];
const DEFAULT_AVATAR = '/assets/photos/nophoto.png';
const FLAG_EMOJI: Record<ChatLanguage, string> = {
  es: '🇪🇸', en: '🇬🇧', pt: '🇧🇷', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹',
};

function LanguageFlag({ code, src }: { code: ChatLanguage; src: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  return broken ? (
    <span className="aog-chat-language-flag" style={{ display:'grid', placeItems:'center', fontSize: '25px', lineHeight: 1 }} aria-hidden="true">
      {FLAG_EMOJI[code]}
    </span>
  ) : (
    <img src={src} alt="" className="aog-chat-language-flag" onError={() => setBroken(true)} />
  );
}



export default function HomePage({onNavigate=path=>{window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));}}:{onNavigate?:(path:string)=>void}={}) {
  const [draft, setDraft] = useState('');
  const [language, setLanguage] = useState<ChatLanguage>('es');
  const messagesEnd = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [myId,setMyId]=useState<number|null>(null);
  const [location, setLocation] = useState<{territory_id:number;region_id:number|null;nation_id:number|null;nation_name:string|null;region_name:string|null}|null>(null);
  const [localEvents,setLocalEvents]=useState<LocalEvent[]>([]);
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer)},[]);
  const [sending,setSending]=useState(false);
  const [news,setNews]=useState<WorldNews[]>([]);
  const [newsError,setNewsError]=useState('');
  const [newsLoading,setNewsLoading]=useState(true);
  const [newsTick,setNewsTick]=useState(0);
  useEffect(()=>{const timer=window.setInterval(()=>setNewsTick(v=>v+1),15000);return()=>window.clearInterval(timer)},[]);
  useEffect(() => {
    let active=true;
    const loadNews=async () => {
      const {data,error}=await supabase.from('aog_world_news')
        .select('id,kind,title,body,territory_id,nation_id,is_pinned,pinned_until,created_at')
        .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200);
      if(!active)return;
      if(error)setNewsError('No se pudieron cargar las noticias');
      else {setNews((data??[]) as WorldNews[]);setNewsError('');}
      setNewsLoading(false);
    };
    void loadNews();
    const channel=supabase.channel('aog-world-news-home')
      .on('postgres_changes',{event:'*',schema:'public',table:'aog_world_news'},()=>{void loadNews();})
      .subscribe();
    // Realtime actualiza al publicarse una noticia; el intervalo solo recupera desconexiones.
    const onVisible=()=>{if(document.visibilityState==='visible')void loadNews();};
    document.addEventListener('visibilitychange',onVisible);
    const refresh=window.setInterval(()=>{void loadNews();},30000);
    return()=>{active=false;document.removeEventListener('visibilitychange',onVisible);window.clearInterval(refresh);void supabase.removeChannel(channel);};
  },[]);
  void newsTick;
  const pinnedNews=news.find(item=>item.kind==='update'&&item.is_pinned&&item.pinned_until&&new Date(item.pinned_until).getTime()>Date.now());
  const [playerCount,setPlayerCount]=useState<number|null>(null);
  const [partyCount,setPartyCount]=useState<number|null>(0);
  const [worldCounts,setWorldCounts]=useState<Record<string,number>>({coalition:0,territory:59960});
  useEffect(() => {
    let active = true;

    void supabase.from('players').select('id', {count:'exact', head:true})
      .then(({count,error}) => { if(active && !error) setPlayerCount(count); });
    void supabase.rpc('aog_party_count').then(({data,error}) => {
      if(active&&!error&&data!==null)setPartyCount(Number(data));
    });
    void Promise.all([
      supabase.from('aog_coalitions').select('id', { count:'exact', head:true }),
      supabase.from('world_territories').select('id', { count:'exact', head:true }),
      supabase.from('aog_founded_regions').select('id', { count:'exact', head:true }),
      supabase.from('aog_founded_nations').select('id', { count:'exact', head:true }),
    ]).then(results => {
      if (!active) return;
      const keys = ['coalition', 'territory', 'region', 'nation'];
      const next: Record<string,number> = {};
      results.forEach((result,index) => { if (!result.error && result.count !== null) next[keys[index]] = result.count; });
      setWorldCounts(previous => ({ ...previous, ...next }));
    });
    void supabase.auth.getUser().then(async ({data:{user}}) => {
      if(!user || !active) return;
      const {data} = await supabase.from('players').select('id,territory_id').eq('auth_id',user.id).single();
      if(active && data) {
        setMyId(data.id);
        if (data.territory_id != null) {
          const territoryId=Number(data.territory_id);
          setLocation({territory_id:territoryId,region_id:null,nation_id:null,nation_name:null,region_name:null});
          const {data:pol}=await supabase.from('map_territory_politics')
            .select('region_id,nation_id,nation_name,region_name').eq('territory_id',territoryId).maybeSingle();
          if(active && pol) setLocation({territory_id:territoryId,region_id:pol.region_id??null,nation_id:pol.nation_id??null,nation_name:pol.nation_name??null,region_name:pol.region_name??null});
        }
      }
    });

    return () => { active = false; };
  }, []);

  // Mostrar únicamente elecciones de la nación/región donde está ubicado el jugador.
  useEffect(()=>{
    if(!location){setLocalEvents([]);return;}
    let active=true;
    const load=async()=>{
      const events:LocalEvent[]=[];
      const ingest=(items:any[],kind:'presidential'|'governor')=>{
        for(const item of items){
          const start=new Date(item.pre_starts_at).getTime();
          const voting=new Date(item.voting_starts_at).getTime();
          const end=new Date(item.voting_ends_at).getTime();
          const now=Date.now();
          if(item.completed_at || !Number.isFinite(start) || now<start || now>=end)continue;
          events.push({key:`${kind}-${item.id}`,label:kind==='presidential'?'ELECCIÓN PRESIDENCIAL':'ELECCIÓN DE GOBERNADOR',stage:now<voting?'EN PREPARACIÓN':'EN VOTACIÓN',ends:now<voting?item.voting_starts_at:item.voting_ends_at,href:`/election?id=${item.id}${kind==='governor'?'&type=governor':''}`});
        }
      };
      const jobs:Promise<void>[]=[];
      if(location.nation_id) jobs.push((async()=>{const {data,error}=await supabase.rpc('aog_nation_election_summaries',{p_nation_id:location.nation_id});if(!error)ingest(Array.isArray(data)?data:[],'presidential')})());
      if(location.region_id) jobs.push((async()=>{const {data,error}=await supabase.rpc('aog_governor_region_elections',{p_region_id:location.region_id});if(!error)ingest(Array.isArray(data)?data:[],'governor')})());
      await Promise.all(jobs);
      if(active)setLocalEvents(events.sort((a,b)=>new Date(a.ends).getTime()-new Date(b.ends).getTime()));
    };
    void load();const interval=window.setInterval(()=>void load(),15000);
    return()=>{active=false;window.clearInterval(interval)};
  },[location?.territory_id,location?.region_id,location?.nation_id]);

  useEffect(() => {
    let active = true;
    setMessages([]);
    setNotice('');
    const load = async () => {
      const {data,error} = await supabase
        .from('chat_messages')
        .select('id,player_id,channel,content,created_at,players(name,photo_url)')
        .eq('channel',language)
        .order('id',{ascending:false})
        .limit(100);
      if(!active) return;
      if(error) { setNotice(error.message); return; }
      setMessages(((data ?? []) as unknown as ChatMessage[]).reverse());
    };

    void load();
    const subscription = supabase
      .channel(`aog-chat-${language}`)
      .on('postgres_changes',
        { event:'INSERT',schema:'public',table:'chat_messages',filter:`channel=eq.${language}` },
        () => { void load(); })
      .subscribe();

    return () => { active = false; void supabase.removeChannel(subscription); };
  }, [language]);


  useEffect(() => {
    if (!languageMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) setLanguageMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLanguageMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [languageMenuOpen]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({block:'nearest'});
  }, [messages]);

  async function handleMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content=draft.trim();
    if (!content || sending)return;
    setSending(true);setNotice('');
    const {error}=await supabase.rpc('send_global_chat_message',{message_text:content, message_channel:language});
    if(error)setNotice(error.message);
    else setDraft('');
    setSending(false);
  }

  return (
    <main className="aog-home" aria-label="Inicio">
      <div className="aog-home-top">
        <section className="aog-home-panel aog-home-chat" aria-labelledby="aog-home-chat-label">
          <h2 className="aog-home-panel-title" id="aog-home-chat-label">CHAT GLOBAL <small className="aog-home-chat-online">GLOBAL</small></h2>
          <div className="aog-home-chat-messages" aria-live="polite">
            {messages.length ? messages.map(msg => (
              <article key={msg.id} className={`aog-chat-message ${msg.player_id===myId ? 'aog-chat-own' : ''}`}>
                <button type="button" className="aog-chat-profile-link" onClick={()=>onNavigate(`/profile/${msg.player_id}`)}
                  aria-label={`Ver perfil de ${msg.players?.name||'jugador'} #${msg.player_id}`} title="Ver perfil">
                  <img src={msg.players?.photo_url || DEFAULT_AVATAR} alt="" onError={event=>{event.currentTarget.src=DEFAULT_AVATAR;}} />
                </button>
                <div className="aog-chat-body">
                  <div className="aog-chat-name"><strong>{msg.players?.name || 'JUGADOR'}</strong><span>#{msg.player_id}</span></div>
                  <p>{msg.content}</p>
                </div>
                <time className="aog-chat-timestamp" dateTime={msg.created_at}><span>{new Date(msg.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})}</span><span>{new Date(msg.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</span></time>
              </article>
            )) : <p className="aog-home-empty">Sin mensajes en este canal</p>}
            <div ref={messagesEnd} />
          </div>
          <form className="aog-home-chat-compose" onSubmit={handleMessage}>
            <input
              aria-label="Mensaje para el chat global"
              placeholder="ESCRIBIR..."
              value={draft}
              onChange={event => {setDraft(event.target.value);setNotice('');}}
              maxLength={500}
            />
            <button className="aog-home-send" type="submit" disabled={sending} aria-label="Enviar mensaje" title="Enviar mensaje">➤</button>
            <div className="aog-chat-language-picker" ref={languageMenuRef}>
              <button
                className="aog-chat-language-button"
                type="button"
                aria-label={`Canal de chat: ${LANGUAGES.find(item => item.code === language)?.name}. Cambiar idioma`}
                title={`Idioma: ${LANGUAGES.find(item => item.code === language)?.name}`}
                aria-haspopup="menu"
                aria-expanded={languageMenuOpen}
                onClick={() => setLanguageMenuOpen(value => !value)}
              >
                <LanguageFlag code={language} src={LANGUAGES.find(item => item.code === language)!.flag} />
              </button>
              {languageMenuOpen && (
                <div className="aog-chat-language-menu" role="menu" aria-label="Seleccionar idioma del chat">
                  {LANGUAGES.map(item => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={language === item.code}
                      className={`aog-chat-language-option ${language === item.code ? 'is-active' : ''}`}
                      key={item.code}
                      title={item.name}
                      aria-label={item.name}
                      onClick={() => {
                        setLanguage(item.code);
                        setLanguageMenuOpen(false);
                      }}
                    >
                      <LanguageFlag code={item.code} src={item.flag} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </form>
          {notice && <p className="aog-home-notice" role="status">{notice}</p>}
        </section>
        <section className="aog-home-panel aog-home-news" aria-labelledby="aog-home-news-label">
          <h2 className="aog-home-panel-title" id="aog-home-news-label">NOTICIAS GLOBALES</h2>
          <div className="aog-world-news-feed" aria-live="polite">
            {pinnedNews && <article className="aog-world-news-item aog-world-news-update aog-world-news-pinned" key={`pin-${pinnedNews.id}`}>
              <span className="aog-world-news-icon" aria-hidden="true"><HomeIcon name="update"/></span>
              <div className="aog-world-news-content"><strong>{pinnedNews.title}</strong><p>{pinnedNews.body}</p></div>
              <time dateTime={pinnedNews.created_at}>{newsTime(pinnedNews.created_at)}</time>
            </article>}
            {news.filter(item=>item.id!==pinnedNews?.id).map(item=><article key={item.id} className={`aog-world-news-item ${item.kind==='update'?'aog-world-news-update':'aog-world-news-foundation'}`}>
              <span className="aog-world-news-icon" aria-hidden="true"><HomeIcon name={item.kind==='update'?'update':'foundation'}/></span>
              <div className="aog-world-news-content"><strong>{item.title}</strong><p>{item.body}</p></div>
              <time dateTime={item.created_at}>{newsTime(item.created_at)}</time>
            </article>)}
            {newsLoading && <p className="aog-home-empty">CARGANDO...</p>}
            {!newsLoading&&newsError&&<p className="aog-home-empty">{newsError}</p>}
            {!newsLoading&&!newsError&&news.length===0&&<p className="aog-home-empty">SIN NOTICIAS</p>}
          </div>
        </section>
      </div>
      <section className="aog-home-location aog-flat-panel" aria-label="Ubicación actual">
        <h2>UBICACIÓN ACTUAL</h2>
        <button className="aog-home-location-link" type="button" onClick={()=>onNavigate(location?`/territory?id=${location.territory_id}`:'/map')}>
          <strong>{location?`TERRITORIO #${location.territory_id}`:'UBICACIÓN NO DISPONIBLE'}</strong>
          <span>{location?.nation_name||'INDEPENDIENTE'}</span>
        </button>
      </section>
      <section className="aog-home-events aog-flat-panel" aria-labelledby="aog-home-events-label">
        <h2 id="aog-home-events-label">EVENTOS ACTIVOS</h2>
        <div className="aog-home-events-list">
          {localEvents.length?localEvents.map(item=><button key={item.key} type="button" className="aog-home-event-row" onClick={()=>onNavigate(item.href)}>
            <span>{item.label} <b>{item.stage}</b></span>
            <time>{localClock(item.ends,clock)}</time><span className="aog-home-event-arrow">⟶</span>
          </button>):<p className="aog-home-empty">SIN EVENTOS ACTIVOS EN TU TERRITORIO</p>}
        </div>
      </section>
      <section className="aog-home-stats aog-flat-panel" aria-label="Estadísticas mundiales">
        <h2>ESTADÍSTICAS MUNDIALES</h2>
        <div className="aog-home-stats-grid">
          {counters.map(([label,key])=>(
            <article className="aog-home-stat" key={key}>
              <HomeIcon name={key} className="aog-home-stat-icon"/>
              <div><strong>{key==='players'&&playerCount!==null?playerCount.toLocaleString('es-AR'):key==='party'&&partyCount!==null?partyCount.toLocaleString('es-AR'):worldCounts[key]!==undefined?worldCounts[key].toLocaleString('es-AR'):'—'}</strong><span>{label.charAt(0)+label.slice(1).toLowerCase()}</span></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
