'use client';
import { money, num } from '@/lib/utils';

// Elegir qué productos se llevan al evento, con precio de evento y cantidad que se lleva (opcional).
// valor = { [articulo_id]: { precio: '10000', llevado: '' } }
export default function SelectorProductos({ articulos, rubros, valor, onCambio }) {
  const grupos = [
    ...rubros.map((r) => ({ id: r.id, nombre: r.nombre, arts: articulos.filter((a) => a.rubro_id === r.id) })),
    { id: 0, nombre: 'Sin rubro', arts: articulos.filter((a) => !rubros.some((r) => r.id === a.rubro_id)) },
  ].filter((g) => g.arts.length);

  const toggle = (a) => {
    const v = { ...valor };
    if (v[a.id]) delete v[a.id]; else v[a.id] = { precio: String(Number(a.precio) || ''), llevado: '' };
    onCambio(v);
  };
  const toggleGrupo = (g) => {
    const v = { ...valor };
    const todos = g.arts.every((a) => v[a.id]);
    g.arts.forEach((a) => { if (todos) delete v[a.id]; else if (!v[a.id]) v[a.id] = { precio: String(Number(a.precio) || ''), llevado: '' }; });
    onCambio(v);
  };
  const cambiar = (id, campo, x) => onCambio({ ...valor, [id]: { ...valor[id], [campo]: x } });
  const elegidos = Object.keys(valor).length;

  return (
    <div>
      <div className="aviso azul" style={{ marginBottom: 10 }}>
        Marcá lo que llevan. Podés poner un <b>precio especial de evento</b> y, si querés, <b>cuántos llevan</b> para ver al cierre cuánto sobró.
      </div>
      {grupos.map((g) => {
        const todos = g.arts.every((a) => valor[a.id]);
        return (
          <div key={g.id} className="tarjeta" style={{ padding: 12 }}>
            <div className="sp-cab">
              <b>{g.nombre}</b>
              <button type="button" className="btn borde chico" onClick={() => toggleGrupo(g)}>{todos ? 'Sacar todos' : 'Todos'}</button>
            </div>
            {g.arts.map((a) => {
              const v = valor[a.id];
              return (
                <div key={a.id} className={`sp-fila${v ? ' elegido' : ''}`}>
                  <label className="sp-nom" onClick={(e) => { e.preventDefault(); toggle(a); }}>
                    <input type="checkbox" readOnly checked={!!v} />
                    <span>{a.nombre}<small>Lista {money(a.precio)}</small></span>
                  </label>
                  {v && (
                    <div className="sp-datos">
                      <label><small>Precio</small><input inputMode="numeric" value={v.precio} onChange={(e) => cambiar(a.id, 'precio', e.target.value)} /></label>
                      <label><small>Llevamos</small><input inputMode="decimal" placeholder="—" value={v.llevado} onChange={(e) => cambiar(a.id, 'llevado', e.target.value)} /></label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="suave chico-t centro">{elegidos} producto{elegidos === 1 ? '' : 's'} elegido{elegidos === 1 ? '' : 's'}</p>
    </div>
  );
}

// pasa el valor del selector al formato que espera la base
export function productosParaGuardar(valor, articulos) {
  const orden = Object.fromEntries(articulos.map((a, i) => [a.id, i]));
  return Object.entries(valor).map(([id, v]) => ({
    articulo_id: Number(id), precio: num(v.precio), llevado: String(v.llevado ?? '').trim() === '' ? null : num(v.llevado), orden: orden[id] ?? 0,
  }));
}
