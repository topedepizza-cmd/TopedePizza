-- =====================================================================
--  TOPE DE PIZZA — ACTUALIZACIÓN SEGURA
--  ✅ NO BORRA NADA: respeta usuarios (nombres y usuarios para entrar),
--     comandas, caja, clientes, stock, precios y cadetes que ya cargaste.
--  Agrega o actualiza solo lo que falta. Se puede correr las veces que quieras.
--  Supabase > SQL Editor > New query > pegar TODO > RUN
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABLAS
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  email text,
  rol text not null default 'usuario',          -- 'admin' | 'usuario'
  created_at timestamptz not null default now()
);

create table if not exists public.config (
  id int primary key default 1 check (id = 1),
  nombre_negocio text not null default 'Tope de Pizza',
  telefono_negocio text,
  alias_pago text,                               -- alias / CBU / MP para pasar al cliente
  basico_cadete numeric not null default 15000,
  envios_sugeridos jsonb not null default '[1000,1500,2000,2500,3000]',
  conceptos_egreso jsonb not null default '["Compra materia prima","Compra descartables","Compra bebidas","Retiro socios","Pago cadete","Servicios (luz/gas/internet)","Alquiler","Otros gastos"]',
  conceptos_ingreso jsonb not null default '["Saldo inicial / ajuste","Aporte socios","Ingreso extra","Otros ingresos"]',
  mensaje_cliente text not null default '¡Hola {cliente}! Tu pedido #{numero} ya salió 🛵🍕 Total: {total}. ¡Gracias por elegirnos!'
);
insert into public.config (id) values (1) on conflict (id) do nothing;

create table if not exists public.rubros (
  id bigserial primary key,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true
);

create table if not exists public.subrubros (
  id bigserial primary key,
  rubro_id bigint not null references public.rubros(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true
);

create table if not exists public.articulos (
  id bigserial primary key,
  codigo text,
  nombre text not null,
  rubro_id bigint references public.rubros(id) on delete set null,
  subrubro_id bigint references public.subrubros(id) on delete set null,
  precio numeric not null default 0,
  costo numeric not null default 0,
  permite_mitad boolean not null default false,
  controla_stock boolean not null default false,
  stock numeric not null default 0,
  stock_minimo numeric not null default 0,
  alias text,                                    -- palabras para el dictado: "muzza, mozzarella"
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.insumos (
  id bigserial primary key,
  nombre text not null,
  unidad text not null default 'u',
  stock numeric not null default 0,
  minimo numeric not null default 0,
  costo numeric not null default 0,
  paso numeric not null default 1,               -- cuánto descuenta cada toque del botón "−"
  orden int not null default 0,
  activo boolean not null default true
);

create table if not exists public.clientes (
  id bigserial primary key,
  nombre text not null,
  telefono text,
  direccion text,
  referencia text,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists public.cadetes (
  id bigserial primary key,
  nombre text not null,
  telefono text,
  activo boolean not null default true
);

create table if not exists public.jornadas (
  id bigserial primary key,
  fecha date not null,
  abierta boolean not null default true,
  abierta_at timestamptz not null default now(),
  cerrada_at timestamptz,
  cierre_tipo text,                              -- 'manual' | 'auto'
  cerrada_por uuid,
  si_efectivo numeric not null default 0,
  si_transferencia numeric not null default 0,
  si_mercadopago numeric not null default 0,
  sf_efectivo numeric,
  sf_transferencia numeric,
  sf_mercadopago numeric
);
create unique index if not exists jornadas_una_abierta on public.jornadas (abierta) where abierta;

create table if not exists public.liquidaciones (
  id bigserial primary key,
  cadete_id bigint references public.cadetes(id) on delete set null,
  jornada_id bigint references public.jornadas(id) on delete set null,
  desde timestamptz,
  hasta timestamptz,
  viajes int not null default 0,
  total_envios numeric not null default 0,
  basico numeric not null default 0,
  extra numeric not null default 0,
  total numeric not null default 0,
  tipo_cierre text not null default 'manual',
  pagada boolean not null default false,
  pagada_at timestamptz,
  cuenta_pago text,
  created_at timestamptz not null default now()
);

create table if not exists public.comandas (
  id bigserial primary key,
  numero int not null default 0,
  jornada_id bigint references public.jornadas(id) on delete set null,
  cliente_id bigint references public.clientes(id) on delete set null,
  cliente_nombre text,
  cliente_telefono text,
  cliente_direccion text,
  cliente_referencia text,
  tipo_entrega text not null default 'delivery',  -- 'delivery' | 'retiro'
  cadete_id bigint references public.cadetes(id) on delete set null,
  envio numeric not null default 0,
  subtotal numeric not null default 0,
  descuento numeric not null default 0,
  total numeric not null default 0,
  forma_pago text not null default 'efectivo',     -- 'efectivo' | 'transferencia' | 'mercadopago'
  paga_con numeric,
  vuelto numeric not null default 0,
  vuelto_registrado numeric not null default 0,
  estado text not null default 'abierta',          -- 'abierta' | 'cobrada' | 'anulada'
  estado_entrega text not null default 'preparando', -- 'preparando' | 'en_camino' | 'entregada'
  notas text,
  motivo_anulacion text,
  cobrada_at timestamptz,
  cobrada_jornada_id bigint,
  anulada_at timestamptz,
  liquidacion_id bigint references public.liquidaciones(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.comanda_items (
  id bigserial primary key,
  comanda_id bigint not null references public.comandas(id) on delete cascade,
  articulo_id bigint references public.articulos(id) on delete set null,
  articulo2_id bigint references public.articulos(id) on delete set null,
  es_mitad boolean not null default false,
  descripcion text not null,
  rubro_id bigint,
  cantidad numeric not null default 1,
  precio_unit numeric not null default 0,
  subtotal numeric not null default 0
);

create table if not exists public.movimientos (
  id bigserial primary key,
  jornada_id bigint references public.jornadas(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso','egreso')),
  cuenta text not null check (cuenta in ('efectivo','transferencia','mercadopago')),
  monto numeric not null check (monto > 0),
  concepto text not null,
  detalle text,
  comanda_id bigint references public.comandas(id) on delete set null,
  liquidacion_id bigint references public.liquidaciones(id) on delete set null,
  usuario uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movs (
  id bigserial primary key,
  articulo_id bigint references public.articulos(id) on delete cascade,
  cantidad numeric not null,
  tipo text not null,
  nota text,
  comanda_id bigint references public.comandas(id) on delete set null,
  usuario uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.insumo_movs (
  id bigserial primary key,
  insumo_id bigint references public.insumos(id) on delete cascade,
  cantidad numeric not null,
  tipo text not null,
  nota text,
  usuario uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists comandas_estado_idx on public.comandas (estado);
create index if not exists comandas_jornada_idx on public.comandas (jornada_id);
create index if not exists comandas_fecha_idx on public.comandas (created_at);
create index if not exists comandas_cadete_pend_idx on public.comandas (cadete_id) where liquidacion_id is null;
create index if not exists items_comanda_idx on public.comanda_items (comanda_id);
create index if not exists mov_jornada_idx on public.movimientos (jornada_id);
create index if not exists mov_fecha_idx on public.movimientos (created_at);

-- ---------------------------------------------------------------------
-- 2) USUARIOS: perfil automático (el primero que se crea es ADMIN)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'rol', 'admin')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- usuarios que ya existían antes de correr el script
insert into public.perfiles (id, email, nombre, rol)
select u.id, u.email, split_part(u.email, '@', 1), 'admin'
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3) FUNCIONES: jornada (día operativo de 03:00 a 03:00)
-- ---------------------------------------------------------------------
create or replace function public.fecha_operativa() returns date
language sql stable as $$
  select ((now() at time zone 'America/Argentina/Buenos_Aires') - interval '3 hours')::date
$$;

create or replace function public.corte_operativo() returns timestamptz
language sql stable as $$
  select (public.fecha_operativa()::timestamp + interval '3 hours') at time zone 'America/Argentina/Buenos_Aires'
$$;

create or replace function public.saldos_jornada(p_jornada bigint)
returns table (efectivo numeric, transferencia numeric, mercadopago numeric)
language sql stable set search_path = public as $$
  select
    j.si_efectivo      + coalesce(sum(case when m.cuenta = 'efectivo'      then case when m.tipo = 'ingreso' then m.monto else -m.monto end end), 0),
    j.si_transferencia + coalesce(sum(case when m.cuenta = 'transferencia' then case when m.tipo = 'ingreso' then m.monto else -m.monto end end), 0),
    j.si_mercadopago   + coalesce(sum(case when m.cuenta = 'mercadopago'   then case when m.tipo = 'ingreso' then m.monto else -m.monto end end), 0)
  from public.jornadas j
  left join public.movimientos m on m.jornada_id = j.id
  where j.id = p_jornada
  group by j.id
$$;

create or replace function public.cerrar_jornada(p_tipo text default 'manual') returns void
language plpgsql set search_path = public as $$
declare j record; s record;
begin
  select * into j from jornadas where abierta limit 1 for update;
  if not found then return; end if;
  select * into s from saldos_jornada(j.id);
  update jornadas set
    abierta = false, cerrada_at = now(), cierre_tipo = p_tipo, cerrada_por = auth.uid(),
    sf_efectivo = s.efectivo, sf_transferencia = s.transferencia, sf_mercadopago = s.mercadopago
  where id = j.id;
end $$;

-- ---------------------------------------------------------------------
-- 4) FUNCIONES: cadete
-- ---------------------------------------------------------------------
create or replace function public.pagar_liquidacion(p_id bigint, p_cuenta text default 'efectivo') returns void
language plpgsql set search_path = public as $$
declare l record; v_j bigint;
begin
  select * into l from liquidaciones where id = p_id for update;
  if not found or l.pagada then return; end if;
  select id into v_j from jornadas where abierta limit 1;
  if v_j is null then select id into v_j from jornada_actual(); end if;
  if l.total > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, liquidacion_id)
    values (v_j, 'egreso', coalesce(p_cuenta, 'efectivo'), l.total, 'Pago cadete',
            coalesce((select nombre from cadetes where id = l.cadete_id), 'Cadete') || ' - ' || l.viajes || ' viajes', p_id);
  end if;
  update liquidaciones set pagada = true, pagada_at = now(), cuenta_pago = coalesce(p_cuenta, 'efectivo') where id = p_id;
end $$;

create or replace function public.liquidar_cadete(
  p_cadete bigint, p_tipo text default 'manual', p_pagar boolean default false,
  p_cuenta text default 'efectivo', p_basico numeric default null, p_extra numeric default 0,
  p_hasta timestamptz default null
) returns bigint
language plpgsql set search_path = public as $$
declare v_viajes int; v_envios numeric; v_desde timestamptz; v_hasta timestamptz;
        v_basico numeric; v_total numeric; v_id bigint; v_j bigint;
begin
  v_hasta := coalesce(p_hasta, now());
  select count(*), coalesce(sum(envio), 0), min(created_at)
    into v_viajes, v_envios, v_desde
  from comandas
  where cadete_id = p_cadete and liquidacion_id is null and estado <> 'anulada'
    and tipo_entrega = 'delivery' and created_at <= v_hasta;

  v_basico := coalesce(p_basico, (select basico_cadete from config where id = 1), 0);
  v_total  := v_envios + v_basico + coalesce(p_extra, 0);
  select id into v_j from jornadas where abierta limit 1;

  insert into liquidaciones (cadete_id, jornada_id, desde, hasta, viajes, total_envios, basico, extra, total, tipo_cierre)
  values (p_cadete, v_j, v_desde, v_hasta, v_viajes, v_envios, v_basico, coalesce(p_extra, 0), v_total, p_tipo)
  returning id into v_id;

  update comandas set liquidacion_id = v_id
  where cadete_id = p_cadete and liquidacion_id is null and estado <> 'anulada'
    and tipo_entrega = 'delivery' and created_at <= v_hasta;

  if p_pagar then perform pagar_liquidacion(v_id, p_cuenta); end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 5) CIERRE AUTOMÁTICO 03:00 + jornada actual
-- ---------------------------------------------------------------------
create or replace function public.cierre_automatico() returns void
language plpgsql set search_path = public as $$
declare v_corte timestamptz := corte_operativo(); c record;
begin
  -- turnos de cadete que quedaron abiertos de días anteriores
  for c in
    select distinct cadete_id from comandas
    where cadete_id is not null and liquidacion_id is null and estado <> 'anulada'
      and tipo_entrega = 'delivery' and created_at < v_corte
  loop
    perform liquidar_cadete(c.cadete_id, 'auto', false, 'efectivo', null, 0, v_corte - interval '1 second');
  end loop;
  -- caja que quedó abierta de un día anterior
  if exists (select 1 from jornadas where abierta and fecha < fecha_operativa()) then
    perform cerrar_jornada('auto');
  end if;
end $$;

create or replace function public.jornada_actual() returns public.jornadas
language plpgsql set search_path = public as $$
declare j jornadas; u jornadas;
begin
  perform cierre_automatico();
  select * into j from jornadas where abierta limit 1;
  if found then return j; end if;
  select * into u from jornadas where not abierta order by id desc limit 1;
  begin
    insert into jornadas (fecha, si_efectivo, si_transferencia, si_mercadopago)
    values (fecha_operativa(), coalesce(u.sf_efectivo, 0), coalesce(u.sf_transferencia, 0), coalesce(u.sf_mercadopago, 0))
    returning * into j;
  exception when unique_violation then
    select * into j from jornadas where abierta limit 1;
  end;
  return j;
end $$;

-- ---------------------------------------------------------------------
-- 6) FUNCIONES: stock
-- ---------------------------------------------------------------------
create or replace function public.mover_stock_articulo(
  p_articulo bigint, p_cantidad numeric, p_tipo text, p_nota text default null, p_comanda bigint default null
) returns void language plpgsql set search_path = public as $$
begin
  if coalesce(p_cantidad, 0) = 0 then return; end if;
  update articulos set stock = stock + p_cantidad where id = p_articulo;
  insert into stock_movs (articulo_id, cantidad, tipo, nota, comanda_id)
  values (p_articulo, p_cantidad, p_tipo, p_nota, p_comanda);
end $$;

create or replace function public.mover_insumo(
  p_insumo bigint, p_cantidad numeric, p_tipo text, p_nota text default null
) returns void language plpgsql set search_path = public as $$
begin
  if coalesce(p_cantidad, 0) = 0 then return; end if;
  update insumos set stock = stock + p_cantidad where id = p_insumo;
  insert into insumo_movs (insumo_id, cantidad, tipo, nota) values (p_insumo, p_cantidad, p_tipo, p_nota);
end $$;

-- descuenta (p_signo = -1) o devuelve (p_signo = 1) el stock de los congelados de una comanda
create or replace function public.stock_items_comanda(p_comanda bigint, p_signo int, p_tipo text) returns void
language plpgsql set search_path = public as $$
declare it record;
begin
  for it in select articulo_id, articulo2_id, es_mitad, cantidad from comanda_items where comanda_id = p_comanda loop
    if it.es_mitad then
      if it.articulo_id is not null and coalesce((select controla_stock from articulos where id = it.articulo_id), false) then
        perform mover_stock_articulo(it.articulo_id, p_signo * it.cantidad * 0.5, p_tipo, null, p_comanda);
      end if;
      if it.articulo2_id is not null and coalesce((select controla_stock from articulos where id = it.articulo2_id), false) then
        perform mover_stock_articulo(it.articulo2_id, p_signo * it.cantidad * 0.5, p_tipo, null, p_comanda);
      end if;
    else
      if it.articulo_id is not null and coalesce((select controla_stock from articulos where id = it.articulo_id), false) then
        perform mover_stock_articulo(it.articulo_id, p_signo * it.cantidad, p_tipo, null, p_comanda);
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7) FUNCIONES: comandas
-- ---------------------------------------------------------------------
create or replace function public.cobrar_comanda(p_id bigint, p_forma text default null) returns void
language plpgsql set search_path = public as $$
declare c comandas; v_j bigint; v_forma text;
begin
  select * into c from comandas where id = p_id for update;
  if not found then raise exception 'Comanda inexistente'; end if;
  if c.estado <> 'abierta' then raise exception 'La comanda ya está %', c.estado; end if;
  v_forma := coalesce(nullif(p_forma, ''), c.forma_pago, 'efectivo');
  select id into v_j from jornada_actual();
  if c.total > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'ingreso', v_forma, c.total, 'Venta', 'Comanda #' || c.numero || coalesce(' - ' || c.cliente_nombre, ''), c.id);
  end if;
  if c.vuelto_registrado > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'ingreso', 'efectivo', c.vuelto_registrado, 'Devolución vuelto cadete', 'Comanda #' || c.numero, c.id);
  end if;
  update comandas set estado = 'cobrada', forma_pago = v_forma, cobrada_at = now(),
         cobrada_jornada_id = v_j, estado_entrega = 'entregada'
  where id = p_id;
end $$;

create or replace function public.reabrir_comanda(p_id bigint) returns void
language plpgsql set search_path = public as $$
declare c comandas; v_j bigint;
begin
  select * into c from comandas where id = p_id for update;
  if not found then raise exception 'Comanda inexistente'; end if;
  if c.estado <> 'cobrada' then raise exception 'Solo se puede deshacer el cobro de una comanda cobrada'; end if;
  select id into v_j from jornada_actual();
  if c.total > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'egreso', c.forma_pago, c.total, 'Cobro deshecho', 'Comanda #' || c.numero, c.id);
  end if;
  if c.vuelto_registrado > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'egreso', 'efectivo', c.vuelto_registrado, 'Vuelto a cadete', 'Comanda #' || c.numero || ' (cobro deshecho)', c.id);
  end if;
  update comandas set estado = 'abierta', cobrada_at = null, cobrada_jornada_id = null where id = p_id;
end $$;

create or replace function public.anular_comanda(p_id bigint, p_motivo text default null) returns void
language plpgsql set search_path = public as $$
declare c comandas; v_j bigint;
begin
  select * into c from comandas where id = p_id for update;
  if not found then raise exception 'Comanda inexistente'; end if;
  if c.estado = 'anulada' then return; end if;
  select id into v_j from jornada_actual();
  perform stock_items_comanda(c.id, 1, 'Anulación comanda');
  if c.estado = 'cobrada' and c.total > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'egreso', c.forma_pago, c.total, 'Anulación venta', 'Comanda #' || c.numero, c.id);
  elsif c.estado = 'abierta' and c.vuelto_registrado > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'ingreso', 'efectivo', c.vuelto_registrado, 'Devolución vuelto cadete', 'Comanda anulada #' || c.numero, c.id);
  end if;
  update comandas set estado = 'anulada', motivo_anulacion = p_motivo, anulada_at = now() where id = p_id;
end $$;

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
    select coalesce(max(numero), 0) + 1 into v_num from comandas where jornada_id = v_j;
    insert into comandas (jornada_id, numero, cliente_id, cliente_nombre, cliente_telefono, cliente_direccion,
                          cliente_referencia, tipo_entrega, cadete_id, envio, subtotal, descuento, total,
                          forma_pago, paga_con, notas)
    values (v_j, v_num, v_cliente, v_nombre, v_tel, v_dir, v_ref, v_tipo,
            case when v_tipo = 'delivery' then nullif(p->>'cadete_id', '')::bigint end,
            v_envio, v_sub, v_desc, v_total, v_forma, nullif(p->>'paga_con', '')::numeric, nullif(p->>'notas', ''))
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
      paga_con = nullif(p->>'paga_con', '')::numeric, notas = nullif(p->>'notas', ''), updated_at = now()
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
    perform cobrar_comanda(c.id, v_forma);
  end if;
  return c.id;
end $$;

-- ---------------------------------------------------------------------
-- 8) FUNCIONES: caja
-- ---------------------------------------------------------------------
create or replace function public.registrar_movimiento(
  p_tipo text, p_cuenta text, p_monto numeric, p_concepto text, p_detalle text default null
) returns bigint language plpgsql set search_path = public as $$
declare v_j bigint; v_id bigint;
begin
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  select id into v_j from jornada_actual();
  insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle)
  values (v_j, p_tipo, p_cuenta, p_monto, p_concepto, nullif(p_detalle, ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.mover_entre_cuentas(
  p_desde text, p_hacia text, p_monto numeric, p_detalle text default null
) returns void language plpgsql set search_path = public as $$
declare v_j bigint;
begin
  if p_desde = p_hacia then raise exception 'Elegí cuentas distintas'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  select id into v_j from jornada_actual();
  insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle)
  values (v_j, 'egreso', p_desde, p_monto, 'Movimiento entre cuentas', coalesce(nullif(p_detalle, ''), 'Hacia ' || p_hacia)),
         (v_j, 'ingreso', p_hacia, p_monto, 'Movimiento entre cuentas', coalesce(nullif(p_detalle, ''), 'Desde ' || p_desde));
end $$;

create or replace function public.eliminar_movimiento(p_id bigint) returns void
language plpgsql set search_path = public as $$
declare m record;
begin
  select mv.*, j.abierta into m from movimientos mv join jornadas j on j.id = mv.jornada_id where mv.id = p_id;
  if not found then return; end if;
  if m.comanda_id is not null or m.liquidacion_id is not null then
    raise exception 'Este movimiento es automático (comanda o cadete). Corregilo desde la comanda o el cadete.';
  end if;
  if not m.abierta then raise exception 'No se pueden borrar movimientos de una caja cerrada'; end if;
  delete from movimientos where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 9) SEGURIDAD (RLS): solo usuarios logueados
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['perfiles','config','rubros','subrubros','articulos','insumos','clientes','cadetes',
                           'jornadas','liquidaciones','comandas','comanda_items','movimientos','stock_movs','insumo_movs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acceso_autenticados" on public.%I', t);
    execute format('create policy "acceso_autenticados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['fecha_operativa()','corte_operativo()','saldos_jornada(bigint)','cerrar_jornada(text)',
    'pagar_liquidacion(bigint,text)','liquidar_cadete(bigint,text,boolean,text,numeric,numeric,timestamptz)',
    'cierre_automatico()','jornada_actual()','mover_stock_articulo(bigint,numeric,text,text,bigint)',
    'mover_insumo(bigint,numeric,text,text)','stock_items_comanda(bigint,int,text)','cobrar_comanda(bigint,text)',
    'reabrir_comanda(bigint)','anular_comanda(bigint,text)','guardar_comanda(jsonb)',
    'registrar_movimiento(text,text,numeric,text,text)','mover_entre_cuentas(text,text,numeric,text)',
    'eliminar_movimiento(bigint)','handle_new_user()']
  loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    if f <> 'handle_new_user()' then
      execute format('grant execute on function public.%s to authenticated', f);
    end if;
  end loop;
exception when undefined_object then
  raise notice 'roles no encontrados (entorno de prueba)';
end $$;

-- ---------------------------------------------------------------------
-- 10) CIERRE AUTOMÁTICO TODOS LOS DÍAS 03:01 (hora Argentina = 06:01 UTC)
--     Si pg_cron no está disponible, la app igual cierra sola al abrirse.
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('pizzeria-cierre-diario', '1 6 * * *', 'select public.cierre_automatico()');
exception when others then
  raise notice 'pg_cron no disponible: % (no pasa nada, la app cierra sola al abrirse)', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 11) TIEMPO REAL: que tu socia vea las comandas nuevas al instante
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.comandas;
exception when others then
  raise notice 'realtime: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 12) DATOS DE EJEMPLO (solo si está vacío). Después editalos en la app.
-- ---------------------------------------------------------------------
do $$
declare r_piz bigint; r_beb bigint; r_con bigint; s_cla bigint; s_esp bigint; s_gas bigint; s_agu bigint; s_cer bigint; s_con bigint;
begin
  if exists (select 1 from rubros) then return; end if;
  insert into rubros (nombre, orden) values ('Pizzas', 1) returning id into r_piz;
  insert into rubros (nombre, orden) values ('Bebidas', 2) returning id into r_beb;
  insert into rubros (nombre, orden) values ('Congeladas', 3) returning id into r_con;
  insert into subrubros (rubro_id, nombre, orden) values (r_piz, 'Clásicas', 1) returning id into s_cla;
  insert into subrubros (rubro_id, nombre, orden) values (r_piz, 'Especiales', 2) returning id into s_esp;
  insert into subrubros (rubro_id, nombre, orden) values (r_beb, 'Gaseosas', 1) returning id into s_gas;
  insert into subrubros (rubro_id, nombre, orden) values (r_beb, 'Aguas', 2) returning id into s_agu;
  insert into subrubros (rubro_id, nombre, orden) values (r_beb, 'Cervezas', 3) returning id into s_cer;
  insert into subrubros (rubro_id, nombre, orden) values (r_con, 'Pizzas congeladas', 1) returning id into s_con;

  insert into articulos (codigo, nombre, rubro_id, subrubro_id, precio, permite_mitad, alias, orden) values
    ('P01', 'Muzzarella',  r_piz, s_cla, 12000, true, 'muzza, muza, mozzarella, muzarela, mozarela', 1),
    ('P02', 'Fugazzeta',   r_piz, s_cla, 13500, true, 'fuga, fugazeta, fugaceta', 2),
    ('P03', 'Napolitana',  r_piz, s_cla, 14000, true, 'napo', 3),
    ('P04', 'Especial',    r_piz, s_esp, 15000, true, 'jamon y morrones, jamon', 4),
    ('P05', 'Calabresa',   r_piz, s_esp, 15000, true, 'calabreza, longaniza', 5),
    ('P06', 'Roquefort',   r_piz, s_esp, 15500, true, 'roque, rocfort', 6),
    ('B01', 'Pepsi 1.5 L', r_beb, s_gas, 3500, false, 'pepsi', 7),
    ('B02', 'Agua 1.5 L',  r_beb, s_agu, 2000, false, 'agua', 8),
    ('B03', 'Cerveza lata',r_beb, s_cer, 2500, false, 'cerveza, birra', 9);
  insert into articulos (codigo, nombre, rubro_id, subrubro_id, precio, controla_stock, stock, stock_minimo, alias, orden) values
    ('C01', 'Muzzarella congelada', r_con, s_con, 7000, true, 0, 0, 'congelada, muzza congelada', 10);

  insert into insumos (nombre, unidad, paso, minimo, orden) values
    ('Harina', 'kg', 1, 10, 1), ('Queso muzzarella', 'kg', 1, 5, 2), ('Salsa de tomate', 'l', 1, 3, 3),
    ('Cebolla', 'kg', 1, 3, 4), ('Levadura', 'kg', 0.5, 1, 5), ('Cajas de pizza', 'u', 1, 50, 6);

  insert into cadetes (nombre) values ('Cadete');
end $$;

-- =====================================================================
--  PARTE 2: ajustes de Tope de Pizza (sin pisar lo tuyo)
-- =====================================================================

-- Usuarios: todos admin; el "usuario para entrar" solo se completa si está vacío
update public.perfiles set rol = 'admin' where rol <> 'admin';
alter table public.perfiles add column if not exists usuario text;
update public.perfiles set usuario = lower(split_part(email, '@', 1)) where coalesce(usuario, '') = '';
create unique index if not exists perfiles_usuario_unico on public.perfiles (lower(usuario));

create or replace function public.email_login(p_usuario text) returns text
language sql stable security definer set search_path = public as $$
  select email from public.perfiles where lower(usuario) = lower(trim(p_usuario)) limit 1
$$;
revoke execute on function public.email_login(text) from public;
grant execute on function public.email_login(text) to anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, nombre, rol, usuario)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'rol', 'admin'),
          lower(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1))))
  on conflict (id) do nothing;
  return new;
end $$;

-- Columnas nuevas (si ya existen no pasa nada)
alter table public.cadetes add column if not exists dias int[] not null default '{}';
alter table public.config add column if not exists titular_pago text;
alter table public.config add column if not exists demora text;
alter table public.config add column if not exists mensaje_confirmacion text;
alter table public.config add column if not exists tel_socia text;
alter table public.config add column if not exists premio_cada int not null default 10;

-- Menú de Tope de Pizza: solo si todavía no está cargado (no pisa tus precios)
do $$
declare m record; v_rubro bigint; v_sub bigint;
begin
  update public.config set nombre_negocio = 'Tope de Pizza' where id = 1 and nombre_negocio in ('Mi Pizzería', '');

  if exists (select 1 from public.articulos where codigo like 'PZ%') then return; end if;

  insert into public.rubros (nombre, orden)
  select x.nombre, x.orden from (values ('Pizzas', 1), ('Sfijas', 2), ('Bebidas', 3), ('Congeladas', 4)) as x(nombre, orden)
  where not exists (select 1 from public.rubros r where lower(r.nombre) = lower(x.nombre));
  insert into public.subrubros (rubro_id, nombre, orden)
  select r.id, x.sub, x.orden
  from (values ('pizzas', 'Clásicas', 1), ('pizzas', 'Especiales', 2), ('sfijas', 'Sfijas', 1)) as x(rubro, sub, orden)
  join public.rubros r on lower(r.nombre) = x.rubro
  where not exists (select 1 from public.subrubros s where s.rubro_id = r.id and lower(s.nombre) = lower(x.sub));

  update public.articulos set activo = false where codigo in ('P01','P02','P03','P04','P05','P06');

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
    insert into public.articulos (codigo, nombre, rubro_id, subrubro_id, precio, permite_mitad, alias, orden, activo)
    values (m.codigo, m.nombre, v_rubro, v_sub, m.precio, m.mitad, m.alias, m.orden, true);
  end loop;
  update public.articulos set orden = 20 + orden where codigo like 'B%' and orden < 20;
  update public.articulos set nombre = 'Muzzarela congelada', orden = 30, stock_minimo = 0,
    alias = 'congelada, muzza congelada, pizza congelada, muzzarela congelada, muzzarella congelada'
  where codigo = 'C01';
end $$;

-- Cadetes: Gonzalo y Sofía solo si no existen (no toca los que agregues vos)
update public.cadetes set nombre = 'Gonzalo', telefono = '3815713652'
where lower(nombre) = 'cadete' and not exists (select 1 from public.cadetes where lower(nombre) = 'gonzalo');
insert into public.cadetes (nombre, telefono, activo, dias)
select 'Gonzalo', '3815713652', true, '{4}' where not exists (select 1 from public.cadetes where lower(nombre) = 'gonzalo');
insert into public.cadetes (nombre, telefono, activo, dias)
select 'Sofía', '3813199618', true, '{5,6}' where not exists (select 1 from public.cadetes where lower(nombre) in ('sofia', 'sofía'));
update public.cadetes set dias = '{4}'   where lower(nombre) = 'gonzalo' and dias = '{}';
update public.cadetes set dias = '{5,6}' where lower(nombre) in ('sofia', 'sofía') and dias = '{}';

-- Solo Efectivo y Mercado Pago (lo que haya en "transferencia" pasa a Mercado Pago)
update public.comandas set forma_pago = 'mercadopago' where forma_pago = 'transferencia';
update public.movimientos set cuenta = 'mercadopago' where cuenta = 'transferencia';
update public.liquidaciones set cuenta_pago = 'mercadopago' where cuenta_pago = 'transferencia';
update public.jornadas set
  si_mercadopago = si_mercadopago + si_transferencia, si_transferencia = 0,
  sf_mercadopago = case when sf_mercadopago is null then null else sf_mercadopago + coalesce(sf_transferencia, 0) end,
  sf_transferencia = case when sf_transferencia is null then null else 0 end
where si_transferencia <> 0 or coalesce(sf_transferencia, 0) <> 0;

-- Mensajes al cliente (solo si están vacíos o son de una versión vieja)
update public.config set titular_pago = 'Facundo Muruaga' where id = 1 and coalesce(titular_pago, '') = '';
update public.config set mensaje_confirmacion =
'¡Hola {cliente}! 🍕 Recibimos tu pedido en *Tope de Pizza*

{detalle}

{pago}

🛵 Te avisamos cuando tu pedido salga. ¡Gracias!'
where id = 1 and coalesce(mensaje_confirmacion, '') not like '%{pago}%';
update public.config set mensaje_cliente =
'🛵 Tu pedido de *Tope de Pizza* ya salió y está en camino.
{pago}
¡Que lo disfrutes! 🍕'
where id = 1 and coalesce(mensaje_cliente, '') not like '%{pago}%';

-- ELIMINAR comanda (que no quede ni como anulada)
create or replace function public.eliminar_comanda(p_id bigint) returns void
language plpgsql set search_path = public as $$
declare c comandas; v_j bigint; r record;
begin
  select * into c from comandas where id = p_id for update;
  if not found then return; end if;
  select id into v_j from jornada_actual();
  -- devuelvo el stock (si estaba anulada ya se había devuelto)
  if c.estado <> 'anulada' then perform stock_items_comanda(c.id, 1, 'Comanda eliminada'); end if;
  delete from stock_movs where comanda_id = c.id;
  -- saco de la caja abierta todo lo que generó la comanda
  delete from movimientos where comanda_id = c.id and jornada_id in (select id from jornadas where abierta);
  -- si quedó plata en cajas ya cerradas, la compenso en la caja de hoy
  for r in
    select cuenta, sum(case when tipo = 'ingreso' then monto else -monto end) as neto
    from movimientos where comanda_id = c.id group by cuenta
    having sum(case when tipo = 'ingreso' then monto else -monto end) <> 0
  loop
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle)
    values (v_j, case when r.neto > 0 then 'egreso' else 'ingreso' end, r.cuenta, abs(r.neto),
            'Ajuste comanda eliminada', 'Comanda #' || c.numero);
  end loop;
  delete from comandas where id = c.id;
end $$;
revoke execute on function public.eliminar_comanda(bigint) from public;
grant execute on function public.eliminar_comanda(bigint) to authenticated;


-- =====================================================================
--  ACTUALIZACIÓN 2 (nov/2026): cobro mixto, eliminar y unir liquidaciones,
--  viajes que no se liquidan (los llevan los socios). NO borra datos.
-- =====================================================================
alter table public.comandas add column if not exists monto_efectivo numeric;
alter table public.comandas add column if not exists no_liquidar boolean not null default false;

-- reparte el cobro de una comanda entre efectivo y Mercado Pago
create or replace function public.partes_pago(p_forma text, p_total numeric, p_efectivo numeric)
returns table (cuenta text, monto numeric) language sql immutable as $$
  select x.cuenta, x.monto from (
    select 'efectivo'::text as cuenta,
           case when p_forma = 'mixto' then least(greatest(coalesce(p_efectivo, 0), 0), p_total)
                when p_forma = 'efectivo' then p_total else 0 end as monto
    union all
    select 'mercadopago'::text,
           case when p_forma = 'mixto' then p_total - least(greatest(coalesce(p_efectivo, 0), 0), p_total)
                when p_forma in ('mercadopago', 'transferencia') then p_total else 0 end
  ) x where x.monto > 0
$$;

-- cobrar (ahora acepta cobro mixto)
drop function if exists public.cobrar_comanda(bigint, text);
create or replace function public.cobrar_comanda(p_id bigint, p_forma text default null, p_efectivo numeric default null) returns void
language plpgsql set search_path = public as $$
declare c comandas; v_j bigint; v_forma text; v_ef numeric; pp record;
begin
  select * into c from comandas where id = p_id for update;
  if not found then raise exception 'Comanda inexistente'; end if;
  if c.estado <> 'abierta' then raise exception 'La comanda ya está %', c.estado; end if;
  v_forma := coalesce(nullif(p_forma, ''), c.forma_pago, 'efectivo');
  v_ef := case when v_forma = 'mixto' then coalesce(p_efectivo, c.monto_efectivo, 0) end;
  if v_forma = 'mixto' and v_ef <= 0 then v_forma := 'mercadopago'; v_ef := null; end if;
  if v_forma = 'mixto' and v_ef >= c.total then v_forma := 'efectivo'; v_ef := null; end if;
  select id into v_j from jornada_actual();
  for pp in select * from partes_pago(v_forma, c.total, v_ef) loop
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'ingreso', pp.cuenta, pp.monto, 'Venta', 'Comanda #' || c.numero || coalesce(' - ' || c.cliente_nombre, ''), c.id);
  end loop;
  if c.vuelto_registrado > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'ingreso', 'efectivo', c.vuelto_registrado, 'Devolución vuelto cadete', 'Comanda #' || c.numero, c.id);
  end if;
  -- cobrar NO marca entregado (retiro o pedido pagado por adelantado sigue pendiente).
  -- Solo un delivery que ya estaba "en camino" (el cadete vuelve con la plata) pasa a entregado.
  update comandas set estado = 'cobrada', forma_pago = v_forma, monto_efectivo = v_ef, cobrada_at = now(),
         cobrada_jornada_id = v_j,
         estado_entrega = case when c.tipo_entrega = 'delivery' and c.estado_entrega = 'en_camino' then 'entregada' else c.estado_entrega end
  where id = p_id;
end $$;

create or replace function public.reabrir_comanda(p_id bigint) returns void
language plpgsql set search_path = public as $$
declare c comandas; v_j bigint; pp record;
begin
  select * into c from comandas where id = p_id for update;
  if not found then raise exception 'Comanda inexistente'; end if;
  if c.estado <> 'cobrada' then raise exception 'Solo se puede deshacer el cobro de una comanda cobrada'; end if;
  select id into v_j from jornada_actual();
  for pp in select * from partes_pago(c.forma_pago, c.total, c.monto_efectivo) loop
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'egreso', pp.cuenta, pp.monto, 'Cobro deshecho', 'Comanda #' || c.numero, c.id);
  end loop;
  if c.vuelto_registrado > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'egreso', 'efectivo', c.vuelto_registrado, 'Vuelto a cadete', 'Comanda #' || c.numero || ' (cobro deshecho)', c.id);
  end if;
  update comandas set estado = 'abierta', cobrada_at = null, cobrada_jornada_id = null where id = p_id;
end $$;

create or replace function public.anular_comanda(p_id bigint, p_motivo text default null) returns void
language plpgsql set search_path = public as $$
declare c comandas; v_j bigint; pp record;
begin
  select * into c from comandas where id = p_id for update;
  if not found then raise exception 'Comanda inexistente'; end if;
  if c.estado = 'anulada' then return; end if;
  select id into v_j from jornada_actual();
  perform stock_items_comanda(c.id, 1, 'Anulación comanda');
  if c.estado = 'cobrada' then
    for pp in select * from partes_pago(c.forma_pago, c.total, c.monto_efectivo) loop
      insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
      values (v_j, 'egreso', pp.cuenta, pp.monto, 'Anulación venta', 'Comanda #' || c.numero, c.id);
    end loop;
  elsif c.estado = 'abierta' and c.vuelto_registrado > 0 then
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle, comanda_id)
    values (v_j, 'ingreso', 'efectivo', c.vuelto_registrado, 'Devolución vuelto cadete', 'Comanda anulada #' || c.numero, c.id);
  end if;
  update comandas set estado = 'anulada', motivo_anulacion = p_motivo, anulada_at = now() where id = p_id;
end $$;

-- guardar comanda (con cobro mixto)
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
    select coalesce(max(numero), 0) + 1 into v_num from comandas where jornada_id = v_j;
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

-- liquidar: no cuenta los viajes marcados "no liquidar"
create or replace function public.liquidar_cadete(
  p_cadete bigint, p_tipo text default 'manual', p_pagar boolean default false,
  p_cuenta text default 'efectivo', p_basico numeric default null, p_extra numeric default 0,
  p_hasta timestamptz default null
) returns bigint
language plpgsql set search_path = public as $$
declare v_viajes int; v_envios numeric; v_desde timestamptz; v_hasta timestamptz;
        v_basico numeric; v_total numeric; v_id bigint; v_j bigint;
begin
  v_hasta := coalesce(p_hasta, now());
  select count(*), coalesce(sum(envio), 0), min(created_at)
    into v_viajes, v_envios, v_desde
  from comandas
  where cadete_id = p_cadete and liquidacion_id is null and estado <> 'anulada' and not no_liquidar
    and tipo_entrega = 'delivery' and created_at <= v_hasta;
  if v_viajes = 0 then return null; end if;

  v_basico := coalesce(p_basico, (select basico_cadete from config where id = 1), 0);
  v_total  := v_envios + v_basico + coalesce(p_extra, 0);
  select id into v_j from jornadas where abierta limit 1;

  insert into liquidaciones (cadete_id, jornada_id, desde, hasta, viajes, total_envios, basico, extra, total, tipo_cierre)
  values (p_cadete, v_j, v_desde, v_hasta, v_viajes, v_envios, v_basico, coalesce(p_extra, 0), v_total, p_tipo)
  returning id into v_id;

  update comandas set liquidacion_id = v_id
  where cadete_id = p_cadete and liquidacion_id is null and estado <> 'anulada' and not no_liquidar
    and tipo_entrega = 'delivery' and created_at <= v_hasta;

  if p_pagar then perform pagar_liquidacion(v_id, p_cuenta); end if;
  return v_id;
end $$;

create or replace function public.cierre_automatico() returns void
language plpgsql set search_path = public as $$
declare v_corte timestamptz := corte_operativo(); c record;
begin
  for c in
    select distinct cadete_id from comandas
    where cadete_id is not null and liquidacion_id is null and estado <> 'anulada' and not no_liquidar
      and tipo_entrega = 'delivery' and created_at < v_corte
  loop
    perform liquidar_cadete(c.cadete_id, 'auto', false, 'efectivo', null, 0, v_corte - interval '1 second');
  end loop;
  if exists (select 1 from jornadas where abierta and fecha < fecha_operativa()) then
    perform cerrar_jornada('auto');
  end if;
end $$;

-- eliminar liquidación (pendiente o pagada)
--   p_devolver = false: los viajes NO se pagan nunca (ej: los llevaron los socios)
--   p_devolver = true : los viajes vuelven al turno abierto del cadete
create or replace function public.eliminar_liquidacion(p_id bigint, p_devolver boolean default false) returns void
language plpgsql set search_path = public as $$
declare l liquidaciones; v_j bigint; r record;
begin
  select * into l from liquidaciones where id = p_id for update;
  if not found then return; end if;
  select id into v_j from jornada_actual();
  if p_devolver then
    update comandas set liquidacion_id = null where liquidacion_id = p_id;
  else
    update comandas set liquidacion_id = null, no_liquidar = true where liquidacion_id = p_id;
  end if;
  -- si estaba pagada: saco el pago de la caja abierta
  delete from movimientos where liquidacion_id = p_id and jornada_id in (select id from jornadas where abierta);
  -- si el pago quedó en una caja ya cerrada, lo devuelvo en la caja de hoy
  for r in
    select cuenta, sum(case when tipo = 'egreso' then monto else -monto end) as neto
    from movimientos where liquidacion_id = p_id group by cuenta
    having sum(case when tipo = 'egreso' then monto else -monto end) <> 0
  loop
    insert into movimientos (jornada_id, tipo, cuenta, monto, concepto, detalle)
    values (v_j, case when r.neto > 0 then 'ingreso' else 'egreso' end, r.cuenta, abs(r.neto),
            'Ajuste liquidación eliminada', coalesce((select nombre from cadetes where id = l.cadete_id), 'Cadete'));
  end loop;
  update movimientos set liquidacion_id = null where liquidacion_id = p_id;
  delete from liquidaciones where id = p_id;
end $$;

-- pagar varias liquidaciones pendientes juntas (mismo cadete)
create or replace function public.pagar_liquidaciones(p_ids bigint[], p_cuenta text default 'efectivo') returns void
language plpgsql set search_path = public as $$
declare v_id bigint;
begin
  if (select count(distinct cadete_id) from liquidaciones where id = any(p_ids)) > 1 then
    raise exception 'Elegí liquidaciones de un mismo cadete';
  end if;
  foreach v_id in array p_ids loop
    perform pagar_liquidacion(v_id, p_cuenta);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['partes_pago(text,numeric,numeric)', 'cobrar_comanda(bigint,text,numeric)',
    'eliminar_liquidacion(bigint,boolean)', 'pagar_liquidaciones(bigint[],text)']
  loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
exception when undefined_object then
  raise notice 'roles no encontrados (entorno de prueba)';
end $$;


-- =====================================================================
--  ACTUALIZACIÓN 3 (nov/2026): eliminar ingresos y egresos cargados a mano
--  de cualquier día. Si la caja de ese día ya estaba cerrada, corrige los
--  saldos de ese cierre y de los días siguientes. NO borra otros datos.
-- =====================================================================
create or replace function public.eliminar_movimiento(p_id bigint) returns void
language plpgsql set search_path = public as $$
declare m record; v record; v_delta numeric;
begin
  select * into m from movimientos where id = p_id;
  if not found then return; end if;
  if m.comanda_id is not null then
    raise exception 'Este movimiento es de una comanda: corregilo desde la comanda (deshacer cobro, anular o eliminar).';
  end if;
  if m.liquidacion_id is not null then
    raise exception 'Este movimiento es un pago a cadete: corregilo desde Cadete (eliminar la liquidación).';
  end if;

  -- un "movimiento entre cuentas" son 2 registros: borro los dos
  for v in
    select * from movimientos x
    where x.id = m.id
       or (m.concepto = 'Movimiento entre cuentas' and x.concepto = 'Movimiento entre cuentas'
           and x.jornada_id = m.jornada_id and x.monto = m.monto and x.tipo <> m.tipo
           and abs(extract(epoch from (x.created_at - m.created_at))) < 5
           and x.id = (select y.id from movimientos y
                       where y.concepto = 'Movimiento entre cuentas' and y.jornada_id = m.jornada_id
                         and y.monto = m.monto and y.tipo <> m.tipo
                         and abs(extract(epoch from (y.created_at - m.created_at))) < 5
                       order by abs(y.id - m.id) limit 1))
  loop
    delete from movimientos where id = v.id;
    -- si la caja de ese día ya cerró, arrastro la diferencia al cierre y a los días siguientes
    v_delta := case when v.tipo = 'ingreso' then -v.monto else v.monto end;
    if exists (select 1 from jornadas where id = v.jornada_id and not abierta) then
      execute format('update jornadas set sf_%1$s = coalesce(sf_%1$s, 0) + $1 where id = $2', v.cuenta) using v_delta, v.jornada_id;
      execute format('update jornadas set si_%1$s = si_%1$s + $1, sf_%1$s = case when sf_%1$s is null then null else sf_%1$s + $1 end where id > $2', v.cuenta)
        using v_delta, v.jornada_id;
    end if;
  end loop;
end $$;
revoke execute on function public.eliminar_movimiento(bigint) from public;
do $$ begin
  revoke execute on function public.eliminar_movimiento(bigint) from anon;
  grant execute on function public.eliminar_movimiento(bigint) to authenticated;
exception when undefined_object then null; end $$;


-- =====================================================================
--  ACTUALIZACIÓN 4 (nov/2026): MÓDULO EVENTOS (mismo contenido que 04_EVENTOS.sql)
-- =====================================================================
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

-- =====================================================================
-- LISTO ✅  No se borró nada. Entrá como siempre.
-- =====================================================================

-- =====================================================================
-- TOPE DE PIZZA · STOCK "DESCUENTA DE OTRO ARTÍCULO" (nov/2026) — NO borra nada
-- Ej: "Sfijas horneadas x12" descuenta 12 de "Sfijas congeladas" (o 1 de "Sfijas congeladas x12").
-- Un artículo con "descuenta_de" resta del stock de ESE otro artículo
-- (cantidad vendida × descuenta_factor). Si no tiene, funciona como siempre.
-- =====================================================================
alter table public.articulos add column if not exists descuenta_de bigint references public.articulos(id) on delete set null;
alter table public.articulos add column if not exists descuenta_factor numeric not null default 1;

create or replace function public.stock_items_comanda(p_comanda bigint, p_signo int, p_tipo text) returns void
language plpgsql set search_path = public as $$
declare it record; v_art bigint; v_mult numeric; a record; i int;
begin
  for it in select articulo_id, articulo2_id, es_mitad, cantidad from comanda_items where comanda_id = p_comanda loop
    for i in 1..2 loop
      v_art := case when i = 1 then it.articulo_id else it.articulo2_id end;
      continue when v_art is null;
      continue when i = 2 and not it.es_mitad;
      v_mult := case when it.es_mitad then 0.5 else 1 end;
      select id, controla_stock, descuenta_de, descuenta_factor into a from articulos where id = v_art;
      continue when not found;
      if a.descuenta_de is not null then
        -- vende uno, descuenta de otro (ej: horneadas -> congeladas)
        if coalesce((select controla_stock from articulos where id = a.descuenta_de), false) then
          perform mover_stock_articulo(a.descuenta_de, p_signo * it.cantidad * v_mult * coalesce(nullif(a.descuenta_factor, 0), 1), p_tipo, null, p_comanda);
        end if;
      elsif coalesce(a.controla_stock, false) then
        perform mover_stock_articulo(v_art, p_signo * it.cantidad * v_mult, p_tipo, null, p_comanda);
      end if;
    end loop;
  end loop;
end $$;
