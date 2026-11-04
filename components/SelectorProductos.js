'use client';
import { money, num } from '@/lib/utils';
import { TIPOS, grupoDe, emojiDe } from '@/lib/eventos';

// Elegir qué se lleva al evento (con precio de evento) y cuánto stock se lleva de cada grupo.
// valor = { productos: { [articulo_id]: { precio: '10000', agotado: false } }, stocks: { [clave]: { llevado: '40', minimo: '5' } } }
export default function SelectorProductos({ articulos, rubros, valor, onCambio }) {
  const prods = valor.productos || {};
  const stocks = valor.stocks || {};
  const rubNom = Object.fromEntries(rubros.map((r) => [r.id, r.nombre]));
  const grupos = [
    ...rubros.map((r) => ({ id: r.id, nombre: r.nombre, arts: articulos.filter((a) => a.rubro_id === r.id) })),
    { id: 0, nombre: 'Sin rubro', arts: articulos.filter((a) => !rubros.some((r) => r.id === a.rubro_id)) },
  ].filter((g) => g.arts.length);

  const set = (p, s) => onCambio({ productos: p ?? prods, stocks: s ?? stocks });
  const toggle = (a) => {
    const p = { ...prods };
    if (p[a.id]) delete p[a.id]; else p[a.id] = { precio: String(Number(a.precio) || ''), agotado: false };
    set(p);
  };
  const toggleGrupo = (g) => {
    const p = { ...prods };
    const todos = g.arts.every((a) => p[a.id]);
    g.arts.forEach((a) => { if (todos) delete p[a.id]; else if (!p[a.id]) p[a.id] = { precio: String(Number(a.precio) || ''), agotado: false }; });
    set(p);
  };
  const cambiarPrecio = (id, x) => set({ ...prods, [id]: { ...prods[id], precio: x } });
  const cambiarStock = (clave, campo, x) => set(null, { ...stocks, [clave]: { ...stocks[clave], [campo]: x } });

  // grupos de stock según lo elegido
  const elegidos = articulos.filter((a) => prods[a.id]);
  const gruposStock = {};
  elegidos.forEach((a) => {
    const g = grupoDe(a, rubNom[a.rubro_id]);
    (gruposStock[g.clave] ||= { ...g, arts: [] }).arts.push({ ...a, consume: g.consume });
  });

  return (
    <div>
      <div className="sp-paso">1 · ¿Qué llevamos a vender?</div>
      {grupos.map((g) => {
        const todos = g.arts.every((a) => prods[a.id]);
        return (
          <div key={g.id} className="tarjeta" style={{ padding: 12 }}>
            <div className="sp-cab">
              <b>{g.nombre}</b>
              <button type="button" className="btn borde chico" onClick={() => toggleGrupo(g)}>{todos ? 'Sacar todos' : 'Todos'}</button>
            </div>
            {g.arts.map((a) => {
              const v = prods[a.id];
              const tipo = grupoDe(a, rubNom[a.rubro_id]).tipo;
              return (
                <div key={a.id} className={`sp-fila${v ? ' elegido' : ''}`}>
                  <button type="button" className="sp-toggle" onClick={() => toggle(a)} aria-pressed={!!v}>
                    <span className={`sp-check${v ? ' si' : ''}`}>{v ? '✓' : ''}</span>
                    <span className="sp-emoji">{emojiDe(tipo, a.nombre)}</span>
                    <span className="sp-txt">{a.nombre}<small>Precio de lista {money(a.precio)}</small></span>
                  </button>
                  {v && (
                    <label className="sp-precio"><small>Precio en el evento</small>
                      <input inputMode="numeric" value={v.precio} onChange={(e) => cambiarPrecio(a.id, e.target.value)} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {Object.keys(gruposStock).length > 0 && (
        <>
          <div className="sp-paso">2 · ¿Cuánto llevamos? <small>(vacío = sin control)</small></div>
          {Object.values(gruposStock).map((g) => {
            const v = stocks[g.clave] || {};
            const t = TIPOS[g.tipo] || TIPOS.otro;
            return (
              <div key={g.clave} className="sp-stock" style={{ '--c': t.color, '--f': t.fondo }}>
                <div className="sp-stock-nom">{emojiDe(g.tipo, g.nombre)} {g.nombre}</div>
                {g.ayuda && <div className="sp-stock-ayuda">{g.ayuda}</div>}
                {g.arts.length > 1 && (
                  <div className="sp-stock-ayuda">{g.arts.map((a) => `${a.nombre}: ${g.tipo === 'pizza' ? '1 masa' : `−${a.consume}`}`).join(' · ')}</div>
                )}
                <div className="sp-datos">
                  <label><small>Llevamos{g.tipo === 'pizza' ? ' (masas)' : g.tipo === 'sfija' ? ' (unidades)' : ''}</small>
                    <input inputMode="numeric" placeholder="—" value={v.llevado ?? ''} onChange={(e) => cambiarStock(g.clave, 'llevado', e.target.value)} />
                  </label>
                  <label><small>Avisar cuando queden</small>
                    <input inputMode="numeric" placeholder="0" value={v.minimo ?? ''} onChange={(e) => cambiarStock(g.clave, 'minimo', e.target.value)} />
                  </label>
                </div>
              </div>
            );
          })}
        </>
      )}
      <p className="suave chico-t centro">{elegidos.length} producto{elegidos.length === 1 ? '' : 's'} elegido{elegidos.length === 1 ? '' : 's'}</p>
    </div>
  );
}

// pasa lo elegido al formato de la base
export function paraGuardar(valor, articulos, rubros) {
  const rubNom = Object.fromEntries(rubros.map((r) => [r.id, r.nombre]));
  const orden = Object.fromEntries(articulos.map((a, i) => [a.id, i]));
  const productos = [], stocks = {};
  articulos.filter((a) => valor.productos?.[a.id]).forEach((a) => {
    const v = valor.productos[a.id];
    const g = grupoDe(a, rubNom[a.rubro_id]);
    const s = valor.stocks?.[g.clave] || {};
    stocks[g.clave] ||= {
      clave: g.clave, nombre: g.nombre, tipo: g.tipo, orden: Object.keys(stocks).length,
      llevado: String(s.llevado ?? '').trim() === '' ? null : num(s.llevado), minimo: num(s.minimo),
    };
    productos.push({ articulo_id: a.id, precio: num(v.precio), stock_clave: g.clave, consume: g.consume, agotado: !!v.agotado, orden: orden[a.id] ?? 0 });
  });
  return { productos, stocks: Object.values(stocks) };
}

// arma el valor del selector desde lo guardado en un evento
export function valorDesdeEvento(productos, stocks, articulos) {
  const ok = new Set(articulos.map((a) => a.id));
  const p = {}, s = {};
  productos.filter((x) => ok.has(x.articulo_id)).forEach((x) => { p[x.articulo_id] = { precio: String(Number(x.precio)), agotado: !!x.agotado }; });
  stocks.forEach((x) => { s[x.clave] = { llevado: x.llevado === null ? '' : String(Number(x.llevado)), minimo: Number(x.minimo) ? String(Number(x.minimo)) : '' }; });
  return { productos: p, stocks: s };
}
