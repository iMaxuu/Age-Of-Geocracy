import { supabase } from '../../lib/supabase';

export type DirectMessage = {
  id: number;
  sender_id: number;
  recipient_id: number;
  content: string;
  created_at: string;
  read_at: string | null;
};
export type Conversation = {
  other_id: number;
  other_name: string;
  other_photo_url: string | null;
  last_content: string;
  last_at: string;
  unread_count: number;
};
export type ChatContact = { id: number; name: string; photo_url: string | null };

export async function loadConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('aog_dm_inbox');
  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

export async function loadContact(id: number): Promise<ChatContact> {
  const { data, error } = await supabase.rpc('aog_public_player_profile', { p_player_id: id });
  if (error) throw new Error(error.message);
  const profile = (Array.isArray(data) ? data[0] : data) as ChatContact | null;
  if (!profile?.id) throw new Error('Este jugador no existe.');
  return { id: profile.id, name: profile.name, photo_url: profile.photo_url };
}

// Siempre cargamos el bloque más reciente: no recortar mensajes antiguos en la BD.
export async function loadMessages(selfId: number, otherId: number, olderThan?: number): Promise<DirectMessage[]> {
  let q = supabase.from('aog_direct_messages')
    .select('id,sender_id,recipient_id,content,created_at,read_at')
    .or(`and(sender_id.eq.${selfId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${selfId})`)
    .order('id', { ascending: false })
    .limit(50);
  if (olderThan) q = q.lt('id', olderThan);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as DirectMessage[]).reverse();
}

export async function sendDirectMessage(senderId: number, recipientId: number, content: string): Promise<DirectMessage> {
  const body = content.trim();
  if (!body || body.length > 2000) throw new Error('El mensaje debe tener entre 1 y 2.000 caracteres.');
  const { data, error } = await supabase.from('aog_direct_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, content: body })
    .select('id,sender_id,recipient_id,content,created_at,read_at').single();
  if (error) throw new Error(error.message);
  return data as DirectMessage;
}

export async function markConversationRead(otherId: number): Promise<void> {
  const { error } = await supabase.rpc('aog_dm_mark_read', { p_sender_id: otherId });
  if (error) throw new Error(error.message);
}

export async function getUnreadDirectMessages(selfId: number): Promise<{ count: number; lastId: number; senderId: number }> {
  const { data, count, error } = await supabase.from('aog_direct_messages')
    .select('id,sender_id', { count: 'exact' })
    .eq('recipient_id', selfId)
    .is('read_at', null)
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return { count: count ?? 0, lastId: Number(data?.[0]?.id ?? 0), senderId: Number(data?.[0]?.sender_id ?? 0) };
}
