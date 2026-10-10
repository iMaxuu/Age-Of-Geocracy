# Age of Geocracy — Supabase

Este proyecto ya no usa un servidor Node.js/SQLite propio para autenticación ni chat. Vite se utiliza **únicamente como servidor de desarrollo frontend**.

## Primer inicio

1. Abrí el proyecto Supabase en https://supabase.com/dashboard.
2. SQL Editor > New query: pegá todo `supabase/schema.sql` y ejecutalo **una vez**. Revisá que no haya errores.
3. En Authentication > Providers > Email verificá que el proveedor esté habilitado. Si está habilitada la confirmación por correo, confirmá el correo antes de entrar.
4. En Authentication > URL Configuration, agregá `http://localhost:5173` en Site URL y URLs de redirección de desarrollo si corresponde.
5. El archivo `.env.local` viene preparado con la URL y **solo una clave publicable** de Supabase. No subas ese archivo a GitHub ni pongas ahí claves secretas.
6. `npm.cmd install` y `npm.cmd run dev`, luego abrí http://localhost:5173/register.

## Qué funciona

- Registro/login, sesión persistente y cierre de sesión con Supabase Auth.
- ID numérico persistente del jugador asociado a `auth.users.id` (UUID).
- Profile carga datos reales y guarda nombre, país, ideología, biografía, foto en Supabase Storage.
- Home carga historial de chat y envía mensajes por función SQL segura; escucha INSERT por Supabase Realtime.
- Header muestra datos del jugador desde PostgreSQL.
- Otras páginas mantienen el estado visual de la migración anterior; sus mecánicas NO están migradas.
- Color de tema permanece en `localStorage`: es una preferencia visual, no dato de juego.

## Seguridad y transición

No existe una vía automática para transferir contraseñas guardadas por el sistema legacy: las cuentas deben registrarse en Supabase Auth. El `legacy/player.js` anterior se quitó de la aplicación. No se borran otros recursos de `public/legacy` utilizados para fondos de Login.

Las tablas de juego `players` y `chat_messages` tienen RLS. No se permite actualizar monedas, energía o XP directamente desde el navegador. Las funciones SQL de perfil/chat se ejecutan con la identidad real de Supabase Auth.

**Nota:** si tenés varias personas en el proyecto, no compartas contraseñas ni `service_role`; la clave publicable no otorga privilegios administrativos. Si el juego escala, las mecánicas deberían resolverse en funciones confiables (Postgres RPC/Edge Functions), no en el frontend.
