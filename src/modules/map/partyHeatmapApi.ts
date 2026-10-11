import { supabase } from '../../lib/supabase';

/** Recuento agregado; nunca consultamos aog_parties directamente desde el navegador. */
export async function getPartyHeatmap():Promise<Map<number,number>> {
  const {data,error}=await supabase.rpc('aog_map_party_heatmap');
  if(error)throw Error(error.message);
  return new Map(((data||[]) as Array<{territory_id:number;party_count:number}>).map(row=>[Number(row.territory_id),Number(row.party_count)]));
}
