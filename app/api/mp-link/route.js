import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { limpiarUrl } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Crea (o reutiliza) un link de pago de Mercado Pago por el total de la comanda
export async function POST(req) {
  try {
    const mpToken = String(process.env.MP_ACCESS_TOKEN || '').trim();
    if (!mpToken) throw new Error('Falta cargar MP_ACCESS_TOKEN en Vercel');
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!key) throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel');
    const sb = createClient(limpiarUrl(process.env.NEXT_PUBLIC_SUPABASE_URL), key, { auth: { persistSession: false } });

    const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
    const { data: u, error: eu } = await sb.auth.getUser(token);
    if (eu || !u?.user) throw new Error('Sesión inválida');

    const { comanda_id } = await req.json();
    const { data: c } = await sb.from('comandas').select('id, numero, total, mp_link, mp_link_total, cliente_nombre').eq('id', comanda_id).maybeSingle();
    if (!c) throw new Error('Comanda inexistente');
    if (Number(c.total) <= 0) throw new Error('La comanda no tiene total');
    if (c.mp_link && Number(c.mp_link_total) === Number(c.total)) return NextResponse.json({ link: c.mp_link });

    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mpToken}` },
      body: JSON.stringify({
        items: [{ title: `Pedido #${c.numero} - Tope de Pizza`, quantity: 1, unit_price: Number(c.total), currency_id: 'ARS' }],
        external_reference: `comanda-${c.id}`,
        statement_descriptor: 'TOPE DE PIZZA',
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.init_point) throw new Error(j.message || 'Mercado Pago no devolvió el link');
    await sb.from('comandas').update({ mp_link: j.init_point, mp_link_total: c.total }).eq('id', c.id);
    return NextResponse.json({ link: j.init_point });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
