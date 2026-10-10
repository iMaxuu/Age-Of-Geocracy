import { LegacyVisualPage } from '../legacy-ui/LegacyVisualPage';

/**
 * WAR: shell visual del módulo migrado.
 * Próxima fase: reemplazar el layout legacy por componentes y servicios TS propios.
 */
export default function WarPage() {
  return <LegacyVisualPage page="war" />;
}
