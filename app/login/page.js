'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';

export default function Login() {
  const { avisar } = useApp();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [ver, setVer] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pass });
    setCargando(false);
    if (error) avisar('Email o contraseña incorrectos', 'error');
  }

  return (
    <form className="login" onSubmit={entrar}>
      <img className="login-logo" src="/logo.png" alt="Tope de Pizza" />
      <div className="tarjeta">
        <label className="campo">
          <span className="campo-label">Email</span>
          <input type="email" inputMode="email" autoCapitalize="none" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
