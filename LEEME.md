# 🍕 Tope de Pizza — Instalación limpia

## 1. Supabase
1. SQL Editor → New query → pegá TODO `supabase/TOPE_DE_PIZZA_INSTALACION_LIMPIA.sql` → Run.
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
