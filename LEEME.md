# 🍕 Tope de Pizza — Puesta en marcha (todo desde el navegador, gratis)

## 1. Supabase (base de datos)
1. supabase.com → **New project** (plan Free). Región: São Paulo.
2. **SQL Editor → New query** → pegá TODO `supabase/01_base_de_datos.sql` → **Run**. Tiene que decir *Success*.
3. **Authentication → Users → Add user → Create new user**: tu email + contraseña, tildá *Auto Confirm User*. El primer usuario queda como **Admin**.
4. **Authentication → Sign In / Providers → Email**: destildá **"Allow new users to sign up"** (así nadie de afuera se puede registrar).
5. **Project Settings → API**: copiá *Project URL*, *anon public* y *service_role*.

## 2. GitHub
1. github.com → **New repository** → `pizzeria-app` (privado) → Create.
2. **uploading an existing file** → abrí la carpeta `pizzeria-app` del zip y arrastrá **todo lo que hay adentro** (no la carpeta) → **Commit changes**.

## 3. Vercel
1. vercel.com → **Add New → Project** → importá `pizzeria-app`.
2. **Environment Variables** (las 3):
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role
3. **Deploy**.

## 4. iPhone
Safari → entrá a la URL de Vercel → **Compartir → Agregar a pantalla de inicio**.
Usuario de tu socia: **Más → Configuración → Usuarios → + Crear usuario**.

## Primeros pasos dentro de la app
- **Más → Codificación**: cargá tus pizzas y precios reales (vienen de ejemplo). Tildá "mitad y mitad" en las pizzas y "controla stock" en las congeladas.
- **Más → Configuración**: nombre, básico del cadete ($15.000), montos de envío rápidos, WhatsApp del cadete.
- **Stock → Materias primas**: cargá stock inicial.
- **Caja → + Ingreso extra → "Saldo inicial / ajuste"** para arrancar con la plata que tienen hoy.

## Cómo funciona el cierre de las 3 AM
- La caja y el turno del cadete se cierran solos a las 03:00 (tarea programada en Supabase).
- Aunque eso fallara, al abrir la app después de las 3 AM se cierra igual automáticamente.
- La caja nueva arranca sin movimientos pero con el saldo del día anterior.
- El turno del cadete cerrado automático queda en **Cadete → Pendientes de pago**.

## Actualización Tope de Pizza
1. Supabase → SQL Editor → pegá `supabase/02_tope_de_pizza.sql` → Run (nombre, menú, usuarios admin).
2. Cuando termines de probar: `supabase/03_borrar_pruebas.sql` deja comandas y caja en cero.
