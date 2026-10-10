import { useEffect, useState, type FormEvent } from 'react';
import { login, register } from './player';
import './auth.css';

type Props = {
  onAuthenticated: () => void;
  mode?: 'login' | 'register';
  onNavigate?: (path: '/login' | '/register') => void;
};
const imagePaths=Array.from({length:7},(_,index)=>`/legacy/backgrounds/${index+1}.png`);
export function AuthScreen({onAuthenticated, mode: routeMode = 'login', onNavigate}:Props){
  const [localMode,setLocalMode]=useState<'login'|'register'>(routeMode);
  const mode=onNavigate ? routeMode : localMode;
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [imageIndex,setImageIndex]=useState(0);
  useEffect(()=>{
    const handle=window.setInterval(()=>setImageIndex(index=>(index+1)%imagePaths.length),5000);
    return ()=>window.clearInterval(handle);
  },[]);
  function switchMode(next:'login'|'register'){
    if (onNavigate) onNavigate(next === 'login' ? '/login' : '/register');
    else setLocalMode(next);
    setError('');setPassword('');setConfirmation('');
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');setBusy(true);
    try {
      if(mode==='login') await login(email,password);
      else await register(email,password,confirmation);
      onAuthenticated();
    } catch(err) {setError(err instanceof Error?err.message:'No se pudo completar la operación.');}
    finally {setBusy(false);}
  }
  return <div className="aog-auth-root">
    <div className="aog-auth-backgrounds" aria-hidden="true">
      {imagePaths.map((url,index)=><div key={url} className="aog-auth-bg" style={{backgroundImage:`url(${url})`,opacity:index===imageIndex?1:0}} />)}
    </div>
    <div className="aog-auth-dark" />
    <header className="aog-auth-brand">AGE OF GEOCRACY<div className="aog-auth-titleline" /></header>
    <main className="aog-auth-panel">
      <h1>{mode==='login'?'INICIAR SESION':'REGISTRARSE'}</h1>
      <div className="aog-auth-rule" />
      <form onSubmit={submit}>
        <label htmlFor="auth-email">CORREO ELECTRONICO</label>
        <input id="auth-email" type="email" required autoComplete="email" placeholder="EXAMPLE@GMAIL.COM" value={email} onChange={e=>setEmail(e.target.value)}/>
        <label htmlFor="auth-password">CONTRASEÑA</label>
        <input id="auth-password" type="password" required autoComplete={mode==='login'?'current-password':'new-password'} placeholder="********" value={password} onChange={e=>setPassword(e.target.value)} />
        {mode==='register'&&<>
          <label htmlFor="auth-confirm">CONFIRMAR CONTRASEÑA</label>
          <input id="auth-confirm" type="password" required autoComplete="new-password" placeholder="********" value={confirmation} onChange={e=>setConfirmation(e.target.value)} />
        </>}
        <p className="aog-auth-terms">AL {mode==='login'?'INICIAR SESION':'REGISTRARTE'} ACEPTAS LOS <span>TERMINOS Y CONDICIONES</span></p>
        <button className="aog-auth-submit" type="submit" disabled={busy}>{mode==='login'?'INICIAR SESION':'REGISTRARSE'}</button>
      </form>
      <p className="aog-auth-or">O</p>
      <button type="button" className="aog-auth-submit" onClick={()=>switchMode(mode==='login'?'register':'login')}>{mode==='login'?'REGISTRARSE':'INICIAR SESION'}</button>
      {error&&<p role="alert" className="aog-auth-error">{error}</p>}
    </main>
    <footer className="aog-auth-version">PRE-ALPHA v0.0.4</footer>
  </div>;
}
