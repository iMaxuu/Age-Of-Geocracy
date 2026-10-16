import { supabase } from '../../lib/supabase';

export const NEWS_BUCKET = 'aog-news';
export const NEWS_LANGUAGES = [
  {code:'es',name:'ESPAÑOL',flag:'🇪🇸'},
  {code:'en',name:'ENGLISH',flag:'🇬🇧'},
  {code:'pt',name:'PORTUGUÊS',flag:'🇧🇷'},
  {code:'fr',name:'FRANÇAIS',flag:'🇫🇷'},
  {code:'de',name:'DEUTSCH',flag:'🇩🇪'},
  {code:'it',name:'ITALIANO',flag:'🇮🇹'},
] as const;
export type NewsLanguage = typeof NEWS_LANGUAGES[number]['code'];
export type NewsSort = 'newest' | 'oldest' | 'updated';
export type NewsSection = 'all' | 'official' | 'community' | 'mine';
export type NewsArticle = {
  id:number;author_id:number;language_code:NewsLanguage;title:string;content_html:string;
  cover_path:string|null;image_paths:string[];is_official:boolean;
  created_at:string;updated_at:string;deleted_at:string|null;
  author?:{id:number;name:string;photo_url:string|null}|null;
};
export type ArticleDraft = {
  title:string;content_html:string;language_code:NewsLanguage;is_official:boolean;
  cover_path:string|null;image_paths:string[];
};

const fields='id,author_id,language_code,title,content_html,cover_path,image_paths,is_official,created_at,updated_at,deleted_at,author:players!aog_news_articles_author_id_fkey(id,name,photo_url)';
const parseArticle=(value:unknown):NewsArticle=>value as NewsArticle;

export function imageUrl(path:string|null|undefined):string|null {
  if(!path)return null;
  // Las rutas son relativas al bucket y las valida una restricción SQL.
  return supabase.storage.from(NEWS_BUCKET).getPublicUrl(path).data.publicUrl;
}
export async function isNewsAdmin():Promise<boolean> {
  const {data,error}=await supabase.rpc('aog_news_is_admin');
  if(error)throw new Error(`No se pudo verificar la administración: ${error.message}`);
  return data===true;
}
export async function getOfficialNews(language:NewsLanguage):Promise<NewsArticle[]> {
  const {data,error}=await supabase.from('aog_news_articles').select(fields).is('deleted_at',null)
    .eq('language_code',language).eq('is_official',true).order('created_at',{ascending:false}).limit(3);
  if(error)throw error;
  return (data??[]).map(parseArticle);
}
export async function listArticles(language:NewsLanguage,section:NewsSection,sort:NewsSort,playerId:number,page:number,size=12) {
  const orderColumn=sort==='updated'?'updated_at':'created_at';
  let query=supabase.from('aog_news_articles').select(fields,{count:'exact'}).is('deleted_at',null).eq('language_code',language);
  if(section==='official')query=query.eq('is_official',true);
  if(section==='community')query=query.eq('is_official',false);
  if(section==='mine')query=query.eq('author_id',playerId);
  const {data,error,count}=await query.order(orderColumn,{ascending:sort==='oldest'})
    .order('id',{ascending:sort==='oldest'}).range(page*size,(page+1)*size-1);
  if(error)throw error;
  return {articles:(data??[]).map(parseArticle),total:count??0};
}
export async function getArticle(id:number):Promise<NewsArticle> {
  const {data,error}=await supabase.from('aog_news_articles').select(fields).eq('id',id).is('deleted_at',null).single();
  if(error)throw error;
  return parseArticle(data);
}
export async function saveArticle(playerId:number,draft:ArticleDraft,id?:number):Promise<NewsArticle> {
  const record={...draft,title:draft.title.trim(),content_html:draft.content_html.trim()};
  if(id!==undefined) {
    const {data,error}=await supabase.from('aog_news_articles').update(record).eq('id',id).eq('author_id',playerId).select(fields).single();
    if(error)throw error;
    return parseArticle(data);
  }
  const {data,error}=await supabase.from('aog_news_articles').insert({...record,author_id:playerId}).select(fields).single();
  if(error)throw error;
  return parseArticle(data);
}
export async function deleteArticle(id:number,playerId:number):Promise<void> {
  // Borrado lógico: el registro permanece en la base de datos.
  const {data,error}=await supabase.from('aog_news_articles').update({deleted_at:new Date().toISOString()})
    .eq('id',id).eq('author_id',playerId).is('deleted_at',null).select('id');
  if(error)throw error;
  if(!data?.length)throw new Error('El artículo ya no existe o no tenés permiso para eliminarlo.');
}

// Reduce imágenes grandes antes de almacenarlas. Permite webp/jpg/png, NO SVG.
export async function prepareImage(file:File):Promise<Blob> {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Elegí una imagen JPG, PNG o WEBP.');
  if(file.size>15*1024*1024)throw new Error('La imagen original no puede superar 15 MB.');
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');
    if(!context)throw new Error('No se pudo procesar la imagen.');
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const result=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',0.8));
    if(!result || result.size>3*1024*1024)throw new Error('La imagen es demasiado grande. Probá con otra.');
    return result;
  } finally {bitmap.close();}
}
export async function uploadImage(file:File,playerId:number):Promise<string> {
  const blob=await prepareImage(file);
  const path=`${playerId}/${crypto.randomUUID()}.webp`;
  const {error}=await supabase.storage.from(NEWS_BUCKET).upload(path,blob,{contentType:'image/webp',upsert:false});
  if(error)throw new Error(`No se pudo subir la imagen: ${error.message}`);
  return path;
}
export async function removeImages(paths:string[]):Promise<void> {
  if(!paths.length)return;
  const {error}=await supabase.storage.from(NEWS_BUCKET).remove(paths);
  if(error)console.warn('No se pudieron retirar imágenes temporales:',error);
}
