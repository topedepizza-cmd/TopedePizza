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
