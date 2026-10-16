import HomePage from './home/HomePage';
import NationPage from './nation/NationPage';
import RegionPage from './region/RegionPage';
import NationalparliamentPage from './nationalparliament/NationalparliamentPage';
import RegionalparliamentPage from './regionalparliament/RegionalparliamentPage';
import WarsPage from './wars/WarsPage';
import WarPage from './war/WarPage';
import MarketPage from './market/MarketPage';
import ShopPage from './shop/ShopPage';
import ConfigPage from './config/ConfigPage';

import type { ComponentType } from 'react';
const SCREENS: Record<string, ComponentType> = {
  home: HomePage,
  nation: NationPage,
  region: RegionPage,
  nationalparliament: NationalparliamentPage,
  regionalparliament: RegionalparliamentPage,
  wars: WarsPage,
  war: WarPage,
  market: MarketPage,
  shop: ShopPage,
  config: ConfigPage,
};

export function MigratedPage({ page }: { page: string }) {
  const Component = SCREENS[page] ?? SCREENS.home;
  return <Component />;
}
