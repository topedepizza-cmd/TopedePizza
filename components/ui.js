'use client';
import { useEffect, useState } from 'react';
import { embedMapa, linkMapa } from '@/lib/utils';

export function Hoja({ abierta, titulo, onCerrar, children, pie }) {
  useEffect(() => {
    if (!abierta) return;
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = o; };
  }, [abierta]);
  if (!abierta) return null;
  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <h3>{titulo}</h3>
          <button className="btn-x" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="hoja-cuerpo">{children}</div>
        {pie && <div className="hoja-pie">{pie}</div>}
      </div>
    </div>
  );
}

// Confirmación linda (reemplaza confirm() del navegador)
export function Confirmar({ datos, onCerrar }) {
  const [texto, setTexto] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  useEffect(() => { setTexto(''); setTrabajando(false); }, [datos]);
  if (!datos) return null;
  async function ok() {
    setTrabajando(true);
    try { await datos.onOk(texto); onCerrar(); } finally { setTrabajando(false); }
  }
  return (
    <Hoja abierta titulo={datos.titulo} onCerrar={onCerrar}
      pie={
        <div className="fila-btns">
          <button className="btn borde" onClick={onCerrar}>Cancelar</button>
          <button className={datos.peligro ? 'btn primario' : 'btn verde'} disabled={trabajando} onClick={ok}>{datos.boton || 'Confirmar'}</button>
        </div>
      }>
      {datos.mensaje && <p style={{ marginTop: 0, fontSize: 15 }}>{datos.mensaje}</p>}
      {datos.pedirTexto && <input placeholder={datos.pedirTexto} value={texto} onChange={(e) => setTexto(e.target.value)} />}
    </Hoja>
  );
}

export function Cabecera({ titulo, sub, derecha, logo = true }) {
  return (
    <header className="cabecera">
      <div className="cab-izq">
        {logo && <img className="cab-logo" src="/logo-chico.png" alt="" />}
        <div style={{ minWidth: 0 }}>
          <h1>{titulo}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      {derecha && <div className="cab-der">{derecha}</div>}
    </header>
  );
}

export function Chips({ opciones, valor, onCambio, chico, envuelve }) {
  return (
    <div className={`chips${chico ? ' chico' : ''}${envuelve ? ' envuelve' : ''}`}>
      {opciones.map((o) => (
        <button key={String(o.id)} type="button" className={valor === o.id ? 'chip activo' : 'chip'} onClick={() => onCambio(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Campo({ label, children, ayuda }) {
  return (
    <label className="campo">
      <span className="campo-label">{label}</span>
      {children}
      {ayuda && <span className="campo-ayuda">{ayuda}</span>}
    </label>
  );
}

export function Vacio({ texto, emoji = '🍕' }) {
  return <div className="vacio"><span className="vacio-emoji">{emoji}</span>{texto}</div>;
}

export function Cargando() {
  return <div className="cargando">Cargando…</div>;
}

export function Barra({ valor, max, texto, sub }) {
  const pct = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="barra-fila">
      <div className="barra-txt"><span>{texto}</span><b>{sub}</b></div>
      <div className="barra"><div style={{ width: pct + '%' }} /></div>
    </div>
  );
}

// Botón 📲 + instrucciones para instalar en el iPhone (solo si no está instalada)
export function BotonInstalar() {
  const [instalada, setInstalada] = useState(true);
  const [ver, setVer] = useState(false);
  useEffect(() => {
    const st = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setInstalada(!!st);
  }, []);
  if (instalada) return null;
  return (
    <>
      <button className="ibtn" onClick={() => setVer(true)} aria-label="Instalar en el celular">📲</button>
      <Hoja abierta={ver} titulo="Instalar en el iPhone" onCerrar={() => setVer(false)}
        pie={<button className="btn primario bloque" onClick={() => setVer(false)}>Entendido</button>}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <img src="/apple-touch-icon.png" alt="" style={{ width: 84, height: 84, borderRadius: 20, boxShadow: 'var(--sombra-fuerte)' }} />
        </div>
        <ol className="pasos-instalar">
          <li><div>Abrí esta página en <b>Safari</b>.</div></li>
          <li><div>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha ⬆️) abajo de todo.</div></li>
          <li><div>Bajá y elegí <b>“Agregar a pantalla de inicio”</b>.</div></li>
          <li><div>Tocá <b>Agregar</b>. Queda el logo de Tope de Pizza como una app más.</div></li>
        </ol>
        <div className="aviso azul" style={{ marginTop: 12 }}>Si ya la tenías agregada con el ícono viejo, borrala de la pantalla de inicio y agregala de nuevo.</div>
      </Hoja>
    </>
  );
}

// Mapa para revisar que la dirección esté bien antes de mandarla al cadete
export function MapaDireccion({ direccion, alto = 230 }) {
  if (!String(direccion || '').trim()) return null;
  return (
    <div className="mapa">
      <iframe title="Mapa" src={embedMapa(direccion)} style={{ height: alto }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      <div className="mapa-pie">
        <span>¿El pin está bien? Si no, corregí la dirección (calle y número).</span>
        <a href={linkMapa(direccion)} target="_blank" rel="noreferrer">Abrir Maps ↗</a>
      </div>
    </div>
  );
}
