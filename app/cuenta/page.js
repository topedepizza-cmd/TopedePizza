'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Campo, Cargando } from '@/components/ui';

function limpiarUsuario(u) {
  return String(u || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
}

export default function Cuenta() {
  const { perfil, cargarPerfil, avisar } = useApp();
  const [datos, setDatos] = useState(null);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [ver, setVer] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (perfil && !datos) setDatos({ nombre: perfil.nombre || '', usuario: perfil.usuario || '' });
  }, [perfil, datos]);

  async function guardarDatos() {
    const usuario = limpiarUsuario(datos.usuario);
    if (!datos.nombre.trim()) return avisar('Poné tu nombre', 'error');
    if (!/^[a-z0-9._-]{2,30}$/.test(usuario)) return avisar('El usuario tiene que tener 2 a 30 letras o números, sin espacios', 'error');
    setTrabajando(true);
    const { error } = await supabase.from('perfiles').update({ nombre: datos.nombre.trim(), usuario }).eq('id', perfil.id);
    setTrabajando(false);
    if (error) return avisar(error.message.includes('unico') || error.code === '23505' ? 'Ese usuario ya lo usa otra persona' : error.message, 'error');
    setDatos({ ...datos, usuario });
    await cargarPerfil();
    avisar(`Listo ✔ Desde ahora entrás con "${usuario}"`);
  }

  async function cambiarPass() {
    if (pass1.length < 6) return avisar('La contraseña tiene que tener al menos 6 caracteres', 'error');
    if (pass1 !== pass2) return avisar('Las contraseñas no coinciden', 'error');
    setTrabajando(true);
    const { error } = await supabase.auth.updateUser({ password: pass1 });
    setTrabajando(false);
    if (error) return avisar(error.message, 'error');
    setPass1(''); setPass2('');
    avisar('Contraseña cambiada ✔');
  }

  if (!datos) return <><Cabecera titulo="Mi cuenta" /><Cargando /></>;

  return (
    <>
      <Cabecera titulo="Mi cuenta" sub="Tu nombre, usuario y contraseña" />

      <div className="tarjeta">
        <h2>👤 Mis datos</h2>
        <Campo label="Nombre"><input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} /></Campo>
        <Campo label="Usuario para entrar" ayuda="Sin espacios. Es lo que escribís en la pantalla de entrada.">
          <input autoCapitalize="none" autoCorrect="off" value={datos.usuario} onChange={(e) => setDatos({ ...datos, usuario: e.target.value })} />
        </Campo>
        <button className="btn primario bloque" disabled={trabajando} onClick={guardarDatos}>Guardar mis datos</button>
      </div>

      <div className="tarjeta">
        <h2>🔑 Cambiar contraseña</h2>
        <Campo label="Contraseña nueva">
          <input type={ver ? 'text' : 'password'} autoComplete="new-password" value={pass1} onChange={(e) => setPass1(e.target.value)} />
        </Campo>
        <Campo label="Repetila">
          <input type={ver ? 'text' : 'password'} autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        </Campo>
        <label className="check"><input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />Mostrar contraseña</label>
        <button className="btn primario bloque" disabled={trabajando || !pass1} onClick={cambiarPass}>Cambiar contraseña</button>
      </div>
    </>
  );
}
