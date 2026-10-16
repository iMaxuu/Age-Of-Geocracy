import { supabase } from '../../lib/supabase';

export const INVENTORY_RESOURCES = [
  { code:'wood', name:'MADERA', icon:'wood', color:'#a45b36' },
  { code:'mineral', name:'MINERAL', icon:'ore', color:'#b9c3cf' },
  { code:'oil', name:'PETRÓLEO', icon:'oil', color:'#9f80b4' },
  { code:'gold', name:'ORO', icon:'gold', color:'#f0d05e' },
  { code:'diamond', name:'DIAMANTE', icon:'diamond', color:'#74bee9' },
  { code:'uranium', name:'URANIO', icon:'uranium', color:'#65c960' },
  { code:'geocracyum', name:'GEOCRACYUM', icon:'geocracyum', color:'#ea7cc5' },
  { code:'aurexium', name:'AUREXIUM', icon:'aurexium', color:'#668def' },
] as const;
export type InventoryCode = typeof INVENTORY_RESOURCES[number]['code'];
export type Inventory = Record<InventoryCode, number>;
export const formatUnits = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export async function getMyInventory(): Promise<Inventory> {
  const { data, error } = await supabase.rpc('aog_my_inventory');
  if (error) throw new Error(`No se pudo cargar el almacén: ${error.message}`);
  const response = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  return Object.fromEntries(INVENTORY_RESOURCES.map(({code}) => {
    const n = Number(response[code]);
    return [code, Number.isFinite(n) && n > 0 ? Math.floor(n) : 0];
  })) as Inventory;
}
