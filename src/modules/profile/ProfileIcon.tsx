/** Utiliza exactamente los iconos SVG de Home, con el mismo sistema de máscaras. */
const iconUrl = (name: string) => `/assets/icons/icons/${name}.svg?v=0.0.3-custom-2`;

export function ProfileIcon({ name, className = '' }: { name: string; className?: string }) {
  return <span
    aria-hidden="true"
    className={`pr-home-icon ${className}`}
    style={{ maskImage: `url(${iconUrl(name)})`, WebkitMaskImage: `url(${iconUrl(name)})` }}
  />;
}

export const PROFILE_INFO_ICONS: Record<string, string> = {
  'REGISTRO': 'events',
  'EXPERIENCIA': 'statistics',
  'DAÑO TOTAL': 'statistics',
  'TERRITORIO': 'territory',
  'CIUDADANÍA': 'region',
  'AMIGOS': 'players',
  'REGIONAL MÁX.': 'region',
  'NACIONAL MÁX.': 'nation',
};
