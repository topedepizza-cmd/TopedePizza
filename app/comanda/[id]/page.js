'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import EditorComanda from '@/components/EditorComanda';
import VistaComanda from '@/components/VistaComanda';
import { Cargando, Vacio } from '@/components/ui';

async function traerComanda(id) {
  const { data: c } = await supabase.from('comandas').select('*').eq('id', id).maybeSingle();
  if (!c) return null;
  const [{ data: items }, { data: cadete }] = await Promise.all([
    supabase.from('comanda_items').select('*').eq('comanda_id', id).order('id'),
    c.cadete_id ? supabase.from('cadetes').select('*').eq('id', c.cadete_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { c, items: items || [], cadete };
}

function PaginaComanda() {
  const { id } = useParams();
  const sp = useSearchParams();
  const editar = sp.get('editar') === '1';
  const nueva = sp.get('nueva') === '1';
  const copiar = sp.get('copiar');
  const [datos, setDatos] = useState(null);

  const cargar = useCallback(async () => {
    const buscar = id === 'nueva' ? copiar : id;
    if (!buscar) return;
    const d = await traerComanda(buscar);
    setDatos(d || { error: true });
  }, [id, copiar]);

  useEffect(() => { setDatos(null); cargar(); }, [cargar, editar]);

  if (id === 'nueva') {
    // copia de otra comanda (por ejemplo una anulada) para hacerla de nuevo cambiando algo
    if (copiar) {
      if (!datos) return <Cargando />;
      if (datos.error) return <Vacio texto="No se encontró la comanda a copiar" />;
      return <EditorComanda key={'copia' + copiar} copiaDe={datos.c} itemsIniciales={datos.items} />;
    }
    return <EditorComanda key={'nueva' + (sp.get('cliente') || '')} clienteId={sp.get('cliente')} />;
  }
  if (!datos) return <Cargando />;
  if (datos.error) return <Vacio texto="Comanda no encontrada (puede que la hayan eliminado)" />;
  // los pedidos de eventos se corrigen desde el evento (anular y cargar de nuevo)
  if (editar && datos.c.estado === 'abierta' && !datos.c.evento_id) return <EditorComanda key={`e${datos.c.id}`} comanda={datos.c} itemsIniciales={datos.items} />;
  return <VistaComanda comanda={datos.c} items={datos.items} cadete={datos.cadete} recargar={cargar} recienCreada={nueva} />;
}

export default function Pagina() {
  return (
    <Suspense fallback={<Cargando />}>
      <PaginaComanda />
    </Suspense>
  );
}
