'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const TABS = [
  { href: '/', label: 'Comandas', icono: '🧾' },
  { href: '/caja', label: 'Caja', icono: '💰' },
  { href: '/cadete', label: 'Cadete', icono: '🛵' },
  { href: '/stock', label: 'Stock', icono: '📦' },
  { href: '/mas', label: 'Más', icono: '☰' },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [config, setConfig] = useState(null);
  const [toast, setToast] = useState(null);

  const cargarConfig = useCallback(async () => {
    const { data } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();
    if (data) setConfig(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session && pathname !== '/login') router.replace('/login');
    if (session && pathname === '/login') router.replace('/');
    if (session) {
      supabase.from('perfiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => setPerfil(data));
      cargarConfig();
    }
  }, [session, pathname, router, cargarConfig]);

  const avisar = useCallback((texto, tipo = 'ok') => {
    setToast({ texto, tipo });
    setTimeout(() => setToast(null), tipo === 'error' ? 4500 : 2200);
  }, []);

  if (pathname === '/login') {
    return <Ctx.Provider value={{ avisar }}>{children}{toast && <Toast t={toast} />}</Ctx.Provider>;
  }
  if (!session) return <div className="cargando-full">🍕</div>;

  const activo = (href) => (href === '/' ? pathname === '/' || pathname.startsWith('/comanda') : pathname.startsWith(href) ||
    (href === '/mas' && ['/clientes', '/informes', '/codificacion', '/config'].some((p) => pathname.startsWith(p))));

  return (
    <Ctx.Provider value={{ session, perfil, config, cargarConfig, avisar, esAdmin: perfil?.rol === 'admin' }}>
      <main className="contenido">{children}</main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={activo(t.href) ? 'tab activo' : 'tab'}>
            <span className="tab-icono">{t.icono}</span>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
      {toast && <Toast t={toast} />}
    </Ctx.Provider>
  );
}

function Toast({ t }) {
  return <div className={`toast ${t.tipo}`}>{t.texto}</div>;
}
