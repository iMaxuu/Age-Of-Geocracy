# Geografía y licencia

Natural Earth 1:50m, capas `ne_50m_land` y `ne_50m_admin_0_countries`.
Datos de dominio público; uso comercial y modificación permitidos.
https://www.naturalearthdata.com/about/terms-of-use/
https://www.naturalearthdata.com/downloads/50m-physical-vectors/

Copias originales y hashes SHA256: `scripts/world/sources/manifest.json`.
Las fronteras de países son referencia; no asignan propiedades políticas.

Proyección: WGS84 → EPSG:8857, PROJ mediante pyproj. Unidades del renderer:
kilómetros, Y hacia abajo. Densificación previa: 0,25 grados.
https://proj.org/en/stable/operations/projections/eqearth.html

Continentes: siete máscaras geográficas deterministas; Panamá, Suez/Mar Rojo,
Urales/Cáucaso/Bósforo y Nueva Guinea/Wallacea. Convenciones explícitas
en `load_land()`; sin relación con Naciones del juego.

Resolución cartográfica 1:50m: las islas ausentes en Natural Earth no se
inventan. Las islas pequeñas presentes se conservan como excepción de tamaño.
