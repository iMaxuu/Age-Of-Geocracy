// Supabase Edge Function: elimina del bucket los blobs archivados en la cola SQL.
// Desplegar con verify_jwt=false y configurar NEWS_CLEANUP_SECRET como secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async req => {
  if(req.method!=='POST')return new Response('POST required',{status:405});
  const secret=Deno.env.get('NEWS_CLEANUP_SECRET');
  if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return new Response('Unauthorized',{status:401});
  const url=Deno.env.get('SUPABASE_URL');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return new Response('Missing server secrets',{status:500});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.from('aog_news_image_cleanup_queue').select('path').order('queued_at').limit(100);
  if(error)return Response.json({error:error.message},{status:500});
  const paths=(data??[]).map(item=>item.path as string);
  if(!paths.length)return Response.json({removed:0,pending:false});
  const result=await admin.storage.from('aog-news').remove(paths);
  if(result.error){
    for(const path of paths){
      await admin.from('aog_news_image_cleanup_queue').update({last_error:result.error.message}).eq('path',path);
    }
    return Response.json({error:result.error.message},{status:502});
  }
  const {error:deleteError}=await admin.from('aog_news_image_cleanup_queue').delete().in('path',paths);
  if(deleteError)return Response.json({error:deleteError.message,storage_removed:true},{status:500});
  return Response.json({removed:paths.length,pending:paths.length===100});
});
