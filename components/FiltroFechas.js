'use client';
import { PRESETS, rangoFechas, moverRango } from '@/lib/fechas';
import { isoDia } from '@/lib/utils';

// Selector de período: atajos + un día puntual + desde/hasta + flechas para moverse
export default function FiltroFechas({ valor, onCambio }) {
  const r = rangoFechas(valor);
  const elegir = (modo) => {
    if (modo === 'dia') onCambio({ modo, desde: r.isoB, hasta: r.isoB });
    else if (modo === 'rango') onCambio({ modo, desde: r.isoA, hasta: r.isoB });
    else onCambio({ modo });
  };
  const hoyIso = isoDia(new Date());
  return (
    <div className="filtro-fechas">
      <div className="chips desliza">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={valor.modo === p.id ? 'chip activo' : 'chip'} onClick={() => elegir(p.id)}>{p.label}</button>
        ))}
      </div>
      {valor.modo === 'dia' && (
        <input type="date" max={hoyIso} value={valor.desde || ''} onChange={(e) => e.target.value && onCambio({ modo: 'dia', desde: e.target.value, hasta: e.target.value })} style={{ marginTop: 10 }} />
      )}
      {valor.modo === 'rango' && (
        <div className="grid2" style={{ marginTop: 10 }}>
          <label className="campo" style={{ margin: 0 }}><span className="campo-label">Desde</span>
            <input type="date" max={hoyIso} value={valor.desde || ''} onChange={(e) => e.target.value && onCambio({ ...valor, desde: e.target.value })} />
          </label>
          <label className="campo" style={{ margin: 0 }}><span className="campo-label">Hasta</span>
            <input type="date" max={hoyIso} value={valor.hasta || ''} onChange={(e) => e.target.value && onCambio({ ...valor, hasta: e.target.value })} />
          </label>
        </div>
      )}
      <div className="ff-nav">
        <button type="button" className="ibtn" onClick={() => onCambio(moverRango(valor, -1))} aria-label="Período anterior">◀</button>
        <div className="ff-etiqueta">
          <b>{r.etiqueta}</b>
          <span>{r.dias === 1 ? '1 día' : `${r.dias} días`} · lo de antes de las 3 AM cuenta para el día anterior</span>
        </div>
        <button type="button" className="ibtn" disabled={r.isoB >= isoDia(new Date(Date.now() - 3 * 3600e3))} onClick={() => onCambio(moverRango(valor, 1))} aria-label="Período siguiente">▶</button>
      </div>
    </div>
  );
}
