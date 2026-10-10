import { LegacyVisualPage } from '../legacy-ui/LegacyVisualPage';

/**
 * NATION: shell visual del módulo migrado.
 * Próxima fase: reemplazar el layout legacy por componentes y servicios TS propios.
 */
export default function NationPage() {
  return <LegacyVisualPage page="nation" />;
}
