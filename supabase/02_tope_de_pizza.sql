-- =====================================================================
--  TOPE DE PIZZA — nombre, usuarios admin, menú real, cadetes y
--  solo Efectivo + Mercado Pago.
--  Pegar TODO en Supabase > SQL Editor > New query > RUN
--  Se puede correr más de una vez sin problema.
-- =====================================================================

-- 1) Usuarios: todos admin, y los nuevos también
update public.perfiles set rol = 'admin';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'rol', 'admin'))
  on conflict (id) do nothing;
  return new;
end $$;

-- 2) Todo lo demás en un solo bloque
do $$
declare
  m record;
  v_rubro bigint;
  v_sub bigint;
begin
  -- nombre y mensaje al cliente
  update public.config set
    nombre_negocio = 'Tope de Pizza',
    mensaje_cliente = '¡Hola {cliente}! 🍕 Tu pedido #{numero} de Tope de Pizza ya salió 🛵 Total: {total}. ¡Gracias por elegirnos!'
  where id = 1;

  -- rubros
  insert into public.rubros (nombre, orden)
  select x.nombre, x.orden
  from (values ('Pizzas', 1), ('Sfijas', 2), ('Bebidas', 3), ('Congeladas', 4)) as x(nombre, orden)
  where not exists (select 1 from public.rubros r where lower(r.nombre) = lower(x.nombre));
  update public.rubros set orden = 1, activo = true where lower(nombre) = 'pizzas';
  update public.rubros set orden = 2, activo = true where lower(nombre) = 'sfijas';
  update public.rubros set orden = 3 where lower(nombre) = 'bebidas';
  update public.rubros set orden = 4 where lower(nombre) = 'congeladas';

  -- subrubros
  insert into public.subrubros (rubro_id, nombre, orden)
  select r.id, x.sub, x.orden
  from (values ('pizzas', 'Clásicas', 1), ('pizzas', 'Especiales', 2), ('sfijas', 'Sfijas', 1)) as x(rubro, sub, orden)
  join public.rubros r on lower(r.nombre) = x.rubro
  where not exists (select 1 from public.subrubros s where s.rubro_id = r.id and lower(s.nombre) = lower(x.sub));

  -- saco las pizzas de ejemplo (si se usaron en comandas de prueba quedan inactivas)
  update public.articulos set activo = false where codigo in ('P01','P02','P03','P04','P05','P06');
  delete from public.articulos a
  where a.codigo in ('P01','P02','P03','P04','P05','P06')
    and not exists (select 1 from public.comanda_items i where i.articulo_id = a.id or i.articulo2_id = a.id);

  -- menú Tope de Pizza
  for m in
    select * from (values
      ('PZ01', 'Muzzarela',  'pizzas', 'Clásicas',   10000::numeric, true,  'muzza, muza, muzzarella, mozzarella, muzarela, mozarela, muzarella, musa', 1),
      ('PZ02', 'Fugazzeta',  'pizzas', 'Clásicas',   11000::numeric, true,  'fuga, fugazeta, fugaceta, fugazzetta, fugasa', 2),
      ('PZ03', 'Napolitana', 'pizzas', 'Clásicas',   11000::numeric, true,  'napo, napolitanas', 3),
      ('PZ04', 'Roquefort',  'pizzas', 'Clásicas',   12000::numeric, true,  'roque, rocfort, roquefor, rokefor', 4),
      ('PZ05', 'Bondiola',   'pizzas', 'Especiales', 13000::numeric, true,  'bondi, bondiolas', 5),
      ('PZ06', 'Pepperoni',  'pizzas', 'Especiales', 14000::numeric, true,  'peperoni, peperonni, pepperonni, peperone', 6),
      ('PZ07', 'Ternera',    'pizzas', 'Especiales', 17000::numeric, true,  'carne, ternerita', 7),
      ('SF01', 'Sfijas docena',       'sfijas', 'Sfijas', 16000::numeric, false, 'docena, docena de sfijas, docena de esfijas, docena de sfihas, docena de esfihas, 12 sfijas, 12 esfijas', 10),
      ('SF02', 'Sfijas media docena', 'sfijas', 'Sfijas',  8000::numeric, false, 'media docena, media docena de sfijas, media docena de esfijas, media docena de sfihas, 6 sfijas, 6 esfijas', 11)
    ) as t(codigo, nombre, rubro, sub, precio, mitad, alias, orden)
  loop
    select id into v_rubro from public.rubros where lower(nombre) = m.rubro limit 1;
    select id into v_sub from public.subrubros where rubro_id = v_rubro and nombre = m.sub limit 1;
    if exists (select 1 from public.articulos where codigo = m.codigo) then
      update public.articulos set nombre = m.nombre, rubro_id = v_rubro, subrubro_id = v_sub, precio = m.precio,
        permite_mitad = m.mitad, alias = m.alias, orden = m.orden, activo = true
      where codigo = m.codigo;
    else
      insert into public.articulos (codigo, nombre, rubro_id, subrubro_id, precio, permite_mitad, alias, orden, activo)
      values (m.codigo, m.nombre, v_rubro, v_sub, m.precio, m.mitad, m.alias, m.orden, true);
    end if;
  end loop;

  -- bebidas y congelada al final
  update public.articulos set orden = 20 + orden where codigo like 'B%' and orden < 20;
  update public.articulos set nombre = 'Muzzarela congelada', orden = 30,
    alias = 'congelada, muzza congelada, pizza congelada, muzzarela congelada, muzzarella congelada'
  where codigo = 'C01';

  -- materias primas de ejemplo afuera
  delete from public.insumos where nombre in ('Harina','Queso muzzarella','Salsa de tomate','Cebolla','Levadura','Cajas de pizza');

  -- cadetes: Gonzalo y Sofía
  update public.cadetes set nombre = 'Gonzalo', telefono = '3815713652', activo = true
  where lower(nombre) = 'cadete' and not exists (select 1 from public.cadetes where lower(nombre) = 'gonzalo');
  insert into public.cadetes (nombre, telefono, activo)
  select 'Gonzalo', '3815713652', true where not exists (select 1 from public.cadetes where lower(nombre) = 'gonzalo');
  insert into public.cadetes (nombre, telefono, activo)
  select 'Sofía', '3813199618', true where not exists (select 1 from public.cadetes where lower(nombre) in ('sofia', 'sofía'));
  update public.cadetes set telefono = '3815713652', activo = true where lower(nombre) = 'gonzalo';
  update public.cadetes set telefono = '3813199618', activo = true where lower(nombre) in ('sofia', 'sofía');
  update public.cadetes set activo = false where lower(nombre) not in ('gonzalo', 'sofia', 'sofía');

  -- solo Efectivo y Mercado Pago: lo que haya quedado en "transferencia" pasa a Mercado Pago
  update public.comandas set forma_pago = 'mercadopago' where forma_pago = 'transferencia';
  update public.movimientos set cuenta = 'mercadopago' where cuenta = 'transferencia';
  update public.liquidaciones set cuenta_pago = 'mercadopago' where cuenta_pago = 'transferencia';
  update public.jornadas set
    si_mercadopago = si_mercadopago + si_transferencia, si_transferencia = 0,
    sf_mercadopago = case when sf_mercadopago is null then null else sf_mercadopago + coalesce(sf_transferencia, 0) end,
    sf_transferencia = case when sf_transferencia is null then null else 0 end
  where si_transferencia <> 0 or coalesce(sf_transferencia, 0) <> 0;
end $$;

-- LISTO ✅  Revisá en la app: Más → Codificación (precios de bebidas y congelada)
