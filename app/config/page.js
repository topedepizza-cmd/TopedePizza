'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Campo, Cargando, Chips, Confirmar } from '@/components/ui';
import { money, num, DIAS } from '@/lib/utils';



export default function Config() {
  const { config, cargarConfig, avisar, esAdmin, session } = useApp();
  const [confirmar, setConfirmar] = useState(null);
  const [f, setF] = useState(null);
  const [cadetes, setCadetes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [editCad, setEditCad] = useState(null);
  const [nuevoUsr, setNuevoUsr] = useState(null);
  const [passDe, setPassDe] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: c }, { data: u }] = await Promise.all([
      supabase.from('cadetes').select('*').order('nombre'),
      supabase.from('perfiles').select('*').order('created_at'),
    ]);
    setCadetes(c || []);
    setUsuarios(u || []);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (config && !f) {
      setF({
        nombre_negocio: config.nombre_negocio || '', telefono_negocio: config.telefono_negocio || '',
        alias_pago: config.alias_pago || '', titular_pago: config.titular_pago || '',
        tel_socia: config.tel_socia || '', premio_cada: String(config.premio_cada ?? 10),
        basico_cadete: String(config.basico_cadete ?? 15000), envios: (config.envios_sugeridos || []).join(', '),
        egresos: (config.conceptos_egreso || []).join('\n'), ingresos: (config.conceptos_ingreso || []).join('\n'),
        mensaje_confirmacion: config.mensaje_confirmacion || '', mensaje_cliente: config.mensaje_cliente || '',
      });
    }
  }, [config, f]);

  async function guardarConfig() {
    setTrabajando(true);
    const d = {
      nombre_negocio: f.nombre_negocio.trim() || 'Tope de Pizza', telefono_negocio: f.telefono_negocio || null,
      alias_pago: f.alias_pago.trim() || null, titular_pago: f.titular_pago.trim() || null,
      tel_socia: f.tel_socia.trim() || null, premio_cada: Math.max(num(f.premio_cada), 2),
      basico_cadete: num(f.basico_cadete),
      envios_sugeridos: f.envios.split(/[,;\n]/).map((x) => num(x)).filter((x) => x > 0),
      conceptos_egreso: f.egresos.split('\n').map((x) => x.trim()).filter(Boolean),
      conceptos_ingreso: f.ingresos.split('\n').map((x) => x.trim()).filter(Boolean),
      mensaje_confirmacion: f.mensaje_confirmacion, mensaje_cliente: f.mensaje_cliente,
    };
    const { error } = await supabase.from('config').update(d).eq('id', 1);
    setTrabajando(false);
    if (error) return avisar(error.message, 'error');
    await cargarConfig();
    avisar('Configuración guardada ✔');
  }

  async function guardarCadete() {
    const d = { nombre: editCad.nombre.trim(), telefono: editCad.telefono || null, activo: editCad.activo !== false, dias: editCad.dias || [] };
    if (!d.nombre) return avisar('Poné un nombre', 'error');
    const { error } = editCad.id ? await supabase.from('cadetes').update(d).eq('id', editCad.id) : await supabase.from('cadetes').insert(d);
    if (error) return avisar(error.message, 'error');
    setEditCad(null);
    cargar();
  }
  function toggleDia(i) {
    const ds = new Set(editCad.dias || []);
    ds.has(i) ? ds.delete(i) : ds.add(i);
    setEditCad({ ...editCad, dias: [...ds].sort() });
  }

  async function llamarApi(metodo, cuerpo) {
    const { data } = await supabase.auth.getSession();
    const r = await fetch('/api/usuarios', {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error');
    return j;
  }

  async function crearUsuario() {
    setTrabajando(true);
    try {
      const r = await llamarApi('POST', nuevoUsr);
      avisar(`Usuario "${r.usuario}" creado ✔`);
      setNuevoUsr(null);
      cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }
  async function cambiarPassDe() {
    setTrabajando(true);
    try {
      await llamarApi('PATCH', { id: passDe.id, password: passDe.password });
      avisar(`Contraseña de ${passDe.nombre} cambiada ✔`);
      setPassDe(null);
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }
  function borrarUsuario(u) {
    setConfirmar({
      titulo: `¿Borrar a ${u.nombre}?`, mensaje: `Ya no va a poder entrar con "${u.usuario}".`, boton: 'Borrar', peligro: true,
      onOk: async () => {
        try { await llamarApi('DELETE', { id: u.id }); avisar('Usuario borrado'); cargar(); } catch (e) { avisar(e.message, 'error'); }
      },
    });
  }

  if (!f) return <><Cabecera titulo="Configuración" /><Cargando /></>;

  return (
    <>
      <Cabecera titulo="Configuración" />

      <div className="tarjeta">
        <h2>🍕 Negocio</h2>
        <Campo label="Nombre de la pizzería"><input value={f.nombre_negocio} onChange={(e) => setF({ ...f, nombre_negocio: e.target.value })} /></Campo>
        <Campo label="Teléfono del local"><input inputMode="tel" value={f.telefono_negocio} onChange={(e) => setF({ ...f, telefono_negocio: e.target.value })} /></Campo>
      </div>

      <div className="tarjeta">
        <h2>💬 Mensajes al cliente</h2>
        <div className="grid2">
          <Campo label="Alias para cobrar"><input autoCapitalize="none" value={f.alias_pago} onChange={(e) => setF({ ...f, alias_pago: e.target.value })} placeholder="tope.de.pizza" /></Campo>
          <Campo label="A nombre de"><input value={f.titular_pago} onChange={(e) => setF({ ...f, titular_pago: e.target.value })} /></Campo>
        </div>
        <Campo label="Mensaje al confirmar el pedido" ayuda="{pago} se arma solo según cómo paga: efectivo, Mercado Pago (con tu alias) o ya pagado. También: {cliente} {numero} {detalle} {total} {alias} {titular}.">
          <textarea rows={10} value={f.mensaje_confirmacion} onChange={(e) => setF({ ...f, mensaje_confirmacion: e.target.value })} />
        </Campo>
        <Campo label="Mensaje cuando sale el pedido" ayuda="{pago}: si es efectivo dice cuánto tener listo; si ya está pagado no dice nada. También: {cliente} {numero} {total}.">
          <textarea rows={3} value={f.mensaje_cliente} onChange={(e) => setF({ ...f, mensaje_cliente: e.target.value })} />
        </Campo>
      </div>

      <div className="tarjeta">
        <h2>🛵 Cadete y envíos</h2>
        <Campo label="Básico por turno del cadete" ayuda={`Actual: ${money(num(f.basico_cadete))}. Se suma a los envíos de cada viaje.`}>
          <input inputMode="numeric" value={f.basico_cadete} onChange={(e) => setF({ ...f, basico_cadete: e.target.value })} />
        </Campo>
        <Campo label="Montos de envío rápidos" ayuda="Separados por coma. Aparecen como botones en la comanda.">
          <input value={f.envios} onChange={(e) => setF({ ...f, envios: e.target.value })} />
        </Campo>
      </div>

      <div className="tarjeta">
        <h2>📲 Cierres y clientes</h2>
        <Campo label="WhatsApp de tu socia" ayuda="Para mandarle el resumen del cierre de caja.">
          <input inputMode="tel" value={f.tel_socia} onChange={(e) => setF({ ...f, tel_socia: e.target.value })} placeholder="381..." />
        </Campo>
        <Campo label="Cliente frecuente: regalito cada" ayuda="Te avisa en la comanda cuando el cliente llega a ese número de pedidos (10, 20, 30…).">
          <input inputMode="numeric" value={f.premio_cada} onChange={(e) => setF({ ...f, premio_cada: e.target.value })} />
        </Campo>
      </div>

      <div className="tarjeta">
        <h2>💰 Conceptos de caja</h2>
        <Campo label="Gastos / egresos (uno por línea)"><textarea rows={6} value={f.egresos} onChange={(e) => setF({ ...f, egresos: e.target.value })} /></Campo>
        <Campo label="Ingresos extra (uno por línea)"><textarea rows={4} value={f.ingresos} onChange={(e) => setF({ ...f, ingresos: e.target.value })} /></Campo>
      </div>
      <button className="btn primario bloque grande" disabled={trabajando} onClick={guardarConfig} style={{ marginBottom: 16 }}>Guardar configuración</button>

      <div className="seccion-titulo">🛵 Cadetes</div>
      <div className="lista">
        {cadetes.map((c) => (
          <div key={c.id} className="item clic" style={{ opacity: c.activo ? 1 : 0.45 }} onClick={() => setEditCad({ ...c, dias: c.dias || [] })}>
            <div className="item-cuerpo">
              <div className="item-titulo">{c.nombre}</div>
              <div className="item-sub">{c.telefono || 'Sin WhatsApp'} · {(c.dias || []).length ? (c.dias || []).map((d) => DIAS[d]).join(', ') : 'sin días fijos'}</div>
            </div>
            <span className="suave">›</span>
          </div>
        ))}
        <div className="item clic item-accion" onClick={() => setEditCad({ nombre: '', telefono: '', activo: true, dias: [] })}>+ Agregar cadete</div>
      </div>

      <div className="seccion-titulo">👥 Usuarios</div>
      <div className="lista">
        {usuarios.map((u) => (
          <div key={u.id} className="item">
            <div className="item-cuerpo">
              <div className="item-titulo">{u.nombre} {u.id === session?.user?.id && <span className="badge b-gris">vos</span>}</div>
              <div className="item-sub">Usuario: <b>{u.usuario || '—'}</b></div>
            </div>
            {esAdmin && u.id !== session?.user?.id && (
              <>
                <button className="btn borde chico" onClick={() => setPassDe({ id: u.id, nombre: u.nombre, password: '' })}>🔑</button>
                <button className="btn-x" onClick={() => borrarUsuario(u)}>🗑</button>
              </>
            )}
          </div>
        ))}
        {esAdmin && <div className="item clic item-accion" onClick={() => setNuevoUsr({ nombre: '', usuario: '', password: '', rol: 'admin' })}>+ Crear usuario</div>}
      </div>
      <p className="suave chico-t centro">Tu propia contraseña la cambiás en Más → Mi cuenta.</p>

      <Hoja abierta={!!editCad} titulo={editCad?.id ? 'Editar cadete' : 'Nuevo cadete'} onCerrar={() => setEditCad(null)}
        pie={<button className="btn primario bloque" onClick={guardarCadete}>Guardar</button>}>
        {editCad && (
          <>
            <Campo label="Nombre"><input value={editCad.nombre} onChange={(e) => setEditCad({ ...editCad, nombre: e.target.value })} /></Campo>
            <Campo label="WhatsApp" ayuda="Ej: 3815713652"><input inputMode="tel" value={editCad.telefono || ''} onChange={(e) => setEditCad({ ...editCad, telefono: e.target.value })} /></Campo>
            <div className="campo-label">Días que trabaja (se elige solo en la comanda)</div>
            <div className="chips" style={{ marginBottom: 12 }}>
              {[4, 5, 6, 0, 1, 2, 3].map((d) => (
                <button key={d} className={(editCad.dias || []).includes(d) ? 'chip activo' : 'chip'} onClick={() => toggleDia(d)}>{DIAS[d]}</button>
              ))}
            </div>
            <label className="check"><input type="checkbox" checked={editCad.activo !== false} onChange={(e) => setEditCad({ ...editCad, activo: e.target.checked })} />Activo</label>
          </>
        )}
      </Hoja>

      <Hoja abierta={!!nuevoUsr} titulo="Crear usuario" onCerrar={() => setNuevoUsr(null)}
        pie={<button className="btn primario bloque" disabled={trabajando} onClick={crearUsuario}>Crear</button>}>
        {nuevoUsr && (
          <>
            <Campo label="Nombre"><input value={nuevoUsr.nombre} onChange={(e) => setNuevoUsr({ ...nuevoUsr, nombre: e.target.value, usuario: nuevoUsr.usuarioTocado ? nuevoUsr.usuario : e.target.value.split(' ')[0].toLowerCase() })} /></Campo>
            <Campo label="Usuario para entrar" ayuda="Sin espacios. No hace falta mail.">
              <input autoCapitalize="none" autoCorrect="off" value={nuevoUsr.usuario} onChange={(e) => setNuevoUsr({ ...nuevoUsr, usuario: e.target.value, usuarioTocado: true })} />
            </Campo>
            <Campo label="Contraseña" ayuda="Mínimo 6 caracteres. Después la puede cambiar en Mi cuenta.">
              <input value={nuevoUsr.password} onChange={(e) => setNuevoUsr({ ...nuevoUsr, password: e.target.value })} />
            </Campo>
          </>
        )}
      </Hoja>

      <Hoja abierta={!!passDe} titulo={`Contraseña de ${passDe?.nombre || ''}`} onCerrar={() => setPassDe(null)}
        pie={<button className="btn primario bloque" disabled={trabajando} onClick={cambiarPassDe}>Cambiar contraseña</button>}>
        {passDe && <Campo label="Contraseña nueva" ayuda="Mínimo 6 caracteres"><input value={passDe.password} onChange={(e) => setPassDe({ ...passDe, password: e.target.value })} /></Campo>}
      </Hoja>

      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />
    </>
  );
}
