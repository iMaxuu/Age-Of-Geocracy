import { supabase } from '../../lib/supabase';

export interface Player {
  id: number;
  authId: string;
  email: string;
  name: string;
  territoryId: number;
  level: number;
  xp: number;
  money: number;
  gold: number;
  energy: number;
  premium: boolean;
  photo?: { url?: string; icon?: string | null; background?: string };
  stats: { attack: number; defense: number; efficiency: number; strength: number };
  biography?: string;
  countryCode?: string | null;
  politicalIdeology?: string | null;
  createdAt?: string;
  citizenship?: { regionId?: number | null; nationId?: number | null };
  [key: string]: unknown;
}

interface ProfileRow {
  id: number; auth_id: string; email: string | null; name: string; territory_id: number;
  level: number; xp: number; money: number; gold: number; energy: number; premium: boolean;
  photo_url: string | null; attack: number; defense: number; efficiency: number; strength: number;
  biography: string; country_code: string | null; political_ideology: string | null; created_at: string;
}
export function playerFromRow(r: ProfileRow): Player {
  return {
    id:r.id, authId:r.auth_id, email:r.email || '',name:r.name,territoryId:r.territory_id,
    level:r.level,xp:r.xp,money:r.money,gold:r.gold,energy:r.energy,premium:r.premium,
    photo:{url:r.photo_url || '/assets/photos/nophoto.png'},
    stats:{attack:r.attack,defense:r.defense,efficiency:r.efficiency,strength:r.strength},
    biography:r.biography,countryCode:r.country_code,politicalIdeology:r.political_ideology,createdAt:r.created_at,
  };
}
export async function fetchPlayer(authId: string): Promise<Player> {
  // RPC autenticada: la energía se regenera según el reloj de la base de datos.
  const {data,error}=await supabase.rpc('aog_get_player_with_energy');
  if(error) throw new Error(`No se pudo cargar el jugador: ${error.message}. Aplicá supabase/energia-regeneracion.sql.`);
  if(!data || data.auth_id !== authId) throw new Error('Jugador no encontrado.');
  return playerFromRow(data as ProfileRow);
}
export async function register(email:string,password:string,confirmation:string):Promise<void> {
  if(password!==confirmation) throw new Error('Las contraseñas no coinciden.');
  if(password.length<6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  const {data,error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password});
  if(error) throw error;
  if(!data.session) throw new Error('Cuenta creada. Confirmá tu correo electrónico y después iniciá sesión.');
}
export async function login(email:string,password:string):Promise<void> {
  const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
  if(error) throw error;
}
export async function logout():Promise<void> {
  const {error}=await supabase.auth.signOut();
  if(error) throw error;
}
// XP permanente: cada requisito se redondea ANTES de multiplicar por 1,25.
// Ejemplo: 100, 125, 156, 195, 244, 305...
export function getXp(player: Player): {level:number;xp:number;required:number;totalXp:number;currentThreshold:number;nextThreshold:number} {
  const totalXp = Math.max(0, Math.floor(Number(player.xp) || 0));
  let level = 1;
  let currentThreshold = 0;
  let step = 100;
  // No redondear las potencias acumuladas: se redondea cada etapa.
  while (currentThreshold + step <= totalXp && Number.isSafeInteger(currentThreshold + step)) {
    currentThreshold += step;
    level += 1;
    step = Math.max(1, Math.round(step * 1.25));
    if (!Number.isSafeInteger(step)) break;
  }
  const nextThreshold = currentThreshold + step;
  return {
    level,
    xp: totalXp - currentThreshold,
    required: step,
    totalXp,
    currentThreshold,
    nextThreshold,
  };
}
export async function updatePlayerProfile(changes:Record<string,unknown>):Promise<Player> {
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError || !user) throw new Error('Tu sesión expiró. Iniciá sesión nuevamente.');
  const updates:Record<string,unknown>={};
  if(typeof changes.name==='string') updates.name=changes.name.trim().slice(0,30);
  if(typeof changes.biography==='string') updates.biography=changes.biography.slice(0,500);
  if(changes.countryCode===null || typeof changes.countryCode==='string') updates.country_code=changes.countryCode;
  if(changes.politicalIdeology===null || typeof changes.politicalIdeology==='string') updates.political_ideology=changes.politicalIdeology;
  const photo=changes.photo as {url?:string}|undefined;
  if(photo?.url?.startsWith('data:image/png;base64,')) {
    const binary=atob(photo.url.split(',')[1]);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const location=`${user.id}/avatar.png`;
    const {error:uploadError}=await supabase.storage.from('avatars').upload(location,bytes,{contentType:'image/png',upsert:true});
    if(uploadError) throw new Error(`No se pudo guardar la foto: ${uploadError.message}`);
    const {data:publicUrl}=supabase.storage.from('avatars').getPublicUrl(location);
    updates.photo_url=publicUrl.publicUrl+`?v=${Date.now()}`;
  }
  // La función SQL limita qué campos puede cambiar un jugador.
  const current=await fetchPlayer(user.id);
  const {data,error}=await supabase.rpc('update_own_profile',{
    p_name:updates.name ?? current.name,
    p_biography:updates.biography ?? current.biography ?? '',
    p_country_code:updates.country_code ?? current.countryCode ?? null,
    p_political_ideology:updates.political_ideology ?? current.politicalIdeology ?? null,
    p_photo_url:updates.photo_url ?? null,
  });
  if(error) throw new Error(`No se pudo guardar el perfil: ${error.message}`);
  return playerFromRow(data as ProfileRow);
}
