import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import type { Player } from '../auth/player';
import { fetchPlayer } from '../auth/player';
import {
  applyToParty, createParty, decidePartyRequest, disbandParty, kickPartyMember, leaveParty,
  listParties, ownParty, partyDetails, updateParty, uploadPartyPhoto,
  type MyPartyState, type PartyDetail, type PartyPerson, type PartySummary,
} from './partyApi';
import { IDEOLOGIES } from '../profile/ideologies';
import { coalitionForParty, type PartyCoalition } from '../coalition/coalitionApi';
import OrganizationHeading from '../party/OrganizationHeading';
import '../home/home.css'; // Misma pestaña, curvas y proporciones que Home: NO redibujarla.
import './party.css';
import './organization-redesign.css';

const DEFAULT_PHOTO='/assets/photos/nophoto.png';
const PAGE_SIZE=8;
const formatNum = new Intl.NumberFormat('es-AR');
function dateText(date:string) {
  const d=new Date(date);
  return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
}
function routePartyId() {
  const match=window.location.pathname.match(/^\/party\/(\d+)\/?$/);
  return match?Number(match[1]):null;
}
function TitlePanel({title,className='',children}:{title:string;className?:string;children:React.ReactNode}) {
  return <section className={`aog-home-panel aog-party-panel ${className}`}>
    <h2 className="aog-home-panel-title">{title}</h2>{children}
  </section>;
}
function PlayerAvatar({person,onNavigate}:{person:PartyPerson|null;onNavigate:(path:string)=>void}) {
  const image=<img className="aog-party-person-photo" src={person?.photo_url||DEFAULT_PHOTO} alt={person?.name||'Foto del jugador'} />;
  return person?.id
    ? <button type="button" className="aog-party-avatar-link" title={`Ver perfil de ${person.name}`} aria-label={`Ver perfil de ${person.name}`} onClick={()=>onNavigate(`/profile/${person.id}`)}>{image}</button>
    : image;
}
function PersonCard({title,person,onNavigate}:{title:string;person:PartyPerson|null;onNavigate:(path:string)=>void}) {
  return <TitlePanel title={title} className="aog-party-person-card">
    <PlayerAvatar person={person} onNavigate={onNavigate}/>
    {person?.id ? <button type="button" className="aog-party-person-name-link" onClick={()=>onNavigate(`/profile/${person.id}`)} title={person.name}>{person.name}</button> : <b>—</b>}
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
    <section className="aog-party-crop-dialog" role="dialog" aria-modal="true" aria-label="Recortar logo del partido">
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

type Props={player:Player;onPlayerChange:(player:Player)=>void;onNavigate:(path:string)=>void};
export default function PartyPage({player,onPlayerChange,onNavigate}:Props){
  const [selectedId,setSelectedId]=useState<number|null>(routePartyId);
  const [my,setMy]=useState<MyPartyState>({party_id:null,pending_party_id:null});
  const [detail,setDetail]=useState<PartyDetail|null>(null);
  const [partyCoalition,setPartyCoalition]=useState<PartyCoalition|null>(null);
  const [parties,setParties]=useState<PartySummary[]>([]);
  const [query,setQuery]=useState('');
  const [memberQuery,setMemberQuery]=useState('');
  const [visibleMemberCount,setVisibleMemberCount]=useState(9);
  const [page,setPage]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [loadingList,setLoadingList]=useState(false);
  const loadMoreRef=useRef<HTMLDivElement>(null);
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
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const loader=useRef(0);

  const refresh=useCallback(async()=>{
    const latest=await ownParty();
    setMy(latest??{party_id:null,pending_party_id:null});
    return latest;
  },[]);
  const refreshDetail=useCallback(async(id:number)=>{
    const value=await partyDetails(id);
    if(!value) throw new Error('El partido no existe o fue disuelto.');
    setDetail(value);
  },[]);
  useEffect(()=>{
    let active=true;
    setPartyCoalition(null);
    if(detail?.id)void coalitionForParty(detail.id).then(result=>{if(active)setPartyCoalition(result);})
      .catch(err=>console.warn('No se pudo consultar la coalición del partido:',err));
    return ()=>{active=false;};
  },[detail?.id]);
  const refreshList=useCallback(async(q:string,offset:number,append=false)=>{
    const token=++loader.current;
    setLoadingList(true);
    try{
      const values=await listParties(q,offset,PAGE_SIZE);
      if(token!==loader.current)return;
      setParties(old=>append?[...old,...(values||[])]:values||[]);
      setHasMore((values?.length||0)===PAGE_SIZE);
    }catch(e){
      if(token===loader.current)setHasMore(false); // Evita reintentos infinitos al desplazarse.
      throw e;
    }finally{
      if(token===loader.current)setLoadingList(false);
    }
  },[]);
  useEffect(()=>{
    let alive=true;
    setLoading(true);setError('');
    void refresh().then(async current=>{
      if(!alive)return;
      const id=routePartyId()??current?.party_id??null;
      setSelectedId(id);
      if(id)await refreshDetail(id);
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'No se pudo cargar Party');})
      .finally(()=>{if(alive)setLoading(false);});
    const pop=()=>{setSelectedId(routePartyId());setMode('normal');setRequestsOpen(false);setError('');};
    window.addEventListener('popstate',pop);
    return ()=>{alive=false;window.removeEventListener('popstate',pop);};
  },[refresh,refreshDetail]);
  useEffect(()=>{
    if(!selectedId){setDetail(null);return;}
    let alive=true;
    setLoading(true);
    void partyDetails(selectedId).then(value=>{if(alive){if(value)setDetail(value);else setError('Partido no encontrado.');}})
      .catch(e=>{if(alive)setError(e.message);})
      .finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[selectedId]);
  useEffect(()=>{
    if(selectedId||mode==='create')return;
    const timer=window.setTimeout(()=>{
      setPage(0);void refreshList(query,0).catch(e=>setError(e.message));
    },250);
    return ()=>window.clearTimeout(timer);
  },[query,selectedId,mode,refreshList]);
  // El directorio se pagina al llegar al final; VER MÁS es exclusivo de miembros.
  useEffect(()=>{
    if(selectedId||mode==='create'||!hasMore||loadingList)return;
    const marker=loadMoreRef.current;
    if(!marker)return;
    const observer=new IntersectionObserver(([entry])=>{
      if(!entry?.isIntersecting)return;
      observer.disconnect();
      const next=page+1;
      setPage(next);
      void refreshList(query,next*PAGE_SIZE,true).catch(e=>setError(e instanceof Error?e.message:'No se pudieron cargar los partidos.'));
    },{rootMargin:'180px'});
    observer.observe(marker);
    return ()=>observer.disconnect();
  },[selectedId,mode,hasMore,loadingList,page,query,refreshList]);
  const openParty=(id:number|null)=>{
    window.history.pushState({},'',id?`/party/${id}`:'/party');
    setSelectedId(id);setMode('normal');setRequestsOpen(false);setMembersOpen(false);setError('');setNotice('');setVisibleMemberCount(9);setMemberQuery('');
  };
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
  const photoInput=useRef<HTMLInputElement>(null);
  function cancelEdit(){
    setMode('normal');setCropFile(null);setCroppedBlob(null);setPhoto(null);setError('');
  }
  function saveEdit(){
    if(!detail||!isLeader||busy)return;
    void action(async()=>{
      const url=croppedBlob?await uploadPartyPhoto(player.authId,croppedBlob):photo;
      await updateParty(detail.id,name,ideology,description,url);
      await refreshDetail(detail.id);
      setMode('normal');setCroppedBlob(null);setCropFile(null);
    },'Datos del partido actualizados.');
  }
  function onPickPhoto(e:ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];
    if(!f)return;
    if(!f.type.startsWith('image/')){setError('Elegí una imagen PNG, JPG o WebP');return;}
    if(f.size>5_000_000){setError('Máximo 5 MB');return;}
    setCropFile(f);e.target.value='';
  }
  function createEditor(){
    return <form className="aog-party-editor" onSubmit={e=>{e.preventDefault();void action(async()=>{
      const id=await createParty(name,ideology,description);
      if(croppedBlob){
        const url=await uploadPartyPhoto(player.authId,croppedBlob);
        await updateParty(id,name,ideology,description,url);
      }
      const next=await fetchPlayer(player.authId);onPlayerChange(next);
      await refresh();openParty(id);await refreshDetail(id);
    },'Partido fundado correctamente.');}}>
      <h2>CREAR PARTIDO · G 500</h2>
      <label>NOMBRE <input required maxLength={50} minLength={3} value={name} onChange={e=>setName(e.target.value)} /></label>
      <label>IDEOLOGÍA <select value={ideology} onChange={e=>setIdeology(e.target.value)}>
        <option value="">SIN IDEOLOGÍA</option>
        {IDEOLOGIES.map(item=><option value={item} key={item}>{item.toUpperCase()}</option>)}
      </select></label>
      <label>DESCRIPCIÓN <textarea maxLength={500} rows={4} value={description} onChange={e=>setDescription(e.target.value)} /></label>
      <small>{description.length} / 500</small>
      <div className="aog-party-actions"><button disabled={busy} type="submit">{busy?'GUARDANDO...':'FUNDAR PARTIDO'}</button>
        <button type="button" disabled={busy} onClick={()=>setMode('normal')}>CANCELAR</button></div>
    </form>;
  }
  const isLeader=!!detail&&player.id===detail.leader_id;
  useEffect(()=>{
    if(!requestsOpen)return;
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setRequestsOpen(false);};
    window.addEventListener('keydown',onKeyDown);
    return ()=>window.removeEventListener('keydown',onKeyDown);
  },[requestsOpen]);
  useEffect(()=>{
    if(requestsOpen&&(!isLeader||!detail?.requests.length))setRequestsOpen(false);
  },[requestsOpen,isLeader,detail?.requests.length]);
  const isMember=!!detail&&my.party_id===detail.id;
  const members=(detail?.members||[]).filter(m=>m.name.toLowerCase().includes(memberQuery.toLowerCase())||String(m.id).includes(memberQuery));
  const displayed=members.slice(0,visibleMemberCount);
  const isEditing=mode==='edit'&&isLeader;

  return <main className="aog-party aog-org-modern" aria-label="Partidos políticos">
    {error&&<p className="aog-party-feedback" role="alert">{error}</p>}
    {notice&&<p className="aog-party-feedback aog-party-notice" role="status">{notice}</p>}
    {loading&&!detail&&<p className="aog-party-loading">CARGANDO PARTIDOS...</p>}
    {!selectedId&&mode==='create'&&createEditor()}
    {!selectedId&&mode!=='create'&&<section className="aog-org-directory-panel">
      <OrganizationHeading title="PARTIDOS" icon="party"/>
      <div className="aog-party-findbar">
        <input value={query} onChange={e=>{loader.current++;setHasMore(false);setLoadingList(false);setQuery(e.target.value);}} placeholder="BUSCAR POR NOMBRE O ID..." aria-label="Buscar partidos" />
        {!my.party_id&&<button disabled={busy} onClick={startCreate}>CREAR PARTIDO <span>G 500</span></button>}
        {my.party_id&&<button onClick={()=>openParty(my.party_id)}>MI PARTIDO</button>}
      </div>
      <div className="aog-party-directory">
        {parties.map(p=><button type="button" className="aog-party-tile" onClick={()=>openParty(p.id)} key={p.id}>
          <img src={p.photo_url||DEFAULT_PHOTO} alt="" />
          <b title={p.name}>{p.name}</b>
          <span>{formatNum.format(p.member_count)} MIEMBROS</span>
          <small>{p.coalition_name||'SIN COALICIÓN'}</small>
        </button>)}
      </div>
      {!loading&&parties.length===0&&<p className="aog-party-empty">NO SE ENCONTRARON PARTIDOS.</p>}
      {loadingList&&<p className="aog-party-loading" role="status">CARGANDO PARTIDOS...</p>}
      {hasMore&&<div ref={loadMoreRef} className="aog-party-load-marker" aria-hidden="true"/>}
    </section>}
    {selectedId&&detail&&<>
      <section className="aog-org-hero" aria-label="Datos del partido">
        <OrganizationHeading title="PARTIDO" icon="party"/>
        {isEditing
          ? <button className="aog-org-logo-edit" type="button" title="Cambiar logo" onClick={()=>photoInput.current?.click()}><img src={photo||DEFAULT_PHOTO} alt="Logo del partido" /></button>
          : <img className="aog-org-logo" src={detail.photo_url||DEFAULT_PHOTO} alt={`Logo de ${detail.name}`} />}
        <div className="aog-org-hero-main">
          {isEditing
            ? <input className="aog-party-inline-control aog-org-name-input" aria-label="Nombre del partido" required minLength={3} maxLength={50} value={name} onChange={e=>setName(e.target.value)}/>
            : <h1 title={detail.name}>{detail.name}</h1>}
          {isEditing
            ? <select className="aog-party-inline-control" value={ideology} onChange={e=>setIdeology(e.target.value)} aria-label="Ideología del partido">
                <option value="">SIN IDEOLOGÍA</option>
                {IDEOLOGIES.map(item=><option value={item} key={item}>{item.toUpperCase()}</option>)}
              </select>
            : <span className="aog-org-ideology">{detail.ideology||'SIN IDEOLOGÍA'}</span>}
          {isEditing
            ? <div className="aog-org-description-edit"><textarea className="aog-party-inline-control" maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} aria-label="Descripción del partido"/><small>{description.length}/500</small></div>
            : <p className="aog-org-description">{detail.description||'SIN DESCRIPCIÓN'}</p>}
          <div className="aog-org-hero-facts">
            <div><i className="aog-org-icon aog-org-icon-players"/><span><strong>{formatNum.format(detail.member_count)}</strong><small>MIEMBROS</small></span></div>
            <div><i className="aog-org-icon aog-org-icon-parliaments"/><span><strong>—</strong><small>BANCAS N.</small></span></div>
            <div><i className="aog-org-icon aog-org-icon-parliaments"/><span><strong>—</strong><small>BANCAS R.</small></span></div>
            <div><i className="aog-org-icon aog-org-icon-events"/><span><strong>{new Date(detail.created_at).toLocaleDateString('es-AR')}</strong><small>FUNDACIÓN</small></span></div>
          </div>
        </div>
        {isEditing&&<input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPickPhoto}/>} 
      </section>
      {cropFile&&isEditing&&<Cropper file={cropFile} onApply={(blob,preview)=>{setCroppedBlob(blob);setPhoto(preview);setCropFile(null);}} onCancel={()=>setCropFile(null)}/>}
      {requestsOpen&&isLeader&&detail.requests.length>0&&<div className="aog-party-requests-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setRequestsOpen(false);}}>
        <section className="aog-party-requests" role="dialog" aria-modal="true" aria-label="Solicitudes de afiliación">
          <div className="aog-party-requests-heading"><h3>SOLICITUDES DE AFILIACIÓN ({detail.requests.length})</h3><button type="button" className="aog-party-requests-close" onClick={()=>setRequestsOpen(false)} aria-label="Cerrar">×</button></div>
          <div className="aog-party-requests-list">{detail.requests.map(r=><div className="aog-party-request" key={r.id}>
            <button type="button" className="aog-party-request-photo" onClick={()=>onNavigate(`/profile/${r.player_id}`)}><img src={r.photo_url||DEFAULT_PHOTO} alt={r.name}/></button>
            <div className="aog-party-request-name"><b>{r.name}</b><small>#{r.player_id}</small></div>
            <button disabled={busy} onClick={()=>void action(async()=>{await decidePartyRequest(r.id,true);await refreshDetail(detail.id);},'Solicitud aceptada.')}>ACEPTAR</button>
            <button disabled={busy} onClick={()=>void action(async()=>{await decidePartyRequest(r.id,false);await refreshDetail(detail.id);},'Solicitud rechazada.')}>RECHAZAR</button>
          </div>)}</div>
        </section>
      </div>}
      <div className="aog-org-leaders">
        <section className="aog-org-panel aog-org-leader-panel">
          <OrganizationHeading title="LÍDER" icon="players" star/>
          <div className="aog-org-person-row"><PlayerAvatar person={detail.leader} onNavigate={onNavigate}/><div><button type="button" onClick={()=>onNavigate(`/profile/${detail.leader_id}`)}>{detail.leader?.name||'VACANTE'}</button><small>{detail.leader?.political_ideology||'SIN IDEOLOGÍA'}</small></div></div>
        </section>
        <section className="aog-org-panel aog-org-leader-panel">
          <OrganizationHeading title="FUNDADOR" icon="players"/>
          <div className="aog-org-person-row"><PlayerAvatar person={detail.founder} onNavigate={onNavigate}/><div><button type="button" onClick={()=>onNavigate(`/profile/${detail.founder_id}`)}>{detail.founder?.name||'VACANTE'}</button><small>{detail.founder?.political_ideology||'SIN IDEOLOGÍA'}</small></div></div>
        </section>
        <section className="aog-org-panel aog-org-leader-panel">
          <OrganizationHeading title="COALICIÓN" icon="coalition"/>
          {partyCoalition
            ? <button type="button" className="aog-org-affiliation" onClick={()=>onNavigate(`/coalition/${partyCoalition.id}`)}><img src={partyCoalition.photo_url||DEFAULT_PHOTO} alt=""/><span>{partyCoalition.name}</span></button>
            : <div className="aog-org-affiliation-empty">SIN COALICIÓN</div>}
        </section>
      </div>
      <div className="aog-org-middle">
        <section className="aog-org-panel aog-org-representation">
          <OrganizationHeading title="REPRESENTACIÓN POLÍTICA" icon="parliaments"/>
          <div className="aog-org-rep-grid">
            {['PRESIDENCIAS','PARLAMENTARIOS NACIONALES','GOBERNACIONES','PARLAMENTARIOS REGIONALES'].map(item=><div className="aog-org-rep" key={item}><span>{item}</span><strong>—</strong><div className="aog-org-rep-bar"><span/></div></div>)}
          </div>
        </section>
        <section className="aog-org-panel aog-org-actions">
          <OrganizationHeading title="ACCIONES" icon="party"/>
          <div className="aog-org-action-grid">
            {isEditing ? <>
              <button disabled={busy||name.trim().length<3} onClick={saveEdit}>{busy?'GUARDANDO...':'GUARDAR CAMBIOS'}</button>
              <button disabled={busy} onClick={cancelEdit}>CANCELAR</button>
            </> : <>
              {!isMember&&!my.party_id&&<button disabled={busy||my.pending_party_id!==null} onClick={()=>void action(async()=>{await applyToParty(detail.id);await refresh();},'Solicitud enviada.')}>{my.pending_party_id===detail.id?'SOLICITUD PENDIENTE':my.pending_party_id?'YA TENÉS UNA SOLICITUD':'SOLICITAR UNIRSE'}</button>}
              {isMember&&!isLeader&&<button disabled={busy} onClick={()=>{if(window.confirm('¿Abandonar este partido?'))void action(async()=>{await leaveParty(detail.id);await refresh();},'Abandonaste el partido.');}}>SALIR DEL PARTIDO</button>}
              {isLeader&&<>
                <button onClick={startEdit}>EDITAR PARTIDO</button>
                {detail.requests.length>0&&<button onClick={()=>setRequestsOpen(true)}>SOLICITUDES ({detail.requests.length})</button>}
                <button disabled={busy} onClick={()=>{if(window.confirm(`¿Disolver definitivamente ${detail.name}? Esta acción es irreversible.`))void action(async()=>{await disbandParty(detail.id);await refresh();openParty(null);},'El partido fue disuelto.');}}>DISOLVER PARTIDO</button>
              </>}
              <button className="aog-org-action-secondary" onClick={()=>openParty(null)}>EXPLORAR PARTIDOS</button>
            </>}
          </div>
        </section>
      </div>
      <div className="aog-org-bottom">
        <section className="aog-org-panel aog-org-members-panel">
          <OrganizationHeading title="MIEMBROS" icon="players"/>
          <div className="aog-org-preview-list">{detail.members.slice(0,4).map(m=><div className="aog-org-member-row" key={m.id}>
            <PlayerAvatar person={m} onNavigate={onNavigate}/>
            <button type="button" className="aog-org-member-name" onClick={()=>onNavigate(`/profile/${m.id}`)}>{m.name}</button>
            <span className={m.id===detail.leader_id?'aog-org-role-highlight':''}>{m.id===detail.leader_id?'LÍDER':'MIEMBRO'}</span>
            <small>{m.political_ideology||'SIN IDEOLOGÍA'}</small>
          </div>)}</div>
          <button className="aog-org-list-button" onClick={()=>{setMemberQuery('');setMembersOpen(true);}}>VER TODOS LOS MIEMBROS</button>
        </section>
        <section className="aog-org-panel aog-org-history">
          <OrganizationHeading title="HISTORIAL" icon="news"/>
          <div>PRÓXIMAMENTE</div>
        </section>
      </div>
      {membersOpen&&<div className="aog-org-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setMembersOpen(false);}}>
        <section className="aog-org-modal" role="dialog" aria-modal="true" aria-label="Todos los miembros">
          <header><h2>MIEMBROS ({detail.member_count})</h2><button onClick={()=>setMembersOpen(false)} aria-label="Cerrar">×</button></header>
          <input value={memberQuery} onChange={e=>setMemberQuery(e.target.value)} placeholder="BUSCAR POR NOMBRE O ID..." aria-label="Buscar miembros"/>
          <div className="aog-org-modal-list">{members.map(m=><div className="aog-org-member-row" key={m.id}>
            <PlayerAvatar person={m} onNavigate={onNavigate}/><button className="aog-org-member-name" onClick={()=>onNavigate(`/profile/${m.id}`)}>{m.name}</button>
            <span>{m.id===detail.leader_id?'LÍDER':'MIEMBRO'}</span><small>{m.political_ideology||'SIN IDEOLOGÍA'}</small>
            {isLeader&&m.id!==detail.leader_id&&<button className="aog-org-kick" disabled={busy} onClick={()=>{if(window.confirm(`¿Expulsar a ${m.name}?`))void action(async()=>{await kickPartyMember(detail.id,m.id);await refreshDetail(detail.id);},'Miembro expulsado.');}}>EXPULSAR</button>}
          </div>)}{members.length===0&&<p>SIN RESULTADOS</p>}</div>
        </section>
      </div>}
    </>}
  </main>;
}
