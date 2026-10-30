'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, traerTodo } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Chips, Cargando, Vacio, Barra } from '@/components/ui';
import { money, cant, diaOperativo, isoDia, nombreCuenta } from '@/lib/utils';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const INTERNOS = ['Vuelto a cadete', 'Movimiento entre cuentas', 'Anulación venta', 'Cobro deshecho', 'Devolución vuelto cadete', 'Ajuste vuelto cadete', 'Diferencia de arqueo'];

function hoyOperativo() { const d = diaOperativo(new Date()); d.setHours(0, 0, 0, 0); return d; }
function sumarDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function inicioOperativo(d) { const x = new Date(d); x.setHours(3, 0, 0, 0); return x; }

function rango(periodo, desdeTxt, hastaTxt) {
  const hoy = hoyOperativo();
  let a = hoy, b = hoy;
  if (periodo === 'ayer') { a = sumarDias(hoy, -1); b = a; }
  if (periodo === '7') a = sumarDias(hoy, -6);
  if (periodo === '30') a = sumarDias(hoy, -29);
  if (periodo === 'mes') a = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  if (periodo === 'mesant') { a = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); b = new Date(hoy.getFullYear(), hoy.getMonth(), 0); }
  if (periodo === 'custom' && desdeTxt && hastaTxt) { a = new Date(desdeTxt + 'T00:00'); b = new Date(hastaTxt + 'T00:00'); }
  return { desde: inicioOperativo(a), hasta: inicioOperativo(sumarDias(b, 1)), a, b };
}

function top(obj, campo = 'total') {
  return Object.values(obj).sort((x, y) => y[campo] - x[campo]);
}

export default function Informes() {
  const { avisar } = useApp();
  const [periodo, setPeriodo] = useState('7');
  const [desdeTxt, setDesdeTxt] = useState(isoDia(sumarDias(new Date(), -7)));
  const [hastaTxt, setHastaTxt] = useState(isoDia(new Date()));
  const [datos, setDatos] = useState(null);
  const [verArt, setVerArt] = useState('unidades');

  const r = useMemo(() => rango(periodo, desdeTxt, hastaTxt), [periodo, desdeTxt, hastaTxt]);

  const cargar = useCallback(async () => {
    setDatos(null);
    try {
      const [comandas, movs, { data: rubros }, { data: articulos }] = await Promise.all([
        traerTodo(() => supabase.from('comandas')
          .select('id, total, envio, descuento, forma_pago, cliente_id, cliente_nombre, created_at, tipo_entrega, comanda_items(articulo_id, articulo2_id, es_mitad, descripcion, rubro_id, cantidad, subtotal)')
          .neq('estado', 'anulada').gte('created_at', r.desde.toISOString()).lt('created_at', r.hasta.toISOString()).order('id')),
        traerTodo(() => supabase.from('movimientos').select('tipo, concepto, monto, comanda_id, liquidacion_id')
          .gte('created_at', r.desde.toISOString()).lt('created_at', r.hasta.toISOString()).order('id')),
        supabase.from('rubros').select('*'),
        supabase.from('articulos').select('id, nombre, costo, rubro_id'),
      ]);
      setDatos({ comandas, movs, rubros: rubros || [], articulos: articulos || [] });
    } catch (e) { avisar(e.message, 'error'); setDatos({ comandas: [], movs: [], rubros: [], articulos: [] }); }
  }, [r, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const inf = useMemo(() => {
    if (!datos) return null;
    const artMap = Object.fromEntries(datos.articulos.map((a) => [a.id, a]));
    const rubMap = Object.fromEntries(datos.rubros.map((x) => [x.id, x.nombre]));
    const arts = {}, rubs = {}, clis = {}, dias = {}, horas = {}, formas = {}, porDia = {};
    let ventas = 0, envios = 0, unidades = 0, costo = 0, conCosto = false;
    datos.comandas.forEach((c) => {
      const t = Number(c.total);
      ventas += t; envios += Number(c.envio);
      const d = diaOperativo(c.created_at);
      const dn = d.getDay();
      (dias[dn] ||= { nombre: DIAS[dn], total: 0, n: 0, fechas: new Set() }); dias[dn].total += t; dias[dn].n++; dias[dn].fechas.add(isoDia(d));
      const h = new Date(c.created_at).getHours();
      (horas[h] ||= { nombre: `${String(h).padStart(2, '0')}:00`, total: 0, n: 0, h }); horas[h].total += t; horas[h].n++;
      (formas[c.forma_pago] ||= { nombre: nombreCuenta(c.forma_pago), total: 0, n: 0 }); formas[c.forma_pago].total += t; formas[c.forma_pago].n++;
      const kd = isoDia(d);
      (porDia[kd] ||= { nombre: d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' }), total: 0, n: 0, k: kd }); porDia[kd].total += t; porDia[kd].n++;
      const kc = c.cliente_id ? 'c' + c.cliente_id : 'n' + (c.cliente_nombre || 'Sin nombre').toLowerCase();
      (clis[kc] ||= { nombre: c.cliente_nombre || 'Sin nombre', total: 0, n: 0 }); clis[kc].total += t; clis[kc].n++;
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
      if (m.tipo !== 'egreso' || INTERNOS.includes(m.concepto)) return;
      gastos += Number(m.monto);
      (gastosObj[m.concepto] ||= { nombre: m.concepto, total: 0 }); gastosObj[m.concepto].total += Number(m.monto);
    });
    const n = datos.comandas.length;
    return {
      ventas, envios, unidades, n, ticket: n ? ventas / n : 0, gastos, costo, conCosto,
      arts: Object.values(arts), rubs: top(rubs), clis: top(clis).slice(0, 15),
      dias: Object.values(dias).map((x) => ({ ...x, prom: x.total / x.fechas.size })).sort((a, b) => b.prom - a.prom),
      horas: Object.values(horas).sort((a, b) => ((a.h + 21) % 24) - ((b.h + 21) % 24)),
      formas: top(formas), porDia: Object.values(porDia).sort((a, b) => b.k.localeCompare(a.k)), gastosLista: top(gastosObj),
    };
  }, [datos]);

  function exportar() {
    if (!datos) return;
    const filas = [['Fecha', 'Hora', 'Cliente', 'Forma de pago', 'Detalle', 'Envío', 'Descuento', 'Total']];
    datos.comandas.forEach((c) => {
      const f = new Date(c.created_at);
      filas.push([f.toLocaleDateString('es-AR'), f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), c.cliente_nombre || '',
        nombreCuenta(c.forma_pago), (c.comanda_items || []).map((i) => `${cant(i.cantidad)} ${i.descripcion}`).join(' | '), c.envio, c.descuento, c.total]);
    });
    const csv = '﻿' + filas.map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ventas_${isoDia(r.a)}_${isoDia(r.b)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const artsOrden = inf ? [...inf.arts].sort((a, b) => b[verArt] - a[verArt]).slice(0, 15) : [];

  return (
    <>
      <Cabecera titulo="Informes" derecha={<button className="btn borde chico" onClick={exportar}>⬇ Excel</button>} />
      <Chips valor={periodo} onCambio={setPeriodo} opciones={[
        { id: 'hoy', label: 'Hoy' }, { id: 'ayer', label: 'Ayer' }, { id: '7', label: '7 días' }, { id: '30', label: '30 días' },
        { id: 'mes', label: 'Este mes' }, { id: 'mesant', label: 'Mes anterior' }, { id: 'custom', label: 'Elegir fechas' },
      ]} />
      {periodo === 'custom' && (
        <div className="grid2" style={{ marginTop: 10 }}>
          <input type="date" value={desdeTxt} onChange={(e) => setDesdeTxt(e.target.value)} />
          <input type="date" value={hastaTxt} onChange={(e) => setHastaTxt(e.target.value)} />
        </div>
      )}
      <p className="suave chico-t" style={{ margin: '8px 2px' }}>
        {r.a.toLocaleDateString('es-AR')} {isoDia(r.a) !== isoDia(r.b) && `al ${r.b.toLocaleDateString('es-AR')}`} · lo vendido antes de las 3 AM cuenta para el día anterior
      </p>

      {!inf ? <Cargando /> : inf.n === 0 ? <Vacio texto="No hay ventas en este período" /> : (
        <>
          <div className="kpis">
            <div className="kpi destacado"><div className="k-label">Ventas</div><div className="k-valor">{money(inf.ventas)}</div><div className="k-sub">{inf.n} comandas</div></div>
            <div className="kpi"><div className="k-label">Ticket promedio</div><div className="k-valor">{money(inf.ticket)}</div><div className="k-sub">{cant(inf.unidades)} productos</div></div>
            <div className="kpi"><div className="k-label">Gastos</div><div className="k-valor rojo-t">{money(inf.gastos)}</div><div className="k-sub">incluye pago cadete</div></div>
            <div className="kpi"><div className="k-label">Ventas − gastos</div><div className={`k-valor ${inf.ventas - inf.gastos >= 0 ? 'verde-t' : 'rojo-t'}`}>{money(inf.ventas - inf.gastos)}</div><div className="k-sub">envíos cobrados {money(inf.envios)}</div></div>
          </div>
          {inf.conCosto && (
            <div className="aviso verde">Margen bruto estimado (con costos cargados): {money(inf.ventas - inf.envios - inf.costo)} · {Math.round(((inf.ventas - inf.envios - inf.costo) / Math.max(inf.ventas - inf.envios, 1)) * 100)}%</div>
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
