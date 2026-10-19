import { useEffect, useState, type CSSProperties } from 'react';
import {
  AREA_RESOURCES,
  getAreaResourceTotals,
  type AreaResourceTotal,
  type AreaScope,
} from './areaResourcesApi';

const format = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const iconRoot = '/assets/icons/';
const homeIcon = '/assets/icons/icons/statistics.svg';

type Props = { scope: AreaScope; areaId: number | null | undefined };

/** Reutilizado por Nation y Region: mismo diseño y mismas cantidades autoritativas. */
export default function AreaResourcesPanel({ scope, areaId }: Props) {
  const [rows, setRows] = useState<AreaResourceTotal[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!areaId) { setRows(null); setError(''); return; }
    let active = true;
    setRows(null);
    setError('');
    const refresh = async () => {
      try {
        const next = await getAreaResourceTotals(scope, areaId);
        if (active) { setRows(next); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los recursos.');
      }
    };
    void refresh();
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [scope, areaId]);

  return <section className="aog-home-panel aog-nation-panel aog-nation-resources-panel">
    <h2 className="aog-home-panel-heading aog-nation-heading">
      <span className="aog-home-heading-tab">
        <span className="aog-home-icon" style={{ maskImage: `url(${homeIcon})`, WebkitMaskImage: `url(${homeIcon})` }} aria-hidden="true" />
        <span>RECURSOS</span>
      </span>
    </h2>
    {error && !rows ? <div className="aog-area-resources-message" role="alert">NO SE PUDIERON CARGAR LOS RECURSOS: {error}</div>
      : !rows ? <div className="aog-area-resources-message" role="status">CARGANDO RECURSOS...</div>
      : <div className="aog-area-resource-grid">
        {AREA_RESOURCES.map((item, index) => {
          const totals = rows[index];
          const current = totals?.current_amount ?? 0;
          const maximum = totals?.max_amount ?? 0;
          const fraction = maximum > 0 ? Math.max(0, Math.min(100, current / maximum * 100)) : 0;
          const style = {
            '--resource-accent': item.color,
            '--resource-bg': item.background,
            '--resource-fill': item.foreground,
          } as CSSProperties;
          return <div key={item.code} className="aog-area-resource-card" style={style}>
            <span className="aog-area-resource-symbol" style={{ maskImage: `url(${iconRoot}${item.code === 'mineral' ? 'ore' : item.code}.svg)`, WebkitMaskImage: `url(${iconRoot}${item.code === 'mineral' ? 'ore' : item.code}.svg)` }} aria-hidden="true" />
            <div className="aog-area-resource-data">
              <strong className="aog-area-resource-title">{item.name}</strong>
              <span className="aog-area-resource-amount" title={`${format.format(current)} de ${format.format(maximum)}`}>
                {format.format(current)}/{format.format(maximum)}
              </span>
              <div className="aog-area-resource-bar" role="progressbar" aria-label={`Existencias de ${item.name.toLowerCase()}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction)}>
                <span style={{ width: `${fraction}%` }} />
              </div>
            </div>
          </div>;
        })}
      </div>}
  </section>;
}
