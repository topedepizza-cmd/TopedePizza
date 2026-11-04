-- =====================================================================
--  TOPE DE PIZZA — MÓDULO EVENTOS (nov/2026)
--  ✅ NO BORRA NADA. Solo AGREGA tablas, columnas y funciones nuevas.
--     Comandas, caja, clientes, stock, usuarios y cadetes quedan igual.
--  Se puede correr las veces que quieras.
--  Supabase > SQL Editor > New query > pegar TODO > RUN
-- =====================================================================

-- 1) TABLAS NUEVAS -----------------------------------------------------
create table if not exists public.eventos (
  id bigserial primary key,
  nombre text not null,
  lugar text,
  fecha date not null default public.fecha_operativa(),
  abierto boolean not null default true,
  abierto_at timestamptz not null default now(),
  cerrado_at timestamptz,
  notas text,
  created_by uuid default auth.uid()
);

-- productos que se llevan al evento (con su precio de evento y lo que se llevó)
create table if not exists public.evento_productos (
  id bigserial primary key,
  evento_id bigint not null references public.eventos(id) on delete cascade,
  articulo_id bigint not null references public.articulos(id) on delete cascade,
  precio numeric not null default 0,
  llevado numeric,                      -- cantidad que llevamos (opcional, para ver sobrante)
  orden int not null default 0
);
create unique index if not exists evento_productos_unico on public.evento_productos (evento_id, articulo_id);

-- stock del evento por GRUPO: "Masas" (cada pizza usa 1), "Sfijas" en unidades (docena 12, media 6),
-- o un producto suelto (ej: Pepsi). llevado vacío = sin control de stock.
create table if not exists public.evento_stocks (
  id bigserial primary key,
  evento_id bigint not null references public.eventos(id) on delete cascade,
  clave text not null,                 -- 'masas', 'sfijas', 'art-7'…
  nombre text not null,
  tipo text not null default 'otro',   -- pizza | sfija | bebida | otro (para colores y emoji)
  llevado numeric,
  minimo numeric not null default 0,   -- avisar cuando queden esta cantidad o menos
  orden int not null default 0
);
create unique index if not exists evento_stocks_unico on public.evento_stocks (evento_id, clave);
alter table public.evento_productos add column if not exists stock_id bigint references public.evento_stocks(id) on delete set null;
alter table public.evento_productos add column if not exists consume numeric not null default 1;   -- cuánto descuenta del grupo
alter table public.evento_productos add column if not exists agotado boolean not null default false;

-- 2) COLUMNAS NUEVAS (vacías en todo lo viejo = todo lo viejo es delivery) --
alter table public.comandas    add column if not exists evento_id bigint references public.eventos(id) on delete set null;
alter table public.movimientos add column if not exists evento_id bigint references public.eventos(id) on delete set null;
alter table public.comandas    add column if not exists entregada_at timestamptz;  -- para medir cuánto tardó cada pedido
create index if not exists comandas_evento_idx    on public.comandas (evento_id);
create index if not exists movimientos_evento_idx on public.movimientos (evento_id);

-- 3) Todo movimiento de caja de una comanda de evento queda marcado con el evento
--    (cobros, anulaciones, cobros deshechos) — así la caja se puede filtrar.
create or replace function public.mov_marcar_evento() returns trigger
language plpgsql set search_path = public as $$
declare v_ev bigint; v_nom text;
begin
  if new.evento_id is null and new.comanda_id is not null then
    select c.evento_id, e.nombre into v_ev, v_nom
    from comandas c left join eventos e on e.id = c.evento_id where c.id = new.comanda_id;
    if v_ev is not null then
      new.evento_id := v_ev;
      new.detalle := coalesce(new.detalle || ' · ', '') || '🎪 ' || coalesce(v_nom, 'Evento');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists mov_marcar_evento on public.movimientos;
create trigger mov_marcar_evento before insert on public.movimientos
  for each row execute function public.mov_marcar_evento();

-- 4) FUNCIONES ---------------------------------------------------------
-- p_stocks    = [{ "clave": "masas", "nombre": "Masas de pizza", "tipo": "pizza", "llevado": 40, "minimo": 5 }, ...]
-- p_productos = [{ "articulo_id": 1, "precio": 10000, "stock_clave": "masas", "consume": 1, "agotado": false }, ...]
drop function if exists public.guardar_productos_evento(bigint, jsonb);
drop function if exists public.abrir_evento(text, text, jsonb);

create or replace function public.guardar_productos_evento(p_evento bigint, p_productos jsonb, p_stocks jsonb default '[]') returns void
language plpgsql set search_path = public as $$
begin
  -- grupos de stock: actualiza los que siguen, agrega nuevos y saca los que ya no están
  delete from evento_stocks where evento_id = p_evento
    and clave not in (select x->>'clave' from jsonb_array_elements(coalesce(p_stocks, '[]'::jsonb)) x);
  insert into evento_stocks (evento_id, clave, nombre, tipo, llevado, minimo, orden)
  select p_evento, x->>'clave', coalesce(nullif(x->>'nombre', ''), x->>'clave'), coalesce(nullif(x->>'tipo', ''), 'otro'),
         nullif(x->>'llevado', '')::numeric, coalesce(nullif(x->>'minimo', '')::numeric, 0), coalesce(nullif(x->>'orden', '')::int, 0)
  from jsonb_array_elements(coalesce(p_stocks, '[]'::jsonb)) x
  on conflict (evento_id, clave) do update set nombre = excluded.nombre, tipo = excluded.tipo,
    llevado = excluded.llevado, minimo = excluded.minimo, orden = excluded.orden;

  delete from evento_productos where evento_id = p_evento;
  insert into evento_productos (evento_id, articulo_id, precio, orden, stock_id, consume, agotado)
  select p_evento, (x->>'articulo_id')::bigint, coalesce(nullif(x->>'precio', '')::numeric, 0),
         coalesce(nullif(x->>'orden', '')::int, 0),
         (select id from evento_stocks s where s.evento_id = p_evento and s.clave = x->>'stock_clave'),
         coalesce(nullif(x->>'consume', '')::numeric, 1), coalesce((x->>'agotado')::boolean, false)
  from jsonb_array_elements(coalesce(p_productos, '[]'::jsonb)) x
  on conflict (evento_id, articulo_id) do nothing;
end $$;

create or replace function public.abrir_evento(p_nombre text, p_lugar text default null, p_productos jsonb default '[]', p_stocks jsonb default '[]') returns bigint
language plpgsql set search_path = public as $$
declare v_id bigint;
begin
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Poné un nombre al evento'; end if;
  if jsonb_array_length(coalesce(p_productos, '[]'::jsonb)) = 0 then raise exception 'Elegí al menos un producto para el evento'; end if;
  perform jornada_actual();
  insert into eventos (nombre, lugar) values (trim(p_nombre), nullif(trim(coalesce(p_lugar, '')), ''))
  returning id into v_id;
  perform guardar_productos_evento(v_id, p_productos, p_stocks);
  return v_id;
end $$;

-- cuánto se usó de cada grupo de stock (pedidos no anulados). ½ y ½ = media de cada gusto.
create or replace function public.consumo_evento(p_evento bigint)
returns table (stock_id bigint, usado numeric) language sql stable set search_path = public as $$
  select ep.stock_id, sum(ci.cantidad * ep.consume * case when ci.es_mitad and ci.articulo2_id is not null then 0.5 else 1 end)
  from comandas c
  join comanda_items ci on ci.comanda_id = c.id
  join lateral (select unnest(array[ci.articulo_id, ci.articulo2_id]) as aid) a on a.aid is not null
  join evento_productos ep on ep.evento_id = c.evento_id and ep.articulo_id = a.aid
  where c.evento_id = p_evento and c.estado <> 'anulada' and ep.stock_id is not null
  group by ep.stock_id
$$;

create or replace function public.cerrar_evento(p_id bigint) returns void
language plpgsql set search_path = public as $$
begin
  update eventos set abierto = false, cerrado_at = now() where id = p_id and abierto;
end $$;

create or replace function public.reabrir_evento(p_id bigint) returns void
language plpgsql set search_path = public as $$
begin
  update eventos set abierto = true, cerrado_at = null where id = p_id;
end $$;

-- borrar evento. Si tiene pedidos (ej: pruebas) hay que pasar p_con_pedidos = true:
-- borra sus pedidos, devuelve el stock y saca de la caja todo lo que generaron (ventas y gastos del evento)
drop function if exists public.eliminar_evento(bigint);
create or replace function public.eliminar_evento(p_id bigint, p_con_pedidos boolean default false) returns void
language plpgsql set search_path = public as $$
declare r record;
begin
  if not p_con_pedidos and exists (select 1 from comandas where evento_id = p_id) then
    raise exception 'El evento tiene pedidos: confirmá que querés borrarlos también.';
  end if;
  for r in select id from comandas where evento_id = p_id order by id loop
    perform eliminar_comanda(r.id);
  end loop;
  for r in select id from movimientos where evento_id = p_id and comanda_id is null and liquidacion_id is null order by id loop
    perform eliminar_movimiento(r.id);
  end loop;
  update movimientos set evento_id = null where evento_id = p_id;
  delete from eventos where id = p_id;
end $$;

-- pedido rápido de evento: { evento_id, cliente_nombre, notas, forma_pago, monto_efectivo, paga_con, cobrar, items:[...] }
create or replace function public.guardar_comanda_evento(p jsonb) returns bigint
language plpgsql set search_path = public as $$
declare
  v_ev     eventos;
  v_items  jsonb   := coalesce(p->'items', '[]'::jsonb);
  v_forma  text    := coalesce(nullif(p->>'forma_pago', ''), 'efectivo');
  v_ef     numeric := case when coalesce(p->>'forma_pago', '') = 'mixto' then coalesce(nullif(p->>'monto_efectivo', '')::numeric, 0) end;
  v_j bigint; v_sub numeric; v_num int; c comandas; v_txt text;
begin
  -- bloquea el evento: dos celulares a la vez no se pisan el número
  select * into v_ev from eventos where id = nullif(p->>'evento_id', '')::bigint for update;
  if not found then raise exception 'Evento inexistente'; end if;
  if not v_ev.abierto then raise exception 'El evento está cerrado'; end if;
  if jsonb_array_length(v_items) = 0 then raise exception 'El pedido no tiene productos'; end if;
  select id into v_j from jornada_actual();

  select coalesce(sum((x->>'cantidad')::numeric * (x->>'precio_unit')::numeric), 0) into v_sub from jsonb_array_elements(v_items) x;
  select coalesce(max(numero), 0) + 1 into v_num from comandas where evento_id = v_ev.id;

  insert into comandas (jornada_id, evento_id, numero, cliente_nombre, tipo_entrega, envio, subtotal, descuento, total,
                        forma_pago, monto_efectivo, paga_con, notas, estado_entrega)
  values (v_j, v_ev.id, v_num, nullif(trim(coalesce(p->>'cliente_nombre', '')), ''), 'evento', 0, v_sub, 0, v_sub,
          v_forma, v_ef, nullif(p->>'paga_con', '')::numeric, nullif(trim(coalesce(p->>'notas', '')), ''), 'preparando')
  returning * into c;

  insert into comanda_items (comanda_id, articulo_id, articulo2_id, es_mitad, descripcion, rubro_id, cantidad, precio_unit, subtotal)
  select c.id, nullif(x->>'articulo_id', '')::bigint, nullif(x->>'articulo2_id', '')::bigint,
         coalesce((x->>'es_mitad')::boolean, false), coalesce(x->>'descripcion', 'Artículo'),
         nullif(x->>'rubro_id', '')::bigint, (x->>'cantidad')::numeric, (x->>'precio_unit')::numeric,
         (x->>'cantidad')::numeric * (x->>'precio_unit')::numeric
  from jsonb_array_elements(v_items) x;

  -- ¿algún producto marcado como agotado?
  select a.nombre into v_txt from comanda_items ci
    join lateral (select unnest(array[ci.articulo_id, ci.articulo2_id]) as aid) x on x.aid is not null
    join evento_productos ep on ep.evento_id = v_ev.id and ep.articulo_id = x.aid and ep.agotado
    join articulos a on a.id = x.aid
  where ci.comanda_id = c.id limit 1;
  if v_txt is not null then raise exception '% está AGOTADO', v_txt; end if;
  -- ¿alcanza el stock que llevamos? (si no alcanza, no se guarda nada)
  select s.nombre || ': quedan ' || trim(to_char(s.llevado - (u.usado - coalesce(n.nuevo, 0)), 'FM999999990.##')) into v_txt
  from evento_stocks s
  join consumo_evento(v_ev.id) u on u.stock_id = s.id
  left join (select ep.stock_id, sum(ci.cantidad * ep.consume * case when ci.es_mitad and ci.articulo2_id is not null then 0.5 else 1 end) as nuevo
             from comanda_items ci
             join lateral (select unnest(array[ci.articulo_id, ci.articulo2_id]) as aid) x on x.aid is not null
             join evento_productos ep on ep.evento_id = v_ev.id and ep.articulo_id = x.aid
             where ci.comanda_id = c.id group by ep.stock_id) n on n.stock_id = s.id
  where s.evento_id = v_ev.id and s.llevado is not null and u.usado > s.llevado limit 1;
  if v_txt is not null then raise exception 'No alcanza el stock. %', v_txt; end if;

  perform stock_items_comanda(c.id, -1, 'Venta evento');

  if coalesce((p->>'cobrar')::boolean, true) then
    perform cobrar_comanda(c.id, v_forma, v_ef);
    update comandas set estado_entrega = 'preparando' where id = c.id;  -- cobrado, pero sigue en cocina
  end if;
  return c.id;
end $$;

-- cobrar un pedido de evento que quedó sin cobrar (no cambia su estado en cocina)
create or replace function public.cobrar_comanda_evento(p_id bigint, p_forma text default null, p_efectivo numeric default null) returns void
language plpgsql set search_path = public as $$
declare v_estado text;
begin
  select estado_entrega into v_estado from comandas where id = p_id;
  perform cobrar_comanda(p_id, p_forma, p_efectivo);
  update comandas set estado_entrega = coalesce(v_estado, 'preparando') where id = p_id;
end $$;

-- gasto o ingreso de caja cargado dentro de un evento
create or replace function public.registrar_movimiento_evento(
  p_evento bigint, p_tipo text, p_cuenta text, p_monto numeric, p_concepto text, p_detalle text default null
) returns bigint language plpgsql set search_path = public as $$
declare v_id bigint; v_nom text;
begin
  select nombre into v_nom from eventos where id = p_evento;
  v_id := registrar_movimiento(p_tipo, p_cuenta, p_monto, p_concepto,
            coalesce(nullif(p_detalle, '') || ' · ', '') || '🎪 ' || coalesce(v_nom, 'Evento'));
  update movimientos set evento_id = p_evento where id = v_id;
  return v_id;
end $$;

-- 4b) guardar comanda de DELIVERY: igual que antes, pero el número no cuenta los pedidos de eventos
create or replace function public.guardar_comanda(p jsonb) returns bigint
language plpgsql set search_path = public as $$
declare
  v_id      bigint  := nullif(p->>'id', '')::bigint;
  v_cliente bigint  := nullif(p->>'cliente_id', '')::bigint;
  v_tipo    text    := coalesce(nullif(p->>'tipo_entrega', ''), 'delivery');
  v_envio   numeric := coalesce(nullif(p->>'envio', '')::numeric, 0);
  v_desc    numeric := coalesce(nullif(p->>'descuento', '')::numeric, 0);
  v_vuelto  numeric := coalesce(nullif(p->>'vuelto', '')::numeric, 0);
  v_forma   text    := coalesce(nullif(p->>'forma_pago', ''), 'efectivo');
  v_nombre  text    := nullif(trim(coalesce(p->>'cliente_nombre', '')), '');
  v_tel     text    := nullif(trim(coalesce(p->>'cliente_telefono', '')), '');
  v_dir     text    := nullif(trim(coalesce(p->>'cliente_direccion', '')), '');
  v_ref     text    := nullif(trim(coalesce(p->>'cliente_referencia', '')), '');
  v_items   jsonb   := coalesce(p->'items', '[]'::jsonb);
  v_ef      numeric := case when coalesce(p->>'forma_pago', '') = 'mixto' then coalesce(nullif(p->>'monto_efectivo', '')::numeric, 0) end;
  v_j bigint; v_sub numeric; v_total numeric; v_diff numeric; v_num int; c comandas;
begin
  if jsonb_array_length(v_items) = 0 then raise exception 'La comanda no tiene productos'; end if;
  select id into v_j from jornada_actual();
  if v_tipo <> 'delivery' then v_envio := 0; end if;

  -- cliente: alta o actualización
  if coalesce((p->>'guardar_cliente')::boolean, false) and v_nombre is not null then
    if v_cliente is null then
      insert into clientes (nombre, telefono, direccion, referencia)
      values (v_nombre, v_tel, v_dir, v_ref) returning id into v_cliente;
    else
      update clientes set nombre = v_nombre, telefono = v_tel, direccion = v_dir, referencia = v_ref where id = v_cliente;
    end if;
  end if;

  select coalesce(sum((x->>'cantidad')::numeric * (x->>'precio_unit')::numeric), 0)
    into v_sub from jsonb_array_elements(v_items) x;
  v_total := greatest(v_sub + v_envio - v_desc, 0);

  if v_id is null then
    select coalesce(max(numero), 0) + 1 into v_num from comandas where jornada_id = v_j and evento_id is null;
    insert into comandas (jornada_id, numero, cliente_id, cliente_nombre, cliente_telefono, cliente_direccion,
                          cliente_referencia, tipo_entrega, cadete_id, envio, subtotal, descuento, total,
                          forma_pago, monto_efectivo, paga_con, notas)
    values (v_j, v_num, v_cliente, v_nombre, v_tel, v_dir, v_ref, v_tipo,
            case when v_tipo = 'delivery' then nullif(p->>'cadete_id', '')::bigint end,
            v_envio, v_sub, v_desc, v_total, v_forma, v_ef, nullif(p->>'paga_con', '')::numeric, nullif(p->>'notas', ''))
    returning * into c;
  else
    select * into c from comandas where id = v_id for update;
    if not found then raise exception 'Comanda inexistente'; end if;
    if c.estado <> 'abierta' then raise exception 'Solo se pueden editar comandas sin cobrar'; end if;
    perform stock_items_comanda(c.id, 1, 'Edición comanda (devolución)');
    delete from comanda_items where comanda_id = c.id;
    update comandas set
      cliente_id = v_cliente, cliente_nombre = v_nombre, cliente_telefono = v_tel, cliente_direccion = v_dir,
      cliente_referencia = v_ref, tipo_entrega = v_tipo,
      cadete_id = case when v_tipo = 'delivery' then nullif(p->>'cadete_id', '')::bigint end,
      envio = v_envio, subtotal = v_sub, descuento = v_desc, total = v_total, forma_pago = v_forma,
      monto_efectivo = v_ef, paga_con = nullif(p->>'paga_con', '')::numeric, notas = nullif(p->>'notas', ''), updated_at = now()
    where id = c.id returning * into c;
  end if;

  insert into comanda_items (comanda_id, articulo_id, articulo2_id, es_mitad, descripcion, rubro_id, cantidad, precio_unit, subtotal)
  select c.id,
         nullif(x->>'articulo_id', '')::bigint,
         nullif(x->>'articulo2_id', '')::bigint,
         coalesce((x->>'es_mitad')::boolean, false),
         coalesce(x->>'descripcion', 'Artículo'),
         nullif(x->>'rubro_id', '')::bigint,
         (x->>'cantidad')::numeric,
         (x->>'precio_unit')::numeric,
         (x->>'cantidad')::numeric * (x->>'precio_unit')::numeric
  from jsonb_array_elements(v_items) x;

  perform stock_items_comanda(c.id, -1, 'Venta');

  -- vuelto que se le da al cadete (sale efectivo de caja; vuelve cuando rinde)
  v_diff := v_vuelto - coalesce(c.vuelto_registrado, 0);
  if v_diff > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'egreso', 'efectivo', v_diff, 'Vuelto a cadete', 'Comanda #' || c.numero, c.id);
  elsif v_diff < 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'ingreso', 'efectivo', -v_diff, 'Ajuste vuelto cadete', 'Comanda #' || c.numero, c.id);
  end if;
  update comandas set vuelto = v_vuelto, vuelto_registrado = v_vuelto where id = c.id;

  if coalesce((p->>'cobrar')::boolean, false) then
    perform cobrar_comanda(c.id, v_forma, v_ef);
  end if;
  return c.id;
end $$;

-- 5) SEGURIDAD ----------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['eventos', 'evento_productos', 'evento_stocks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acceso_autenticados" on public.%I', t);
    execute format('create policy "acceso_autenticados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['guardar_productos_evento(bigint,jsonb,jsonb)', 'abrir_evento(text,text,jsonb,jsonb)', 'consumo_evento(bigint)', 'cerrar_evento(bigint)',
    'reabrir_evento(bigint)', 'eliminar_evento(bigint,boolean)', 'guardar_comanda_evento(jsonb)',
    'cobrar_comanda_evento(bigint,text,numeric)', 'registrar_movimiento_evento(bigint,text,text,numeric,text,text)']
  loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
exception when undefined_object then
  raise notice 'roles no encontrados (entorno de prueba)';
end $$;

-- 6) TIEMPO REAL: los pedidos del evento aparecen al instante en los dos celulares
do $$ begin
  alter publication supabase_realtime add table public.comandas;
exception when others then null; end $$;

-- =====================================================================
-- LISTO ✅  No se borró nada. Ya podés usar Más → Eventos.
-- =====================================================================
