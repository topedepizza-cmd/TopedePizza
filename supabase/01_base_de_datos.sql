-- =====================================================================
--  PIZZERÍA APP — Script completo de base de datos (Supabase)
--  Pegar TODO en Supabase > SQL Editor > New query > RUN
--  Se puede volver a correr sin romper nada (no borra datos).
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
    ('C01', 'Muzzarella congelada', r_con, s_con, 7000, true, 0, 5, 'congelada, muzza congelada', 10);

  insert into insumos (nombre, unidad, paso, minimo, orden) values
    ('Harina', 'kg', 1, 10, 1), ('Queso muzzarella', 'kg', 1, 5, 2), ('Salsa de tomate', 'l', 1, 3, 3),
    ('Cebolla', 'kg', 1, 3, 4), ('Levadura', 'kg', 0.5, 1, 5), ('Cajas de pizza', 'u', 1, 50, 6);

  insert into cadetes (nombre) values ('Cadete');
end $$;

-- LISTO ✅
