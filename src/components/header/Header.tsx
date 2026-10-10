import { MailIcon, SettingsIcon, ShopIcon, UserIcon } from './icons';
import { PlayerStatCard } from './PlayerStatCard';

export type HeaderAction = 'messages' | 'profile' | 'shop' | 'settings';

export type HeaderSection =
  | 'home'
  | 'map'
  | 'nation'
  | 'region'
  | 'territory'
  | 'party'
  | 'coalition'
  | 'news'
  | 'wars'
  | 'work'
  | 'storage';

type HeaderProps = {
  activeSection?: HeaderSection | HeaderAction;
  level?: number;
  money?: number;
  geocracy?: number;
  profileImageUrl?: string | null;
  xp?: number;
  xpRequired?: number;
  energy?: number;
  energyMax?: number;
  version?: string;
  onNavigate?: (section: HeaderSection) => void;
  onLink?: (path: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
  onMail?: () => void;
  onProfile?: () => void;
  onShop?: () => void;
  onSettings?: () => void;
};

type NavItem = {
  key: HeaderSection;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'INICIO' },
  { key: 'map', label: 'MAPA' },
  { key: 'nation', label: 'NACIÓN' },
  { key: 'region', label: 'REGIÓN' },
  { key: 'territory', label: 'TERRITORIO' },
  { key: 'party', label: 'PARTIDO' },
  { key: 'coalition', label: 'COALICIÓN' },
  { key: 'news', label: 'NOTICIAS' },
  { key: 'wars', label: 'GUERRAS' },
  { key: 'work', label: 'TRABAJO' },
  { key: 'storage', label: 'ALMACÉN' },
];

const numberFormatter = new Intl.NumberFormat('es-AR');

function formatNumber(value: number) {
  return numberFormatter.format(Math.max(0, Math.floor(value)));
}

function NavButton({
  item,
  active,
  href,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  href: string;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`
        flex h-8 w-[118px] shrink-0 items-center justify-center rounded-[999px] border-2 border-[var(--aog-accent)] lg:w-auto lg:min-w-0 lg:flex-1
        px-1.5 text-center text-[clamp(9px,0.68vw,12px)] font-black tracking-[0.01em]
        text-[var(--aog-accent)] whitespace-nowrap
        transition-[background,color,transform] duration-150
        hover:bg-[color-mix(in_srgb,var(--aog-accent)_16%,transparent)]
        active:scale-[0.98]
        ${active ? 'bg-[color-mix(in_srgb,var(--aog-accent)_13%,transparent)]' : 'bg-black'}
      `}
    >
      {item.label}
    </a>
  );
}

function ActionButton({
  label,
  onClick,
  href,
  active,
  children,
}: {
  label: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`grid h-8 w-[clamp(36px,2.65vw,44px)] shrink-0 place-items-center rounded-[999px] border-2 border-[var(--aog-accent)] text-[var(--aog-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--aog-accent)_16%,transparent)] ${active ? 'bg-[color-mix(in_srgb,var(--aog-accent)_20%,transparent)]' : 'bg-black'}`}
    >
      {children}
    </a>
  );
}

export function Header({
  activeSection = 'home',
  level = 1,
  money = 25_000,
  geocracy = 500_000,
  profileImageUrl = null,
  xp = 35,
  xpRequired = 100,
  energy = 72,
  energyMax = 100,
  version = 'PRE-ALPHA v0.0.3',
  onNavigate,
  onLink,
  onMail,
  onProfile,
  onShop,
  onSettings,
}: HeaderProps) {
  const xpProgress = xpRequired > 0 ? (xp / xpRequired) * 100 : 0;
  const energyProgress = energyMax > 0 ? (energy / energyMax) * 100 : 0;

  return (
    <header className="relative z-40 w-full border-b-[3px] border-[var(--aog-accent)] bg-black text-white md:sticky md:top-0 md:z-50">
      <div className="mx-auto flex min-h-[76px] w-full items-start gap-2 px-1.5 pt-1.5 max-md:relative max-md:min-h-[96px] max-md:gap-1.5 max-md:pt-[48px] max-md:pb-1">
        <div className="flex shrink-0 gap-2 max-md:gap-[5px]">
          <div className="max-md:relative max-md:h-[41px] max-md:w-[42px] max-md:shrink-0">
            <div className="max-md:absolute max-md:left-0 max-md:top-0 max-md:origin-top-left max-md:scale-[0.6]">
          <PlayerStatCard
            value={level}
            progress={xpProgress}
            ariaLabel={`Nivel ${Math.max(1, Math.floor(level))}. Experiencia ${Math.max(0, Math.floor(xp))} de ${Math.max(1, Math.floor(xpRequired))}.`}
          />
            </div>
          </div>

          <div className="max-md:relative max-md:h-[41px] max-md:w-[42px] max-md:shrink-0">
            <div className="max-md:absolute max-md:left-0 max-md:top-0 max-md:origin-top-left max-md:scale-[0.6]">
          <PlayerStatCard
            label=""
            imageUrl={profileImageUrl || "/assets/photos/nophoto.png"}
            progress={energyProgress}
            ariaLabel={`Abrir perfil. Energía ${Math.max(0, Math.floor(energy))} de ${Math.max(1, Math.floor(energyMax))}.`}
            onClick={onProfile}
            />
            </div>
          </div>
        </div>

        <div className="min-w-[170px] shrink-0 pt-2 font-black leading-none max-md:min-w-0 max-md:pt-1">
          <div className="text-[20px] tracking-[0.02em] text-[var(--aog-accent)] max-md:text-[12px]">
            $ {formatNumber(money)}
          </div>
          <div className="mt-2 text-[20px] tracking-[0.02em] text-[var(--aog-gold)] max-md:mt-1 max-md:text-[12px]">
            G {formatNumber(geocracy)}
          </div>
        </div>

        <div className="ml-auto flex min-w-0 flex-col items-end pr-1 pt-1 text-right max-md:absolute max-md:top-[5px] max-md:left-0 max-md:right-0 max-md:ml-0 max-md:w-full max-md:items-center max-md:pr-0 max-md:pt-0 max-md:text-center">
          <div className="max-w-full whitespace-nowrap font-black tracking-[-0.025em] text-[30px] leading-[0.95] text-[var(--aog-accent)] max-md:text-[clamp(15px,3.9vw,21px)] lg:text-[31px]">
            AGE OF GEOCRACY
          </div>
          <div className="mt-1 text-[15px] font-black tracking-[0.08em] text-[var(--aog-accent)] max-md:mt-1 max-md:text-[9px]">
            {version}
          </div>
        </div>
      </div>

      <div className="flex min-h-[41px] w-full items-center gap-1 overflow-x-auto overflow-y-hidden px-1.5 pb-1.5 [scrollbar-width:thin] lg:overflow-x-hidden">
        <nav className="flex w-max shrink-0 items-center gap-1 lg:w-auto lg:min-w-0 lg:flex-1" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.key}
              item={item}
              active={activeSection === item.key}
              href={`/${item.key}`}
              onClick={(event) => {
                if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (onLink) onLink(`/${item.key}`, event);
                else { event.preventDefault(); onNavigate?.(item.key); }
              }}
            />
          ))}
        </nav>

        <div className="ml-0.5 flex shrink-0 items-center gap-1">
          <ActionButton
            label="Mensajes"
            href="/messages"
            active={activeSection === 'messages'}
            onClick={(event) => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (onLink) onLink('/messages', event);
              else { event.preventDefault(); onMail?.(); }
            }}
          >
            <MailIcon className="h-6 w-6" />
          </ActionButton>
          <ActionButton
            label="Perfil"
            href="/profile"
            active={activeSection === 'profile'}
            onClick={(event) => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (onLink) onLink('/profile', event);
              else { event.preventDefault(); onProfile?.(); }
            }}
          >
            <UserIcon className="h-6 w-6" />
          </ActionButton>
          <ActionButton
            label="Tienda"
            href="/shop"
            active={activeSection === 'shop'}
            onClick={(event) => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (onLink) onLink('/shop', event);
              else { event.preventDefault(); onShop?.(); }
            }}
          >
            <ShopIcon className="h-6 w-6" />
          </ActionButton>
          <ActionButton
            label="Configuración"
            href="/settings"
            active={activeSection === 'settings'}
            onClick={(event) => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (onLink) onLink('/settings', event);
              else { event.preventDefault(); onSettings?.(); }
            }}
          >
            <SettingsIcon className="h-6 w-6" />
          </ActionButton>
        </div>
      </div>
    </header>
  );
}
