import { useCallback, useEffect, useRef, useState } from 'react';
import type { Player } from '../auth/player';
import { supabase } from '../../lib/supabase';
import {
  loadConversations, loadContact, loadMessages, markConversationRead, sendDirectMessage,
  type ChatContact, type Conversation, type DirectMessage,
} from './messagesApi';
import './messages.css';

const DEFAULT_AVATAR = '/assets/photos/nophoto.png';
const dates = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const times = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
function formatStamp(raw: string) {
  const date = new Date(raw);
  return `${dates.format(date)} · ${times.format(date)}`;
}
function mergeMessages(previous: DirectMessage[], newer: DirectMessage[]): DirectMessage[] {
  if (!previous.length) return newer;
  const known = new Set(previous.map(item => item.id));
  const additions = newer.filter(item => !known.has(item.id));
  return additions.length ? [...previous, ...additions].sort((a,b) => a.id-b.id) : previous;
}

export default function MessagesPage({player, peerId, onNavigate, incomingSignal, onRead}: {
  player: Player;
  peerId: number | null;
  onNavigate: (path: string) => void;
  incomingSignal: number;
  onRead: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contact, setContact] = useState<ChatContact | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [oldestEnd, setOldestEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(peerId);
  const onReadRef = useRef(onRead);
  selectedRef.current = peerId;
  onReadRef.current = onRead;

  const refreshInbox = useCallback(async () => {
    const inbox = await loadConversations();
    setConversations(inbox);
    return inbox;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadConversations().then(inbox => { if (active) setConversations(inbox); })
      .catch(err => {if (active) setError(err instanceof Error ? err.message : 'No se pudieron cargar las conversaciones.');})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [player.id]);

  useEffect(() => {
    if (!peerId || peerId === player.id) {
      setContact(null);
      setMessages([]);
      setChatLoading(false);
      return;
    }
    let active = true;
    setChatLoading(true);
    setError('');
    setDraft('');
    setContact(null);
    setMessages([]);
    setOldestEnd(false);
    const fromInbox = conversations.find(row => Number(row.other_id) === peerId);
    const lookup = fromInbox
      ? Promise.resolve({id:peerId, name:fromInbox.other_name, photo_url:fromInbox.other_photo_url})
      : loadContact(peerId);
    void Promise.all([lookup, loadMessages(player.id, peerId)])
      .then(async ([who, history]) => {
        if (!active) return;
        setContact(who);
        setMessages(history);
        setOldestEnd(history.length < 50);
        await markConversationRead(peerId);
        if (active) {onReadRef.current(); void refreshInbox();}
      })
      .catch(err => {if(active)setError(err instanceof Error ? err.message : 'No se pudo abrir el chat.');})
      .finally(() => {if(active)setChatLoading(false);});
    return () => {active=false;};
    // No reabrir el chat por cada actualización del listado: reiniciaría el borrador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, peerId, refreshInbox]);

  useEffect(() => {
    if (!incomingSignal) return;
    let active = true;
    void refreshInbox().catch(() => {});
    if (peerId && peerId !== player.id) {
      void loadMessages(player.id, peerId).then(async history => {
        if (!active) return;
        setMessages(prev => mergeMessages(prev,history));
        await markConversationRead(peerId);
        if (active) { onReadRef.current(); void refreshInbox(); }
      }).catch(() => {});
    }
    return () => {active=false;};
  }, [incomingSignal, peerId, player.id, refreshInbox]);

  // Realtime actualiza conversaciones abiertas incluso si su mensaje ya estaba leído.
  useEffect(() => {
    const channel = supabase.channel(`aog-dm-page-${player.id}`)
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'aog_direct_messages'}, payload => {
        const msg = payload.new as DirectMessage;
        if (msg.sender_id !== player.id && msg.recipient_id !== player.id) return;
        void refreshInbox().catch(() => {});
        if (selectedRef.current === msg.sender_id || selectedRef.current === msg.recipient_id) {
          void loadMessages(player.id, selectedRef.current).then(async history => {
            if (selectedRef.current !== msg.sender_id && selectedRef.current !== msg.recipient_id) return;
            setMessages(prev => mergeMessages(prev,history));
            if (msg.recipient_id === player.id) {
              await markConversationRead(msg.sender_id);
              onReadRef.current();
              void refreshInbox();
            }
          }).catch(() => {});
        }
      }).subscribe();
    // Alternativa a Realtime: mantiene el chat actualizado si no se habilitó la publicación.
    const timer = window.setInterval(() => {
      void refreshInbox().catch(() => {});
      if (selectedRef.current) {
        const peer = selectedRef.current;
        void loadMessages(player.id, peer).then(async history => {
          if (selectedRef.current !== peer) return;
          setMessages(prev => mergeMessages(prev,history));
          if (history.some(msg => msg.sender_id === peer && !msg.read_at)) {
            await markConversationRead(peer);
            onReadRef.current();
            void refreshInbox();
          }
        }).catch(() => {});
      }
    }, 12000);
    return () => {window.clearInterval(timer); void supabase.removeChannel(channel);};
  }, [player.id, refreshInbox]);

  useEffect(() => {bottomRef.current?.scrollIntoView({block:'end',behavior:'smooth'});}, [messages.at(-1)?.id, peerId]);

  const openChat = (id: number) => onNavigate(`/messages/${id}`);
  const sendMessage = async () => {
    if (!peerId || peerId === player.id || sending || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const msg = await sendDirectMessage(player.id, peerId, draft);
      setDraft('');
      setMessages(prev => prev.some(item => item.id === msg.id) ? prev : [...prev, msg]);
      await refreshInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje.');
    } finally {setSending(false);}
  };
  const older = async () => {
    if (!peerId || !messages.length) return;
    try {
      const history = await loadMessages(player.id, peerId, messages[0].id);
      setMessages(prev => [...history.filter(item => !prev.some(known=>known.id===item.id)), ...prev]);
      setOldestEnd(history.length < 50);
    } catch (err) {setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');}
  };

  return <main className="aog-dm-page">
    <div className="aog-dm-heading"><h1>MENSAJES PRIVADOS</h1><span>CONVERSACIONES ENTRE JUGADORES · SOLO TEXTO</span></div>
    <div className={`aog-dm-layout ${peerId ? 'aog-dm-has-peer' : ''}`}>
      <aside className="aog-dm-sidebar">
        <h2>CONVERSACIONES</h2>
        <div className="aog-dm-conversation-list">
          {loading && <p className="aog-dm-hint">CARGANDO...</p>}
          {!loading && conversations.length === 0 && <p className="aog-dm-hint">TODAVÍA NO TENÉS CONVERSACIONES. ENTRÁ AL PERFIL DE OTRO JUGADOR Y ELEGÍ ENVIAR MENSAJE.</p>}
          {conversations.map(item => <button type="button" key={item.other_id} className={`aog-dm-conversation ${peerId === Number(item.other_id) ? 'is-selected' : ''}`} onClick={()=>openChat(Number(item.other_id))}>
            <img src={item.other_photo_url || DEFAULT_AVATAR} alt="" />
            <span className="aog-dm-conversation-info"><strong>{item.other_name}</strong><small>{item.last_content}</small></span>
            {Number(item.unread_count) > 0 && <b className="aog-dm-unread">{item.unread_count}</b>}
          </button>)}
        </div>
      </aside>
      <section className="aog-dm-chat" aria-label="Chat privado">
        {peerId && peerId !== player.id ? <>
          <header className="aog-dm-chat-head">
            <button type="button" className="aog-dm-back" onClick={()=>onNavigate('/messages')} aria-label="Volver a conversaciones">←</button>
            <img src={contact?.photo_url || DEFAULT_AVATAR} alt="" />
            <div><strong>{contact?.name || `JUGADOR #${peerId}`}</strong><a href={`/profile/${peerId}`} onClick={e=>{e.preventDefault();onNavigate(`/profile/${peerId}`);}}>VER PERFIL</a></div>
          </header>
          <div className="aog-dm-history">
            {chatLoading ? <p className="aog-dm-hint">CARGANDO MENSAJES...</p> : <>
              {!oldestEnd && messages.length > 0 && <button type="button" className="aog-dm-older" onClick={()=>void older()}>CARGAR MENSAJES ANTERIORES</button>}
              {messages.length === 0 && <p className="aog-dm-hint">TODAVÍA NO HAY MENSAJES. ¡ESCRIBÍ EL PRIMERO!</p>}
              {messages.map(msg => <div key={msg.id} className={`aog-dm-bubble ${msg.sender_id === player.id ? 'is-self' : 'is-other'}`}>
                <p>{msg.content}</p><time dateTime={msg.created_at}>{formatStamp(msg.created_at)}</time>
              </div>)}
              <div ref={bottomRef} />
            </>}
          </div>
          <form className="aog-dm-compose" onSubmit={event=>{event.preventDefault();void sendMessage();}}>
            <textarea value={draft} maxLength={2000} rows={2} aria-label="Escribir mensaje" placeholder="ESCRIBÍ TU MENSAJE..." onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key === 'Enter' && !event.shiftKey){event.preventDefault();void sendMessage();}}} disabled={sending || chatLoading} />
            <button type="submit" disabled={!draft.trim() || sending || chatLoading}>{sending?'ENVIANDO...':'ENVIAR'}</button>
          </form>
          <small className="aog-dm-counter">{draft.length}/2.000 · ENTER PARA ENVIAR · SHIFT+ENTER PARA OTRA LÍNEA</small>
        </> : <div className="aog-dm-empty">{peerId === player.id ? 'NO PODÉS ENVIARTE MENSAJES A VOS MISMO.' : 'SELECCIONÁ UNA CONVERSACIÓN O ABRÍ EL PERFIL DE OTRO JUGADOR.'}</div>}
        {error && <p className="aog-dm-error" role="alert">{error}</p>}
      </section>
    </div>
  </main>;
}
