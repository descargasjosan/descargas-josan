import { createClient } from '@supabase/supabase-js';

// Usamos las variables de entorno sin dejar NUNCA las claves escritas aquí
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("⚠️ Error de configuración: No se encuentran las llaves de Supabase.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);