'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Chips, Campo, Cargando, Vacio, Confirmar } from '@/components/ui';
import { money, num, cant } from '@/lib/utils';

export default function Codificacion() {
  const { avisar } = useApp();
  const [confirmar, setConfirmar] = useState(null);
  const [tab, setTab] = useState('articulos');
  const [rubros, setRubros] = useState(null);
  const [subrubros, setSubrubros] = useState([]);
  const [articulos, setArticulos] = useState([]);
  const [edit, setEdit] = useState(null); // {tipo, ...datos}
  const [precios, setPrecios] = useState(null);
  const [buscar, setBuscar] = useState('');

  const cargar = useCallback(async () => {
    const [{ data: r }, { data: s }, { data: a }] = await Promise.all([
      supabase.from('rubros').select('*').order('orden').order('nombre'),
      supabase.from('subrubros').select('*').order('orden').order('nombre'),
      supabase.from('articulos').select('*').order('orden').order('nombre'),
    ]);
    setRubros(r || []); setSubrubros(s || []); setArticulos(a || []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const nomRubro = (id) => rubros?.find((r) => r.id === id)?.nombre || 'Sin rubro';
  const nomSub = (id) => subrubros.find((s) => s.id === id)?.nombre || '';

  async function guardar() {
    const e = edit;
    let res;
    if (e.tipo === 'articulo') {
      const d = {
        codigo: e.codigo || null, nombre: (e.nombre || '').trim(), rubro_id: e.rubro_id || null, subrubro_id: e.subrubro_id || null,
        precio: num(e.precio), costo: num(e.costo), permite_mitad: !!e.permite_mitad, controla_stock: !!e.controla_stock,
        stock_minimo: num(e.stock_minimo), alias: e.alias || null, orden: num(e.orden), activo: e.activo !== false,
      };
      if (!d.nombre) return avisar('Poné un nombre', 'error');
      res = e.id ? await supabase.from('articulos').update(d).eq('id', e.id) : await supabase.from('articulos').insert(d);
    } else if (e.tipo === 'rubro') {
      const d = { nombre: (e.nombre || '').trim(), orden: num(e.orden), activo: e.activo !== false };
      if (!d.nombre) return avisar('Poné un nombre', 'error');
      res = e.id ? await supabase.from('rubros').update(d).eq('id', e.id) : await supabase.from('rubros').insert(d);
    } else {
      const d = { nombre: (e.nombre || '').trim(), rubro_id: e.rubro_id, orden: num(e.orden), activo: e.activo !== false };
      if (!d.nombre || !d.rubro_id) return avisar('Completá nombre y rubro', 'error');
      res = e.id ? await supabase.from('subrubros').update(d).eq('id', e.id) : await supabase.from('subrubros').insert(d);
    }
    if (res.error) return avisar(res.error.message, 'error');
    avisar('Guardado ✔');
    setEdit(null);
    cargar();
  }

  function borrar() {
    const tabla = edit.tipo === 'articulo' ? 'articulos' : edit.tipo === 'rubro' ? 'rubros' : 'subrubros';
    setConfirmar({
      titulo: `¿Borrar ${edit.nombre}?`, boton: 'Borrar', peligro: true,
      mensaje: edit.tipo === 'articulo' ? 'Las ventas viejas quedan con su descripción. Si solo querés que no aparezca para vender, destildá “Activo”.' : 'Los artículos de este rubro/subrubro quedan sin asignar.',
      onOk: async () => {
        const { error } = await supabase.from(tabla).delete().eq('id', edit.id);
        if (error) return avisar(error.message, 'error');
        avisar('Borrado');
        setEdit(null);
        cargar();
      },
    });
  }

  function redondear(v, r) { return r > 0 ? Math.round(v / r) * r : Math.round(v); }
  const afectados = precios ? articulos.filter((a) => a.activo && (precios.rubro === 'todos' || a.rubro_id === precios.rubro)) : [];
  function aplicarPrecios() {
    const pct = num(precios.pct);
    if (!pct) return avisar('Poné un porcentaje', 'error');
    setConfirmar({
      titulo: `¿Actualizar ${afectados.length} precios un ${pct}%?`, boton: 'Actualizar',
      onOk: async () => {
        for (const a of afectados) {
          await supabase.from('articulos').update({ precio: redondear(Number(a.precio) * (1 + pct / 100), precios.red) }).eq('id', a.id);
        }
        avisar('Precios actualizados ✔');
        setPrecios(null);
        cargar();
      },
    });
  }

  if (!rubros) return <><Cabecera titulo="Codificación" /><Cargando /></>;

  const nuevo = () => {
    if (tab === 'articulos') setEdit({ tipo: 'articulo', nombre: '', rubro_id: rubros[0]?.id || null, precio: '', costo: '', permite_mitad: false, controla_stock: false, activo: true, orden: articulos.length + 1 });
    if (tab === 'rubros') setEdit({ tipo: 'rubro', nombre: '', orden: rubros.length + 1, activo: true });
    if (tab === 'subrubros') setEdit({ tipo: 'subrubro', nombre: '', rubro_id: rubros[0]?.id, orden: 0, activo: true });
  };

  const artsFiltrados = articulos.filter((a) => !buscar || `${a.nombre} ${a.codigo || ''}`.toLowerCase().includes(buscar.toLowerCase()));

  return (
    <>
      <Cabecera titulo="Codificación" derecha={<button className="btn primario chico" onClick={nuevo}>+ Nuevo</button>} />
      <Chips valor={tab} onCambio={setTab} opciones={[{ id: 'articulos', label: `Artículos (${articulos.length})` }, { id: 'rubros', label: 'Rubros' }, { id: 'subrubros', label: 'Subrubros' }]} />
      <div style={{ height: 12 }} />

      {tab === 'articulos' && (
        <>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <input placeholder="🔎 Buscar" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            <button className="btn borde" onClick={() => setPrecios({ rubro: 'todos', pct: '', red: 100 })}>% Actualizar precios</button>
          </div>
          {[...rubros, { id: null, nombre: 'Sin rubro' }].map((r) => {
            const lista = artsFiltrados.filter((a) => (a.rubro_id || null) === r.id);
            if (!lista.length) return null;
            return (
              <div key={r.id ?? 'sin'}>
                <div className="seccion-titulo">{r.nombre}</div>
                <div className="lista">
                  {lista.map((a) => (
                    <div key={a.id} className="item clic" style={{ opacity: a.activo ? 1 : 0.45 }} onClick={() => setEdit({ tipo: 'articulo', ...a })}>
                      <div className="item-cuerpo">
                        <div className="item-titulo">{a.codigo ? <span className="suave">{a.codigo} · </span> : null}{a.nombre}</div>
                        <div className="item-sub">
                          {nomSub(a.subrubro_id)}
                          {a.permite_mitad && <span className="badge b-ambar" style={{ marginLeft: 6 }}>½</span>}
                          {a.controla_stock && <span className="badge b-azul" style={{ marginLeft: 6 }}>stock {cant(a.stock)}</span>}
                          {!a.activo && <span className="badge b-gris" style={{ marginLeft: 6 }}>inactivo</span>}
                        </div>
                      </div>
                      <div className="item-der mono">{money(a.precio)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === 'rubros' && (rubros.length === 0 ? <Vacio texto="Sin rubros" /> : (
        <div className="lista">
          {rubros.map((r) => (
            <div key={r.id} className="item clic" style={{ opacity: r.activo ? 1 : 0.45 }} onClick={() => setEdit({ tipo: 'rubro', ...r })}>
              <div className="item-cuerpo"><div className="item-titulo">{r.nombre}</div><div className="item-sub">{articulos.filter((a) => a.rubro_id === r.id).length} artículos · orden {r.orden}</div></div>
              <span className="suave">›</span>
            </div>
          ))}
        </div>
      ))}

      {tab === 'subrubros' && rubros.map((r) => {
        const subs = subrubros.filter((x) => x.rubro_id === r.id);
        return (
          <div key={r.id}>
            <div className="seccion-titulo">{r.nombre} <span className="suave chico-t" style={{ fontFamily: 'inherit', fontWeight: 600 }}>· {subs.length} subrubros</span></div>
            <div className="lista">
              {subs.map((x) => (
                <div key={x.id} className="item clic" style={{ opacity: x.activo ? 1 : 0.45 }} onClick={() => setEdit({ tipo: 'subrubro', ...x })}>
                  <div className="item-cuerpo">
                    <div className="item-titulo">{x.nombre}</div>
                    <div className="item-sub">{articulos.filter((a) => a.subrubro_id === x.id).map((a) => a.nombre).join(', ') || 'sin artículos'}</div>
                  </div>
                  <span className="suave">›</span>
                </div>
              ))}
              <div className="item clic item-accion" onClick={() => setEdit({ tipo: 'subrubro', nombre: '', rubro_id: r.id, orden: subs.length + 1, activo: true })}>+ Subrubro en {r.nombre}</div>
            </div>
          </div>
        );
      })}

      {/* EDITAR */}
      <Hoja abierta={!!edit} titulo={edit?.id ? `Editar ${edit.tipo}` : `Nuevo ${edit?.tipo || ''}`} onCerrar={() => setEdit(null)}
        pie={
          <div className="fila-btns">
            {edit?.id && <button className="btn peligro" onClick={borrar}>Borrar</button>}
            <button className="btn primario" onClick={guardar}>Guardar</button>
          </div>
        }>
        {edit && edit.tipo === 'articulo' && (
          <>
            <div className="grid2">
              <Campo label="Código"><input value={edit.codigo || ''} onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} /></Campo>
              <Campo label="Orden"><input inputMode="numeric" value={edit.orden ?? ''} onChange={(e) => setEdit({ ...edit, orden: e.target.value })} /></Campo>
            </div>
            <Campo label="Nombre"><input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
            <div className="grid2">
              <Campo label="Rubro">
                <select value={edit.rubro_id || ''} onChange={(e) => setEdit({ ...edit, rubro_id: Number(e.target.value) || null, subrubro_id: null })}>
                  <option value="">—</option>
                  {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Subrubro">
                <select value={edit.subrubro_id || ''} onChange={(e) => setEdit({ ...edit, subrubro_id: Number(e.target.value) || null })}>
                  <option value="">—</option>
                  {subrubros.filter((s) => s.rubro_id === edit.rubro_id).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Precio de venta"><input inputMode="numeric" value={edit.precio} onChange={(e) => setEdit({ ...edit, precio: e.target.value })} /></Campo>
              <Campo label="Costo (opcional)"><input inputMode="numeric" value={edit.costo} onChange={(e) => setEdit({ ...edit, costo: e.target.value })} /></Campo>
            </div>
            {num(edit.costo) > 0 && num(edit.precio) > 0 && <div className="aviso verde">Margen: {money(num(edit.precio) - num(edit.costo))} ({Math.round(((num(edit.precio) - num(edit.costo)) / num(edit.precio)) * 100)}%)</div>}
            <label className="check"><input type="checkbox" checked={!!edit.permite_mitad} onChange={(e) => setEdit({ ...edit, permite_mitad: e.target.checked })} />Se puede pedir mitad y mitad</label>
            <label className="check"><input type="checkbox" checked={!!edit.controla_stock} onChange={(e) => setEdit({ ...edit, controla_stock: e.target.checked })} />Controla stock (ej: congeladas)</label>
            {edit.controla_stock && <Campo label="Stock mínimo"><input inputMode="numeric" value={edit.stock_minimo ?? ''} onChange={(e) => setEdit({ ...edit, stock_minimo: e.target.value })} /></Campo>}
            <Campo label="Alias para dictado" ayuda="Otras formas en que lo piden, separadas por coma. Ej: muzza, mozzarella">
              <input value={edit.alias || ''} onChange={(e) => setEdit({ ...edit, alias: e.target.value })} />
            </Campo>
            <label className="check"><input type="checkbox" checked={edit.activo !== false} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })} />Activo (aparece para vender)</label>
          </>
        )}
        {edit && edit.tipo !== 'articulo' && (
          <>
            {edit.tipo === 'subrubro' && (
              <Campo label="Rubro">
                <select value={edit.rubro_id || ''} onChange={(e) => setEdit({ ...edit, rubro_id: Number(e.target.value) })}>
                  {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </Campo>
            )}
            <Campo label="Nombre"><input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
            <Campo label="Orden"><input inputMode="numeric" value={edit.orden ?? ''} onChange={(e) => setEdit({ ...edit, orden: e.target.value })} /></Campo>
            <label className="check"><input type="checkbox" checked={edit.activo !== false} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })} />Activo</label>
          </>
        )}
      </Hoja>

      {/* PRECIOS */}
      <Hoja abierta={!!precios} titulo="Actualizar precios" onCerrar={() => setPrecios(null)}
        pie={<button className="btn primario bloque" onClick={aplicarPrecios}>Aplicar a {afectados.length} artículos</button>}>
        {precios && (
          <>
            <Campo label="Rubro">
              <select value={precios.rubro} onChange={(e) => setPrecios({ ...precios, rubro: e.target.value === 'todos' ? 'todos' : Number(e.target.value) })}>
                <option value="todos">Todos</option>
                {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </Campo>
            <div className="grid2">
              <Campo label="Aumento %" ayuda="Negativo para bajar"><input inputMode="decimal" value={precios.pct} onChange={(e) => setPrecios({ ...precios, pct: e.target.value })} /></Campo>
              <Campo label="Redondear a">
                <select value={precios.red} onChange={(e) => setPrecios({ ...precios, red: Number(e.target.value) })}>
                  <option value={0}>Sin redondeo</option><option value={10}>$10</option><option value={100}>$100</option><option value={500}>$500</option>
                </select>
              </Campo>
            </div>
            {num(precios.pct) !== 0 && afectados.slice(0, 12).map((a) => (
              <div key={a.id} className="resumen-linea chico-t"><span>{a.nombre}</span><span className="mono">{money(a.precio)} → <b>{money(redondear(Number(a.precio) * (1 + num(precios.pct) / 100), precios.red))}</b></span></div>
            ))}
          </>
        )}
      </Hoja>
      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />
    </>
  );
}
