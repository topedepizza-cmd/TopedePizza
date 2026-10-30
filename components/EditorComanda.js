'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from './AppShell';
import { Hoja, Chips, Campo, Cargando, Confirmar } from './ui';
import { money, num, cant, CUENTAS, normalizar, cadeteDelDia, DIAS_LARGO, diaSemanaOperativo } from '@/lib/utils';
import { interpretarPedido } from '@/lib/voz';

let claveSeq = 1;
const nuevaClave = () => `k${Date.now()}-${claveSeq++}`;

function itemEntera(a, cantidad = 1) {
  return { key: nuevaClave(), articulo_id: a.id, articulo2_id: null, es_mitad: false, descripcion: a.nombre, rubro_id: a.rubro_id, cantidad, precio_unit: Number(a.precio) };
}
function itemMitad(a, b, cantidad = 1) {
  return {
    key: nuevaClave(), articulo_id: a.id, articulo2_id: b.id, es_mitad: true,
    descripcion: `½ ${a.nombre} + ½ ${b.nombre}`, rubro_id: a.rubro_id, cantidad,
    precio_unit: Math.round(Number(a.precio) / 2 + Number(b.precio) / 2),
  };
}

export default function EditorComanda({ comanda, itemsIniciales, clienteId }) {
  const { config, avisar } = useApp();
  const router = useRouter();
  const editando = !!comanda;

  const [articulos, setArticulos] = useState(null);
  const [rubros, setRubros] = useState([]);
  const [cadetes, setCadetes] = useState([]);
  const [rubroSel, setRubroSel] = useState('todos');

  const [cliente, setCliente] = useState({
    id: comanda?.cliente_id || null, nombre: comanda?.cliente_nombre || '', telefono: comanda?.cliente_telefono || '',
    direccion: comanda?.cliente_direccion || '', referencia: comanda?.cliente_referencia || '',
  });
  const [guardarCliente, setGuardarCliente] = useState(true);
  const [sugerencias, setSugerencias] = useState([]);
  const [todosClientes, setTodosClientes] = useState([]);
  const [ultimoPedido, setUltimoPedido] = useState(null);
  const [cantPedidos, setCantPedidos] = useState(0);

  const [items, setItems] = useState(() => (itemsIniciales || []).map((i) => ({ ...i, key: nuevaClave(), cantidad: Number(i.cantidad), precio_unit: Number(i.precio_unit) })));
  const [tipoEntrega, setTipoEntrega] = useState(comanda?.tipo_entrega || 'delivery');
  const [cadeteId, setCadeteId] = useState(comanda?.cadete_id || null);
  const [envio, setEnvio] = useState(comanda ? Number(comanda.envio) : null);
  const [envioOtro, setEnvioOtro] = useState(false);
  const [formaPago, setFormaPago] = useState(comanda?.forma_pago || 'efectivo');
  const [pagaCon, setPagaCon] = useState(comanda?.paga_con ? String(comanda.paga_con) : '');
  const [vuelto, setVuelto] = useState(comanda ? String(Number(comanda.vuelto) || '') : '');
  const [vueltoManual, setVueltoManual] = useState(!!comanda);
  const [descuento, setDescuento] = useState(comanda?.descuento ? String(comanda.descuento) : '');
  const [notas, setNotas] = useState(comanda?.notas || '');

  const [hojaMitad, setHojaMitad] = useState(false);
  const [mitadA, setMitadA] = useState(null);
  const [mitadB, setMitadB] = useState(null);
  const [itemEdit, setItemEdit] = useState(null);
  const [hojaVoz, setHojaVoz] = useState(false);
  const [textoVoz, setTextoVoz] = useState('');
  const [grabando, setGrabando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const textoRef = useRef(null);
  const recRef = useRef(null);
  const baseVozRef = useRef('');

  useEffect(() => {
    (async () => {
      const [{ data: a }, { data: r }, { data: c }, { data: cls }] = await Promise.all([
        supabase.from('articulos').select('*').eq('activo', true).order('orden').order('nombre'),
        supabase.from('rubros').select('*').eq('activo', true).order('orden'),
        supabase.from('cadetes').select('*').eq('activo', true).order('nombre'),
        supabase.from('clientes').select('*').order('nombre').limit(5000),
      ]);
      setArticulos(a || []);
      setRubros(r || []);
      setCadetes(c || []);
      setTodosClientes((cls || []).map((x) => ({ ...x, _txt: normalizar(`${x.nombre} ${x.telefono || ''} ${String(x.telefono || '').replace(/\D/g, '')} ${x.direccion || ''}`) })));
      if (!comanda && c?.length) setCadeteId((cadeteDelDia(c) || c[0]).id);
      if (!comanda && clienteId) {
        const { data: cl } = await supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle();
        if (cl) elegirCliente(cl);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comanda, clienteId]);

  useEffect(() => {
    if (envio === null && config && !comanda) {
      const sug = config.envios_sugeridos || [];
      setEnvio(sug.length ? Number(sug[0]) : 0);
    }
  }, [config, envio, comanda]);

  // ---- clientes
  // autocompletar: busca entre todos los clientes guardados mientras escribís
  function buscarCliente(texto) {
    setCliente((c) => ({ ...c, nombre: texto, id: null }));
    setUltimoPedido(null);
    const t = normalizar(texto);
    if (!t) { setSugerencias([]); return; }
    const palabras = t.split(' ');
    const lista = todosClientes
      .filter((x) => palabras.every((p) => x._txt.includes(p)))
      .sort((x, y) => (normalizar(y.nombre).startsWith(t) ? 1 : 0) - (normalizar(x.nombre).startsWith(t) ? 1 : 0))
      .slice(0, 6);
    setSugerencias(lista);
  }
  async function elegirCliente(c) {
    setCliente({ id: c.id, nombre: c.nombre || '', telefono: c.telefono || '', direccion: c.direccion || '', referencia: c.referencia || '' });
    setSugerencias([]);
    const { data } = await supabase.from('comandas').select('id, created_at, total, comanda_items(*)')
      .eq('cliente_id', c.id).neq('estado', 'anulada').order('id', { ascending: false }).limit(1);
    setUltimoPedido(data?.[0] || null);
    const { count } = await supabase.from('comandas').select('id', { count: 'exact', head: true }).eq('cliente_id', c.id).neq('estado', 'anulada');
    setCantPedidos(count || 0);
  }
  function repetirUltimo() {
    if (!ultimoPedido || !articulos) return;
    const nuevos = ultimoPedido.comanda_items.map((i) => {
      const a = articulos.find((x) => x.id === i.articulo_id);
      const b = articulos.find((x) => x.id === i.articulo2_id);
      if (i.es_mitad && a && b) return itemMitad(a, b, Number(i.cantidad));
      if (a) return itemEntera(a, Number(i.cantidad));
      return { ...i, key: nuevaClave(), cantidad: Number(i.cantidad), precio_unit: Number(i.precio_unit) };
    });
    setItems((it) => [...it, ...nuevos]);
    avisar('Último pedido agregado (con precios actuales)');
  }

  // ---- items
  function agregar(a, cantidad = 1) {
    setItems((it) => {
      const ya = it.find((x) => !x.es_mitad && x.articulo_id === a.id);
      if (ya) return it.map((x) => (x === ya ? { ...x, cantidad: x.cantidad + cantidad } : x));
      return [...it, itemEntera(a, cantidad)];
    });
  }
  function agregarMitad(a, b, cantidad = 1) {
    setItems((it) => {
      const ya = it.find((x) => x.es_mitad && ((x.articulo_id === a.id && x.articulo2_id === b.id) || (x.articulo_id === b.id && x.articulo2_id === a.id)));
      if (ya) return it.map((x) => (x === ya ? { ...x, cantidad: x.cantidad + cantidad } : x));
      return [...it, itemMitad(a, b, cantidad)];
    });
  }
  function cambiarCant(key, delta) {
    setItems((it) => it.map((x) => (x.key === key ? { ...x, cantidad: x.cantidad + delta } : x)).filter((x) => x.cantidad > 0));
  }
  const cantEnCarrito = (id) => items.filter((x) => !x.es_mitad && x.articulo_id === id).reduce((s, x) => s + x.cantidad, 0);

  // ---- totales
  const subtotal = items.reduce((s, x) => s + x.cantidad * x.precio_unit, 0);
  const envioReal = tipoEntrega === 'delivery' ? Number(envio) || 0 : 0;
  const total = Math.max(subtotal + envioReal - num(descuento), 0);

  useEffect(() => {
    if (vueltoManual) return;
    const pc = num(pagaCon);
    setVuelto(pc > total ? String(pc - total) : '');
  }, [pagaCon, total, vueltoManual]);

  // ---- voz
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  function empezarVoz() {
    if (!SR) {
      textoRef.current?.focus();
      avisar('Tocá el 🎤 del teclado del iPhone y dictá', 'ok');
      return;
    }
    try {
      const r = new SR();
      r.lang = 'es-AR';
      r.interimResults = true;
      r.continuous = true;
      baseVozRef.current = textoVoz ? textoVoz.trim() + ', ' : '';
      r.onresult = (e) => {
        let t = '';
        for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + ' ';
        setTextoVoz(baseVozRef.current + t.trim());
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          textoRef.current?.focus();
          avisar('Sin permiso de micrófono: usá el 🎤 del teclado', 'error');
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') avisar('Micrófono: ' + e.error, 'error');
      };
      r.onend = () => { setGrabando(false); recRef.current = null; };
      recRef.current = r;
      r.start();
      setGrabando(true);
    } catch (e) {
      textoRef.current?.focus();
      avisar('Usá el 🎤 del teclado del iPhone', 'error');
    }
  }
  function pararVoz() { recRef.current?.stop(); setGrabando(false); }
  function confirmarVoz() {
    interpretado.items.forEach((r) => (r.tipo === 'mitad' ? agregarMitad(r.a, r.b, r.cantidad) : agregar(r.a, r.cantidad)));
    avisar(`${interpretado.items.length} productos agregados`);
    setHojaVoz(false);
    setTextoVoz('');
    setInterpretado(null);
  }

  // ---- guardar
  function guardar(cobrar) {
    if (!items.length) { avisar('Agregá al menos un producto', 'error'); return; }
    if (tipoEntrega === 'delivery' && !cliente.direccion.trim()) {
      setConfirmar({ titulo: 'Falta la dirección', mensaje: 'Es delivery y no cargaste dirección. ¿Guardar igual?', boton: 'Guardar igual', onOk: () => guardarYa(cobrar) });
      return;
    }
    guardarYa(cobrar);
  }

  async function guardarYa(cobrar) {
    setGuardando(true);
    try {
      const p = {
        id: comanda?.id || null,
        cliente_id: cliente.id, cliente_nombre: cliente.nombre, cliente_telefono: cliente.telefono,
        cliente_direccion: cliente.direccion, cliente_referencia: cliente.referencia, guardar_cliente: guardarCliente,
        tipo_entrega: tipoEntrega, cadete_id: tipoEntrega === 'delivery' ? cadeteId : null, envio: envioReal,
        descuento: num(descuento), forma_pago: formaPago,
        paga_con: formaPago === 'efectivo' && num(pagaCon) ? num(pagaCon) : null,
        vuelto: formaPago === 'efectivo' && tipoEntrega === 'delivery' ? num(vuelto) : 0,
        notas, cobrar,
        items: items.map(({ key, ...x }) => x),
      };
      const id = await rpc('guardar_comanda', { p });
      avisar(cobrar ? 'Comanda guardada y cobrada ✔' : 'Comanda guardada ✔');
      router.replace(`/comanda/${id}?nueva=1`);
    } catch (e) {
      avisar(e.message, 'error');
      setGuardando(false);
    }
  }

  // el pedido se interpreta en vivo mientras se dicta o se pega
  const interpretado = useMemo(
    () => (textoVoz.trim() && articulos ? interpretarPedido(textoVoz, articulos) : null),
    [textoVoz, articulos]
  );
  const setInterpretado = () => {};

  const articulosVisibles = useMemo(() => (articulos || []).filter((a) => rubroSel === 'todos' || a.rubro_id === rubroSel), [articulos, rubroSel]);
  const paraMitad = (articulos || []).filter((a) => a.permite_mitad);
  const envios = (config?.envios_sugeridos || []).map(Number);

  if (!articulos) return <Cargando />;

  return (
    <>
      <header className="cabecera">
        <div className="cab-izq">
          <img className="cab-logo" src="/logo-chico.png" alt="" />
          <h1>{editando ? `Editar #${comanda.numero}` : 'Nueva comanda'}</h1>
        </div>
        <button className="btn borde chico" onClick={() => (items.length ? setConfirmar({ titulo: '¿Salir sin guardar?', mensaje: 'Se pierde lo que cargaste en esta comanda.', boton: 'Salir', peligro: true, onOk: () => router.push(editando ? `/comanda/${comanda.id}` : '/') }) : router.push('/'))}>✕ Salir</button>
      </header>

      {/* CLIENTE */}
      <div className="tarjeta">
        <h2>👤 Cliente</h2>
        <div style={{ position: 'relative' }}>
          <input placeholder="Nombre, teléfono o dirección…" value={cliente.nombre} onChange={(e) => buscarCliente(e.target.value)} autoComplete="off" />
          {sugerencias.length > 0 && (
            <div className="lista" style={{ position: 'absolute', left: 0, right: 0, top: 48, zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}>
              {sugerencias.map((s) => (
                <div key={s.id} className="item clic" onClick={() => elegirCliente(s)}>
                  <div className="item-cuerpo">
                    <div className="item-titulo">👤 {s.nombre}</div>
                    <div className="item-sub">{[s.direccion, s.telefono].filter(Boolean).join(' · ') || 'sin datos'}</div>
                  </div>
                  <span className="badge b-verde">Elegir</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {cliente.id && (() => {
          const n = (editando ? cantPedidos : cantPedidos + 1);
          const cada = Number(config?.premio_cada) || 10;
          return (
            <div style={{ margin: '8px 2px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="badge b-verde">✔ Cliente guardado</span>
              {n > 1 && <span className="badge b-ambar">⭐ Pedido N° {n}</span>}
              {n > 1 && n % cada === 0 && <span className="badge b-rojo">🎁 ¡Pedido N° {n}! Regalale algo</span>}
            </div>
          );
        })()}
        {ultimoPedido && (
          <button className="btn azul chico bloque" style={{ margin: '6px 0' }} onClick={repetirUltimo}>
            🔁 Repetir último pedido ({ultimoPedido.comanda_items.map((i) => `${cant(i.cantidad)} ${i.descripcion}`).join(', ')})
          </button>
        )}
        <div className="grid2" style={{ marginTop: 10 }}>
          <input placeholder="Teléfono" inputMode="tel" value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} />
          <input placeholder="Referencia (casa, timbre…)" value={cliente.referencia} onChange={(e) => setCliente({ ...cliente, referencia: e.target.value })} />
        </div>
        <input style={{ marginTop: 10 }} placeholder="Dirección" value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} />
        <label className="check">
          <input type="checkbox" checked={guardarCliente} onChange={(e) => setGuardarCliente(e.target.checked)} />
          {cliente.id ? 'Actualizar datos del cliente' : 'Guardar como cliente nuevo'}
        </label>
      </div>

      {/* PRODUCTOS */}
      <div className="tarjeta">
        <button className="dictar" style={{ marginBottom: 12 }} onClick={() => { setHojaVoz(true); setInterpretado(null); }}>
          <span className="dictar-ico">🎤</span>
          <span><b>Dictar o pegar el pedido</b><span>“dos muzza, media napo media bondiola y una docena de sfijas”</span></span>
        </button>
        <Chips
          valor={rubroSel}
          onCambio={setRubroSel}
          opciones={[{ id: 'todos', label: 'Todo' }, ...rubros.map((r) => ({ id: r.id, label: `${emojiRubro(r.nombre)} ${r.nombre}` }))]}
        />
        <div className="productos">
          {paraMitad.length > 1 && (rubroSel === 'todos' || paraMitad.some((a) => a.rubro_id === rubroSel)) && (
            <button className="prod mitad" onClick={() => { setMitadA(null); setMitadB(null); setHojaMitad(true); }}>
              <div className="prod-nom">½ y ½</div>
              <div className="prod-pre">Armar mitad y mitad</div>
            </button>
          )}
          {articulosVisibles.map((a) => {
            const n = cantEnCarrito(a.id);
            return (
              <button key={a.id} className={n > 0 ? 'prod en-pedido' : 'prod'} onClick={() => agregar(a)}>
                {n > 0 && <span className="prod-cant">{cant(n)}</span>}
                <div className="prod-nom">{a.nombre}</div>
                <div className="prod-pre">{money(a.precio)}</div>
                {a.controla_stock && <div className="stock-mini">Stock: {cant(a.stock)}</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* PEDIDO */}
      <div className="tarjeta">
        <h2>🧾 Pedido</h2>
        {items.length === 0 ? <div className="suave chico-t">Tocá productos de arriba o dictá el pedido.</div> : items.map((x) => (
          <div key={x.key} className="carrito-item">
            <div className="item-cuerpo" onClick={() => setItemEdit({ ...x, precioTxt: String(x.precio_unit) })}>
              <div className="item-titulo">{x.descripcion}</div>
              <div className="item-sub">{money(x.precio_unit)} c/u ✏️</div>
            </div>
            <div className="stepper">
              <button onClick={() => cambiarCant(x.key, -1)}>−</button>
              <span>{cant(x.cantidad)}</span>
              <button onClick={() => cambiarCant(x.key, 1)}>+</button>
            </div>
            <div className="item-der mono" style={{ minWidth: 72 }}>{money(x.cantidad * x.precio_unit)}</div>
          </div>
        ))}
      </div>

      {/* ENTREGA */}
      <div className="tarjeta">
        <h2>🛵 Entrega</h2>
        <Chips valor={tipoEntrega} onCambio={setTipoEntrega} opciones={[{ id: 'delivery', label: '🛵 Delivery' }, { id: 'retiro', label: '🏠 Retira en local' }]} />
        {tipoEntrega === 'delivery' && (
          <>
            <div className="campo-label" style={{ marginTop: 12 }}>Costo de envío</div>
            <div className="chips envuelve">
              {envios.map((v) => (
                <button key={v} className={!envioOtro && Number(envio) === v ? 'chip activo' : 'chip'} onClick={() => { setEnvio(v); setEnvioOtro(false); }}>{money(v)}</button>
              ))}
              <button className={!envioOtro && Number(envio) === 0 ? 'chip activo' : 'chip'} onClick={() => { setEnvio(0); setEnvioOtro(false); }}>Sin cargo</button>
              <button className={envioOtro ? 'chip activo' : 'chip'} onClick={() => setEnvioOtro(true)}>Otro</button>
            </div>
            {envioOtro && <input style={{ marginTop: 8 }} inputMode="numeric" placeholder="Monto del envío" value={envio || ''} onChange={(e) => setEnvio(num(e.target.value))} autoFocus />}
            {cadetes.length > 0 && (
              <>
                <div className="campo-label" style={{ marginTop: 12 }}>
                  Cadete {cadeteDelDia(cadetes) ? `· hoy ${DIAS_LARGO[diaSemanaOperativo()]} le toca a ${cadeteDelDia(cadetes).nombre}` : ''}
                </div>
                <Chips valor={cadeteId} onCambio={setCadeteId} opciones={cadetes.map((c) => ({ id: c.id, label: c.nombre }))} />
              </>
            )}
          </>
        )}
      </div>

      {/* PAGO */}
      <div className="tarjeta">
        <h2>💵 Pago</h2>
        <Chips valor={formaPago} onCambio={setFormaPago} opciones={CUENTAS.map((c) => ({ id: c.id, label: `${c.icono} ${c.nombre}` }))} />
        {formaPago === 'efectivo' && (
          <div className="grid2" style={{ marginTop: 12 }}>
            <Campo label="Paga con">
              <input inputMode="numeric" placeholder="$" value={pagaCon} onChange={(e) => { setPagaCon(e.target.value); setVueltoManual(false); }} />
            </Campo>
            {tipoEntrega === 'delivery' && (
              <Campo label="Vuelto al cadete">
                <input inputMode="numeric" placeholder="$0" value={vuelto} onChange={(e) => { setVuelto(e.target.value); setVueltoManual(true); }} />
              </Campo>
            )}
          </div>
        )}
        {formaPago === 'efectivo' && tipoEntrega === 'delivery' && num(vuelto) > 0 && (
          <div className="aviso">El cadete tiene que rendir {money(total + num(vuelto))} ({money(total)} + vuelto {money(num(vuelto))})</div>
        )}
        <div className="grid2">
          <Campo label="Descuento"><input inputMode="numeric" placeholder="$0" value={descuento} onChange={(e) => setDescuento(e.target.value)} /></Campo>
          <Campo label="Notas"><input placeholder="Sin cebolla, timbre 2…" value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
        </div>
        <div className="resumen-linea"><span>Subtotal</span><span className="mono">{money(subtotal)}</span></div>
        {envioReal > 0 && <div className="resumen-linea"><span>Envío</span><span className="mono">{money(envioReal)}</span></div>}
        {num(descuento) > 0 && <div className="resumen-linea"><span>Descuento</span><span className="mono">-{money(num(descuento))}</span></div>}
      </div>

      <div className="espacio-barra" />
      <div className="barra-total">
        <div className="barra-total-in">
          <div className="bt-fila">
            <span className="suave">{items.reduce((s, x) => s + x.cantidad, 0)} productos</span>
            <span className="bt-total">{money(total)}</span>
          </div>
          <div className="fila-btns">
            <button className="btn borde" disabled={guardando} onClick={() => guardar(false)}>⏳ Guardar sin cobrar</button>
            <button className="btn verde" disabled={guardando} onClick={() => guardar(true)}>✔ Guardar y cobrar</button>
          </div>
        </div>
      </div>

      {/* HOJA MITAD Y MITAD */}
      <Hoja abierta={hojaMitad} titulo="Mitad y mitad" onCerrar={() => setHojaMitad(false)}
        pie={
          <button className="btn primario bloque" disabled={!mitadA || !mitadB} onClick={() => { agregarMitad(mitadA, mitadB); setHojaMitad(false); avisar('Mitad y mitad agregada'); }}>
            {mitadA && mitadB ? `Agregar · ${money(Math.round(Number(mitadA.precio) / 2 + Number(mitadB.precio) / 2))}` : 'Elegí las dos mitades'}
          </button>
        }>
        <div className="campo-label">Primera mitad {mitadA && <b>· {mitadA.nombre}</b>}</div>
        <div className="chips envuelve" style={{ marginBottom: 14 }}>
          {paraMitad.map((a) => <button key={a.id} className={mitadA?.id === a.id ? 'chip activo' : 'chip'} onClick={() => setMitadA(a)}>{a.nombre}</button>)}
        </div>
        <div className="campo-label">Segunda mitad {mitadB && <b>· {mitadB.nombre}</b>}</div>
        <div className="chips envuelve">
          {paraMitad.map((a) => <button key={a.id} className={mitadB?.id === a.id ? 'chip activo' : 'chip'} onClick={() => setMitadB(a)}>{a.nombre}</button>)}
        </div>
        {mitadA && mitadB && (
          <div className="aviso verde" style={{ marginTop: 14 }}>
            ½ {mitadA.nombre} ({money(mitadA.precio / 2)}) + ½ {mitadB.nombre} ({money(mitadB.precio / 2)})
          </div>
        )}
      </Hoja>

      {/* HOJA EDITAR ITEM */}
      <Hoja abierta={!!itemEdit} titulo={itemEdit?.descripcion} onCerrar={() => setItemEdit(null)}
        pie={
          <div className="fila-btns">
            <button className="btn peligro" onClick={() => { setItems((it) => it.filter((x) => x.key !== itemEdit.key)); setItemEdit(null); }}>Quitar</button>
            <button className="btn primario" onClick={() => {
              setItems((it) => it.map((x) => (x.key === itemEdit.key ? { ...x, cantidad: Math.max(num(itemEdit.cantidad), 0.5), precio_unit: num(itemEdit.precioTxt) } : x)));
              setItemEdit(null);
            }}>Listo</button>
          </div>
        }>
        {itemEdit && (
          <div className="grid2">
            <Campo label="Cantidad"><input inputMode="decimal" value={itemEdit.cantidad} onChange={(e) => setItemEdit({ ...itemEdit, cantidad: e.target.value })} /></Campo>
            <Campo label="Precio unitario"><input inputMode="numeric" value={itemEdit.precioTxt} onChange={(e) => setItemEdit({ ...itemEdit, precioTxt: e.target.value })} /></Campo>
          </div>
        )}
      </Hoja>

      {/* HOJA VOZ */}
      <Hoja abierta={hojaVoz} titulo="Dictar o pegar pedido" onCerrar={() => { pararVoz(); setHojaVoz(false); }}
        pie={interpretado && interpretado.items.length > 0 ? (
          <button className="btn verde bloque grande" onClick={() => { pararVoz(); confirmarVoz(); }}>✔ Agregar {interpretado.items.length} {interpretado.items.length === 1 ? 'producto' : 'productos'} al pedido</button>
        ) : (
          <button className="btn primario bloque" disabled>{grabando ? 'Escuchando…' : 'Dictá o pegá el pedido'}</button>
        )}>
        <p className="suave chico-t" style={{ marginTop: 0 }} hidden={!!textoVoz}>
          Tocá 🎤 y decí por ejemplo: <i>“dos muzza, media napolitana media bondiola, una docena de sfijas y una pepsi”</i>. También podés <b>pegar el mensaje de WhatsApp</b> del cliente. Si el 🎤 rojo no anda, usá el 🎤 del teclado del iPhone.
        </p>
        <div className="voz">
          <textarea ref={textoRef} value={textoVoz} onChange={(e) => { setTextoVoz(e.target.value); setInterpretado(null); }} placeholder="Tocá 🎤 y hablá, o pegá el mensaje…" />
          <button className={grabando ? 'btn-mic grabando' : 'btn-mic'} onClick={() => (grabando ? pararVoz() : empezarVoz())}>{grabando ? '■' : '🎤'}</button>
        </div>
        {grabando && <div className="aviso" style={{ marginTop: 10 }}>🎙️ Escuchando… tocá ■ cuando termines</div>}
        {interpretado && (
          <div style={{ marginTop: 14 }}>
            {interpretado.items.length === 0 ? (grabando ? null : <div className="aviso rojo">No reconocí productos. Probá de nuevo o cargá alias en Codificación.</div>) : (
              <div className="lista">
                {interpretado.items.map((r, i) => (
                  <div className="item" key={i}>
                    <div className="item-cuerpo">
                      <div className="item-titulo">{cant(r.cantidad)} × {r.tipo === 'mitad' ? `½ ${r.a.nombre} + ½ ${r.b.nombre}` : r.a.nombre}</div>
                      {r.aviso && <div className="item-sub ambar-t">{r.aviso}</div>}
                    </div>
                    <div className="item-der">{money(r.cantidad * (r.tipo === 'mitad' ? Math.round(r.a.precio / 2 + r.b.precio / 2) : r.a.precio))}</div>
                  </div>
                ))}
              </div>
            )}
            {interpretado.noEntendido.length > 0 && <div className="suave chico-t">No entendí: {interpretado.noEntendido.join(', ')}</div>}
          </div>
        )}
      </Hoja>
      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />
    </>
  );
}

export function emojiRubro(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('pizza')) return '🍕';
  if (n.includes('sfij') || n.includes('empan')) return '🥟';
  if (n.includes('bebi') || n.includes('gaseo')) return '🥤';
  if (n.includes('congel')) return '🧊';
  if (n.includes('postre')) return '🍰';
  return '🍽️';
}
