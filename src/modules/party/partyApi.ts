import { supabase } from '../../lib/supabase';

export type PartyPerson = {
  id: number;
  name: string;
  photo_url: string | null;
  political_ideology: string | null;
  country_code: string | null;
};
export type PartySummary = {
  id: number;
  name: string;
  ideology: string;
  photo_url: string | null;
  founding_territory_id: number;
  nation_id: number | null;
  nation_name: string | null;
  member_count: number;
  coalition_id?:number|null; coalition_name?:string|null;
  created_at: string;
};
export type PartyRequest = {id: number;player_id: number;name: string;photo_url: string|null;created_at: string};
export type PartyDetail = PartySummary & {
  description: string;
  founder_id: number;
  leader_id: number;
  founder: PartyPerson;
  leader: PartyPerson;
  members: PartyPerson[];
  requests: PartyRequest[];
};
export type MyPartyState = {party_id:number|null;pending_party_id:number|null};

function getResult<T>(response: {data: unknown; error: {message:string}|null}): T {
  if (response.error) throw new Error(response.error.message);
  return response.data as T;
}
export async function listParties(search: string,offset: number,limit=12) {
  return getResult<PartySummary[]>(await supabase.rpc('aog_party_list', {p_search:search,p_limit:limit,p_offset:offset}));
}
export async function ownParty() {
  return getResult<MyPartyState>(await supabase.rpc('aog_party_my_state'));
}
export async function partyDetails(id: number) {
  return getResult<PartyDetail|null>(await supabase.rpc('aog_party_detail',{p_party_id:id}));
}
export async function createParty(name:string, ideology:string, description:string) {
  return getResult<number>(await supabase.rpc('aog_party_create',{p_name:name,p_ideology:ideology,p_description:description}));
}
export async function applyToParty(id:number) {
  getResult(await supabase.rpc('aog_party_apply',{p_party_id:id}));
}
export async function decidePartyRequest(requestId:number,accept:boolean) {
  getResult(await supabase.rpc('aog_party_decide',{p_request_id:requestId,p_accept:accept}));
}
export async function updateParty(id:number,name:string,ideology:string,description:string,photoUrl:string|null) {
  getResult(await supabase.rpc('aog_party_update',{p_party_id:id,p_name:name,p_ideology:ideology,p_description:description,p_photo_url:photoUrl}));
}
export async function kickPartyMember(partyId:number,playerId:number) {
  getResult(await supabase.rpc('aog_party_kick',{p_party_id:partyId,p_player_id:playerId}));
}
export async function leaveParty(partyId:number) {
  getResult(await supabase.rpc('aog_party_leave',{p_party_id:partyId}));
}
export async function disbandParty(partyId:number) {
  getResult(await supabase.rpc('aog_party_disband',{p_party_id:partyId}));
}
export async function uploadPartyPhoto(authId:string,file:Blob) {
  const path=`${authId}/party-${Date.now()}-${Math.random().toString(36).slice(2,8)}.png`;
  const result = await supabase.storage.from('avatars').upload(path,file,{contentType:'image/png',upsert:false});
  if(result.error) throw new Error(result.error.message);
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
