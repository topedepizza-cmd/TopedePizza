'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, traerTodo } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Chips, Campo, Cargando, Vacio, Confirmar } from '@/components/ui';
import { money, fechaCorta, fechaHora, linkWhatsapp, cant } from '@/lib/utils';

export default function Clientes() {
  const { avisar } = useApp();
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(null);
  const [clientes, setClientes] = useState(null);
  const [stats, setStats] = useState({});
  const [orden, setOrden] = useState('compras');
  const [buscar, setBuscar] = useState('');
  const [edit, setEdit] = useState(null);
  const [pedidos, setPedidos] = useState([]);

  const cargar = useCallback(async () => {
    try {
      const [cl, cm] = await Promise.all([
        traerTodo(() => supabase.from('clientes').select('*').order('nombre')),
        traerTodo(() => supabase.from('comandas').select('cliente_id, total, created_at').neq('estado', 'anulada').not('cliente_id', 'is', null)),
      ]);
      const st = {};
      cm.forEach((c) => {
        const s = (st[c.cliente_id] ||= { n: 0, total: 0, ultima: null });
        s.n++; s.total += Number(c.total);
        if (!s.ultima || c.created_at > s.ultima) s.ultima = c.created_at;
      });
      setStats(st);
      setClientes(cl);
    } catch (e) { avisar(e.message, 'error'); }
  }, [avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => {
    let l = clientes || [];
    if (buscar.trim()) {
      const b = buscar.toLowerCase();
      l = l.filter((c) => `${c.nombre} ${c.telefono || ''} ${c.direccion || ''}`.toLowerCase().includes(b));
    }
    const s = (c) => stats[c.id] || { n: 0, total: 0, ultima: '' };
    if (orden === 'compras') l = [...l].sort((a, b) => s(b).total - s(a).total);
    if (orden === 'recientes') l = [...l].sort((a, b) => String(s(b).ultima || '').localeCompare(String(s(a).ultima || '')));
    if (orden === 'dormidos') l = [...l].filter((c) => s(c).n > 0).sort((a, b) => String(s(a).ultima).localeCompare(String(s(b).ultima)));
    return l;
  }, [clientes, buscar, orden, stats]);

  async function abrir(c) {
    setEdit({ ...c });
    setPedidos([]);
    if (c.id) {
      const { data } = await supabase.from('comandas').select('id, numero, total, created_at, estado, comanda_items(descripcion, cantidad)')
        .eq('cliente_id', c.id).order('id', { ascending: false }).limit(10);
      setPedidos(data || []);
    }
  }

  async function guardar() {
    const d = { nombre: edit.nombre?.trim(), telefono: edit.telefono || null, direccion: edit.direccion || null, referencia: edit.referencia || null, notas: edit.notas || null };
    if (!d.nombre) return avisar('Poné un nombre', 'error');
    const { error } = edit.id ? await supabase.from('clientes').update(d).eq('id', edit.id) : await supabase.from('clientes').insert(d);
    if (error) return avisar(error.message, 'error');
    avisar('Cliente guardado ✔');
    setEdit(null);
    cargar();
  }
  function borrar() {
    setConfirmar({
      titulo: `¿Borrar a ${edit.nombre}?`, mensaje: 'Sus comandas quedan igual.', boton: 'Borrar', peligro: true,
      onOk: async () => {
        const { error } = await supabase.from('clientes').delete().eq('id', edit.id);
        if (error) return avisar(error.message, 'error');
        avisar('Cliente borrado');
        setEdit(null);
        cargar();
      },
    });
  }

  if (!clientes) return <><Cabecera titulo="Clientes" /><Cargando /></>;

  return (
    <>
      <Cabecera titulo="Clientes" sub={`${clientes.length} cargados`} derecha={<button className="btn primario chico" onClick={() => abrir({ nombre: '' })}>+ Nuevo</button>} />
      <input placeholder="🔎 Buscar nombre, teléfono, dirección…" value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ marginBottom: 10 }} />
      <Chips valor={orden} onCambio={setOrden} opciones={[
        { id: 'compras', label: '🏆 Más compran' }, { id: 'recientes', label: '🕐 Recientes' },
        { id: 'dormidos', label: '😴 Hace mucho no piden' }, { id: 'az', label: 'A-Z' },
      ]} />
      <div style={{ height: 10 }} />
      {lista.length === 0 ? <Vacio texto="No hay clientes" /> : (
        <div className="lista">
          {lista.map((c) => {
            const s = stats[c.id];
            return (
              <div key={c.id} className="item clic" onClick={() => abrir(c)}>
                <div className="item-cuerpo">
                  <div className="item-titulo">{c.nombre} {s && s.n >= 5 && <span className="badge b-ambar">⭐ {s.n} pedidos</span>}</div>
                  <div className="item-sub">{[c.direccion, c.telefono].filter(Boolean).join(' · ') || '—'}</div>
                  {s && <div className="item-sub">{s.n} pedidos · último {fechaCorta(s.ultima)}</div>}
                </div>
                <div className="item-der mono">{s ? money(s.total) : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      <Hoja abierta={!!edit} titulo={edit?.id ? edit.nombre : 'Nuevo cliente'} onCerrar={() => setEdit(null)}
        pie={
          <div className="fila-btns">
            {edit?.id && <button className="btn peligro" onClick={borrar}>Borrar</button>}
            <button className="btn primario" onClick={guardar}>Guardar</button>
          </div>
        }>
        {edit && (
          <>
            {edit.id && (
              <div className="fila-btns" style={{ marginBottom: 12 }}>
                <button className="btn verde chico" onClick={() => router.push(`/comanda/nueva?cliente=${edit.id}`)}>+ Comanda</button>
                {edit.telefono && <a className="btn borde chico" href={linkWhatsapp(edit.telefono, `Hola ${edit.nombre}! `)} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                {edit.telefono && <a className="btn borde chico" href={`tel:${edit.telefono}`}>📞 Llamar</a>}
              </div>
            )}
            <Campo label="Nombre"><input value={edit.nombre || ''} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
            <Campo label="Teléfono"><input inputMode="tel" value={edit.telefono || ''} onChange={(e) => setEdit({ ...edit, telefono: e.target.value })} /></Campo>
            <Campo label="Dirección"><input value={edit.direccion || ''} onChange={(e) => setEdit({ ...edit, direccion: e.target.value })} /></Campo>
            <Campo label="Referencia"><input value={edit.referencia || ''} onChange={(e) => setEdit({ ...edit, referencia: e.target.value })} /></Campo>
            <Campo label="Notas"><textarea value={edit.notas || ''} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} placeholder="Ej: siempre pide sin cebolla" /></Campo>
            {pedidos.length > 0 && (
              <>
                <div className="campo-label">Últimos pedidos</div>
                <div className="lista">
                  {pedidos.map((p) => (
                    <div key={p.id} className="item clic" onClick={() => router.push(`/comanda/${p.id}`)}>
                      <div className="item-cuerpo">
                        <div className="item-titulo">{fechaHora(p.created_at)} {p.estado === 'anulada' && <span className="badge b-gris">anulada</span>}</div>
                        <div className="item-sub">{p.comanda_items.map((i) => `${cant(i.cantidad)} ${i.descripcion}`).join(' · ')}</div>
                      </div>
                      <div className="item-der mono">{money(p.total)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Hoja>
      <Confirmar datos={confirmar} onCerrar={() => setConfirmar(null)} />
    </>
  );
}
