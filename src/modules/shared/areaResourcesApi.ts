import { supabase } from '../../lib/supabase';

/** Depósitos públicos compartidos: una región cuenta una sola vez aunque tenga muchos territorios. */
export type AreaScope = 'nation' | 'region';
export type ResourceCode = 'wood' | 'mineral' | 'oil' | 'gold' | 'diamond' | 'uranium' | 'geocracyum' | 'aurexium';
export type AreaResourceTotal = {
  resource_code: ResourceCode;
  current_amount: number;
  max_amount: number;
};

export const AREA_RESOURCES: ReadonlyArray<{
  code: ResourceCode;
  name: string;
  color: string;
  background: string;
  foreground: string;
}> = [
  { code: 'wood', name: 'MADERA', color: '#99502a', background: '#271109', foreground: '#ad5429' },
  { code: 'mineral', name: 'MINERAL', color: '#d0d6dc', background: '#353638', foreground: '#d0d6dc' },
  { code: 'oil', name: 'PETRÓLEO', color: '#6f6f6f', background: '#080808', foreground: '#a8a8a8' },
  { code: 'gold', name: 'ORO', color: '#ffe167', background: '#625518', foreground: '#ffe167' },
  { code: 'diamond', name: 'DIAMANTE', color: '#81b4e0', background: '#294f70', foreground: '#81b4e0' },
  { code: 'uranium', name: 'URANIO', color: '#81e25f', background: '#03590b', foreground: '#81e25f' },
  { code: 'geocracyum', name: 'GEOCRACYUM', color: '#f267bb', background: '#591037', foreground: '#f267bb' },
  { code: 'aurexium', name: 'AUREXIUM', color: '#1279e8', background: '#06112d', foreground: '#137cec' },
] as const;

const codes = new Set<string>(AREA_RESOURCES.map(item => item.code));

/** Un solo RPC por panel, en lugar de descargar 60.000 territorios al navegador. */
export async function getAreaResourceTotals(scope: AreaScope, areaId: number): Promise<AreaResourceTotal[]> {
  if (!Number.isSafeInteger(areaId) || areaId <= 0) throw new Error('Nación o región inválida.');
  const { data, error } = await supabase.rpc('aog_area_resource_totals', {
    p_scope: scope,
    p_scope_id: areaId,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('Supabase no devolvió los recursos del área.');
  const byCode = new Map<ResourceCode, AreaResourceTotal>();
  for (const row of data as Array<Record<string, unknown>>) {
    if (typeof row.resource_code !== 'string' || !codes.has(row.resource_code)) continue;
    const maximum = Number(row.max_amount);
    const current = Number(row.current_amount);
    if (!Number.isFinite(maximum) || !Number.isFinite(current)) continue;
    byCode.set(row.resource_code as ResourceCode, {
      resource_code: row.resource_code as ResourceCode,
      current_amount: Math.max(0, Math.min(maximum, current)),
      max_amount: Math.max(0, maximum),
    });
  }
  return AREA_RESOURCES.map(item => byCode.get(item.code) ?? {
    resource_code: item.code,
    current_amount: 0,
    max_amount: 0,
  });
}
