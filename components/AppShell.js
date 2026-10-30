'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { alertasStock } from '@/lib/utils';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const NOMBRE = 'Tope de Pizza';

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
  const [alertas, setAlertas] = useState([]);

  const cargarConfig = useCallback(async () => {
    const { data } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();
    if (data) setConfig(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user?.id;
  useEffect(() => {
    if (session === undefined) return;
    if (!session && pathname !== '/login') router.replace('/login');
    if (session && pathname === '/login') router.replace('/');
  }, [session, pathname, router]);

  const cargarPerfil = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('perfiles').select('*').eq('id', uid).maybeSingle();
    setPerfil(data);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    cargarPerfil();
    cargarConfig();
  }, [uid, cargarPerfil, cargarConfig]);

  // alertas de stock: se refrescan al cambiar de pantalla
  useEffect(() => {
    if (!uid) return;
    alertasStock(supabase).then(setAlertas).catch(() => {});
  }, [uid, pathname]);

  const avisar = useCallback((texto, tipo = 'ok') => {
    setToast({ texto, tipo, id: Date.now() });
    setTimeout(() => setToast((t) => (t && t.texto === texto ? null : t)), tipo === 'error' ? 4500 : 2300);
  }, []);

  if (pathname === '/login') {
    return <Ctx.Provider value={{ avisar }}>{children}{toast && <Toast t={toast} />}</Ctx.Provider>;
  }
  if (!session) return <div className="cargando-full"><img src="/logo-chico.png" alt={NOMBRE} /></div>;

  const enComanda = pathname.startsWith('/comanda');
  const activo = (href) => (href === '/' ? pathname === '/' || enComanda : pathname.startsWith(href) ||
    (href === '/mas' && ['/clientes', '/informes', '/codificacion', '/config', '/cuenta'].some((p) => pathname.startsWith(p))));
  const nombreNegocio = config?.nombre_negocio || NOMBRE;

  return (
    <Ctx.Provider value={{ session, perfil, cargarPerfil, config, cargarConfig, avisar, nombreNegocio, alertas, esAdmin: perfil?.rol === 'admin' }}>
      <main className={enComanda ? 'contenido sin-tabs' : 'contenido'}>{children}</main>
      {!enComanda && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={activo(t.href) ? 'tab activo' : 'tab'}>
              <span className="tab-icono">{t.icono}</span>
              {t.href === '/stock' && alertas.length > 0 && (
                <span className={`tab-alerta${alertas.some((a) => a.nivel === 'bajo') ? '' : ' cerca'}`}>{alertas.length}</span>
              )}
              <span>{t.label}</span>
            </Link>
          ))}
        </nav>
      )}
      {toast && <Toast t={toast} />}
    </Ctx.Provider>
  );
}

function Toast({ t }) {
  return <div key={t.id} className={`toast ${t.tipo}`}>{t.texto}</div>;
}
