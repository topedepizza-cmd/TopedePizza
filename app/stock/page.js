'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Chips, Campo, Cargando, Vacio, Confirmar } from '@/components/ui';
import { cant, num, money, fechaHora, linkWhatsapp, nivelStock } from '@/lib/utils';

// cuánto comprar/producir: llegar al doble del mínimo
function sugerido(stock, minimo, paso) {
  const p = Number(paso) || 1;
  const falta = Number(minimo) * 2 - Number(stock);
  return Math.max(Math.ceil(falta / p) * p, p);
}

export default function Stock() {
  const { avisar } = useApp();
  const [tab, setTab] = useState('insumos');
  const [congeladas, setCongeladas] = useState(null);
  const [insumos, setInsumos] = useState(null);
  const [sel, setSel] = useState(null);         // item elegido {tipo:'art'|'ins', ...}
  const [modo, setModo] = useState('ingreso');  // ingreso | consumo | ajuste
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [hojaProd, setHojaProd] = useState(false);
  const [prod, setProd] = useState({});
  const [editIns, setEditIns] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [compras, setCompras] = useState(null);
  const [minimoTxt, setMinimoTxt] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const cargar = useCallback(async () => {
    const [{ data: a }, { data: i }] = await Promise.all([
      supabase.from('articulos').select('*').eq('controla_stock', true).eq('activo', true).order('orden').order('nombre'),
      supabase.from('insumos').select('*').eq('activo', true).order('orden').order('nombre'),
    ]);
    setCongeladas(a || []);
    setInsumos(i || []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function mover(tipo, item, cantidad, motivo, notaTxt) {
    if (tipo === 'art') await rpc('mover_stock_articulo', { p_articulo: item.id, p_cantidad: cantidad, p_tipo: motivo, p_nota: notaTxt || null, p_comanda: null });
    else await rpc('mover_insumo', { p_insumo: item.id, p_cantidad: cantidad, p_tipo: motivo, p_nota: notaTxt || null });
  }

  async function rapido(tipo, item, delta) {
    const setter = tipo === 'art' ? setCongeladas : setInsumos;
    setter((l) => l.map((x) => (x.id === item.id ? { ...x, stock: Number(x.stock) + delta } : x)));
    try { await mover(tipo, item, delta, delta > 0 ? 'Ingreso rápido' : 'Baja rápida'); }
    catch (e) { avisar(e.message, 'error'); cargar(); }
  }

  async function guardarMinimo() {
    const v = num(minimoTxt);
    const { error } = sel.tipo === 'art'
      ? await supabase.from('articulos').update({ stock_minimo: v }).eq('id', sel.id)
      : await supabase.from('insumos').update({ minimo: v }).eq('id', sel.id);
    if (error) return avisar(error.message, 'error');
    avisar(`Mínimo de ${sel.nombre}: ${cant(v)} ✔`);
    setSel({ ...sel, minimo: v, stock_minimo: v });
    cargar();
  }

  async function confirmarMov() {
    const v = num(valor);
    let delta = modo === 'ingreso' ? v : modo === 'consumo' ? -v : v - Number(sel.stock);
    if (!delta) { setSel(null); return; }
    setTrabajando(true);
    try {
      const motivo = sel.tipo === 'art'
        ? { ingreso: 'Producción / ingreso', consumo: 'Baja', ajuste: 'Ajuste de inventario' }[modo]
        : { ingreso: 'Compra / ingreso', consumo: 'Consumo', ajuste: 'Ajuste de inventario' }[modo];
      await mover(sel.tipo, sel, delta, motivo, nota);
      avisar('Stock actualizado ✔');
      setSel(null);
      cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  async function confirmarProduccion() {
    setTrabajando(true);
    try {
      const filas = Object.entries(prod).filter(([, v]) => num(v) > 0);
      for (const [id, v] of filas) {
        await rpc('mover_insumo', { p_insumo: Number(id), p_cantidad: -num(v), p_tipo: 'Producción', p_nota: null });
      }
      avisar(`Producción registrada (${filas.length} insumos) ✔`);
      setHojaProd(false);
      setProd({});
      cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  async function guardarInsumo() {
    const d = { nombre: editIns.nombre.trim(), unidad: editIns.unidad || 'u', minimo: num(editIns.minimo), paso: num(editIns.paso) || 1, costo: num(editIns.costo) };
    if (!d.nombre) return avisar('Poné un nombre', 'error');
    const { error } = editIns.id
      ? await supabase.from('insumos').update(d).eq('id', editIns.id)
      : await supabase.from('insumos').insert({ ...d, stock: num(editIns.stock) });
    if (error) return avisar(error.message, 'error');
    avisar('Guardado ✔');
    setEditIns(null);
    cargar();
  }
  function borrarInsumo(ins) {
    setConfirmar({
      titulo: `¿Eliminar ${ins.nombre}?`, mensaje: 'Se borra la materia prima y su historial de movimientos.', boton: 'Eliminar', peligro: true,
      onOk: async () => {
        const { error } = await supabase.from('insumos').delete().eq('id', ins.id);
        if (error) {
          const r = await supabase.from('insumos').update({ activo: false }).eq('id', ins.id);
          if (r.error) return avisar(r.error.message, 'error');
        }
        avisar(`${ins.nombre} eliminada ✔`);
        setEditIns(null);
        setSel(null);
        cargar();
      },
    });
  }

  async function verHistorial() {
    const [{ data: a }, { data: i }] = await Promise.all([
      supabase.from('stock_movs').select('*, articulos(nombre)').order('id', { ascending: false }).limit(40),
      supabase.from('insumo_movs').select('*, insumos(nombre, unidad)').order('id', { ascending: false }).limit(40),
    ]);
    const todo = [
      ...(a || []).map((x) => ({ ...x, nombre: x.articulos?.nombre, unidad: 'u' })),
      ...(i || []).map((x) => ({ ...x, nombre: x.insumos?.nombre, unidad: x.insumos?.unidad })),
    ].sort((x, y) => new Date(y.created_at) - new Date(x.created_at)).slice(0, 50);
    setHistorial(todo);
  }

  function listaCompras() {
    const faltan = (insumos || []).filter((i) => nivelStock(i.stock, i.minimo) !== 'ok');
    const cong = (congeladas || []).filter((a) => nivelStock(a.stock, a.stock_minimo) !== 'ok');
    const t = ['🛒 *Lista de compras — Tope de Pizza*', ...faltan.map((i) => `• ${i.nombre}: comprar ${cant(sugerido(i.stock, i.minimo, i.paso))} ${i.unidad} (hay ${cant(i.stock)})`),
      ...(cong.length ? ['', '🧊 *Congeladas a producir*', ...cong.map((a) => `• ${a.nombre}: hacer ${cant(sugerido(a.stock, a.stock_minimo, 1))} (hay ${cant(a.stock)})`)] : [])].join('\n');
    setCompras({ faltan, cong, texto: t });
  }
  async function copiarCompras() {
    try { await navigator.clipboard.writeText(compras.texto); avisar('Lista copiada ✔'); } catch { avisar('No se pudo copiar', 'error'); }
  }

  if (!insumos) return <><Cabecera titulo="Stock" /><Cargando /></>;

  const lista = tab === 'insumos' ? insumos : congeladas;
  const bajos = insumos.filter((i) => nivelStock(i.stock, i.minimo) !== 'ok').length + congeladas.filter((a) => nivelStock(a.stock, a.stock_minimo) !== 'ok').length;

  return (
    <>
      <Cabecera titulo="Stock" sub="Tocá un ítem para cargar, editar o eliminar" derecha={<button className="ibtn" onClick={verHistorial} aria-label="Historial">🕘</button>} />
      <Chips valor={tab} onCambio={setTab} opciones={[{ id: 'insumos', label: `🧀 Materias primas` }, { id: 'congeladas', label: `🧊 Congeladas` }]} />

      <div className="grid2" style={{ margin: '12px 0' }}>
        {tab === 'insumos'
          ? <button className="btn primario" onClick={() => { setProd({}); setHojaProd(true); }}>👨‍🍳 Producción del día</button>
          : <div />}
        <button className={bajos ? 'btn peligro' : 'btn borde'} onClick={listaCompras}>🛒 Lista de compras{bajos ? ` (${bajos})` : ''}</button>
      </div>

      {lista.length === 0 ? (
        <Vacio texto={tab === 'insumos' ? 'No hay materias primas. Agregá con el botón de abajo.' : 'No hay artículos con control de stock. Activalo en Codificación (ej: pizzas congeladas).'} />
      ) : (
        <div className="lista">
          {lista.map((x) => {
            const tipo = tab === 'insumos' ? 'ins' : 'art';
            const min = tipo === 'ins' ? x.minimo : x.stock_minimo;
            const paso = tipo === 'ins' ? Number(x.paso) || 1 : 1;
            const nivel = nivelStock(x.stock, min);
            const bajo = nivel === 'bajo';
            return (
              <div key={x.id} className="item">
                <div className="item-cuerpo clic" onClick={() => { setSel({ ...x, tipo }); setModo(tipo === 'art' ? 'ingreso' : 'consumo'); setValor(''); setNota(''); setMinimoTxt(String(Number(tipo === 'art' ? x.stock_minimo : x.minimo) || '')); }}>
                  <div className="item-titulo">{x.nombre}</div>
                  <div className="item-sub">
                    {bajo ? <span className="rojo-t">⚠️ Comprar · mínimo {cant(min)}</span> : nivel === 'cerca' ? <span className="ambar-t">🟡 Se está acabando · mínimo {cant(min)}</span> : Number(min) > 0 ? `Mínimo ${cant(min)}` : <span className="suave">Sin mínimo · tocá para cargarlo</span>}
                    {tipo === 'ins' ? ` · ${x.unidad}` : ''}
                  </div>
                </div>
                <div className="stepper">
                  <button onClick={() => rapido(tipo, x, -paso)}>−</button>
                </div>
                <div className={`stock-num mono ${bajo ? 'stock-bajo' : nivel === 'cerca' ? 'stock-cerca' : ''}`}>{cant(x.stock)}</div>
                <div className="stepper">
                  <button onClick={() => rapido(tipo, x, paso)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'insumos' && <button className="btn amarillo bloque" onClick={() => setEditIns({ nombre: '', unidad: 'kg', minimo: '', paso: '1', costo: '', stock: '' })}>+ Nueva materia prima</button>}
      <p className="suave chico-t centro">Los − / + descuentan o suman de a una unidad (o el “paso” del insumo). Las congeladas se descuentan solas al venderlas.</p>

      {/* MOVIMIENTO */}
      <Hoja abierta={!!sel} titulo={sel?.nombre} onCerrar={() => setSel(null)}
        pie={
          <div className="fila-btns">
            {sel?.tipo === 'ins' && <button className="btn peligro" onClick={() => borrarInsumo(sel)}>🗑 Eliminar</button>}
            {sel?.tipo === 'ins' && <button className="btn borde" onClick={() => { setEditIns({ ...sel }); setSel(null); }}>✏️ Editar</button>}
            <button className="btn primario" disabled={trabajando || valor === ''} onClick={confirmarMov}>Guardar</button>
          </div>
        }>
        {sel && (
          <>
            <div className="centro" style={{ marginBottom: 12 }}>
              <div className="suave chico-t">Stock actual</div>
              <div style={{ fontSize: 34, fontWeight: 800 }}>{cant(sel.stock)} <span className="suave" style={{ fontSize: 16 }}>{sel.tipo === 'ins' ? sel.unidad : 'u'}</span></div>
            </div>
            <Chips valor={modo} onCambio={setModo} opciones={[
              { id: 'ingreso', label: sel.tipo === 'art' ? '+ Producción' : '+ Compra' },
              { id: 'consumo', label: sel.tipo === 'art' ? '− Baja' : '− Consumo' },
              { id: 'ajuste', label: '= Ajustar a' },
            ]} />
            <div style={{ marginTop: 12 }}>
              <Campo label={modo === 'ajuste' ? 'Stock real contado' : 'Cantidad'}>
                <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
              </Campo>
              <Campo label="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
              <div className="tarjeta" style={{ padding: 12, marginBottom: 0 }}>
                <div className="campo-label">🔔 Avisarme cuando quede en (stock mínimo)</div>
                <div className="voz">
                  <input inputMode="decimal" value={minimoTxt} onChange={(e) => setMinimoTxt(e.target.value)} placeholder="0" />
                  <button className="btn borde" onClick={guardarMinimo}>Guardar</button>
                </div>
                <div className="campo-ayuda">Te salta alerta amarilla cuando se acerca y roja cuando llega a ese número.</div>
              </div>
            </div>
          </>
        )}
      </Hoja>

      {/* PRODUCCIÓN */}
      <Hoja abierta={hojaProd} titulo="Producción del día" onCerrar={() => setHojaProd(false)}
        pie={<button className="btn primario bloque" disabled={trabajando} onClick={confirmarProduccion}>Descontar del stock</button>}>
        <p className="suave chico-t" style={{ marginTop: 0 }}>Cargá cuánto usaste de cada cosa y se descuenta todo junto.</p>
        {insumos.map((i) => (
          <div key={i.id} className="carrito-item">
            <div className="item-cuerpo"><div className="item-titulo">{i.nombre}</div><div className="item-sub">Hay {cant(i.stock)} {i.unidad}</div></div>
            <input style={{ width: 100, textAlign: 'right' }} inputMode="decimal" placeholder="0" value={prod[i.id] || ''} onChange={(e) => setProd({ ...prod, [i.id]: e.target.value })} />
            <span className="suave chico-t" style={{ width: 24 }}>{i.unidad}</span>
          </div>
        ))}
      </Hoja>

      {/* EDITAR INSUMO */}
      <Hoja abierta={!!editIns} titulo={editIns?.id ? 'Editar materia prima' : 'Nueva materia prima'} onCerrar={() => setEditIns(null)}
        pie={
          <div className="fila-btns">
            {editIns?.id && <button className="btn peligro" onClick={() => borrarInsumo(editIns)}>🗑 Eliminar</button>}
            <button className="btn primario" onClick={guardarInsumo}>Guardar</button>
          </div>
        }>
        {editIns && (
          <>
            <Campo label="Nombre"><input value={editIns.nombre} onChange={(e) => setEditIns({ ...editIns, nombre: e.target.value })} /></Campo>
            <div className="grid2">
              <Campo label="Unidad"><select value={editIns.unidad} onChange={(e) => setEditIns({ ...editIns, unidad: e.target.value })}>
                {['kg', 'g', 'l', 'ml', 'u', 'paq', 'caja', 'bolsa', 'horma'].map((u) => <option key={u}>{u}</option>)}
              </select></Campo>
              <Campo label="Stock mínimo"><input inputMode="decimal" value={editIns.minimo} onChange={(e) => setEditIns({ ...editIns, minimo: e.target.value })} /></Campo>
              <Campo label="Paso del botón −/+"><input inputMode="decimal" value={editIns.paso} onChange={(e) => setEditIns({ ...editIns, paso: e.target.value })} /></Campo>
              <Campo label="Costo por unidad"><input inputMode="numeric" value={editIns.costo} onChange={(e) => setEditIns({ ...editIns, costo: e.target.value })} /></Campo>
            </div>
            {!editIns.id && <Campo label="Stock inicial"><input inputMode="decimal" value={editIns.stock} onChange={(e) => setEditIns({ ...editIns, stock: e.target.value })} /></Campo>}
            {editIns.id && Number(editIns.costo) > 0 && <div className="suave chico-t">Valor en stock: {money(Number(editIns.costo) * Number(editIns.stock))}</div>}
          </>
        )}
      </Hoja>

      {/* HISTORIAL */}
      <Hoja abierta={!!historial} titulo="Últimos movimientos de stock" onCerrar={() => setHistorial(null)}>
        {historial && (historial.length === 0 ? <Vacio texto="Sin movimientos" /> : historial.map((h) => (
          <div key={(h.insumo_id ? 'i' : 'a') + h.id} className="resumen-linea chico-t">
            <span>{fechaHora(h.created_at)} · {h.nombre} <span className="suave">({h.tipo}{h.nota ? ': ' + h.nota : ''})</span></span>
            <b className={Number(h.cantidad) > 0 ? 'verde-t' : 'rojo-t'}>{Number(h.cantidad) > 0 ? '+' : ''}{cant(h.cantidad)}</b>
          </div>
        )))}
      </Hoja>
      {/* LISTA DE COMPRAS */}
      <Hoja abierta={!!compras} titulo="🛒 Lista de compras" onCerrar={() => setCompras(null)}
        pie={compras && (compras.faltan.length || compras.cong.length) ? (
          <div className="fila-btns">
            <button className="btn borde" onClick={copiarCompras}>📋 Copiar</button>
            <a className="btn verde" href={linkWhatsapp('', compras.texto)} target="_blank" rel="noreferrer">💬 Compartir</a>
          </div>
        ) : null}>
        {compras && (!compras.faltan.length && !compras.cong.length ? (
          <Vacio emoji="🙌" texto="Todo está por arriba del mínimo. No hace falta comprar nada." />
        ) : (
          <>
            {compras.faltan.length > 0 && (
              <div className="lista">
                {compras.faltan.map((i) => (
                  <div key={i.id} className="item">
                    <div className="item-cuerpo"><div className="item-titulo">{i.nombre}</div><div className="item-sub">Hay {cant(i.stock)} {i.unidad} · mínimo {cant(i.minimo)}</div></div>
                    <div className="item-der rojo-t">+{cant(sugerido(i.stock, i.minimo, i.paso))} {i.unidad}</div>
                  </div>
                ))}
              </div>
            )}
            {compras.cong.length > 0 && (
              <>
                <div className="campo-label">🧊 Congeladas a producir</div>
                <div className="lista">
                  {compras.cong.map((a) => (
                    <div key={a.id} className="item">
                      <div className="item-cuerpo"><div className="item-titulo">{a.nombre}</div><div className="item-sub">Hay {cant(a.stock)} · mínimo {cant(a.stock_minimo)}</div></div>
                      <div className="item-der rojo-t">+{cant(sugerido(a.stock, a.stock_minimo, 1))}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="suave chico-t">“Compartir” abre WhatsApp para que elijas a quién mandársela.</p>
          </>
        ))}
      </Hoja>
      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />
    </>
  );
}
