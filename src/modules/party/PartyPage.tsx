import { LegacyVisualPage } from '../legacy-ui/LegacyVisualPage';

/**
 * PARTY: shell visual del módulo migrado.
 * Próxima fase: reemplazar el layout legacy por componentes y servicios TS propios.
 */
export default function PartyPage() {
  return <LegacyVisualPage page="party" />;
}
