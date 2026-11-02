'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, rpc, traerTodo } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Chips, Campo, Cargando, Vacio } from '@/components/ui';
import { money, num, hora, fechaHora, CUENTAS, nombreCuenta, iconoCuenta, linkWhatsapp, depurarMovimientos, categoriaMov, CATEGORIAS } from '@/lib/utils';

const fechaLarga = (f) => new Date(f + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

const INTERNOS_EGRESO = ['Vuelto a cadete', 'Movimiento entre cuentas', 'Anulación venta', 'Cobro deshecho'];
const INTERNOS_INGRESO = ['Venta', 'Devolución vuelto cadete', 'Ajuste vuelto cadete', 'Movimiento entre cuentas'];

// resumen del cierre para mandarle a la socia
function textoCierre({ jornada, movs, comandas, finales }) {
  const sum = (f) => movs.filter(f).reduce((a, m) => a + Number(m.monto), 0);
  const ventaCuenta = (c) => sum((m) => m.cuenta === c && m.concepto === 'Venta') - sum((m) => m.cuenta === c && ['Anulación venta', 'Cobro deshecho'].includes(m.concepto));
  const validas = comandas.filter((c) => c.estado !== 'anulada');
  const abiertas = validas.filter((c) => c.estado === 'abierta');
  const gastos = movs.filter((m) => m.tipo === 'egreso' && !INTERNOS_EGRESO.includes(m.concepto));
  const extras = movs.filter((m) => m.tipo === 'ingreso' && !INTERNOS_INGRESO.includes(m.concepto));
  const fecha = new Date(jornada.fecha + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' }).replace(/-/g, '/');
  const l = [`🍕 *Cierre Tope de Pizza* — ${fecha}`, ''];
  l.push(`🧾 Comandas: ${validas.length} · Vendido: *${money(validas.reduce((a, c) => a + Number(c.total), 0))}*`);
  l.push(`💵 Cobrado en efectivo: ${money(ventaCuenta('efectivo'))}`);
  l.push(`📱 Cobrado por Mercado Pago: ${money(ventaCuenta('mercadopago'))}`);
  if (abiertas.length) l.push(`⏳ Sin cobrar: ${abiertas.length} (${money(abiertas.reduce((a, c) => a + Number(c.total), 0))})`);
  const anuladas = comandas.length - validas.length;
  if (anuladas) l.push(`❌ Anuladas: ${anuladas}`);
  l.push('');
  l.push(`💸 Gastos: ${money(gastos.reduce((a, m) => a + Number(m.monto), 0))}`);
  gastos.forEach((m) => l.push(`   • ${m.concepto}${m.detalle ? ` (${m.detalle})` : ''}: ${money(m.monto)}`));
  if (extras.length) {
    l.push(`➕ Ingresos extra: ${money(extras.reduce((a, m) => a + Number(m.monto), 0))}`);
    extras.forEach((m) => l.push(`   • ${m.concepto}${m.detalle ? ` (${m.detalle})` : ''}: ${money(m.monto)}`));
  }
  l.push('');
  l.push('🏦 *Saldos al cierre*');
  l.push(`   💵 Efectivo: ${money(finales.efectivo)}`);
  l.push(`   📱 Mercado Pago: ${money(finales.mercadopago)}`);
  l.push(`   *Total: ${money(Number(finales.efectivo) + Number(finales.mercadopago) + Number(finales.transferencia || 0))}*`);
  return l.join('\n');
}

export default function Caja() {
  const { config, avisar } = useApp();
  const [j, setJ] = useState(null);
  const [saldos, setSaldos] = useState(null);
  const [movs, setMovs] = useState([]);
  const [pend, setPend] = useState({ total: 0, vuelto: 0, n: 0 });
  const [historial, setHistorial] = useState([]);
  const [hoja, setHoja] = useState(null); // 'egreso' | 'ingreso' | 'mover' | 'cerrar'
  const [form, setForm] = useState({});
  const [verJornada, setVerJornada] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [mes, setMes] = useState(null);
  const router = useRouter();
  const [movBorrar, setMovBorrar] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const jj = await rpc('jornada_actual');
      setJ(jj);
      const [s, { data: m }, { data: ab }, { data: h }] = await Promise.all([
        rpc('saldos_jornada', { p_jornada: jj.id }),
        supabase.from('movimientos').select('*').eq('jornada_id', jj.id).order('id', { ascending: false }),
        supabase.from('comandas').select('total, vuelto_registrado').eq('estado', 'abierta'),
        supabase.from('jornadas').select('*').eq('abierta', false).order('id', { ascending: false }).limit(30),
      ]);
      setSaldos(s?.[0] || { efectivo: 0, transferencia: 0, mercadopago: 0 });
      setMovs(m || []);
      setPend({
        total: (ab || []).reduce((a, x) => a + Number(x.total), 0),
        vuelto: (ab || []).reduce((a, x) => a + Number(x.vuelto_registrado || 0), 0),
        n: (ab || []).length,
      });
      setHistorial(h || []);
      // resumen del mes en curso
      const hoy = new Date(jj.fecha + 'T12:00');
      const primero = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
      const { data: jm } = await supabase.from('jornadas').select('id').gte('fecha', primero);
      const ids = (jm || []).map((x) => x.id);
      const mm = ids.length ? await traerTodo(() => supabase.from('movimientos').select('tipo, concepto, monto, cuenta').in('jornada_id', ids).order('id')) : [];
      const sum = (f) => mm.filter(f).reduce((a, x) => a + Number(x.monto), 0);
      setMes({
        nombre: hoy.toLocaleDateString('es-AR', { month: 'long' }),
        ventas: sum((x) => x.concepto === 'Venta') - sum((x) => ['Anulación venta', 'Cobro deshecho'].includes(x.concepto)),
        gastos: sum((x) => x.tipo === 'egreso' && !INTERNOS_EGRESO.includes(x.concepto) && x.concepto !== 'Retiro socios'),
        retiros: sum((x) => x.concepto === 'Retiro socios'),
        cadete: sum((x) => x.concepto === 'Pago cadete'),
      });
    } catch (e) { avisar(e.message, 'error'); }
  }, [avisar]);

  useEffect(() => { cargar(); }, [cargar]);

  function abrir(tipo) {
    const conceptos = tipo === 'egreso' ? config?.conceptos_egreso : config?.conceptos_ingreso;
    setForm({ cuenta: 'efectivo', hacia: 'mercadopago', monto: '', concepto: conceptos?.[0] || '', detalle: '', contado: '' });
    setHoja(tipo);
  }

  async function guardarMov() {
    setTrabajando(true);
    try {
      if (hoja === 'mover') {
        await rpc('mover_entre_cuentas', { p_desde: form.cuenta, p_hacia: form.hacia, p_monto: num(form.monto), p_detalle: form.detalle });
      } else {
        await rpc('registrar_movimiento', { p_tipo: hoja, p_cuenta: form.cuenta, p_monto: num(form.monto), p_concepto: form.concepto || 'Otros', p_detalle: form.detalle });
      }
      avisar('Movimiento registrado ✔');
      setHoja(null);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  async function cerrarCaja() {
    setTrabajando(true);
    try {
      if (form.contado !== '') {
        const dif = num(form.contado) - Number(saldos.efectivo);
        if (Math.abs(dif) >= 1) {
          await rpc('registrar_movimiento', { p_tipo: dif > 0 ? 'ingreso' : 'egreso', p_cuenta: 'efectivo', p_monto: Math.abs(dif), p_concepto: 'Diferencia de arqueo', p_detalle: `Contado ${money(num(form.contado))}` });
        }
      }
      const jCerrada = j;
      await rpc('cerrar_jornada', { p_tipo: 'manual' });
      avisar('Caja cerrada ✔ Arranca una jornada nueva con el saldo');
      setHoja(null);
      await armarResumen(jCerrada, null);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  // la lista de hoy sin los cobros deshechos/anulados (errores corregidos)
  const movsVer = depurarMovimientos(movs);

  async function borrarMov() {
    try {
      await rpc('eliminar_movimiento', { p_id: movBorrar.id });
      avisar('Movimiento eliminado ✔');
      setMovBorrar(null);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
  }

  // arma el resumen de una jornada (finales = saldos guardados al cierre)
  async function armarResumen(jor, finales) {
    const [{ data: m }, { data: cs }, sal] = await Promise.all([
      supabase.from('movimientos').select('*').eq('jornada_id', jor.id).order('id'),
      supabase.from('comandas').select('id, total, estado').eq('jornada_id', jor.id),
      finales ? Promise.resolve(null) : rpc('saldos_jornada', { p_jornada: jor.id }),
    ]);
    const fin = finales || sal?.[0] || { efectivo: 0, mercadopago: 0, transferencia: 0 };
    setResumen(textoCierre({ jornada: jor, movs: m || [], comandas: cs || [], finales: fin }));
  }
  async function copiarResumen() {
    try { await navigator.clipboard.writeText(resumen); avisar('Copiado ✔'); } catch { avisar('No se pudo copiar', 'error'); }
  }

  async function abrirHistorial(h) {
    const { data } = await supabase.from('movimientos').select('*').eq('jornada_id', h.id).order('id');
    setVerJornada({ ...h, movs: data || [] });
  }

  if (!j || !saldos) return <><Cabecera titulo="Caja" /><Cargando /></>;

  const totalSaldo = Number(saldos.efectivo) + Number(saldos.transferencia) + Number(saldos.mercadopago);
  const suma = (filtro) => movs.filter(filtro).reduce((a, m) => a + Number(m.monto), 0);
  const ventas = suma((m) => m.concepto === 'Venta') - suma((m) => ['Anulación venta', 'Cobro deshecho'].includes(m.concepto));
  const gastos = suma((m) => m.tipo === 'egreso' && !['Vuelto a cadete', 'Movimiento entre cuentas', 'Anulación venta', 'Cobro deshecho'].includes(m.concepto));
  const conceptos = (hoja === 'egreso' ? config?.conceptos_egreso : config?.conceptos_ingreso) || [];

  return (
    <>
      <Cabecera titulo="Caja" sub={`Jornada ${fechaLarga(j.fecha)} · abierta ${hora(j.abierta_at)}`} />

      <div className="lista">
        {CUENTAS.map((c) => {
          const ing = movs.filter((m) => m.cuenta === c.id && m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto), 0);
          const egr = movs.filter((m) => m.cuenta === c.id && m.tipo === 'egreso').reduce((a, m) => a + Number(m.monto), 0);
          return (
            <Link href={`/caja/movimientos?cuenta=${c.id}`} className="saldo-card clic" key={c.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span className="saldo-ico">{c.icono}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="item-titulo">{c.nombre}</div>
                  <div className="item-sub">Arrancó con {money(j['si_' + c.id])}</div>
                  <div className="item-sub">Hoy <span className="verde-t">+{money(ing)}</span> · <span className="rojo-t">−{money(egr)}</span> · ver movimientos</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div className={`saldo-valor mono ${Number(saldos[c.id]) < 0 ? 'rojo-t' : ''}`}>{money(saldos[c.id])}</div>
                <span className="saldo-flecha">›</span>
              </div>
            </Link>
          );
        })}
        <Link href="/caja/movimientos" className="saldo-card clic" style={{ background: 'var(--fondo)' }}>
          <div className="item-titulo" style={{ fontSize: 16 }}>Total en caja</div>
          <div style={{ display: 'flex', alignItems: 'center' }}><div className="saldo-valor mono">{money(totalSaldo)}</div><span className="saldo-flecha">›</span></div>
        </Link>
      </div>

      {pend.n > 0 && (
        <div className="aviso">
          ⏳ {pend.n} comandas sin cobrar: {money(pend.total)}
          {pend.vuelto > 0 && <> · el cadete tiene {money(pend.vuelto)} de vuelto</>}
          <br /><b>Cuando rinda todo, efectivo esperado ≈ {money(Number(saldos.efectivo) + pend.vuelto + pend.total)}</b> (si todas son en efectivo)
        </div>
      )}

      <div className="kpis">
        <div className="kpi"><div className="k-label">Ventas cobradas hoy</div><div className="k-valor verde-t">{money(ventas)}</div></div>
        <div className="kpi"><div className="k-label">Gastos hoy</div><div className="k-valor rojo-t">{money(gastos)}</div></div>
      </div>

      <div className="grid3" style={{ marginBottom: 14 }}>
        <Link href="/caja/movimientos?tipo=ingreso&modo=mes" className="btn borde chico" style={{ minHeight: 48 }}>📥 Ingresos</Link>
        <Link href="/caja/movimientos?tipo=egreso&modo=mes" className="btn borde chico" style={{ minHeight: 48 }}>📤 Egresos</Link>
        <Link href="/caja/movimientos" className="btn borde chico" style={{ minHeight: 48 }}>📋 Todo</Link>
      </div>

      <div className="grid2" style={{ marginBottom: 8 }}>
        <button className="btn peligro" onClick={() => abrir('egreso')}>− Gasto / egreso</button>
        <button className="btn borde" onClick={() => abrir('ingreso')}>+ Ingreso extra</button>
      </div>
      <div className="grid2">
        <button className="btn borde" onClick={() => abrir('mover')}>⇄ Mover entre cuentas</button>
        <button className="btn primario" onClick={() => { setForm({ contado: '' }); setHoja('cerrar'); }}>🔒 Cerrar caja</button>
      </div>
      <button className="btn borde bloque" style={{ marginTop: 8 }} onClick={() => armarResumen(j, null)}>📲 Resumen de hoy para mi socia</button>
      <p className="suave chico-t centro">Si no cerrás, se cierra sola a las 3:00 AM y arranca en 0 con el saldo de hoy. Los cierres anteriores también se pueden mandar desde abajo.</p>

      {mes && (
        <div className="tarjeta">
          <h2 style={{ textTransform: 'none' }}>📅 Resumen de {mes.nombre}</h2>
          <div className="resumen-linea"><span>Ventas cobradas</span><b className="mono verde-t">{money(mes.ventas)}</b></div>
          <div className="resumen-linea"><span>Gastos (con cadetes)</span><b className="mono rojo-t">−{money(mes.gastos)}</b></div>
          <div className="resumen-linea suave chico-t"><span>   de eso, pagos a cadetes</span><span className="mono">{money(mes.cadete)}</span></div>
          <div className="resumen-linea total"><span>Resultado</span><span className={`mono ${mes.ventas - mes.gastos >= 0 ? 'verde-t' : 'rojo-t'}`}>{money(mes.ventas - mes.gastos)}</span></div>
          {mes.retiros > 0 && <div className="resumen-linea"><span>Retiros de socios</span><b className="mono">{money(mes.retiros)}</b></div>}
          <Link href="/caja/movimientos?modo=mes" className="btn borde chico bloque" style={{ marginTop: 10 }}>Ver el mes y descargar Excel / PDF</Link>
        </div>
      )}

      <div className="seccion-titulo" style={{ justifyContent: 'space-between' }}>
        Movimientos de hoy
        {movs.length > 0 && <Link href="/caja/movimientos" className="chico-t rojo-t" style={{ fontFamily: 'inherit' }}>Ver todos ›</Link>}
      </div>
      {movs.length === 0 ? <Vacio texto="Sin movimientos todavía" /> : (
        <div className="lista">
          {movsVer.slice(0, 12).map((m) => { const cat = CATEGORIAS[categoriaMov(m)]; return (
            <div key={m.id} className="item clic" onClick={() => (m.comanda_id ? router.push(`/comanda/${m.comanda_id}`) : m.liquidacion_id ? router.push('/cadete') : setMovBorrar(m))}>
              <div className="item-cuerpo">
                <div className="item-titulo"><span className={`badge ${cat.clase}`} style={{ marginRight: 6 }}>{cat.icono} {cat.nombre}</span>{m.concepto !== 'Venta' && m.concepto}</div>
                <div className="item-sub">{hora(m.created_at)} · {iconoCuenta(m.cuenta)} {nombreCuenta(m.cuenta)}{m.detalle ? ` · ${m.detalle}` : ''}</div>
              </div>
              <div className={`item-der mono ${m.tipo === 'ingreso' ? 'verde-t' : 'rojo-t'}`}>{m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}</div>
            </div>
          ); })}
        </div>
      )}
      {movsVer.length > 0 && <p className="suave chico-t centro">Tocá un gasto o ingreso cargado a mano para eliminarlo. Las ventas se corrigen desde su comanda.</p>}

      <div className="seccion-titulo">Cierres anteriores</div>
      {historial.length === 0 ? <Vacio texto="Todavía no hay cierres" /> : (
        <div className="lista">
          {historial.map((h) => (
            <div key={h.id} className="item clic" onClick={() => abrirHistorial(h)}>
              <div className="item-cuerpo">
                <div className="item-titulo">{fechaLarga(h.fecha)}</div>
                <div className="item-sub">Cierre {h.cierre_tipo === 'auto' ? 'automático 3 AM' : 'manual'} · {fechaHora(h.cerrada_at)}</div>
              </div>
              <div className="item-der mono">{money(Number(h.sf_efectivo) + Number(h.sf_transferencia) + Number(h.sf_mercadopago))}</div>
            </div>
          ))}
        </div>
      )}

      {/* MOVIMIENTO */}
      <Hoja abierta={['egreso', 'ingreso', 'mover'].includes(hoja)} onCerrar={() => setHoja(null)}
        titulo={hoja === 'egreso' ? 'Registrar gasto' : hoja === 'ingreso' ? 'Ingreso extra' : 'Mover entre cuentas'}
        pie={<button className="btn primario bloque" disabled={trabajando || !num(form.monto)} onClick={guardarMov}>Guardar {num(form.monto) ? money(num(form.monto)) : ''}</button>}>
        <Campo label="Monto"><input inputMode="numeric" placeholder="$" value={form.monto || ''} onChange={(e) => setForm({ ...form, monto: e.target.value })} autoFocus /></Campo>
        <div className="campo-label">{hoja === 'mover' ? 'Desde' : 'Cuenta'}</div>
        <Chips valor={form.cuenta} onCambio={(v) => setForm({ ...form, cuenta: v })} opciones={CUENTAS.map((c) => ({ id: c.id, label: `${c.icono} ${c.nombre}` }))} />
        {hoja === 'mover' ? (
          <>
            <div className="campo-label" style={{ marginTop: 12 }}>Hacia</div>
            <Chips valor={form.hacia} onCambio={(v) => setForm({ ...form, hacia: v })} opciones={CUENTAS.map((c) => ({ id: c.id, label: `${c.icono} ${c.nombre}` }))} />
          </>
        ) : (
          <>
            <div className="campo-label" style={{ marginTop: 12 }}>Concepto</div>
            <div className="chips envuelve">
              {conceptos.map((c) => <button key={c} className={form.concepto === c ? 'chip activo' : 'chip'} onClick={() => setForm({ ...form, concepto: c })}>{c}</button>)}
            </div>
          </>
        )}
        <div style={{ marginTop: 12 }}><Campo label="Detalle (opcional)"><input value={form.detalle || ''} onChange={(e) => setForm({ ...form, detalle: e.target.value })} placeholder="Ej: 10 kg harina" /></Campo></div>
      </Hoja>

      {/* CERRAR */}
      <Hoja abierta={hoja === 'cerrar'} titulo="Cerrar caja" onCerrar={() => setHoja(null)}
        pie={<button className="btn primario bloque" disabled={trabajando} onClick={cerrarCaja}>Confirmar cierre</button>}>
        {CUENTAS.map((c) => <div key={c.id} className="resumen-linea"><span>{c.icono} {c.nombre}</span><b className="mono">{money(saldos[c.id])}</b></div>)}
        <div className="resumen-linea total"><span>Total</span><span className="mono">{money(totalSaldo)}</span></div>
        <div style={{ marginTop: 14 }}>
          <Campo label="Efectivo contado (opcional)" ayuda="Si lo cargás y no coincide, se registra la diferencia de arqueo.">
            <input inputMode="numeric" placeholder={money(saldos.efectivo)} value={form.contado || ''} onChange={(e) => setForm({ ...form, contado: e.target.value })} />
          </Campo>
          {form.contado !== '' && form.contado !== undefined && (
            <div className={Math.abs(num(form.contado) - saldos.efectivo) < 1 ? 'aviso verde' : 'aviso rojo'}>
              Diferencia: {money(num(form.contado) - Number(saldos.efectivo))}
            </div>
          )}
        </div>
        {pend.n > 0 && <div className="aviso">Quedan {pend.n} comandas sin cobrar: siguen abiertas y se cobran en la jornada siguiente.</div>}
      </Hoja>

      {/* BORRAR */}
      <Hoja abierta={!!movBorrar} titulo={movBorrar ? `${movBorrar.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} · ${money(movBorrar.monto)}` : ''} onCerrar={() => setMovBorrar(null)}
        pie={<button className="btn peligro bloque" onClick={borrarMov}>🗑 Eliminar {movBorrar?.tipo === 'ingreso' ? 'ingreso' : 'egreso'}</button>}>
        {movBorrar && (
          <>
            <div className="resumen-linea"><span>Concepto</span><b>{movBorrar.concepto}</b></div>
            {movBorrar.detalle && <div className="resumen-linea"><span>Detalle</span><span>{movBorrar.detalle}</span></div>}
            <div className="resumen-linea"><span>Cuenta</span><span>{iconoCuenta(movBorrar.cuenta)} {nombreCuenta(movBorrar.cuenta)}</span></div>
            <div className="resumen-linea"><span>Hora</span><span>{hora(movBorrar.created_at)}</span></div>
            {movBorrar.concepto === 'Movimiento entre cuentas' && <div className="aviso azul" style={{ marginTop: 8 }}>Se borran las dos partes del pase entre cuentas.</div>}
          </>
        )}
      </Hoja>

      {/* HISTORIAL */}
      <Hoja abierta={!!verJornada} titulo={verJornada ? `Jornada ${fechaLarga(verJornada.fecha)}` : ''} onCerrar={() => setVerJornada(null)}
        pie={verJornada && (
          <div className="fila-btns">
            <button className="btn borde" onClick={() => router.push(`/caja/movimientos?desde=${verJornada.fecha}&hasta=${verJornada.fecha}`)}>📋 Movimientos / PDF</button>
            <button className="btn verde" onClick={() => { const h = verJornada; setVerJornada(null); armarResumen(h, { efectivo: h.sf_efectivo, mercadopago: h.sf_mercadopago, transferencia: h.sf_transferencia }); }}>
              📲 A mi socia
            </button>
          </div>
        )}>
        {verJornada && (
          <>
            {CUENTAS.map((c) => (
              <div key={c.id} className="resumen-linea"><span>{c.icono} {c.nombre}</span><span className="mono">{money(verJornada['si_' + c.id])} → <b>{money(verJornada['sf_' + c.id])}</b></span></div>
            ))}
            <hr className="sep" />
            {verJornada.movs.length === 0 ? <Vacio texto="Sin movimientos" /> : verJornada.movs.map((m) => (
              <div key={m.id} className="resumen-linea chico-t">
                <span>{hora(m.created_at)} {m.concepto} <span className="suave">({nombreCuenta(m.cuenta)})</span></span>
                <span className={`mono ${m.tipo === 'ingreso' ? 'verde-t' : 'rojo-t'}`}>{m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}</span>
              </div>
            ))}
          </>
        )}
      </Hoja>
      {/* RESUMEN PARA LA SOCIA */}
      <Hoja abierta={!!resumen} titulo="Resumen del cierre" onCerrar={() => setResumen(null)}
        pie={resumen && (
          <div className="fila-btns">
            <button className="btn borde" onClick={copiarResumen}>📋 Copiar</button>
            <a className="btn verde" href={linkWhatsapp(config?.tel_socia || '', resumen)} target="_blank" rel="noreferrer">📲 Mandar a mi socia</a>
          </div>
        )}>
        {!config?.tel_socia && <div className="aviso">Cargá el WhatsApp de tu socia en Más → Configuración para mandárselo directo.</div>}
        {resumen && <pre className="previa-msj">{resumen}</pre>}
      </Hoja>
    </>
  );
}
