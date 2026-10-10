import { LegacyVisualPage } from '../legacy-ui/LegacyVisualPage';

/**
 * NEWS: shell visual del módulo migrado.
 * Próxima fase: reemplazar el layout legacy por componentes y servicios TS propios.
 */
export default function NewsPage() {
  return <LegacyVisualPage page="news" />;
}
