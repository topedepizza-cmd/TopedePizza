-- =====================================================================
--  TOPE DE PIZZA — BORRAR DATOS DE PRUEBA (opcional)
--  Correlo SOLO cuando termines de probar y quieras arrancar de cero.
--  Borra: comandas, caja, cierres, turnos de cadete y movimientos de stock.
--  NO borra: menú, precios, cadetes, usuarios, configuración ni materias primas.
-- =====================================================================
begin;

truncate table
  public.comanda_items,
  public.stock_movs,
  public.insumo_movs,
  public.movimientos,
  public.comandas,
  public.liquidaciones,
  public.jornadas
restart identity cascade;

-- Stock de congeladas y materias primas a 0 (sacá el "--" de las 2 líneas si lo querés)
-- update public.articulos set stock = 0 where controla_stock;
-- update public.insumos set stock = 0;

-- Clientes de prueba (sacá el "--" si también los querés borrar)
-- delete from public.clientes;

commit;
