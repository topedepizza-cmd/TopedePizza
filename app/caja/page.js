'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Chips, Campo, Cargando, Vacio } from '@/components/ui';
import { money, num, hora, fechaHora, CUENTAS, nombreCuenta, iconoCuenta } from '@/lib/utils';

const fechaLarga = (f) => new Date(f + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

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
      await rpc('cerrar_jornada', { p_tipo: 'manual' });
      avisar('Caja cerrada ✔ Arranca una jornada nueva con el saldo');
      setHoja(null);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  async function borrarMov() {
    try {
      await rpc('eliminar_movimiento', { p_id: movBorrar.id });
      avisar('Movimiento borrado');
      setMovBorrar(null);
      await cargar();
    } catch (e) { avisar(e.message, 'error'); }
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
        {CUENTAS.map((c) => (
          <div className="saldo-card" key={c.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="saldo-ico">{c.icono}</span>
              <div><div className="item-titulo">{c.nombre}</div><div className="item-sub">Arrancó con {money(j['si_' + c.id])}</div></div>
            </div>
            <div className={`saldo-valor mono ${Number(saldos[c.id]) < 0 ? 'rojo-t' : ''}`}>{money(saldos[c.id])}</div>
          </div>
        ))}
        <div className="saldo-card" style={{ background: 'var(--fondo)' }}>
          <div className="item-titulo" style={{ fontSize: 16 }}>Total en caja</div>
          <div className="saldo-valor mono">{money(totalSaldo)}</div>
        </div>
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

      <div className="grid2" style={{ marginBottom: 8 }}>
        <button className="btn peligro" onClick={() => abrir('egreso')}>− Gasto / egreso</button>
        <button className="btn borde" onClick={() => abrir('ingreso')}>+ Ingreso extra</button>
      </div>
      <div className="grid2">
        <button className="btn borde" onClick={() => abrir('mover')}>⇄ Mover entre cuentas</button>
        <button className="btn primario" onClick={() => { setForm({ contado: '' }); setHoja('cerrar'); }}>🔒 Cerrar caja</button>
      </div>
      <p className="suave chico-t centro">Si no cerrás, se cierra sola a las 3:00 AM y arranca en 0 con el saldo de hoy.</p>

      <div className="seccion-titulo">Movimientos de hoy</div>
      {movs.length === 0 ? <Vacio texto="Sin movimientos todavía" /> : (
        <div className="lista">
          {movs.map((m) => (
            <div key={m.id} className="item clic" onClick={() => !m.comanda_id && !m.liquidacion_id && setMovBorrar(m)}>
              <div className="item-cuerpo">
                <div className="item-titulo">{m.concepto}</div>
                <div className="item-sub">{hora(m.created_at)} · {iconoCuenta(m.cuenta)} {nombreCuenta(m.cuenta)}{m.detalle ? ` · ${m.detalle}` : ''}</div>
              </div>
              <div className={`item-der mono ${m.tipo === 'ingreso' ? 'verde-t' : 'rojo-t'}`}>{m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}</div>
            </div>
          ))}
        </div>
      )}

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
      <Hoja abierta={!!movBorrar} titulo="Movimiento" onCerrar={() => setMovBorrar(null)}
        pie={<button className="btn peligro bloque" onClick={borrarMov}>Borrar movimiento</button>}>
        {movBorrar && <><div className="item-titulo">{movBorrar.concepto} · {money(movBorrar.monto)}</div><div className="suave">{nombreCuenta(movBorrar.cuenta)} {movBorrar.detalle ? '· ' + movBorrar.detalle : ''}</div></>}
      </Hoja>

      {/* HISTORIAL */}
      <Hoja abierta={!!verJornada} titulo={verJornada ? `Jornada ${fechaLarga(verJornada.fecha)}` : ''} onCerrar={() => setVerJornada(null)}>
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
    </>
  );
}
