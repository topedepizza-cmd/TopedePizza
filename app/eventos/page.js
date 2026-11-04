'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Cabecera, Hoja, Campo, Cargando, Vacio } from '@/components/ui';
import SelectorProductos, { paraGuardar, valorDesdeEvento } from '@/components/SelectorProductos';
import { money, fechaHora, hora } from '@/lib/utils';
import { duracion } from '@/lib/eventos';

export default function Eventos() {
  const { avisar } = useApp();
  const router = useRouter();
  const [eventos, setEventos] = useState(null);
  const [totales, setTotales] = useState({});
  const [hoja, setHoja] = useState(false);
  const [articulos, setArticulos] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [form, setForm] = useState({ nombre: '', lugar: '' });
  const [prods, setProds] = useState({ productos: {}, stocks: {} });
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [{ data: ev, error }, { data: cs }] = await Promise.all([
        supabase.from('eventos').select('*').order('id', { ascending: false }).limit(60),
        supabase.from('comandas').select('evento_id, total, estado').not('evento_id', 'is', null).neq('estado', 'anulada').limit(20000),
      ]);
      if (error) throw new Error(error.message.includes('eventos') ? 'Falta correr el SQL de eventos en Supabase (supabase/04_EVENTOS.sql)' : error.message);
      const t = {};
      (cs || []).forEach((c) => { (t[c.evento_id] ||= { total: 0, n: 0 }); t[c.evento_id].total += Number(c.total); t[c.evento_id].n++; });
      setEventos(ev || []);
      setTotales(t);
    } catch (e) { avisar(e.message, 'error'); setEventos([]); }
  }, [avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  async function abrirHoja() {
    setForm({ nombre: '', lugar: '' });
    setProds({ productos: {}, stocks: {} });
    setHoja(true);
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from('articulos').select('id, nombre, precio, rubro_id, orden').eq('activo', true).order('orden').order('nombre'),
      supabase.from('rubros').select('*').eq('activo', true).order('orden'),
    ]);
    setArticulos(a || []);
    setRubros(r || []);
  }

  // copia los productos, precios y stock del último evento
  async function repetirUltimo() {
    const ult = (eventos || [])[0];
    if (!ult) return;
    const [{ data: ps }, { data: ss }] = await Promise.all([
      supabase.from('evento_productos').select('*').eq('evento_id', ult.id),
      supabase.from('evento_stocks').select('*').eq('evento_id', ult.id),
    ]);
    const v = valorDesdeEvento(ps || [], ss || [], articulos);
    Object.values(v.productos).forEach((x) => { x.agotado = false; });
    setProds(v);
    avisar(`Copiados ${Object.keys(v.productos).length} productos de “${ult.nombre}”`);
  }

  async function iniciar() {
    setTrabajando(true);
    try {
      const g = paraGuardar(prods, articulos, rubros);
      const id = await rpc('abrir_evento', { p_nombre: form.nombre, p_lugar: form.lugar, p_productos: g.productos, p_stocks: g.stocks });
      avisar('Evento iniciado 🎪 ¡A vender!');
      router.push(`/evento/${id}`);
    } catch (e) { avisar(e.message, 'error'); }
    setTrabajando(false);
  }

  const abiertos = (eventos || []).filter((e) => e.abierto);
  const cerrados = (eventos || []).filter((e) => !e.abierto);

  return (
    <>
      <Cabecera titulo="Eventos" sub="Pedidos rápidos en ferias, fiestas y eventos" derecha={<button className="btn borde chico" onClick={() => router.push('/mas')}>← Más</button>} />

      {eventos === null ? <Cargando /> : (
        <>
          {abiertos.map((e) => (
            <Link key={e.id} href={`/evento/${e.id}`} className="evento-vivo">
              <div className="ev-pulso" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ev-tag">EN CURSO · desde {hora(e.abierto_at)}</div>
                <div className="ev-nom">{e.nombre}</div>
                <div className="ev-sub">{e.lugar ? e.lugar + ' · ' : ''}{totales[e.id]?.n || 0} pedidos · {money(totales[e.id]?.total || 0)}</div>
              </div>
              <span className="ev-ir">Tomar pedidos ›</span>
            </Link>
          ))}

          <button className="btn primario grande bloque" style={{ marginBottom: 6 }} onClick={abrirHoja}>🎪 Iniciar evento</button>
          <p className="suave chico-t centro" style={{ marginTop: 4 }}>
            Las ventas del evento entran a la caja de hoy y a los informes, pero no se mezclan con las comandas de delivery.
          </p>

          <div className="seccion-titulo">Eventos anteriores</div>
          {cerrados.length === 0 ? <Vacio emoji="🎪" texto="Todavía no hicieron eventos" /> : (
            <div className="lista">
              {cerrados.map((e) => (
                <Link key={e.id} href={`/evento/${e.id}`} className="item clic">
                  <div className="item-cuerpo">
                    <div className="item-titulo">{e.nombre}</div>
                    <div className="item-sub">{fechaHora(e.abierto_at)}{e.cerrado_at ? ` · ${duracion(Math.round((new Date(e.cerrado_at) - new Date(e.abierto_at)) / 60000))}` : ''}{e.lugar ? ` · ${e.lugar}` : ''}</div>
                  </div>
                  <div className="item-der mono">{money(totales[e.id]?.total || 0)}<div className="suave chico-t" style={{ fontWeight: 600 }}>{totales[e.id]?.n || 0} pedidos</div></div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <Hoja abierta={hoja} titulo="Iniciar evento" onCerrar={() => setHoja(false)}
        pie={<button className="btn primario bloque grande" disabled={trabajando || !form.nombre.trim() || !Object.keys(prods.productos).length} onClick={iniciar}>
          🎪 Iniciar con {Object.keys(prods.productos).length} productos
        </button>}>
        <Campo label="Nombre del evento"><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Feria de la plaza" autoFocus /></Campo>
        <Campo label="Lugar (opcional)"><input value={form.lugar} onChange={(e) => setForm({ ...form, lugar: e.target.value })} placeholder="Ej: Plaza Vieja, Yerba Buena" /></Campo>
        {(eventos || []).length > 0 && (
          <button className="btn borde bloque chico" style={{ marginBottom: 12 }} onClick={repetirUltimo}>↺ Repetir productos y precios del último evento</button>
        )}
        {!articulos.length ? <Cargando /> : <SelectorProductos articulos={articulos} rubros={rubros} valor={prods} onCambio={setProds} />}
      </Hoja>
    </>
  );
}
