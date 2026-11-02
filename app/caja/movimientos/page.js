'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, rpc, traerTodo } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Chips, Cargando, Vacio, Barra, Hoja, Confirmar } from '@/components/ui';
import FiltroFechas from '@/components/FiltroFechas';
import { rangoFechas } from '@/lib/fechas';
import { money, hora, fechaHora, CUENTAS, nombreCuenta, iconoCuenta, categoriaMov, CATEGORIAS, depurarMovimientos, netoMovs } from '@/lib/utils';
import { descargarExcel, descargarPDF, precargarDescargas } from '@/lib/descargas';

const fechaLarga = (f) => (f ? new Date(f + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }) : '');
const fechaCorta = (f) => (f ? new Date(f + 'T12:00').toLocaleDateString('es-AR') : '');

// qué categorías entran en cada vista
const VISTAS = {
  todo: ['venta', 'otro_ingreso', 'gasto', 'cadete', 'interno'],
  ingresos: ['venta', 'otro_ingreso'],
  ventas: ['venta'],
  otros: ['otro_ingreso'],
  egresos: ['gasto', 'cadete'],
  gastos: ['gasto'],
  cadetes: ['cadete'],
};
const TITULOS = { todo: 'Movimientos', ingresos: 'Ingresos', ventas: 'Ventas', otros: 'Otros ingresos', egresos: 'Egresos', gastos: 'Gastos', cadetes: 'Pagos a cadetes' };
const esManual = (m) => !m.comanda_id && !m.liquidacion_id;

function vistaInicial(sp) {
  const t = sp.get('tipo');
  if (t === 'ingreso') return 'ingresos';
  if (t === 'egreso') return 'egresos';
  return VISTAS[sp.get('vista')] ? sp.get('vista') : 'todo';
}

function Movimientos() {
  const { avisar } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [periodo, setPeriodo] = useState(() => (sp.get('desde')
    ? { modo: sp.get('desde') === sp.get('hasta') ? 'dia' : 'rango', desde: sp.get('desde'), hasta: sp.get('hasta') || sp.get('desde') }
    : { modo: sp.get('modo') || 'hoy' }));
  const [cuenta, setCuenta] = useState(sp.get('cuenta') || 'todas');
  const [vista, setVista] = useState(() => vistaInicial(sp));
  const [concepto, setConcepto] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [verInternos, setVerInternos] = useState(false);
  const [datos, setDatos] = useState(null);
  const [bajando, setBajando] = useState(false);
  const [sel, setSel] = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  const r = useMemo(() => rangoFechas(periodo), [periodo]);
  useEffect(() => { precargarDescargas(); }, []);

  const cargar = useCallback(async () => {
    setDatos(null);
    try {
      const { data: jor } = await supabase.from('jornadas').select('*').gte('fecha', r.isoA).lte('fecha', r.isoB).order('fecha').order('id');
      const jornadas = jor || [];
      const ids = jornadas.map((j) => j.id);
      const movs = ids.length ? await traerTodo(() => supabase.from('movimientos').select('*').in('jornada_id', ids).order('id')) : [];
      const ultima = jornadas[jornadas.length - 1];
      let finales = null;
      if (ultima?.abierta) finales = (await rpc('saldos_jornada', { p_jornada: ultima.id }))?.[0] || null;
      else if (ultima) finales = { efectivo: ultima.sf_efectivo, mercadopago: ultima.sf_mercadopago, transferencia: ultima.sf_transferencia };
      // los cobros deshechos / anulados se sacan junto con su venta: no son movimientos reales
      setDatos({ jornadas, movs: depurarMovimientos(movs).map((m) => ({ ...m, cat: categoriaMov(m) })), finales });
    } catch (e) {
      avisar(e.message, 'error');
      setDatos({ jornadas: [], movs: [], finales: null });
    }
  }, [r.isoA, r.isoB, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const fechaDe = useMemo(() => Object.fromEntries((datos?.jornadas || []).map((j) => [j.id, j.fecha])), [datos]);

  // filtros comunes (cuenta + búsqueda) → sirven para las tarjetas de arriba
  const base = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    return (datos?.movs || []).filter((m) => (cuenta === 'todas' || m.cuenta === cuenta) && (!b || `${m.concepto} ${m.detalle || ''}`.toLowerCase().includes(b)));
  }, [datos, cuenta, buscar]);

  const filtrados = useMemo(() => base.filter((m) =>
    VISTAS[vista].includes(m.cat) && (vista !== 'todo' || verInternos || m.cat !== 'interno') &&
    (concepto === 'todos' || m.concepto === concepto)), [base, vista, verInternos, concepto]);

  const conceptos = useMemo(() => [...new Set(base.filter((m) => VISTAS[vista].includes(m.cat)).map((m) => m.concepto))].sort(), [base, vista]);

  const totCat = (c) => netoMovs(base.filter((m) => m.cat === c)) * (c === 'gasto' || c === 'cadete' ? -1 : 1);
  const tVentas = totCat('venta'), tOtros = totCat('otro_ingreso'), tGastos = totCat('gasto'), tCadetes = totCat('cadete');
  const ingresos = filtrados.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto), 0);
  const egresos = filtrados.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + Number(m.monto), 0);

  // saldo de la cuenta: arrancó + todo lo que se movió = ahora/al cierre
  const verSaldos = datos?.jornadas.length > 0 && vista === 'todo' && concepto === 'todos' && !buscar.trim();
  const ctas = cuenta === 'todas' ? ['efectivo', 'mercadopago', 'transferencia'] : [cuenta];
  const saldoIni = verSaldos ? ctas.reduce((a, c) => a + Number(datos.jornadas[0]['si_' + c] || 0), 0) : 0;
  const saldoFin = verSaldos && datos.finales ? ctas.reduce((a, c) => a + Number(datos.finales[c] || 0), 0) : 0;

  const porConcepto = (lista) => {
    const o = {};
    lista.forEach((m) => {
      (o[m.concepto] ||= { nombre: m.concepto === 'Venta' ? 'Ventas de comandas' : m.concepto, total: 0, n: 0 });
      o[m.concepto].total += (m.tipo === 'ingreso' ? 1 : -1) * Number(m.monto) * (m.cat === 'gasto' || m.cat === 'cadete' ? -1 : 1); o[m.concepto].n++;
    });
    return Object.values(o).sort((a, b) => b.total - a.total);
  };
  const resumenIng = porConcepto(filtrados.filter((m) => m.cat === 'venta' || m.cat === 'otro_ingreso'));
  const resumenEgr = porConcepto(filtrados.filter((m) => m.cat === 'gasto' || m.cat === 'cadete'));

  const porDia = useMemo(() => {
    const g = {};
    filtrados.forEach((m) => { const f = fechaDe[m.jornada_id] || ''; (g[f] ||= []).push(m); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0])).map(([f, ms]) => [f, [...ms].reverse()]);
  }, [filtrados, fechaDe]);

  // ---------- eliminar ----------
  function pedirEliminar(m) {
    setConfirmar({
      titulo: `¿Eliminar ${m.tipo === 'ingreso' ? 'este ingreso' : 'este egreso'}?`,
      mensaje: `${m.concepto}${m.detalle ? ` (${m.detalle})` : ''} · ${money(m.monto)} · ${nombreCuenta(m.cuenta)}. ${m.concepto === 'Movimiento entre cuentas' ? 'Se borran las dos partes del pase. ' : ''}El saldo se corrige solo${fechaDe[m.jornada_id] && !datos.jornadas.find((j) => j.id === m.jornada_id)?.abierta ? ', también en los cierres de ese día en adelante' : ''}.`,
      boton: 'Eliminar', peligro: true,
      onOk: async () => {
        try {
          await rpc('eliminar_movimiento', { p_id: m.id });
          avisar('Movimiento eliminado ✔');
          setSel(null);
          cargar();
        } catch (e) { avisar(e.message, 'error'); }
      },
    });
  }

  // ---------- descargas ----------
  const tituloLista = TITULOS[vista];
  const filtrosTxt = [cuenta !== 'todas' ? nombreCuenta(cuenta) : 'Todas las cuentas', concepto !== 'todos' ? concepto : '', buscar.trim() ? `“${buscar.trim()}”` : ''].filter(Boolean).join(' · ');
  const nombreArchivo = (ext) => `caja_${tituloLista.toLowerCase().replace(/ /g, '_')}_${r.isoA}${r.isoA !== r.isoB ? '_al_' + r.isoB : ''}${cuenta !== 'todas' ? '_' + cuenta : ''}.${ext}`;

  async function bajarExcel() {
    setBajando(true);
    try {
      await descargarExcel(nombreArchivo('xlsx'), [
        { nombre: tituloLista, filas: filtrados.map((m) => ({
          'Fecha caja': fechaCorta(fechaDe[m.jornada_id]), 'Fecha y hora': new Date(m.created_at).toLocaleString('es-AR'),
          Categoría: CATEGORIAS[m.cat].nombre, Tipo: m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso', Cuenta: nombreCuenta(m.cuenta),
          Concepto: m.concepto, Detalle: m.detalle || '',
          Ingreso: m.tipo === 'ingreso' ? Number(m.monto) : 0, Egreso: m.tipo === 'egreso' ? Number(m.monto) : 0,
          Neto: m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto),
        })) },
        { nombre: 'Resumen', filas: [
          { Categoría: 'Ventas', Total: tVentas }, { Categoría: 'Otros ingresos', Total: tOtros },
          { Categoría: 'Gastos', Total: tGastos }, { Categoría: 'Pagos a cadetes', Total: tCadetes },
          { Categoría: 'Resultado (ingresos - egresos)', Total: tVentas + tOtros - tGastos - tCadetes },
        ] },
        { nombre: 'Por concepto', filas: [
          ...resumenIng.map((c) => ({ Tipo: 'Ingreso', Concepto: c.nombre, Cantidad: c.n, Total: c.total })),
          ...resumenEgr.map((c) => ({ Tipo: 'Egreso', Concepto: c.nombre, Cantidad: c.n, Total: c.total })),
        ] },
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
        kpis: [['Ventas', money(tVentas)], ['Otros ingresos', money(tOtros)], ['Gastos', money(tGastos)], ['Pagos a cadetes', money(tCadetes)],
          ['Resultado', money(tVentas + tOtros - tGastos - tCadetes)], ...(verSaldos ? [['Saldo al empezar', money(saldoIni)], ['Saldo final', money(saldoFin)]] : [])],
        bloques: [
          ...(resumenIng.length ? [{ titulo: 'Ingresos por concepto', columnas: ['Concepto', 'Cant.', 'Total'], alinearDerecha: [1, 2],
            filas: resumenIng.map((c) => [c.nombre, c.n, money(c.total)]), pie: ['Total', '', money(resumenIng.reduce((a, c) => a + c.total, 0))] }] : []),
          ...(resumenEgr.length ? [{ titulo: 'Egresos por concepto', columnas: ['Concepto', 'Cant.', 'Total'], alinearDerecha: [1, 2],
            filas: resumenEgr.map((c) => [c.nombre, c.n, money(c.total)]), pie: ['Total', '', money(resumenEgr.reduce((a, c) => a + c.total, 0))] }] : []),
          { titulo: 'Detalle', columnas: ['Fecha', 'Hora', 'Categoría', 'Cuenta', 'Concepto / detalle', 'Ingreso', 'Egreso'], alinearDerecha: [5, 6],
            filas: filtrados.map((m) => [fechaCorta(fechaDe[m.jornada_id]), hora(m.created_at), CATEGORIAS[m.cat].nombre, nombreCuenta(m.cuenta),
              m.concepto + (m.detalle ? ` - ${m.detalle}` : ''), m.tipo === 'ingreso' ? money(m.monto) : '', m.tipo === 'egreso' ? money(m.monto) : '']),
            pie: ['', '', '', '', 'Totales', money(ingresos), money(egresos)] },
        ],
      });
    } catch (e) { avisar('No se pudo generar el PDF: ' + e.message, 'error'); }
    setBajando(false);
  }

  const grupo = ['ingresos', 'ventas', 'otros'].includes(vista) ? 'ingresos' : ['egresos', 'gastos', 'cadetes'].includes(vista) ? 'egresos' : 'todo';
  const tarjeta = (v, cat, valor, clase) => (
    <button className={`kpi kpi-btn${vista === v ? ' elegida' : ''}`} onClick={() => { setVista(vista === v ? 'todo' : v); setConcepto('todos'); }}>
      <div className="k-label">{CATEGORIAS[cat].icono} {CATEGORIAS[cat].nombre}</div>
      <div className={`k-valor ${clase}`}>{money(valor)}</div>
      <div className="k-sub">{base.filter((m) => m.cat === cat).length} mov. · tocá para ver</div>
    </button>
  );

  return (
    <>
      <Cabecera titulo={tituloLista} sub="Caja · tocá un movimiento para verlo o eliminarlo" derecha={<button className="btn borde chico" onClick={() => router.push('/caja')}>← Caja</button>} />

      <FiltroFechas valor={periodo} onCambio={setPeriodo} />
      <Chips valor={cuenta} onCambio={setCuenta} opciones={[{ id: 'todas', label: 'Todas las cuentas' }, ...CUENTAS.map((c) => ({ id: c.id, label: `${c.icono} ${c.nombre}` }))]} />

      {!datos ? <Cargando /> : (
        <>
          <div className="kpis" style={{ marginTop: 12 }}>
            {tarjeta('ventas', 'venta', tVentas, 'verde-t')}
            {tarjeta('otros', 'otro_ingreso', tOtros, 'azul-t')}
            {tarjeta('gastos', 'gasto', tGastos, 'rojo-t')}
            {tarjeta('cadetes', 'cadete', tCadetes, 'ambar-t')}
          </div>
          <div className="tarjeta resultado-caja">
            <div className="resumen-linea"><span>📥 Ingresos (ventas + otros)</span><b className="mono verde-t">{money(tVentas + tOtros)}</b></div>
            <div className="resumen-linea"><span>📤 Egresos (gastos + cadetes)</span><b className="mono rojo-t">−{money(tGastos + tCadetes)}</b></div>
            <div className="resumen-linea total"><span>Resultado</span><span className={`mono ${tVentas + tOtros - tGastos - tCadetes >= 0 ? 'verde-t' : 'rojo-t'}`}>{money(tVentas + tOtros - tGastos - tCadetes)}</span></div>
            {verSaldos && (
              <div className="conciliacion" style={{ marginTop: 12 }}>
                <div>{cuenta === 'todas' ? 'Caja' : nombreCuenta(cuenta)} al empezar<b>{money(saldoIni)}</b></div>
                <span>→</span>
                <div>{datos.jornadas[datos.jornadas.length - 1]?.abierta ? 'Ahora' : 'Al cierre'}<b>{money(saldoFin)}</b></div>
              </div>
            )}
          </div>

          <div className="campo-label">Ver</div>
          <Chips valor={grupo} onCambio={(g) => { setVista(g); setConcepto('todos'); }} opciones={[{ id: 'todo', label: 'Todo' }, { id: 'ingresos', label: '📥 Ingresos' }, { id: 'egresos', label: '📤 Egresos' }]} />
          {grupo === 'ingresos' && (
            <div style={{ marginTop: 8 }}><Chips chico valor={vista} onCambio={(v) => { setVista(v); setConcepto('todos'); }} opciones={[{ id: 'ingresos', label: 'Todos los ingresos' }, { id: 'ventas', label: '🍕 Solo ventas' }, { id: 'otros', label: '💵 Solo otros ingresos' }]} /></div>
          )}
          {grupo === 'egresos' && (
            <div style={{ marginTop: 8 }}><Chips chico valor={vista} onCambio={(v) => { setVista(v); setConcepto('todos'); }} opciones={[{ id: 'egresos', label: 'Todos los egresos' }, { id: 'gastos', label: '🧾 Solo gastos' }, { id: 'cadetes', label: '🛵 Solo cadetes' }]} /></div>
          )}
          <div className="filtros-caja" style={{ marginTop: 10 }}>
            <select value={concepto} onChange={(e) => setConcepto(e.target.value)}>
              <option value="todos">Todos los conceptos</option>
              {conceptos.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input placeholder="🔎 Buscar detalle…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </div>
          {vista === 'todo' && (
            <label className="check" style={{ paddingTop: 0 }}>
              <input type="checkbox" checked={verInternos} onChange={(e) => setVerInternos(e.target.checked)} />
              <span className="chico-t">Mostrar internos (vueltos al cadete y pases entre cuentas)</span>
            </label>
          )}

          <div className="descargas">
            <button className="btn borde" disabled={bajando} onClick={bajarExcel}>📊 Excel</button>
            <button className="btn borde" disabled={bajando} onClick={bajarPDF}>📄 PDF con logo</button>
          </div>

          {(resumenIng.length > 0 || resumenEgr.length > 0) && (
            <div className="tarjeta">
              <h2>📋 Por concepto</h2>
              {resumenIng.length > 0 && <div className="campo-label">📥 Ingresos</div>}
              {resumenIng.map((c) => <Barra key={'i' + c.nombre} texto={`${c.nombre} (${c.n})`} valor={c.total} max={resumenIng[0].total} sub={money(c.total)} />)}
              {resumenEgr.length > 0 && <div className="campo-label" style={{ marginTop: 6 }}>📤 Egresos</div>}
              {resumenEgr.map((c) => <Barra key={'e' + c.nombre} texto={`${c.nombre} (${c.n})`} valor={c.total} max={resumenEgr[0].total} sub={money(c.total)} />)}
            </div>
          )}

          {porDia.length === 0 ? <Vacio emoji="💰" texto="No hay movimientos con estos filtros" /> : porDia.map(([f, ms]) => {
            const ing = ms.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto), 0);
            const egr = ms.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + Number(m.monto), 0);
            return (
              <div key={f}>
                <div className="dia-cab">{fechaLarga(f) || 'Sin fecha'} <span>{ing > 0 && <span className="verde-t">+{money(ing)}</span>}{ing > 0 && egr > 0 && ' · '}{egr > 0 && <span className="rojo-t">−{money(egr)}</span>}</span></div>
                <div className="lista">
                  {ms.map((m) => (
                    <div key={m.id} className="item clic" onClick={() => setSel(m)}>
                      <div className="item-cuerpo">
                        <div className="item-titulo"><span className={`badge ${CATEGORIAS[m.cat].clase}`} style={{ marginRight: 6 }}>{CATEGORIAS[m.cat].icono} {CATEGORIAS[m.cat].nombre}</span>{m.concepto !== 'Venta' && m.concepto}</div>
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

      <Hoja abierta={!!sel} titulo={sel ? `${sel.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} · ${money(sel.monto)}` : ''} onCerrar={() => setSel(null)}
        pie={sel && (esManual(sel) ? (
          <button className="btn peligro bloque" onClick={() => pedirEliminar(sel)}>🗑 Eliminar {sel.tipo === 'ingreso' ? 'ingreso' : 'egreso'}</button>
        ) : sel.comanda_id ? (
          <button className="btn borde bloque" onClick={() => router.push(`/comanda/${sel.comanda_id}`)}>🧾 Ir a la comanda</button>
        ) : (
          <button className="btn borde bloque" onClick={() => router.push('/cadete')}>🛵 Ir a Cadete</button>
        ))}>
        {sel && (
          <>
            <div className="resumen-linea"><span>Categoría</span><span className={`badge ${CATEGORIAS[sel.cat].clase}`}>{CATEGORIAS[sel.cat].icono} {CATEGORIAS[sel.cat].nombre}</span></div>
            <div className="resumen-linea"><span>Concepto</span><b>{sel.concepto}</b></div>
            {sel.detalle && <div className="resumen-linea"><span>Detalle</span><span>{sel.detalle}</span></div>}
            <div className="resumen-linea"><span>Cuenta</span><span>{iconoCuenta(sel.cuenta)} {nombreCuenta(sel.cuenta)}</span></div>
            <div className="resumen-linea"><span>Fecha</span><span>{fechaHora(sel.created_at)}</span></div>
            <div className="resumen-linea total"><span>Monto</span><span className={`mono ${sel.tipo === 'ingreso' ? 'verde-t' : 'rojo-t'}`}>{sel.tipo === 'ingreso' ? '+' : '−'}{money(sel.monto)}</span></div>
            {!esManual(sel) && (
              <div className="aviso azul" style={{ marginTop: 10 }}>
                {sel.comanda_id ? 'Este movimiento lo generó una comanda. Para corregirlo andá a la comanda (deshacer cobro, anular o eliminar).' : 'Es un pago a cadete. Para corregirlo eliminá la liquidación desde Cadete.'}
              </div>
            )}
          </>
        )}
      </Hoja>
      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />
    </>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Cargando />}><Movimientos /></Suspense>;
}
