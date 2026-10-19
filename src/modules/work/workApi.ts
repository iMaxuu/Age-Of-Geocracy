import { supabase } from '../../lib/supabase';
import { getResourceStatus } from '../map/resourcesApi';
import type { ResourceName } from '../map/world';

export type WorkPool = {
  resource: ResourceName;
  current: number;
  maximum: number;
  scopeKind: 'territory' | 'region';
  scopeId: number;
};

export type WorkRound = {
  resource: ResourceName;
  energy: number;
  xp: number;
  level: number;
  pool: WorkPool;
};

export type WorkHit = WorkRound & {
  /** Unidades realmente ingresadas al Almacén (pueden ser menores por capacidad). */
  amount: number;
  /** Resultado original del sorteo, antes de aplicar el límite del Almacén. */
  rolledAmount: number;
  maxAward: number;
  inventoryAmount: number | null;
};

const validResources: ResourceName[] = [
  'wood', 'mineral', 'gold', 'oil', 'diamond', 'uranium', 'geocracyum', 'aurexium',
];
function parseResource(value: unknown): ResourceName {
  if (typeof value !== 'string' || !validResources.includes(value as ResourceName)) {
    throw new Error('Recurso no válido.');
  }
  return value as ResourceName;
}
function parseRound(raw: unknown): WorkRound {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Respuesta de extracción inválida.');
  const record = raw as Record<string, unknown>;
  return {
    resource: parseResource(record.resource),
    energy: Number(record.energy) || 0,
    xp: Number(record.xp) || 0,
    level: Number(record.level) || 1,
    pool: {
      resource: parseResource(record.resource),
      current: Number(record.pool_current) || 0,
      maximum: Number(record.pool_max) || 0,
      scopeId: Number(record.scope_id) || 0,
      scopeKind: record.scope_kind === 'region' ? 'region' : 'territory',
    },
  };
}

export async function workPools(territoryId: number): Promise<WorkPool[]> {
  const data = await getResourceStatus(territoryId);
  return validResources.map(resource => {
    const pool = data.get(resource);
    return {
      resource,
      current: pool?.current_amount ?? 0,
      maximum: pool?.max_amount ?? 0,
      scopeKind: pool?.scope_kind ?? 'territory',
      scopeId: pool?.scope_id ?? territoryId,
    };
  });
}

export async function startWork(resource: ResourceName): Promise<WorkRound> {
  const { data, error } = await supabase.rpc('aog_work_start', { p_resource_code: resource });
  if (error) throw new Error(error.message);
  return parseRound(data);
}

/** El resultado se sortea exclusivamente en Supabase. No se envía ninguna cantidad desde el cliente. */
export async function hitWork(resource: ResourceName): Promise<WorkHit> {
  // Conservamos la firma existente de la RPC para no romper otras dependencias.
  const { data, error } = await supabase.rpc('aog_work_hit', {
    p_resource_code: resource,
    p_pressed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  const round = parseRound(data);
  const record = data as Record<string, unknown>;
  const amount = Number(record.amount);
  const rolledAmount = Number(record.rolled_amount);
  const maxAward = Number(record.max_award);
  if (!Number.isInteger(amount) || !Number.isInteger(rolledAmount) || !Number.isInteger(maxAward)
      || amount < 0 || rolledAmount < 0 || rolledAmount > maxAward || amount > rolledAmount) {
    throw new Error('Resultado aleatorio de extracción inválido. ¿Ejecutaste el SQL actualizado?');
  }
  return {
    ...round,
    amount,
    rolledAmount,
    maxAward,
    inventoryAmount: record.inventory_amount == null ? null : Number(record.inventory_amount),
  };
}
