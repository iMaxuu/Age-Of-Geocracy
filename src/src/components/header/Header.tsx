import { useState } from 'react';
import './header.css';

export type HeaderAction = 'messages' | 'profile' | 'shop' | 'settings';
export type HeaderSection = 'home' | 'map' | 'nation' | 'region' | 'territory' | 'party' | 'coalition' | 'news' | 'wars' | 'work' | 'storage';

type HeaderProps = {
  activeSection?: HeaderSection | HeaderAction;
  level?: number; money?: number; geocracy?: number;
  playerName?: string;
  profileImageUrl?: string | null;
  xp?: number; xpRequired?: number; energy?: number; energyMax?: number;
  version?: string;
  onNavigate?: (section: HeaderSection) => void;
  onLink?: (path: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
  onMail?: () => void; onProfile?: () => void; onShop?: () => void; onSettings?: () => void;
};

type Item = { key: HeaderSection | 'profile'; label: string; file: string; path: string; fallback: string };
const items: Item[] = [
  {key:'home',label:'INICIO',file:'home.svg',path:'/home',fallback:'⌂'},
  {key:'map',label:'MAPA',file:'map.svg',path:'/map',fallback:'◎'},
  {key:'nation',label:'NACIÓN',file:'nation.svg',path:'/nation',fallback:'⚑'},
  {key:'region',label:'REGIÓN',file:'region.svg',path:'/region',fallback:'♧'},
  {key:'territory',label:'TERRITORIO',file:'territory.svg',path:'/territory',fallback:'●'},
  {key:'party',label:'PARTIDO',file:'party.svg',path:'/party',fallback:'●'},
  {key:'coalition',label:'COALICIÓN',file:'coalition.svg',path:'/coalition',fallback:'●'},
  {key:'news',label:'NOTICIAS',file:'news.svg',path:'/news',fallback:'●'},
  {key:'wars',label:'GUERRAS',file:'war.svg',path:'/wars',fallback:'●'},
  {key:'work',label:'TRABAJO',file:'work.svg',path:'/work',fallback:'●'},
  {key:'storage',label:'ALMACÉN',file:'storage.svg',path:'/storage',fallback:'●'},
  {key:'profile',label:'PERFIL',file:'profile.svg',path:'/profile',fallback:'♟'},
];
const formatNumber = (n:number) => new Intl.NumberFormat('es-AR').format(Math.max(0,Math.floor(n)));
function AssetIcon({file,fallback,className=''}:{file:string;fallback:string;className?:string}) {
  const [broken,setBroken]=useState(false);
  const url = `/assets/icons/topbar/${file}`;
  return broken ? <span className={`aog-topbar-icon-fallback ${className}`} aria-hidden="true">{fallback}</span> :
    <span className={`aog-topbar-svg-mask ${className}`} aria-hidden="true" style={{maskImage:`url("${url}")`,WebkitMaskImage:`url("${url}")`}}>
      <img className="aog-topbar-svg-preload" src={url} alt="" onError={()=>setBroken(true)} draggable={false}/>
    </span>;
}
export function Header({activeSection='home',level=1,money=25_000,geocracy=5_000,playerName='JUGADOR',profileImageUrl=null,xp=0,xpRequired=100,energy=0,energyMax=100,version='PRE-ALPHA v0.0.3',onNavigate,onLink,onMail,onProfile,onShop,onSettings}:HeaderProps){
  const xpPct = xpRequired>0 ? Math.max(0,Math.min(100,xp/xpRequired*100)) : 0;
  const energyPct = energyMax>0 ? Math.max(0,Math.min(100,energy/energyMax*100)) : 0;
  const follow=(path:string,event:React.MouseEvent<HTMLAnchorElement>,fn?:()=>void,key?:HeaderSection)=>{
    if(event.button!==0 || event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    if(onLink){onLink(path,event);return;}
    event.preventDefault();if(fn)fn();else if(key)onNavigate?.(key);
  };
  const tools = [
    {label:'Configuración',path:'/settings',file:'settings.svg',fallback:'⚙',fn:onSettings},
    {label:'Notificaciones',path:'/notifications',file:'notifications.svg',fallback:'♟',fn:undefined},
    {label:'Mensajes',path:'/messages',file:'messages.svg',fallback:'✉',fn:onMail},
  ];
  return <header className="aog-topbar" aria-label="Barra principal de Age of Geocracy">
    <div className="aog-topbar-content">
      <div className="aog-topbar-player-zone">
        <div className="aog-topbar-player-card">
          <div className="aog-topbar-level-track" title={`Energía: ${formatNumber(energy)} / ${formatNumber(energyMax)}`} style={{'--aog-energy-fill':`${energyPct}%`} as React.CSSProperties} />
          <a className="aog-topbar-avatar" href="/profile" onClick={e=>follow('/profile',e,onProfile)} title="Abrir perfil">
            <img src={profileImageUrl||'/assets/photos/nophoto.png'} alt="Foto de perfil" />
          </a>
          <div className="aog-topbar-player-data">
            <div className="aog-topbar-name" title={playerName}>{playerName}</div>
            <span className="aog-topbar-level">NIVEL {formatNumber(level)}</span>
            <div className="aog-topbar-energy" title={`Experiencia: ${formatNumber(xp)} / ${formatNumber(xpRequired)}`}><span style={{width:`${xpPct}%`}}/></div>
            <span className="aog-topbar-money">$ {formatNumber(money)}</span>
            <span className="aog-topbar-gold">G {formatNumber(geocracy)}</span>
          </div>
        </div>
        <div className="aog-topbar-quick-actions" aria-label="Accesos rápidos">
          {tools.map(t=><a key={t.label} href={t.path} title={t.label} aria-label={t.label} onClick={e=>follow(t.path,e,t.fn)}>
            <AssetIcon file={t.file} fallback={t.fallback}/>
          </a>)}
        </div>
      </div>
      <nav className="aog-topbar-nav" aria-label="Navegación principal">
        <div className="aog-topbar-mobile-actions" aria-label="Accesos rápidos">
          {tools.map(t=><a key={t.label} href={t.path} title={t.label} aria-label={t.label} onClick={e=>follow(t.path,e,t.fn)}>
            <AssetIcon file={t.file} fallback={t.fallback}/>
          </a>)}
        </div>
        <div className="aog-topbar-nav-scroll">
        {items.map(i=><a key={i.key} href={i.path} className={`aog-topbar-nav-item ${activeSection===i.key?'is-active':''}`} aria-current={activeSection===i.key?'page':undefined} onClick={e=>follow(i.path,e,i.key==='profile'?onProfile:undefined,i.key==='profile'?undefined:i.key)}>
          <AssetIcon file={i.file} fallback={i.fallback} className="aog-topbar-nav-icon"/>
          <span>{i.label}</span>
        </a>)}
        </div>
      </nav>
      <div className="aog-topbar-brand"><div className="aog-topbar-brand-prefix">AGE OF</div><div className="aog-topbar-brand-main">GEOCRACY</div><div className="aog-topbar-brand-version">{version}</div></div>
    </div>
  </header>;
}
