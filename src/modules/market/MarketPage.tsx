import { LegacyVisualPage } from '../legacy-ui/LegacyVisualPage';

/**
 * MARKET: shell visual del módulo migrado.
 * Próxima fase: reemplazar el layout legacy por componentes y servicios TS propios.
 */
export default function MarketPage() {
  return <LegacyVisualPage page="market" />;
}
