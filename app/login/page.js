'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';

export default function Login() {
  const { avisar } = useApp();
  const [usuario, setUsuario] = useState('');
  const [pass, setPass] = useState('');
  const [ver, setVer] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setCargando(true);
    try {
      let email = usuario.trim().toLowerCase();
      if (!email.includes('@')) {
        const { data, error } = await supabase.rpc('email_login', { p_usuario: email });
        if (error || !data) throw new Error('Usuario o contraseña incorrectos');
        email = data;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw new Error('Usuario o contraseña incorrectos');
    } catch (err) {
      avisar(err.message, 'error');
    }
    setCargando(false);
  }

  return (
    <form className="login" onSubmit={entrar}>
      <img className="login-logo" src="/logo.png" alt="Tope de Pizza" />
      <div className="tarjeta">
        <label className="campo">
          <span className="campo-label">Usuario</span>
          <input autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="Ej: facu" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        </label>
        <label className="campo">
          <span className="campo-label">Contraseña</span>
          <div style={{ position: 'relative' }}>
            <input type={ver ? 'text' : 'password'} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required style={{ paddingRight: 52 }} />
            <button type="button" onClick={() => setVer(!ver)} aria-label="Ver contraseña"
              style={{ position: 'absolute', right: 6, top: 6, bottom: 6, width: 40, border: 0, background: 'transparent', fontSize: 18 }}>{ver ? '🙈' : '👁️'}</button>
          </div>
        </label>
        <button className="btn primario bloque grande" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
      </div>
    </form>
  );
}
