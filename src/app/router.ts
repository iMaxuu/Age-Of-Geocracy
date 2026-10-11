import { useEffect, useState } from 'react';
const ROUTES = new Set([
  'home', 'map', 'nation', 'region', 'territory', 'party', 'coalition',
  'news', 'wars', 'war', 'work', 'storage', 'profile', 'messages',
  'shop', 'settings', 'config', 'market', 'election',
  'nationalparliament', 'regionalparliament',
]);
export type AppRoute = 'login' | 'register' | string;
export function getRoute(): AppRoute {
  const segment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  if(segment==='login'||segment==='register')return segment;
  return ROUTES.has(segment) ? segment : 'home';
}
export function useAppRoute(){
  const [route,setRoute]=useState<AppRoute>(getRoute);
  const [pathname,setPathname]=useState(()=>window.location.pathname);
  useEffect(()=>{
    const refresh=()=>{setRoute(getRoute());setPathname(window.location.pathname);};
    window.addEventListener('popstate',refresh);
    return ()=>window.removeEventListener('popstate',refresh);
  },[]);
  function navigate(path:string,replace=false){
    const target=path.startsWith('/')?path:`/${path}`;
    if(location.pathname!==target)window.history[replace?'replaceState':'pushState']({},'',target);
    setRoute(getRoute());
    setPathname(window.location.pathname);
  }
  return {route,navigate,pathname};
}
