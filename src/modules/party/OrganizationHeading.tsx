/** Encabezado visual compartido por Partido y Coalición.
 * Mismo tamaño y corte diagonal que Home, Nation, Region y Territory. */
export default function OrganizationHeading({title,icon,star=false}:{title:string;icon:string;star?:boolean}) {
  const url=`/assets/icons/icons/${icon}.svg?v=0.0.3-custom-2`;
  return <h2 className="aog-org-heading">
    <span className="aog-org-heading-tab">
      <span className="aog-org-heading-icon" style={{WebkitMaskImage:`url(${url})`,maskImage:`url(${url})`}} aria-hidden="true"/>
      <span>{title}</span>
    </span>
    {star&&<span className="aog-org-leader-star" aria-hidden="true">★</span>}
  </h2>;
}
