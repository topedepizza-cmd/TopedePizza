'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from './AppShell';
import { Hoja, Chips } from './ui';
import { money, cant, fechaHora, nombreCuenta, iconoCuenta, CUENTAS, textoComanda, linkWhatsapp, linkMapa } from '@/lib/utils';

export default function VistaComanda({ comanda: c, items, cadete, recargar, recienCreada }) {
  const { config, avisar } = useApp();
  const router = useRouter();
  const [hojaCobro, setHojaCobro] = useState(false);
  const [forma, setForma] = useState(c.forma_pago);
  const [trabajando, setTrabajando] = useState(false);

  const texto = textoComanda(c, items, { negocio: config?.nombre_negocio });
  const linkCadete = linkWhatsapp(cadete?.telefono || '', texto);
  const msjCliente = (config?.mensaje_cliente || '')
    .replace('{cliente}', c.cliente_nombre || '')
    .replace('{numero}', c.numero)
    .replace('{total}', money(c.total))
    .replace('{alias}', config?.alias_pago || '');

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
  const reabrir = () => confirm('¿Deshacer el cobro? Se descuenta de la caja y la comanda vuelve a “sin cobrar”.') &&
    accion(() => rpc('reabrir_comanda', { p_id: c.id }), 'Cobro deshecho');
  const anular = () => {
    const motivo = prompt('Motivo de la anulación (opcional):');
    if (motivo === null) return;
    accion(() => rpc('anular_comanda', { p_id: c.id, p_motivo: motivo }), 'Comanda anulada');
  };
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); avisar('Copiado ✔'); } catch { avisar('No se pudo copiar', 'error'); }
  }

  const rendir = Number(c.total) + Number(c.vuelto_registrado || 0);

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Comanda #{c.numero}</h1>
          <div className="sub">{fechaHora(c.created_at)}</div>
        </div>
        <button className="btn borde chico" onClick={() => router.push('/')}>← Volver</button>
      </header>

      {c.estado === 'abierta' && <div className="aviso">⏳ Sin cobrar{Number(c.vuelto_registrado) > 0 ? ` · el cadete lleva ${money(c.vuelto_registrado)} de vuelto` : ''}</div>}
      {c.estado === 'cobrada' && <div className="aviso verde">✔ Cobrada por {nombreCuenta(c.forma_pago)} · {fechaHora(c.cobrada_at)}</div>}
      {c.estado === 'anulada' && <div className="aviso rojo">Anulada{c.motivo_anulacion ? `: ${c.motivo_anulacion}` : ''}</div>}

      {recienCreada && c.tipo_entrega === 'delivery' && c.estado !== 'anulada' && (
        <a className="btn verde bloque" style={{ marginBottom: 12, minHeight: 54, fontSize: 17 }} href={linkCadete} target="_blank" rel="noreferrer">
          📲 Enviar al cadete por WhatsApp
        </a>
      )}

      <div className="tarjeta">
        <h2>Cliente</h2>
        <div className="item-titulo" style={{ fontSize: 17 }}>{c.cliente_nombre || 'Sin nombre'}</div>
        {c.tipo_entrega === 'delivery' ? (
          c.cliente_direccion && <a className="item-sub" style={{ display: 'block', marginTop: 4 }} href={linkMapa(c.cliente_direccion)} target="_blank" rel="noreferrer">📍 {c.cliente_direccion}{c.cliente_referencia ? ` (${c.cliente_referencia})` : ''}</a>
        ) : <div className="item-sub">🏠 Retira en el local</div>}
        {c.cliente_telefono && <a className="item-sub" style={{ display: 'block', marginTop: 4 }} href={`tel:${c.cliente_telefono}`}>📞 {c.cliente_telefono}</a>}
        {c.tipo_entrega === 'delivery' && <div className="item-sub" style={{ marginTop: 4 }}>🛵 {cadete?.nombre || 'Sin cadete'}</div>}
      </div>

      <div className="tarjeta">
        <h2>Detalle</h2>
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
          <h2>Estado de entrega</h2>
          <Chips valor={c.estado_entrega} onCambio={setEntrega}
            opciones={[{ id: 'preparando', label: '👨‍🍳 Preparando' }, { id: 'en_camino', label: '🛵 En camino' }, { id: 'entregada', label: '✅ Entregada' }]} />
        </div>
      )}

      {c.estado !== 'anulada' && (
        <div className="fila-btns" style={{ marginBottom: 10 }}>
          {c.tipo_entrega === 'delivery' && !recienCreada && <a className="btn verde" href={linkCadete} target="_blank" rel="noreferrer">📲 Al cadete</a>}
          <button className="btn borde" onClick={copiar}>📋 Copiar</button>
          {c.cliente_telefono && <a className="btn borde" href={linkWhatsapp(c.cliente_telefono, msjCliente)} target="_blank" rel="noreferrer">💬 Avisar cliente</a>}
        </div>
      )}

      {c.estado === 'abierta' && (
        <>
          <button className="btn primario bloque" style={{ minHeight: 54, fontSize: 17, marginBottom: 10 }} onClick={() => { setForma(c.forma_pago); setHojaCobro(true); }}>
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
      <button className="btn borde bloque" style={{ marginTop: 18 }} onClick={() => router.push('/comanda/nueva')}>+ Nueva comanda</button>

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
