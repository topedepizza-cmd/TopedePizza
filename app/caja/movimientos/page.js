'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, rpc, traerTodo } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Chips, Cargando, Vacio, Barra } from '@/components/ui';
import FiltroFechas from '@/components/FiltroFechas';
import { rangoFechas } from '@/lib/fechas';
import { money, hora, CUENTAS, nombreCuenta, iconoCuenta } from '@/lib/utils';
import { descargarExcel, descargarPDF, precargarDescargas } from '@/lib/descargas';

// movimientos que solo mueven plata de un lado a otro (no son ingresos/gastos reales)
const INTERNOS = ['Vuelto a cadete', 'Devolución vuelto cadete', 'Ajuste vuelto cadete', 'Movimiento entre cuentas'];
const fechaLarga = (f) => (f ? new Date(f + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }) : '');
const fechaCorta = (f) => (f ? new Date(f + 'T12:00').toLocaleDateString('es-AR') : '');

function Movimientos() {
  const { avisar } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [periodo, setPeriodo] = useState(() => (sp.get('desde')
    ? { modo: sp.get('desde') === sp.get('hasta') ? 'dia' : 'rango', desde: sp.get('desde'), hasta: sp.get('hasta') || sp.get('desde') }
    : { modo: sp.get('modo') || 'hoy' }));
  const [cuenta, setCuenta] = useState(sp.get('cuenta') || 'todas');
  const [tipo, setTipo] = useState(sp.get('tipo') || 'todos');
  const [concepto, setConcepto] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [sinInternos, setSinInternos] = useState(sp.get('tipo') ? true : false);
  const [datos, setDatos] = useState(null);
  const [bajando, setBajando] = useState(false);

  const r = useMemo(() => rangoFechas(periodo), [periodo]);

  useEffect(() => { precargarDescargas(); }, []);

  const cargar = useCallback(async () => {
    setDatos(null);
    try {
      const { data: jor } = await supabase.from('jornadas').select('*').gte('fecha', r.isoA).lte('fecha', r.isoB).order('fecha').order('id');
      const jornadas = jor || [];
      const ids = jornadas.map((j) => j.id);
      const movs = ids.length ? await traerTodo(() => supabase.from('movimientos').select('*').in('jornada_id', ids).order('id')) : [];
      // saldo final: si la última jornada sigue abierta, se calcula en vivo
      const ultima = jornadas[jornadas.length - 1];
      let finales = null;
      if (ultima?.abierta) finales = (await rpc('saldos_jornada', { p_jornada: ultima.id }))?.[0] || null;
      else if (ultima) finales = { efectivo: ultima.sf_efectivo, mercadopago: ultima.sf_mercadopago, transferencia: ultima.sf_transferencia };
      setDatos({ jornadas, movs, finales });
    } catch (e) {
      avisar(e.message, 'error');
      setDatos({ jornadas: [], movs: [], finales: null });
    }
  }, [r.isoA, r.isoB, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const fechaDe = useMemo(() => Object.fromEntries((datos?.jornadas || []).map((j) => [j.id, j.fecha])), [datos]);
  const conceptos = useMemo(() => [...new Set((datos?.movs || []).map((m) => m.concepto))].sort(), [datos]);

  const filtrados = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    return (datos?.movs || []).filter((m) =>
      (cuenta === 'todas' || m.cuenta === cuenta) &&
      (tipo === 'todos' || m.tipo === tipo) &&
      (concepto === 'todos' || m.concepto === concepto) &&
      (!sinInternos || !INTERNOS.includes(m.concepto)) &&
      (!b || `${m.concepto} ${m.detalle || ''}`.toLowerCase().includes(b)));
  }, [datos, cuenta, tipo, concepto, buscar, sinInternos]);

  const ingresos = filtrados.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto), 0);
  const egresos = filtrados.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + Number(m.monto), 0);

  // saldo inicial / final (solo tiene sentido viendo todos los movimientos de una cuenta)
  const verSaldos = datos?.jornadas.length > 0 && tipo === 'todos' && concepto === 'todos' && !buscar.trim() && !sinInternos;
  const ctas = cuenta === 'todas' ? ['efectivo', 'mercadopago', 'transferencia'] : [cuenta];
  const saldoIni = verSaldos ? ctas.reduce((a, c) => a + Number(datos.jornadas[0]['si_' + c] || 0), 0) : 0;
  const saldoFin = verSaldos && datos.finales ? ctas.reduce((a, c) => a + Number(datos.finales[c] || 0), 0) : 0;

  const porConcepto = (t) => {
    const o = {};
    filtrados.filter((m) => m.tipo === t).forEach((m) => {
      (o[m.concepto] ||= { nombre: m.concepto, total: 0, n: 0 });
      o[m.concepto].total += Number(m.monto); o[m.concepto].n++;
    });
    return Object.values(o).sort((a, b) => b.total - a.total);
  };
  const conceptosIng = porConcepto('ingreso');
  const conceptosEgr = porConcepto('egreso');

  const porDia = useMemo(() => {
    const g = {};
    filtrados.forEach((m) => { const f = fechaDe[m.jornada_id] || ''; (g[f] ||= []).push(m); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0])).map(([f, ms]) => [f, [...ms].reverse()]);
  }, [filtrados, fechaDe]);

  const tituloLista = tipo === 'ingreso' ? 'Ingresos' : tipo === 'egreso' ? 'Egresos' : 'Movimientos';
  const filtrosTxt = [
    cuenta !== 'todas' ? nombreCuenta(cuenta) : 'Todas las cuentas',
    tipo !== 'todos' ? (tipo === 'ingreso' ? 'Solo ingresos' : 'Solo egresos') : '',
    concepto !== 'todos' ? concepto : '',
    sinInternos ? 'sin movimientos internos' : '',
    buscar.trim() ? `“${buscar.trim()}”` : '',
  ].filter(Boolean).join(' · ');
  const nombreArchivo = (ext) => `caja_${tituloLista.toLowerCase()}_${r.isoA}${r.isoA !== r.isoB ? '_al_' + r.isoB : ''}${cuenta !== 'todas' ? '_' + cuenta : ''}.${ext}`;

  async function bajarExcel() {
    setBajando(true);
    try {
      await descargarExcel(nombreArchivo('xlsx'), [
        {
          nombre: tituloLista,
          filas: filtrados.map((m) => ({
            'Fecha caja': fechaCorta(fechaDe[m.jornada_id]),
            'Fecha y hora': new Date(m.created_at).toLocaleString('es-AR'),
            Tipo: m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
            Cuenta: nombreCuenta(m.cuenta),
            Concepto: m.concepto,
            Detalle: m.detalle || '',
            Ingreso: m.tipo === 'ingreso' ? Number(m.monto) : 0,
            Egreso: m.tipo === 'egreso' ? Number(m.monto) : 0,
            Neto: m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto),
            'Movimiento interno': INTERNOS.includes(m.concepto) ? 'Sí' : 'No',
          })),
        },
        {
          nombre: 'Resumen por concepto',
          filas: [
            ...conceptosIng.map((c) => ({ Tipo: 'Ingreso', Concepto: c.nombre, Cantidad: c.n, Total: c.total })),
            ...conceptosEgr.map((c) => ({ Tipo: 'Egreso', Concepto: c.nombre, Cantidad: c.n, Total: c.total })),
          ],
        },
        {
          nombre: 'Por día',
          filas: porDia.map(([f, ms]) => ({
            Fecha: fechaCorta(f),
            Ingresos: ms.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto), 0),
            Egresos: ms.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + Number(m.monto), 0),
          })).map((x) => ({ ...x, Neto: x.Ingresos - x.Egresos })),
        },
      ]);
    } catch (e) { avisar('No se pudo generar el Excel: ' + e.message, 'error'); }
    setBajando(false);
  }

  async function bajarPDF() {
    setBajando(true);
    try {
      await descargarPDF({
        archivo: nombreArchivo('pdf'),
        titulo: `${tituloLista} de caja`,
        subtitulo: `${r.etiqueta} · ${filtrosTxt}`,
        kpis: [
          ...(verSaldos ? [['Saldo inicial', money(saldoIni)]] : []),
          ['Ingresos', money(ingresos)], ['Egresos', money(egresos)], ['Neto', money(ingresos - egresos)],
          ...(verSaldos ? [['Saldo final', money(saldoFin)]] : []),
        ],
        bloques: [
          ...(conceptosIng.length ? [{ titulo: 'Ingresos por concepto', columnas: ['Concepto', 'Cant.', 'Total'], alinearDerecha: [1, 2],
            filas: conceptosIng.map((c) => [c.nombre, c.n, money(c.total)]), pie: ['Total ingresos', '', money(ingresos)] }] : []),
          ...(conceptosEgr.length ? [{ titulo: 'Egresos por concepto', columnas: ['Concepto', 'Cant.', 'Total'], alinearDerecha: [1, 2],
            filas: conceptosEgr.map((c) => [c.nombre, c.n, money(c.total)]), pie: ['Total egresos', '', money(egresos)] }] : []),
          { titulo: 'Detalle de movimientos', columnas: ['Fecha', 'Hora', 'Cuenta', 'Concepto', 'Detalle', 'Ingreso', 'Egreso'], alinearDerecha: [5, 6],
            filas: [...filtrados].map((m) => [fechaCorta(fechaDe[m.jornada_id]), hora(m.created_at), nombreCuenta(m.cuenta), m.concepto, m.detalle || '',
              m.tipo === 'ingreso' ? money(m.monto) : '', m.tipo === 'egreso' ? money(m.monto) : '']),
            pie: ['', '', '', '', 'Totales', money(ingresos), money(egresos)] },
        ],
      });
    } catch (e) { avisar('No se pudo generar el PDF: ' + e.message, 'error'); }
    setBajando(false);
  }

  return (
    <>
      <Cabecera titulo={tituloLista} sub="Caja · filtrá por fecha, cuenta y tipo" derecha={<button className="btn borde chico" onClick={() => router.push('/caja')}>← Caja</button>} />

      <FiltroFechas valor={periodo} onCambio={setPeriodo} />

      <Chips valor={cuenta} onCambio={setCuenta} opciones={[{ id: 'todas', label: 'Todas' }, ...CUENTAS.map((c) => ({ id: c.id, label: `${c.icono} ${c.nombre}` }))]} />
      <div style={{ height: 8 }} />
      <Chips valor={tipo} onCambio={(t) => { setTipo(t); setConcepto('todos'); }} opciones={[{ id: 'todos', label: 'Todos' }, { id: 'ingreso', label: '📥 Ingresos' }, { id: 'egreso', label: '📤 Egresos' }]} />
      <div className="filtros-caja" style={{ marginTop: 10 }}>
        <select value={concepto} onChange={(e) => setConcepto(e.target.value)}>
          <option value="todos">Todos los conceptos</option>
          {conceptos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="🔎 Buscar detalle…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>
      <label className="check" style={{ paddingTop: 0 }}>
        <input type="checkbox" checked={sinInternos} onChange={(e) => setSinInternos(e.target.checked)} />
        <span className="chico-t">Ocultar internos (vueltos al cadete, pase entre cuentas)</span>
      </label>

      {!datos ? <Cargando /> : (
        <>
          <div className="kpis" style={tipo !== 'todos' ? { gridTemplateColumns: '1fr' } : undefined}>
            {tipo !== 'egreso' && <div className="kpi"><div className="k-label">📥 Ingresos</div><div className="k-valor verde-t">{money(ingresos)}</div><div className="k-sub">{filtrados.filter((m) => m.tipo === 'ingreso').length} movimientos</div></div>}
            {tipo !== 'ingreso' && <div className="kpi"><div className="k-label">📤 Egresos</div><div className="k-valor rojo-t">{money(egresos)}</div><div className="k-sub">{filtrados.filter((m) => m.tipo === 'egreso').length} movimientos</div></div>}
          </div>

          {verSaldos && (
            <div className="tarjeta">
              <h2>{cuenta === 'todas' ? '🏦 Saldo de la caja' : `${iconoCuenta(cuenta)} Saldo ${nombreCuenta(cuenta)}`}</h2>
              <div className="conciliacion">
                <div>Al empezar<b>{money(saldoIni)}</b></div>
                <span>+</span>
                <div>Neto<b className={ingresos - egresos >= 0 ? 'verde-t' : 'rojo-t'}>{money(ingresos - egresos)}</b></div>
                <span>=</span>
                <div>{datos.jornadas[datos.jornadas.length - 1]?.abierta ? 'Ahora' : 'Al cierre'}<b>{money(saldoFin)}</b></div>
              </div>
            </div>
          )}

          <div className="descargas">
            <button className="btn borde" disabled={bajando} onClick={bajarExcel}>📊 Excel</button>
            <button className="btn borde" disabled={bajando} onClick={bajarPDF}>📄 PDF con logo</button>
          </div>

          {(conceptosIng.length > 0 || conceptosEgr.length > 0) && (
            <div className="tarjeta">
              <h2>📋 Resumen por concepto</h2>
              {conceptosIng.length > 0 && <div className="campo-label">Ingresos</div>}
              {conceptosIng.map((c) => <Barra key={'i' + c.nombre} texto={`${c.nombre} (${c.n})`} valor={c.total} max={conceptosIng[0].total} sub={money(c.total)} />)}
              {conceptosEgr.length > 0 && <div className="campo-label" style={{ marginTop: 6 }}>Egresos</div>}
              {conceptosEgr.map((c) => <Barra key={'e' + c.nombre} texto={`${c.nombre} (${c.n})`} valor={c.total} max={conceptosEgr[0].total} sub={money(c.total)} />)}
            </div>
          )}

          {porDia.length === 0 ? <Vacio emoji="💰" texto="No hay movimientos con estos filtros" /> : porDia.map(([f, ms]) => {
            const ing = ms.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto), 0);
            const egr = ms.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + Number(m.monto), 0);
            return (
              <div key={f}>
                <div className="dia-cab">{f ? fechaLarga(f) : 'Sin fecha'} <span><span className="verde-t">+{money(ing)}</span> · <span className="rojo-t">−{money(egr)}</span></span></div>
                <div className="lista">
                  {ms.map((m) => (
                    <div key={m.id} className={m.comanda_id ? 'item clic' : 'item'} onClick={() => m.comanda_id && router.push(`/comanda/${m.comanda_id}`)}>
                      <div className="item-cuerpo">
                        <div className="item-titulo">{m.concepto}{INTERNOS.includes(m.concepto) && <span className="badge b-gris" style={{ marginLeft: 6 }}>interno</span>}</div>
                        <div className="item-sub">{hora(m.created_at)} · {iconoCuenta(m.cuenta)} {nombreCuenta(m.cuenta)}{m.detalle ? ` · ${m.detalle}` : ''}</div>
                      </div>
                      <div className={`item-der mono ${m.tipo === 'ingreso' ? 'verde-t' : 'rojo-t'}`}>{m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Cargando />}><Movimientos /></Suspense>;
}
