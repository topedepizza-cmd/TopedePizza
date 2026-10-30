'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import EditorComanda from '@/components/EditorComanda';
import VistaComanda from '@/components/VistaComanda';
import { Cargando, Vacio } from '@/components/ui';

function PaginaComanda() {
  const { id } = useParams();
  const sp = useSearchParams();
  const editar = sp.get('editar') === '1';
  const nueva = sp.get('nueva') === '1';
  const [datos, setDatos] = useState(null);

  const cargar = useCallback(async () => {
    if (id === 'nueva') return;
    const { data: c } = await supabase.from('comandas').select('*').eq('id', id).maybeSingle();
    if (!c) { setDatos({ error: true }); return; }
    const [{ data: items }, { data: cadete }] = await Promise.all([
      supabase.from('comanda_items').select('*').eq('comanda_id', id).order('id'),
      c.cadete_id ? supabase.from('cadetes').select('*').eq('id', c.cadete_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setDatos({ c, items: items || [], cadete });
  }, [id]);

  useEffect(() => { setDatos(null); cargar(); }, [cargar, editar]);

  if (id === 'nueva') return <EditorComanda key={'nueva' + (sp.get('cliente') || '')} clienteId={sp.get('cliente')} />;
  if (!datos) return <Cargando />;
  if (datos.error) return <Vacio texto="Comanda no encontrada" />;
  if (editar && datos.c.estado === 'abierta') return <EditorComanda key={`e${datos.c.id}`} comanda={datos.c} itemsIniciales={datos.items} />;
  return <VistaComanda comanda={datos.c} items={datos.items} cadete={datos.cadete} recargar={cargar} recienCreada={nueva} />;
}

export default function Pagina() {
  return (
    <Suspense fallback={<Cargando />}>
      <PaginaComanda />
    </Suspense>
  );
}
