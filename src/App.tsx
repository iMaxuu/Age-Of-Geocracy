import { useEffect, useState } from 'react';
import { AuthScreen } from './modules/auth/AuthScreen';
import { fetchPlayer, getXp, logout, type Player } from './modules/auth/player';
import { supabase } from './lib/supabase';
import { ProfilePage } from './modules/profile/ProfilePage';
import PublicProfilePage from './modules/profile/PublicProfilePage';
import HomePage from './modules/home/HomePage';
import { MigratedPage } from './modules/MigratedPage';
import MapPage from './modules/map/MapPage';
import PartyPage from './modules/party/PartyPage';
import CoalitionPage from './modules/coalition/CoalitionPage';
import TerritoryPage from './modules/territory/TerritoryPage';
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

  if (loading) return <div className="min-h-screen bg-[#080808] p-8 text-white">CARGANDO AGE OF GEOCRACY...</div>;
  if (!player) return <>{authError && <p role="alert" className="bg-[#310909] p-3 text-white">{authError}</p>}<AuthScreen
    mode={route === 'register' ? 'register' : 'login'}
    onNavigate={navigate}
    onAuthenticated={() => { /* La sesión activa dispara el cambio de ruta cuando corresponda. */ }}
  /></>;

  const pathMatch=pathname.match(/^\/profile\/(\d+)\/?$/);
  const viewedPlayerId=pathMatch?Number(pathMatch[1]):null;
  const isOtherProfile=section==='profile'&&viewedPlayerId!==null&&viewedPlayerId!==player.id;
  const {level,xp,required}=getXp(player);
  return <div className={section === 'map' ? 'aog-map-shell bg-[#080808] text-white' : 'min-h-screen bg-[#080808] text-white'}>
    <Header
      activeSection={(section === 'config' ? 'settings' : section) as HeaderAction | HeaderSection}
      level={level}
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
    />
    {section === 'profile'
      ? isOtherProfile ? <PublicProfilePage playerId={viewedPlayerId!}/> : <ProfilePage player={player} onPlayerChange={setPlayer} onLogout={() => { void logout().then(()=>{ setPlayer(null); navigate('/login',true); }); }}/>
      : section === 'map'
        ? <MapPage player={player} onPlayerChange={setPlayer} onNavigate={navigate}/>
      : section === 'party'
        ? <PartyPage player={player} onPlayerChange={setPlayer} onNavigate={navigate}/>
      : section === 'coalition'
        ? <CoalitionPage player={player} onPlayerChange={setPlayer} onNavigate={navigate}/>
      : section === 'home'
        ? <HomePage onNavigate={navigate}/>
      : section === 'territory'
        ? <TerritoryPage player={player} onNavigate={navigate}/>
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
