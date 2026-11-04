'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, traerTodo } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Chips, Cargando, Vacio, Barra } from '@/components/ui';
import FiltroFechas from '@/components/FiltroFechas';
import { rangoFechas, rangoAnterior } from '@/lib/fechas';
import { money, cant, diaOperativo, isoDia, nombreCuenta, partesPago } from '@/lib/utils';
import { descargarExcel, descargarPDF, precargarDescargas } from '@/lib/descargas';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const INTERNOS = ['Vuelto a cadete', 'Movimiento entre cuentas', 'Anulación venta', 'Cobro deshecho', 'Devolución vuelto cadete', 'Ajuste vuelto cadete', 'Diferencia de arqueo'];

function top(obj, campo = 'total') {
  return Object.values(obj).sort((x, y) => y[campo] - x[campo]);
}

export default function Informes() {
  const { avisar } = useApp();
  const [periodo, setPeriodo] = useState({ modo: '7' });
  const [diasSem, setDiasSem] = useState([]); // vacío = todos los días
  const [datos, setDatos] = useState(null);
  const [verArt, setVerArt] = useState('unidades');
  const [bajando, setBajando] = useState(false);
  const [origen, setOrigen] = useState('todo'); // todo | delivery | eventos
  const [eventoSel, setEventoSel] = useState(''); // '' = todos los eventos

  const r = useMemo(() => rangoFechas(periodo), [periodo]);
  const rAnt = useMemo(() => rangoAnterior(periodo), [periodo]);
  useEffect(() => { precargarDescargas(); }, []);
  const pasaDia = useCallback((f) => !diasSem.length || diasSem.includes(diaOperativo(f).getDay()), [diasSem]);
  // con / sin eventos
  const pasaOrigen = useCallback((x) => origen === 'todo' || (origen === 'delivery' ? !x.evento_id
    : (eventoSel ? String(x.evento_id) === String(eventoSel) : !!x.evento_id)), [origen, eventoSel]);

  const cargar = useCallback(async () => {
    setDatos(null);
    try {
      const [comandas, movs, { data: rubros }, { data: articulos }, { data: eventos }] = await Promise.all([
        traerTodo(() => supabase.from('comandas')
          .select('id, total, envio, descuento, forma_pago, monto_efectivo, cliente_id, cliente_nombre, created_at, tipo_entrega, evento_id, comanda_items(articulo_id, articulo2_id, es_mitad, descripcion, rubro_id, cantidad, subtotal)')
          .neq('estado', 'anulada').gte('created_at', r.desde.toISOString()).lt('created_at', r.hasta.toISOString()).order('id')),
        traerTodo(() => supabase.from('movimientos').select('tipo, concepto, monto, comanda_id, liquidacion_id, created_at, evento_id')
          .gte('created_at', r.desde.toISOString()).lt('created_at', r.hasta.toISOString()).order('id')),
        supabase.from('rubros').select('*'),
        supabase.from('articulos').select('id, nombre, costo, rubro_id'),
        supabase.from('eventos').select('id, nombre, abierto_at').order('id', { ascending: false }).limit(300),
      ]);
      // período anterior (mismo largo) para comparar
      const anterior = await traerTodo(() => supabase.from('comandas').select('id, total, created_at, evento_id')
        .neq('estado', 'anulada').gte('created_at', rAnt.desde.toISOString()).lt('created_at', rAnt.hasta.toISOString()).order('id'));
      setDatos({ comandas, movs, anterior, rubros: rubros || [], articulos: articulos || [], eventos: eventos || [] });
    } catch (e) {
      avisar(/evento/.test(e.message) ? 'Falta correr el SQL de eventos en Supabase (supabase/04_EVENTOS.sql)' : e.message, 'error');
      setDatos({ comandas: [], movs: [], anterior: [], rubros: [], articulos: [], eventos: [] });
    }
  }, [r, rAnt, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const inf = useMemo(() => {
    if (!datos) return null;
    const artMap = Object.fromEntries(datos.articulos.map((a) => [a.id, a]));
    const rubMap = Object.fromEntries(datos.rubros.map((x) => [x.id, x.nombre]));
    const arts = {}, rubs = {}, clis = {}, dias = {}, horas = {}, formas = {}, porDia = {}, evs = {};
    const evNom = Object.fromEntries((datos.eventos || []).map((e) => [e.id, e]));
    let ventasDelivery = 0, ventasEventos = 0, nDelivery = 0, nEventos = 0;
    let ventas = 0, envios = 0, unidades = 0, costo = 0, conCosto = false;
    const comandas = datos.comandas.filter((c) => pasaDia(c.created_at) && pasaOrigen(c));
    const ant = datos.anterior.filter((c) => pasaDia(c.created_at) && pasaOrigen(c));
    const ventasAnt = ant.reduce((a, c) => a + Number(c.total), 0);
    comandas.forEach((c) => {
      const t = Number(c.total);
      ventas += t; envios += Number(c.envio);
      if (c.evento_id) {
        ventasEventos += t; nEventos++;
        const ev = evNom[c.evento_id];
        (evs[c.evento_id] ||= { nombre: ev?.nombre || 'Evento', fecha: ev?.abierto_at, total: 0, n: 0, id: c.evento_id }); evs[c.evento_id].total += t; evs[c.evento_id].n++;
      } else { ventasDelivery += t; nDelivery++; }
      const d = diaOperativo(c.created_at);
      const dn = d.getDay();
      (dias[dn] ||= { nombre: DIAS[dn], total: 0, n: 0, fechas: new Set() }); dias[dn].total += t; dias[dn].n++; dias[dn].fechas.add(isoDia(d));
      const h = new Date(c.created_at).getHours();
      (horas[h] ||= { nombre: `${String(h).padStart(2, '0')}:00`, total: 0, n: 0, h }); horas[h].total += t; horas[h].n++;
      // cobro mixto: se reparte entre efectivo y Mercado Pago
      Object.entries(partesPago(c)).forEach(([cta, monto]) => {
        if (monto <= 0) return;
        (formas[cta] ||= { nombre: nombreCuenta(cta), total: 0, n: 0 }); formas[cta].total += monto; formas[cta].n++;
      });
      const kd = isoDia(d);
      (porDia[kd] ||= { nombre: d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' }), total: 0, n: 0, k: kd }); porDia[kd].total += t; porDia[kd].n++;
      const kc = c.cliente_id ? 'c' + c.cliente_id : 'n' + (c.cliente_nombre || 'Sin nombre').toLowerCase();
      if (!c.evento_id) { (clis[kc] ||= { nombre: c.cliente_nombre || 'Sin nombre', total: 0, n: 0 }); clis[kc].total += t; clis[kc].n++; } // los pedidos de eventos no cuentan como clientes
      (c.comanda_items || []).forEach((i) => {
        const q = Number(i.cantidad), st = Number(i.subtotal);
        unidades += q;
        const partes = i.es_mitad && i.articulo2_id ? [[i.articulo_id, 0.5], [i.articulo2_id, 0.5]] : [[i.articulo_id, 1]];
        partes.forEach(([aid, f]) => {
          const a = artMap[aid];
          const nom = a?.nombre || i.descripcion;
          const k = aid || 'd' + i.descripcion;
          (arts[k] ||= { nombre: nom, unidades: 0, total: 0 }); arts[k].unidades += q * f; arts[k].total += st * f;
          if (a && Number(a.costo) > 0) { costo += q * f * Number(a.costo); conCosto = true; }
        });
        const rk = i.rubro_id || 0;
        (rubs[rk] ||= { nombre: rubMap[rk] || 'Sin rubro', total: 0, unidades: 0 }); rubs[rk].total += st; rubs[rk].unidades += q;
      });
    });
    const gastosObj = {};
    let gastos = 0;
    datos.movs.forEach((m) => {
      if (m.tipo !== 'egreso' || INTERNOS.includes(m.concepto) || !pasaDia(m.created_at) || !pasaOrigen(m)) return;
      gastos += Number(m.monto);
      (gastosObj[m.concepto] ||= { nombre: m.concepto, total: 0 }); gastosObj[m.concepto].total += Number(m.monto);
    });
    const n = comandas.length;
    return {
      comandas, ventasAnt, nAnt: ant.length, ticketAnt: ant.length ? ventasAnt / ant.length : 0,
      ventas, envios, unidades, n, ticket: n ? ventas / n : 0, gastos, costo, conCosto,
      arts: Object.values(arts), rubs: top(rubs), clis: top(clis).slice(0, 15),
      dias: Object.values(dias).map((x) => ({ ...x, prom: x.total / x.fechas.size })).sort((a, b) => b.prom - a.prom),
      horas: Object.values(horas).sort((a, b) => ((a.h + 21) % 24) - ((b.h + 21) % 24)),
      formas: top(formas), porDia: Object.values(porDia).sort((a, b) => b.k.localeCompare(a.k)), gastosLista: top(gastosObj),
      ventasDelivery, ventasEventos, nDelivery, nEventos, evs: top(evs),
    };
  }, [datos, pasaDia, pasaOrigen]);

  const nomEvento = eventoSel ? (datos?.eventos || []).find((e) => String(e.id) === String(eventoSel))?.nombre : '';
  const etiquetaDias = (diasSem.length ? ' · solo ' + [...diasSem].sort().map((d) => DIAS[d]).join(', ') : '')
    + (origen === 'delivery' ? ' · sin eventos' : origen === 'eventos' ? ` · solo eventos${nomEvento ? ': ' + nomEvento : ''}` : '');
  // eventos que tuvieron ventas en el período (para elegir uno)
  const eventosPeriodo = useMemo(() => {
    if (!datos) return [];
    const ids = new Set(datos.comandas.filter((c) => c.evento_id).map((c) => c.evento_id));
    return (datos.eventos || []).filter((e) => ids.has(e.id));
  }, [datos]);
  const archivo = (ext) => `informe_${r.isoA}${r.isoA !== r.isoB ? '_al_' + r.isoB : ''}.${ext}`;

  async function bajarExcel() {
    if (!inf) return;
    setBajando(true);
    try {
      await descargarExcel(archivo('xlsx'), [
        { nombre: 'Ventas', filas: inf.comandas.map((c) => {
          const f = new Date(c.created_at); const pp = partesPago(c);
          return {
            Fecha: diaOperativo(c.created_at).toLocaleDateString('es-AR'), Hora: f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            Origen: c.evento_id ? 'Evento: ' + ((datos.eventos || []).find((e) => e.id === c.evento_id)?.nombre || '') : 'Delivery / local',
            Cliente: c.cliente_nombre || '', Entrega: c.evento_id ? 'Evento' : c.tipo_entrega === 'retiro' ? 'Retira' : 'Delivery', 'Forma de pago': nombreCuenta(c.forma_pago),
            Detalle: (c.comanda_items || []).map((i) => `${cant(i.cantidad)} ${i.descripcion}`).join(' | '),
            Envío: Number(c.envio) || 0, Descuento: Number(c.descuento) || 0, Total: Number(c.total) || 0, Efectivo: pp.efectivo, 'Mercado Pago': pp.mercadopago,
          };
        }) },
        { nombre: 'Productos', filas: [...inf.arts].sort((a, b) => b.unidades - a.unidades).map((a) => ({ Producto: a.nombre, Unidades: a.unidades, Total: Math.round(a.total) })) },
        { nombre: 'Rubros', filas: inf.rubs.map((x) => ({ Rubro: x.nombre, Unidades: x.unidades, Total: x.total })) },
        { nombre: 'Por día', filas: [...inf.porDia].reverse().map((x) => ({ Día: x.nombre, Comandas: x.n, Total: x.total })) },
        { nombre: 'Clientes', filas: inf.clis.map((x) => ({ Cliente: x.nombre, Pedidos: x.n, Total: x.total })) },
        { nombre: 'Gastos', filas: inf.gastosLista.map((x) => ({ Concepto: x.nombre, Total: x.total })) },
        ...(inf.evs.length ? [{ nombre: 'Eventos', filas: inf.evs.map((x) => ({ Evento: x.nombre, Fecha: x.fecha ? new Date(x.fecha).toLocaleDateString('es-AR') : '', Pedidos: x.n, Total: x.total })) }] : []),
      ]);
    } catch (e) { avisar('No se pudo generar el Excel: ' + e.message, 'error'); }
    setBajando(false);
  }

  async function bajarPDF() {
    if (!inf) return;
    setBajando(true);
    try {
      const cols2 = (a, b) => [a, b];
      await descargarPDF({
        archivo: archivo('pdf'),
        titulo: 'Informe de ventas',
        subtitulo: r.etiqueta + etiquetaDias,
        kpis: [['Ventas', money(inf.ventas)], ['Comandas', String(inf.n)], ['Ticket promedio', money(inf.ticket)], ['Gastos', money(inf.gastos)],
          ['Ventas - gastos', money(inf.ventas - inf.gastos)], ['Envíos cobrados', money(inf.envios)], ['Productos vendidos', cant(inf.unidades)],
          ['vs período anterior', inf.ventasAnt ? `${inf.ventas >= inf.ventasAnt ? '+' : ''}${Math.round(((inf.ventas - inf.ventasAnt) / inf.ventasAnt) * 100)}%` : '—']],
        bloques: [
          { titulo: 'Más vendidos', columnas: ['Producto', 'Unidades', 'Total'], alinearDerecha: [1, 2],
            filas: [...inf.arts].sort((a, b) => b.unidades - a.unidades).map((a) => [a.nombre, cant(a.unidades), money(a.total)]) },
          { titulo: 'Rubros', columnas: ['Rubro', 'Unidades', 'Total'], alinearDerecha: [1, 2], filas: inf.rubs.map((x) => [x.nombre, cant(x.unidades), money(x.total)]) },
          { titulo: 'Formas de pago', columnas: cols2('Forma', 'Total'), alinearDerecha: [1], filas: inf.formas.map((x) => [x.nombre, money(x.total)]) },
          { titulo: 'Días de la semana (promedio por día)', columnas: ['Día', 'Días', 'Promedio', 'Comandas/día'], alinearDerecha: [1, 2, 3],
            filas: inf.dias.map((x) => [x.nombre, x.fechas.size, money(x.prom), Math.round(x.n / x.fechas.size)]) },
          { titulo: 'Ventas por día', columnas: ['Día', 'Comandas', 'Total'], alinearDerecha: [1, 2], filas: [...inf.porDia].reverse().map((x) => [x.nombre, x.n, money(x.total)]) },
          { titulo: 'Clientes que más compran', columnas: ['Cliente', 'Pedidos', 'Total'], alinearDerecha: [1, 2], filas: inf.clis.map((x) => [x.nombre, x.n, money(x.total)]) },
          ...(origen === 'todo' && inf.nEventos ? [{ titulo: 'Origen de las ventas', columnas: ['Origen', 'Comandas', 'Total'], alinearDerecha: [1, 2],
            filas: [['Delivery / local', inf.nDelivery, money(inf.ventasDelivery)], ['Eventos', inf.nEventos, money(inf.ventasEventos)]] }] : []),
          ...(inf.evs.length ? [{ titulo: 'Eventos', columnas: ['Evento', 'Pedidos', 'Total'], alinearDerecha: [1, 2], filas: inf.evs.map((x) => [x.nombre, x.n, money(x.total)]) }] : []),
          ...(inf.gastosLista.length ? [{ titulo: 'Gastos por concepto', columnas: cols2('Concepto', 'Total'), alinearDerecha: [1],
            filas: inf.gastosLista.map((x) => [x.nombre, money(x.total)]), pie: ['Total', money(inf.gastos)] }] : []),
        ],
      });
    } catch (e) { avisar('No se pudo generar el PDF: ' + e.message, 'error'); }
    setBajando(false);
  }

  const comparar = (act, ant) => {
    if (!ant) return null;
    const pct = Math.round(((act - ant) / ant) * 100);
    return <span className={pct >= 0 ? 'verde-t' : 'rojo-t'} style={{ fontWeight: 700 }}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs anterior</span>;
  };

  const artsOrden = inf ? [...inf.arts].sort((a, b) => b[verArt] - a[verArt]).slice(0, 15) : [];

  return (
    <>
      <Cabecera titulo="Informes" />
      <FiltroFechas valor={periodo} onCambio={setPeriodo} />
      <div className="campo-label">Solo estos días de la semana</div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={!diasSem.length ? 'chip activo' : 'chip'} onClick={() => setDiasSem([])}>Todos</button>
        {[4, 5, 6, 0, 1, 2, 3].map((d) => (
          <button key={d} className={diasSem.includes(d) ? 'chip activo' : 'chip'}
            onClick={() => setDiasSem((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>{DIAS[d].slice(0, 3)}</button>
        ))}
      </div>
      <div className="campo-label">Ventas de</div>
      <div className="origen">
        <Chips valor={origen} onCambio={(v) => { setOrigen(v); setEventoSel(''); }} opciones={[{ id: 'todo', label: 'Todo' }, { id: 'delivery', label: '🛵 Sin eventos' }, { id: 'eventos', label: '🎪 Solo eventos' }]} />
        {origen === 'eventos' && eventosPeriodo.length > 0 && (
          <select style={{ marginTop: 8 }} value={eventoSel} onChange={(e) => setEventoSel(e.target.value)}>
            <option value="">Todos los eventos del período</option>
            {eventosPeriodo.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {new Date(e.abierto_at).toLocaleDateString('es-AR')}</option>)}
          </select>
        )}
      </div>
      <div className="descargas">
        <button className="btn borde" disabled={bajando || !inf?.n} onClick={bajarExcel}>📊 Excel</button>
        <button className="btn borde" disabled={bajando || !inf?.n} onClick={bajarPDF}>📄 PDF con logo</button>
      </div>

      {!inf ? <Cargando /> : inf.n === 0 ? <Vacio texto="No hay ventas en este período" /> : (
        <>
          <div className="kpis">
            <div className="kpi destacado"><div className="k-label">Ventas</div><div className="k-valor">{money(inf.ventas)}</div><div className="k-sub">{inf.n} comandas</div>{inf.ventasAnt > 0 && <div className="k-sub" style={{ color: '#fff' }}>{inf.ventas >= inf.ventasAnt ? '▲' : '▼'} {Math.abs(Math.round(((inf.ventas - inf.ventasAnt) / inf.ventasAnt) * 100))}% vs período anterior</div>}</div>
            <div className="kpi"><div className="k-label">Ticket promedio</div><div className="k-valor">{money(inf.ticket)}</div><div className="k-sub">{cant(inf.unidades)} productos</div>{inf.ticketAnt > 0 && <div className="k-sub">{comparar(inf.ticket, inf.ticketAnt)}</div>}</div>
            <div className="kpi"><div className="k-label">Gastos</div><div className="k-valor rojo-t">{money(inf.gastos)}</div><div className="k-sub">incluye pago cadete</div></div>
            <div className="kpi"><div className="k-label">Ventas − gastos</div><div className={`k-valor ${inf.ventas - inf.gastos >= 0 ? 'verde-t' : 'rojo-t'}`}>{money(inf.ventas - inf.gastos)}</div><div className="k-sub">envíos cobrados {money(inf.envios)}</div></div>
          </div>
          {inf.conCosto && (
            <div className="aviso verde">Margen bruto estimado (con costos cargados): {money(inf.ventas - inf.envios - inf.costo)} · {Math.round(((inf.ventas - inf.envios - inf.costo) / Math.max(inf.ventas - inf.envios, 1)) * 100)}%</div>
          )}

          {origen === 'todo' && inf.nEventos > 0 && (
            <div className="tarjeta">
              <h2>🛵 Delivery vs 🎪 Eventos</h2>
              <Barra texto={`🛵 Delivery / local (${inf.nDelivery})`} valor={inf.ventasDelivery} max={Math.max(inf.ventasDelivery, inf.ventasEventos)} sub={`${money(inf.ventasDelivery)} · ${Math.round((inf.ventasDelivery / inf.ventas) * 100)}%`} />
              <Barra texto={`🎪 Eventos (${inf.nEventos})`} valor={inf.ventasEventos} max={Math.max(inf.ventasDelivery, inf.ventasEventos)} sub={`${money(inf.ventasEventos)} · ${Math.round((inf.ventasEventos / inf.ventas) * 100)}%`} />
            </div>
          )}
          {inf.evs.length > 0 && origen !== 'delivery' && (
            <div className="tarjeta">
              <h2>🎪 Eventos</h2>
              {inf.evs.map((x) => <Barra key={x.id} texto={`${x.nombre}${x.fecha ? ' · ' + new Date(x.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : ''}`} valor={x.total} max={inf.evs[0].total} sub={`${money(x.total)} · ${x.n} ped.`} />)}
            </div>
          )}

          <div className="tarjeta">
            <h2>Más vendidos</h2>
            <Chips chico valor={verArt} onCambio={setVerArt} opciones={[{ id: 'unidades', label: 'Por unidades' }, { id: 'total', label: 'Por $' }]} />
            <div style={{ height: 10 }} />
            {artsOrden.map((a) => <Barra key={a.nombre} texto={a.nombre} valor={a[verArt]} max={artsOrden[0][verArt]} sub={verArt === 'unidades' ? `${cant(a.unidades)} u · ${money(a.total)}` : `${money(a.total)} · ${cant(a.unidades)} u`} />)}
            <div className="suave chico-t">Las mitad y mitad suman ½ a cada gusto.</div>
          </div>

          <div className="tarjeta">
            <h2>Rubros</h2>
            {inf.rubs.map((x) => <Barra key={x.nombre} texto={x.nombre} valor={x.total} max={inf.rubs[0].total} sub={`${money(x.total)} · ${Math.round((x.total / Math.max(inf.ventas - inf.envios, 1)) * 100)}%`} />)}
          </div>

          <div className="tarjeta">
            <h2>Días que más se vende (promedio por día)</h2>
            {inf.dias.map((x) => <Barra key={x.nombre} texto={`${x.nombre} (${x.fechas.size})`} valor={x.prom} max={inf.dias[0].prom} sub={`${money(x.prom)} · ${Math.round(x.n / x.fechas.size)} comandas`} />)}
          </div>

          <div className="tarjeta">
            <h2>Horarios</h2>
            {(() => { const mx = Math.max(...inf.horas.map((h) => h.n)); return inf.horas.map((x) => <Barra key={x.nombre} texto={x.nombre} valor={x.n} max={mx} sub={`${x.n} comandas · ${money(x.total)}`} />); })()}
          </div>

          <div className="tarjeta">
            <h2>Clientes que más compran</h2>
            {inf.clis.map((x, i) => <Barra key={x.nombre + i} texto={`${i + 1}. ${x.nombre}`} valor={x.total} max={inf.clis[0].total} sub={`${money(x.total)} · ${x.n} ped.`} />)}
          </div>

          <div className="tarjeta">
            <h2>Formas de pago</h2>
            {inf.formas.map((x) => <Barra key={x.nombre} texto={x.nombre} valor={x.total} max={inf.formas[0].total} sub={`${money(x.total)} · ${Math.round((x.total / inf.ventas) * 100)}%`} />)}
          </div>

          {inf.gastosLista.length > 0 && (
            <div className="tarjeta">
              <h2>Gastos por concepto</h2>
              {inf.gastosLista.map((x) => <Barra key={x.nombre} texto={x.nombre} valor={x.total} max={inf.gastosLista[0].total} sub={money(x.total)} />)}
            </div>
          )}

          {inf.porDia.length > 1 && (
            <div className="tarjeta">
              <h2>Ventas por día</h2>
              {(() => { const mx = Math.max(...inf.porDia.map((d) => d.total)); return inf.porDia.map((x) => <Barra key={x.k} texto={x.nombre} valor={x.total} max={mx} sub={`${money(x.total)} · ${x.n}`} />); })()}
            </div>
          )}
        </>
      )}
    </>
  );
}
