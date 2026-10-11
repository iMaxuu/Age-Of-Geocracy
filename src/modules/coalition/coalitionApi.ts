import { supabase } from '../../lib/supabase';

export type CoalitionParty = { id:number; name:string; photo_url:string|null; ideology:string };
export type CoalitionSummary = {
  id:number; name:string; ideology:string; description:string; photo_url:string|null;
  founder_party_id:number|null; leader_party_id:number; member_count:number; created_at:string;
};
export type CoalitionRequest = {id:number;party_id:number;name:string;photo_url:string|null;created_at:string};
export type CoalitionDetail = CoalitionSummary & {
  founder:CoalitionParty|null; leader:CoalitionParty; members:CoalitionParty[]; requests:CoalitionRequest[];
};
export type MyCoalitionState = {party_id:number|null;is_party_leader:boolean;coalition_id:number|null;pending_coalition_id:number|null};
export type PartyCoalition = {id:number;name:string;photo_url:string|null;ideology:string};

function unwrap<T>(response:{data:unknown;error:{message:string}|null}):T {
  if(response.error) throw new Error(response.error.message);
  return response.data as T;
}
export async function listCoalitions(search:string,offset:number,limit=8){
  return unwrap<CoalitionSummary[]>(await supabase.rpc('aog_coalition_list',{p_search:search,p_limit:limit,p_offset:offset}));
}
export async function ownCoalition(){
  return unwrap<MyCoalitionState|null>(await supabase.rpc('aog_coalition_my_state'));
}
export async function coalitionDetails(id:number){
  return unwrap<CoalitionDetail|null>(await supabase.rpc('aog_coalition_detail',{p_coalition_id:id}));
}
export async function coalitionForParty(partyId:number){
  return unwrap<PartyCoalition|null>(await supabase.rpc('aog_coalition_for_party',{p_party_id:partyId}));
}
export async function createCoalition(name:string,ideology:string,description:string){
  return unwrap<number>(await supabase.rpc('aog_coalition_create',{p_name:name,p_ideology:ideology,p_description:description}));
}
export async function applyToCoalition(id:number){
  unwrap(await supabase.rpc('aog_coalition_apply',{p_coalition_id:id}));
}
export async function decideCoalitionRequest(id:number,accept:boolean){
  unwrap(await supabase.rpc('aog_coalition_decide',{p_request_id:id,p_accept:accept}));
}
export async function updateCoalition(id:number,name:string,ideology:string,description:string,photoUrl:string|null){
  unwrap(await supabase.rpc('aog_coalition_update',{p_coalition_id:id,p_name:name,p_ideology:ideology,p_description:description,p_photo_url:photoUrl}));
}
export async function kickCoalitionParty(coalitionId:number,partyId:number){
  unwrap(await supabase.rpc('aog_coalition_kick',{p_coalition_id:coalitionId,p_party_id:partyId}));
}
export async function leaveCoalition(id:number){
  unwrap(await supabase.rpc('aog_coalition_leave',{p_coalition_id:id}));
}
export async function disbandCoalition(id:number){
  unwrap(await supabase.rpc('aog_coalition_disband',{p_coalition_id:id}));
}
export async function uploadCoalitionLogo(authId:string,blob:Blob){
  const path=`${authId}/coalition-${Date.now()}-${Math.random().toString(36).slice(2,8)}.png`;
  const {error}=await supabase.storage.from('avatars').upload(path,blob,{contentType:'image/png',upsert:false});
  if(error)throw new Error(error.message);
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
