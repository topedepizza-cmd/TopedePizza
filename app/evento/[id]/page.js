'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Hoja, Chips, Campo, Cargando, Vacio, Confirmar, Barra } from '@/components/ui';
import SelectorProductos, { productosParaGuardar } from '@/components/SelectorProductos';
import { money, num, cant, hora, CUENTAS, nombreCuenta, iconoCuenta, partesPago, linkWhatsapp } from '@/lib/utils';
import { ESTADOS_EVENTO, resumenEvento, textoEvento, duracion } from '@/lib/eventos';

// 4:05 / 1:12:30
function reloj(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
// desde cuándo corre el reloj: desde que pagó (si no pagó, desde que se pidió)
const inicioReloj = (c) => new Date(c.cobrada_at || c.created_at).getTime();
const colorReloj = (min) => (min >= 15 ? 'rojo' : min >= 8 ? 'ambar' : 'verde');

let seq = 1;
const clave = () => `e${Date.now()}-${seq++}`;
// montos con los que suelen pagar (redondeos para arriba del total)
const billetes = (t) => [...new Set([1000, 5000, 10000, 20000].map((b) => Math.ceil((t + 1) / b) * b))].filter((b) => b > t).slice(0, 4);
// colores por rubro para encontrar rápido los botones
const COLORES = ['#e2261c', '#ffb703', '#2f5fb3', '#17944b', '#8e44ad', '#e67e22', '#16a085'];

export default function EventoPOS() {
  const { id } = useParams();
  const router = useRouter();
  const { avisar, config } = useApp();
  const [evento, setEvento] = useState(null);
  const [productos, setProductos] = useState([]);
  const [articulos, setArticulos] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [comandas, setComandas] = useState(null);
  const [movs, setMovs] = useState([]);
  const [tab, setTab] = useState('pedir');

  // ---- pedido en curso
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState('');
  const [nota, setNota] = useState('');
  const [verNota, setVerNota] = useState(false);
  const [cobro, setCobro] = useState(null); // { forma, pagaCon, efectivo }
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(null); // pedido recién guardado (cartel grande)
  const [hojaMitad, setHojaMitad] = useState(false);
  const [mitadA, setMitadA] = useState(null);
  const nombreRef = useRef(null);

  // ---- pedidos / resumen
  const [filtro, setFiltro] = useState('cocina');
  const [sel, setSel] = useState(null);
  const [cobrarSel, setCobrarSel] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [hojaGasto, setHojaGasto] = useState(false);
  const [gasto, setGasto] = useState({});
  const [hojaProds, setHojaProds] = useState(false);
  const [prodsEdit, setProdsEdit] = useState({});
  const [texto, setTexto] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  const [imprimir, setImprimir] = useState(null); // pedido a imprimir

  // el reloj de los pedidos avanza cada segundo
  useEffect(() => {
    if (tab !== 'pedidos') return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [tab]);

  // imprimir: arma el ticket y abre la impresión del celular (AirPrint / guardar PDF)
  useEffect(() => {
    if (!imprimir) return;
    const fin = () => setImprimir(null);
    window.addEventListener('afterprint', fin);
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fin); };
  }, [imprimir]);

  const cargarPedidos = useCallback(async () => {
    const [{ data: cs }, { data: ms }, { data: ev }] = await Promise.all([
      supabase.from('comandas').select('*, comanda_items(*)').eq('evento_id', id).order('id'),
      supabase.from('movimientos').select('*').eq('evento_id', id).is('comanda_id', null).order('id'),
      supabase.from('eventos').select('*').eq('id', id).maybeSingle(),
    ]);
    setComandas(cs || []);
    setMovs(ms || []);
    if (ev) setEvento(ev);
  }, [id]);

  const cargarTodo = useCallback(async () => {
    try {
      const [{ data: ev, error }, { data: ps }, { data: a }, { data: r }] = await Promise.all([
        supabase.from('eventos').select('*').eq('id', id).maybeSingle(),
        supabase.from('evento_productos').select('*').eq('evento_id', id).order('orden'),
        supabase.from('articulos').select('id, nombre, precio, rubro_id, permite_mitad, orden, activo, controla_stock, stock').order('orden').order('nombre'),
        supabase.from('rubros').select('*').order('orden'),
      ]);
      if (error) throw new Error(error.message);
      if (!ev) { setEvento(false); return; }
      setEvento(ev);
      setProductos(ps || []);
      setArticulos(a || []);
      setRubros(r || []);
      if (!ev.abierto) setTab((t) => (t === 'pedir' ? 'resumen' : t));
      await cargarPedidos();
    } catch (e) { avisar(e.message, 'error'); }
  }, [id, avisar, cargarPedidos]);

  useEffect(() => {
    cargarTodo();
    const canal = supabase.channel(`evento-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas', filter: `evento_id=eq.${id}` }, () => cargarPedidos())
      .subscribe();
    const t = setInterval(cargarPedidos, 30000);
    const alVolver = () => document.visibilityState === 'visible' && cargarPedidos();
    document.addEventListener('visibilitychange', alVolver);
    return () => { supabase.removeChannel(canal); clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [id, cargarTodo, cargarPedidos]);

  // productos del evento con los datos del artículo
  const menu = useMemo(() => {
    const am = Object.fromEntries(articulos.map((a) => [a.id, a]));
    const ro = Object.fromEntries(rubros.map((r, i) => [r.id, i]));
    return productos.filter((p) => am[p.articulo_id]).map((p) => ({ ...am[p.articulo_id], precio_ev: Number(p.precio), llevado: p.llevado, color: COLORES[(ro[am[p.articulo_id].rubro_id] ?? 6) % COLORES.length], ordenRubro: ro[am[p.articulo_id].rubro_id] ?? 99 }))
      .sort((x, y) => x.ordenRubro - y.ordenRubro || (x.orden || 0) - (y.orden || 0));
  }, [productos, articulos, rubros]);
  const mitades = menu.filter((m) => m.permite_mitad);

  const r = useMemo(() => (comandas && evento ? resumenEvento({ evento, productos, comandas, movs, articulos }) : null), [evento, productos, comandas, movs, articulos]);

  // ---------- armar pedido ----------
  const total = items.reduce((a, i) => a + i.cantidad * i.precio_unit, 0);
  const cantDe = (aid) => items.filter((i) => i.articulo_id === aid && !i.es_mitad).reduce((a, i) => a + i.cantidad, 0);

  function sumar(p) {
    setItems((its) => {
      const ya = its.find((i) => i.articulo_id === p.id && !i.es_mitad);
      if (ya) return its.map((i) => (i === ya ? { ...i, cantidad: i.cantidad + 1 } : i));
      return [...its, { key: clave(), articulo_id: p.id, articulo2_id: null, es_mitad: false, descripcion: p.nombre, rubro_id: p.rubro_id, cantidad: 1, precio_unit: p.precio_ev }];
    });
    if (navigator.vibrate) navigator.vibrate(15);
  }
  function elegirMitad(p) {
    if (!mitadA) { setMitadA(p); return; }
    const a = mitadA;
    setItems((its) => [...its, { key: clave(), articulo_id: a.id, articulo2_id: p.id, es_mitad: true, descripcion: `½ ${a.nombre} + ½ ${p.nombre}`, rubro_id: a.rubro_id, cantidad: 1, precio_unit: Math.round(a.precio_ev / 2 + p.precio_ev / 2) }]);
    setMitadA(null);
    setHojaMitad(false);
  }
  const cambiarCant = (key, d) => setItems((its) => its.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + d } : i)).filter((i) => i.cantidad > 0));
  const vaciar = () => { setItems([]); setNombre(''); setNota(''); setVerNota(false); };

  async function guardar(cobrar) {
    if (!items.length || guardando) return;
    setGuardando(true);
    try {
      const forma = cobro?.forma || 'efectivo';
      const cid = await rpc('guardar_comanda_evento', {
        p: {
          evento_id: Number(id), cliente_nombre: nombre.trim(), notas: nota.trim(), cobrar,
          forma_pago: forma, monto_efectivo: forma === 'mixto' ? num(cobro.efectivo) : null,
          paga_con: forma === 'efectivo' && num(cobro?.pagaCon) > 0 ? num(cobro.pagaCon) : null,
          items: items.map(({ key, ...i }) => i),
        },
      });
      const { data: c } = await supabase.from('comandas').select('numero').eq('id', cid).maybeSingle();
      const vuelto = forma === 'efectivo' && num(cobro?.pagaCon) > total ? num(cobro.pagaCon) - total : 0;
      setListo({
        numero: c?.numero, nombre: nombre.trim(), total, cobrado: cobrar, forma, vuelto,
        ticket: { numero: c?.numero, cliente_nombre: nombre.trim(), notas: nota.trim(), total, forma_pago: forma, estado: cobrar ? 'cobrada' : 'abierta', created_at: new Date().toISOString(),
          monto_efectivo: forma === 'mixto' ? num(cobro.efectivo) : null, comanda_items: items.map((i) => ({ ...i, id: i.key, subtotal: i.cantidad * i.precio_unit })) },
      });
      setCobro(null);
      vaciar();
      cargarPedidos();
    } catch (e) { avisar(e.message, 'error'); }
    setGuardando(false);
  }

  // ---------- pedidos ----------
  async function cambiarEstado(c, estado) {
    setComandas((cs) => cs.map((x) => (x.id === c.id ? { ...x, estado_entrega: estado } : x)));
    const entregada_at = estado === 'entregada' ? new Date().toISOString() : null;
    setComandas((cs) => cs.map((x) => (x.id === c.id ? { ...x, entregada_at } : x)));
    const { error } = await supabase.from('comandas').update({ estado_entrega: estado, entregada_at }).eq('id', c.id);
    if (error) { avisar(error.message, 'error'); cargarPedidos(); }
    setSel(null);
  }
  async function cobrarPendiente() {
    try {
      await rpc('cobrar_comanda_evento', { p_id: cobrarSel.c.id, p_forma: cobrarSel.forma, p_efectivo: cobrarSel.forma === 'mixto' ? num(cobrarSel.efectivo) : null });
      avisar(`Pedido #${cobrarSel.c.numero} cobrado ✔`);
      setCobrarSel(null); setSel(null);
      cargarPedidos();
    } catch (e) { avisar(e.message, 'error'); }
  }
  function anular(c) {
    setConfirmar({
      titulo: `¿Anular el pedido #${c.numero}?`, mensaje: c.estado === 'cobrada' ? `Se descuenta ${money(c.total)} de la caja (${nombreCuenta(c.forma_pago)}).` : 'No estaba cobrado: no toca la caja.',
      pedirTexto: 'Motivo (opcional)', boton: 'Anular', peligro: true,
      onOk: async (motivo) => {
        try { await rpc('anular_comanda', { p_id: c.id, p_motivo: motivo || null }); avisar('Pedido anulado'); setSel(null); cargarPedidos(); } catch (e) { avisar(e.message, 'error'); }
      },
    });
  }

  // ---------- resumen ----------
  async function guardarGasto() {
    try {
      await rpc('registrar_movimiento_evento', { p_evento: Number(id), p_tipo: 'egreso', p_cuenta: gasto.cuenta, p_monto: num(gasto.monto), p_concepto: gasto.concepto || 'Otros gastos', p_detalle: gasto.detalle });
      avisar('Gasto del evento registrado ✔');
      setHojaGasto(false);
      cargarPedidos();
    } catch (e) { avisar(e.message, 'error'); }
  }
  function abrirProds() {
    const v = {};
    productos.forEach((p) => { v[p.articulo_id] = { precio: String(Number(p.precio)), llevado: p.llevado === null ? '' : String(Number(p.llevado)) }; });
    setProdsEdit(v);
    setHojaProds(true);
  }
  async function guardarProds() {
    try {
      const activos = articulos.filter((a) => a.activo);
      await rpc('guardar_productos_evento', { p_evento: Number(id), p_productos: productosParaGuardar(prodsEdit, activos) });
      const { data } = await supabase.from('evento_productos').select('*').eq('evento_id', id).order('orden');
      setProductos(data || []);
      setHojaProds(false);
      avisar('Productos actualizados ✔');
    } catch (e) { avisar(e.message, 'error'); }
  }
  function cerrar() {
    setConfirmar({
      titulo: '¿Cerrar el evento?',
      mensaje: r?.sinCobrar.length ? `Ojo: quedan ${r.sinCobrar.length} pedidos sin cobrar (${money(r.pendiente)}). Se pueden cobrar igual después desde acá.` : 'Ya no se pueden cargar pedidos. Se puede reabrir si hace falta.',
      boton: '🔒 Cerrar evento', peligro: true,
      onOk: async () => {
        try { await rpc('cerrar_evento', { p_id: Number(id) }); avisar('Evento cerrado ✔'); setTab('resumen'); await cargarPedidos(); setTexto(textoEvento({ ...evento, abierto: false, cerrado_at: new Date().toISOString() }, r)); } catch (e) { avisar(e.message, 'error'); }
      },
    });
  }
  async function reabrir() {
    try { await rpc('reabrir_evento', { p_id: Number(id) }); avisar('Evento reabierto'); await cargarPedidos(); setTab('pedir'); } catch (e) { avisar(e.message, 'error'); }
  }
  function eliminar() {
    const conPedidos = comandas.length > 0;
    setConfirmar({
      titulo: '🗑 ¿Borrar este evento?',
      mensaje: conPedidos
        ? `Se borran el evento, sus ${comandas.length} pedidos y sus gastos. La plata que entró a la caja por este evento (${money(r.cobrado - r.gastos)}) se saca, y el stock vuelve. Usalo para borrar pruebas. Para confirmar escribí BORRAR.`
        : 'No tiene pedidos. Se borra el evento y su lista de productos.',
      pedirTexto: conPedidos ? 'Escribí BORRAR' : null, boton: 'Borrar evento', peligro: true,
      onOk: async (txt) => {
        if (conPedidos && String(txt || '').trim().toUpperCase() !== 'BORRAR') { avisar('Escribí BORRAR para confirmar', 'error'); return; }
        try { await rpc('eliminar_evento', { p_id: Number(id), p_con_pedidos: conPedidos }); avisar('Evento borrado ✔'); router.replace('/eventos'); } catch (e) { avisar(e.message, 'error'); }
      },
    });
  }

  if (evento === false) return <Vacio texto="No se encontró el evento" />;
  if (!evento || !comandas || !r) return <Cargando />;

  const abierto = evento.abierto;
  const enCocina = r.validas.filter((c) => c.estado_entrega !== 'entregada');
  const listas = (comandas || []).filter((c) => {
    if (filtro === 'cocina') return c.estado !== 'anulada' && c.estado_entrega !== 'entregada';
    if (filtro === 'entregados') return c.estado !== 'anulada' && c.estado_entrega === 'entregada';
    if (filtro === 'sincobrar') return c.estado === 'abierta';
    if (filtro === 'anulados') return c.estado === 'anulada';
    return true;
  });
  const ordenadas = filtro === 'cocina' ? listas : [...listas].reverse();
  const vueltoCobro = cobro?.forma === 'efectivo' && num(cobro.pagaCon) > total ? num(cobro.pagaCon) - total : 0;

  return (
    <div className="pos">
      {/* CABECERA (queda fija arriba) */}
      <div className="pos-fija">
      <div className="pos-cab">
        <button className="ibtn" onClick={() => router.push('/eventos')} aria-label="Volver">←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pos-nom">🎪 {evento.nombre}</div>
          <div className="pos-sub">{abierto ? <><span className="punto-vivo" /> En curso · {duracion(r.minutos)}</> : 'Cerrado'} · {r.n} pedidos</div>
        </div>
        <div className="pos-vendido">{money(r.vendido)}</div>
      </div>
      <div className="pos-tabs">
        {abierto && <button className={tab === 'pedir' ? 'activo' : ''} onClick={() => setTab('pedir')}>🧾 Pedir</button>}
        <button className={tab === 'pedidos' ? 'activo' : ''} onClick={() => setTab('pedidos')}>👨‍🍳 Pedidos{enCocina.length ? <span className="pos-badge">{enCocina.length}</span> : null}</button>
        <button className={tab === 'resumen' ? 'activo' : ''} onClick={() => setTab('resumen')}>📊 Resumen</button>
      </div>
      </div>

      {/* ===================== TOMAR PEDIDO ===================== */}
      {tab === 'pedir' && abierto && (
        <>
          {menu.length === 0 ? <Vacio texto="El evento no tiene productos. Agregalos en “Resumen” → Productos y precios." /> : (
            <div className="pos-grid">
              {menu.map((p) => {
                const q = cantDe(p.id);
                return (
                  <button key={p.id} className={`pos-prod${q ? ' en-pedido' : ''}`} style={{ '--c': p.color }} onClick={() => sumar(p)}>
                    <span className="pp-nom">{p.nombre}</span>
                    <span className="pp-pre">{money(p.precio_ev)}</span>
                    {q > 0 && <span className="prod-cant">{cant(q)}</span>}
                  </button>
                );
              })}
              {mitades.length >= 2 && (
                <button className="pos-prod mitad" onClick={() => { setMitadA(null); setHojaMitad(true); }}>
                  <span className="pp-nom">½ y ½</span><span className="pp-pre">Mitad y mitad</span>
                </button>
              )}
            </div>
          )}

          <div className="tarjeta pos-pedido">
            <div className="sp-cab" style={{ marginBottom: items.length ? 4 : 0 }}>
              <b>{items.length ? 'Pedido' : 'Tocá los productos para armar el pedido'}</b>
              {items.length > 0 && <button className="btn borde chico" onClick={vaciar}>Vaciar</button>}
            </div>
            {items.map((i) => (
              <div key={i.key} className="carrito-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{i.descripcion}</div>
                  <div className="suave chico-t">{money(i.precio_unit)} c/u</div>
                </div>
                <div className="stepper">
                  <button onClick={() => cambiarCant(i.key, -1)}>−</button><span>{cant(i.cantidad)}</span><button onClick={() => cambiarCant(i.key, 1)}>+</button>
                </div>
                <div className="mono" style={{ fontWeight: 800, minWidth: 74, textAlign: 'right' }}>{money(i.cantidad * i.precio_unit)}</div>
              </div>
            ))}
            <div className="pos-nombre">
              <input ref={nombreRef} placeholder="👤 Nombre (para llamarlo)" value={nombre} onChange={(e) => setNombre(e.target.value)} enterKeyHint="done" autoCapitalize="words" />
              <button className={`ibtn${verNota || nota ? ' activo' : ''}`} onClick={() => setVerNota((v) => !v)} aria-label="Nota">📝</button>
            </div>
            {(verNota || nota) && <input style={{ marginTop: 8 }} placeholder="Nota: sin aceitunas, bien cocida…" value={nota} onChange={(e) => setNota(e.target.value)} />}
          </div>
          <div className="espacio-barra" />

          <div className="barra-total">
            <div className="barra-total-in">
              <div className="bt-fila">
                <span className="suave" style={{ fontWeight: 700 }}>{items.length ? `${cant(items.reduce((a, i) => a + i.cantidad, 0))} productos` : 'Sin productos'}</span>
                <span className="bt-total">{money(total)}</span>
              </div>
              <div className="grid2">
                <button className="btn verde grande" disabled={!items.length} onClick={() => setCobro({ forma: 'efectivo', pagaCon: '', efectivo: '' })}>💵 Efectivo</button>
                <button className="btn azul grande" style={{ whiteSpace: 'nowrap', fontSize: 16 }} disabled={!items.length} onClick={() => setCobro({ forma: 'mercadopago', pagaCon: '', efectivo: '' })}>📱 Mercado Pago</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===================== PEDIDOS ===================== */}
      {tab === 'pedidos' && (
        <>
          <div className="chips desliza" style={{ marginBottom: 10 }}>
            {[['cocina', `En marcha (${enCocina.length})`], ['entregados', 'Entregados'], ['sincobrar', `Sin cobrar (${r.sinCobrar.length})`], ['anulados', 'Anulados'], ['todos', 'Todos']].map(([k, t]) => (
              <button key={k} className={filtro === k ? 'chip activo' : 'chip'} onClick={() => setFiltro(k)}>{t}</button>
            ))}
          </div>
          {ordenadas.length === 0 ? <Vacio emoji="🙌" texto={filtro === 'cocina' ? 'No hay pedidos pendientes' : 'No hay pedidos acá'} /> : (
            <div className="pos-cola">
              {ordenadas.map((c) => {
                const e = ESTADOS_EVENTO[c.estado_entrega] || ESTADOS_EVENTO.preparando;
                const corriendo = c.estado !== 'anulada' && c.estado_entrega !== 'entregada';
                const ms = corriendo ? ahora - inicioReloj(c) : (c.entregada_at ? new Date(c.entregada_at).getTime() - inicioReloj(c) : null);
                return (
                  <div key={c.id} className={`pos-ticket ${c.estado} ${c.estado_entrega}`}>
                    <div className="pt-top" onClick={() => setSel(c)}>
                      <span className="pt-num">#{c.numero}</span>
                      <span className="pt-nom">{c.cliente_nombre || 'Sin nombre'}</span>
                      <span className="suave chico-t">{hora(c.created_at)}</span>
                    </div>
                    {ms !== null && (
                      <div className={`pt-reloj ${corriendo ? colorReloj(ms / 60000) : 'fin'}`}>
                        ⏱ <b>{reloj(ms)}</b> {corriendo ? (c.cobrada_at ? 'desde que pagó' : 'desde que pidió (sin pagar)') : 'tardó en entregarse'}
                      </div>
                    )}
                    <div className="pt-items" onClick={() => setSel(c)}>
                      {(c.comanda_items || []).map((i) => <div key={i.id}><b>{cant(i.cantidad)}</b> {i.descripcion}</div>)}
                      {c.notas && <div className="pt-nota">📝 {c.notas}</div>}
                    </div>
                    <div className="cc-pie">
                      {c.estado === 'anulada' ? <span className="badge b-gris">Anulado</span> : <span className={`badge ${e.c}`}>{e.t}</span>}
                      {c.estado === 'abierta' ? <span className="badge b-rojo">⏳ Sin cobrar {money(c.total)}</span>
                        : c.estado === 'cobrada' ? <span className="badge b-gris">{iconoCuenta(c.forma_pago)} {money(c.total)}</span> : null}
                    </div>
                    {c.estado !== 'anulada' && (
                      <div className="pt-acciones">
                        {c.estado === 'abierta' && <button className="btn amarillo" onClick={() => setCobrarSel({ c, forma: 'efectivo', efectivo: '' })}>💰 Cobrar</button>}
                        {c.estado_entrega === 'preparando' && <button className="btn azul" onClick={() => cambiarEstado(c, 'lista')}>🔔 Listo</button>}
                        {c.estado_entrega === 'lista' && <button className="btn verde" onClick={() => cambiarEstado(c, 'entregada')}>🤝 Entregado</button>}
                        <button className="btn borde pt-print" onClick={() => setImprimir(c)} aria-label="Imprimir">🖨</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===================== CÓMO VAMOS ===================== */}
      {tab === 'resumen' && (
        <>
          <div className="kpis">
            <div className="kpi destacado"><div className="k-label">Vendido</div><div className="k-valor">{money(r.vendido)}</div><div className="k-sub">{r.n} pedidos · {cant(r.unidades)} productos</div></div>
            <div className="kpi"><div className="k-label">Ticket promedio</div><div className="k-valor">{money(r.ticket)}</div><div className="k-sub">{r.porHora ? `${money(r.porHora)} por hora` : duracion(r.minutos)}</div></div>
            <div className="kpi"><div className="k-label">💵 Efectivo</div><div className="k-valor verde-t">{money(r.efectivo)}</div></div>
            <div className="kpi"><div className="k-label">📱 Mercado Pago</div><div className="k-valor azul-t">{money(r.mercadopago)}</div></div>
          </div>
          {(() => {
            const ts = r.validas.filter((c) => c.entregada_at).map((c) => new Date(c.entregada_at).getTime() - inicioReloj(c)).filter((x) => x > 0);
            if (!ts.length) return null;
            const prom = ts.reduce((a, x) => a + x, 0) / ts.length;
            return <div className={`aviso ${prom / 60000 >= 15 ? 'rojo' : prom / 60000 >= 8 ? '' : 'verde'}`}>⏱ Demora promedio desde que pagan hasta que se entrega: <b>{reloj(prom)}</b> ({ts.length} pedidos) · la más larga {reloj(Math.max(...ts))}</div>;
          })()}
          {r.sinCobrar.length > 0 && <div className="aviso clic" onClick={() => { setFiltro('sincobrar'); setTab('pedidos'); }}>⏳ {r.sinCobrar.length} pedidos sin cobrar: {money(r.pendiente)} — tocá para cobrarlos</div>}

          <div className="tarjeta">
            <h2>💸 Gastos del evento</h2>
            {r.gastosLista.length === 0 ? <p className="suave chico-t" style={{ margin: '0 0 10px' }}>Stand, hielo, nafta, ayudante… cargalos acá: salen de la caja y quedan en el resultado del evento.</p>
              : r.gastosLista.map((m) => <div key={m.id} className="resumen-linea"><span>{m.concepto}<span className="suave chico-t"> {String(m.detalle || '').replace(/ ?·? ?🎪.*$/, '')}</span></span><b className="mono rojo-t">−{money(m.monto)}</b></div>)}
            <button className="btn borde chico bloque" style={{ marginTop: 8 }} onClick={() => { setGasto({ monto: '', cuenta: 'efectivo', concepto: config?.conceptos_egreso?.[0] || 'Otros gastos', detalle: '' }); setHojaGasto(true); }}>− Cargar gasto del evento</button>
            <div className="resumen-linea total"><span>Resultado</span><span className={`mono ${r.resultado >= 0 ? 'verde-t' : 'rojo-t'}`}>{money(r.resultado)}</span></div>
            <div className="suave chico-t">Vendido − gastos del evento (sin contar materia prima).</div>
          </div>

          <div className="tarjeta">
            <h2>🍕 Productos</h2>
            <div className="tabla-ev">
              <div className="te-fila te-cab"><span>Producto</span><span>Vendido</span><span>Llevamos</span><span>Sobra</span></div>
              {r.productos.map((p) => (
                <div key={p.nombre} className="te-fila">
                  <span>{p.nombre}<small className="suave"> {money(p.total)}</small></span>
                  <b>{cant(p.vendido)}</b>
                  <span>{p.llevado === null ? '—' : cant(p.llevado)}</span>
                  <span className={p.llevado !== null && p.llevado - p.vendido <= 0 ? 'rojo-t' : ''}>{p.llevado === null ? '—' : p.llevado - p.vendido <= 0 ? 'Agotado' : cant(p.llevado - p.vendido)}</span>
                </div>
              ))}
            </div>
            <div className="suave chico-t" style={{ marginTop: 6 }}>Las mitad y mitad suman ½ a cada gusto.</div>
          </div>

          {r.franjas.length > 0 && (
            <div className="tarjeta">
              <h2>⏰ Picos de pedidos (cada 30 min)</h2>
              {(() => { const mx = Math.max(...r.franjas.map((f) => f.n)); return r.franjas.map((f) => <Barra key={f.nombre} texto={f.nombre} valor={f.n} max={mx} sub={`${f.n} pedidos · ${money(f.total)}`} />); })()}
            </div>
          )}

          <div className="grid2" style={{ marginBottom: 8 }}>
            <button className="btn borde" onClick={abrirProds}>✏️ Productos y precios</button>
            <button className="btn verde" onClick={() => setTexto(textoEvento(evento, r))}>📲 Resumen a mi socia</button>
          </div>
          {abierto
            ? <button className="btn primario bloque grande" onClick={cerrar}>🔒 Cerrar evento</button>
            : <button className="btn borde bloque" onClick={reabrir}>↺ Reabrir evento</button>}
          <button className="btn peligro bloque" style={{ marginTop: 8 }} onClick={eliminar}>🗑 Borrar evento{comandas.length ? ' (con sus pedidos)' : ''}</button>
          <p className="suave chico-t centro">Todo lo del evento ya está en la caja de hoy y en Informes (filtro “Eventos”).</p>
        </>
      )}

      {/* ---------- HOJAS ---------- */}
      <Hoja abierta={!!cobro} titulo={`Cobrar ${money(total)}`} onCerrar={() => setCobro(null)}
        pie={cobro && (
          <>
            <button className="btn verde bloque grande" disabled={guardando || (cobro.forma === 'mixto' && !num(cobro.efectivo))} onClick={() => guardar(true)}>
              ✅ Cobrado · confirmar pedido
            </button>
            <button className="btn borde bloque chico" style={{ marginTop: 8 }} disabled={guardando} onClick={() => guardar(false)}>Guardar sin cobrar (paga después)</button>
          </>
        )}>
        {cobro && (
          <>
            <Chips valor={cobro.forma} onCambio={(f) => setCobro({ ...cobro, forma: f })} opciones={[{ id: 'efectivo', label: '💵 Efectivo' }, { id: 'mercadopago', label: '📱 Mercado Pago' }, { id: 'mixto', label: '🔀 Mixto' }]} />
            {cobro.forma === 'efectivo' && (
              <>
                <div className="campo-label" style={{ marginTop: 14 }}>¿Con cuánto paga?</div>
                <div className="chips envuelve">
                  <button className={!cobro.pagaCon ? 'chip activo' : 'chip'} onClick={() => setCobro({ ...cobro, pagaCon: '' })}>Justo</button>
                  {billetes(total).map((b) => (
                    <button key={b} className={num(cobro.pagaCon) === b ? 'chip activo' : 'chip'} onClick={() => setCobro({ ...cobro, pagaCon: String(b) })}>{money(b)}</button>
                  ))}
                </div>
                <input style={{ marginTop: 8 }} inputMode="numeric" placeholder="Otro monto" value={cobro.pagaCon} onChange={(e) => setCobro({ ...cobro, pagaCon: e.target.value })} />
                {vueltoCobro > 0 && <div className="pos-vuelto">Vuelto: <b>{money(vueltoCobro)}</b></div>}
              </>
            )}
            {cobro.forma === 'mercadopago' && (
              <div className="pos-vuelto azul">
                {config?.alias_pago ? <>Alias: <b>{config.alias_pago}</b>{config?.titular_pago ? <small>a nombre de {config.titular_pago}</small> : null}</> : 'Confirmá que te llegó el pago de Mercado Pago.'}
              </div>
            )}
            {cobro.forma === 'mixto' && (
              <div style={{ marginTop: 14 }}>
                <Campo label="¿Cuánto paga en efectivo?" ayuda={num(cobro.efectivo) ? `El resto, ${money(Math.max(total - num(cobro.efectivo), 0))}, por Mercado Pago` : ''}>
                  <input inputMode="numeric" value={cobro.efectivo} onChange={(e) => setCobro({ ...cobro, efectivo: e.target.value })} autoFocus />
                </Campo>
              </div>
            )}
            <div className="resumen-linea chico-t" style={{ marginTop: 12 }}><span>{nombre.trim() ? `👤 ${nombre.trim()}` : '👤 Sin nombre (se llama por número)'}</span><span>{items.length} ítems</span></div>
          </>
        )}
      </Hoja>

      <Hoja abierta={hojaMitad} titulo={mitadA ? `½ ${mitadA.nombre} + ½ …` : 'Elegí la primera mitad'} onCerrar={() => { setHojaMitad(false); setMitadA(null); }}>
        <div className="pos-grid" style={{ marginTop: 0 }}>
          {mitades.map((p) => (
            <button key={p.id} className={`pos-prod${mitadA?.id === p.id ? ' en-pedido' : ''}`} style={{ '--c': p.color }} onClick={() => elegirMitad(p)}>
              <span className="pp-nom">{p.nombre}</span><span className="pp-pre">{money(p.precio_ev)}</span>
            </button>
          ))}
        </div>
      </Hoja>

      <Hoja abierta={!!sel} titulo={sel ? `Pedido #${sel.numero}${sel.cliente_nombre ? ' · ' + sel.cliente_nombre : ''}` : ''} onCerrar={() => setSel(null)}>
        {sel && (
          <>
            {(sel.comanda_items || []).map((i) => <div key={i.id} className="resumen-linea"><span>{cant(i.cantidad)} × {i.descripcion}</span><span className="mono">{money(i.subtotal)}</span></div>)}
            <div className="resumen-linea total"><span>Total</span><span className="mono">{money(sel.total)}</span></div>
            {sel.notas && <div className="aviso">📝 {sel.notas}</div>}
            <div className="resumen-linea chico-t"><span>Pago</span><span>{sel.estado === 'cobrada' ? `${iconoCuenta(sel.forma_pago)} ${nombreCuenta(sel.forma_pago)}${sel.forma_pago === 'mixto' ? ` (${money(partesPago(sel).efectivo)} ef.)` : ''}` : sel.estado === 'anulada' ? 'Anulado' : '⏳ Sin cobrar'}</span></div>
            <div className="resumen-linea chico-t"><span>Hora</span><span>{hora(sel.created_at)}</span></div>
            <button className="btn borde bloque" style={{ marginTop: 12 }} onClick={() => setImprimir(sel)}>🖨 Imprimir comanda</button>
            {sel.estado !== 'anulada' && (
              <div className="fila-btns" style={{ marginTop: 12 }}>
                {sel.estado_entrega !== 'preparando' && <button className="btn borde" onClick={() => cambiarEstado(sel, 'preparando')}>↩ A preparación</button>}
                {sel.estado_entrega !== 'entregada' && <button className="btn verde" onClick={() => cambiarEstado(sel, 'entregada')}>🤝 Entregado</button>}
                {sel.estado === 'abierta' && <button className="btn amarillo" onClick={() => setCobrarSel({ c: sel, forma: 'efectivo', efectivo: '' })}>💰 Cobrar</button>}
                <button className="btn peligro" onClick={() => anular(sel)}>Anular</button>
              </div>
            )}
          </>
        )}
      </Hoja>

      <Hoja abierta={!!cobrarSel} titulo={cobrarSel ? `Cobrar #${cobrarSel.c.numero} · ${money(cobrarSel.c.total)}` : ''} onCerrar={() => setCobrarSel(null)}
        pie={<button className="btn verde bloque grande" onClick={cobrarPendiente}>✅ Cobrado</button>}>
        {cobrarSel && (
          <>
            <Chips valor={cobrarSel.forma} onCambio={(f) => setCobrarSel({ ...cobrarSel, forma: f })} opciones={[{ id: 'efectivo', label: '💵 Efectivo' }, { id: 'mercadopago', label: '📱 Mercado Pago' }, { id: 'mixto', label: '🔀 Mixto' }]} />
            {cobrarSel.forma === 'mixto' && <div style={{ marginTop: 12 }}><Campo label="¿Cuánto en efectivo?"><input inputMode="numeric" value={cobrarSel.efectivo} onChange={(e) => setCobrarSel({ ...cobrarSel, efectivo: e.target.value })} /></Campo></div>}
          </>
        )}
      </Hoja>

      <Hoja abierta={hojaGasto} titulo="Gasto del evento" onCerrar={() => setHojaGasto(false)}
        pie={<button className="btn primario bloque" disabled={!num(gasto.monto)} onClick={guardarGasto}>Guardar {num(gasto.monto) ? money(num(gasto.monto)) : ''}</button>}>
        <Campo label="Monto"><input inputMode="numeric" placeholder="$" value={gasto.monto || ''} onChange={(e) => setGasto({ ...gasto, monto: e.target.value })} autoFocus /></Campo>
        <div className="campo-label">Sale de</div>
        <Chips valor={gasto.cuenta} onCambio={(v) => setGasto({ ...gasto, cuenta: v })} opciones={CUENTAS.map((c) => ({ id: c.id, label: `${c.icono} ${c.nombre}` }))} />
        <div className="campo-label" style={{ marginTop: 12 }}>Concepto</div>
        <div className="chips envuelve">
          {(config?.conceptos_egreso || ['Otros gastos']).map((c) => <button key={c} className={gasto.concepto === c ? 'chip activo' : 'chip'} onClick={() => setGasto({ ...gasto, concepto: c })}>{c}</button>)}
        </div>
        <div style={{ marginTop: 12 }}><Campo label="Detalle"><input value={gasto.detalle || ''} onChange={(e) => setGasto({ ...gasto, detalle: e.target.value })} placeholder="Ej: alquiler del stand, hielo" /></Campo></div>
      </Hoja>

      <Hoja abierta={hojaProds} titulo="Productos del evento" onCerrar={() => setHojaProds(false)}
        pie={<button className="btn primario bloque" disabled={!Object.keys(prodsEdit).length} onClick={guardarProds}>Guardar {Object.keys(prodsEdit).length} productos</button>}>
        <SelectorProductos articulos={articulos.filter((a) => a.activo)} rubros={rubros} valor={prodsEdit} onCambio={setProdsEdit} />
        <p className="suave chico-t centro">Los pedidos ya cargados no cambian de precio.</p>
      </Hoja>

      <Hoja abierta={!!texto} titulo="Resumen del evento" onCerrar={() => setTexto(null)}
        pie={texto && (
          <div className="fila-btns">
            <button className="btn borde" onClick={async () => { try { await navigator.clipboard.writeText(texto); avisar('Copiado ✔'); } catch { avisar('No se pudo copiar', 'error'); } }}>📋 Copiar</button>
            <a className="btn verde" href={linkWhatsapp(config?.tel_socia || '', texto)} target="_blank" rel="noreferrer">📲 Mandar a mi socia</a>
          </div>
        )}>
        {texto && <pre className="previa-msj">{texto}</pre>}
      </Hoja>

      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />

      {/* TICKET (solo se ve al imprimir) */}
      {imprimir && (
        <div className="ticket-print">
          <div className="tk-neg">{config?.nombre_negocio || 'Tope de Pizza'}</div>
          <div className="tk-ev">{evento.nombre}</div>
          <div className="tk-num">#{imprimir.numero}</div>
          {imprimir.cliente_nombre && <div className="tk-nom">{imprimir.cliente_nombre}</div>}
          <div className="tk-lin" />
          {(imprimir.comanda_items || []).map((i) => (
            <div key={i.id} className="tk-it"><span><b>{cant(i.cantidad)}</b> {i.descripcion}</span><span>{money(i.subtotal)}</span></div>
          ))}
          {imprimir.notas && <div className="tk-nota">NOTA: {imprimir.notas}</div>}
          <div className="tk-lin" />
          <div className="tk-it tk-tot"><span>TOTAL</span><span>{money(imprimir.total)}</span></div>
          <div className="tk-pie">{imprimir.estado === 'cobrada' ? `PAGADO · ${nombreCuenta(imprimir.forma_pago)}` : 'SIN COBRAR'} · {hora(imprimir.created_at)}</div>
        </div>
      )}

      {/* CARTEL DE PEDIDO CONFIRMADO */}
      {listo && (
        <div className="pos-listo" onClick={() => { setListo(null); setTimeout(() => nombreRef.current?.focus(), 50); }}>
          <div className="pl-caja">
            <div className="pl-ok">✅</div>
            <div className="pl-num">#{listo.numero}</div>
            {listo.nombre && <div className="pl-nom">{listo.nombre}</div>}
            <div className="pl-det">{money(listo.total)} · {listo.cobrado ? `${iconoCuenta(listo.forma)} cobrado` : '⏳ sin cobrar'}</div>
            {listo.vuelto > 0 && <div className="pl-vuelto">Vuelto {money(listo.vuelto)}</div>}
            <button className="btn borde grande bloque" style={{ marginTop: 18 }} onClick={(e) => { e.stopPropagation(); setImprimir(listo.ticket); }}>🖨 Imprimir</button>
            <button className="btn primario grande bloque" style={{ marginTop: 10 }}>Siguiente pedido →</button>
          </div>
        </div>
      )}
    </div>
  );
}
