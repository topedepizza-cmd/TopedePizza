# 🍕 Tope de Pizza

## 1. Supabase
1. SQL Editor → New query → pegá TODO `supabase/TOPE_DE_PIZZA_ACTUALIZACION_SEGURA.sql` → Run. No borra nada: usuarios, comandas, precios y cadetes quedan como están.
2. Authentication → Sign In / Providers → Email: destildá "Allow new users to sign up".

## 2. GitHub (repo nuevo y limpio)
1. New repository → nombre `tope-de-pizza` → Create.
2. "uploading an existing file" → abrí la carpeta `TopedePizza` del zip, seleccioná TODO lo de adentro y arrastralo → Commit.
3. En la raíz del repo tienen que verse `app`, `components`, `lib`, `public`, `supabase` y `package.json`.

## 3. Vercel (proyecto nuevo)
1. Add New → Project → importá `tope-de-pizza`.
2. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy. Después borrá el proyecto viejo de Vercel.

## 4. iPhone
Borrá el ícono viejo de la pantalla de inicio. Abrí la URL nueva en Safari → Compartir → Agregar a pantalla de inicio.

## Para empezar de cero después de probar
`supabase/03_borrar_pruebas.sql` borra comandas, caja y turnos (no toca menú, cadetes ni usuarios).

## 🎪 Actualización EVENTOS (nov/2026) — NO borra nada
1. **Primero Supabase**: SQL Editor → New query → pegá TODO `supabase/04_EVENTOS.sql` → Run. Solo agrega tablas y columnas nuevas; las comandas, caja, usuarios y clientes quedan iguales.
2. **Después GitHub**: subí (arrastrando, “Add file → Upload files”) estas carpetas/archivos pisando los que ya están:
   - Nuevos: `app/eventos/page.js`, `app/evento/[id]/page.js`, `components/SelectorProductos.js`, `lib/eventos.js`, `supabase/04_EVENTOS.sql`
   - Cambiados: `app/page.js`, `app/mas/page.js`, `app/informes/page.js`, `app/caja/page.js`, `app/caja/movimientos/page.js`, `app/comanda/[id]/page.js`, `app/globals.css`, `components/AppShell.js`, `supabase/TOPE_DE_PIZZA_ACTUALIZACION_SEGURA.sql`, `LEEME.md`
3. Vercel publica solo. En la app: **Más → 🎪 Eventos**.
