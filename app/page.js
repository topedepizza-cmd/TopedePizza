'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Chips, Vacio, Cargando, BotonInstalar } from '@/components/ui';
import { money, cant, hora, hace, fechaHora, nombreCuenta, iconoCuenta, minutosDesde } from '@/lib/utils';

const ENTREGA = {
  preparando: { t: '👨‍🍳 Preparando', c: 'b-ambar' },
  en_camino: { t: '🛵 En camino', c: 'b-azul' },
  entregada: { t: '✅ Entregada', c: 'b-verde' },
};
// para los que retiran en el local
const ENTREGA_RETIRO = {
  preparando: { t: '👨‍🍳 Preparando', c: 'b-ambar' },
  en_camino: { t: '🔔 Listo p/ retirar', c: 'b-azul' },
  entregada: { t: '✅ Retiró', c: 'b-verde' },
};
const estadoEntrega = (c) => (c.tipo_entrega === 'retiro' ? ENTREGA_RETIRO : ENTREGA)[c.estado_entrega] || ENTREGA.preparando;

export default function Comandas() {
  const { avisar, perfil, alertas } = useApp();
  const router = useRouter();
  const [filtro, setFiltro] = useState('hoy');
  const [jornada, setJornada] = useState(null);
  const [comandas, setComandas] = useState(null);
  const [abiertas, setAbiertas] = useState([]);
  const [pendAnteriores, setPendAnteriores] = useState([]); // pagadas o no, de días anteriores, todavía sin entregar
  const [anterior, setAnterior] = useState({ jornada: null, comandas: [] });
  const [buscar, setBuscar] = useState('');
  const [eventos, setEventos] = useState([]);

  const cargar = useCallback(async () => {
    try {
      const j = await rpc('jornada_actual');
      setJornada(j);
      const sel = '*, comanda_items(descripcion, cantidad), cadetes(nombre)';
      // acá solo delivery / retiro: los pedidos de eventos van en su propia pantalla
      let [{ data: hoy, error: e1 }, { data: ab }, { data: ev }, { data: pend }, { data: jAnt }] = await Promise.all([
        supabase.from('comandas').select(sel).eq('jornada_id', j.id).is('evento_id', null).order('id', { ascending: false }),
        supabase.from('comandas').select(sel).eq('estado', 'abierta').is('evento_id', null).order('id', { ascending: false }),
        supabase.from('eventos').select('id, nombre').eq('abierto', true).order('id', { ascending: false }),
        supabase.from('comandas').select(sel).neq('jornada_id', j.id).neq('estado', 'anulada').neq('estado_entrega', 'entregada')
          .is('evento_id', null).order('id', { ascending: false }).limit(100),
        supabase.from('jornadas').select('id, fecha').lt('id', j.id).order('id', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (e1) { // por si todavía no se corrió el SQL de eventos: funciona como antes
        [{ data: hoy }, { data: ab }, { data: pend }] = await Promise.all([
          supabase.from('comandas').select(sel).eq('jornada_id', j.id).order('id', { ascending: false }),
          supabase.from('comandas').select(sel).eq('estado', 'abierta').order('id', { ascending: false }),
          supabase.from('comandas').select(sel).neq('jornada_id', j.id).neq('estado', 'anulada').neq('estado_entrega', 'entregada')
            .order('id', { ascending: false }).limit(100),
        ]);
      }
      let compAnt = [];
      if (jAnt?.id) {
        let { data: ca, error: e2 } = await supabase.from('comandas').select(sel).eq('jornada_id', jAnt.id).is('evento_id', null).order('id', { ascending: false });
        if (e2) ({ data: ca } = await supabase.from('comandas').select(sel).eq('jornada_id', jAnt.id).order('id', { ascending: false }));
        compAnt = ca || [];
      }
      setComandas(hoy || []);
      setAbiertas(ab || []);
      setEventos(ev || []);
      setPendAnteriores(pend || []);
      setAnterior({ jornada: jAnt || null, comandas: compAnt });
    } catch (e) {
      avisar(e.message, 'error');
      setComandas([]);
    }
  }, [avisar]);

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel('comandas-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas' }, () => cargar())
      .subscribe();
    const t = setInterval(cargar, 60000);
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => { supabase.removeChannel(canal); clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  const validas = (comandas || []).filter((c) => c.estado !== 'anulada');
  const vendido = validas.reduce((s, c) => s + Number(c.total), 0);
  const sinCobrar = abiertas.reduce((s, c) => s + Number(c.total), 0);
  const vueltos = abiertas.reduce((s, c) => s + Number(c.vuelto_registrado || 0), 0);
  const pendHoy = validas.filter((c) => c.estado_entrega !== 'entregada');
  const porEntregar = [...pendAnteriores, ...pendHoy].sort((a, b) => a.id - b.id); // el más viejo primero
  const fechaAnt = anterior.jornada ? new Date(anterior.jornada.fecha + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }) : '';

  const filtrar = (l) => {
    if (!buscar.trim()) return l;
    const b = buscar.toLowerCase();
    return l.filter((c) => `${c.numero} ${c.cliente_nombre || ''} ${c.cliente_direccion || ''} ${c.cliente_telefono || ''}`.toLowerCase().includes(b));
  };

  let lista;
  if (filtro === 'abiertas') lista = abiertas;
  else if (filtro === 'pendientes') lista = porEntregar;
  else if (filtro === 'anterior') lista = anterior.comandas;
  else if (filtro === 'anuladas') lista = (comandas || []).filter((c) => c.estado === 'anulada');
  else lista = validas;
  lista = filtrar(lista);
  const arrastradas = filtro === 'hoy' ? filtrar(pendAnteriores) : [];

  const esDeHoy = (c) => jornada && c.jornada_id === jornada.id;

  const tarjeta = (c) => {
    const e = estadoEntrega(c);
    const demora = esDeHoy(c) && c.estado === 'abierta' && c.estado_entrega === 'preparando' ? minutosDesde(c.created_at) : 0;
    const viejo = !esDeHoy(c);
    return (
      <Link key={c.id} href={`/comanda/${c.id}`} className={`comanda-card ${c.estado}`}>
        <div className="cc-top">
          <span className="cc-num">#{c.numero} <span className="suave chico-t" style={{ fontWeight: 400 }}>{viejo ? fechaHora(c.created_at) : `${hora(c.created_at)} · ${hace(c.created_at)}`}</span></span>
          <span className="cc-total">{money(c.total)}</span>
        </div>
        <div className="cc-cli">{c.cliente_nombre || 'Sin nombre'}{c.tipo_entrega === 'retiro' ? ' · retira' : ''}</div>
        <div className="cc-det">{(c.comanda_items || []).map((i) => `${cant(i.cantidad)} ${i.descripcion}`).join(' · ')}</div>
        {c.notas && viejo && <div className="cc-det">📝 {c.notas}</div>}
        <div className="cc-pie">
          {viejo && c.estado !== 'anulada' && c.estado_entrega !== 'entregada' && <span className="badge b-rojo">📅 Pedido de otro día</span>}
          {c.estado === 'abierta' && <span className="badge b-ambar">⏳ Sin cobrar</span>}
          {c.estado === 'cobrada' && <span className="badge b-verde">✔ Cobrada</span>}
          {c.estado === 'anulada' && <span className="badge b-gris">Anulada</span>}
          {c.estado !== 'anulada' && <span className={`badge ${e.c}`}>{e.t}</span>}
          <span className="badge b-gris">{iconoCuenta(c.forma_pago)} {nombreCuenta(c.forma_pago)}</span>
          {Number(c.vuelto_registrado) > 0 && c.estado === 'abierta' && <span className="badge b-rojo">Vuelto {money(c.vuelto_registrado)}</span>}
          {demora >= 40 && <span className="badge b-rojo">⚠ {demora} min</span>}
        </div>
      </Link>
    );
  };

  const textoVacio = {
    abiertas: 'No hay comandas sin cobrar',
    pendientes: 'No hay pedidos pendientes de entrega',
    anterior: 'No hubo comandas el día anterior',
    anuladas: 'No hay comandas anuladas',
    hoy: 'Todavía no hay comandas hoy. Tocá “+ Nueva comanda”.',
  }[filtro];

  return (
    <>
      <div className="hero">
        <img className="hero-logo" src="/logo-chico.png" alt="" />
        <div className="hero-txt">
          <img className="hero-marca" src="/marca.png" alt="Tope de Pizza" />
          <div className="hero-sub">
            {perfil?.nombre ? `Hola ${perfil.nombre} · ` : ''}
            {jornada ? new Date(jornada.fecha + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }) : ''}
          </div>
        </div>
        <BotonInstalar />
      </div>

      {eventos.map((ev) => (
        <Link key={ev.id} href={`/evento/${ev.id}`} className="banner-evento">
          🎪 <span>Evento en curso: {ev.nombre}</span><b>Tomar pedidos ›</b>
        </Link>
      ))}

      <div className="kpis">
        <div className="kpi destacado">
          <div className="k-label">Vendido hoy{eventos.length ? ' (delivery)' : ''}</div>
          <div className="k-valor">{money(vendido)}</div>
          <div className="k-sub">{validas.length} comandas</div>
        </div>
        <div className="kpi amarillo" onClick={() => setFiltro('abiertas')}>
          <div className="k-label">Sin cobrar</div>
          <div className="k-valor">{money(sinCobrar)}</div>
          <div className="k-sub">{abiertas.length} abiertas{vueltos > 0 ? ` · vuelto afuera ${money(vueltos)}` : ''}</div>
        </div>
      </div>

      {pendAnteriores.length > 0 && filtro !== 'pendientes' && (
        <div className="aviso rojo" style={{ cursor: 'pointer' }} onClick={() => setFiltro('pendientes')}>
          📅 Hay {pendAnteriores.length} pedido{pendAnteriores.length > 1 ? 's' : ''} de días anteriores sin entregar — tocá para ver
        </div>
      )}

      {alertas?.length > 0 && (() => {
        const bajos = alertas.filter((a) => a.nivel === 'bajo');
        return (
          <Link href="/stock" className={`alerta-stock${bajos.length ? '' : ' cerca'}`}>
            <b>{bajos.length ? `⚠️ ${bajos.length} sin stock suficiente` : '🟡 Stock acercándose al mínimo'}{bajos.length && alertas.length > bajos.length ? ` · ${alertas.length - bajos.length} cerca` : ''}</b>
            <span>{alertas.slice(0, 4).map((a) => `${a.nombre} (${Number(a.stock)} ${a.unidad})`).join(' · ')}{alertas.length > 4 ? '…' : ''} — tocá para ver</span>
          </Link>
        );
      })()}

      <Chips
        valor={filtro}
        onCambio={setFiltro}
        opciones={[
          { id: 'hoy', label: `Hoy (${validas.length})` },
          { id: 'pendientes', label: `Por entregar (${porEntregar.length})` },
          { id: 'abiertas', label: `Sin cobrar (${abiertas.length})` },
          ...(anterior.jornada ? [{ id: 'anterior', label: `Día anterior${fechaAnt ? ` (${fechaAnt})` : ''}` }] : []),
          { id: 'anuladas', label: 'Anuladas' },
        ]}
      />
      <div style={{ margin: '10px 0' }}>
        <input placeholder="🔎 Buscar por número, cliente, dirección…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>

      {comandas === null ? <Cargando /> : (
        <>
          {arrastradas.length > 0 && (
            <>
              <div className="seccion-titulo">📅 Pendientes de días anteriores</div>
              {arrastradas.map(tarjeta)}
              <div className="seccion-titulo">🍕 Comandas de hoy</div>
            </>
          )}
          {lista.length === 0
            ? (arrastradas.length === 0 && <Vacio emoji={filtro === 'abiertas' || filtro === 'pendientes' ? '🙌' : '🍕'} texto={textoVacio} />)
            : lista.map(tarjeta)}
          {lista.length === 0 && arrastradas.length > 0 && <div className="suave chico-t" style={{ textAlign: 'center', margin: 10 }}>Todavía no hay comandas nuevas hoy.</div>}
        </>
      )}

      <button className="fab" onClick={() => router.push('/comanda/nueva')}><span style={{ fontSize: 20 }}>＋</span> Nueva comanda</button>
    </>
  );
}
