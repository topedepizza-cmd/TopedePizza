'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from './AppShell';
import { Hoja, Chips, Confirmar } from './ui';
import { money, cant, fechaHora, nombreCuenta, iconoCuenta, CUENTAS, textoComanda, linkWhatsapp, linkMapa, armarMensaje } from '@/lib/utils';

export default function VistaComanda({ comanda: c, items, cadete, recargar, recienCreada }) {
  const { config, avisar } = useApp();
  const router = useRouter();
  const [hojaCobro, setHojaCobro] = useState(false);
  const [forma, setForma] = useState(c.forma_pago);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [enviados, setEnviados] = useState({});
  const [linkMp, setLinkMp] = useState(null);
  const [errorMp, setErrorMp] = useState(null);
  const [nroPedido, setNroPedido] = useState(null);

  // cliente frecuente: número de pedido de este cliente
  useEffect(() => {
    if (!c.cliente_id) return;
    supabase.from('comandas').select('id', { count: 'exact', head: true })
      .eq('cliente_id', c.cliente_id).neq('estado', 'anulada').lte('id', c.id)
      .then(({ count }) => setNroPedido(count || null));
  }, [c.cliente_id, c.id]);

  // link de pago de Mercado Pago (si está activado en Configuración)
  useEffect(() => {
    if (!config?.mp_link_auto || c.estado === 'anulada' || c.estado === 'cobrada') return;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const r = await fetch('/api/mp-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
          body: JSON.stringify({ comanda_id: c.id }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setLinkMp(j.link);
      } catch (e) { setErrorMp(e.message); }
    })();
  }, [config?.mp_link_auto, c.id, c.total, c.estado]);

  const texto = textoComanda(c, items, { negocio: config?.nombre_negocio });
  const linkCadete = linkWhatsapp(cadete?.telefono || '', texto);
  const detalle = [
    ...items.map((i) => `• ${cant(i.cantidad)} ${i.descripcion} — ${money(i.subtotal)}`),
    ...(Number(c.envio) > 0 ? [`• Envío — ${money(c.envio)}`] : []),
    ...(Number(c.descuento) > 0 ? [`• Descuento — -${money(c.descuento)}`] : []),
  ].join('\n');
  const datosMsj = {
    cliente: (c.cliente_nombre || '').split(' ')[0], numero: c.numero, total: money(c.total), detalle,
    alias: config?.alias_pago || '', titular: config?.titular_pago || '', link_mp: linkMp || '',
  };
  const msjConfirmacion = armarMensaje(config?.mensaje_confirmacion || '¡Hola {cliente}! Recibimos tu pedido:\n\n{detalle}\n💰 Total: {total}\n\n🛵 Te avisamos cuando salga.', datosMsj);
  const msjSalio = armarMensaje(config?.mensaje_cliente || '¡Hola {cliente}! Tu pedido ya salió 🛵', datosMsj);
  const telCliente = c.cliente_telefono;

  async function marcarEnCamino() {
    if (c.estado_entrega !== 'en_camino' && c.estado_entrega !== 'entregada') {
      await supabase.from('comandas').update({ estado_entrega: 'en_camino' }).eq('id', c.id);
      recargar();
    }
  }

  async function accion(fn, okMsg) {
    setTrabajando(true);
    try { await fn(); avisar(okMsg); await recargar(); } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }
  const setEntrega = (estado) => accion(async () => {
    const { error } = await supabase.from('comandas').update({ estado_entrega: estado }).eq('id', c.id);
    if (error) throw error;
  }, 'Estado actualizado');
  const cobrar = () => accion(async () => { await rpc('cobrar_comanda', { p_id: c.id, p_forma: forma }); setHojaCobro(false); }, 'Comanda cobrada ✔');
  const reabrir = () => setConfirmar({
    titulo: '¿Deshacer el cobro?', mensaje: 'Se descuenta de la caja y la comanda vuelve a “sin cobrar”.', boton: 'Deshacer cobro',
    onOk: () => accion(() => rpc('reabrir_comanda', { p_id: c.id }), 'Cobro deshecho'),
  });
  const anular = () => setConfirmar({
    titulo: `¿Anular comanda #${c.numero}?`, mensaje: 'Se devuelve el stock y, si estaba cobrada, se descuenta de la caja.', boton: 'Anular', peligro: true,
    pedirTexto: 'Motivo (opcional)',
    onOk: (motivo) => accion(() => rpc('anular_comanda', { p_id: c.id, p_motivo: motivo || null }), 'Comanda anulada'),
  });
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); avisar('Copiado ✔'); } catch { avisar('No se pudo copiar', 'error'); }
  }

  const rendir = Number(c.total) + Number(c.vuelto_registrado || 0);

  return (
    <>
      <header className="cabecera">
        <div className="cab-izq">
          <img className="cab-logo" src="/logo-chico.png" alt="" />
          <div>
            <h1>Comanda #{c.numero}</h1>
            <div className="sub">{fechaHora(c.created_at)}</div>
          </div>
        </div>
        <button className="btn borde chico" onClick={() => router.push('/')}>← Volver</button>
      </header>

      {c.estado === 'abierta' && <div className="aviso">⏳ Sin cobrar{Number(c.vuelto_registrado) > 0 ? ` · el cadete lleva ${money(c.vuelto_registrado)} de vuelto` : ''}</div>}
      {c.estado === 'cobrada' && <div className="aviso verde">✔ Cobrada por {nombreCuenta(c.forma_pago)} · {fechaHora(c.cobrada_at)}</div>}
      {c.estado === 'anulada' && <div className="aviso rojo">Anulada{c.motivo_anulacion ? `: ${c.motivo_anulacion}` : ''}</div>}

      {c.estado !== 'anulada' && (
        <div className="tarjeta">
          <h2>💬 Mensajes</h2>
          {!telCliente && <div className="aviso" style={{ marginBottom: 10 }}>Este cliente no tiene teléfono: cargalo con ✏️ Editar para poder escribirle.</div>}
          <div className="pasos-msj">
            {telCliente && (
              <a className={`paso-msj${enviados.conf ? ' hecho' : ''}`} href={linkWhatsapp(telCliente, msjConfirmacion)} target="_blank" rel="noreferrer"
                onClick={() => setEnviados({ ...enviados, conf: true })}>
                <span className="paso-n">{enviados.conf ? '✔' : '1'}</span>
                <span><b>Confirmar pedido al cliente</b><small>Detalle, total{linkMp ? ', link de pago de Mercado Pago' : ''} y alias</small></span>
              </a>
            )}
            {c.tipo_entrega === 'delivery' && (
              <a className={`paso-msj${enviados.cad ? ' hecho' : ''}`} href={linkCadete} target="_blank" rel="noreferrer"
                onClick={() => setEnviados({ ...enviados, cad: true })}>
                <span className="paso-n">{enviados.cad ? '✔' : telCliente ? '2' : '1'}</span>
                <span><b>Pasar comanda al cadete {cadete?.nombre ? `(${cadete.nombre})` : ''}</b><small>Para que la tenga antes de salir: dirección con Google Maps y cuánto cobrar</small></span>
              </a>
            )}
            {telCliente && (
              <a className={`paso-msj${enviados.salio || c.estado_entrega !== 'preparando' ? ' hecho' : ''}`} href={linkWhatsapp(telCliente, msjSalio)} target="_blank" rel="noreferrer"
                onClick={() => { setEnviados({ ...enviados, salio: true }); marcarEnCamino(); }}>
                <span className="paso-n">{enviados.salio || c.estado_entrega !== 'preparando' ? '✔' : '3'}</span>
                <span><b>{c.tipo_entrega === 'delivery' ? '🛵 Salió: avisar al cliente' : 'Avisar que está listo para retirar'}</b><small>{c.tipo_entrega === 'delivery' ? 'Tocalo cuando el cadete sale. La comanda pasa a “En camino”.' : 'Le llega que ya puede pasar a buscarlo'}</small></span>
              </a>
            )}
            {!telCliente && c.tipo_entrega === 'delivery' && c.estado_entrega === 'preparando' && (
              <button className="btn borde bloque" onClick={marcarEnCamino}>🛵 Salió el pedido</button>
            )}
          </div>
          {errorMp && <div className="chico-t suave" style={{ marginTop: 8 }}>Link de Mercado Pago: {errorMp}</div>}
        </div>
      )}

      <div className="tarjeta">
        <h2>👤 Cliente</h2>
        <div className="item-titulo" style={{ fontSize: 17 }}>{c.cliente_nombre || 'Sin nombre'}</div>
        {nroPedido > 1 && (
          <div style={{ margin: '6px 0' }}>
            <span className={`badge ${nroPedido % (config?.premio_cada || 10) === 0 ? 'b-rojo' : 'b-ambar'}`}>
              ⭐ Cliente frecuente · pedido N° {nroPedido}{nroPedido % (config?.premio_cada || 10) === 0 ? ' 🎁 ¡le toca regalito!' : ''}
            </span>
          </div>
        )}
        {c.tipo_entrega === 'delivery' ? (
          c.cliente_direccion && <a className="item-sub" style={{ display: 'block', marginTop: 4 }} href={linkMapa(c.cliente_direccion)} target="_blank" rel="noreferrer">📍 {c.cliente_direccion}{c.cliente_referencia ? ` (${c.cliente_referencia})` : ''}</a>
        ) : <div className="item-sub">🏠 Retira en el local</div>}
        {c.cliente_telefono && <a className="item-sub" style={{ display: 'block', marginTop: 4 }} href={`tel:${c.cliente_telefono}`}>📞 {c.cliente_telefono}</a>}
        {c.tipo_entrega === 'delivery' && <div className="item-sub" style={{ marginTop: 4 }}>🛵 {cadete?.nombre || 'Sin cadete'}</div>}
      </div>

      <div className="tarjeta">
        <h2>🧾 Detalle</h2>
        {items.map((i) => (
          <div key={i.id} className="resumen-linea"><span>{cant(i.cantidad)} × {i.descripcion}</span><span className="mono">{money(i.subtotal)}</span></div>
        ))}
        {Number(c.envio) > 0 && <div className="resumen-linea suave"><span>Envío</span><span className="mono">{money(c.envio)}</span></div>}
        {Number(c.descuento) > 0 && <div className="resumen-linea suave"><span>Descuento</span><span className="mono">-{money(c.descuento)}</span></div>}
        <div className="resumen-linea total"><span>Total</span><span className="mono">{money(c.total)}</span></div>
        <div className="resumen-linea suave chico-t"><span>{iconoCuenta(c.forma_pago)} {nombreCuenta(c.forma_pago)}{Number(c.paga_con) > 0 ? ` · paga con ${money(c.paga_con)}` : ''}</span>
          {Number(c.vuelto) > 0 && <span>Vuelto {money(c.vuelto)}</span>}</div>
        {c.notas && <div className="aviso" style={{ marginTop: 10, marginBottom: 0 }}>📝 {c.notas}</div>}
      </div>

      {c.estado !== 'anulada' && c.tipo_entrega === 'delivery' && (
        <div className="tarjeta">
          <h2>🛵 Estado de entrega</h2>
          <Chips valor={c.estado_entrega} onCambio={setEntrega}
            opciones={[{ id: 'preparando', label: '👨‍🍳 Preparando' }, { id: 'en_camino', label: '🛵 En camino' }, { id: 'entregada', label: '✅ Entregada' }]} />
        </div>
      )}

      {c.estado !== 'anulada' && (
        <button className="btn borde bloque" style={{ marginBottom: 10 }} onClick={copiar}>📋 Copiar comanda</button>
      )}

      {c.estado === 'abierta' && (
        <>
          <button className="btn primario bloque grande" style={{ marginBottom: 10 }} onClick={() => { setForma(c.forma_pago); setHojaCobro(true); }}>
            💰 Cobrar {c.forma_pago === 'efectivo' && c.tipo_entrega === 'delivery' ? '/ rendición cadete' : ''}
          </button>
          <div className="fila-btns">
            <button className="btn borde" onClick={() => router.push(`/comanda/${c.id}?editar=1`)}>✏️ Editar</button>
            <button className="btn peligro" disabled={trabajando} onClick={anular}>Anular</button>
          </div>
        </>
      )}
      {c.estado === 'cobrada' && (
        <div className="fila-btns">
          <button className="btn borde" disabled={trabajando} onClick={reabrir}>↩️ Deshacer cobro</button>
          <button className="btn peligro" disabled={trabajando} onClick={anular}>Anular</button>
        </div>
      )}
      <button className="btn amarillo bloque grande" style={{ marginTop: 18 }} onClick={() => router.push('/comanda/nueva')}>＋ Nueva comanda</button>
      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />

      <Hoja abierta={hojaCobro} titulo={`Cobrar #${c.numero}`} onCerrar={() => setHojaCobro(false)}
        pie={<button className="btn verde bloque" disabled={trabajando} onClick={cobrar}>Confirmar cobro de {money(c.total)}</button>}>
        <div className="campo-label">¿Cómo pagó?</div>
        <Chips valor={forma} onCambio={setForma} opciones={CUENTAS.map((x) => ({ id: x.id, label: `${x.icono} ${x.nombre}` }))} />
        <div className="tarjeta" style={{ marginTop: 14 }}>
          <div className="resumen-linea"><span>Total comanda</span><b className="mono">{money(c.total)}</b></div>
          {Number(c.vuelto_registrado) > 0 && <div className="resumen-linea"><span>+ Vuelto que se llevó</span><b className="mono">{money(c.vuelto_registrado)}</b></div>}
          {Number(c.vuelto_registrado) > 0 && (
            <div className="resumen-linea total"><span>El cadete rinde en efectivo</span><span className="mono">{money(forma === 'efectivo' ? rendir : c.vuelto_registrado)}</span></div>
          )}
        </div>
        {forma !== 'efectivo' && Number(c.vuelto_registrado) > 0 && (
          <div className="aviso">Pagó por {nombreCuenta(forma)}: el cadete solo te devuelve el vuelto ({money(c.vuelto_registrado)}).</div>
        )}
      </Hoja>
    </>
  );
}
