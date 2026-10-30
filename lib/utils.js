// Tope de Pizza trabaja solo con efectivo y Mercado Pago
export const CUENTAS = [
  { id: 'efectivo', nombre: 'Efectivo', icono: '💵' },
  { id: 'mercadopago', nombre: 'Mercado Pago', icono: '📱' },
];
const TODAS = [...CUENTAS, { id: 'transferencia', nombre: 'Transferencia', icono: '🏦' }];
export const nombreCuenta = (id) => TODAS.find((c) => c.id === id)?.nombre || id;
export const iconoCuenta = (id) => TODAS.find((c) => c.id === id)?.icono || '';

export function money(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('es-AR');
}

export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  let s = String(v).trim().replace(/[$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');      // 1.500,50
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');  // 15.000
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export function cant(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

export function hora(f) {
  if (!f) return '';
  return new Date(f).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function fechaCorta(f) {
  if (!f) return '';
  return new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export function fechaHora(f) {
  if (!f) return '';
  return `${fechaCorta(f)} ${hora(f)}`;
}

export function minutosDesde(f) {
  if (!f) return 0;
  return Math.floor((Date.now() - new Date(f).getTime()) / 60000);
}

export function hace(f) {
  const m = minutosDesde(f);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h ${m % 60} min`;
  return fechaHora(f);
}

// fecha "operativa": lo vendido antes de las 3 AM cuenta para el día anterior
export function diaOperativo(f) {
  const d = new Date(new Date(f).getTime() - 3 * 3600 * 1000);
  return d;
}

export function isoDia(d) {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${dd}`;
}

export function normalizar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function telWhatsapp(tel) {
  let t = String(tel || '').replace(/\D/g, '');
  if (!t) return '';
  if (t.startsWith('549')) return t;
  if (t.startsWith('54')) return '549' + t.slice(2);
  if (t.startsWith('0')) t = t.slice(1);
  // número argentino = 10 dígitos (característica + número). Si vino con el "15" son 12: se lo saco
  if (t.length === 12) {
    for (const largo of [3, 4, 2]) {
      if (t.slice(largo, largo + 2) === '15') { t = t.slice(0, largo) + t.slice(largo + 2); break; }
    }
  }
  return '549' + t;
}

export function linkWhatsapp(tel, texto) {
  const t = telWhatsapp(tel);
  return `https://wa.me/${t}?text=${encodeURIComponent(texto)}`;
}

export function linkMapa(direccion) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion + ', Tucumán, Argentina')}`;
}

export function descripcionItem(it) {
  return it.descripcion;
}

export function textoComanda(c, items, opts = {}) {
  const l = [];
  l.push(`🍕 *PEDIDO #${c.numero}*${opts.negocio ? ' — ' + opts.negocio : ''}`);
  if (c.cliente_nombre) l.push(`👤 ${c.cliente_nombre}`);
  if (c.tipo_entrega === 'delivery') {
    if (c.cliente_direccion) {
      l.push(`📍 *${c.cliente_direccion}*${c.cliente_referencia ? ' (' + c.cliente_referencia + ')' : ''}`);
      l.push(`🗺️ Mapa: ${linkMapa(c.cliente_direccion)}`);
    }
  } else {
    l.push('🏠 Retira en el local');
  }
  if (c.cliente_telefono) l.push(`📞 ${c.cliente_telefono}`);
  l.push('──────────');
  items.forEach((it) => l.push(`${cant(it.cantidad)}x ${it.descripcion}  ${money(it.cantidad * it.precio_unit)}`));
  l.push('──────────');
  if (Number(c.envio) > 0) l.push(`🛵 Envío: ${money(c.envio)}`);
  if (Number(c.descuento) > 0) l.push(`🏷️ Descuento: -${money(c.descuento)}`);
  l.push(`💰 *TOTAL: ${money(c.total)}*`);
  if (c.estado === 'cobrada') {
    l.push(`✅ YA PAGADO (${nombreCuenta(c.forma_pago)}) — NO COBRAR`);
  } else if (c.forma_pago === 'efectivo') {
    let p = `💵 Abona en EFECTIVO`;
    if (Number(c.paga_con) > 0) p += ` con ${money(c.paga_con)}`;
    l.push(p);
    if (Number(c.vuelto) > 0) l.push(`🔁 Llevás vuelto: ${money(c.vuelto)}`);
    l.push(`➡️ Rendir: ${money(Number(c.total) + Number(c.vuelto || 0))}`);
  } else {
    l.push(`${iconoCuenta(c.forma_pago)} Abona por ${nombreCuenta(c.forma_pago).toUpperCase()}`);
  }
  if (c.notas) l.push(`📝 ${c.notas}`);
  return l.join('\n');
}

export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// día de la semana "operativo" (antes de las 3 AM sigue siendo el día anterior)
export function diaSemanaOperativo(f = new Date()) {
  return diaOperativo(f).getDay();
}

// cadete que trabaja hoy según sus días cargados
export function cadeteDelDia(cadetes, f = new Date()) {
  const d = diaSemanaOperativo(f);
  return (cadetes || []).find((c) => c.activo !== false && (c.dias || []).includes(d)) || null;
}

// arma un mensaje reemplazando {campos}; si una línea usa un campo vacío, la saca
export function armarMensaje(plantilla, datos) {
  const valor = (k) => (datos[k] !== undefined && datos[k] !== null ? String(datos[k]) : '');
  return String(plantilla || '')
    .split('\n')
    .filter((linea) => !(linea.match(/\{(\w+)\}/g) || []).some((m) => !valor(m.slice(1, -1)).trim()))
    .map((linea) => linea.replace(/\{(\w+)\}/g, (m, k) => valor(k)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// alerta de stock: 'bajo' (llegó al mínimo), 'cerca' (se está acercando) u 'ok'
export function nivelStock(stock, minimo) {
  const s = Number(stock) || 0, m = Number(minimo) || 0;
  if (m <= 0) return s <= 0 ? 'bajo' : 'ok';
  if (s <= m) return 'bajo';
  if (s <= Math.max(m * 1.3, m + 1)) return 'cerca';
  return 'ok';
}

// trae materias primas y congeladas con su nivel de alerta
export async function alertasStock(supabase) {
  const [{ data: ins }, { data: arts }] = await Promise.all([
    supabase.from('insumos').select('id, nombre, unidad, stock, minimo').eq('activo', true),
    supabase.from('articulos').select('id, nombre, stock, stock_minimo').eq('controla_stock', true).eq('activo', true),
  ]);
  const lista = [
    ...(ins || []).map((i) => ({ ...i, tipo: 'ins', nivel: nivelStock(i.stock, i.minimo) })),
    ...(arts || []).map((a) => ({ ...a, unidad: 'u', minimo: a.stock_minimo, tipo: 'art', nivel: nivelStock(a.stock, a.stock_minimo) })),
  ].filter((x) => x.nivel !== 'ok');
  return lista.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'bajo' ? -1 : 1));
}
