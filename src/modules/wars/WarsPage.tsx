import { LegacyVisualPage } from '../legacy-ui/LegacyVisualPage';

/**
 * WARS: shell visual del módulo migrado.
 * Próxima fase: reemplazar el layout legacy por componentes y servicios TS propios.
 */
export default function WarsPage() {
  return <LegacyVisualPage page="wars" />;
}
