import './geocracy-heading.css';

/** Etiqueta diagonal reutilizable: misma geometría que Home/Nation/Region. */
export default function GeocracyHeading({
  title,
  icon,
  as = 'h2',
  className = '',
}: {
  title: string;
  icon: string;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  const Heading = as;
  const iconUrl = `/assets/icons/icons/${icon}.svg?v=0.0.3-custom-2`;
  return (
    <Heading className={`aog-geo-heading ${className}`}>
      <span className="aog-geo-heading-tab">
        <span
          className="aog-geo-heading-icon"
          aria-hidden="true"
          style={{ WebkitMaskImage: `url(${iconUrl})`, maskImage: `url(${iconUrl})` }}
        />
        <span className="aog-geo-heading-label">{title}</span>
      </span>
    </Heading>
  );
}
