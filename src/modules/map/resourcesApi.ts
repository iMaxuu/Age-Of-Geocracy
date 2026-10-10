import { supabase } from '../../lib/supabase';
import { world, RESOURCES, type ResourceName } from './world';
import type { MapOwnership } from './mapApi';

export type ResourceStatus = {
  resource_code: ResourceName;
  current_amount: number;
  max_amount: number;
  regen_seconds: number | null;
  scope_kind: 'territory' | 'region';
  scope_id: number;
};
export type ResourcePool = Pick<ResourceStatus, 'resource_code' | 'current_amount' | 'max_amount' | 'scope_kind' | 'scope_id'>;
export type ResourcePools = Map<string, ResourcePool>;

const validResource = (value: string): value is ResourceName => RESOURCES.includes(value as ResourceName);
export const poolKey = (kind: string, id: number, resource: ResourceName) => `${kind}:${id}:${resource}`;

/** Consulta autoritativa. También hace efectiva la regeneración pendiente en Supabase. */
export async function getResourceStatus(territoryId: number): Promise<Map<ResourceName, ResourceStatus>> {
  const { data, error } = await supabase.rpc('aog_resource_status', { p_territory_id: territoryId });
  if (error) throw Error(error.message);
  if (!Array.isArray(data) || data.length === 0) throw Error('Supabase no devolvió recursos para este territorio');
  const result = new Map<ResourceName, ResourceStatus>();
  for (const raw of data as ResourceStatus[]) {
    if (!validResource(raw.resource_code)) continue;
    result.set(raw.resource_code, {
      ...raw,
      current_amount: Number(raw.current_amount),
      max_amount: Number(raw.max_amount),
      scope_id: Number(raw.scope_id),
    });
  }
  return result;
}

/** Snapshot de depósitos agotados, sin crear 60.000 filas ni 60.000 peticiones. */
export async function getResourceMapSnapshot(resource: ResourceName): Promise<ResourcePools> {
  const result: ResourcePools = new Map();
  const pageSize = 1000;
  for (let offset = 0; offset < 500000; offset += pageSize) {
    const { data, error } = await supabase.rpc('aog_resource_map_snapshot', {
      p_resource_code: resource,
    }).order('scope_kind').order('scope_id').range(offset, offset + pageSize - 1);
    if (error) throw Error(error.message);
    const rows = (data ?? []) as ResourcePool[];
    for (const raw of rows) {
      if (!validResource(raw.resource_code)) continue;
      const value: ResourcePool = {
        ...raw,
        scope_id: Number(raw.scope_id),
        current_amount: Number(raw.current_amount),
        max_amount: Number(raw.max_amount),
      };
      result.set(poolKey(value.scope_kind, value.scope_id, value.resource_code), value);
    }
    if (rows.length < pageSize) return result;
  }
  throw Error('El mapa de recursos superó el límite de paginación.');
}

/** Las existencias de una región son compartidas; la distribución visual es proporcional al máximo natural. */
export function availableForTerritory(
  territoryId: number,
  resource: ResourceName,
  ownership: Map<number, MapOwnership>,
  pools: ResourcePools,
): number | null {
  const maximum = world.stockFor(territoryId, resource);
  if (maximum === null) return null;
  const regionId = ownership.get(territoryId)?.region_id;
  const kind = regionId && regionId > 0 ? 'region' : 'territory';
  const scopeId = kind === 'region' ? regionId! : territoryId;
  const pool = pools.get(poolKey(kind, scopeId, resource));
  if (!pool || pool.max_amount <= 0) return maximum;
  const fraction = Math.max(0, Math.min(1, pool.current_amount / pool.max_amount));
  return Math.max(0, Math.min(maximum, Math.round(maximum * fraction)));
}
