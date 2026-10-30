// Interpreta pedidos dictados o pegados de WhatsApp.
// Ej: "una muzza, dos fugazzeta, una pepsi y media muzza media napolitana"
import { normalizar } from './utils';

const NUMEROS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, docena: 12,
};
const MITAD = new Set(['mitad', 'media', 'medio', 'mitades']);
const RELLENO = new Set([
  'de', 'del', 'la', 'el', 'las', 'los', 'y', 'e', 'con', 'por', 'favor', 'pizza', 'pizzas', 'quiero', 'mandame',
  'me', 'traes', 'traeme', 'enviame', 'mandas', 'manda', 'podes', 'podrias', 'necesito', 'tenes', 'para', 'a', 'al', 'otra', 'otro', 'mas', 'tambien', 'hola', 'buenas',
  'noches', 'tardes', 'porfa', 'gracias', 'pedido', 'grande', 'grandes', 'entera', 'enteras', 'unidad', 'unidades',
  'x', 'cada', 'una', 'que', 'sea', 'lo', 'le', 'te', 'pido', 'pedir', 'seria', 'serian',
]);

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function sing(t) {
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

function parecido(a, b) {
  if (a === b) return true;
  const x = sing(a), y = sing(b);
  if (x === y) return true;
  if (/^\d/.test(x) || /^\d/.test(y)) return false;
  if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))) return true;
  const d = lev(x, y);
  if (Math.max(x.length, y.length) >= 7) return d <= 2;
  if (Math.max(x.length, y.length) >= 4) return d <= 1;
  return false;
}

function frasesDe(articulos) {
  const frases = [];
  articulos.forEach((a) => {
    const lista = [a.nombre, ...(a.alias ? String(a.alias).split(',') : [])];
    lista.forEach((f) => {
      const tok = normalizar(f).split(' ').filter((t) => t && !['pizza', 'de', 'la', 'el'].includes(t));
      if (tok.length) frases.push({ art: a, tok });
    });
  });
  return frases;
}

// intenta matchear un artículo empezando en la posición i; devuelve {art, usados}
function matchear(tokens, i, frases) {
  let mejor = null;
  for (const f of frases) {
    if (!parecido(tokens[i], f.tok[0])) continue;
    let k = 1;
    while (k < f.tok.length && i + k < tokens.length && parecido(tokens[i + k], f.tok[k])) k++;
    const puntaje = k * 10 - (f.tok.length - k) + (tokens[i] === f.tok[0] ? 1 : 0);
    if (!mejor || puntaje > mejor.puntaje) mejor = { art: f.art, usados: k, puntaje };
  }
  return mejor;
}

export function interpretarPedido(texto, articulos) {
  const frases = frasesDe(articulos.filter((a) => a.activo !== false));
  const limpio = normalizar(String(texto).replace(/(\d),(\d)/g, '$1.$2'));
  const tokens = limpio.split(' ').filter(Boolean);
  const resultado = [];
  const noEntendido = [];
  let cantidad = null;
  let modoMitad = false;
  let mitadPendiente = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const m = matchear(tokens, i, frases);
    if (m) {
      i += m.usados - 1;
      if (mitadPendiente) {
        if (m.art.permite_mitad && mitadPendiente.art.permite_mitad) {
          resultado.push({ tipo: 'mitad', a: mitadPendiente.art, b: m.art, cantidad: mitadPendiente.cantidad || 1 });
        } else {
          resultado.push({ tipo: 'entera', a: mitadPendiente.art, cantidad: mitadPendiente.cantidad || 1 });
          resultado.push({ tipo: 'entera', a: m.art, cantidad: cantidad || 1 });
        }
        mitadPendiente = null;
      } else if (modoMitad && m.art.permite_mitad) {
        mitadPendiente = { art: m.art, cantidad: cantidad || 1 };
      } else {
        resultado.push({ tipo: 'entera', a: m.art, cantidad: cantidad || 1 });
      }
      cantidad = null;
      modoMitad = false;
      continue;
    }
    if (/^\d+$/.test(t)) { cantidad = parseInt(t, 10); continue; }
    if (NUMEROS[t] !== undefined && !(t === 'una' && cantidad)) { cantidad = NUMEROS[t]; continue; }
    if (MITAD.has(t)) { modoMitad = true; continue; }
    if (RELLENO.has(t)) continue;
    noEntendido.push(t);
  }
  if (mitadPendiente) resultado.push({ tipo: 'entera', a: mitadPendiente.art, cantidad: mitadPendiente.cantidad || 1, aviso: 'faltó la otra mitad' });

  // junta repetidos
  const juntos = [];
  resultado.forEach((r) => {
    const clave = r.tipo === 'mitad' ? `m-${[r.a.id, r.b.id].sort().join('-')}` : `e-${r.a.id}`;
    const ya = juntos.find((x) => x.clave === clave);
    if (ya) ya.cantidad += r.cantidad;
    else juntos.push({ ...r, clave });
  });
  return { items: juntos, noEntendido: [...new Set(noEntendido)] };
}
