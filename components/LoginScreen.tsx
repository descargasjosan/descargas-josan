import React, { useState } from 'react';
// Importamos el cliente que ya tiene la seguridad configurada
import { supabase } from '../supabaseClient'; 
import { Lock, Mail, Loader2, AlertCircle, ArrowRight, UserPlus, LogIn } from 'lucide-react';

// BORRAMOS las líneas de supabaseUrl, supabaseKey y el createClient que estaban aquí

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false); // Restaurado: Estado para alternar modo

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRegistering) {
        // MODO REGISTRO
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.user && !data.session) {
          setError('Registro exitoso. IMPORTANTE: Revisa tu correo para confirmar la cuenta antes de entrar.');
        }
      } else {
        // MODO LOGIN
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      // La sesión se actualiza automáticamente en App.tsx
    } catch (err: any) {
      setError(err.message || 'Error en la autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-['Inter']">
      <div className="bg-white w-full max-w-md p-10 rounded-[40px] shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Cabecera */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-[900] text-slate-900 italic uppercase tracking-tighter mb-2">
            AGENDA DESCARGAS JOSAN
          </h1>
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">
            {isRegistering ? 'Crear Nueva Cuenta' : 'Gestión Logística Avanzada'}
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleAuth} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
              Correo Electrónico
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                required
                placeholder="usuario@ejemplo.com"
                className="w-full bg-slate-50 text-slate-900 text-sm font-bold pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all placeholder:text-slate-300"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
              Contraseña
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full bg-slate-50 text-slate-900 text-sm font-bold pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all placeholder:text-slate-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 animate-in slide-in-from-top-2 border ${error.includes('exitoso') ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error === 'Invalid login credentials' ? 'Usuario o contraseña incorrectos' : error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-5 rounded-[28px] font-black text-xs uppercase tracking-[0.15em] hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 mt-4 ${isRegistering ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Procesando...
              </>
            ) : (
              <>
                {isRegistering ? 'Crear Cuenta' : 'Acceder al Sistema'} 
                {isRegistering ? <UserPlus className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
            className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors flex items-center justify-center gap-2 mx-auto"
          >
            {isRegistering ? (
              <>
                <LogIn className="w-3 h-3" /> Volver a Iniciar Sesión
              </>
            ) : (
              <>
                <UserPlus className="w-3 h-3" /> ¿No tienes cuenta? Regístrate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;