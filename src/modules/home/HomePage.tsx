import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import './home.css';

const counters = [
  ['JUGADORES', 'players'], ['PARTIDOS', 'party'], ['COALICIONES', 'coalition'],
  ['TERRITORIOS', 'territory'], ['REGIONES', 'region'], ['NACIONES', 'nation'],
  ['ORGANIZACIONES', 'organizations'], ['PARLAMENTOS', 'parliaments'],
] as const;

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



export default function HomePage() {
  const [draft, setDraft] = useState('');
  const [language, setLanguage] = useState<ChatLanguage>('es');
  const messagesEnd = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [myId,setMyId]=useState<number|null>(null);
  const [sending,setSending]=useState(false);
  const [playerCount,setPlayerCount]=useState<number|null>(null);
  useEffect(() => {
    let active = true;

    void supabase.from('players').select('id', {count:'exact', head:true})
      .then(({count,error}) => { if(active && !error) setPlayerCount(count); });
    void supabase.auth.getUser().then(async ({data:{user}}) => {
      if(!user || !active) return;
      const {data} = await supabase.from('players').select('id').eq('auth_id',user.id).single();
      if(active && data) setMyId(data.id);
    });

    return () => { active = false; };
  }, []);

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
    <main className="aog-home" aria-labelledby="aog-home-title">
      <h1 className="aog-home-heading" id="aog-home-title">INICIO</h1>
      <div className="aog-home-top">
        <section className="aog-home-panel aog-home-chat" aria-labelledby="aog-home-chat-label">
          <h2 className="aog-home-panel-title" id="aog-home-chat-label">CHAT GLOBAL</h2>
          <div className="aog-home-chat-messages" aria-live="polite">
            {messages.length ? messages.map(msg => (
              <article key={msg.id} className={`aog-chat-message ${msg.player_id===myId ? 'aog-chat-own' : ''}`}>
                <div className="aog-chat-author">
                  <img
                    src={msg.players?.photo_url || DEFAULT_AVATAR}
                    alt=""
                    onError={event => { event.currentTarget.src = DEFAULT_AVATAR; }}
                  />
                  <div className="aog-chat-author-info">
                    <div className="aog-chat-name">
                      <strong>{msg.players?.name || 'JUGADOR'}</strong>
                      <span>#{msg.player_id}</span>
                    </div>
                    <time dateTime={msg.created_at}>
                      {new Date(msg.created_at).toLocaleString('es-AR')}
                    </time>
                  </div>
                </div>
                <p>{msg.content}</p>
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
          <h2 className="aog-home-panel-title" id="aog-home-news-label">NOTICIAS MUNDIALES</h2>
          <p className="aog-home-empty">Las noticias del mundo aparecerán aquí</p>
        </section>
      </div>
      <section className="aog-home-stats" aria-label="Estadísticas del mundo">
        {counters.map(([label, key]) => (
          <article className="aog-home-panel aog-home-counter" key={key}>
            <h2 className="aog-home-panel-title">{label}</h2>
            <strong className="aog-home-counter-value" aria-label={`${label}: ${key === 'players' && playerCount !== null ? playerCount : 'datos pendientes'}`}>{key === 'players' && playerCount !== null ? playerCount.toLocaleString('es-AR') : '—'}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
