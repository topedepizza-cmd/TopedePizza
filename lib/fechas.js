// Rangos de fechas "operativas" (el día va de 03:00 a 03:00)
import { diaOperativo, isoDia } from './utils';

export function hoyOperativo() { const d = diaOperativo(new Date()); d.setHours(0, 0, 0, 0); return d; }
export function sumarDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function inicioOperativo(d) { const x = new Date(d); x.setHours(3, 0, 0, 0); return x; }
const deIso = (t) => { const d = new Date(t + 'T00:00'); return isNaN(d) ? null : d; };
const lunes = (d) => sumarDias(d, -((d.getDay() + 6) % 7));

export const PRESETS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'semant', label: 'Semana pasada' },
  { id: '7', label: '7 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mesant', label: 'Mes anterior' },
  { id: '30', label: '30 días' },
  { id: 'anio', label: 'Este año' },
  { id: 'dia', label: '📅 Un día' },
  { id: 'rango', label: '📅 Desde / hasta' },
];

// valor = { modo, desde, hasta } (desde/hasta en formato 2026-11-01, solo para 'dia' y 'rango')
export function rangoFechas(valor) {
  const hoy = hoyOperativo();
  let a = hoy, b = hoy;
  switch (valor?.modo) {
    case 'ayer': a = b = sumarDias(hoy, -1); break;
    case 'semana': a = lunes(hoy); break;
    case 'semant': a = sumarDias(lunes(hoy), -7); b = sumarDias(a, 6); break;
    case '7': a = sumarDias(hoy, -6); break;
    case '30': a = sumarDias(hoy, -29); break;
    case 'mes': a = new Date(hoy.getFullYear(), hoy.getMonth(), 1); break;
    case 'mesant': a = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); b = new Date(hoy.getFullYear(), hoy.getMonth(), 0); break;
    case 'anio': a = new Date(hoy.getFullYear(), 0, 1); break;
    case 'dia': a = b = deIso(valor.desde) || hoy; break;
    case 'rango': {
      a = deIso(valor.desde) || hoy; b = deIso(valor.hasta) || a;
      if (b < a) [a, b] = [b, a];
      break;
    }
    default: break;
  }
  const dias = Math.round((b - a) / 86400000) + 1;
  return {
    a, b, dias, isoA: isoDia(a), isoB: isoDia(b),
    desde: inicioOperativo(a), hasta: inicioOperativo(sumarDias(b, 1)),
    etiqueta: etiquetaRango(a, b),
  };
}

export function etiquetaRango(a, b) {
  const f = (d, conAnio) => d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}) });
  const t = isoDia(a) === isoDia(b) ? f(a, true) : `${f(a, a.getFullYear() !== b.getFullYear())} al ${f(b, true)}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// mueve el período para atrás (-1) o adelante (+1) manteniendo su largo
export function moverRango(valor, sentido) {
  const r = rangoFechas(valor);
  if (['mes', 'mesant'].includes(valor.modo) || (valor.modo === 'rango' && r.a.getDate() === 1 && sumarDias(r.b, 1).getDate() === 1)) {
    const a = new Date(r.a.getFullYear(), r.a.getMonth() + sentido, 1);
    const b = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    return { modo: 'rango', desde: isoDia(a), hasta: isoDia(b) };
  }
  const a = sumarDias(r.a, sentido * r.dias), b = sumarDias(r.b, sentido * r.dias);
  return r.dias === 1 ? { modo: 'dia', desde: isoDia(a), hasta: isoDia(a) } : { modo: 'rango', desde: isoDia(a), hasta: isoDia(b) };
}

// período anterior de igual largo (para comparar)
export function rangoAnterior(valor) {
  return rangoFechas(moverRango(valor, -1));
}
