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
  startedAt: string;
  serverTime: string;
  speed: number;
  streak: number;
  energy: number;
  xp: number;
  level: number;
  pool: WorkPool;
};

export type WorkHit = WorkRound & {
  amount: number;
  zone: 'red' | 'orange' | 'yellow' | 'lime' | 'green';
  position: number;
  inventoryAmount: number | null;
};

const validResources: ResourceName[] = ['wood','mineral','gold','oil','diamond','uranium','geocracyum','aurexium'];
function parseResource(value: unknown): ResourceName {
  if (typeof value !== 'string' || !validResources.includes(value as ResourceName)) throw new Error('Recurso no válido.');
  return value as ResourceName;
}
function parseRound(raw: unknown): WorkRound {
  if (!raw || typeof raw !== 'object') throw new Error('Respuesta de extracción inválida.');
  const record = raw as Record<string,unknown>;
  return {
    resource: parseResource(record.resource),
    startedAt: String(record.started_at),
    serverTime: String(record.server_time),
    speed: Number(record.speed) || 1,
    streak: Number(record.streak) || 0,
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
    return {resource, current: pool?.current_amount ?? 0, maximum: pool?.max_amount ?? 0,
      scopeKind: pool?.scope_kind ?? 'territory', scopeId: pool?.scope_id ?? territoryId};
  });
}
export async function startWork(resource: ResourceName): Promise<WorkRound> {
  const {data,error} = await supabase.rpc('aog_work_start', {p_resource_code: resource});
  if (error) throw new Error(error.message);
  return parseRound(data);
}
export async function hitWork(resource: ResourceName, pressedAt: string): Promise<WorkHit> {
  const {data,error} = await supabase.rpc('aog_work_hit', {p_resource_code: resource, p_pressed_at: pressedAt});
  if (error) throw new Error(error.message);
  const round = parseRound(data);
  const record = data as Record<string,unknown>;
  const zone = String(record.zone) as WorkHit['zone'];
  if (!['red','orange','yellow','lime','green'].includes(zone)) throw new Error('Resultado de extracción inválido.');
  return {...round,zone,amount:Number(record.amount)||0,position:Number(record.position)||0,
    inventoryAmount: record.inventory_amount == null ? null : Number(record.inventory_amount)};
}

/** Misma onda triangular que en SQL. La zona se decide en el servidor. */
export function needlePosition(nowMs: number, startedAtMs: number, speed: number): number {
  if (!Number.isFinite(startedAtMs)) return 0;
  const elapsed = Math.max(0, nowMs - startedAtMs);
  const period = 3000 / Math.max(1, speed);
  const phase = (elapsed % period) / period;
  return (1 - Math.abs(2 * phase - 1)) * 100;
}
