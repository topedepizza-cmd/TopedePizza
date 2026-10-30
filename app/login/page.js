'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';

export default function Login() {
  const { avisar } = useApp();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setCargando(false);
    if (error) avisar('Email o contraseña incorrectos', 'error');
  }

  return (
    <form className="login" onSubmit={entrar}>
      <div className="login-logo">🍕</div>
      <h1>Pizzería</h1>
      <label className="campo">
        <span className="campo-label">Email</span>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="campo">
        <span className="campo-label">Contraseña</span>
        <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
      </label>
      <button className="btn primario bloque" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
