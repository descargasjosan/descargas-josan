import { createClient } from '@supabase/supabase-js';

// 1. Intentamos leer las variables de entorno (esto funcionará en Vercel y en tu PC)
const envUrl = import.meta.env?.VITE_SUPABASE_URL;
const envKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

// 2. Valores por defecto SOLO para que el Preview de AI Studio no se rompa
const FALLBACK_URL = 'https://zblasxlrrjeycwjefitp.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpibGFzeGxycmpleWN3amVmaXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1NjIwMzQsImV4cCI6MjA4MjEzODAzNH0.g0i_tan90kUcAzdEvAsFd5jGciCvd1gdWjZrxdTxIY8';

// 3. Elegimos qué usar: si hay variables de entorno las priorizamos
const finalUrl = envUrl || FALLBACK_URL;
const finalKey = envKey || FALLBACK_KEY;

export const supabase = createClient(finalUrl, finalKey);