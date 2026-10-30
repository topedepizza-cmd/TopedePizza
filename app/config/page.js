'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Campo, Cargando, Chips } from '@/components/ui';
import { money, num } from '@/lib/utils';

export default function Config() {
  const { config, cargarConfig, avisar, esAdmin, session } = useApp();
  const [f, setF] = useState(null);
  const [cadetes, setCadetes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [editCad, setEditCad] = useState(null);
  const [nuevoUsr, setNuevoUsr] = useState(null);
  const [pass, setPass] = useState('');
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
        nombre_negocio: config.nombre_negocio || '', telefono_negocio: config.telefono_negocio || '', alias_pago: config.alias_pago || '',
        basico_cadete: String(config.basico_cadete ?? 15000), envios: (config.envios_sugeridos || []).join(', '),
        egresos: (config.conceptos_egreso || []).join('\n'), ingresos: (config.conceptos_ingreso || []).join('\n'),
        mensaje_cliente: config.mensaje_cliente || '',
      });
    }
  }, [config, f]);

  async function guardarConfig() {
    setTrabajando(true);
    const d = {
      nombre_negocio: f.nombre_negocio.trim() || 'Mi Pizzería', telefono_negocio: f.telefono_negocio || null, alias_pago: f.alias_pago || null,
      basico_cadete: num(f.basico_cadete),
      envios_sugeridos: f.envios.split(/[,;\n]/).map((x) => num(x)).filter((x) => x > 0),
      conceptos_egreso: f.egresos.split('\n').map((x) => x.trim()).filter(Boolean),
      conceptos_ingreso: f.ingresos.split('\n').map((x) => x.trim()).filter(Boolean),
      mensaje_cliente: f.mensaje_cliente,
    };
    const { error } = await supabase.from('config').update(d).eq('id', 1);
    setTrabajando(false);
    if (error) return avisar(error.message, 'error');
    await cargarConfig();
    avisar('Configuración guardada ✔');
  }

  async function guardarCadete() {
    const d = { nombre: editCad.nombre.trim(), telefono: editCad.telefono || null, activo: editCad.activo !== false };
    if (!d.nombre) return avisar('Poné un nombre', 'error');
    const { error } = editCad.id ? await supabase.from('cadetes').update(d).eq('id', editCad.id) : await supabase.from('cadetes').insert(d);
    if (error) return avisar(error.message, 'error');
    setEditCad(null);
    cargar();
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
      await llamarApi('POST', nuevoUsr);
      avisar('Usuario creado ✔');
      setNuevoUsr(null);
      cargar();
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }
  async function borrarUsuario(u) {
    if (!confirm(`¿Borrar el usuario ${u.email}?`)) return;
    try { await llamarApi('DELETE', { id: u.id }); avisar('Usuario borrado'); cargar(); } catch (e) { avisar(e.message, 'error'); }
  }
  async function cambiarRol(u, rol) {
    const { error } = await supabase.from('perfiles').update({ rol }).eq('id', u.id);
    if (error) return avisar(error.message, 'error');
    cargar();
  }
  async function cambiarPass() {
    if (pass.length < 6) return avisar('Mínimo 6 caracteres', 'error');
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) return avisar(error.message, 'error');
    setPass('');
    avisar('Contraseña cambiada ✔');
  }

  if (!f) return <><Cabecera titulo="Configuración" /><Cargando /></>;

  return (
    <>
      <Cabecera titulo="Configuración" />

      <div className="tarjeta">
        <h2>Negocio</h2>
        <Campo label="Nombre de la pizzería"><input value={f.nombre_negocio} onChange={(e) => setF({ ...f, nombre_negocio: e.target.value })} /></Campo>
        <div className="grid2">
          <Campo label="Teléfono"><input inputMode="tel" value={f.telefono_negocio} onChange={(e) => setF({ ...f, telefono_negocio: e.target.value })} /></Campo>
          <Campo label="Alias / CBU para transferir"><input value={f.alias_pago} onChange={(e) => setF({ ...f, alias_pago: e.target.value })} /></Campo>
        </div>
        <Campo label="Mensaje “tu pedido salió”" ayuda="Podés usar {cliente}, {numero} y {total}">
          <textarea value={f.mensaje_cliente} onChange={(e) => setF({ ...f, mensaje_cliente: e.target.value })} />
        </Campo>
      </div>

      <div className="tarjeta">
        <h2>Cadete y envíos</h2>
        <Campo label="Básico por turno del cadete" ayuda={`Actual: ${money(num(f.basico_cadete))}. Se suma a los envíos de cada viaje.`}>
          <input inputMode="numeric" value={f.basico_cadete} onChange={(e) => setF({ ...f, basico_cadete: e.target.value })} />
        </Campo>
        <Campo label="Montos de envío sugeridos" ayuda="Separados por coma. Aparecen como botones rápidos en la comanda.">
          <input value={f.envios} onChange={(e) => setF({ ...f, envios: e.target.value })} />
        </Campo>
      </div>

      <div className="tarjeta">
        <h2>Conceptos de caja</h2>
        <Campo label="Gastos / egresos (uno por línea)"><textarea rows={6} value={f.egresos} onChange={(e) => setF({ ...f, egresos: e.target.value })} /></Campo>
        <Campo label="Ingresos extra (uno por línea)"><textarea rows={4} value={f.ingresos} onChange={(e) => setF({ ...f, ingresos: e.target.value })} /></Campo>
      </div>
      <button className="btn primario bloque" disabled={trabajando} onClick={guardarConfig} style={{ marginBottom: 16 }}>Guardar configuración</button>

      <div className="seccion-titulo">Cadetes</div>
      <div className="lista">
        {cadetes.map((c) => (
          <div key={c.id} className="item clic" style={{ opacity: c.activo ? 1 : 0.45 }} onClick={() => setEditCad({ ...c })}>
            <div className="item-cuerpo"><div className="item-titulo">🛵 {c.nombre}</div><div className="item-sub">{c.telefono || 'Sin teléfono (cargalo para mandarle la comanda directo)'}</div></div>
            <span className="suave">›</span>
          </div>
        ))}
        <div className="item clic" onClick={() => setEditCad({ nombre: '', telefono: '', activo: true })}><div className="item-titulo rojo-t">+ Agregar cadete</div></div>
      </div>

      <div className="seccion-titulo">Usuarios</div>
      <div className="lista">
        {usuarios.map((u) => (
          <div key={u.id} className="item">
            <div className="item-cuerpo">
              <div className="item-titulo">{u.nombre} {u.id === session?.user?.id && <span className="badge b-gris">vos</span>}</div>
              <div className="item-sub">{u.email}</div>
            </div>
            {esAdmin && u.id !== session?.user?.id ? (
              <>
                <select style={{ width: 110, padding: '6px 26px 6px 8px', fontSize: 14 }} value={u.rol} onChange={(e) => cambiarRol(u, e.target.value)}>
                  <option value="admin">Admin</option><option value="usuario">Usuario</option>
                </select>
                <button className="btn-x" onClick={() => borrarUsuario(u)}>🗑</button>
              </>
            ) : <span className={`badge ${u.rol === 'admin' ? 'b-rojo' : 'b-gris'}`}>{u.rol}</span>}
          </div>
        ))}
        {esAdmin && <div className="item clic" onClick={() => setNuevoUsr({ nombre: '', email: '', password: '', rol: 'admin' })}><div className="item-titulo rojo-t">+ Crear usuario</div></div>}
      </div>

      <div className="tarjeta">
        <h2>Mi contraseña</h2>
        <div className="voz">
          <input type="password" placeholder="Nueva contraseña" value={pass} onChange={(e) => setPass(e.target.value)} />
          <button className="btn borde" onClick={cambiarPass}>Cambiar</button>
        </div>
      </div>

      <Hoja abierta={!!editCad} titulo={editCad?.id ? 'Editar cadete' : 'Nuevo cadete'} onCerrar={() => setEditCad(null)}
        pie={<button className="btn primario bloque" onClick={guardarCadete}>Guardar</button>}>
        {editCad && (
          <>
            <Campo label="Nombre"><input value={editCad.nombre} onChange={(e) => setEditCad({ ...editCad, nombre: e.target.value })} /></Campo>
            <Campo label="WhatsApp" ayuda="Ej: 381 555-1234"><input inputMode="tel" value={editCad.telefono || ''} onChange={(e) => setEditCad({ ...editCad, telefono: e.target.value })} /></Campo>
            <label className="check"><input type="checkbox" checked={editCad.activo !== false} onChange={(e) => setEditCad({ ...editCad, activo: e.target.checked })} />Activo</label>
          </>
        )}
      </Hoja>

      <Hoja abierta={!!nuevoUsr} titulo="Crear usuario" onCerrar={() => setNuevoUsr(null)}
        pie={<button className="btn primario bloque" disabled={trabajando} onClick={crearUsuario}>Crear</button>}>
        {nuevoUsr && (
          <>
            <Campo label="Nombre"><input value={nuevoUsr.nombre} onChange={(e) => setNuevoUsr({ ...nuevoUsr, nombre: e.target.value })} /></Campo>
            <Campo label="Email"><input type="email" value={nuevoUsr.email} onChange={(e) => setNuevoUsr({ ...nuevoUsr, email: e.target.value })} /></Campo>
            <Campo label="Contraseña"><input value={nuevoUsr.password} onChange={(e) => setNuevoUsr({ ...nuevoUsr, password: e.target.value })} /></Campo>
            <div className="campo-label">Rol</div>
            <Chips valor={nuevoUsr.rol} onCambio={(v) => setNuevoUsr({ ...nuevoUsr, rol: v })} opciones={[{ id: 'admin', label: 'Admin (todo)' }, { id: 'usuario', label: 'Usuario' }]} />
          </>
        )}
      </Hoja>
    </>
  );
}
