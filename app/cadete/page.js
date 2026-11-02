'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Chips, Campo, Cargando, Vacio, Confirmar } from '@/components/ui';
import { money, num, hora, fechaHora, CUENTAS, nombreCuenta, linkWhatsapp, cadeteDelDia, DIAS_LARGO, diaSemanaOperativo, diaOperativo } from '@/lib/utils';

const SEL_VIAJE = 'id, numero, cliente_nombre, cliente_direccion, cliente_referencia, envio, total, forma_pago, created_at, cadete_id, estado';

// "jueves 30/10" del día operativo (antes de las 3 AM cuenta para el día anterior)
function fechaDia(f) {
  return diaOperativo(f).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' }).replace(/-/g, '/');
}
const fechaLiq = (l) => { const f = fechaDia(l.desde || l.hasta || l.created_at); return f.charAt(0).toUpperCase() + f.slice(1); };
const nViajes = (n) => `${n} ${Number(n) === 1 ? 'viaje' : 'viajes'}`;

// Mensaje de rendición: uno o varios días, cada uno con sus viajes, y el total final
function textoRendicion({ nombre, dias, pagada, cuenta }) {
  const varios = dias.length > 1;
  const l = [`🛵 *Rendición ${nombre}* — Tope de Pizza`];
  let total = 0;
  dias.forEach((d) => {
    l.push('');
    l.push(`📅 *${d.fecha.charAt(0).toUpperCase() + d.fecha.slice(1)}*`);
    d.viajes.forEach((v, i) => {
      l.push(`${i + 1}. #${v.numero} ${v.cliente_nombre || 'Cliente'} — ${v.cliente_direccion || 'sin dirección'}`);
      l.push(`    Envío: ${money(v.envio)}`);
    });
    const envios = d.viajes.reduce((a, v) => a + Number(v.envio), 0);
    l.push(`🧾 ${d.viajes.length} ${d.viajes.length === 1 ? "viaje" : "viajes"} · Envíos ${money(envios)} + básico ${money(d.basico)}${Number(d.extra) ? ` + extra ${money(d.extra)}` : ''}`);
    l.push(varios ? `= ${money(d.total)}` : `💰 *Total a cobrar: ${money(d.total)}*`);
    total += Number(d.total);
  });
  if (varios) {
    l.push('');
    l.push(`💰 *TOTAL A COBRAR (${dias.length} días): ${money(total)}*`);
  }
  l.push(pagada ? `✅ Pagado${cuenta ? ` (${nombreCuenta(cuenta)})` : ''}` : '⏳ Pendiente de pago');
  l.push('¡Gracias! 🍕');
  return l.join('\n');
}

export default function Cadete() {
  const { config, avisar } = useApp();
  const [cadetes, setCadetes] = useState(null);
  const [viajes, setViajes] = useState([]);
  const [liqs, setLiqs] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [hoja, setHoja] = useState(null); // cierre de turno {cadete}
  const [form, setForm] = useState({});
  const [detalle, setDetalle] = useState(null); // liquidación elegida
  const [sel, setSel] = useState([]); // liquidaciones pendientes tildadas
  const [union, setUnion] = useState(null); // liquidar juntas
  const [trabajando, setTrabajando] = useState(false);
  const [rendicion, setRendicion] = useState(null); // {nombre, tel, texto}
  const [confirmar, setConfirmar] = useState(null);

  const cargar = useCallback(async () => {
    try {
      await rpc('jornada_actual'); // dispara el cierre automático si corresponde
      const [{ data: c }, { data: v }, { data: l }] = await Promise.all([
        supabase.from('cadetes').select('*').order('nombre'),
        supabase.from('comandas').select(SEL_VIAJE)
          .is('liquidacion_id', null).eq('no_liquidar', false).neq('estado', 'anulada').eq('tipo_entrega', 'delivery')
          .not('cadete_id', 'is', null).order('id'),
        supabase.from('liquidaciones').select('*, cadetes(nombre, telefono)').order('id', { ascending: false }).limit(60),
      ]);
      setCadetes(c || []);
      setViajes(v || []);
      setLiqs(l || []);
    } catch (e) { avisar(e.message, 'error'); }
  }, [avisar]);

  useEffect(() => { cargar(); }, [cargar]);

  const basicoDef = Number(config?.basico_cadete ?? 15000);
  const viajesDe = (l) => supabase.from('comandas').select(SEL_VIAJE).eq('liquidacion_id', l.id).order('id').then(({ data }) => data || []);

  // ---------- turno abierto ----------
  function abrirCierre(cadete) {
    setForm({ basico: String(basicoDef), extra: '', cuenta: 'efectivo' });
    setHoja({ cadete });
  }

  async function liquidar(pagar) {
    setTrabajando(true);
    const vs = viajes.filter((v) => v.cadete_id === hoja.cadete.id);
    const total = vs.reduce((a, v) => a + Number(v.envio), 0) + num(form.basico) + num(form.extra);
    const texto = textoRendicion({
      nombre: hoja.cadete.nombre, pagada: pagar, cuenta: form.cuenta,
      dias: [{ fecha: fechaDia(vs[0]?.created_at || new Date()), viajes: vs, basico: num(form.basico), extra: num(form.extra), total }],
    });
    try {
      await rpc('liquidar_cadete', {
        p_cadete: hoja.cadete.id, p_tipo: 'manual', p_pagar: pagar, p_cuenta: form.cuenta,
        p_basico: num(form.basico), p_extra: num(form.extra), p_hasta: null,
      });
      avisar(pagar ? 'Turno cerrado y pagado ✔' : 'Turno cerrado (queda pendiente de pago)');
      setRendicion({ nombre: hoja.cadete.nombre, tel: hoja.cadete.telefono, texto });
      setHoja(null);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  function noLiquidarViaje(v) {
    setConfirmar({
      titulo: `¿Sacar el viaje #${v.numero} del turno?`,
      mensaje: 'Para viajes que llevaron ustedes: no se le paga al cadete. La comanda queda igual.',
      boton: 'Sacar del turno',
      onOk: async () => {
        const { error } = await supabase.from('comandas').update({ no_liquidar: true }).eq('id', v.id);
        if (error) return avisar(error.message, 'error');
        avisar(`Viaje #${v.numero} sacado del turno`);
        cargar();
      },
    });
  }

  // ---------- una liquidación ----------
  async function abrirDetalle(l) {
    setDetalle({ ...l, cuenta: 'efectivo', lista: null });
    const vs = await viajesDe(l);
    setDetalle((d) => (d && d.id === l.id ? { ...d, lista: vs } : d));
  }

  async function pagarUna() {
    setTrabajando(true);
    try {
      await rpc('pagar_liquidacion', { p_id: detalle.id, p_cuenta: detalle.cuenta || 'efectivo' });
      avisar('Pago registrado en caja ✔');
      const l = { ...detalle, pagada: true, cuenta_pago: detalle.cuenta };
      setDetalle(null);
      verRendicion(l);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  function eliminarLiq(l, devolver) {
    setConfirmar({
      titulo: devolver ? '¿Deshacer el cierre?' : `¿Eliminar la liquidación de ${l.cadetes?.nombre || 'cadete'}?`,
      boton: devolver ? 'Deshacer cierre' : 'Eliminar',
      peligro: !devolver,
      mensaje: [
        devolver ? 'Los viajes vuelven al turno abierto del cadete para liquidarlos de nuevo.' : `Los ${l.viajes} viajes quedan como “no se liquidan” (por ejemplo, los llevaron ustedes).`,
        l.pagada ? 'El pago vuelve a la caja.' : '',
      ].filter(Boolean).join(' '),
      onOk: async () => {
        try {
          await rpc('eliminar_liquidacion', { p_id: l.id, p_devolver: !!devolver });
          avisar(devolver ? 'Cierre deshecho: los viajes volvieron al turno' : 'Liquidación eliminada');
          setDetalle(null);
          setSel((s) => s.filter((x) => x !== l.id));
          cargar();
        } catch (e) { avisar(e.message, 'error'); }
      },
    });
  }

  async function verRendicion(l) {
    const vs = l.lista || (await viajesDe(l));
    setRendicion({
      nombre: l.cadetes?.nombre || 'Cadete', tel: l.cadetes?.telefono,
      texto: textoRendicion({
        nombre: l.cadetes?.nombre || 'Cadete', pagada: l.pagada, cuenta: l.cuenta_pago,
        dias: [{ fecha: fechaLiq(l), viajes: vs, basico: l.basico, extra: l.extra, total: l.total }],
      }),
    });
  }

  // ---------- varias juntas ----------
  const pendientesPago = liqs.filter((l) => !l.pagada);
  const pagadas = liqs.filter((l) => l.pagada).slice(0, 20);
  const elegidas = pendientesPago.filter((l) => sel.includes(l.id)).sort((a, b) => String(a.desde || a.created_at).localeCompare(String(b.desde || b.created_at)));
  const mismoCadete = new Set(elegidas.map((l) => l.cadete_id)).size <= 1;
  const totalElegidas = elegidas.reduce((a, l) => a + Number(l.total), 0);

  function tildar(id) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function abrirUnion() {
    const conViajes = await Promise.all(elegidas.map(async (l) => ({ ...l, lista: await viajesDe(l) })));
    setUnion({ liqs: conViajes, cuenta: 'efectivo', pagada: false });
  }
  const textoUnion = union && textoRendicion({
    nombre: union.liqs[0]?.cadetes?.nombre || 'Cadete', pagada: union.pagada, cuenta: union.cuenta,
    dias: union.liqs.map((l) => ({ fecha: fechaLiq(l), viajes: l.lista, basico: l.basico, extra: l.extra, total: l.total })),
  });

  async function pagarUnion() {
    setTrabajando(true);
    try {
      await rpc('pagar_liquidaciones', { p_ids: union.liqs.map((l) => l.id), p_cuenta: union.cuenta });
      avisar(`Pagadas ${union.liqs.length} liquidaciones ✔`);
      setUnion({ ...union, pagada: true });
      setSel([]);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); avisar('Copiado ✔'); } catch { avisar('No se pudo copiar', 'error'); }
  }

  if (!cadetes) return <><Cabecera titulo="Turno cadete" /><Cargando /></>;

  const conTurno = cadetes.filter((c) => viajes.some((v) => v.cadete_id === c.id));

  return (
    <>
      <Cabecera titulo="Turno cadete" sub={`Básico ${money(basicoDef)} + envíos de cada viaje`} />

      {cadetes.length === 0 && <Vacio emoji="🛵" texto="No hay cadetes cargados. Agregalos en Más → Configuración." />}
      {cadetes.length > 0 && conTurno.length === 0 && (
        <div className="tarjeta centro">
          <div style={{ fontSize: 40 }}>🛵</div>
          <div className="item-titulo" style={{ fontSize: 17, marginTop: 4 }}>No hay turno abierto</div>
          <div className="suave" style={{ marginTop: 4 }}>
            {cadeteDelDia(cadetes) ? <>Hoy {DIAS_LARGO[diaSemanaOperativo()]} le toca a <b>{cadeteDelDia(cadetes).nombre}</b>. </> : 'Hoy no hay cadete asignado. '}
            El turno se abre solo con la primera comanda de delivery.
          </div>
        </div>
      )}

      {conTurno.map((c) => {
        const vs = viajes.filter((v) => v.cadete_id === c.id);
        const envios = vs.reduce((a, v) => a + Number(v.envio), 0);
        return (
          <div key={c.id} className="tarjeta">
            <div className="cc-top">
              <span className="cc-num">🛵 {c.nombre}</span>
              <span className="badge b-azul">Turno abierto</span>
            </div>
            <div className="kpis" style={{ marginTop: 12, marginBottom: 10 }}>
              <div className="kpi"><div className="k-label">Viajes</div><div className="k-valor">{vs.length}</div><div className="k-sub">{money(envios)} en envíos</div></div>
              <div className="kpi destacado"><div className="k-label">A pagar hoy</div><div className="k-valor">{money(envios + basicoDef)}</div><div className="k-sub">incluye básico {money(basicoDef)}</div></div>
            </div>
            <button className="btn borde chico bloque" style={{ marginBottom: 8 }} onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
              {abierto === c.id ? 'Ocultar viajes' : `Ver ${vs.length} viajes`}
            </button>
            {abierto === c.id && (
              <div className="lista">
                {vs.map((v) => (
                  <div key={v.id} className="item">
                    <div className="item-cuerpo">
                      <div className="item-titulo">#{v.numero} {v.cliente_nombre || ''} · {money(v.envio)}</div>
                      <div className="item-sub">{hora(v.created_at)} · {v.cliente_direccion || 'sin dirección'}{v.estado === 'abierta' ? ' · ⏳ sin cobrar' : ''}</div>
                    </div>
                    <button className="btn borde chico" onClick={() => noLiquidarViaje(v)}>🙋 No liquidar</button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn primario bloque" onClick={() => abrirCierre(c)}>Cerrar turno y liquidar</button>
          </div>
        );
      })}
      <p className="suave chico-t centro">Si no cerrás el turno, se cierra solo a las 3:00 AM y queda pendiente de pago acá abajo. Los viajes que llevan ustedes sacalos con “🙋 No liquidar”.</p>

      {pendientesPago.length > 0 && (
        <>
          <div className="seccion-titulo">Pendientes de pago</div>
          {pendientesPago.length > 1 && <p className="suave chico-t" style={{ margin: '-4px 4px 8px' }}>Tildá 2 o más del mismo cadete para pagarlas juntas en un solo mensaje.</p>}
          <div className="lista">
            {pendientesPago.map((l) => (
              <div key={l.id} className="item">
                <input type="checkbox" checked={sel.includes(l.id)} onChange={() => tildar(l.id)} aria-label="Elegir" />
                <div className="item-cuerpo clic" onClick={() => abrirDetalle(l)}>
                  <div className="item-titulo">{l.cadetes?.nombre || 'Cadete'} · {fechaLiq(l)}</div>
                  <div className="item-sub">{nViajes(l.viajes)} · {l.tipo_cierre === 'auto' ? 'cierre automático' : 'cierre manual'} · tocá para ver</div>
                </div>
                <div className="item-der mono rojo-t">{money(l.total)}</div>
              </div>
            ))}
          </div>
          {elegidas.length >= 2 && (
            mismoCadete ? (
              <button className="btn verde bloque grande" style={{ marginBottom: 14 }} onClick={abrirUnion}>
                🔗 Liquidar juntas ({elegidas.length}) · {money(totalElegidas)}
              </button>
            ) : <div className="aviso rojo">Elegí liquidaciones de un mismo cadete para juntarlas.</div>
          )}
        </>
      )}

      <div className="seccion-titulo">Liquidaciones pagadas</div>
      {pagadas.length === 0 ? <Vacio texto="Todavía no hay" /> : (
        <div className="lista">
          {pagadas.map((l) => (
            <div key={l.id} className="item clic" onClick={() => abrirDetalle(l)}>
              <div className="item-cuerpo">
                <div className="item-titulo">{l.cadetes?.nombre || 'Cadete'} · {fechaLiq(l)}</div>
                <div className="item-sub">{nViajes(l.viajes)} · pagada {fechaHora(l.pagada_at)} · {nombreCuenta(l.cuenta_pago)}</div>
              </div>
              <div className="item-der mono">{money(l.total)}</div>
            </div>
          ))}
        </div>
      )}

      {/* CERRAR TURNO */}
      <Hoja abierta={!!hoja} titulo={`Cerrar turno · ${hoja?.cadete.nombre || ''}`} onCerrar={() => setHoja(null)}
        pie={
          <div className="fila-btns">
            <button className="btn borde" disabled={trabajando} onClick={() => liquidar(false)}>Cerrar sin pagar</button>
            <button className="btn verde" disabled={trabajando} onClick={() => liquidar(true)}>Cerrar y pagar</button>
          </div>
        }>
        {hoja && (() => {
          const vs = viajes.filter((v) => v.cadete_id === hoja.cadete.id);
          const envios = vs.reduce((a, v) => a + Number(v.envio), 0);
          const total = envios + num(form.basico) + num(form.extra);
          return (
            <>
              <div className="resumen-linea"><span>{vs.length} viajes (envíos)</span><b className="mono">{money(envios)}</b></div>
              <div className="grid2" style={{ marginTop: 10 }}>
                <Campo label="Básico"><input inputMode="numeric" value={form.basico} onChange={(e) => setForm({ ...form, basico: e.target.value })} /></Campo>
                <Campo label="Extra / propina"><input inputMode="numeric" placeholder="$0" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} /></Campo>
              </div>
              <div className="resumen-linea total"><span>Total a pagar</span><span className="mono">{money(total)}</span></div>
              <div className="campo-label" style={{ marginTop: 12 }}>Se paga desde</div>
              <Chips valor={form.cuenta} onCambio={(v) => setForm({ ...form, cuenta: v })} opciones={CUENTAS.map((x) => ({ id: x.id, label: `${x.icono} ${x.nombre}` }))} />
              <p className="suave chico-t">Al cerrar te aparece la rendición con cada viaje para mandársela por WhatsApp.</p>
            </>
          );
        })()}
      </Hoja>

      {/* DETALLE DE UNA LIQUIDACIÓN */}
      <Hoja abierta={!!detalle} titulo={detalle ? `${detalle.cadetes?.nombre || 'Cadete'} · ${fechaLiq(detalle)}` : ''} onCerrar={() => setDetalle(null)}
        pie={detalle && !detalle.pagada ? (
          <button className="btn verde bloque grande" disabled={trabajando} onClick={pagarUna}>Pagar {money(detalle.total)}</button>
        ) : null}>
        {detalle && (
          <>
            {detalle.pagada
              ? <div className="aviso verde">✔ Pagada {fechaHora(detalle.pagada_at)} · {nombreCuenta(detalle.cuenta_pago)}</div>
              : <div className="aviso">⏳ Pendiente de pago</div>}
            {detalle.lista === null ? <div className="suave chico-t">Cargando viajes…</div> : detalle.lista.map((v) => (
              <div key={v.id} className="resumen-linea chico-t"><span>#{v.numero} {v.cliente_nombre || ''} — {v.cliente_direccion || 'sin dirección'}</span><span className="mono">{money(v.envio)}</span></div>
            ))}
            <hr className="sep" />
            <div className="resumen-linea"><span>{nViajes(detalle.viajes)} · envíos</span><span className="mono">{money(detalle.total_envios)}</span></div>
            <div className="resumen-linea"><span>Básico</span><span className="mono">{money(detalle.basico)}</span></div>
            {Number(detalle.extra) > 0 && <div className="resumen-linea"><span>Extra</span><span className="mono">{money(detalle.extra)}</span></div>}
            <div className="resumen-linea total"><span>Total</span><span className="mono">{money(detalle.total)}</span></div>
            {!detalle.pagada && (
              <>
                <div className="campo-label" style={{ marginTop: 12 }}>Se paga desde</div>
                <Chips valor={detalle.cuenta} onCambio={(v) => setDetalle({ ...detalle, cuenta: v })} opciones={CUENTAS.map((x) => ({ id: x.id, label: `${x.icono} ${x.nombre}` }))} />
              </>
            )}
            <button className="btn borde bloque" style={{ marginTop: 14 }} onClick={() => verRendicion(detalle)}>📲 Rendición para WhatsApp</button>
            <div className="fila-btns" style={{ marginTop: 8 }}>
              <button className="btn borde" onClick={() => eliminarLiq(detalle, true)}>↩️ Deshacer cierre</button>
              <button className="btn peligro" onClick={() => eliminarLiq(detalle, false)}>🗑 Eliminar</button>
            </div>
            <p className="suave chico-t">“Eliminar”: los viajes no se pagan (ej: los llevaron ustedes). “Deshacer cierre”: vuelven al turno abierto.</p>
          </>
        )}
      </Hoja>

      {/* LIQUIDAR JUNTAS */}
      <Hoja abierta={!!union} titulo={`Liquidar juntas · ${union?.liqs[0]?.cadetes?.nombre || ''}`} onCerrar={() => setUnion(null)}
        pie={union && (
          union.pagada ? (
            <div className="fila-btns">
              <button className="btn borde" onClick={() => copiar(textoUnion)}>📋 Copiar</button>
              <a className="btn verde" href={linkWhatsapp(union.liqs[0]?.cadetes?.telefono || '', textoUnion)} target="_blank" rel="noreferrer">📲 Mandar a {union.liqs[0]?.cadetes?.nombre}</a>
            </div>
          ) : (
            <button className="btn verde bloque grande" disabled={trabajando} onClick={pagarUnion}>
              Pagar todo · {money(union.liqs.reduce((a, l) => a + Number(l.total), 0))}
            </button>
          )
        )}>
        {union && (
          <>
            {union.liqs.map((l) => (
              <div key={l.id} className="resumen-linea"><span>{fechaLiq(l)} · {nViajes(l.viajes)}</span><span className="mono">{money(l.total)}</span></div>
            ))}
            <div className="resumen-linea total"><span>Total</span><span className="mono">{money(union.liqs.reduce((a, l) => a + Number(l.total), 0))}</span></div>
            {!union.pagada && (
              <>
                <div className="campo-label" style={{ marginTop: 12 }}>Se paga desde</div>
                <Chips valor={union.cuenta} onCambio={(v) => setUnion({ ...union, cuenta: v })} opciones={CUENTAS.map((x) => ({ id: x.id, label: `${x.icono} ${x.nombre}` }))} />
              </>
            )}
            {union.pagada && <div className="aviso verde" style={{ marginTop: 12 }}>✔ Pagado. Mandale la rendición:</div>}
            <div className="campo-label" style={{ marginTop: 12 }}>Mensaje para el cadete</div>
            <pre className="previa-msj">{textoUnion}</pre>
            {!union.pagada && (
              <div className="fila-btns" style={{ marginTop: 10 }}>
                <button className="btn borde" onClick={() => copiar(textoUnion)}>📋 Copiar</button>
                <a className="btn borde" href={linkWhatsapp(union.liqs[0]?.cadetes?.telefono || '', textoUnion)} target="_blank" rel="noreferrer">📲 Mandar sin pagar</a>
              </div>
            )}
          </>
        )}
      </Hoja>

      {/* RENDICIÓN */}
      <Hoja abierta={!!rendicion} titulo={`Rendición · ${rendicion?.nombre || ''}`} onCerrar={() => setRendicion(null)}
        pie={rendicion && (
          <div className="fila-btns">
            <button className="btn borde" onClick={() => copiar(rendicion.texto)}>📋 Copiar</button>
            <a className="btn verde" href={linkWhatsapp(rendicion.tel || '', rendicion.texto)} target="_blank" rel="noreferrer">📲 Mandar a {rendicion.nombre}</a>
          </div>
        )}>
        {rendicion && <pre className="previa-msj">{rendicion.texto}</pre>}
      </Hoja>

      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />
    </>
  );
}
