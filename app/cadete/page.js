'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Chips, Campo, Cargando, Vacio } from '@/components/ui';
import { money, num, hora, fechaHora, CUENTAS, nombreCuenta, linkWhatsapp, cadeteDelDia, DIAS_LARGO, diaSemanaOperativo } from '@/lib/utils';

const SEL_VIAJE = 'id, numero, cliente_nombre, cliente_direccion, cliente_referencia, envio, total, forma_pago, created_at, cadete_id, estado';

// mensaje de rendición para el cadete: cada viaje con cliente, dirección y envío
function textoRendicion({ nombre, viajes, basico, extra, total, pagada, cuenta, fecha }) {
  const l = [`🛵 *Rendición ${nombre}* — Tope de Pizza`, fecha ? `📅 ${fecha}` : '', ''];
  viajes.forEach((v, i) => {
    l.push(`${i + 1}. #${v.numero} ${v.cliente_nombre || 'Cliente'} — ${v.cliente_direccion || 'sin dirección'}`);
    l.push(`    Envío: ${money(v.envio)}${v.forma_pago === 'efectivo' ? ` · cobraste ${money(v.total)} en efectivo` : ' · pagó por Mercado Pago'}`);
  });
  const efectivo = viajes.filter((v) => v.forma_pago === 'efectivo').reduce((a, v) => a + Number(v.total), 0);
  const envios = viajes.reduce((a, v) => a + Number(v.envio), 0);
  l.push('');
  l.push(`🧾 Viajes: ${viajes.length} · Envíos: ${money(envios)}`);
  l.push(`➕ Básico: ${money(basico)}`);
  if (Number(extra)) l.push(`➕ Extra: ${money(extra)}`);
  l.push(`💰 *Total a cobrar: ${money(total)}*`);
  if (efectivo > 0) l.push(`💵 Efectivo cobrado a clientes: ${money(efectivo)}`);
  l.push(pagada ? `✅ Pagado${cuenta ? ` (${nombreCuenta(cuenta)})` : ''}` : '⏳ Pendiente de pago');
  l.push('¡Gracias! 🍕');
  return l.filter((x, i) => !(x === '' && l[i - 1] === '')).join('\n');
}

export default function Cadete() {
  const { config, avisar } = useApp();
  const [cadetes, setCadetes] = useState(null);
  const [viajes, setViajes] = useState([]);
  const [liqs, setLiqs] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [hoja, setHoja] = useState(null); // {cadete, pagar}
  const [form, setForm] = useState({});
  const [pagarLiq, setPagarLiq] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [rendicion, setRendicion] = useState(null); // {nombre, tel, texto}

  const cargar = useCallback(async () => {
    try {
      await rpc('jornada_actual'); // dispara el cierre automático si corresponde
      const [{ data: c }, { data: v }, { data: l }] = await Promise.all([
        supabase.from('cadetes').select('*').order('nombre'),
        supabase.from('comandas').select(SEL_VIAJE)
          .is('liquidacion_id', null).neq('estado', 'anulada').eq('tipo_entrega', 'delivery').not('cadete_id', 'is', null).order('id'),
        supabase.from('liquidaciones').select('*, cadetes(nombre, telefono)').order('id', { ascending: false }).limit(40),
      ]);
      setCadetes(c || []);
      setViajes(v || []);
      setLiqs(l || []);
    } catch (e) { avisar(e.message, 'error'); }
  }, [avisar]);

  useEffect(() => { cargar(); }, [cargar]);

  const basicoDef = Number(config?.basico_cadete ?? 15000);

  function abrirCierre(cadete) {
    setForm({ basico: String(basicoDef), extra: '', cuenta: 'efectivo' });
    setHoja({ cadete });
  }

  async function liquidar(pagar) {
    setTrabajando(true);
    const vs = viajes.filter((v) => v.cadete_id === hoja.cadete.id);
    const total = vs.reduce((a, v) => a + Number(v.envio), 0) + num(form.basico) + num(form.extra);
    const texto = textoRendicion({
      nombre: hoja.cadete.nombre, viajes: vs, basico: num(form.basico), extra: num(form.extra), total, pagada: pagar, cuenta: form.cuenta,
      fecha: new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' }).replace(/-/g, '/'),
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

  async function pagar() {
    setTrabajando(true);
    try {
      await rpc('pagar_liquidacion', { p_id: pagarLiq.id, p_cuenta: pagarLiq.cuenta || 'efectivo' });
      avisar('Pago registrado en caja ✔');
      setPagarLiq(null);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  async function verRendicion(l) {
    const { data } = await supabase.from('comandas').select(SEL_VIAJE).eq('liquidacion_id', l.id).order('id');
    setRendicion({
      nombre: l.cadetes?.nombre || 'Cadete', tel: l.cadetes?.telefono,
      texto: textoRendicion({
        nombre: l.cadetes?.nombre || 'Cadete', viajes: data || [], basico: l.basico, extra: l.extra, total: l.total, pagada: l.pagada, cuenta: l.cuenta_pago,
        fecha: new Date(l.hasta || l.created_at).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' }).replace(/-/g, '/'),
      }),
    });
  }
  async function copiarRendicion() {
    try { await navigator.clipboard.writeText(rendicion.texto); avisar('Copiado ✔'); } catch { avisar('No se pudo copiar', 'error'); }
  }

  if (!cadetes) return <><Cabecera titulo="Turno cadete" /><Cargando /></>;

  const pendientesPago = liqs.filter((l) => !l.pagada);
  const pagadas = liqs.filter((l) => l.pagada).slice(0, 15);

  return (
    <>
      <Cabecera titulo="Turno cadete" sub={`Básico ${money(basicoDef)} + envíos de cada viaje`} />

      {cadetes.length === 0 && <Vacio emoji="🛵" texto="No hay cadetes cargados. Agregalos en Más → Configuración." />}
      {cadetes.length > 0 && !cadetes.some((c) => viajes.some((v) => v.cadete_id === c.id)) && (
        <div className="tarjeta centro">
          <div style={{ fontSize: 40 }}>🛵</div>
          <div className="item-titulo" style={{ fontSize: 17, marginTop: 4 }}>No hay turno abierto</div>
          <div className="suave" style={{ marginTop: 4 }}>
            {cadeteDelDia(cadetes) ? <>Hoy {DIAS_LARGO[diaSemanaOperativo()]} le toca a <b>{cadeteDelDia(cadetes).nombre}</b>. </> : 'Hoy no hay cadete asignado. '}
            El turno se abre solo con la primera comanda de delivery.
          </div>
        </div>
      )}

      {cadetes.filter((c) => viajes.some((v) => v.cadete_id === c.id)).map((c) => {
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
            {vs.length > 0 && (
              <button className="btn borde chico bloque" style={{ marginBottom: 8 }} onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
                {abierto === c.id ? 'Ocultar viajes' : `Ver ${vs.length} viajes`}
              </button>
            )}
            {abierto === c.id && (
              <div className="lista">
                {vs.map((v) => (
                  <div key={v.id} className="item">
                    <div className="item-cuerpo">
                      <div className="item-titulo">#{v.numero} {v.cliente_nombre || ''}</div>
                      <div className="item-sub">{hora(v.created_at)} · {v.cliente_direccion || 'sin dirección'}{v.estado === 'abierta' ? ' · ⏳ sin cobrar' : ''}</div>
                    </div>
                    <div className="item-der mono">{money(v.envio)}</div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn primario bloque" onClick={() => abrirCierre(c)}>Cerrar turno y liquidar</button>
          </div>
        );
      })}
      <p className="suave chico-t centro">Si no cerrás el turno, se cierra solo a las 3:00 AM y queda pendiente de pago acá abajo.</p>

      {pendientesPago.length > 0 && (
        <>
          <div className="seccion-titulo">Pendientes de pago</div>
          <div className="lista">
            {pendientesPago.map((l) => (
              <div key={l.id} className="item">
                <div className="item-cuerpo clic" onClick={() => setPagarLiq({ ...l, cuenta: 'efectivo' })}>
                  <div className="item-titulo">{l.cadetes?.nombre || 'Cadete'} · {l.viajes} viajes · <span className="rojo-t">{money(l.total)}</span></div>
                  <div className="item-sub">{l.tipo_cierre === 'auto' ? 'Cierre automático' : 'Cierre manual'} · {fechaHora(l.created_at)} · tocá para pagar</div>
                </div>
                <button className="ibtn" onClick={() => verRendicion(l)} aria-label="Rendición">📲</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="seccion-titulo">Liquidaciones pagadas</div>
      {pagadas.length === 0 ? <Vacio texto="Todavía no hay" /> : (
        <div className="lista">
          {pagadas.map((l) => (
            <div key={l.id} className="item">
              <div className="item-cuerpo">
                <div className="item-titulo">{l.cadetes?.nombre || 'Cadete'} · {l.viajes} viajes · {money(l.total)}</div>
                <div className="item-sub">{fechaHora(l.pagada_at)} · {nombreCuenta(l.cuenta_pago)} · envíos {money(l.total_envios)} + básico {money(l.basico)}</div>
              </div>
              <button className="ibtn" onClick={() => verRendicion(l)} aria-label="Rendición">📲</button>
            </div>
          ))}
        </div>
      )}

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

      <Hoja abierta={!!pagarLiq} titulo="Pagar liquidación" onCerrar={() => setPagarLiq(null)}
        pie={<button className="btn verde bloque" disabled={trabajando} onClick={pagar}>Pagar {pagarLiq ? money(pagarLiq.total) : ''}</button>}>
        {pagarLiq && (
          <>
            <div className="resumen-linea"><span>{pagarLiq.viajes} viajes</span><span className="mono">{money(pagarLiq.total_envios)}</span></div>
            <div className="resumen-linea"><span>Básico</span><span className="mono">{money(pagarLiq.basico)}</span></div>
            <div className="resumen-linea total"><span>Total</span><span className="mono">{money(pagarLiq.total)}</span></div>
            <div className="campo-label" style={{ marginTop: 12 }}>Se paga desde</div>
            <Chips valor={pagarLiq.cuenta} onCambio={(v) => setPagarLiq({ ...pagarLiq, cuenta: v })} opciones={CUENTAS.map((x) => ({ id: x.id, label: `${x.icono} ${x.nombre}` }))} />
          </>
        )}
      </Hoja>
      <Hoja abierta={!!rendicion} titulo={`Rendición · ${rendicion?.nombre || ''}`} onCerrar={() => setRendicion(null)}
        pie={rendicion && (
          <div className="fila-btns">
            <button className="btn borde" onClick={copiarRendicion}>📋 Copiar</button>
            <a className="btn verde" href={linkWhatsapp(rendicion.tel || '', rendicion.texto)} target="_blank" rel="noreferrer">📲 Mandar a {rendicion.nombre}</a>
          </div>
        )}>
        {rendicion && <pre className="previa-msj">{rendicion.texto}</pre>}
      </Hoja>
    </>
  );
}
