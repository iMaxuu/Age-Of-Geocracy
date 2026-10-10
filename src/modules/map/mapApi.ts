import { supabase } from '../../lib/supabase';
export type MapOwnership={territory_id:number;region_id:number|null;nation_id:number|null;region_name:string|null;nation_name:string|null;region_flag:string|null;nation_flag:string|null;color:string};
export type Trip={from:number;to:number;distanceKm:number;state:'going'|'returning';startedAt:string;endsAt:string;durationSeconds:number};
export type TravelStatus={territoryId:number;serverNow:string;trip:Trip|null};
function unwrap<T>(value:{data:T|null;error:{message:string}|null}):T{if(value.error)throw Error(value.error.message);if(value.data===null)throw Error('Respuesta vacía del servidor');return value.data;}
export async function travelStatus():Promise<TravelStatus>{return unwrap<TravelStatus>(await supabase.rpc('aog_map_travel_status'));}
export async function startTravel(destination:number):Promise<TravelStatus>{return unwrap<TravelStatus>(await supabase.rpc('aog_map_start_travel',{p_destination:destination}));}
export async function cancelTravel():Promise<TravelStatus>{return unwrap<TravelStatus>(await supabase.rpc('aog_map_cancel_travel'));}
export async function getPlayerHeatmap():Promise<Map<number,number>>{
  const data=unwrap<Array<{territory_id:number;player_count:number}>>(await supabase.rpc('aog_map_player_heatmap'));
  return new Map(data.map(p=>[p.territory_id,Number(p.player_count)]));
}
export async function getOwnership():Promise<Map<number,MapOwnership>>{
  const result=new Map<number,MapOwnership>();
  // Supabase/PostgREST normally limits select results to 1000 rows per request.
  for(let offset=0;offset<60000;offset+=1000){
    const {data,error}=await supabase.from('map_territory_politics').select('territory_id,region_id,nation_id,region_name,nation_name,region_flag,nation_flag,color').order('territory_id').range(offset,offset+999);
    if(error)throw Error(error.message);
    for(const row of (data||[]) as MapOwnership[])result.set(row.territory_id,row);
    if(!data||data.length<1000)break;
  }
  return result;
}
