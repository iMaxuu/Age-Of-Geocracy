# AGE OF GEOCRACY — REMAKE VISUAL INTEGRAL (v0.8)

## Alcance real de esta entrega

- Se incorporaron las estructuras HTML del ZIP PRE-ALPHA de las **19 páginas de módulos**, además del Header, Profile y Login/Register ya migrados enumeradas en `src/modules/legacy-ui/layouts.json`.
- Se conservaron las **19 hojas CSS originales** en `src/modules/legacy-ui/styles` (incluidas las variantes y hojas auxiliares necesarias) y se cargan exclusivamente al visitar cada ruta para evitar mezclas de estilos.
- Se conservaron **1.156 archivos geográficos** de `data/world` en `public/world/`, incluyendo catálogo y chunks (no se cargan masivamente en el frontend).
- Las imágenes de `assets` ya estaban integradas en el parche v0.5 y se usan directamente.
- Las rutas están disponibles por URL; Header, Login/Register y Profile utilizan componentes React ya migrados.
- React recrea la estructura del DOM original mediante `React.createElement` sin cargar los scripts heredados.

## Limitaciones deliberadas y pendientes (no es el juego completo funcional)

- Este trabajo **prioriza CSS/HTML** como fue solicitado. La lógica original de los módulos `home`, `map`, `nation`, `region`, `territory`, `party`, `coalition`, `elections`, parlamentos, recursos, noticias, etc. **aún no fue migrada** a TypeScript/Node.js.
- Los datos de ejemplo y componentes vacíos son **solo estados visuales provisionales**. Los botones antiguos no guardan ni ejecutan las acciones anteriores.
- El mapa mundial tiene sus geometrías archivadas y listas para su futuro renderizado con LOD, **pero todavía no se dibuja**.
- Login/Register y Profile conservan temporalmente el adaptador `localStorage` previo. No debe utilizarse como sistema oficial de cuentas compartidas. La migración a Node.js + SQLite debe realizarse antes de pruebas multijugador.
- Algunas interfaces originales se construían enteramente en JavaScript (`party`, `coalition`, `news`, etc.), por eso muestran una vista vacía diseñada con sus estilos. Para completar su fidelidad habrá que migrar sus funciones de renderizado.
- No se importa `css/header.css` del proyecto antiguo: se conserva el header nuevo de React.

## Rutas

`/home`, `/map`, `/nation`, `/region`, `/territory`, `/party`, `/coalition`,
`/nationalparliament`, `/regionalparliament`, `/election`, `/news`, `/work`,
`/storage`, `/wars`, `/war`, `/messages`, `/market`, `/shop`, `/settings`,
`/profile`, `/login`, `/register`.

## Estrategia siguiente

1. Conectar auth y player al servidor Node/SQLite: IDs permanentes, contraseñas hasheadas, sesiones y API.
2. Reescribir módulos de estado a servicios TS en backend conservando reglas.
3. Migrar renderizado dinámico y acciones módulo a módulo en React.
4. Reconstruir el motor del mapa consumiendo `public/world/catalog.json` y chunks bajo demanda.
5. WebSockets solamente para eventos que requieren sincronización; HTTP para carga inicial.

El ZIP del juego anterior se mantiene intacto.

## Carpetas por módulo

Cada pantalla tiene ahora un `src/modules/<módulo>/<Módulo>Page.tsx` como entrada propia para reemplazar progresivamente la maqueta por React/TypeScript sin afectar las demás. `src/modules/MigratedPage.tsx` despacha las rutas. Los diseños originales se conservan en `legacy-ui/styles` y `legacy-ui/layouts.json`.
