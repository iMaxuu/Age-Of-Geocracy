import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import type { Player } from '../auth/player';
import {
  NEWS_LANGUAGES, deleteArticle, getArticle, getOfficialNews, imageUrl, isNewsAdmin,
  listArticles, removeImages, saveArticle, uploadImage,
  type ArticleDraft, type NewsArticle, type NewsLanguage, type NewsSection, type NewsSort,
} from './newsApi';
import {safeRichText,textLength} from './richText';
import './news.css';
import GeocracyHeading from '../shared/GeocracyHeading';

const DEFAULT_AVATAR='/assets/photos/nophoto.png';
const formatter=new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'short',year:'numeric'});
const getDate=(iso:string)=>formatter.format(new Date(iso));
const emptyDraft=(language:NewsLanguage):ArticleDraft=>({title:'',content_html:'',language_code:language,is_official:false,cover_path:null,image_paths:[]});
function Icon({name}:{name:string}){return <span className="aog-news-icon" style={{WebkitMaskImage:`url('/assets/icons/icons/${name}.svg')`,maskImage:`url('/assets/icons/icons/${name}.svg')`}} aria-hidden="true"/>;}
function PreviewFile({file}:{file:File}) {
  const [src,setSrc]=useState('');
  useEffect(()=>{const url=URL.createObjectURL(file);setSrc(url);return()=>URL.revokeObjectURL(url);},[file]);
  return src?<img src={src} alt="Vista previa de la imagen"/>:null;
}
function RichEditor({value,onChange}:{value:string;onChange:(html:string)=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(ref.current)ref.current.innerHTML=safeRichText(value);},[]); // Montar uno por artículo con key en el editor
  const action=(event:MouseEvent<HTMLButtonElement>,command:string,argument?:string)=>{
    event.preventDefault();
    ref.current?.focus();
    document.execCommand(command,false,argument);
    onChange(safeRichText(ref.current?.innerHTML??''));
  };
  const link=(event:MouseEvent<HTMLButtonElement>)=>{
    const url=window.prompt('Enlace HTTPS (https://...)');
    if(!url)return;
    try{if(!['https:','http:'].includes(new URL(url).protocol))throw new Error();}
    catch{window.alert('El enlace debe comenzar con https:// o http://');return;}
    action(event,'createLink',url);
  };
  return <div className="aog-news-editor">
    <div className="aog-news-toolbar" role="toolbar" aria-label="Formato del texto">
      <button type="button" title="Negrita" onMouseDown={event=>event.preventDefault()} onClick={event=>action(event,'bold')}><b>B</b></button>
      <button type="button" title="Cursiva" onMouseDown={event=>event.preventDefault()} onClick={event=>action(event,'italic')}><em>I</em></button>
      <button type="button" title="Subrayado" onMouseDown={event=>event.preventDefault()} onClick={event=>action(event,'underline')}><u>U</u></button>
      <button type="button" onMouseDown={event=>event.preventDefault()} onClick={event=>action(event,'formatBlock','H2')}>TÍTULO</button>
      <button type="button" onMouseDown={event=>event.preventDefault()} onClick={event=>action(event,'formatBlock','P')}>PÁRRAFO</button>
      <button type="button" title="Viñetas" onMouseDown={event=>event.preventDefault()} onClick={event=>action(event,'insertUnorderedList')}>• LISTA</button>
      <button type="button" title="Lista numerada" onMouseDown={event=>event.preventDefault()} onClick={event=>action(event,'insertOrderedList')}>1. LISTA</button>
      <button type="button" onMouseDown={event=>event.preventDefault()} onClick={link}>ENLACE</button>
      <button type="button" title="Eliminar formato" onMouseDown={event=>event.preventDefault()} onClick={event=>action(event,'removeFormat')}>LIMPIAR</button>
    </div>
    <div ref={ref} className="aog-news-editable" contentEditable role="textbox" aria-label="Contenido del artículo" aria-multiline="true"
      data-placeholder="Escribí tu artículo..." onInput={event=>onChange(safeRichText(event.currentTarget.innerHTML))}
      onBlur={event=>{const clean=safeRichText(event.currentTarget.innerHTML);event.currentTarget.innerHTML=clean;onChange(clean);}}
      onPaste={event=>{event.preventDefault();const plain=event.clipboardData.getData('text/plain');document.execCommand('insertText',false,plain);}}
      suppressContentEditableWarning />
  </div>;
}
function Cover({path,alt}:{path:string|null;alt:string}) {
  const url=imageUrl(path);
  return <div className="aog-news-cover">{url?<img loading="lazy" src={url} alt={alt}/>:<Icon name="news"/>}</div>;
}
function ArticleTile({article,onOpen,compact=false}:{article:NewsArticle;onOpen:(id:number)=>void;compact?:boolean}) {
  return <button type="button" className={`aog-news-tile ${compact?'aog-news-feature-tile':''}`} onClick={()=>onOpen(article.id)}>
    <Cover path={article.cover_path} alt="Portada del artículo"/>
    <span className="aog-news-tile-body">
      <span className="aog-news-tile-tags">{article.is_official&&<span className="aog-news-official-label">OFICIAL</span>} <span>{NEWS_LANGUAGES.find(l=>l.code===article.language_code)?.flag}</span></span>
      <strong>{article.title}</strong>
      <span className="aog-news-tile-meta">POR {article.author?.name??`JUGADOR #${article.author_id}`} · {getDate(article.created_at)}</span>
    </span>
  </button>;
}

export default function NewsPage({player,onNavigate}:{player:Player;onNavigate:(path:string)=>void}) {
  const [language,setLanguage]=useState<NewsLanguage>('es');
  const [section,setSection]=useState<NewsSection>('all');
  const [sort,setSort]=useState<NewsSort>('newest');
  const [page,setPage]=useState(0);
  const [articles,setArticles]=useState<NewsArticle[]>([]);
  const [official,setOfficial]=useState<NewsArticle[]>([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [admin,setAdmin]=useState(false);
  const [reading,setReading]=useState<NewsArticle|null>(null);
  const [draft,setDraft]=useState<ArticleDraft|null>(null);
  const [editingId,setEditingId]=useState<number|null>(null);
  const [newCover,setNewCover]=useState<File|null>(null);
  const [newImages,setNewImages]=useState<File[]>([]);
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const editorKey=editingId??'new';

  useEffect(()=>{let active=true;void isNewsAdmin().then(result=>{if(active)setAdmin(result)}).catch(err=>{if(active)setError(err instanceof Error?err.message:'Error de permisos')});return()=>{active=false;};},[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    void Promise.all([listArticles(language,section,sort,player.id,page),getOfficialNews(language)])
      .then(([feed,top])=>{if(active){setArticles(feed.articles);setTotal(feed.total);setOfficial(top);setError('');}})
      .catch(err=>{if(active)setError(err instanceof Error?err.message:'No se pudo cargar Noticias. ¿Aplicaste el SQL?');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[language,section,sort,page,player.id,refresh]);

  // Las URLs /news?id=... se pueden compartir, incluso con F5.
  useEffect(()=>{
    const id=Number(new URLSearchParams(window.location.search).get('id'));
    if(!Number.isSafeInteger(id)||id<=0){setReading(null);return;}
    let active=true;
    void getArticle(id).then(article=>{if(active)setReading(article)}).catch(()=>{if(active){setReading(null);setError('Artículo no disponible.');}});
    return()=>{active=false;};
  },[refresh]);
  const openArticle=useCallback((id:number)=>{
    window.history.pushState({},'',`/news?id=${id}`);
    void getArticle(id).then(article=>{setReading(article);setDraft(null);window.scrollTo({top:0,behavior:'smooth'});})
      .catch(err=>setError(err instanceof Error?err.message:'No se pudo abrir el artículo.'));
  },[]);
  const backToNews=()=>{window.history.pushState({},'','/news');setReading(null);setDraft(null);};
  // Browser back/forward: conservar el artículo correcto.
  useEffect(()=>{const handler=()=>{
    const id=Number(new URLSearchParams(location.search).get('id'));
    if(Number.isSafeInteger(id)&&id>0)void getArticle(id).then(setReading).catch(()=>setReading(null));
    else setReading(null);
  };window.addEventListener('popstate',handler);return()=>window.removeEventListener('popstate',handler);},[]);

  const beginCreate=()=>{setReading(null);setEditingId(null);setDraft(emptyDraft(language));setNewCover(null);setNewImages([]);setError('');};
  const beginEdit=(article:NewsArticle)=>{
    if(article.author_id!==player.id)return;
    setEditingId(article.id);
    setDraft({title:article.title,content_html:article.content_html,language_code:article.language_code,is_official:article.is_official,cover_path:article.cover_path,image_paths:[...(article.image_paths??[])]});
    setNewCover(null);setNewImages([]);setError('');
  };
  const updateDraft=(changes:Partial<ArticleDraft>)=>setDraft(current=>current?{...current,...changes}:current);
  const addGallery=(event:ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(event.target.files??[]);
    if(files.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type))){setError('Las imágenes deben ser JPG, PNG o WEBP.');event.target.value='';return;}
    if(files.some(file=>file.size>15*1024*1024)){setError('Las imágenes originales deben pesar menos de 15 MB.');event.target.value='';return;}
    const existing=draft?.image_paths.length??0;
    setNewImages(previous=>{
      if(existing+previous.length+files.length>4){setError('Se permiten hasta 4 imágenes en el contenido.');return previous;}
      setError('');return [...previous,...files];
    });
    event.target.value='';
  };
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!draft||busy)return;
    const title=draft.title.trim();const cleaned=safeRichText(draft.content_html);
    if(title.length<4||title.length>120){setError('El título debe tener entre 4 y 120 caracteres.');return;}
    if(textLength(cleaned)<20){setError('El artículo debe contener por lo menos 20 caracteres de texto.');return;}
    if(cleaned.length>30000){setError('El artículo es demasiado extenso (máximo 30.000 caracteres de formato).');return;}
    if(draft.is_official&&!admin){setError('Solo un administrador puede publicar anuncios oficiales.');return;}
    setBusy(true);setError('');
    const uploaded:string[]=[];
    try{
      let cover=draft.cover_path;
      if(newCover){cover=await uploadImage(newCover,player.id);uploaded.push(cover);}
      const imagePaths=[...draft.image_paths];
      for(const file of newImages){const path=await uploadImage(file,player.id);uploaded.push(path);imagePaths.push(path);}
      const article=await saveArticle(player.id,{...draft,title,content_html:cleaned,cover_path:cover,image_paths:imagePaths},editingId??undefined);
      setDraft(null);setEditingId(null);setNewCover(null);setNewImages([]);
      setRefresh(previous=>previous+1);
      setNotice(editingId?'Artículo actualizado.':'Artículo publicado.');
      window.history.pushState({},'',`/news?id=${article.id}`);
      setReading(article);
    }catch(err){await removeImages(uploaded);setError(err instanceof Error?err.message:'No se pudo guardar el artículo.');}
    finally{setBusy(false);}
  };
  const onDelete=async(article:NewsArticle)=>{
    if(article.author_id!==player.id||busy)return;
    if(!window.confirm(`¿Eliminar «${article.title}»? Se ocultará del foro, pero quedará guardado en el historial interno.`))return;
    setBusy(true);setError('');
    try{await deleteArticle(article.id,player.id);backToNews();setRefresh(n=>n+1);setNotice('Artículo retirado del foro.');}
    catch(err){setError(err instanceof Error?err.message:'No se pudo eliminar.');}
    finally{setBusy(false);}
  };
  const pages=Math.max(1,Math.ceil(total/12));
  const displayedNew=useMemo(()=>newImages.map((file,index)=>({file,index})),[newImages]);

  return <main className="aog-news-page">
    <section className="aog-news-panel aog-news-top-panel"><GeocracyHeading title="NOTICIAS" icon="news"/><header className="aog-news-top">
      <div><h1><Icon name="news"/> NOTICIAS</h1><p>PUBLICACIONES DE LA COMUNIDAD Y ANUNCIOS OFICIALES</p></div>
      {draft?<button className="aog-news-secondary" type="button" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>CANCELAR</button>
        :<button className="aog-news-primary" type="button" onClick={beginCreate}>+ CREAR ARTÍCULO</button>}
    </header></section>
    {notice&&<div className="aog-news-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></div>}
    {error&&<div className="aog-news-error" role="alert">{error}<button type="button" onClick={()=>setError('')}>×</button></div>}

    {draft?<form className="aog-news-compose aog-news-panel" onSubmit={event=>void save(event)}>
      <GeocracyHeading title={editingId?'EDITAR ARTÍCULO':'NUEVA PUBLICACIÓN'} icon="news"/>
      <div className="aog-news-form">
        <div className="aog-news-form-line">
          <label>TÍTULO<input type="text" maxLength={120} value={draft.title} onChange={event=>updateDraft({title:event.target.value})} placeholder="Escribí un título..." required/></label>
          <label>IDIOMA<select value={draft.language_code} onChange={event=>updateDraft({language_code:event.target.value as NewsLanguage})}>
            {NEWS_LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}
          </select></label>
          {admin&&<label>TIPO<select value={draft.is_official?'official':'community'} disabled={editingId!==null} onChange={event=>updateDraft({is_official:event.target.value==='official'})}>
            <option value="community">COMUNIDAD</option><option value="official">ANUNCIO OFICIAL</option>
          </select></label>}
        </div>
        <div className="aog-news-upload-row">
          <div className="aog-news-upload-image">{newCover?<PreviewFile file={newCover}/>:<Cover path={draft.cover_path} alt="Portada"/>}</div>
          <div className="aog-news-upload-controls">
            <strong>PORTADA</strong><span>JPG, PNG o WEBP · Se optimiza automáticamente</span>
            <label className="aog-news-file-button">SELECCIONAR PORTADA<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];if(file)setNewCover(file);event.target.value='';}}/></label>
            {(newCover||draft.cover_path)&&<button className="aog-news-danger-outline" type="button" onClick={()=>{setNewCover(null);updateDraft({cover_path:null});}}>QUITAR PORTADA</button>}
          </div>
        </div>
        <label className="aog-news-content-label">CONTENIDO</label>
        <RichEditor key={editorKey} value={draft.content_html} onChange={content_html=>updateDraft({content_html})}/>
        <div className="aog-news-upload-controls aog-news-gallery-input">
          <strong>IMÁGENES DEL ARTÍCULO ({draft.image_paths.length+newImages.length}/4)</strong>
          <span>Las imágenes aparecen debajo del contenido y se conservan mientras el artículo esté entre los 100 más recientes de su idioma.</span>
          <label className="aog-news-file-button">+ AGREGAR IMÁGENES<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addGallery}/></label>
        </div>
        {(draft.image_paths.length>0||newImages.length>0)&&<div className="aog-news-gallery aog-news-gallery-editor">
          {draft.image_paths.map(path=><div className="aog-news-gallery-thumb" key={path}><img src={imageUrl(path)??''} alt="Imagen existente"/><button type="button" aria-label="Quitar imagen" onClick={()=>updateDraft({image_paths:draft.image_paths.filter(other=>other!==path)})}>×</button></div>)}
          {displayedNew.map(({file,index})=><div className="aog-news-gallery-thumb" key={`${file.name}-${index}`}><PreviewFile file={file}/><button type="button" aria-label="Quitar imagen" onClick={()=>setNewImages(items=>items.filter((_,position)=>position!==index))}>×</button></div>)}
        </div>}
        <div className="aog-news-save-row"><span>MÁX. 120 CARACTERES EN EL TÍTULO · EL TEXTO SE CONSERVA SIN CADUCIDAD</span><button className="aog-news-primary" type="submit" disabled={busy}>{busy?'GUARDANDO...':editingId?'GUARDAR CAMBIOS':'PUBLICAR ARTÍCULO'}</button></div>
      </div>
    </form>:reading?<>
      <button className="aog-news-back" type="button" onClick={backToNews}>← VOLVER A NOTICIAS</button>
      <article className="aog-news-reading aog-news-panel">
        <GeocracyHeading title={reading.is_official?'ANUNCIO OFICIAL':'ARTÍCULO DE LA COMUNIDAD'} icon={reading.is_official?'news':'news'}/>
        {reading.cover_path&&<div className="aog-news-reading-cover"><img src={imageUrl(reading.cover_path)??''} alt="Portada"/></div>}
        <div className="aog-news-reading-inner">
          <div className="aog-news-reading-head"><h1>{reading.title}</h1><span>{NEWS_LANGUAGES.find(item=>item.code===reading.language_code)?.flag} {reading.language_code.toUpperCase()}</span></div>
          <div className="aog-news-author-line">
            <button type="button" onClick={()=>onNavigate(`/profile/${reading.author_id}`)}><img src={reading.author?.photo_url||DEFAULT_AVATAR} alt=""/>{reading.author?.name??`JUGADOR #${reading.author_id}`}</button>
            <time dateTime={reading.created_at}>{getDate(reading.created_at)}</time>
            {reading.updated_at!==reading.created_at&&<small>EDITADO {getDate(reading.updated_at)}</small>}
          </div>
          <div className="aog-news-rich" dangerouslySetInnerHTML={{__html:safeRichText(reading.content_html)}}/>
          {reading.image_paths?.length>0&&<div className="aog-news-gallery">{reading.image_paths.map(path=><a key={path} href={imageUrl(path)??'#'} target="_blank" rel="noreferrer"><img loading="lazy" src={imageUrl(path)??''} alt="Imagen del artículo"/></a>)}</div>}
          {(reading.author_id===player.id)&&<div className="aog-news-owner-actions"><button className="aog-news-primary" type="button" onClick={()=>beginEdit(reading)}>EDITAR</button><button className="aog-news-danger-outline" type="button" disabled={busy} onClick={()=>void onDelete(reading)}>ELIMINAR</button></div>}
        </div>
      </article>
    </>:<>
      <section className="aog-news-panel aog-news-official"><GeocracyHeading title="ANUNCIOS OFICIALES" icon="news"/><span className="aog-news-section-note">ADMINISTRACIÓN</span>
        <div className="aog-news-features">{official.length?official.map(article=><ArticleTile key={article.id} article={article} onOpen={openArticle} compact/>):<p className="aog-news-empty">TODAVÍA NO HAY ANUNCIOS OFICIALES EN ESTE IDIOMA.</p>}</div>
      </section>
      <section className="aog-news-panel aog-news-feed"><GeocracyHeading title="FORO DE NOTICIAS" icon="news"/>
        <div className="aog-news-filters">
          <label>IDIOMA<select value={language} onChange={event=>{setLanguage(event.target.value as NewsLanguage);setPage(0);}}>{NEWS_LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}</select></label>
          <label>VER<select value={section} onChange={event=>{setSection(event.target.value as NewsSection);setPage(0);}}><option value="all">TODOS LOS ARTÍCULOS</option><option value="community">COMUNIDAD</option><option value="official">OFICIALES</option><option value="mine">MIS ARTÍCULOS</option></select></label>
          <label>ORDENAR<select value={sort} onChange={event=>{setSort(event.target.value as NewsSort);setPage(0);}}><option value="newest">MÁS NUEVOS</option><option value="oldest">MÁS ANTIGUOS</option><option value="updated">ÚLTIMOS EDITADOS</option></select></label>
          <button type="button" onClick={()=>setRefresh(n=>n+1)} aria-label="Actualizar noticias">ACTUALIZAR ↻</button>
        </div>
        <div className="aog-news-cards">{loading?<p className="aog-news-empty">CARGANDO NOTICIAS...</p>:articles.length?articles.map(article=><ArticleTile key={article.id} article={article} onOpen={openArticle}/>):<p className="aog-news-empty">NO HAY ARTÍCULOS EN ESTA SECCIÓN.</p>}</div>
        <div className="aog-news-pages"><span>{total} ARTÍCULOS · PÁGINA {page+1} DE {pages}</span><div><button type="button" disabled={page===0||loading} onClick={()=>setPage(n=>Math.max(0,n-1))}>ANTERIOR</button><button type="button" disabled={page+1>=pages||loading} onClick={()=>setPage(n=>n+1)}>SIGUIENTE</button></div></div>
      </section>
    </>}
  </main>;
}
