// Cálculos y textos del módulo Eventos
import { money, cant, partesPago, hora } from './utils';

// ---------- tipos de producto: color, emoji y grupo de stock ----------
export const TIPOS = {
  pizza: { emoji: '🍕', color: '#e2261c', fondo: '#fff4f2' },
  sfija: { emoji: '🥟', color: '#a8641f', fondo: '#fbf1e4' },
  bebida: { emoji: '🥤', color: '#2f5fb3', fondo: '#eef3fc' },
  congelada: { emoji: '🧊', color: '#16a085', fondo: '#e8f7f3' },
  otro: { emoji: '🍽️', color: '#8e44ad', fondo: '#f5eefa' },
};

export function tipoDe(art, rubroNombre = '') {
  const r = String(rubroNombre).toLowerCase(), n = String(art?.nombre || '').toLowerCase();
  if (/congel/.test(r) || /congel/.test(n)) return 'congelada';
  if (/sfij|esfi|sfih|empanad/.test(r) || /sfij|esfi|sfih/.test(n)) return 'sfija';
  if (/pizz/.test(r)) return 'pizza';
  if (/bebid|gaseos|cervez|agua|jugo/.test(r)) return 'bebida';
  return 'otro';
}
export const emojiDe = (tipo, nombre = '') => (tipo === 'bebida' && /cervez|birra/i.test(nombre) ? '🍺' : TIPOS[tipo]?.emoji || '🍽️');

// unidades que trae un producto de sfijas: docena 12, media docena 6, "x 3" 3…
export function unidadesSfija(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (/media/.test(n) && /docena/.test(n)) return 6;
  if (/docena/.test(n)) return 12;
  const m = n.match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}

// a qué grupo de stock va cada producto
export function grupoDe(art, rubroNombre) {
  const tipo = tipoDe(art, rubroNombre);
  if (tipo === 'pizza') return { clave: 'masas', nombre: 'Masas de pizza', tipo, consume: 1, ayuda: 'Cada pizza usa 1 masa (½ y ½ también usa 1).' };
  if (tipo === 'sfija') return { clave: 'sfijas', nombre: 'Sfijas (unidades)', tipo, consume: unidadesSfija(art.nombre), ayuda: 'Se cuentan por unidad: la docena descuenta 12 y la media docena 6.' };
  return { clave: 'art-' + art.id, nombre: art.nombre, tipo, consume: 1, ayuda: '' };
}

// cuánto queda de cada grupo: { [stock_id]: { usado, quedan, alerta } }  (items extra = el pedido que se está armando)
export function calcularStocks(stocks = [], productos = [], comandas = [], itemsExtra = []) {
  const prod = Object.fromEntries(productos.map((p) => [p.articulo_id, p]));
  const consumo = (lista, acum) => lista.forEach((i) => {
    const partes = i.es_mitad && i.articulo2_id ? [[i.articulo_id, 0.5], [i.articulo2_id, 0.5]] : [[i.articulo_id, 1]];
    partes.forEach(([aid, f]) => { const p = prod[aid]; if (p?.stock_id) acum[p.stock_id] = (acum[p.stock_id] || 0) + Number(i.cantidad) * Number(p.consume || 1) * f; });
  });
  const usado = {}, enPedido = {};
  comandas.filter((c) => c.estado !== 'anulada').forEach((c) => consumo(c.comanda_items || [], usado));
  consumo(itemsExtra, enPedido);
  const out = {};
  stocks.forEach((s) => {
    const u = usado[s.id] || 0, e = enPedido[s.id] || 0;
    const llevado = s.llevado === null || s.llevado === undefined ? null : Number(s.llevado);
    const quedan = llevado === null ? null : llevado - u;
    const libre = quedan === null ? null : quedan - e;
    out[s.id] = { ...s, usado: u, enPedido: e, quedan, libre, alerta: quedan !== null && quedan <= Number(s.minimo || 0), sinStock: quedan !== null && quedan <= 0 };
  });
  return out;
}

export const ESTADOS_EVENTO = {
  preparando: { t: '👨‍🍳 En preparación', c: 'b-ambar' },
  lista: { t: '🔔 Listo para entregar', c: 'b-azul' },
  entregada: { t: '🤝 Entregado', c: 'b-verde' },
};

// arma el resumen de un evento con sus comandas (con items) y movimientos manuales
export function resumenEvento({ evento, productos = [], comandas = [], movs = [], articulos = [], stocks = [] }) {
  const validas = comandas.filter((c) => c.estado !== 'anulada');
  const cobradas = validas.filter((c) => c.estado === 'cobrada');
  const sinCobrar = validas.filter((c) => c.estado === 'abierta');
  const vendido = validas.reduce((a, c) => a + Number(c.total), 0);
  let efectivo = 0, mercadopago = 0;
  cobradas.forEach((c) => { const pp = partesPago(c); efectivo += pp.efectivo; mercadopago += pp.mercadopago; });

  // productos: vendido (las mitad y mitad suman ½ a cada gusto) vs llevado
  const artNom = Object.fromEntries(articulos.map((a) => [a.id, a.nombre]));
  const prods = {};
  productos.forEach((p) => { prods[p.articulo_id] = { nombre: artNom[p.articulo_id] || 'Producto', vendido: 0, total: 0, agotado: p.agotado }; });
  let unidades = 0;
  validas.forEach((c) => (c.comanda_items || []).forEach((i) => {
    const q = Number(i.cantidad), st = Number(i.subtotal);
    unidades += q;
    const partes = i.es_mitad && i.articulo2_id ? [[i.articulo_id, 0.5], [i.articulo2_id, 0.5]] : [[i.articulo_id, 1]];
    partes.forEach(([aid, f]) => {
      const k = aid || 'd' + i.descripcion;
      (prods[k] ||= { nombre: artNom[aid] || i.descripcion, vendido: 0, total: 0 });
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
    stocks: Object.values(calcularStocks(stocks, productos, comandas)),
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
  l.push('🍕 *Productos vendidos*');
  r.productos.filter((p) => p.vendido > 0).forEach((p) => l.push(`   • ${p.nombre}: ${cant(p.vendido)} — ${money(p.total)}`));
  const conStock = r.stocks.filter((s) => s.llevado !== null);
  if (conStock.length) {
    l.push('');
    l.push('📦 *Stock*');
    conStock.forEach((s) => l.push(`   • ${emojiDe(s.tipo, s.nombre)} ${s.nombre}: llevamos ${cant(s.llevado)}, usamos ${cant(s.usado)}, sobran ${cant(Math.max(s.quedan, 0))}`));
  }
  return l.join('\n');
}
