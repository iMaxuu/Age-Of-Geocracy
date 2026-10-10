# Age of Geocracy — Remake Supabase (v2)

Proyecto **completo como carpeta distribuible** de React, TypeScript, Vite y Tailwind, con Supabase como único backend configurado para las funcionalidades ya conectadas. El ZIP contiene todos los archivos de la aplicación, no es un parche.

## Instalación desde cero (Windows)

1. Descomprimí el ZIP en una carpeta nueva, fuera de `node_modules` de otras versiones.
2. Entrá al proyecto en Supabase > SQL Editor y ejecutá `supabase/schema.sql` una sola vez. Es necesario para crear la base y las políticas RLS.
3. Verificá que `.env.local` contenga la URL y **publishable key** de tu proyecto; nunca pongas `service_role` ni contraseñas ahí.
4. En PowerShell desde la carpeta del proyecto: `npm.cmd install` y `npm.cmd run dev`.
5. Entrá a `http://localhost:5173/register` y registrate. Dependiendo de la configuración de Auth, podría ser necesario confirmar el correo antes de iniciar sesión.
6. Para probar el chat, registrá dos cuentas distintas y abrí dos navegadores/ventanas de incógnito.

No necesitás iniciar `npm.cmd run server`: el proyecto no tiene backend Node local ni SQLite ni `ws`. La base de datos vive en Supabase.

## Qué funciona realmente (Fase Supabase)

- Registro e inicio de sesión: Supabase Auth.
- IDs únicos: UUID en Auth e ID numérico `bigint` en `public.players`.
- Perfil: consultar y editar nombre, biografía, país e ideología mediante RPC con permisos restringidos; subir foto al bucket de avatares.
- Header: datos del jugador de la tabla `players`.
- Chat Global: persistencia PostgreSQL y eventos Supabase Realtime.
- Página de Home: diseño y contador de jugadores de Supabase; los demás contadores aún no están conectados.
- Tema visual y navegación: cliente React, con preferencias de color locales (no son datos oficiales del juego).

## Qué NO está migrado funcionalmente

Map, Nation, Region, Territory, Party, Coalition, Parlamento, Elections, Wars, Work, Storage y otros módulos **mantienen vistas visuales** provenientes del proyecto anterior. Sus reglas JavaScript no están migradas a servicios seguros sobre Supabase. Los ~60.000 territorios están disponibles como archivos geográficos, pero **el mundo persistente jugable aún no funciona**. Esta distribución no debe considerarse el remake funcional de todas las mecánicas.

Una migración completa requiere diseñar tablas y políticas seguras para cada entidad, trasladar las mecánicas y validar su comportamiento. Para acciones sensibles, usaremos RPC/PostgreSQL o Edge Functions, nunca escrituras arbitrarias del navegador.

## Seguridad

`supabase/schema.sql` debe aplicarse al proyecto propio antes de abrir registros. Comprueba las políticas RLS del proyecto antes de invitar jugadores. Una publishable key es pública; jamás uses una secret key en el frontend.
