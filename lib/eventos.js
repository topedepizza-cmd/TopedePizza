// Cálculos y textos del módulo Eventos
import { money, cant, partesPago, hora } from './utils';

export const ESTADOS_EVENTO = {
  preparando: { t: '👨‍🍳 En preparación', c: 'b-ambar' },
  lista: { t: '🔔 Listo para entregar', c: 'b-azul' },
  entregada: { t: '🤝 Entregado', c: 'b-verde' },
};

// arma el resumen de un evento con sus comandas (con items) y movimientos manuales
export function resumenEvento({ evento, productos = [], comandas = [], movs = [], articulos = [] }) {
  const validas = comandas.filter((c) => c.estado !== 'anulada');
  const cobradas = validas.filter((c) => c.estado === 'cobrada');
  const sinCobrar = validas.filter((c) => c.estado === 'abierta');
  const vendido = validas.reduce((a, c) => a + Number(c.total), 0);
  let efectivo = 0, mercadopago = 0;
  cobradas.forEach((c) => { const pp = partesPago(c); efectivo += pp.efectivo; mercadopago += pp.mercadopago; });

  // productos: vendido (las mitad y mitad suman ½ a cada gusto) vs llevado
  const artNom = Object.fromEntries(articulos.map((a) => [a.id, a.nombre]));
  const prods = {};
  productos.forEach((p) => { prods[p.articulo_id] = { nombre: artNom[p.articulo_id] || 'Producto', vendido: 0, total: 0, llevado: p.llevado === null || p.llevado === undefined ? null : Number(p.llevado) }; });
  let unidades = 0;
  validas.forEach((c) => (c.comanda_items || []).forEach((i) => {
    const q = Number(i.cantidad), st = Number(i.subtotal);
    unidades += q;
    const partes = i.es_mitad && i.articulo2_id ? [[i.articulo_id, 0.5], [i.articulo2_id, 0.5]] : [[i.articulo_id, 1]];
    partes.forEach(([aid, f]) => {
      const k = aid || 'd' + i.descripcion;
      (prods[k] ||= { nombre: artNom[aid] || i.descripcion, vendido: 0, total: 0, llevado: null });
      prods[k].vendido += q * f; prods[k].total += st * f;
    });
  }));

  // pedidos por franja de 30 minutos (para ver los picos)
  const franjas = {};
  validas.forEach((c) => {
    const d = new Date(c.created_at);
    const m = d.getMinutes() < 30 ? '00' : '30';
    const k = `${String(d.getHours()).padStart(2, '0')}:${m}`;
    const orden = ((d.getHours() + 18) % 24) * 2 + (m === '30' ? 1 : 0); // de 6 AM en adelante
    (franjas[k] ||= { nombre: k, n: 0, total: 0, orden }); franjas[k].n++; franjas[k].total += Number(c.total);
  });

  const gastosLista = movs.filter((m) => m.tipo === 'egreso' && !m.comanda_id);
  const ingresosExtra = movs.filter((m) => m.tipo === 'ingreso' && !m.comanda_id);
  const gastos = gastosLista.reduce((a, m) => a + Number(m.monto), 0);
  const extras = ingresosExtra.reduce((a, m) => a + Number(m.monto), 0);
  const minutos = evento ? Math.max(1, Math.round(((evento.cerrado_at ? new Date(evento.cerrado_at) : new Date()) - new Date(evento.abierto_at)) / 60000)) : 0;

  return {
    validas, cobradas, sinCobrar, anuladas: comandas.length - validas.length,
    vendido, cobrado: efectivo + mercadopago, efectivo, mercadopago,
    pendiente: sinCobrar.reduce((a, c) => a + Number(c.total), 0),
    n: validas.length, ticket: validas.length ? vendido / validas.length : 0, unidades,
    productos: Object.values(prods).sort((a, b) => b.vendido - a.vendido),
    franjas: Object.values(franjas).sort((a, b) => a.orden - b.orden),
    gastosLista, gastos, extras, resultado: vendido + extras - gastos, minutos,
    porHora: minutos >= 30 ? vendido / (minutos / 60) : null,
  };
}

export function duracion(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

// texto para mandar a la socia por WhatsApp
export function textoEvento(evento, r) {
  const l = [`🎪 *${evento.nombre}*${evento.lugar ? ' — ' + evento.lugar : ''}`];
  l.push(`🕒 ${hora(evento.abierto_at)} a ${evento.cerrado_at ? hora(evento.cerrado_at) : 'ahora'} (${duracion(r.minutos)})`);
  l.push('');
  l.push(`🧾 Pedidos: ${r.n} · Vendido: *${money(r.vendido)}*`);
  l.push(`🎟️ Ticket promedio: ${money(r.ticket)}`);
  l.push(`💵 Efectivo: ${money(r.efectivo)}`);
  l.push(`📱 Mercado Pago: ${money(r.mercadopago)}`);
  if (r.sinCobrar.length) l.push(`⏳ Sin cobrar: ${r.sinCobrar.length} (${money(r.pendiente)})`);
  if (r.anuladas) l.push(`❌ Anulados: ${r.anuladas}`);
  if (r.gastos) {
    l.push(`💸 Gastos del evento: ${money(r.gastos)}`);
    r.gastosLista.forEach((m) => l.push(`   • ${m.concepto}${m.detalle ? ` (${String(m.detalle).replace(/ · 🎪.*$/, '').replace(/^🎪.*$/, '')})` : ''}: ${money(m.monto)}`.replace(' ()', '')));
  }
  l.push(`📈 *Resultado: ${money(r.resultado)}*`);
  l.push('');
  l.push('🍕 *Productos*');
  r.productos.filter((p) => p.vendido > 0 || p.llevado).forEach((p) => {
    let t = `   • ${p.nombre}: ${cant(p.vendido)}`;
    if (p.llevado !== null && p.llevado !== undefined) t += ` de ${cant(p.llevado)} (sobran ${cant(Math.max(p.llevado - p.vendido, 0))})`;
    l.push(t + ` — ${money(p.total)}`);
  });
  return l.join('\n');
}
