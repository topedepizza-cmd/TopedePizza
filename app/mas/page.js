'use client';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera } from '@/components/ui';

const OPCIONES = [
  { href: '/clientes', icono: '👥', t: 'Clientes', s: 'Agenda, historial y mejores clientes' },
  { href: '/informes', icono: '📊', t: 'Informes', s: 'Más vendidos, rubros, días, horarios, clientes' },
  { href: '/codificacion', icono: '🏷️', t: 'Codificación', s: 'Rubros, subrubros, artículos y precios' },
  { href: '/config', icono: '⚙️', t: 'Configuración', s: 'Negocio, cadetes, envíos, conceptos y usuarios' },
];

export default function Mas() {
  const { perfil } = useApp();
  return (
    <>
      <Cabecera titulo="Más" sub={perfil ? `${perfil.nombre} · ${perfil.rol === 'admin' ? 'Administrador' : 'Usuario'}` : ''} />
      <div className="lista menu-mas">
        {OPCIONES.map((o) => (
          <Link key={o.href} href={o.href} className="item clic">
            <span className="menu-icono">{o.icono}</span>
            <div className="item-cuerpo"><div className="item-titulo">{o.t}</div><div className="item-sub">{o.s}</div></div>
            <span className="suave">›</span>
          </Link>
        ))}
      </div>
      <button className="btn peligro bloque" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      <p className="suave chico-t centro" style={{ marginTop: 18 }}>
        Tip: en Safari tocá Compartir → “Agregar a pantalla de inicio” para usarla como app.
      </p>
    </>
  );
}
