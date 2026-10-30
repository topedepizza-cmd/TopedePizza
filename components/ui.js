'use client';
import { useEffect } from 'react';

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

export function Cabecera({ titulo, sub, derecha }) {
  return (
    <header className="cabecera">
      <div>
        <h1>{titulo}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {derecha && <div className="cab-der">{derecha}</div>}
    </header>
  );
}

export function Chips({ opciones, valor, onCambio, chico }) {
  return (
    <div className={chico ? 'chips chico' : 'chips'}>
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

export function Vacio({ texto }) {
  return <div className="vacio">{texto}</div>;
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
