import { createClient } from '@supabase/supabase-js';

// Limpia la URL por si se pegó con espacios, comillas, barra final o sin https://
export function limpiarUrl(v) {
  let u = String(v || '').trim().replace(/^['"`]+|['"`]+$/g, '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    new URL(u);
    return u;
  } catch {
    return 'https://falta-configurar.supabase.co';
  }
}

const url = limpiarUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'falta-configurar').trim().replace(/^['"`]+|['"`]+$/g, '');

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pizzeria-auth' },
});

// Llama una función de la base y devuelve los datos o tira error legible
export async function rpc(nombre, params) {
  const { data, error } = await supabase.rpc(nombre, params || {});
  if (error) throw new Error(error.message);
  return data;
}

// Trae todas las filas de una consulta paginando de a 1000
export async function traerTodo(armarConsulta) {
  const filas = [];
  let desde = 0;
  while (true) {
    const { data, error } = await armarConsulta().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
    desde += 1000;
  }
  return filas;
}
