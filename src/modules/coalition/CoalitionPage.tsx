import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import type { Player } from '../auth/player';
import { fetchPlayer } from '../auth/player';
import { IDEOLOGIES } from '../profile/ideologies';
import {
  applyToCoalition, coalitionDetails, createCoalition, decideCoalitionRequest,
  disbandCoalition, kickCoalitionParty, leaveCoalition, listCoalitions,
  ownCoalition, updateCoalition, uploadCoalitionLogo,
  type CoalitionParty, type CoalitionSummary, type CoalitionDetail, type MyCoalitionState,
} from './coalitionApi';
import OrganizationHeading from '../party/OrganizationHeading';
import '../home/home.css';
import '../party/party.css'; // Reutiliza EXACTAMENTE curvas, tamaños y CSS de Party.
import './coalition.css';
import '../party/organization-redesign.css';

const DEFAULT_PHOTO='/assets/photos/nophoto.png';
const PAGE_SIZE=8;
const fmt=new Intl.NumberFormat('es-AR');
function dateText(value:string){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
}
function routeId(){
  const matched=window.location.pathname.match(/^\/coalition\/(\d+)\/?$/);
  return matched?Number(matched[1]):null;
}
function TitlePanel({title,className='',children}:{title:string;className?:string;children:React.ReactNode}){
  return <section className={`aog-home-panel aog-party-panel ${className}`}>
    <h2 className="aog-home-panel-title">{title}</h2>{children}
  </section>;
}
function PartyAvatar({party,onNavigate}:{party:CoalitionParty|null;onNavigate:(url:string)=>void}){
  const img=<img className="aog-party-person-photo" src={party?.photo_url||DEFAULT_PHOTO} alt={party?.name||'Logo del partido'}/>;
  return party?.id?<button type="button" className="aog-party-avatar-link" title={`Ver partido ${party.name}`}
    onClick={()=>onNavigate(`/party/${party.id}`)}>{img}</button>:img;
}
function PartyCard({title,party,onNavigate}:{title:string;party:CoalitionParty|null;onNavigate:(url:string)=>void}){
  return <TitlePanel title={title} className="aog-party-person-card">
    <PartyAvatar party={party} onNavigate={onNavigate}/>
    {party?.id?<button type="button" className="aog-party-person-name-link" onClick={()=>onNavigate(`/party/${party.id}`)} title={party.name}>{party.name}</button>:<b>—</b>}
  </TitlePanel>;
}
function Cropper({file,onApply,onCancel}:{file:File;onApply:(blob:Blob,preview:string)=>void;onCancel:()=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [picture,setPicture]=useState<HTMLImageElement|null>(null);
  const [zoom,setZoom]=useState(1);
  const [center,setCenter]=useState({x:.5,y:.5});
  const drag=useRef<{x:number;y:number;cx:number;cy:number}|null>(null);
  const draw = useCallback(()=>{
    const surface=canvas.current,ctx=surface?.getContext('2d');
    if(!surface||!ctx||!picture)return;
    const crop=Math.min(picture.naturalWidth,picture.naturalHeight)/zoom;
    const x=Math.max(0,Math.min(picture.naturalWidth-crop,picture.naturalWidth*center.x-crop/2));
    const y=Math.max(0,Math.min(picture.naturalHeight-crop,picture.naturalHeight*center.y-crop/2));
    ctx.clearRect(0,0,256,256);ctx.drawImage(picture,x,y,crop,crop,0,0,256,256);
  },[center,picture,zoom]);
  useEffect(()=>{
    const url=URL.createObjectURL(file);
    const img=new Image();img.onload=()=>setPicture(img);img.src=url;
    return ()=>URL.revokeObjectURL(url);
  },[file]);
  useEffect(()=>{draw();},[draw]);
  function move(e:PointerEvent<HTMLCanvasElement>){
    if(!drag.current||!picture)return;
    const box=e.currentTarget.getBoundingClientRect();
    const d=drag.current;
    const ratio=(Math.min(picture.naturalWidth,picture.naturalHeight)/zoom)/box.width;
    setCenter({
      x:Math.max(0,Math.min(1,d.cx-(e.clientX-d.x)*ratio/picture.naturalWidth)),
      y:Math.max(0,Math.min(1,d.cy-(e.clientY-d.y)*ratio/picture.naturalHeight)),
    });
  }
  function finish(){
    draw();
    canvas.current?.toBlob((blob)=>{
      if(blob&&canvas.current)onApply(blob,canvas.current.toDataURL('image/png'));
    },'image/png');
  }
  return <div className="aog-party-crop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onCancel();}}>
    <section className="aog-party-crop-dialog" role="dialog" aria-modal="true" aria-label="Recortar logo de la coalición">
      <h2>AJUSTAR LOGO 1:1</h2>
      <p>Arrastrá la imagen para centrarla. La transparencia se conserva.</p>
      <div className="aog-party-crop-stage">
        <canvas ref={canvas} width={256} height={256}
          onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY,cx:center.x,cy:center.y};e.currentTarget.setPointerCapture(e.pointerId);}}
          onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} />
      </div>
      <label className="aog-party-crop-zoom">ZOOM <input type="range" min="1" max="4" step="0.05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
      <div className="aog-party-actions"><button type="button" onClick={onCancel}>CANCELAR</button><button type="button" onClick={finish}>USAR LOGO</button></div>
    </section>
  </div>;
}

type Props={player:Player;onPlayerChange:(p:Player)=>void;onNavigate:(path:string)=>void};
export default function CoalitionPage({player,onPlayerChange,onNavigate}:Props){
  const [selectedId,setSelectedId]=useState<number|null>(routeId);
  const [my,setMy]=useState<MyCoalitionState>({party_id:null,is_party_leader:false,coalition_id:null,pending_coalition_id:null});
  const [detail,setDetail]=useState<CoalitionDetail|null>(null);
  const [coalitions,setCoalitions]=useState<CoalitionSummary[]>([]);
  const [query,setQuery]=useState('');
  const [memberQuery,setMemberQuery]=useState('');
  const [visibleMemberCount,setVisibleMemberCount]=useState(9);
  const [page,setPage]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [loadingList,setLoadingList]=useState(false);
  const marker=useRef<HTMLDivElement>(null);
  const [mode,setMode]=useState<'normal'|'create'|'edit'>('normal');
  const [requestsOpen,setRequestsOpen]=useState(false);
  const [membersOpen,setMembersOpen]=useState(false);
  useEffect(()=>{
    if(!membersOpen)return;
    const handleKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setMembersOpen(false);};
    window.addEventListener('keydown',handleKey);
    return ()=>window.removeEventListener('keydown',handleKey);
  },[membersOpen]);
  const [name,setName]=useState('');
  const [ideology,setIdeology]=useState('');
  const [description,setDescription]=useState('');
  const [photo,setPhoto]=useState<string|null>(null);
  const [croppedBlob,setCroppedBlob]=useState<Blob|null>(null);
  const [cropFile,setCropFile]=useState<File|null>(null);
  const inputFile=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const requestSerial=useRef(0);

  const refresh=useCallback(async()=>{
    const latest=await ownCoalition();
    const fallback={party_id:null,is_party_leader:false,coalition_id:null,pending_coalition_id:null};
    setMy(latest??fallback);
    return latest;
  },[]);
  const refreshDetail=useCallback(async(id:number)=>{
    const value=await coalitionDetails(id);
    if(!value)throw new Error('La coalición no existe o fue disuelta.');
    setDetail(value);
  },[]);
  const refreshList=useCallback(async(q:string,offset:number,append=false)=>{
    const token=++requestSerial.current;
    setLoadingList(true);
    try{
      const result=await listCoalitions(q,offset,PAGE_SIZE);
      if(token!==requestSerial.current)return;
      setCoalitions(old=>append?[...old,...(result||[])]:result||[]);
      setHasMore((result?.length||0)===PAGE_SIZE);
    }catch(e){if(token===requestSerial.current)setHasMore(false);throw e;}
    finally{if(token===requestSerial.current)setLoadingList(false);}
  },[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    void refresh().then(async current=>{
      if(!active)return;
      const id=routeId()??current?.coalition_id??null;
      setSelectedId(id);
      if(id)await refreshDetail(id);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudo cargar Coalition');})
      .finally(()=>{if(active)setLoading(false);});
    const pop=()=>{setSelectedId(routeId());setMode('normal');setRequestsOpen(false);setError('');};
    window.addEventListener('popstate',pop);
    return ()=>{active=false;window.removeEventListener('popstate',pop);};
  },[refresh,refreshDetail]);
  useEffect(()=>{
    if(!selectedId){setDetail(null);return;}
    let active=true;
    setLoading(true);
    void coalitionDetails(selectedId).then(value=>{
      if(active){if(value)setDetail(value);else {setDetail(null);setError('Coalición no encontrada.');}}
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudo abrir la coalición');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[selectedId]);
  useEffect(()=>{
    if(selectedId||mode==='create')return;
    const timer=window.setTimeout(()=>{setPage(0);void refreshList(query,0).catch(e=>setError(e.message));},250);
    return ()=>window.clearTimeout(timer);
  },[query,selectedId,mode,refreshList]);
  useEffect(()=>{
    if(selectedId||mode==='create'||!hasMore||loadingList)return;
    const item=marker.current;
    if(!item)return;
    const observer=new IntersectionObserver(([entry])=>{
      if(!entry?.isIntersecting)return;
      observer.disconnect();
      const next=page+1;
      setPage(next);
      void refreshList(query,next*PAGE_SIZE,true).catch(e=>setError(e instanceof Error?e.message:'No se pudieron cargar coaliciones.'));
    },{rootMargin:'180px'});
    observer.observe(item);
    return ()=>observer.disconnect();
  },[selectedId,mode,hasMore,loadingList,page,query,refreshList]);
  function openCoalition(id:number|null){
    window.history.pushState({},'',id?`/coalition/${id}`:'/coalition');
    setSelectedId(id);setMode('normal');setRequestsOpen(false);setMembersOpen(false);setError('');setNotice('');
    setVisibleMemberCount(9);setMemberQuery('');
  }
  async function action(fn:()=>Promise<void>,success?:string){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{await fn();if(success)setNotice(success);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo completar la acción');}
    finally{setBusy(false);}
  }
  function startCreate(){
    setName('');setIdeology('');setDescription('');setPhoto(null);setCroppedBlob(null);setCropFile(null);
    setMode('create');setError('');
  }
  function startEdit(){
    if(!detail)return;
    setName(detail.name);setIdeology(detail.ideology);setDescription(detail.description);
    setPhoto(detail.photo_url);setCroppedBlob(null);setCropFile(null);setRequestsOpen(false);setMode('edit');setError('');
  }
  function cancelEdit(){setMode('normal');setCropFile(null);setCroppedBlob(null);setPhoto(null);setError('');}
  const isLeader=!!detail&&my.is_party_leader&&my.party_id===detail.leader_party_id;
  const isMember=!!detail&&my.coalition_id===detail.id;
  const isEditing=mode==='edit'&&isLeader;
  const members=(detail?.members||[]).filter(m=>m.name.toLowerCase().includes(memberQuery.toLowerCase())||String(m.id).includes(memberQuery));
  const visible=members.slice(0,visibleMemberCount);
  function saveEdit(){
    if(!detail||!isLeader||busy)return;
    void action(async()=>{
      const logo=croppedBlob?await uploadCoalitionLogo(player.authId,croppedBlob):photo;
      await updateCoalition(detail.id,name,ideology,description,logo);
      await refreshDetail(detail.id);
      setMode('normal');setCroppedBlob(null);setCropFile(null);
    },'Datos de la coalición actualizados.');
  }
  function onPickPhoto(e:ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];if(!f)return;
    if(!['image/png','image/jpeg','image/webp'].includes(f.type)){setError('Elegí una imagen PNG, JPG o WebP');return;}
    if(f.size>5_000_000){setError('Máximo 5 MB');return;}
    setCropFile(f);e.target.value='';
  }
  useEffect(()=>{
    if(!requestsOpen)return;
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setRequestsOpen(false);};
    window.addEventListener('keydown',key);
    return ()=>window.removeEventListener('keydown',key);
  },[requestsOpen]);
  useEffect(()=>{
    if(requestsOpen&&(!isLeader||!detail?.requests.length))setRequestsOpen(false);
  },[requestsOpen,isLeader,detail?.requests.length]);

  const createEditor=<form className="aog-party-editor" onSubmit={e=>{e.preventDefault();void action(async()=>{
    const id=await createCoalition(name,ideology,description);
    if(croppedBlob){const logo=await uploadCoalitionLogo(player.authId,croppedBlob);await updateCoalition(id,name,ideology,description,logo);}
    onPlayerChange(await fetchPlayer(player.authId));
    await refresh();openCoalition(id);await refreshDetail(id);
  },'Coalición fundada correctamente.');}}>
    <h2>CREAR COALICIÓN · G 15.000</h2>
    <label>NOMBRE <input required minLength={3} maxLength={50} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>IDEOLOGÍA <select value={ideology} onChange={e=>setIdeology(e.target.value)}>
      <option value="">SIN IDEOLOGÍA</option>
      {IDEOLOGIES.map(option=><option key={option} value={option}>{option.toUpperCase()}</option>)}
    </select></label>
    <label>DESCRIPCIÓN <textarea rows={4} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <small>{description.length}/500</small>
    <div className="aog-party-actions"><button type="submit" disabled={busy}>{busy?'GUARDANDO...':'FUNDAR COALICIÓN'}</button>
      <button type="button" disabled={busy} onClick={()=>setMode('normal')}>CANCELAR</button></div>
  </form>;

  return <main className="aog-party aog-coalition aog-org-modern" aria-label="Coaliciones políticas">
    {error&&<p className="aog-party-feedback" role="alert">{error}</p>}
    {notice&&<p className="aog-party-feedback aog-party-notice" role="status">{notice}</p>}
    {loading&&!detail&&<p className="aog-party-loading">CARGANDO COALICIONES...</p>}
    {!selectedId&&mode==='create'&&my.party_id&&my.is_party_leader&&!my.coalition_id&&createEditor}
    {!selectedId&&mode!=='create'&&<section className="aog-org-directory-panel">
      <OrganizationHeading title="COALICIONES" icon="coalition"/>
      <div className="aog-party-findbar">
        <input value={query} onChange={e=>{requestSerial.current++;setHasMore(false);setLoadingList(false);setQuery(e.target.value);}}
          placeholder="BUSCAR POR NOMBRE O ID..." aria-label="Buscar coaliciones"/>
        {my.party_id&&my.is_party_leader&&!my.coalition_id&&<button disabled={busy} onClick={startCreate}>CREAR COALICIÓN <span>G 15.000</span></button>}
        {my.coalition_id&&<button onClick={()=>openCoalition(my.coalition_id)}>MI COALICIÓN</button>}
      </div>
      <div className="aog-party-directory">
        {coalitions.map(c=><button className="aog-party-tile" type="button" key={c.id} onClick={()=>openCoalition(c.id)}>
          <img src={c.photo_url||DEFAULT_PHOTO} alt=""/>
          <b title={c.name}>{c.name}</b>
          <span>{fmt.format(c.member_count)} PARTIDOS</span>
          <small>{c.ideology||'SIN IDEOLOGÍA'}</small>
        </button>)}
      </div>
      {!loading&&!coalitions.length&&<p className="aog-party-empty">NO SE ENCONTRARON COALICIONES.</p>}
      {loadingList&&<p className="aog-party-loading">CARGANDO COALICIONES...</p>}
      {hasMore&&<div className="aog-party-load-marker" ref={marker} aria-hidden="true"/>}
    </section>}
    {selectedId&&detail&&<>
      <section className="aog-org-hero" aria-label="Datos de la coalición">
        <OrganizationHeading title="COALICIÓN" icon="coalition"/>
        {isEditing
          ? <button className="aog-org-logo-edit" type="button" title="Cambiar logo" onClick={()=>inputFile.current?.click()}><img src={photo||DEFAULT_PHOTO} alt="Logo de la coalición"/></button>
          : <img className="aog-org-logo" src={detail.photo_url||DEFAULT_PHOTO} alt={`Logo de ${detail.name}`}/>}
        <div className="aog-org-hero-main">
          {isEditing
            ? <input className="aog-party-inline-control aog-org-name-input" value={name} onChange={e=>setName(e.target.value)} aria-label="Nombre de la coalición" minLength={3} maxLength={50}/>
            : <h1 title={detail.name}>{detail.name}</h1>}
          {isEditing
            ? <select className="aog-party-inline-control" value={ideology} onChange={e=>setIdeology(e.target.value)} aria-label="Ideología de la coalición"><option value="">SIN IDEOLOGÍA</option>{IDEOLOGIES.map(item=><option value={item} key={item}>{item.toUpperCase()}</option>)}</select>
            : <span className="aog-org-ideology">{detail.ideology||'SIN IDEOLOGÍA'}</span>}
          {isEditing
            ? <div className="aog-org-description-edit"><textarea className="aog-party-inline-control" maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} aria-label="Descripción de la coalición"/><small>{description.length}/500</small></div>
            : <p className="aog-org-description">{detail.description||'SIN DESCRIPCIÓN'}</p>}
          <div className="aog-org-hero-facts">
            <div><i className="aog-org-icon aog-org-icon-party"/><span><strong>{fmt.format(detail.member_count)}</strong><small>PARTIDOS</small></span></div>
            <div><i className="aog-org-icon aog-org-icon-parliaments"/><span><strong>—</strong><small>BANCAS N.</small></span></div>
            <div><i className="aog-org-icon aog-org-icon-parliaments"/><span><strong>—</strong><small>BANCAS R.</small></span></div>
            <div><i className="aog-org-icon aog-org-icon-events"/><span><strong>{new Date(detail.created_at).toLocaleDateString('es-AR')}</strong><small>FUNDACIÓN</small></span></div>
          </div>
        </div>
        {isEditing&&<input type="file" ref={inputFile} accept="image/png,image/jpeg,image/webp" hidden onChange={onPickPhoto}/>}
      </section>
      {cropFile&&isEditing&&<Cropper file={cropFile} onApply={(blob,preview)=>{setCroppedBlob(blob);setPhoto(preview);setCropFile(null);}} onCancel={()=>setCropFile(null)}/>}
      {requestsOpen&&isLeader&&detail.requests.length>0&&<div className="aog-party-requests-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setRequestsOpen(false);}}>
        <section className="aog-party-requests" role="dialog" aria-modal="true" aria-label="Solicitudes de partidos">
          <div className="aog-party-requests-heading"><h3>SOLICITUDES DE PARTIDOS ({detail.requests.length})</h3><button type="button" className="aog-party-requests-close" onClick={()=>setRequestsOpen(false)} aria-label="Cerrar">×</button></div>
          <div className="aog-party-requests-list">{detail.requests.map(req=><div className="aog-party-request" key={req.id}>
            <button className="aog-party-request-photo" onClick={()=>onNavigate(`/party/${req.party_id}`)}><img src={req.photo_url||DEFAULT_PHOTO} alt={req.name}/></button>
            <div className="aog-party-request-name"><b>{req.name}</b><small>#{req.party_id}</small></div>
            <button disabled={busy} onClick={()=>void action(async()=>{await decideCoalitionRequest(req.id,true);await refreshDetail(detail.id);},'Partido aceptado.')}>ACEPTAR</button>
            <button disabled={busy} onClick={()=>void action(async()=>{await decideCoalitionRequest(req.id,false);await refreshDetail(detail.id);},'Solicitud rechazada.')}>RECHAZAR</button>
          </div>)}</div>
        </section>
      </div>}
      <div className="aog-org-leaders">
        <section className="aog-org-panel aog-org-leader-panel"><OrganizationHeading title="PARTIDO LÍDER" icon="party" star/>
          <div className="aog-org-person-row"><PartyAvatar party={detail.leader} onNavigate={onNavigate}/><div><button onClick={()=>onNavigate(`/party/${detail.leader_party_id}`)}>{detail.leader?.name||'VACANTE'}</button><small>{detail.leader?.ideology||'SIN IDEOLOGÍA'}</small></div></div>
        </section>
        <section className="aog-org-panel aog-org-leader-panel"><OrganizationHeading title="PARTIDO FUNDADOR" icon="party"/>
          <div className="aog-org-person-row"><PartyAvatar party={detail.founder} onNavigate={onNavigate}/><div><button disabled={!detail.founder?.id} onClick={()=>{if(detail.founder?.id)onNavigate(`/party/${detail.founder.id}`);}}>{detail.founder?.name||'SIN PARTIDO FUNDADOR'}</button><small>{detail.founder?.ideology||'SIN IDEOLOGÍA'}</small></div></div>
        </section>
        <section className="aog-org-panel aog-org-leader-panel"><OrganizationHeading title="COALICIÓN" icon="coalition"/><div className="aog-org-affiliation aog-org-affiliation-static"><img src={detail.photo_url||DEFAULT_PHOTO} alt=""/><span>{detail.name}</span></div></section>
      </div>
      <div className="aog-org-middle">
        <section className="aog-org-panel aog-org-representation"><OrganizationHeading title="REPRESENTACIÓN POLÍTICA" icon="parliaments"/>
          <div className="aog-org-rep-grid">{['PRESIDENCIAS','PARLAMENTARIOS NACIONALES','GOBERNACIONES','PARLAMENTARIOS REGIONALES'].map(item=><div className="aog-org-rep" key={item}><span>{item}</span><strong>—</strong><div className="aog-org-rep-bar"><span/></div></div>)}</div>
        </section>
        <section className="aog-org-panel aog-org-actions"><OrganizationHeading title="ACCIONES" icon="coalition"/>
          <div className="aog-org-action-grid">
            {isEditing?<><button disabled={busy||name.trim().length<3} onClick={saveEdit}>{busy?'GUARDANDO...':'GUARDAR CAMBIOS'}</button><button disabled={busy} onClick={cancelEdit}>CANCELAR</button></>:<>
              {!isMember&&my.is_party_leader&&!!my.party_id&&!my.coalition_id&&<button disabled={busy||my.pending_coalition_id!==null} onClick={()=>void action(async()=>{await applyToCoalition(detail.id);await refresh();},'Solicitud enviada.')}>{my.pending_coalition_id===detail.id?'SOLICITUD PENDIENTE':my.pending_coalition_id?'YA TENÉS UNA SOLICITUD':'SOLICITAR UNIRSE'}</button>}
              {isMember&&my.is_party_leader&&my.party_id!==detail.leader_party_id&&<button disabled={busy} onClick={()=>{if(window.confirm('¿Tu partido abandonará esta coalición?'))void action(async()=>{await leaveCoalition(detail.id);await refresh();await refreshDetail(detail.id);},'Tu partido abandonó la coalición.');}}>SALIR DE LA COALICIÓN</button>}
              {isLeader&&<><button onClick={startEdit}>EDITAR COALICIÓN</button>{detail.requests.length>0&&<button onClick={()=>setRequestsOpen(true)}>SOLICITUDES ({detail.requests.length})</button>}
                <button disabled={busy} onClick={()=>{if(window.confirm(`¿Disolver definitivamente ${detail.name}? Esta acción es irreversible.`))void action(async()=>{await disbandCoalition(detail.id);await refresh();openCoalition(null);},'Coalición disuelta.');}}>DISOLVER COALICIÓN</button></>}
              <button className="aog-org-action-secondary" onClick={()=>openCoalition(null)}>EXPLORAR COALICIONES</button>
            </>}
          </div>
        </section>
      </div>
      <div className="aog-org-bottom">
        <section className="aog-org-panel aog-org-members-panel"><OrganizationHeading title="PARTIDOS MIEMBROS" icon="party"/>
          <div className="aog-org-preview-list">{detail.members.slice(0,4).map(m=><div className="aog-org-member-row" key={m.id}>
            <PartyAvatar party={m} onNavigate={onNavigate}/><button type="button" className="aog-org-member-name" onClick={()=>onNavigate(`/party/${m.id}`)}>{m.name}</button><span className={m.id===detail.leader_party_id?'aog-org-role-highlight':''}>{m.id===detail.leader_party_id?'LÍDER':'MIEMBRO'}</span><small>{m.ideology||'SIN IDEOLOGÍA'}</small>
          </div>)}</div>
          <button className="aog-org-list-button" onClick={()=>{setMemberQuery('');setMembersOpen(true);}}>VER TODOS LOS PARTIDOS</button>
        </section>
        <section className="aog-org-panel aog-org-history"><OrganizationHeading title="HISTORIAL" icon="news"/><div>PRÓXIMAMENTE</div></section>
      </div>
      {membersOpen&&<div className="aog-org-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setMembersOpen(false);}}>
        <section className="aog-org-modal" role="dialog" aria-modal="true" aria-label="Todos los partidos de la coalición">
          <header><h2>PARTIDOS ({detail.member_count})</h2><button onClick={()=>setMembersOpen(false)} aria-label="Cerrar">×</button></header>
          <input value={memberQuery} onChange={e=>setMemberQuery(e.target.value)} placeholder="BUSCAR POR NOMBRE O ID..." aria-label="Buscar partidos"/>
          <div className="aog-org-modal-list">{members.map(m=><div className="aog-org-member-row" key={m.id}>
            <PartyAvatar party={m} onNavigate={onNavigate}/><button type="button" className="aog-org-member-name" onClick={()=>onNavigate(`/party/${m.id}`)}>{m.name}</button><span>{m.id===detail.leader_party_id?'LÍDER':'MIEMBRO'}</span><small>{m.ideology||'SIN IDEOLOGÍA'}</small>
            {isLeader&&m.id!==detail.leader_party_id&&<button className="aog-org-kick" disabled={busy} onClick={()=>{if(window.confirm(`¿Expulsar al partido ${m.name}?`))void action(async()=>{await kickCoalitionParty(detail.id,m.id);await refreshDetail(detail.id);},'Partido expulsado.');}}>EXPULSAR</button>}
          </div>)}{members.length===0&&<p>SIN RESULTADOS</p>}</div>
        </section>
      </div>}
    </>}
  </main>;
}
