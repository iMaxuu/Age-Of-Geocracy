# Age of Geocracy — Migración por módulos (fase visual 1)

## Fuente
- Proyecto original: `Age Of Geocracy(5).zip` (PRE-ALPHA HTML/CSS/JS).
- Base React de referencia: los parches ya entregados v0.3–v0.7.
- El remake actual del equipo no se recibió como ZIP en esta entrega; por eso este parche toca **solamente Profile** para minimizar conflictos.

## Qué cambia
- `src/modules/profile/ProfilePage.tsx`: JSX con distribución original de **DOCUMENTACIÓN + BIOGRAFÍA**, cuatro afiliaciones, información en tarjetas 4×2 y estadísticas en cuatro tarjetas.
- `src/modules/profile/profile.css`: CSS original del módulo como base, ajustado a Header React en flujo normal y distribución móvil.
- No se modifica Header, rutas, assets ni el modelo de datos.

## Qué ya funciona de forma transitoria
- Se ven datos reales disponibles del jugador: ID, nombre, país, ideología, nivel, XP, biografía, territorio, datos políticos si el modelo los tiene, estadísticas.
- El editor permite nombre, país, ideología, foto y biografía de hasta 500 caracteres.
- Las entidades sin asociación no son enlaces; las entidades con ID sí lo son.
- Se conserva la barra de experiencia y la foto por defecto.
- El recorte básico centrado exporta PNG para preservar transparencia.

## Qué queda para la migración de mecánicas
- **Los entrenamientos de estadísticas se ven pero están deshabilitados**: requieren trasladar costes, tiempos, colas y validaciones al backend.
- Nombres, banderas y logos de Partido/Coalición/Región/Nación requieren un endpoint de consultas que resuelva los IDs: hasta entonces se muestran los datos que efectivamente existen en el modelo actual, sin inventar entidades.
- Editor de recorte con zoom y arrastre, solicitudes, mensajes, amigos y ciudadanías reales necesitan sus servicios.
- La pantalla sigue consumiendo `playerLegacy` del remake existente; **SQLite, login seguro y API NO se implementan en esta fase CSS**. No confundir el almacenamiento local temporal con la arquitectura objetivo.
- Las rutas de entidades ya están expresadas como `/party/:id`, `/region/:id`, etc.; para abrir la entidad real deberán existir los módulos respectivos.

## Orden recomendado para la continuidad
1. Validar Profile visualmente a 1920, 1366 y móvil con datos del jugador.
2. Rehacer el CSS de `home`, `nation`, `region`, `territory`, `party`, `coalition`, `parliament`, `news`, `work`, etc. mediante componentes independientes.
3. Implementar la base de servidor TypeScript + SQLite + API HTTP con IDs permanentes, autenticación y sesión seguras.
4. Migrar mecánicas del viejo JavaScript al servidor por sistema, junto con pruebas de reglas.
5. Sincronización multijugador con `ws`; capa de repositorios con posibilidad de pasar a PostgreSQL más adelante.

## Principios
- Mantener el original intacto.
- Entregar exclusivamente nuevos o modificados.
- No importar los 19 CSS antiguos de la carpeta principal globalmente: se encapsulan por módulo para evitar conflictos.
- No copiar `node_modules`, catálogos redundantes ni herramientas de generación a la app.

## Inventario realizado del proyecto viejo

Se identificaron **22 páginas HTML** y **19 estilos CSS** en las carpetas principales.
Los 19 estilos incluyen `header`, `home`, `map`, `map-filters`, `profile`, `nation`,
`region`, `territory`, `party`, `coalition`, `nationalparliament`,
`regionalparliament`, `election`, `news`, `storage`, `work`, `war`,
`nophoto-fix` y `style`.

El mundo contiene más de 2.300 archivos bajo `data/world` (varias resoluciones de teselas y metadatos; aprox. 166 MB sin comprimir). Se debe preservar como datos, **no** volcarlo a `src` ni inicializarlo completo al cargar Profile.

### Orden sugerido de CSS

| Módulo | Referencia original | Estado remake |
|---|---|---|
| Header | `css/header.css` | Existente en React; no modificado en esta etapa |
| Login / Register | `html/login.html`, `html/register.html` | Ya hay base React temporal |
| Profile | `html/profile.html`, `css/profile.css` | **Port visual realizado en esta fase** |
| Home | `html/home.html`, `css/home.css` | Pendiente |
| Territory / Map | `html/territory.html`, `html/map.html`, `css/territory.css`, `css/map.css` | Pendiente |
| Region / Nation | `html/region.html`, `html/nation.html`, CSS asociados | Pendiente |
| Party / Coalition | HTML y CSS propios | Pendiente |
| Parliament | HTML y CSS nacionales/regionales | Pendiente |
| News / Election / Work / Storage / War | HTML y CSS propios | Pendiente |

### Estado técnico validado

- Archivo ZIP comprobado con lectura de CRC.
- `ProfilePage.tsx` transpilado por TypeScript sin errores de sintaxis.
- `node --check` sobre el JS resultante sin errores.
- **No** se verificó todavía el montaje visual con Vite en el equipo del usuario; esa prueba es la siguiente validación real.
