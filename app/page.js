'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, rpc } from '@/lib/supabase';
import { useApp } from '@/components/AppShell';
import { Chips, Vacio, Cargando, BotonInstalar } from '@/components/ui';
import { money, cant, hora, hace, nombreCuenta, iconoCuenta, minutosDesde } from '@/lib/utils';

const ENTREGA = {
  preparando: { t: '👨‍🍳 Preparando', c: 'b-ambar' },
  en_camino: { t: '🛵 En camino', c: 'b-azul' },
  entregada: { t: '✅ Entregada', c: 'b-verde' },
};

export default function Comandas() {
  const { avisar, perfil, alertas } = useApp();
  const router = useRouter();
  const [filtro, setFiltro] = useState('hoy');
  const [jornada, setJornada] = useState(null);
  const [comandas, setComandas] = useState(null);
  const [abiertas, setAbiertas] = useState([]);
  const [buscar, setBuscar] = useState('');

  const cargar = useCallback(async () => {
    try {
      const j = await rpc('jornada_actual');
      setJornada(j);
      const sel = '*, comanda_items(descripcion, cantidad), cadetes(nombre)';
      const [{ data: hoy }, { data: ab }] = await Promise.all([
        supabase.from('comandas').select(sel).eq('jornada_id', j.id).order('id', { ascending: false }),
        supabase.from('comandas').select(sel).eq('estado', 'abierta').order('id', { ascending: false }),
      ]);
      setComandas(hoy || []);
      setAbiertas(ab || []);
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

  let lista = filtro === 'abiertas' ? abiertas : filtro === 'anuladas' ? (comandas || []).filter((c) => c.estado === 'anulada') : validas;
  if (buscar.trim()) {
    const b = buscar.toLowerCase();
    lista = lista.filter((c) => `${c.numero} ${c.cliente_nombre || ''} ${c.cliente_direccion || ''} ${c.cliente_telefono || ''}`.toLowerCase().includes(b));
  }

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

      <div className="kpis">
        <div className="kpi destacado">
          <div className="k-label">Vendido hoy</div>
          <div className="k-valor">{money(vendido)}</div>
          <div className="k-sub">{validas.length} comandas</div>
        </div>
        <div className="kpi amarillo" onClick={() => setFiltro('abiertas')}>
          <div className="k-label">Sin cobrar</div>
          <div className="k-valor">{money(sinCobrar)}</div>
          <div className="k-sub">{abiertas.length} abiertas{vueltos > 0 ? ` · vuelto afuera ${money(vueltos)}` : ''}</div>
        </div>
      </div>

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
          { id: 'abiertas', label: `Sin cobrar (${abiertas.length})` },
          { id: 'anuladas', label: 'Anuladas' },
        ]}
      />
      <div style={{ margin: '10px 0' }}>
        <input placeholder="🔎 Buscar por número, cliente, dirección…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>

      {comandas === null ? <Cargando /> : lista.length === 0 ? (
        <Vacio emoji={filtro === 'abiertas' ? '🙌' : '🍕'} texto={filtro === 'abiertas' ? 'No hay comandas sin cobrar' : filtro === 'anuladas' ? 'No hay comandas anuladas' : 'Todavía no hay comandas hoy. Tocá “+ Nueva comanda”.'} />
      ) : (
        lista.map((c) => {
          const e = ENTREGA[c.estado_entrega] || ENTREGA.preparando;
          const demora = c.estado === 'abierta' && c.estado_entrega === 'preparando' ? minutosDesde(c.created_at) : 0;
          return (
            <Link key={c.id} href={`/comanda/${c.id}`} className={`comanda-card ${c.estado}`}>
              <div className="cc-top">
                <span className="cc-num">#{c.numero} <span className="suave chico-t" style={{ fontWeight: 400 }}>{hora(c.created_at)} · {hace(c.created_at)}</span></span>
                <span className="cc-total">{money(c.total)}</span>
              </div>
              <div className="cc-cli">{c.cliente_nombre || 'Sin nombre'}{c.tipo_entrega === 'retiro' ? ' · retira' : ''}</div>
              <div className="cc-det">{(c.comanda_items || []).map((i) => `${cant(i.cantidad)} ${i.descripcion}`).join(' · ')}</div>
              <div className="cc-pie">
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
        })
      )}

      <button className="fab" onClick={() => router.push('/comanda/nueva')}><span style={{ fontSize: 20 }}>＋</span> Nueva comanda</button>
    </>
  );
}
