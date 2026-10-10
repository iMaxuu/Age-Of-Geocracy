import { LegacyVisualPage } from '../legacy-ui/LegacyVisualPage';

/**
 * REGION: shell visual del módulo migrado.
 * Próxima fase: reemplazar el layout legacy por componentes y servicios TS propios.
 */
export default function RegionPage() {
  return <LegacyVisualPage page="region" />;
}
