import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { limpiarUrl } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const DOMINIO = 'topedepizza.app'; // mail interno: el usuario nunca lo ve

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

function limpiarUsuario(u) {
  const x = String(u || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  if (!/^[a-z0-9._-]{2,30}$/.test(x)) throw new Error('El usuario tiene que tener 2 a 30 letras o números, sin espacios');
  return x;
}

// Crear usuario: nombre + usuario + contraseña (sin mail)
export async function POST(req) {
  try {
    const sb = admin();
    await verificarAdmin(req, sb);
    const { nombre, usuario, password, rol } = await req.json();
    const u = limpiarUsuario(usuario);
    if (!password || password.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres');
    const { data: ya } = await sb.from('perfiles').select('id').ilike('usuario', u).maybeSingle();
    if (ya) throw new Error(`Ya existe el usuario "${u}"`);
    const email = `${u}@${DOMINIO}`;
    const { data, error } = await sb.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { nombre: nombre || u, usuario: u, rol: rol || 'admin' },
    });
    if (error) throw new Error(error.message);
    await sb.from('perfiles').upsert({ id: data.user.id, email, nombre: nombre || u, usuario: u, rol: rol || 'admin' });
    return NextResponse.json({ ok: true, usuario: u });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// Cambiar contraseña de otro usuario (lo hace un admin)
export async function PATCH(req) {
  try {
    const sb = admin();
    await verificarAdmin(req, sb);
    const { id, password } = await req.json();
    if (!id) throw new Error('Falta el usuario');
    if (!password || password.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres');
    const { error } = await sb.auth.admin.updateUserById(id, { password });
    if (error) throw new Error(error.message);
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
