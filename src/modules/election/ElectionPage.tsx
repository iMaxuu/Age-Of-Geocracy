import { LegacyVisualPage } from '../legacy-ui/LegacyVisualPage';

/**
 * ELECTION: shell visual del módulo migrado.
 * Próxima fase: reemplazar el layout legacy por componentes y servicios TS propios.
 */
export default function ElectionPage() {
  return <LegacyVisualPage page="election" />;
}
