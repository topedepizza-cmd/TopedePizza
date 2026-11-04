-- =====================================================================
-- TOPE DE PIZZA · FIX ENTREGAS (nov/2026) — NO borra nada
-- Cobrar ya no marca "entregada" sola:
--   · Retiro en local: queda pendiente hasta que toquen "✅ Retiró".
--   · Pedido pagado por adelantado (ej: pagó ayer para hoy): sigue pendiente.
--   · Delivery que ya estaba "en camino" y se cobra al volver el cadete: pasa a entregada (como antes).
-- =====================================================================
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
  update comandas set estado = 'cobrada', forma_pago = v_forma, monto_efectivo = v_ef, cobrada_at = now(),
         cobrada_jornada_id = v_j,
         estado_entrega = case when c.tipo_entrega = 'delivery' and c.estado_entrega = 'en_camino' then 'entregada' else c.estado_entrega end
  where id = p_id;
end $$;
