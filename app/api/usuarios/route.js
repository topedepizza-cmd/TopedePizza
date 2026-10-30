import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { limpiarUrl } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function admin() {
  const url = limpiarUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^['"`]+|['"`]+$/g, '');
  if (!key) throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verificarAdmin(req, sb) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) throw new Error('No autorizado');
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error('Sesión inválida');
  const { data: perfil } = await sb.from('perfiles').select('rol').eq('id', data.user.id).maybeSingle();
  if (perfil?.rol !== 'admin') throw new Error('Solo un administrador puede gestionar usuarios');
  return data.user;
}

export async function POST(req) {
  try {
    const sb = admin();
    await verificarAdmin(req, sb);
    const { email, password, nombre, rol } = await req.json();
    if (!email || !password || password.length < 6) throw new Error('Email y contraseña (mínimo 6 caracteres) obligatorios');
    const { data, error } = await sb.auth.admin.createUser({
      email: email.trim(), password, email_confirm: true, user_metadata: { nombre: nombre || email.split('@')[0], rol: rol || 'admin' },
    });
    if (error) throw new Error(error.message);
    await sb.from('perfiles').upsert({ id: data.user.id, email: data.user.email, nombre: nombre || email.split('@')[0], rol: rol || 'admin' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req) {
  try {
    const sb = admin();
    const yo = await verificarAdmin(req, sb);
    const { id } = await req.json();
    if (!id || id === yo.id) throw new Error('No podés borrarte a vos mismo');
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
