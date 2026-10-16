import { useEffect, useRef, useState } from 'react';
import { AuthScreen } from './modules/auth/AuthScreen';
import { fetchPlayer, getXp, logout, type Player } from './modules/auth/player';
import { supabase } from './lib/supabase';
import { ProfilePage } from './modules/profile/ProfilePage';
import PublicProfilePage from './modules/profile/PublicProfilePage';
import HomePage from './modules/home/HomePage';
import { MigratedPage } from './modules/MigratedPage';
import MapPage from './modules/map/MapPage';
import WorkPage from './modules/work/WorkPage';
import StoragePage from './modules/storage/StoragePage';
import PartyPage from './modules/party/PartyPage';
import CoalitionPage from './modules/coalition/CoalitionPage';
import TerritoryPage from './modules/territory/TerritoryPage';
import ElectionPage from './modules/election/ElectionPage';
import NewsPage from './modules/news/NewsPage';
import MessagesPage from './modules/messages/MessagesPage';
import { getUnreadDirectMessages } from './modules/messages/messagesApi';
import LoadingScreen from './components/loading/LoadingScreen';
import { Header, type HeaderAction, type HeaderSection } from './components/header/Header';
import { useTheme } from './theme/theme';
import { useAppRoute } from './app/router';

export default function App() {
  const { route, navigate, pathname } = useAppRoute();
  const section = route === 'login' || route === 'register' ? 'home' : route;
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError,setAuthError] = useState('');
  const { accentColor, setAccentColor, resetAccentColor } = useTheme();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [messageFlashKey, setMessageFlashKey] = useState(0);
  const [incomingMessageSignal, setIncomingMessageSignal] = useState(0);
  const routeRef = useRef(pathname);
  const refreshUnreadRef = useRef<() => void>(() => {});
  routeRef.current = pathname;

  useEffect(() => {
    let current = true;
    let generation = 0;
    async function refresh(authId:string|null) {
      const request=++generation;
      if (!authId) {if(current){setPlayer(null);setLoading(false);}return;}
      try {
        const next=await fetchPlayer(authId);
        if(current && request===generation){setPlayer(next);setAuthError('');}
      }catch(err){if(current && request===generation){setPlayer(null);setAuthError(err instanceof Error?err.message:'Error de sesión');}}
      finally {if(current && request===generation)setLoading(false);}
    }
    void supabase.auth.getSession().then(({data:{session}})=>refresh(session?.user.id ?? null));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      // Evitamos llamadas Supabase dentro del callback de autenticación.
      queueMicrotask(()=>{if(current)void refresh(session?.user.id ?? null);});
    });
    return ()=>{current=false;subscription.unsubscribe();};
  },[]);

  // Actualiza la energía visible en todas las páginas sin modificar la ruta.
  // La energía la calcula el servidor, no este intervalo.
  useEffect(() => {
    if (!player?.authId) return;
    const authId = player.authId;
    let active = true;
    let inFlight = false;
    const timer = window.setInterval(async () => {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const updated = await fetchPlayer(authId);
        if (active) setPlayer(updated);
      } catch (error) {
        console.warn('No se pudo sincronizar la energía:', error);
      } finally {
        inFlight = false;
      }
    }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [player?.authId]);

  useEffect(() => {
    // Esperar a que Supabase restaure la sesión antes de decidir una redirección.
    // De lo contrario, F5 desde /home, /map, etc. enviaba a /login y después a /profile.
    if (loading) return;
    const publicRoute = route === 'login' || route === 'register';
    if (!player && !publicRoute) navigate('/login', true);
    else if (player && publicRoute) navigate('/profile', true);
  }, [loading, player, route]);

  // Sincronización global de mensajes: aviso visible incluso fuera de /messages.
  // Realtime cuando esté habilitado, más sondeo de respaldo por si se desconecta.
  useEffect(() => {
    const selfId = player?.id;
    if (!selfId) {setUnreadMessages(0); refreshUnreadRef.current = () => {}; return;}
    let mounted = true;
    let initialized = false;
    let highestUnreadId = 0;
    let busy = false;
    let needsRefresh = false;
    const refreshUnread = async () => {
      if (busy) {needsRefresh = true; return;}
      busy = true;
      try {
        const {count,lastId,senderId} = await getUnreadDirectMessages(selfId);
        if (!mounted) return;
        const isNew = initialized && lastId > highestUnreadId;
        highestUnreadId = Math.max(highestUnreadId,lastId);
        initialized = true;
        setUnreadMessages(count);
        if (isNew) {
          setIncomingMessageSignal(value=>value+1);
          // Un chat abierto se marca como leído y no genera una alarma persistente.
          const currentChat = routeRef.current.match(/^\/messages\/(\d+)\/?$/);
          if (!currentChat || Number(currentChat[1]) !== senderId) setMessageFlashKey(value=>value+1);
        }
      } catch (cause) {
        console.warn('No se pudo verificar la mensajería:',cause);
      } finally {
        busy=false;
        if (mounted && needsRefresh) {needsRefresh=false;void refreshUnread();}
      }
    };
    refreshUnreadRef.current = () => {void refreshUnread();};
    void refreshUnread();
    const timer = window.setInterval(() => {void refreshUnread();},12000);
    const onVisible = () => {if(document.visibilityState === 'visible')void refreshUnread();};
    document.addEventListener('visibilitychange',onVisible);
    const channel = supabase.channel(`aog-message-notify-${selfId}`)
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'aog_direct_messages',filter:`recipient_id=eq.${selfId}`,
      },()=>{
        if (!mounted) return;
        setIncomingMessageSignal(value=>value+1);
        void refreshUnread();
      }).subscribe();
    return () => {
      mounted=false;
      refreshUnreadRef.current=()=>{};
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisible);
      void supabase.removeChannel(channel);
    };
  },[player?.id]);

  if (loading) return <LoadingScreen />;
  if (!player) return <>{authError && <p role="alert" className="bg-[#310909] p-3 text-white">{authError}</p>}<AuthScreen
    mode={route === 'register' ? 'register' : 'login'}
    onNavigate={navigate}
    onAuthenticated={() => { /* La sesión activa dispara el cambio de ruta cuando corresponda. */ }}
  /></>;

  const chatMatch=pathname.match(/^\/messages\/(\d+)\/?$/);
  const chatId=chatMatch?Number(chatMatch[1]):null;
  const pathMatch=pathname.match(/^\/profile\/(\d+)\/?$/);
  const viewedPlayerId=pathMatch?Number(pathMatch[1]):null;
  const isOtherProfile=section==='profile'&&viewedPlayerId!==null&&viewedPlayerId!==player.id;
  const {level,xp,required}=getXp(player);
  return <div className={section === 'map' ? 'aog-map-shell bg-[#080808] text-white' : 'min-h-screen bg-[#080808] text-white'}>
    <Header
      activeSection={(section === 'config' ? 'settings' : section) as HeaderAction | HeaderSection}
      level={level}
      playerName={player.name}
      xp={xp}
      xpRequired={required}
      energy={Number(player.energy)||0}
      energyMax={player.premium===true?250:100}
      money={Number(player.money)||0}
      geocracy={Number(player.gold)||0}
      profileImageUrl={player.photo?.url || '/assets/photos/nophoto.png'}
      onLink={(path, event) => { event.preventDefault(); navigate(path); }}
      onNavigate={(next) => navigate(`/${next}`)}
      onProfile={()=>navigate('/profile')}
      unreadMessages={unreadMessages}
      messageFlashKey={messageFlashKey}
    />
    {section === 'profile'
      ? isOtherProfile ? <PublicProfilePage playerId={viewedPlayerId!} onNavigate={navigate}/> : <ProfilePage player={player} onPlayerChange={setPlayer} onLogout={() => { void logout().then(()=>{ setPlayer(null); navigate('/login',true); }); }}/>
      : section === 'messages'
        ? <MessagesPage player={player} peerId={chatId} onNavigate={navigate} incomingSignal={incomingMessageSignal} onRead={()=>refreshUnreadRef.current()}/>
      : section === 'map'
        ? <MapPage player={player} onPlayerChange={setPlayer} onNavigate={navigate}/>
      : section === 'work'
        ? <WorkPage player={player} onPlayerChange={setPlayer}/>
      : section === 'storage'
        ? <StoragePage player={player} onNavigate={navigate}/>
      : section === 'party'
        ? <PartyPage player={player} onPlayerChange={setPlayer} onNavigate={navigate}/>
      : section === 'coalition'
        ? <CoalitionPage player={player} onPlayerChange={setPlayer} onNavigate={navigate}/>
      : section === 'home'
        ? <HomePage onNavigate={navigate}/>
      : section === 'news'
        ? <NewsPage player={player} onNavigate={navigate}/>
      : section === 'territory'
        ? <TerritoryPage player={player} onNavigate={navigate}/>
      : section === 'election'
        ? <ElectionPage player={player} onNavigate={navigate}/>
      : section === 'settings'
        ? <main className="mx-auto max-w-3xl px-4 py-8"><h1 className="mb-6 text-xl text-[var(--aog-accent)]">CONFIGURACIÓN</h1>
            <section className="rounded-lg bg-[#242424] p-6"><label htmlFor="theme-color" className="mr-4 text-sm">COLOR DE INTERFAZ</label>
              <input id="theme-color" aria-label="Color de interfaz" type="color" value={accentColor} onChange={(e)=>setAccentColor(e.target.value)}/>
              <button type="button" onClick={resetAccentColor} className="ml-4 border border-current px-3 py-2 text-xs">RESTABLECER</button>
              <p className="mt-6 text-xs text-neutral-400">Más opciones de configuración se migrarán después.</p>
            </section>
          </main>
        : <MigratedPage key={section} page={section} />}
  </div>;
}
