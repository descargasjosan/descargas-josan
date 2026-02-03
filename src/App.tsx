import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Users, Building2, Database, Car, BarChart3, Settings, LogOut, Plus, Edit2, Trash2, Save, 
  Upload, Download, Search, X, Calendar, Clock, MapPin, UserCheck, AlertTriangle, 
  ChevronDown, CheckCircle2, Info, Loader2, Cloud, RotateCcw, CloudOff, ListTodo, 
  Filter, ArrowUpDown, CheckCircle, XCircle, Sparkles, ChevronLeft, ChevronRight, LayoutGrid,
  Calendar as CalendarIcon, Table, DownloadCloud, CalendarDays, MessageCircle, Copy, TrendingUp,
  ClipboardList, Hash, FileText, Phone, GraduationCap, Fuel, Send, FileSpreadsheet, ArrowRight, StickyNote
} from 'lucide-react';
import * as XLSX from 'xlsx';
import WorkerSidebar from './components/WorkerSidebar';
import PlanningBoard from './components/PlanningBoard';
import StatisticsPanel from './components/StatisticsPanel';
import CompactPlanningView from './components/CompactPlanningView';
import FleetManager from './components/FleetManager'; 
import LoginScreen from './components/LoginScreen';
import { MOCK_WORKERS, MOCK_CLIENTS, MOCK_JOBS, AVAILABLE_COURSES, MOCK_STANDARD_TASKS, WORKER_ROLES, MOCK_VEHICLES } from './lib/constants'; 
import { getWorkerDisplayName, getWorkerSSFormat, addOrUpdateStatusRecord, removeStatusRecord, calculateDaysBetween, getCurrentWorkerStatus, getNextStatusChange, validateAssignment, getPreviousWeekday, isHoliday, formatDateDMY } from './lib/utils';
import { PlanningState, Worker, Job, JobType, WorkerStatus, Client, ViewType, ContractType, Holiday, WorkCenter, StandardTask, DailyNote, RegularTask, FuelRecord, Vehicle, VehicleAssignment, NoteType, ReinforcementGroup, Course } from './lib/types';
import { supabase } from '../supabaseClient';

// 🔍 SISTEMA DE DETECCIÓN Y LOGGING PARA EDGE
const isEdgeBrowser = () => navigator.userAgent.includes('Edg');

const edgeSpecificLog = (action: string, data?: any) => {
  // 🔄 AHORA FUNCIONA EN TODOS LOS NAVEGADORES para diagnóstico
  console.log(`🔍 LOG - ${action}:`, {
    timestamp: new Date().toISOString(),
    action,
    dataSize: data ? JSON.stringify(data).length : 0,
    memoryUsage: (performance as any).memory?.usedJSHeapSize || 'N/A',
    cacheSize: performance.getEntriesByType('resource').length,
    userAgent: navigator.userAgent,
    isEdge: isEdgeBrowser(),
    pageLoadTime: performance.timing.navigationStart
  });
};

const detectStaleData = async () => {
  // 🔄 AHORA FUNCIONA EN TODOS LOS NAVEGADORES
  const localTimestamp = localStorage.getItem('last_sync');
  const pageLoadTime = performance.timing.navigationStart;
  const currentTime = Date.now();
  const minutesOpen = (currentTime - pageLoadTime) / (1000 * 60);
  
  edgeSpecificLog('DETECTION CHECK', {
    localTimestamp,
    minutesOpen,
    pageLoadTime: new Date(pageLoadTime).toISOString(),
    isEdge: isEdgeBrowser()
  });

  // Forzar recarga si la página tiene más de 10 minutos abierta
  if (minutesOpen > 10) {
    console.warn('⚠️ Página abierta por mucho tiempo, datos pueden estar desincronizados');
    edgeSpecificLog('LONG SESSION DETECTED', { minutesOpen });

    // Mostrar advertencia al usuario
    setTimeout(() => {
      if (window.confirm('⚠️ La página ha estado abierta mucho tiempo. Para evitar pérdida de datos, ¿deseas recargar y sincronizar los datos más recientes?')) {
        localStorage.setItem('forced_reload_reason', 'long_session');
        window.location.reload();
      }
    }, 1000);
  }

  // Verificar si los datos locales son más antiguos que los del servidor
  if (localTimestamp) {
    try {
      const { data: serverData } = await supabase
        .from('planning_snapshots')
        .select('updated_at')
        .eq('id', 1)
        .single();

      if (serverData?.updated_at && serverData.updated_at > localTimestamp) {
        console.warn('⚠️ DATOS LOCALES ANTIGUOS DETECTADOS');
        edgeSpecificLog('STALE DATA DETECTED', {
          localTimestamp,
          serverTimestamp: serverData.updated_at
        });

        if (window.confirm('⚠️ Se han detectado datos más recientes en el servidor. ¿Deseas recargar para sincronizar?')) {
          localStorage.setItem('forced_reload_reason', 'stale_data');
          window.location.reload();
        }
      }
    } catch (error) {
      edgeSpecificLog('STALE CHECK ERROR', { error: error.message });
    }
  }
};

const logDataOperation = async (action: string, data: any, result?: any, userEmail?: string) => {
  // 🔄 AHORA REGISTRA EN TODOS LOS NAVEGADORES
  const logData = {
    action,
    dataSize: JSON.stringify(data).length,
    result: result ? 'success' : 'error',
    timestamp: new Date().toISOString(),
    workers: data.workers?.length || 0,
    jobs: data.jobs?.length || 0,
    clients: data.clients?.length || 0,
    userAgent: navigator.userAgent,
    userEmail: userEmail || 'unknown',
    isEdge: isEdgeBrowser()
  };

  edgeSpecificLog(`DATA ${action}`, logData);

  // 🗂️ Guardar en localStorage (backup local)
  saveLogToLocalStorage(logData);

  // ☁️ Guardar en Supabase (centralizado)
  saveLogToSupabase(logData);

  // Guardar timestamp de última sincronización
  if (action === 'SAVE' && result) {
    localStorage.setItem('last_sync', new Date().toISOString());
  }
};

// 🚨 SISTEMA DE GUARDADO DE EMERGENCIA
const saveEmergencyBackup = (data: any, reason: string) => {
  try {
    const emergencyBackup = {
      data: data,
      timestamp: new Date().toISOString(),
      reason: reason,
      userAgent: navigator.userAgent
    };
    
    localStorage.setItem('emergency_backup', JSON.stringify(emergencyBackup));
    console.log('🚨 Backup de emergencia guardado:', reason);
  } catch (error) {
    console.error('❌ Error guardando backup de emergencia:', error);
  }
};

// 🔄 Verificar backup de emergencia al iniciar
const checkEmergencyBackup = () => {
  try {
    const backup = localStorage.getItem('emergency_backup');
    if (backup) {
      const emergencyData = JSON.parse(backup);
      const backupTime = new Date(emergencyData.timestamp);
      const currentTime = new Date();
      const hoursDiff = (currentTime - backupTime) / (1000 * 60 * 60);
      
      if (hoursDiff < 24) {
        console.log('🚨 Backup de emergencia disponible de hace', hoursDiff.toFixed(1), 'horas');
        console.log('🚨 Razón:', emergencyData.reason);
        console.log('🚨 Para recuperar: restoreEmergencyBackup()');
      }
    }
  } catch (error) {
    console.error('❌ Error verificando backup de emergencia:', error);
  }
};

// 🔄 Función para restaurar backup de emergencia
const restoreEmergencyBackup = () => {
  try {
    const backup = localStorage.getItem('emergency_backup');
    if (backup) {
      const emergencyData = JSON.parse(backup);
      
      if (window.confirm(`¿Restaurar backup de emergencia del ${new Date(emergencyData.timestamp).toLocaleString()}?\n\nRazón: ${emergencyData.reason}\n\nEsto sobreescribirá los datos actuales.`)) {
        setPlanning(emergencyData.data);
        showNotification('Backup de emergencia restaurado', 'success');
        console.log('🚨 Backup de emergencia restaurado');
      }
    } else {
      showNotification('No hay backup de emergencia disponible', 'info');
    }
  } catch (error) {
    console.error('❌ Error restaurando backup de emergencia:', error);
    showNotification('Error restaurando backup de emergencia', 'error');
  }
};

// Hacer funciones disponibles globalmente
(window as any).restoreEmergencyBackup = restoreEmergencyBackup;
(window as any).checkEmergencyBackup = checkEmergencyBackup;

// 🔒 FUNCIONES GLOBALES PARA OPTIMISTIC LOCKING
(window as any).checkSyncStatus = () => {
  const localTimestamp = localStorage.getItem('server_timestamp');
  console.log('🔒 Timestamp local:', localTimestamp);
  console.log('🔒 Última sincronización:', localStorage.getItem('last_sync'));
  
  if (!localTimestamp) {
    console.log('⚠️ No hay timestamp local - posible problema de sincronización');
    return;
  }
  
  const localDate = new Date(localTimestamp);
  const now = new Date();
  const minutesDiff = (now.getTime() - localDate.getTime()) / (1000 * 60);
  
  console.log(`🔒 Tiempo desde última sincronización: ${minutesDiff.toFixed(1)} minutos`);
  
  if (minutesDiff > 30) {
    console.warn('⚠️ Hace más de 30 minutos desde la última sincronización - recomendable recargar');
  }
};

(window as any).forceSyncReset = () => {
  if (confirm('¿Estás seguro de que quieres resetear la sincronización? Esto podría causar pérdida de datos si no tienes los cambios más recientes.')) {
    localStorage.removeItem('server_timestamp');
    console.log('🔒 Timestamp de sincronización eliminado - se recargará en el próximo guardado');
    alert('Sincronización reseteada. Recarga la página para obtener datos frescos.');
  }
};

// 🗂️ Función para guardar logs en localStorage
const saveLogToLocalStorage = (logData: any) => {
  try {
    const logs = JSON.parse(localStorage.getItem('edge_logs') || '[]');
    logs.push({
      ...logData,
      id: Date.now() + Math.random(), // ID único
      storedAt: new Date().toISOString()
    });
    
    // Mantener solo últimos 1000 logs para no saturar
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    localStorage.setItem('edge_logs', JSON.stringify(logs));
    console.log('💾 Log guardado en localStorage:', logs.length, 'registros');
  } catch (error) {
    console.error('❌ Error guardando log en localStorage:', error);
  }
};

// ☁️ Función para guardar logs en Supabase
const saveLogToSupabase = async (logData: any) => {
  try {
    const { error } = await supabase.from('edge_logs').insert({
      user_email: logData.userEmail,
      action: logData.action,
      log_data: logData,
      timestamp: logData.timestamp,
      user_agent: logData.userAgent,
      data_size: logData.dataSize,
      workers_count: logData.workers,
      jobs_count: logData.jobs,
      clients_count: logData.clients,
      result: logData.result
    });
    
    if (error) {
      console.warn('⚠️ Error guardando log en Supabase (continuando con localStorage):', error);
    } else {
      console.log('☁️ Log guardado en Supabase correctamente');
    }
  } catch (error) {
    console.warn('⚠️ Error de conexión con Supabase (continuando con localStorage):', error);
  }
};

// 📊 Función para exportar logs (para análisis)
const exportLogs = () => {
  try {
    const logs = JSON.parse(localStorage.getItem('edge_logs') || '[]');
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edge_logs_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('📥 Logs exportados:', logs.length, 'registros');
  } catch (error) {
    console.error('❌ Error exportando logs:', error);
  }
};

// 🧹 Función para limpiar logs antiguos
const cleanOldLogs = () => {
  try {
    const logs = JSON.parse(localStorage.getItem('edge_logs') || '[]');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const filteredLogs = logs.filter(log => 
      new Date(log.timestamp) > thirtyDaysAgo
    );
    
    localStorage.setItem('edge_logs', JSON.stringify(filteredLogs));
    console.log('🧹 Logs limpiados:', logs.length - filteredLogs.length, 'registros eliminados');
  } catch (error) {
    console.error('❌ Error limpiando logs:', error);
  }
};

// Forzar detección al inicio
console.log('🔍 SISTEMA DE DETECCIÓN ACTIVADO - Registrando todas las operaciones');
edgeSpecificLog('SYSTEM START', {
  userAgent: navigator.userAgent,
  isEdge: isEdgeBrowser(),
  timestamp: new Date().toISOString()
});

// 📥 Hacer función exportLogs disponible globalmente
(window as any).exportLogs = () => {
  try {
    const logs = JSON.parse(localStorage.getItem('edge_logs') || '[]');
    if (logs.length === 0) {
      console.log('📊 No hay logs para exportar');
      alert('No hay logs para exportar. Trabaja un poco más en la aplicación.');
      return;
    }
    
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edge_logs_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`📥 Logs exportados: ${logs.length} registros`);
    alert(`Logs exportados: ${logs.length} registros`);
  } catch (error) {
    console.error('❌ Error exportando logs:', error);
    alert('Error exportando logs. Revisa la consola para más detalles.');
  }
};

// 🧹 Hacer función cleanLogs disponible globalmente
(window as any).cleanLogs = () => {
  try {
    const logs = JSON.parse(localStorage.getItem('edge_logs') || '[]');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const filteredLogs = logs.filter(log => 
      new Date(log.timestamp) > thirtyDaysAgo
    );
    
    localStorage.setItem('edge_logs', JSON.stringify(filteredLogs));
    const removedCount = logs.length - filteredLogs.length;
    
    if (removedCount > 0) {
      console.log(`🧹 Logs limpiados: ${removedCount} registros eliminados`);
      alert(`Logs limpiados: ${removedCount} registros eliminados`);
    } else {
      console.log('📊 No hay logs antiguos para limpiar');
      alert('No hay logs antiguos para limpiar');
    }
  } catch (error) {
    console.error('❌ Error limpiando logs:', error);
    alert('Error limpiando logs. Revisa la consola para más detalles.');
  }
};

interface CalendarSelectorProps {
  currentDate: string;
  customHolidays: Holiday[];
  onSelect: (date: string) => void;
  onClose: () => void;
  onGoToToday: () => void;
  jobs: Job[];
}

const CalendarSelector: React.FC<CalendarSelectorProps> = ({ currentDate, customHolidays, onSelect, onClose, onGoToToday, jobs }) => {
  const [viewDate, setViewDate] = useState(new Date(currentDate));
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const startOffset = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1); 
  
  const prevMonthDays = daysInMonth(viewDate.getFullYear(), viewDate.getMonth() - 1);
  const currentMonthDays = daysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  
  const dayElements = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    dayElements.push(<div key={`prev-${i}`} className="h-12 flex items-center justify-center text-slate-200 text-xs font-bold">{prevMonthDays - i}</div>);
  }
  
  for (let i = 1; i <= currentMonthDays; i++) {
    const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const isSelected = currentDate === dateStr;
    const isToday = new Date().toISOString().split('T')[0] === dateStr;
    const hasJobs = jobs.some(j => j.date === dateStr);
    const holiday = isHoliday(dateStr, customHolidays);
    
    dayElements.push(
      <button 
        key={i} 
        onClick={() => onSelect(dateStr)}
        className={`h-12 rounded-xl flex flex-col items-center justify-center transition-all relative group ${
          isSelected ? 'bg-blue-600 text-white shadow-lg' : 
          holiday ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100' :
          'hover:bg-slate-50 text-slate-700'
        }`}
        title={holiday ? holiday.name : undefined}
      >
        <span className={`text-sm font-black ${isToday && !isSelected ? 'text-blue-600' : ''}`}>{i}</span>
        <div className="flex gap-0.5 mt-0.5">
          {hasJobs && (
            <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-400'}`} />
          )}
          {holiday && (
            <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-amber-400'}`} />
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-slate-900 tracking-tighter italic">Saltar a fecha</h2>
          <button onClick={onClose} className="p-2 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        
        <div className="flex items-center justify-between mb-6 px-1">
          <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><ChevronLeft className="w-5 h-5 text-slate-400" /></button>
          <div className="text-center">
            <span className="text-base font-black text-slate-900 uppercase tracking-tight">{monthNames[viewDate.getMonth()]}</span>
            <span className="text-base font-bold text-slate-400 ml-2">{viewDate.getFullYear()}</span>
          </div>
          <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><ChevronRight className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
            <div key={d} className="text-[10px] font-black text-slate-300 uppercase tracking-widest py-2">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dayElements}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button 
            onClick={onGoToToday}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
          >
            Hoy
          </button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
   const [session, setSession] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setIsAuthLoading(false);
    });
    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((_event: any, session: any) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await (supabase.auth as any).signOut();
  };
  
  const [view, setView] = useState<ViewType>('planning');
  
  const [viewMode, setViewMode] = useState<'day' | 'range'>('day');
  const [rangeStartDate, setRangeStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [rangeEndDate, setRangeEndDate] = useState(new Date().toISOString().split('T')[0]);

  const defaultState: PlanningState = { 
    currentDate: new Date().toISOString().split('T')[0], 
    workers: [], // Array vacío - se cargará desde Supabase
    clients: [], // Array vacío - se cargará desde Supabase
    jobs: [], // Array vacío - se cargará desde Supabase
    customHolidays: [], 
    notifications: {},
    courses: [], // Nuevo sistema de cursos
    standardTasks: [], // Array vacío - se cargará desde Supabase
    dailyNotes: [],
    fuelRecords: [],
    vehicles: [], // Array vacío - se cargará desde Supabase
    vehicleAssignments: []
  };

  const [planning, setPlanning] = useState<PlanningState>(defaultState);
  
  const [dbStatus, setDbStatus] = useState<'loading' | 'connected' | 'error' | 'saving' | 'saved'>('connected');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [lastAutoBackupTime, setLastAutoBackupTime] = useState<Date | null>(null);
  const [dataRecoveryMode, setDataRecoveryMode] = useState(false);
  const [remoteDataExists, setRemoteDataExists] = useState(false);
  const [advancedRecovery, setAdvancedRecovery] = useState(false);
  const [recoverySnapshots, setRecoverySnapshots] = useState([]);
  const isRemoteUpdate = useRef(false);
  const isLoaded = useRef(false);

  useEffect(() => {
    const initDb = async () => {
      try {
        setDbStatus('loading'); 
        
        // 🔍 EDGE: Logging específico para carga de datos
        edgeSpecificLog('DATA LOAD START', {
          dbStatus: 'loading',
          timestamp: new Date().toISOString()
        });
        
        // 🚨 Verificar backup de emergencia antes de cargar
        checkEmergencyBackup();
        
        const { data, error } = await supabase.from('planning_snapshots').select('data, updated_at').eq('id', 1).single();
        
        if (error) {
          edgeSpecificLog('DATA LOAD ERROR', { error: error.message });
          console.error('Error cargando datos:', error);
          setDbStatus('error');
          return;
        }
        
        edgeSpecificLog('DATA LOAD RESPONSE', {
          hasData: !!data,
          dataSize: data ? JSON.stringify(data).length : 0,
          error: error?.message
        });
        
        if (data && data.data && Object.keys(data.data).length > 0) {
          const remoteData = data.data;
          
          // Verificar si hay datos significativos en remoto
          const hasRealData = (
            (remoteData.workers && remoteData.workers.length > 0) ||
            (remoteData.clients && remoteData.clients.length > 0) ||
            (remoteData.jobs && remoteData.jobs.length > 0)
          );
          
          if (hasRealData) {
            // ESTRATEGIA DEFENSIVA DE CARGA:
            // Usamos datos remotos como base y solo completamos campos que faltan
            const mergedState = {
               ...remoteData,   // Datos remotos como base
               ...defaultState,  // Solo para campos que no existan en remoto
               // Aseguramos explícitamente arrays críticos SOLO si no existen
               workers: Array.isArray(remoteData.workers) ? remoteData.workers : defaultState.workers,
               clients: Array.isArray(remoteData.clients) ? remoteData.clients : defaultState.clients,
               jobs: Array.isArray(remoteData.jobs) ? remoteData.jobs : [],
               fuelRecords: Array.isArray(remoteData.fuelRecords) ? remoteData.fuelRecords : defaultState.fuelRecords,
               vehicles: Array.isArray(remoteData.vehicles) ? remoteData.vehicles : defaultState.vehicles,
               vehicleAssignments: Array.isArray(remoteData.vehicleAssignments) ? remoteData.vehicleAssignments : [],
               standardTasks: Array.isArray(remoteData.standardTasks) ? remoteData.standardTasks : defaultState.standardTasks,
               currentDate: new Date().toISOString().split('T')[0] // Siempre arrancamos en hoy
            };

            setPlanning(mergedState);
            setRemoteDataExists(true);
            setDbStatus('connected');
          } else {
            // Hay datos en remoto pero están vacíos, inicializamos con datos de ejemplo
            setRemoteDataExists(false);
            setDataRecoveryMode(true);
            setDbStatus('connected');
          }
        } else {
          // No hay datos en remoto
          setRemoteDataExists(false);
          setDataRecoveryMode(true);
          setDbStatus('connected');
        }
        
        // 🔄 OPTIMISTIC LOCKING: Guardar timestamp del servidor
        console.log('🔒 DIAGNÓSTICO - data object:', data);
        console.log('🔒 DIAGNÓSTICO - data.updated_at:', data?.updated_at);
        
        if (data && data.updated_at) {
          localStorage.setItem('server_timestamp', data.updated_at);
          console.log('🔒 Timestamp del servidor guardado:', data.updated_at);
        } else {
          console.warn('⚠️ No se pudo guardar timestamp - data o updated_at es nulo');
        }
        
        isLoaded.current = true;

      } catch (e) {
        console.error("Error conectando a Supabase (Modo Local)", e);
        setDbStatus('error');
        isLoaded.current = true; 
      }
      
      // 🔍 ACTIVAR DETECCIÓN DE DATOS ANTIGUOS (todos los navegadores)
      detectStaleData();

      const channel = supabase.channel('planning_sync')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'planning_snapshots', filter: 'id=eq.1' }, (payload) => {
           if (payload.new && payload.new.data) {
             isRemoteUpdate.current = true;
             setPlanning(prev => ({
               ...payload.new.data,
               currentDate: prev.currentDate 
             }));
           }
        })
        .subscribe();

      
      return () => { supabase.removeChannel(channel); };
    };
    
    // Llamar a initDb
    initDb();
  }, []); 

  useEffect(() => {
    if (!isLoaded.current) return;
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    setDbStatus('saving');
    const timer = setTimeout(async () => {
      try {
        // 🚨 Guardar backup de emergencia ANTES de guardar en Supabase
        saveEmergencyBackup(planning, 'Antes de guardar en Supabase');
        
        // 🔍 EDGE: Logging específico para guardado de datos
        edgeSpecificLog('DATA SAVE START', {
          dataSize: JSON.stringify(planning).length,
          workers: planning.workers?.length || 0,
          jobs: planning.jobs?.length || 0,
          clients: planning.clients?.length || 0,
          timestamp: new Date().toISOString()
        });
        
        // 🔒 OPTIMISTIC LOCKING: Verificar que no haya cambios en el servidor
        const localTimestamp = localStorage.getItem('server_timestamp');
        console.log('🔒 DIAGNÓSTICO - localTimestamp:', localTimestamp);
        
        if (localTimestamp) {
          console.log('🔒 Verificando timestamp local:', localTimestamp);
          
          const { data: currentServerData, error: timestampError } = await supabase
            .from('planning_snapshots')
            .select('updated_at')
            .eq('id', 1)
            .single();
          
          console.log('🔒 DIAGNÓSTICO - currentServerData:', currentServerData);
          console.log('🔒 DIAGNÓSTICO - timestampError:', timestampError);
          
          if (timestampError) {
            console.error('Error verificando timestamp:', timestampError);
            showNotification('Error de sincronización verificando datos', 'error');
            setDbStatus('error');
            return;
          }
          
          console.log('🔒 Timestamp actual del servidor:', currentServerData.updated_at);
          
          // 🔄 NORMALIZAR TIMESTAMPS para comparación (eliminar milisegundos y timezone)
          const normalizedLocalTimestamp = new Date(localTimestamp).getTime();
          const normalizedServerTimestamp = new Date(currentServerData.updated_at).getTime();
          
          console.log('🔒 Timestamp local normalizado:', normalizedLocalTimestamp);
          console.log('🔒 Timestamp servidor normalizado:', normalizedServerTimestamp);
          
          // 🚨 CONFLICTO DETECTADO: Los datos en el servidor son más recientes (diferencia > 5 segundos)
          const timeDifference = Math.abs(normalizedServerTimestamp - normalizedLocalTimestamp);
          console.log('🔒 Diferencia de tiempo (ms):', timeDifference);
          
          if (timeDifference > 5000) { // 5 segundos de tolerancia
            console.warn('🚨 CONFLICTO DE SINCRONIZACIÓN DETECTADO');
            edgeSpecificLog('SYNC CONFLICT DETECTED', {
              localTimestamp,
              serverTimestamp: currentServerData.updated_at,
              timeDifference,
              timestamp: new Date().toISOString()
            });
            
            showNotification(
              '❌ Error de sincronización: Otro usuario ha modificado los datos. Recarga la página para obtener los cambios más recientes.', 
              'error'
            );
            setDbStatus('error');
            return;
          }
          
          console.log('✅ Timestamp verificado - Sin conflictos');
        } else {
          console.warn('⚠️ No hay timestamp local - omitiendo verificación de Optimistic Locking');
        }
        
        const { data, error } = await supabase
          .from('planning_snapshots')
          .upsert({ id: 1, data: planning, updated_at: new Date() })
          .select();

        if (error) {
          edgeSpecificLog('DATA SAVE ERROR', { 
            error: error.message,
            errorDetails: error,
            timestamp: new Date().toISOString()
          });
          console.error('Error de Supabase:', error);
          
          // Detectar errores de autenticación
          if (error.message?.includes('JWT') || error.message?.includes('token') || error.code === 'PGRST301') {
            showNotification('Error de autenticación. Por favor, inicia sesión nuevamente.', 'error');
            setDbStatus('error');
            // Opcional: redirigir al login
            // handleLogout();
          } else {
            showNotification('Error al guardar en la base de datos', 'error');
            setDbStatus('error');
          }
        } else {
          edgeSpecificLog('DATA SAVE SUCCESS', {
            dataSize: JSON.stringify(planning).length,
            timestamp: new Date().toISOString(),
            serverResponse: data
          });
          
          setDbStatus('saved');
          setLastSavedTime(new Date());
          
          // 🔄 OPTIMISTIC LOCKING: Actualizar timestamp local después de guardar exitosamente
          const newTimestamp = new Date().toISOString();
          localStorage.setItem('server_timestamp', newTimestamp);
          console.log('🔒 Timestamp actualizado después de guardar:', newTimestamp);
          
          // Guardar timestamp de última sincronización para Edge
          if (isEdgeBrowser()) {
            localStorage.setItem('last_sync', newTimestamp);
          }
          // Volver a 'connected' después de 2 segundos
          setTimeout(() => {
            setDbStatus('connected');
          }, 2000);
        }
      } catch (e) {
        console.error('Error general al guardar:', e);
        showNotification('Error de conexión al guardar datos', 'error');
        setDbStatus('error');
      }
    }, 1000); 

    return () => clearTimeout(timer);
  }, [planning]); 

  // useEffect para actualizar automáticamente estados de operarios
  useEffect(() => {
    if (!planning.workers.length) return;

    const today = new Date().toISOString().split('T')[0];
    const workersNeedingUpdate = planning.workers.filter(worker => {
      // Solo actualizar si el estado no es DISPONIBLE y tiene fechas definidas
      if (worker.status === WorkerStatus.DISPONIBLE || !worker.statusStartDate || !worker.statusEndDate) return false;
      
      // Lógica correcta:
      // 1. Si hoy < statusStartDate: El estado futuro no debe activarse todavía
      // 2. Si hoy >= statusStartDate y hoy <= statusEndDate: El estado debe estar activo
      // 3. Si hoy > statusEndDate: El estado debe volver a DISPONIBLE
      
      const todayDate = new Date(today);
      const startDate = new Date(worker.statusStartDate);
      const endDate = new Date(worker.statusEndDate);
      
      // Si hoy es posterior a la fecha de fin, cambiar a DISPONIBLE
      return todayDate > endDate;
    });

    if (workersNeedingUpdate.length > 0) {
      console.log('Actualizando operarios automáticamente:', workersNeedingUpdate.map(w => `${w.name} (${w.status} -> DISPONIBLE)`));
      
      setPlanning(prev => ({
        ...prev,
        workers: prev.workers.map(worker => {
          if (workersNeedingUpdate.some(w => w.id === worker.id)) {
            // Crear registro del cambio de estado
            const statusRecord = {
              id: Date.now() + Math.random(), // ID único
              workerId: worker.id,
              workerName: worker.name,
              workerCode: worker.code,
              previousStatus: worker.status,
              newStatus: WorkerStatus.DISPONIBLE,
              statusStartDate: worker.statusStartDate,
              statusEndDate: worker.statusEndDate,
              changeDate: new Date().toISOString(),
              changeReason: 'Estado expirado automáticamente'
            };
            
            // Guardar en localStorage como registro histórico
            const existingRecords = JSON.parse(localStorage.getItem('workerStatusRecords') || '[]');
            existingRecords.push(statusRecord);
            localStorage.setItem('workerStatusRecords', JSON.stringify(existingRecords));
            
            return {
              ...worker,
              status: WorkerStatus.DISPONIBLE,
              statusStartDate: undefined,
              statusEndDate: undefined
            };
          }
          return worker;
        })
      }));

      // No mostrar notificación automática para evitar spam
      console.log('Actualizando operarios automáticamente:', workersNeedingUpdate.map(w => `${w.name} (${w.status} -> DISPONIBLE)`));
    }
  }, [planning.currentDate, planning.workers]); 

  // useEffect adicional para verificar estados cada minuto y activar estados futuros
  useEffect(() => {
    if (!planning.workers.length) return;

    const checkStatuses = () => {
      const today = new Date().toISOString().split('T')[0];
      const todayDate = new Date(today);
      
      // 1. Buscar operarios que deben volver a DISPONIBLE (fechas pasadas)
      const workersNeedingUpdate = planning.workers.filter(worker => {
        if (worker.status === WorkerStatus.DISPONIBLE || !worker.statusStartDate || !worker.statusEndDate) return false;
        const endDate = new Date(worker.statusEndDate);
        return todayDate > endDate;
      });

      // 2. Buscar operarios que deben activar su estado (hoy >= fecha inicio)
      const workersNeedingActivation = planning.workers.filter(worker => {
        if (worker.status === WorkerStatus.DISPONIBLE || !worker.statusStartDate || !worker.statusEndDate) return false;
        const startDate = new Date(worker.statusStartDate);
        const endDate = new Date(worker.statusEndDate);
        return todayDate >= startDate && todayDate <= endDate;
      });

      // Procesar actualizaciones (volver a DISPONIBLE)
      if (workersNeedingUpdate.length > 0) {
        // No mostrar notificación para evitar spam
        console.log('Verificación periódica: Actualizando operarios a DISPONIBLE:', workersNeedingUpdate.map(w => w.name));
      }

      // Procesar activaciones (cambiar a estado programado)
      if (workersNeedingActivation.length > 0) {
        console.log('Verificación periódica: Activando estados programados:', workersNeedingActivation.map(w => w.name));
        // No mostrar notificación para evitar spam
      }
    };

    // Ejecutar inmediatamente al cargar
    checkStatuses();
    
    // Configurar verificación cada minuto
    const interval = setInterval(checkStatuses, 60000);
    
    return () => clearInterval(interval);
  }, [planning.workers.length]); 


  const backupInputRef = useRef<HTMLInputElement>(null);
  const [draggedWorkerId, setDraggedWorkerId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'error' | 'success' | 'warning' | 'info'} | null>(null);
  const [workerTableSearch, setWorkerTableSearch] = useState('');
  const [showArchivedWorkers, setShowArchivedWorkers] = useState(false); 
  const [workerAvailabilityFilter, setWorkerAvailabilityFilter] = useState<'all' | 'free' | 'assigned'>('all');
  const [workerContractFilter, setWorkerContractFilter] = useState<'all' | 'fixedDiscontinuous' | 'others'>('all');
  const [workerStatusFilter, setWorkerStatusFilter] = useState<{[key: string]: boolean}>({
  'DISPONIBLE': true,
  'VACACIONES': true,
  'BAJA_MEDICA': true,
  'BAJA_PATERNIDAD': true
}); 
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'job' | 'worker' | 'client' | 'task' | 'course', name: string } | null>(null);
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState<string | null>(null);

  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showSSReport, setShowSSReport] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [selectedNotificationWorkerId, setSelectedNotificationWorkerId] = useState<string | null>(null);
  const [showCalendarSelector, setShowCalendarSelector] = useState(false);
  const [workerListModal, setWorkerListModal] = useState<{clientId: string, centerId: string, date: string} | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editingStatusRecord, setEditingStatusRecord] = useState<{id?: string, status: WorkerStatus, startDate: string, endDate: string} | null>(null);
  const [showAddRecordForm, setShowAddRecordForm] = useState(false);
  const [duplicatingJob, setDuplicatingJob] = useState<Job | null>(null);
  const [duplicationDate, setDuplicationDate] = useState<string>('');
  const [keepWorkersOnDuplicate, setKeepWorkersOnDuplicate] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [dbTab, setDbTab] = useState<'tasks' | 'courses'>('tasks');
  const [editingStandardTask, setEditingStandardTask] = useState<StandardTask | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [editingDailyNote, setEditingDailyNote] = useState<DailyNote | null>(null);
  const [workerNoteFilters, setWorkerNoteFilters] = useState<{[key: string]: boolean}>({
    'info': true,
    'time': true,
    'medical': true
  });
  const [newFuelRecord, setNewFuelRecord] = useState<{liters: string, cost: string, odometer: string, date: string}>({
    liters: '', cost: '', odometer: '', date: new Date().toISOString().split('T')[0]
  });

  const showNotification = useCallback((message: string, type: 'error' | 'success' | 'warning' | 'info' = 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Función para guardar manualmente con notificación de éxito
  const saveToSupabase = useCallback(async (showSuccessNotification = false) => {
    try {
      setDbStatus('saving');
      
      // 🔒 OPTIMISTIC LOCKING: Verificar antes de guardar manualmente
      const localTimestamp = localStorage.getItem('server_timestamp');
      if (localTimestamp) {
        const { data: currentServerData, error: timestampError } = await supabase
          .from('planning_snapshots')
          .select('updated_at')
          .eq('id', 1)
          .single();
        
        if (timestampError) {
          console.error('Error verificando timestamp:', timestampError);
          showNotification('Error de sincronización verificando datos', 'error');
          setDbStatus('error');
          return false;
        }
        
        if (currentServerData.updated_at !== localTimestamp) {
          // 🔄 NORMALIZAR TIMESTAMPS para comparación
          const normalizedLocalTimestamp = new Date(localTimestamp).getTime();
          const normalizedServerTimestamp = new Date(currentServerData.updated_at).getTime();
          const timeDifference = Math.abs(normalizedServerTimestamp - normalizedLocalTimestamp);
          
          if (timeDifference > 5000) { // 5 segundos de tolerancia
            showNotification(
              '❌ Error de sincronización: Otro usuario ha modificado los datos. Recarga la página primero.', 
              'error'
            );
            setDbStatus('error');
            return false;
          }
        }
      }
      
      const { data, error } = await supabase
        .from('planning_snapshots')
        .upsert({ id: 1, data: planning, updated_at: new Date() })
        .select();
      
      // 🔒 Actualizar timestamp después de guardar exitosamente
      if (!error) {
        const newTimestamp = new Date().toISOString();
        localStorage.setItem('server_timestamp', newTimestamp);
      }

      if (error) {
        console.error('Error de Supabase:', error);
        
        // Detectar errores de autenticación
        if (error.message?.includes('JWT') || error.message?.includes('token') || error.code === 'PGRST301') {
          showNotification('Error de autenticación. Por favor, inicia sesión nuevamente.', 'error');
          setDbStatus('error');
          return false;
        } else {
          showNotification('Error al guardar en la base de datos', 'error');
          setDbStatus('error');
          return false;
        }
      } else {
        setDbStatus('saved');
        setLastSavedTime(new Date());
        if (showSuccessNotification) {
          showNotification('Guardado exitosamente', 'success');
        }
        // Volver a 'connected' después de 2 segundos
        setTimeout(() => {
          setDbStatus('connected');
        }, 2000);
        return true;
      }
    } catch (e) {
      console.error('Error general al guardar:', e);
      showNotification('Error de conexión al guardar datos', 'error');
      setDbStatus('error');
      return false;
    }
  }, [planning, showNotification]);

  // Función de backup automático programado
  const performAutoBackup = useCallback(() => {
    if (!autoBackupEnabled) return;
    
    const now = new Date();
    
    // 🔍 DIAGNÓSTICO: Verificar estado de los datos antes del backup automático
    console.log('🔍 BACKUP AUTOMÁTICO - DIAGNÓSTICO:');
    console.log('- Workers:', planning.workers?.length || 0);
    console.log('- Jobs:', planning.jobs?.length || 0);
    console.log('- Clients:', planning.clients?.length || 0);
    console.log('- Timestamp:', now.toISOString());
    
    // 🚨 VERIFICACIÓN: Si los datos están vacíos, no hacer backup
    if (!planning.workers || planning.workers.length === 0) {
      console.warn('⚠️ BACKUP AUTOMÁTICO CANCELADO - No hay workers cargados');
      return;
    }
    
    // Ejecutar durante las 24 horas del día
    try {
      const dataStr = JSON.stringify(planning, null, 2);
      const dataSizeKB = Math.round(dataStr.length / 1024);
      
      console.log('🔍 BACKUP AUTOMÁTICO - Tamaño:', dataSizeKB, 'KB');
      
      // 🚨 ALERTA si el tamaño es sospechosamente pequeño
      if (dataSizeKB < 10) {
        console.warn('⚠️ BACKUP AUTOMÁTICO DEMASIADO PEQUEÑO - Cancelando descarga');
        console.log('🔍 Contenido:', dataStr.substring(0, 500));
        return;
      }
      
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Nombre con timestamp completo
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      link.download = `backup_${dateStr}_${timeStr}.json`;
      
      // Simular clic para descargar
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Notificación de éxito
      console.log(`✅ Backup automático completado: ${dataSizeKB}KB`);
      showNotification(`Backup automático creado: ${timeStr}`, 'success');
      setLastAutoBackupTime(now);
      
    } catch (error) {
      console.error('❌ Error en backup automático:', error);
      showNotification('Error en backup automático', 'error');
    }
  }, [autoBackupEnabled, planning, showNotification]);

  // Timer para backup automático cada hora (24h)
  useEffect(() => {
    if (!autoBackupEnabled) return;
    
    // Configurar timer para ejecutar cada hora (sin ejecutar al iniciar)
    const interval = setInterval(() => {
      performAutoBackup();
    }, 60 * 60 * 1000); // 1 hora en milisegundos
    
    return () => clearInterval(interval);
  }, [autoBackupEnabled, performAutoBackup]);

  // Backup al cerrar la página
  useEffect(() => {
    if (!autoBackupEnabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Ejecutar backup final al cerrar
      try {
        const dataStr = JSON.stringify(planning, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Nombre con timestamp para el backup de cierre
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        link.download = `backup_cierre_${dateStr}_${timeStr}.json`;
        
        // Simular clic para descargar
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`Backup de cierre creado: backup_cierre_${dateStr}_${timeStr}.json`);
      } catch (error) {
        console.error('Error en backup de cierre:', error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [autoBackupEnabled, planning]);

  const handleDragStart = (worker: Worker) => setDraggedWorkerId(worker.id);
  
  const handleAddVehicle = (v: Vehicle) => {
    setPlanning(prev => ({ ...prev, vehicles: [...prev.vehicles, v] }));
    showNotification("Vehículo añadido", "success");
  };

  const handleEditVehicle = (v: Vehicle) => {
    setPlanning(prev => ({ ...prev, vehicles: prev.vehicles.map(vh => vh.id === v.id ? v : vh) }));
    showNotification("Vehículo actualizado", "success");
  };

  const handleDeleteVehicle = (id: string) => {
    setPlanning(prev => ({ ...prev, vehicles: prev.vehicles.filter(vh => vh.id !== id) }));
    showNotification("Vehículo eliminado", "success");
  };

  const handleAssignVehicle = (vehicleId: string, workerId: string) => {
    setPlanning(prev => {
      const cleaned = prev.vehicleAssignments.filter(a => !(a.date === prev.currentDate && a.workerId === workerId));
      const finalAssignments = cleaned.filter(a => !(a.date === prev.currentDate && a.vehicleId === vehicleId));

      return {
        ...prev,
        vehicleAssignments: [...finalAssignments, { id: `va-${Date.now()}`, vehicleId, workerId, date: prev.currentDate }]
      };
    });
    showNotification("Vehículo asignado", "success");
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    setPlanning(prev => ({ ...prev, vehicleAssignments: prev.vehicleAssignments.filter(a => a.id !== assignmentId) }));
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      if (!dateStr) return 'Fecha inválida';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Fecha inválida';
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
      const formatted = new Intl.DateTimeFormat('es-ES', options).format(date);
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } catch (e) {
      return dateStr;
    }
  };

  const handleShowWorkerList = (clientId: string, centerId: string, date: string) => {
    setWorkerListModal({ clientId, centerId, date });
  };

  const generateWorkerListText = (clientId: string, centerId: string, date: string) => {
    // Obtener todas las tareas del cliente en esa fecha y sede
    const relevantJobs = planning.jobs.filter(job => 
      job.clientId === clientId && 
      job.centerId === centerId && 
      job.date === date && 
      !job.isCancelled
    );

    // Recolectar todos los operarios únicos
    const allWorkerIds = new Set<string>();
    relevantJobs.forEach(job => {
      job.assignedWorkerIds.forEach(workerId => {
        allWorkerIds.add(workerId);
      });
    });

    // Obtener información completa de los operarios
    const workers = Array.from(allWorkerIds)
      .map(workerId => planning.workers.find(w => w.id === workerId))
      .filter(worker => worker !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Obtener información del cliente y sede
    const client = planning.clients.find(c => c.id === clientId);
    const center = client?.centers.find(ct => ct.id === centerId);

    // Generar texto del listado
    let text = `LISTADO DE OPERARIOS\n`;
    text += `====================\n\n`;
    text += `CLIENTE: ${client?.name || 'Desconocido'}\n`;
    text += `SEDE: ${center?.name || 'Desconocido'}\n`;
    text += `FECHA: ${formatDateDMY(date)}\n`;
    text += `TOTAL OPERARIOS: ${workers.length}\n\n`;
    text += `---------------------\n`;
    text += `OPERARIOS ASIGNADOS:\n`;
    text += `---------------------\n\n`;

    workers.forEach((worker, index) => {
      text += `${index + 1}. ${worker.name}\n`;
      text += `   DNI: ${worker.dni}\n`;
      text += `   CATEGORÍA: ${worker.role}\n\n`;
    });

    return text;
  };

  const copyWorkerListToClipboard = (clientId: string, centerId: string, date: string) => {
    const text = generateWorkerListText(clientId, centerId, date);
    navigator.clipboard.writeText(text).then(() => {
      showNotification('Listado de operarios copiado al portapapeles', 'success');
    }).catch(() => {
      showNotification('Error al copiar el listado', 'error');
    });
  };

  const handleDateChange = (newDate: string) => {
    if (newDate) {
      setPlanning(prev => ({ ...prev, currentDate: newDate }));
      setShowCalendarSelector(false);
      showNotification(`Cargando agenda: ${formatDateDisplay(newDate)}`, 'success');
    }
  };

  const goToToday = () => handleDateChange(new Date().toISOString().split('T')[0]);

  const toggleNotificationStatus = (workerId: string, date: string, markAsDone: boolean) => {
    setPlanning(prev => {
      const currentNotified = prev.notifications[date] || [];
      const newNotified = markAsDone 
        ? (currentNotified.includes(workerId) ? currentNotified : [...currentNotified, workerId])
        : currentNotified.filter(id => id !== workerId);
      return { ...prev, notifications: { ...prev.notifications, [date]: newNotified } };
    });
  };

  const ssReport = useMemo(() => {
    try {
      const todayStr = planning.currentDate;
      const prevWorkingDayStr = getPreviousWeekday(todayStr); 
      const targetWorkers = planning.workers.filter(w => w.contractType === ContractType.FIJO_DISCONTINUO);
      const safeJobs = planning.jobs || [];
      
      // Función para verificar si un trabajador tiene tareas reales (excluyendo RECONOCIMIENTO MÉDICO)
      const hasRealJobs = (date: string, workerId: string) => {
        const workerJobs = safeJobs.filter(j => 
          j.date === date && 
          !j.isCancelled && 
          j.assignedWorkerIds.includes(workerId)
        );
        
        // Si no tiene tareas, return false
        if (workerJobs.length === 0) return false;
        
        // Verificar si AL MENOS UNA tarea es de un cliente diferente a RECONOCIMIENTO MÉDICO
        return workerJobs.some(job => {
          const client = planning.clients.find(c => c.id === job.clientId);
          return client && !client.name.includes('RECONOCIMIENTO MÉDICO') && !client.name.includes('RECONOCIMIENTO MEDICO');
        });
      };
      
      // Obtener IDs de trabajadores con tareas reales en día anterior
      const workedPrevDayIds = new Set(
        targetWorkers.filter(w => hasRealJobs(prevWorkingDayStr, w.id)).map(w => w.id)
      );
      
      // Obtener IDs de trabajadores con tareas reales hoy
      const worksTodayIds = new Set(
        targetWorkers.filter(w => hasRealJobs(todayStr, w.id)).map(w => w.id)
      );
      
      const altas = targetWorkers.filter(w => worksTodayIds.has(w.id) && !workedPrevDayIds.has(w.id));
      const bajas = targetWorkers.filter(w => workedPrevDayIds.has(w.id) && !worksTodayIds.has(w.id));
      return { altas, bajas, prevDate: prevWorkingDayStr };
    } catch (e) {
      return { altas: [], bajas: [], prevDate: planning.currentDate };
    }
  }, [planning.currentDate, planning.jobs, planning.workers, planning.clients]);

  const handleCopyList = (list: Worker[], type: 'altas' | 'bajas') => {
      try {
        console.log(`Copiando lista ${type}:`, list); // Debug
        const title = type === 'altas' ? `ALTAS ${formatDateDMY(planning.currentDate)}` : `BAJAS ${formatDateDMY(planning.currentDate)}`;
        const content = list.map(w => getWorkerSSFormat(w)).join('\n');
        const fullText = `${title}\n\n${content}`;
        
        console.log('Texto a copiar:', fullText); // Debug
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(fullText).then(() => {
            showNotification("Copiado al portapapeles", "success");
            console.log('Copiado exitoso'); // Debug
          }).catch((error) => {
            console.error('Error al copiar:', error); // Debug
            showNotification("Error al copiar al portapapeles", "error");
          });
        } else {
          // Fallback para navegadores que no soportan clipboard API
          const textArea = document.createElement('textarea');
          textArea.value = fullText;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          showNotification("Copiado al portapapeles", "success");
        }
      } catch (error) {
        console.error('Error en handleCopyList:', error);
        showNotification("Error al copiar la lista", "error");
      }
  };

  const handleAssignWorker = useCallback((workerId: string, jobId: string, sourceJobId: string | null = null) => {
    const worker = planning.workers.find(w => w.id === workerId);
    const job = planning.jobs.find(j => j.id === jobId);
    if (!worker || !job) return;
    
    if (job.isCancelled) {
       showNotification("No se pueden asignar operarios a una tarea anulada", "error");
       return;
    }

    const validation = validateAssignment(worker, job, planning.jobs, planning.customHolidays, planning.clients);
    if (validation.error) { showNotification(validation.error, 'error'); return; }
    if (validation.warning) { showNotification(validation.warning, 'warning'); } 
    
    setPlanning(prev => ({
      ...prev,
      jobs: prev.jobs.map(j => {
        let assigned = j.assignedWorkerIds;
        let workerTimes = { ...j.workerTimes };
        if (sourceJobId && j.id === sourceJobId) {
            assigned = assigned.filter(id => id !== workerId);
            if (workerTimes[workerId]) delete workerTimes[workerId];
        }
        if (j.id === jobId) {
            assigned = [...assigned.filter(id => id !== workerId), workerId];
        }
        return { ...j, assignedWorkerIds: assigned, workerTimes };
      })
    }));
    if (!validation.warning) showNotification("Mozo asignado", "success");
  }, [planning, showNotification]);

  const handleRemoveWorker = (workerId: string, jobId: string) => {
    setPlanning(prev => ({
      ...prev,
      jobs: prev.jobs.map(j => {
        if (j.id === jobId) {
            const workerTimes = { ...j.workerTimes };
            if (workerTimes[workerId]) delete workerTimes[workerId];
            return { ...j, assignedWorkerIds: j.assignedWorkerIds.filter(id => id !== workerId), workerTimes };
        }
        return j;
      })
    }));
  };

  // Función para determinar el estado correcto según las fechas (ahora usa registros)
  const getCorrectWorkerStatus = (worker: Worker): WorkerStatus => {
    // Usar la nueva lógica basada en registros
    return getCurrentWorkerStatus(worker).status;
  };

  const handleUpdateWorkerStatus = (workerId: string, status: WorkerStatus) => {
    setPlanning(prev => ({ ...prev, workers: prev.workers.map(w => w.id === workerId ? { ...w, status } : w) }));
  };

  // Funciones para manejar registros de estados
  const handleAddStatusRecord = () => {
    if (!editingWorker || !editingStatusRecord) {
      return;
    }
    
    // Validación básica
    if (!editingStatusRecord.startDate) {
      showNotification("Debes seleccionar una fecha de inicio", "error");
      return;
    }
    
    if (!editingStatusRecord.endDate || editingStatusRecord.endDate === '') {
      showNotification("Debes seleccionar una fecha de fin o marcar como IND.", "error");
      return;
    }

    const updatedWorker = addOrUpdateStatusRecord(
      editingWorker,
      editingStatusRecord.status,
      editingStatusRecord.startDate,
      editingStatusRecord.endDate
    );

    // Calcular y actualizar el estado actual basado en los registros
    const currentStatus = getCurrentWorkerStatus(updatedWorker);
    
    const finalWorker = {
      ...updatedWorker,
      status: currentStatus.status,
      statusStartDate: currentStatus.startDate,
      statusEndDate: currentStatus.endDate
    };

    setEditingWorker(finalWorker);
    
    // También actualizar la lista principal de workers
    setPlanning(prev => ({
      ...prev,
      workers: prev.workers.map(w => w.id === finalWorker.id ? finalWorker : w)
    }));
    
    setEditingStatusRecord(null);
    setShowAddRecordForm(false);
    showNotification("Registro de estado añadido", "success");
  };

  const handleEditStatusRecord = (recordId: string) => {
    if (!editingWorker?.statusRecords) return;
    
    const record = editingWorker.statusRecords.find(r => r.id === recordId);
    if (record) {
      setEditingStatusRecord({
        id: record.id,
        status: record.status,
        startDate: record.startDate,
        endDate: record.endDate || 'IND.'
      });
      setShowAddRecordForm(true);
    }
  };

  const handleDeleteStatusRecord = (recordId: string) => {
    if (!editingWorker) return;
    
    if (confirm("¿Estás seguro de que quieres eliminar este registro?")) {
      const updatedWorker = removeStatusRecord(editingWorker, recordId);
      
      // Recalcular el estado actual después de eliminar
      const currentStatus = getCurrentWorkerStatus(updatedWorker);
      
      const finalWorker = {
        ...updatedWorker,
        status: currentStatus.status,
        statusStartDate: currentStatus.startDate,
        statusEndDate: currentStatus.endDate
      };
      
      setEditingWorker(finalWorker);
      
      // También actualizar la lista principal de workers
      setPlanning(prev => ({
        ...prev,
        workers: prev.workers.map(w => w.id === finalWorker.id ? finalWorker : w)
      }));
      
      showNotification("Registro eliminado", "success");
    }
  };

  // Función manual para verificar y actualizar estados de operarios
  const handleCheckWorkerStatuses = () => {
    if (!planning.workers.length) {
      showNotification("No hay operarios para verificar", "warning");
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const workersNeedingUpdate = planning.workers.filter(worker => 
      worker.status !== WorkerStatus.DISPONIBLE && 
      worker.statusEndDate && 
      worker.statusEndDate < today
    );

    if (workersNeedingUpdate.length > 0) {
      console.log('Verificación manual: Actualizando operarios:', workersNeedingUpdate.map(w => `${w.name} (${w.status} -> DISPONIBLE)`));
      
      setPlanning(prev => ({
        ...prev,
        workers: prev.workers.map(worker => {
          if (workersNeedingUpdate.some(w => w.id === worker.id)) {
            return {
              ...worker,
              status: WorkerStatus.DISPONIBLE,
              statusStartDate: undefined,
              statusEndDate: undefined
            };
          }
          return worker;
        })
      }));

      const workerNames = workersNeedingUpdate.map(w => getWorkerDisplayName(w)).join(', ');
      showNotification(
        `Verificación completada: ${workersNeedingUpdate.length} operario(s) cambiado(s) a Disponible: ${workerNames}`,
        'success'
      );
    } else {
      showNotification("Todos los operarios tienen el estado correcto", "success");
    }
  };

  const handleReorderJobs = (sourceJobId: string, targetJobId: string) => {
    setPlanning(prev => {
      const jobs = [...prev.jobs];
      const sIdx = jobs.findIndex(j => j.id === sourceJobId);
      const tIdx = jobs.findIndex(j => j.id === targetJobId);
      if (sIdx === -1 || tIdx === -1 || sIdx === tIdx) return prev;
      const [moved] = jobs.splice(sIdx, 1);
      jobs.splice(tIdx, 0, moved);
      return { ...prev, jobs };
    });
  };

  const handleReorderClients = (sourceClientId: string, targetClientId: string) => {
    setPlanning(prev => {
      const clients = [...prev.clients];
      const sIdx = clients.findIndex(c => c.id === sourceClientId);
      const tIdx = clients.findIndex(c => c.id === targetClientId);
      if (sIdx === -1 || tIdx === -1 || sIdx === tIdx) return prev;
      const [moved] = clients.splice(sIdx, 1);
      clients.splice(tIdx, 0, moved);
      return { ...prev, clients };
    });
  };

  const handleOpenNewJob = (clientId: string = '', date?: string) => {
    const firstClient = clientId ? planning.clients.find(c => c.id === clientId) : planning.clients[0];
    const newJob: Job = {
      id: `j-${Date.now()}`,
      date: date || planning.currentDate,
      clientId: firstClient?.id || '',
      centerId: firstClient?.centers?.[0]?.id || '',
      type: JobType.DESCARGA,
      startTime: '08:00',
      endTime: '12:00',
      requiredWorkers: 2,
      assignedWorkerIds: [],
      workerTimes: {},
      ref: '', deliveryNote: '', locationDetails: ''
    };
    setEditingJob(newJob);
  };

  const handleOpenDuplicate = (job: Job) => {
    setDuplicatingJob(job);
    const nextDay = new Date(planning.currentDate);
    nextDay.setDate(nextDay.getDate() + 1);
    setDuplicationDate(nextDay.toISOString().split('T')[0]);
    setKeepWorkersOnDuplicate(false);
  };

  const handleDuplicateJob = () => {
    if (!duplicatingJob || !duplicationDate) return;
    const newJob: Job = {
      ...duplicatingJob,
      id: `j-copy-${Date.now()}`,
      date: duplicationDate,
      deliveryNote: '', // No duplicar el albarán
      isCancelled: false, cancellationReason: '', isFinished: false, actualEndTime: undefined,
      assignedWorkerIds: keepWorkersOnDuplicate ? duplicatingJob.assignedWorkerIds : [],
      workerTimes: keepWorkersOnDuplicate ? { ...duplicatingJob.workerTimes } : {}
    };
    setPlanning(prev => ({ ...prev, jobs: [...prev.jobs, newJob] }));
    showNotification(`Tarea duplicada al ${formatDateDisplay(duplicationDate)}`, "success");
    setDuplicatingJob(null);
  };

  const handleOpenNote = (workerId: string) => {
    const existingNote = planning.dailyNotes?.find(n => n.workerId === workerId && n.date === planning.currentDate);
    setEditingDailyNote(existingNote || {
      id: `note-${Date.now()}`,
      workerId: workerId,
      date: planning.currentDate,
      text: '',
      type: 'info'
    });
  };

  const handleOpenNewWorker = () => {
      setEditingWorker({
          id: `w-${Date.now()}`,
          code: '',
          name: '',
          apodo: undefined,
          dni: '',
          phone: '',
          role: 'Mozo Almacén',
          status: WorkerStatus.DISPONIBLE, // Asegurado que sea Disponible por defecto
          contractType: ContractType.FIJO_DISCONTINUO,
          hasVehicle: false,
          startTime: '09:00',
          endTime: '17:00',
          restrictions: [],
          restrictedClientIds: [],
          skills: [JobType.MANIPULACION],
          completedCourses: []
      });
  };

  const saveJob = (job: Job) => {
    if (!job.clientId || !job.centerId) { showNotification("Error: Cliente/Centro requeridos", "error"); return; }
    setPlanning(prev => {
      const exists = prev.jobs.some(j => j.id === job.id);
      return { ...prev, jobs: exists ? prev.jobs.map(j => j.id === job.id ? job : j) : [...prev.jobs, job] };
    });
    setEditingJob(null);
    showNotification("Tarea guardada", "success");
  };

  const handleUpdateJobReinforcementGroups = (jobId: string, groups: ReinforcementGroup[]) => {
    // Recolectar todos los operarios de los grupos de refuerzo
    const reinforcementWorkerIds = groups.flatMap(group => group.workerIds);
    
    // Actualizar workerTimes para todos los operarios en grupos de refuerzo
    const newWorkerTimes: Record<string, string> = {};
    groups.forEach(group => {
      group.workerIds.forEach(workerId => {
        newWorkerTimes[workerId] = group.startTime;
      });
    });
    
    setPlanning(prev => ({
      ...prev,
      jobs: prev.jobs.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              reinforcementGroups: groups,
              workerTimes: { ...job.workerTimes, ...newWorkerTimes },
              // Añadir operarios de refuerzo a la lista principal, evitando duplicados
              assignedWorkerIds: [
                ...job.assignedWorkerIds.filter(id => !reinforcementWorkerIds.includes(id)),
                ...reinforcementWorkerIds
              ]
            }
          : job
      )
    }));
    
    showNotification("Grupos de refuerzo actualizados", "success");
  };

  const saveWorker = (worker: Worker | null) => {
    if (!worker || !worker.name || !worker.code) { showNotification("Nombre y Código requeridos", "error"); return; }
    setPlanning(prev => {
      const exists = prev.workers.find(w => w.id === worker.id);
      return { ...prev, workers: exists ? prev.workers.map(w => w.id === worker.id ? worker : w) : [...prev.workers, worker] };
    });
    setEditingWorker(null);
    showNotification("Operario guardado", "success");
  };

  const saveClient = (client: Client | null) => {
    if (!client || !client.name) { showNotification("Nombre empresa requerido", "error"); return; }
    setPlanning(prev => {
      const exists = prev.clients.find(c => c.id === client.id);
      return { ...prev, clients: exists ? prev.clients.map(c => c.id === client.id ? client : c) : [...prev.clients, client] };
    });
    setEditingClient(null);
    showNotification("Cliente guardado", "success");
  };

  const handleOpenNewStandardTask = () => setEditingStandardTask({ 
  id: `st-${Date.now()}`, 
  name: '', 
  type: JobType.MANIPULACION,
  defaultWorkers: 2, 
  notes: '',
  assignedClientIds: []
});
  const saveStandardTask = (task: StandardTask) => {
    if(!task.name) return;
    setPlanning(prev => {
        const exists = prev.standardTasks.find(t => t.id === task.id);
        return { ...prev, standardTasks: exists ? prev.standardTasks.map(t => t.id === task.id ? task : t) : [...prev.standardTasks, task] };
    });
    setEditingStandardTask(null);
    showNotification("Tarea estándar guardada", "success");
  };

  const deleteStandardTask = (taskId: string) => {
    setPlanning(prev => ({
      ...prev,
      standardTasks: prev.standardTasks.filter(t => t.id !== taskId)
    }));
    setEditingStandardTask(null);
    showNotification("Tarea eliminada", "success");
  };

  // Función para limpiar todas las plantillas rápidas (standardTasks)
  const clearAllStandardTasks = () => {
    const taskCount = planning.standardTasks.length;
    if (taskCount === 0) {
      showNotification("No hay plantillas rápidas para eliminar", "info");
      return;
    }
    
    setPlanning(prev => ({
      ...prev,
      standardTasks: []
    }));
    showNotification(`Se eliminaron ${taskCount} plantillas rápidas`, "success");
  };

  const handleAddGlobalCourse = () => {
      if(!newCourseName.trim()) return;
      const newCourse: Course = {
        id: `course-${Date.now()}`,
        name: newCourseName.trim(),
        description: '',
        validityMonths: 12,
        assignedWorkerIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      setPlanning(prev => ({...prev, courses: [...prev.courses, newCourse]}));
      setNewCourseName('');
      showNotification("Curso añadido", "success");
  };
  
  const deleteCourse = (id: string) => {
      setPlanning(prev => ({...prev, courses: prev.courses.filter(c => c.id !== id)}));
      setEditingCourse(null);
      showNotification("Curso eliminado", "success");
  };
  
  const saveCourse = (course: Course) => {
      setPlanning(prev => ({
        ...prev,
        courses: prev.courses.map(c => c.id === course.id ? {...course, updatedAt: new Date().toISOString()} : c)
      }));
      setEditingCourse(null);
      showNotification("Curso guardado", "success");
  };
  
  const addWorkerToCourse = (courseId: string, workerId: string) => {
      setPlanning(prev => ({
        ...prev,
        courses: prev.courses.map(c => 
          c.id === courseId 
            ? {...c, assignedWorkerIds: [...c.assignedWorkerIds, workerId], updatedAt: new Date().toISOString()}
            : c
        )
      }));
      showNotification("Operario añadido al curso", "success");
  };
  
  const removeWorkerFromCourse = (courseId: string, workerId: string) => {
      setPlanning(prev => ({
        ...prev,
        courses: prev.courses.map(c => 
          c.id === courseId 
            ? {...c, assignedWorkerIds: c.assignedWorkerIds.filter(id => id !== workerId), updatedAt: new Date().toISOString()}
            : c
        )
      }));
      showNotification("Operario eliminado del curso", "success");
  };
  
  const isCourseExpired = (course: Course, workerId: string) => {
      // Por ahora, vamos a implementar una lógica simple
      // En el futuro podríamos añadir fecha de realización por operario
      return false;
  };
  
  const getWorkerCourses = (workerId: string) => {
      return planning.courses.filter(course => course.assignedWorkerIds.includes(workerId));
  };

  const saveDailyNote = () => {
      if(!editingDailyNote) return;
      if(!editingDailyNote.text.trim()) { deleteDailyNote(editingDailyNote.id); return; }
      setPlanning(prev => {
          const notes = prev.dailyNotes || [];
          const idx = notes.findIndex(n => n.id === editingDailyNote.id);
          const updated = idx >= 0 ? notes.map((n, i) => i === idx ? editingDailyNote : n) : [...notes, editingDailyNote];
          return { ...prev, dailyNotes: updated };
      });
      setEditingDailyNote(null);
      showNotification("Nota guardada", "success");
  };
  const deleteDailyNote = (id: string) => {
      setPlanning(prev => ({...prev, dailyNotes: prev.dailyNotes?.filter(n => n.id !== id)}));
      setEditingDailyNote(null);
      showNotification("Nota eliminada", "success");
  };

  const executeDelete = () => {
      if(!itemToDelete) return;
      const { id, type } = itemToDelete;
      setPlanning(prev => {
          const newState = { ...prev };
          if(type === 'job') newState.jobs = cleanedPlanning.jobs.filter(j => j.id !== id);
          else if(type === 'worker') newState.workers = cleanedPlanning.workers.filter(w => w.id !== id);
          else if(type === 'client') newState.clients = cleanedPlanning.clients.filter(c => c.id !== id);
          else if(type === 'task') newState.standardTasks = cleanedPlanning.standardTasks.filter(t => t.id !== id);
          else if(type === 'course') newState.courses = cleanedPlanning.courses.filter(c => c.id !== id);
          return newState;
      });
      setItemToDelete(null);
      setEditingJob(null); setEditingWorker(null); setEditingClient(null); setEditingStandardTask(null); setEditingCourse(null);
      showNotification("Eliminado correctamente", "success");
  };

  const shiftDate = (days: number) => {
      const d = new Date(planning.currentDate);
      d.setDate(d.getDate() + days);
      handleDateChange(d.toISOString().split('T')[0]);
  };

  const exportBackup = () => {
      // 🔍 DIAGNÓSTICO: Verificar qué contiene planning antes de exportar
      console.log('🔍 DIAGNÓSTICO DE BACKUP:');
      console.log('- Workers:', planning.workers?.length || 0);
      console.log('- Jobs:', planning.jobs?.length || 0);
      console.log('- Clients:', planning.clients?.length || 0);
      console.log('- Vehicles:', planning.vehicles?.length || 0);
      console.log('- Courses:', planning.courses?.length || 0);
      console.log('- StandardTasks:', planning.standardTasks?.length || 0);
      
      // 🔄 USAR DATOS COMPLETOS en lugar de cleanedPlanning para backup completo
      const dataStr = JSON.stringify(planning, null, 2);
      const dataSizeKB = Math.round(dataStr.length / 1024);
      
      console.log('🔍 Tamaño real del backup:', dataSizeKB, 'KB');
      console.log('🔍 Longitud del string:', dataStr.length, 'caracteres');
      
      // 🚨 ALERTA si el tamaño es sospechosamente pequeño
      if (dataSizeKB < 10) {
        console.warn('⚠️ BACKUP DEMASIADO PEQUEÑO - Posible problema de datos');
        console.log('🔍 Primeros 1000 caracteres del backup:', dataStr.substring(0, 1000));
      }
      
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Crear nombre de archivo con fecha y hora
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      link.download = `backup_completo_${dateStr}_${timeStr}.json`;
      link.click();
      
      // Mostrar información del backup
      showNotification(`Backup completo exportado: ${dataSizeKB}KB`, 'success');
  };

  // 📊 Nueva función para backup limpio (si se necesita)
  const exportCleanBackup = () => {
      const dataStr = JSON.stringify(cleanedPlanning, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      link.download = `backup_limpio_${dateStr}_${timeStr}.json`;
      link.click();
      
      const dataSizeKB = Math.round(dataStr.length / 1024);
      showNotification(`Backup limpio exportado: ${dataSizeKB}KB`, 'success');
  };
  const exportDatabaseToExcel = () => showNotification("Función de exportación completa disponible", "info"); 
  const downloadExcelTemplate = () => showNotification("Plantilla descargada", "info");
  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setDbStatus('loading');
      showNotification("Importando datos...", "info");
      
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const importedData = JSON.parse(text);
        
        // Validar y limpiar datos importados
        const cleanedImported = {
          ...defaultState,
          ...importedData,
          workers: Array.isArray(importedData.workers) ? importedData.workers : defaultState.workers,
          clients: Array.isArray(importedData.clients) ? importedData.clients : defaultState.clients,
          jobs: Array.isArray(importedData.jobs) ? importedData.jobs : [],
          vehicles: Array.isArray(importedData.vehicles) ? importedData.vehicles : defaultState.vehicles,
          vehicleAssignments: Array.isArray(importedData.vehicleAssignments) ? importedData.vehicleAssignments : [],
          standardTasks: Array.isArray(importedData.standardTasks) ? importedData.standardTasks : defaultState.standardTasks,
          currentDate: new Date().toISOString().split('T')[0]
        };
        
        // 🔒 OPTIMISTIC LOCKING: Verificar antes de importar
        const localTimestamp = localStorage.getItem('server_timestamp');
        if (localTimestamp) {
          const { data: currentServerData, error: timestampError } = await supabase
            .from('planning_snapshots')
            .select('updated_at')
            .eq('id', 1)
            .single();
          
          if (!timestampError && currentServerData.updated_at !== localTimestamp) {
            // 🔄 NORMALIZAR TIMESTAMPS para comparación
            const normalizedLocalTimestamp = new Date(localTimestamp).getTime();
            const normalizedServerTimestamp = new Date(currentServerData.updated_at).getTime();
            const timeDifference = Math.abs(normalizedServerTimestamp - normalizedLocalTimestamp);
            
            if (timeDifference > 5000) { // 5 segundos de tolerancia
              showNotification(
                '❌ Error de sincronización durante importación: Otro usuario ha modificado los datos. Recarga la página primero.', 
                'error'
              );
              return;
            }
          }
        }
        
        setPlanning(cleanedImported);
        await supabase.from('planning_snapshots').upsert({ 
          id: 1, 
          data: cleanedImported, 
          updated_at: new Date() 
        });
        
        // 🔒 Actualizar timestamp después de importación
        const newTimestamp = new Date().toISOString();
        localStorage.setItem('server_timestamp', newTimestamp);
        
        showNotification("¡Datos importados y guardados correctamente!", "success");
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        showNotification("Importación Excel próximamente disponible", "warning");
      }
      
      setDbStatus('connected');
      setShowBackupModal(false);
    } catch (error) {
      console.error("Error importando datos:", error);
      showNotification("Error al importar el archivo", "error");
      setDbStatus('error');
    }
  };

  const handleAddFuel = () => {
      if(!editingWorker || !newFuelRecord.cost) return;
      const rec: FuelRecord = { id: `f-${Date.now()}`, workerId: editingWorker.id, date: newFuelRecord.date, liters: parseFloat(newFuelRecord.liters)||0, cost: parseFloat(newFuelRecord.cost), odometer: parseFloat(newFuelRecord.odometer)||0 };
      setPlanning(prev => ({...prev, fuelRecords: [...prev.fuelRecords, rec]}));
      setNewFuelRecord({ liters: '', cost: '', odometer: '', date: new Date().toISOString().split('T')[0] });
      showNotification("Repostaje guardado", "success");
  };
  const handleDeleteFuel = (id: string) => {
      setPlanning(prev => ({...prev, fuelRecords: prev.fuelRecords.filter(f => f.id !== id)}));
      showNotification("Repostaje eliminado", "success");
  };

  const handleOpenNewClientHandler = () => {
      setEditingClient({
          id: `c-${Date.now()}`,
          name: '',
          cif: '',
          logo: '?',
          phone: '',
          contactPerson: '',
          email: '',
          location: '',
          priority: 3,
          centers: [],
          regularTasks: [],
          requiredCourses: [],
          allowFreeTextTask: true
      });
  };

  const datesToShow = useMemo(() => {
      if(viewMode === 'day') return [planning.currentDate];
      const d = [];
      let c = new Date(rangeStartDate);
      const end = new Date(rangeEndDate);
      while(c <= end) { d.push(c.toISOString().split('T')[0]); c.setDate(c.getDate()+1); }
      return d;
  }, [viewMode, planning.currentDate, rangeStartDate, rangeEndDate]);

  // Función para limpiar datos antiguos incompatible con el nuevo formato
  const cleanupOldData = (data: PlanningState): PlanningState => {
    return {
      ...data,
      // Limpiar standardTasks - solo mantener los que tienen todos los campos requeridos
      standardTasks: (data.standardTasks || []).filter(task => 
        task.id && task.name && task.defaultWorkers && task.type && Array.isArray(task.assignedClientIds)
      ),
      // Limpiar regularTasks en clientes - solo mantener los que tienen estructura correcta
      clients: (data.clients || []).map(client => ({
        ...client,
        regularTasks: (client.regularTasks || []).filter(task => 
          task.id && task.name && task.defaultWorkers && task.category
        )
      })),
      // Limpiar courses - solo mantener los que tienen estructura correcta
      courses: (data.courses || []).filter(course => 
        course.id && course.name && Array.isArray(course.assignedWorkerIds)
      ),
      // Asegurar que los arrays críticos existan
      workers: data.workers || [],
      jobs: data.jobs || [],
      vehicles: data.vehicles || [],
      vehicleAssignments: data.vehicleAssignments || []
    };
  };

  const cleanedPlanning = useMemo(() => cleanupOldData(planning), [planning]);

  const filteredWorkersTable = useMemo(() => {
  let workers = cleanedPlanning.workers.filter(w => !showArchivedWorkers ? !w.isArchived : true);
  
  // Filtrar por búsqueda
  workers = workers.filter(w => w.name.toLowerCase().includes(workerTableSearch.toLowerCase()) || (w.apodo && w.apodo.toLowerCase().includes(workerTableSearch.toLowerCase())));
  
  // Filtrar por disponibilidad (libres/asignados)
  if (workerAvailabilityFilter !== 'all') {
    const todayJobs = cleanedPlanning.jobs.filter(job => job.date === cleanedPlanning.currentDate && !job.isCancelled);
    const assignedWorkerIds = new Set(todayJobs.flatMap(job => job.assignedWorkerIds));
    
    if (workerAvailabilityFilter === 'free') {
      workers = workers.filter(w => !assignedWorkerIds.has(w.id));
    } else if (workerAvailabilityFilter === 'assigned') {
      workers = workers.filter(w => assignedWorkerIds.has(w.id));
    }
  }
  
  // Filtrar por tipo de contrato
  if (workerContractFilter !== 'all') {
    if (workerContractFilter === 'fixedDiscontinuous') {
      workers = workers.filter(w => w.contractType === ContractType.FIJO_DISCONTINUO);
    } else {
      workers = workers.filter(w => w.contractType !== ContractType.FIJO_DISCONTINUO);
    }
  }
  
  // Filtrar por estado (múltiples estados)
  const activeStatusFilters = Object.keys(workerStatusFilter).filter(key => workerStatusFilter[key]);
  if (activeStatusFilters.length > 0) {
    workers = workers.filter(w => {
      // Usar el estado correcto según las fechas
      const correctStatus = getCorrectWorkerStatus(w);
      
      // Mapear las claves del filtro a los valores del enum
      const statusMapping: {[key: string]: string} = {
        'DISPONIBLE': 'Disponible',
        'VACACIONES': 'Vacaciones',
        'BAJA_MEDICA': 'Baja Médica',
        'BAJA_PATERNIDAD': 'Baja Paternidad'
      };
      return activeStatusFilters.some(filterKey => correctStatus === statusMapping[filterKey]);
    });
  } else {
    // Si no hay ningún filtro activo, no mostrar ningún operario
    workers = [];
  }
  
  return workers;
}, [cleanedPlanning.workers, workerTableSearch, showArchivedWorkers, workerAvailabilityFilter, workerContractFilter, workerStatusFilter, cleanedPlanning.jobs, cleanedPlanning.currentDate]);
  // Función para obtener las plantillas rápidas de un cliente (combinando regularTasks + standardTasks asignadas)
  const getClientQuickTemplates = (clientId: string) => {
    const client = cleanedPlanning.clients.find(c => c.id === clientId);
    if (!client) return [];

    // Plantillas originales del cliente (regularTasks) - con validación segura
    const regularTemplates = (client.regularTasks || []).filter(task => 
      task && task.id && task.name && task.defaultWorkers && task.category
    );

    // Plantillas de tareas estándar asignadas a este cliente - con validación segura
    const standardTemplates = cleanedPlanning.standardTasks
      .filter(task => {
        // Validar que la tarea tenga el formato nuevo
        if (!task || !task.id || !task.name || !task.defaultWorkers || !task.type) return false;
        
        // Validar que tenga assignedClientIds y que incluya este cliente
        const assignedIds = (task as any).assignedClientIds;
        return Array.isArray(assignedIds) && assignedIds.includes(clientId);
      })
      .map(task => ({
        id: `st-${task.id}`,
        name: task.name,
        defaultWorkers: task.defaultWorkers,
        category: task.type
      }));

    // Combinar ambas listas
    return [...regularTemplates, ...standardTemplates];
  };
  
  const loadExampleData = () => {
    const exampleState = {
      ...defaultState,
      workers: MOCK_WORKERS,
      clients: MOCK_CLIENTS,
      jobs: MOCK_JOBS,
      vehicles: MOCK_VEHICLES,
      standardTasks: MOCK_STANDARD_TASKS
    };
    setPlanning(exampleState);
    setDataRecoveryMode(false);
    showNotification("Datos de ejemplo cargados", "success");
  };

  const tryRecoverData = async () => {
    try {
      setDbStatus('loading');
      
      // Intentar recuperar de snapshots anteriores
      const { data: snapshots } = await supabase
        .from('planning_snapshots')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(10);
      
      if (snapshots && snapshots.length > 1) {
        // Buscar el snapshot más antiguo con datos reales
        for (const snapshot of snapshots) {
          if (snapshot.data && 
              snapshot.data.workers && snapshot.data.workers.length > 0 &&
              snapshot.data.clients && snapshot.data.clients.length > 0) {
            
            const mergedState = {
               ...snapshot.data,
               ...defaultState,
               workers: Array.isArray(snapshot.data.workers) ? snapshot.data.workers : defaultState.workers,
               clients: Array.isArray(snapshot.data.clients) ? snapshot.data.clients : defaultState.clients,
               jobs: Array.isArray(snapshot.data.jobs) ? snapshot.data.jobs : [],
               vehicles: Array.isArray(snapshot.data.vehicles) ? snapshot.data.vehicles : defaultState.vehicles,
               vehicleAssignments: Array.isArray(snapshot.data.vehicleAssignments) ? snapshot.data.vehicleAssignments : [],
               standardTasks: Array.isArray(snapshot.data.standardTasks) ? snapshot.data.standardTasks : defaultState.standardTasks,
               currentDate: new Date().toISOString().split('T')[0]
            };
            
            setPlanning(mergedState);
            setRemoteDataExists(true);
            setDataRecoveryMode(false);
            showNotification(`Datos recuperados del ${new Date(snapshot.updated_at).toLocaleString()}`, "success");
            setDbStatus('connected');
            return;
          }
        }
      }
      
      // Si no hay snapshots anteriores, intentar el actual
      const { data } = await supabase.from('planning_snapshots').select('data').eq('id', 1).single();
      
      if (data && data.data) {
        const remoteData = data.data;
        const mergedState = {
           ...remoteData,
           ...defaultState,
           workers: Array.isArray(remoteData.workers) ? remoteData.workers : defaultState.workers,
           clients: Array.isArray(remoteData.clients) ? remoteData.clients : defaultState.clients,
           jobs: Array.isArray(remoteData.jobs) ? remoteData.jobs : [],
           vehicles: Array.isArray(remoteData.vehicles) ? remoteData.vehicles : defaultState.vehicles,
           vehicleAssignments: Array.isArray(remoteData.vehicleAssignments) ? remoteData.vehicleAssignments : [],
           standardTasks: Array.isArray(remoteData.standardTasks) ? remoteData.standardTasks : defaultState.standardTasks,
           currentDate: new Date().toISOString().split('T')[0]
        };
        setPlanning(mergedState);
        setRemoteDataExists(true);
        setDataRecoveryMode(false);
        showNotification("Datos recuperados correctamente", "success");
      } else {
        showNotification("No se encontraron datos para recuperar", "error");
      }
      setDbStatus('connected');
    } catch (e) {
      console.error("Error recuperando datos:", e);
      showNotification("Error al recuperar datos", "error");
      setDbStatus('error');
    }
  };
  
  const advancedDataRecovery = async () => {
    try {
      setDbStatus('loading');
      showNotification("Buscando datos en todos los backups...", "info");
      
      let bestData = null;
      let bestSource = "";
      let bestDate = null;
      
      // 1. Buscar en snapshots históricos
      const { data: snapshots } = await supabase
        .from('planning_snapshots')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20);
      
      if (snapshots) {
        for (const snapshot of snapshots) {
          if (snapshot.data && 
              snapshot.data.workers && snapshot.data.workers.length > 5 &&
              snapshot.data.clients && snapshot.data.clients.length > 1) {
            
            bestData = snapshot.data;
            bestSource = `Snapshot del ${new Date(snapshot.updated_at).toLocaleString()}`;
            bestDate = snapshot.updated_at;
            break;
          }
        }
      }
      
      // 2. Buscar en tablas alternativas (si existen)
      if (!bestData) {
        try {
          const { data: backupData } = await supabase
            .from('planning_backup')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
          
          if (backupData && backupData.length > 0) {
            bestData = backupData[0].data;
            bestSource = `Backup del ${new Date(backupData[0].created_at).toLocaleString()}`;
            bestDate = backupData[0].created_at;
          }
        } catch (e) {
          console.log("No se encontró tabla de backup");
        }
      }
      
      // 3. Buscar en localStorage (último recurso)
      if (!bestData) {
        try {
          const localData = localStorage.getItem('planning_backup');
          if (localData) {
            const parsed = JSON.parse(localData);
            if (parsed.workers && parsed.workers.length > 0) {
              bestData = parsed;
              bestSource = "Local Storage del navegador";
              bestDate = new Date().toISOString();
            }
          }
        } catch (e) {
          console.log("No se encontró backup local");
        }
      }
      
      if (bestData) {
        const mergedState = {
           ...bestData,
           ...defaultState,
           workers: Array.isArray(bestData.workers) ? bestData.workers : defaultState.workers,
           clients: Array.isArray(bestData.clients) ? bestData.clients : defaultState.clients,
           jobs: Array.isArray(bestData.jobs) ? bestData.jobs : [],
           vehicles: Array.isArray(bestData.vehicles) ? bestData.vehicles : defaultState.vehicles,
           vehicleAssignments: Array.isArray(bestData.vehicleAssignments) ? bestData.vehicleAssignments : [],
           standardTasks: Array.isArray(bestData.standardTasks) ? bestData.standardTasks : defaultState.standardTasks,
           currentDate: new Date().toISOString().split('T')[0]
        };
        
        setPlanning(mergedState);
        setRemoteDataExists(true);
        setDataRecoveryMode(false);
        setAdvancedRecovery(false);
        showNotification(`¡DATOS RECUPERADOS! Fuente: ${bestSource}`, "success");
        
        // 🔒 OPTIMISTIC LOCKING: Verificar antes de restaurar
        const localTimestamp = localStorage.getItem('server_timestamp');
        if (localTimestamp) {
          const { data: currentServerData, error: timestampError } = await supabase
            .from('planning_snapshots')
            .select('updated_at')
            .eq('id', 1)
            .single();
          
          if (!timestampError && currentServerData.updated_at !== localTimestamp) {
            // 🔄 NORMALIZAR TIMESTAMPS para comparación
            const normalizedLocalTimestamp = new Date(localTimestamp).getTime();
            const normalizedServerTimestamp = new Date(currentServerData.updated_at).getTime();
            const timeDifference = Math.abs(normalizedServerTimestamp - normalizedLocalTimestamp);
            
            if (timeDifference > 5000) { // 5 segundos de tolerancia
              showNotification(
                '❌ Error de sincronización durante recuperación: Otro usuario ha modificado los datos. Recarga la página primero.', 
                'error'
              );
              return;
            }
          }
        }
        
        // Restaurar los datos recuperados a Supabase
        await supabase.from('planning_snapshots').upsert({ 
          id: 1, 
          data: mergedState, 
          updated_at: new Date() 
        });
        
        // 🔒 Actualizar timestamp después de recuperación
        const newTimestamp = new Date().toISOString();
        localStorage.setItem('server_timestamp', newTimestamp);
        
      } else {
        showNotification("No se encontraron datos en ningún backup", "error");
      }
      
      setDbStatus('connected');
    } catch (e) {
      console.error("Error en recuperación avanzada:", e);
      showNotification("Error en recuperación avanzada", "error");
      setDbStatus('error');
    }
  };
  
  const filteredTasks = useMemo(() => cleanedPlanning.standardTasks.filter(t => t.name.toLowerCase().includes(taskSearch.toLowerCase())), [cleanedPlanning.standardTasks, taskSearch]);
  const notifiedCount = (planning.notifications[planning.currentDate] || []).length;

  if (isAuthLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-blue-600" /></div>;
  if (!session) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-white overflow-hidden text-slate-900">
      <input type="file" ref={backupInputRef} className="hidden" accept=".json,.xlsx,.xls" onChange={importData} />
      
      {notification && (
        <div className={`fixed top-4 right-4 z-[1000] px-6 py-4 rounded-xl shadow-lg border max-w-md animate-in slide-in-from-right duration-200 ${
          notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-900' :
          notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-900' :
          notification.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-900' :
          'bg-blue-50 border-blue-200 text-blue-900'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-bold text-sm">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE RECUPERACIÓN DE DATOS */}
      {dataRecoveryMode && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[24px] p-6 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Database className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-black text-slate-900 mb-2">Recuperación de Datos</h2>
              <p className="text-sm text-slate-600 mb-4">
                No se encontraron datos guardados en la base de datos.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-800">
                  <strong>Importante:</strong> Tus datos anteriores deberían estar guardados en Supabase. 
                  Elige una opción para continuar.
                </p>
              </div>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={tryRecoverData}
                disabled={dbStatus === 'loading'}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-black text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {dbStatus === 'loading' ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Buscando datos...
                  </div>
                ) : (
                  "Intentar recuperar datos anteriores"
                )}
              </button>
              
              <button
                onClick={advancedDataRecovery}
                disabled={dbStatus === 'loading'}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-black text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {dbStatus === 'loading' ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Búsqueda avanzada...
                  </div>
                ) : (
                  "🔍 Búsqueda Avanzada (Todos los backups)"
                )}
              </button>
              
              <button
                onClick={loadExampleData}
                className="w-full py-3 bg-slate-100 text-slate-600 rounded-lg font-black text-sm hover:bg-slate-200 transition-colors"
              >
                Cargar datos de ejemplo
              </button>
              
              <button
                onClick={() => setDataRecoveryMode(false)}
                className="w-full py-3 bg-white border border-slate-200 text-slate-500 rounded-lg font-black text-sm hover:bg-slate-50 transition-colors"
              >
                Continuar con aplicación vacía
              </button>
            </div>
          </div>
        </div>
      )}

      <div 
        className={`fixed bottom-4 left-4 z-[400] px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border shadow-sm transition-all cursor-pointer ${
          dbStatus === 'connected' ? 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100' : 
          dbStatus === 'saving' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
          dbStatus === 'loading' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
          dbStatus === 'saved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
          'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
        }`}
        onClick={() => {
          if (dbStatus === 'connected' || dbStatus === 'error') {
            saveToSupabase(true); // Guardar manualmente con notificación de éxito
          }
        }}
        title={dbStatus === 'connected' || dbStatus === 'error' ? 'Clic para guardar manualmente' : undefined}
      >
         {dbStatus === 'connected' && <><Cloud className="w-3 h-3" /> {lastSavedTime ? `Guardado ${lastSavedTime.toLocaleTimeString()}` : 'Conectado'}</>}
         {dbStatus === 'saving' && <><RotateCcw className="w-3 h-3 animate-spin" /> Guardando...</>}
         {dbStatus === 'loading' && <><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</>}
         {dbStatus === 'saved' && <><CheckCircle2 className="w-3 h-3" /> Guardado</>}
         {dbStatus === 'error' && <><CloudOff className="w-3 h-3" /> Sin conexión (Clic para reintentar)</>}
      </div>

      {/* Indicador de Backup Automático - Arriba */}
      {autoBackupEnabled && (
        <div className="fixed bottom-16 left-4 z-[400] px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border shadow-sm transition-all bg-amber-50 text-amber-600 border-amber-100">
          <DownloadCloud className="w-3 h-3" />
          {lastAutoBackupTime ? `Auto ${lastAutoBackupTime.toLocaleTimeString()}` : 'Auto activo'}
        </div>
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside className="w-20 bg-slate-900 flex flex-col items-center py-8 gap-8 shrink-0 z-50 shadow-2xl">
         <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/50 mb-4 cursor-default"><LayoutGrid className="w-6 h-6 text-white" /></div>
         <nav className="flex-1 flex flex-col gap-4 w-full px-3">
            <button onClick={() => setView('planning')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'planning' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Planificación"><CalendarIcon className="w-6 h-6" /></button>
            <button onClick={() => setView('compact')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'compact' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Vista Compacta"><Table className="w-6 h-6" /></button>
            <button onClick={() => setShowSSReport(true)} className="p-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-all flex justify-center" title="Reporte SS"><ListTodo className="w-6 h-6" /></button>
            <button onClick={() => setView('workers')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'workers' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Gestión Operarios"><Users className="w-6 h-6" /></button>
            <button onClick={() => setView('clients')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'clients' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Gestión Clientes"><Building2 className="w-6 h-6" /></button>
            <button onClick={() => setView('databases')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'databases' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Bases de Datos"><Database className="w-6 h-6" /></button>
            <button onClick={() => setView('fleet')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'fleet' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Gestión de Flota"><Car className="w-6 h-6" /></button>
            <button onClick={() => setView('stats')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'stats' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Estadísticas"><BarChart3 className="w-6 h-6" /></button>
            <button onClick={() => setShowBackupModal(true)} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'backup' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Copias de Seguridad"><DownloadCloud className="w-4 h-4" /></button>
            <button onClick={exportBackup} className="p-3 rounded-xl transition-all flex justify-center text-slate-400 hover:bg-slate-800 hover:text-white" title="Backup Rápido"><Download className="w-4 h-4" /></button>
         </nav>
      </aside>

      <div className="flex-1 flex overflow-hidden relative">
         {(view === 'planning' || view === 'fleet') && (
           <WorkerSidebar 
             workers={planning.workers} 
             planning={planning}
             selectedWorkerId={selectedWorkerId}
             onSelectWorker={setSelectedWorkerId}
             onUpdateWorkerStatus={handleUpdateWorkerStatus}
             onDragStart={handleDragStart}
             getCorrectWorkerStatus={getCorrectWorkerStatus}
           />
         )}

         {view === 'planning' && (
             <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
                <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 z-20 shadow-sm">
                   <div className="flex items-center gap-4">
                      <h1 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">Planificación</h1>
                      <div className="flex p-1 bg-slate-100 rounded-xl">
                          <button onClick={() => setViewMode('day')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Diaria</button>
                          <button onClick={() => setViewMode('range')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'range' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Multi-día</button>
                      </div>
                      {viewMode === 'day' ? (
                          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                            <button onClick={() => shiftDate(-1)} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
                            <button onClick={() => setShowCalendarSelector(true)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm text-xs font-black uppercase tracking-widest text-slate-700 hover:text-blue-600 transition-colors"><CalendarDays className="w-4 h-4 text-blue-500" />{formatDateDisplay(planning.currentDate)}</button>
                            <button onClick={() => shiftDate(1)} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500"><ChevronRight className="w-4 h-4" /></button>
                          </div>
                      ) : (
                          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                             <div className="flex items-center gap-1 px-3 py-2 bg-white rounded-lg shadow-sm">
                                <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none uppercase" value={rangeStartDate} onChange={(e) => { setRangeStartDate(e.target.value); if(e.target.value > rangeEndDate) setRangeEndDate(e.target.value); }} />
                                <span className="text-slate-300 mx-1">-</span>
                                <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none uppercase" value={rangeEndDate} onChange={(e) => setRangeEndDate(e.target.value)} min={rangeStartDate} />
                             </div>
                          </div>
                      )}
                      <button onClick={goToToday} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors">Hoy</button>
                   </div>
                   <div className="flex items-center gap-3">
                      <button onClick={() => setShowNotificationsModal(true)} className="relative p-3 bg-slate-50 rounded-xl hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                         <MessageCircle className="w-5 h-5" />
                         {notifiedCount > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></span>}
                      </button>
                   </div>
                </header>
                <PlanningBoard planning={planning} datesToShow={datesToShow} onDropWorker={handleAssignWorker} onRemoveWorker={handleRemoveWorker} onAddJob={handleOpenNewJob} onEditJob={setEditingJob} onDuplicateJob={handleOpenDuplicate} onShowWorkerList={handleShowWorkerList} onDragStartFromBoard={(wId) => setDraggedWorkerId(wId)} onReorderJob={handleReorderJobs} onReorderClient={handleReorderClients} onEditNote={handleOpenNote} onUpdateJobReinforcementGroups={handleUpdateJobReinforcementGroups} draggedWorkerId={draggedWorkerId} />
             </div>
         )}
         {view === 'compact' && <CompactPlanningView planning={planning} />}
         
         {view === 'fleet' && (
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
               <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 z-20 shadow-sm">
                   <div className="flex items-center gap-4">
                      <h1 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">Flota</h1>
                      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => shiftDate(-1)} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
                        <button onClick={() => setShowCalendarSelector(true)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm text-xs font-black uppercase tracking-widest text-slate-700 hover:text-blue-600 transition-colors"><CalendarDays className="w-4 h-4 text-blue-500" />{formatDateDisplay(planning.currentDate)}</button>
                        <button onClick={() => shiftDate(1)} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500"><ChevronRight className="w-4 h-4" /></button>
                      </div>
                      <button onClick={goToToday} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors">Hoy</button>
                   </div>
               </header>
               <FleetManager 
                  planning={planning}
                  onAddVehicle={handleAddVehicle}
                  onEditVehicle={handleEditVehicle}
                  onDeleteVehicle={handleDeleteVehicle}
                  onAssignWorker={handleAssignVehicle}
                  onRemoveAssignment={handleRemoveAssignment}
                  draggedWorkerId={draggedWorkerId}
               />
            </div>
         )}

         {view === 'workers' && (
           <div className="flex-1 bg-slate-50 overflow-y-auto p-8 custom-scrollbar">
             <div className="flex items-center justify-between mb-8">
               <h2 className="text-2xl font-black text-slate-900 italic uppercase">Gestión de Operarios</h2>
               <div className="flex items-center gap-3">
                 <button 
                   onClick={handleCheckWorkerStatuses}
                   className="bg-amber-600 text-white px-6 py-4 rounded-[24px] font-black text-[12px] uppercase tracking-widest flex items-center gap-2 hover:bg-amber-700 transition-colors"
                   title="Verificar y actualizar estados automáticamente"
                 >
                   <CheckCircle2 className="w-4 h-4" />
                   Verificar Estados
                 </button>
                 <button onClick={handleOpenNewWorker} className="bg-slate-900 text-white px-6 py-4 rounded-[24px] font-black text-[12px] uppercase tracking-widest">+ Nuevo Operario</button>
               </div>
             </div>
             <div className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <Search className="w-5 h-5 text-slate-400" />
                  <input type="text" placeholder="Buscar operario..." className="flex-1 bg-transparent text-sm font-bold outline-none" value={workerTableSearch} onChange={(e) => setWorkerTableSearch(e.target.value)} />
                </div>
                
                <div className="flex items-center gap-6 border-t border-slate-100 pt-4">
                  {/* Filtro de Disponibilidad */}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Disponibilidad</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setWorkerAvailabilityFilter('all')}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-colors ${
                          workerAvailabilityFilter === 'all' 
                            ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                            : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        Todos
                      </button>
                      <button
                        onClick={() => setWorkerAvailabilityFilter('free')}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-colors ${
                          workerAvailabilityFilter === 'free' 
                            ? 'bg-green-100 text-green-700 border border-green-200' 
                            : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        Libres
                      </button>
                      <button
                        onClick={() => setWorkerAvailabilityFilter('assigned')}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-colors ${
                          workerAvailabilityFilter === 'assigned' 
                            ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                            : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        Asignados
                      </button>
                    </div>
                  </div>

                  {/* Filtro de Contrato */}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrato</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setWorkerContractFilter('all')}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-colors ${
                          workerContractFilter === 'all' 
                            ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                            : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        Todos
                      </button>
                      <button
                        onClick={() => setWorkerContractFilter('fixedDiscontinuous')}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-colors ${
                          workerContractFilter === 'fixedDiscontinuous' 
                            ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                            : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        Fijos Discontinuos
                      </button>
                      <button
                        onClick={() => setWorkerContractFilter('others')}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-colors ${
                          workerContractFilter === 'others' 
                            ? 'bg-slate-100 text-slate-700 border border-slate-200' 
                            : 'bg-white text-slate-400 border border-slate-200'
                        }`}
                      >
                        Resto
                      </button>
                    </div>
                  </div>

                  {/* Filtro de Estado */}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</span>
                    <button
                      onClick={() => {
                        const allActive = Object.values(workerStatusFilter).every(v => v);
                        if (allActive) {
                          // Si todos están activos, desactivar todos
                          setWorkerStatusFilter({
                            'DISPONIBLE': false,
                            'VACACIONES': false,
                            'BAJA_MEDICA': false,
                            'BAJA_PATERNIDAD': false
                          });
                        } else {
                          // Si no todos están activos, activar todos
                          setWorkerStatusFilter({
                            'DISPONIBLE': true,
                            'VACACIONES': true,
                            'BAJA_MEDICA': true,
                            'BAJA_PATERNIDAD': true
                          });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        Object.values(workerStatusFilter).every(v => v) 
                          ? 'bg-slate-900 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => {
                        const allActive = Object.values(workerStatusFilter).every(v => v);
                        setWorkerStatusFilter((prev: Record<string, boolean>) => ({
                          ...prev, 
                          'DISPONIBLE': !prev['DISPONIBLE'],
                          // Si todos estaban activos, desactivar los demás al cambiar este
                          ...(allActive ? {
                            'VACACIONES': false,
                            'BAJA_MEDICA': false,
                            'BAJA_PATERNIDAD': false
                          } : {})
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        workerStatusFilter['DISPONIBLE'] 
                          ? 'bg-green-500 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Disponible
                    </button>
                    <button
                      onClick={() => {
                        const allActive = Object.values(workerStatusFilter).every(v => v);
                        setWorkerStatusFilter((prev: Record<string, boolean>) => ({
                          ...prev, 
                          'VACACIONES': !prev['VACACIONES'],
                          // Si todos estaban activos, desactivar los demás al cambiar este
                          ...(allActive ? {
                            'DISPONIBLE': false,
                            'BAJA_MEDICA': false,
                            'BAJA_PATERNIDAD': false
                          } : {})
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        workerStatusFilter['VACACIONES'] 
                          ? 'bg-amber-500 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Vacaciones
                    </button>
                    <button
                      onClick={() => {
                        const allActive = Object.values(workerStatusFilter).every(v => v);
                        setWorkerStatusFilter((prev: Record<string, boolean>) => ({
                          ...prev, 
                          'BAJA_MEDICA': !prev['BAJA_MEDICA'],
                          // Si todos estaban activos, desactivar los demás al cambiar este
                          ...(allActive ? {
                            'DISPONIBLE': false,
                            'VACACIONES': false,
                            'BAJA_PATERNIDAD': false
                          } : {})
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        workerStatusFilter['BAJA_MEDICA'] 
                          ? 'bg-red-500 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Baja Médica
                    </button>
                    <button
                      onClick={() => {
                        const allActive = Object.values(workerStatusFilter).every(v => v);
                        setWorkerStatusFilter((prev: Record<string, boolean>) => ({
                          ...prev, 
                          'BAJA_PATERNIDAD': !prev['BAJA_PATERNIDAD'],
                          // Si todos estaban activos, desactivar los demás al cambiar este
                          ...(allActive ? {
                            'DISPONIBLE': false,
                            'VACACIONES': false,
                            'BAJA_MEDICA': false
                          } : {})
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        workerStatusFilter['BAJA_PATERNIDAD'] 
                          ? 'bg-purple-500 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Baja Paternidad
                    </button>
                  </div>

                  {/* Filtro de Archivados */}
                  <div className="flex items-center gap-3 border-l border-slate-100 pl-6">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Archivados</span>
                    <button 
                      onClick={() => setShowArchivedWorkers(!showArchivedWorkers)} 
                      className={`w-10 h-6 rounded-full p-1 transition-colors ${showArchivedWorkers ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showArchivedWorkers ? 'translate-x-4' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
             <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
               <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                   <tr>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest w-24">Código</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest w-60">Nombre</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest w-80">Apellidos</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest w-24">DNI</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest w-24">Teléfono</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Vehículo</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Estado</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest w-40">Cambio Estado</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest w-40">Hasta</th>
                     <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Editar</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {filteredWorkersTable.map(w => {
                     let codeClass = '';
                     if (w.contractType === ContractType.INDEFINIDO) {
                        codeClass = 'bg-slate-900 text-white border-slate-900 shadow-sm'; 
                     } else if (w.contractType === ContractType.AUTONOMO || w.contractType === ContractType.AUTONOMA_COLABORADORA) {
                        codeClass = 'bg-blue-50 text-blue-600 border-blue-100';
                     } else {
                        codeClass = 'bg-red-50 text-red-600 border-red-100';
                     }

                     return (
                     <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3">
                           <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[10px] border ${codeClass}`}>
                              {w.code}
                           </div>
                        </td>
                        <td className="px-6 py-3">
                           <p className="font-black text-slate-900 text-sm">
                             {w.firstName || w.name?.split(' ')[0] || w.name}
                           </p>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{w.role}</p>
                        </td>
                        <td className="px-6 py-3">
                           <p className="font-black text-slate-900 text-sm">
                             {w.lastName || (() => {
                               const parts = w.name?.split(' ');
                               return parts && parts.length > 1 ? parts.slice(1).join(' ') : '';
                             })() || '-'}
                           </p>
                        </td>
                        <td className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">{w.dni}</td>
                        <td className="px-6 py-3 text-xs font-bold text-slate-500">{w.phone}</td>
                        <td className="px-6 py-3 text-center">
                           {w.hasVehicle ? <Car className="w-4 h-4 text-green-500 mx-auto" /> : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-6 py-3">
                           <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                              (() => {
                                const correctStatus = getCorrectWorkerStatus(w);
                                return correctStatus === WorkerStatus.DISPONIBLE ? 'bg-green-100 text-green-700' : 
                                       correctStatus.includes('Baja') ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
                              })()
                           }`}>
                              {getCorrectWorkerStatus(w)}
                           </span>
                        </td>
                        <td className="px-6 py-3 text-xs font-bold text-slate-600">
                           {(() => {
                             const nextChange = getNextStatusChange(w);
                             if (!nextChange) {
                               return <span className="text-slate-300">Sin cambios</span>;
                             }
                             
                             const statusColor = nextChange.status === WorkerStatus.DISPONIBLE ? 'text-green-600' :
                                              nextChange.status.includes('Baja') ? 'text-red-600' : 'text-amber-600';
                             
                             return (
                               <div className="flex flex-col">
                                 <span className="text-slate-700">{formatDateDMY(nextChange.date)}</span>
                                 <span className={`text-[9px] uppercase ${statusColor}`}>{nextChange.status}</span>
                               </div>
                             );
                           })()}
                        </td>
                        <td className="px-6 py-3 text-xs font-bold text-slate-600">
                           {(() => {
                             const currentStatus = getCurrentWorkerStatus(w);
                             
                             // Si está disponible, mostrar el próximo registro futuro
                             if (currentStatus.status === WorkerStatus.DISPONIBLE) {
                               const today = new Date().toISOString().split('T')[0];
                               const futureRecords = w.statusRecords?.filter(record => 
                                 new Date(record.startDate) > new Date(today)
                               ).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
                               
                               if (futureRecords && futureRecords.length > 0) {
                                 const nextRecord = futureRecords[0];
                                 return nextRecord.endDate ? formatDateDMY(nextRecord.endDate) : <span className="text-red-600 font-black">IND.</span>;
                               }
                               
                               return <span className="text-slate-300">-</span>;
                             }
                             
                             // Si está en estado no disponible, mostrar la fecha fin del registro actual
                             if (currentStatus.endDate) {
                               return formatDateDMY(currentStatus.endDate);
                             }
                             
                             return <span className="text-red-600 font-black">IND.</span>;
                           })()}
                        </td>
                        <td className="px-6 py-3 text-right">
                           <button onClick={() => setEditingWorker(w)} className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-xl transition-colors">
                              <Edit2 className="w-4 h-4" />
                           </button>
                        </td>
                     </tr>
                   )})}
                 </tbody>
               </table>
             </div>
           </div>
         )}
         {view === 'clients' && (
           <div className="flex-1 bg-slate-50 overflow-y-auto p-8 custom-scrollbar">
             <div className="flex items-center justify-between mb-8">
               <h2 className="text-2xl font-black text-slate-900 italic uppercase">Gestión de Clientes</h2>
               <button onClick={handleOpenNewClientHandler} className="bg-slate-900 text-white px-6 py-4 rounded-[24px] font-black text-[12px] uppercase tracking-widest">+ Nuevo Cliente</button>
             </div>
             <div className="grid grid-cols-4 gap-4">
               {planning.clients.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                 <div key={c.id} onClick={() => setEditingClient(c)} className="bg-white p-4 rounded-2xl border border-slate-100 hover:shadow-md transition-all cursor-pointer">
                    <h3 className="font-black text-slate-900">{c.name}</h3>
                    <p className="text-xs text-slate-400 uppercase font-bold">{c.location}</p>
                 </div>
               ))}
             </div>
           </div>
         )}
         {view === 'databases' && (
            <div className="flex-1 bg-slate-50 overflow-y-auto p-8 custom-scrollbar">
               <h2 className="text-2xl font-black text-slate-900 italic uppercase mb-8">Bases de Datos</h2>
               <div className="flex gap-4 mb-4">
                  <button onClick={() => setDbTab('tasks')} className={`px-4 py-2 rounded-xl font-bold text-xs uppercase ${dbTab==='tasks'?'bg-blue-600 text-white':'bg-white text-slate-500'}`}>Tareas</button>
                  <button onClick={() => setDbTab('courses')} className={`px-4 py-2 rounded-xl font-bold text-xs uppercase ${dbTab==='courses'?'bg-blue-600 text-white':'bg-white text-slate-500'}`}>Cursos</button>
               </div>
               {dbTab === 'tasks' && (
                 <div>
                    <button onClick={handleOpenNewStandardTask} className="mb-4 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase">Nueva Tarea</button>
                    <div className="space-y-2">
                      {filteredTasks.map(t => (
                        <div key={t.id} onClick={() => setEditingStandardTask(t)} className="bg-white p-4 rounded-xl border border-slate-200 cursor-pointer hover:border-blue-400 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h3 className="font-black text-slate-900 mb-1">{t.name}</h3>
                              <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-black uppercase">
                                  {(t as any).type || 'Sin tipo'}
                                </span>
                                <span className="font-black">{t.defaultWorkers} operarios</span>
                              </div>
                              {t.notes && <p className="text-xs text-slate-400 mt-2 line-clamp-2">{t.notes}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className="text-xs text-slate-400">
                                {(t as any).assignedClientIds?.length || 0} cliente{(t as any).assignedClientIds?.length !== 1 ? 's' : ''}
                              </span>
                              {(t as any).assignedClientIds && (t as any).assignedClientIds.length > 0 && (
                                <div className="flex flex-wrap gap-1 max-w-32">
                                  {(t as any).assignedClientIds.slice(0, 2).map((clientId: string) => {
                                    const client = planning.clients.find(c => c.id === clientId);
                                    return client ? (
                                      <span key={clientId} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-black">
                                        {client.name.split(' ')[0]}
                                      </span>
                                    ) : null;
                                  })}
                                  {(t as any).assignedClientIds.length > 2 && (
                                    <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-black">
                                      +{(t as any).assignedClientIds.length - 2}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>
               )}
               {dbTab === 'courses' && (
                 <div>
                    <div className="flex gap-2 mb-4">
                      <input 
                        className="p-2 rounded-xl border" 
                        placeholder="Nuevo curso" 
                        value={newCourseName} 
                        onChange={e=>setNewCourseName(e.target.value)} 
                      />
                      <button 
                        onClick={handleAddGlobalCourse} 
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-xs"
                      >
                        Añadir
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {planning.courses.map(course => (
                        <div key={course.id} className="bg-white p-4 rounded-xl border border-slate-200">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h3 className="font-bold text-lg text-slate-900">{course.name}</h3>
                              {course.description && (
                                <p className="text-sm text-slate-600 mt-1">{course.description}</p>
                              )}
                              <div className="flex items-center gap-4 mt-2">
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">
                                  Validez: {course.validityMonths || 12} meses
                                </span>
                                <span className="text-xs text-slate-500">
                                  {course.assignedWorkerIds.length} operarios asignados
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingCourse(course)}
                                className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-600"
                                title="Editar curso"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setItemToDelete({ id: course.id, type: 'course', name: course.name })}
                                className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500"
                                title="Eliminar curso"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Operarios asignados */}
                          <div className="border-t pt-3">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-slate-700 uppercase">Operarios con este curso</span>
                              <button
                                onClick={() => setEditingCourse(course)}
                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700"
                              >
                                Gestionar
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {course.assignedWorkerIds.length > 0 ? (
                                course.assignedWorkerIds.map(workerId => {
                                  const worker = planning.workers.find(w => w.id === workerId);
                                  return worker ? (
                                    <span key={workerId} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg">
                                      {worker.name}
                                    </span>
                                  ) : null;
                                })
                              ) : (
                                <span className="text-xs text-slate-400 italic">No hay operarios asignados</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {planning.courses.length === 0 && (
                        <div className="text-center py-8 text-slate-400">
                          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p className="font-bold uppercase text-xs tracking-widest">No hay cursos registrados</p>
                        </div>
                      )}
                    </div>
                 </div>
               )}
            </div>
         )}
         {view === 'stats' && <StatisticsPanel planning={cleanedPlanning} />}
      </div>

      {showBackupModal && (
         <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowBackupModal(false)}>
            <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
               <h3 className="text-lg font-black text-slate-900 italic uppercase mb-4">COPIAS DE SEGURIDAD</h3>
               <div className="space-y-3">
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-amber-800 uppercase tracking-wider">Backup Automático</span>
                        <button
                           onClick={() => setAutoBackupEnabled(!autoBackupEnabled)}
                           className={`w-12 h-6 rounded-full transition-colors ${
                              autoBackupEnabled ? 'bg-amber-500' : 'bg-amber-200'
                           }`}
                        >
                           <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                              autoBackupEnabled ? 'translate-x-6' : 'translate-x-0.5'
                           }`} />
                        </button>
                     </div>
                     <p className="text-[10px] text-amber-700">
                        {autoBackupEnabled 
                           ? '✅ Activo: Cada hora + al cerrar página' 
                           : '❌ Inactivo: Sin backups automáticos'
                        }
                     </p>
                  </div>
                  
                  <button onClick={exportBackup} className="w-full py-4 bg-blue-50 rounded-2xl font-black text-xs uppercase tracking-widest text-blue-600 hover:bg-blue-100 flex items-center justify-center gap-2 transition-colors"><DownloadCloud className="w-4 h-4" /> Exportar Backup COMPLETO</button>
                  <button onClick={exportDatabaseToExcel} className="w-full py-4 bg-green-50 rounded-2xl font-black text-xs uppercase tracking-widest text-green-600 hover:bg-green-100 flex items-center justify-center gap-2 transition-colors"><FileSpreadsheet className="w-4 h-4" /> Exportar Todo a Excel</button>
                  
                  <button onClick={() => backupInputRef.current?.click()} className="w-full py-4 bg-slate-100 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 hover:bg-slate-200 flex items-center justify-center gap-2 transition-colors"><Upload className="w-4 h-4" /> Importar Excel / JSON</button>
               </div>
            </div>
         </div>
      )}

      {showSSReport && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowSSReport(false)}>
           <div className="bg-white w-full max-w-4xl rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
              
              <div className="flex justify-between items-start mb-8 shrink-0">
                 <div>
                    <h2 className="text-3xl font-[900] text-slate-900 italic uppercase tracking-tighter mb-2">Previsión Seguridad Social</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                       Comparativa: <span className="text-slate-900">{formatDateDisplay(ssReport.prevDate)}</span> <ArrowRight className="w-3 h-3 inline mx-1" /> <span className="text-blue-600">{formatDateDisplay(planning.currentDate)}</span>
                    </p>
                 </div>
                 <button onClick={() => setShowSSReport(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
              </div>

              <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden">
                 <div className="bg-green-50/50 rounded-[32px] p-6 border border-green-100 flex flex-col h-full overflow-hidden relative group">
                    <div className="flex items-center justify-between mb-6 shrink-0">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-green-200">
                             <TrendingUp className="w-5 h-5" />
                          </div>
                          <div>
                             <h3 className="text-lg font-black text-green-900 uppercase">Altas</h3>
                             <span className="text-[10px] font-black bg-white px-2 py-1 rounded text-green-600 border border-green-200">{ssReport.altas.length} Operarios</span>
                          </div>
                       </div>
                       <button onClick={() => handleCopyList(ssReport.altas, 'altas')} className="p-2 bg-white hover:bg-green-100 text-green-600 rounded-xl transition-colors shadow-sm" title="Copiar lista"><Copy className="w-4 h-4" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                       {ssReport.altas.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-green-300 opacity-50">
                             <CheckCircle2 className="w-12 h-12 mb-2" />
                             <p className="text-xs font-black uppercase">Sin altas previstas</p>
                          </div>
                       ) : (
                          ssReport.altas.map(w => (
                             <div key={w.id} className="bg-white p-3 rounded-xl border border-green-100 shadow-sm flex justify-between items-center">
                                <div>
                                   <p className="font-black text-slate-700 text-sm">{getWorkerSSFormat(w)}</p>
                                </div>
                                <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded">{w.code}</span>
                             </div>
                          ))
                       )}
                    </div>
                 </div>

                 <div className="bg-red-50/50 rounded-[32px] p-6 border border-red-100 flex flex-col h-full overflow-hidden relative group">
                    <div className="flex items-center justify-between mb-6 shrink-0">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-red-200">
                             <TrendingUp className="w-5 h-5 transform rotate-180" />
                          </div>
                          <div>
                             <h3 className="text-lg font-black text-red-900 uppercase">Bajas</h3>
                             <span className="text-[10px] font-black bg-white px-2 py-1 rounded text-red-600 border border-red-200">{ssReport.bajas.length} Operarios</span>
                          </div>
                       </div>
                       <button onClick={() => handleCopyList(ssReport.bajas, 'bajas')} className="p-2 bg-white hover:bg-red-100 text-red-600 rounded-xl transition-colors shadow-sm" title="Copiar lista"><Copy className="w-4 h-4" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                       {ssReport.bajas.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-red-300 opacity-50">
                             <CheckCircle2 className="w-12 h-12 mb-2" />
                             <p className="text-xs font-black uppercase">Sin bajas previstas</p>
                          </div>
                       ) : (
                          ssReport.bajas.map(w => (
                             <div key={w.id} className="bg-white p-3 rounded-xl border border-red-100 shadow-sm flex justify-between items-center">
                                <div>
                                   <p className="font-black text-slate-700 text-sm">{getWorkerSSFormat(w)}</p>
                                </div>
                                <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-1 rounded">{w.code}</span>
                             </div>
                          ))
                       )}
                    </div>
                 </div>
              </div>

           </div>
        </div>
      )}
      
      {editingJob && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditingJob(null)}>
           <div className="bg-white w-full max-w-2xl rounded-[40px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
              
              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4">
                 <div>
                    <h2 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">Gestión de Servicio</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Planificación y Recursos</p>
                 </div>
                 <button onClick={() => setEditingJob(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
              </div>

              <div className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Cliente</label>
                       <div className="relative">
                          <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <select 
                             className="w-full bg-slate-50 border-none rounded-xl pl-12 pr-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                             value={editingJob.clientId}
                             onChange={e => {
                                const client = planning.clients.find(c => c.id === e.target.value);
                                setEditingJob({
                                   ...editingJob, 
                                   clientId: e.target.value,
                                   centerId: client?.centers[0]?.id || '' 
                                });
                             }}
                          >
                             <option value="">Seleccionar Cliente</option>
                             {planning.clients.sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                       </div>
                    </div>

                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Sede / Centro</label>
                       <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <select 
                             className="w-full bg-slate-50 border-none rounded-xl pl-12 pr-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                             value={editingJob.centerId}
                             onChange={e => setEditingJob({...editingJob, centerId: e.target.value})}
                             disabled={!editingJob.clientId}
                          >
                             <option value="">Seleccionar Sede</option>
                             {planning.clients.find(c => c.id === editingJob.clientId)?.centers.map(ct => (
                                <option key={ct.id} value={ct.id}>{ct.name}</option>
                             ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                       </div>
                    </div>
                 </div>

                 {editingJob.clientId && getClientQuickTemplates(editingJob.clientId)?.length ? (
                    <div className="animate-in fade-in slide-in-from-top-2">
                       <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Plantillas Rápidas</label>
                       </div>
                       <div className="flex flex-wrap gap-2">
                          {getClientQuickTemplates(editingJob.clientId).map(task => (
                             <button
                                key={task.id}
                                onClick={() => setEditingJob({
                                   ...editingJob,
                                   type: task.category,
                                   customName: task.name,
                                   requiredWorkers: task.defaultWorkers
                                })}
                                className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase tracking-wide transition-all shadow-sm flex items-center gap-1.5"
                             >
                                <span>{task.name}</span>
                                <span className="bg-white px-1.5 rounded-md text-[9px] font-black text-amber-500">{task.defaultWorkers} Ops</span>
                             </button>
                          ))}
                       </div>
                    </div>
                 ) : null}

                 <div className="bg-slate-50/50 rounded-2xl p-1 border border-slate-100">
                    <div className="grid grid-cols-3 gap-2">
                       <div className="space-y-1 p-2 bg-white rounded-xl shadow-sm border border-slate-50">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha</label>
                          <input 
                             type="date" 
                             className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-700 focus:ring-0 outline-none"
                             value={editingJob.date}
                             onChange={e => setEditingJob({...editingJob, date: e.target.value})}
                          />
                       </div>
                       <div className="space-y-1 p-2 bg-white rounded-xl shadow-sm border border-slate-50">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Inicio</label>
                          <input 
                             type="time" 
                             className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-700 focus:ring-0 outline-none"
                             value={editingJob.startTime}
                             onChange={e => setEditingJob({...editingJob, startTime: e.target.value})}
                          />
                       </div>
                       <div className="space-y-1 p-2 bg-white rounded-xl shadow-sm border border-slate-50">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Fin</label>
                          <input 
                             type="time" 
                             className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-700 focus:ring-0 outline-none"
                             value={editingJob.endTime}
                             onChange={e => setEditingJob({...editingJob, endTime: e.target.value})}
                          />
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tipo de Servicio</label>
                       <div className="relative">
                          <select 
                             className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                             value={editingJob.type}
                             onChange={e => setEditingJob({...editingJob, type: e.target.value as JobType})}
                          >
                             {Object.values(JobType).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Dotación (Nº Operarios)</label>
                       <div className="flex items-center gap-3">
                          <button 
                             onClick={() => setEditingJob({...editingJob, requiredWorkers: Math.max(1, editingJob.requiredWorkers - 1)})}
                             className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                          >
                             <ChevronLeft className="w-5 h-5" />
                          </button>
                          <div className="flex-1 bg-slate-50 rounded-xl flex items-center justify-center font-black text-xl text-slate-800 h-10 border border-slate-100">
                             {editingJob.requiredWorkers}
                          </div>
                          <button 
                             onClick={() => setEditingJob({...editingJob, requiredWorkers: editingJob.requiredWorkers + 1})}
                             className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                          >
                             <ChevronRight className="w-5 h-5" />
                          </button>
                       </div>
                    </div>
                 </div>

                 <div className="bg-slate-50 rounded-2xl p-5 space-y-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center gap-2">
                          <ClipboardList className="w-4 h-4 text-blue-500" />
                          <h3 className="text-xs font-black text-slate-700 uppercase">Detalles Operativos</h3>
                       </div>
                       {editingJob.id && (
                          <div className="flex gap-2">
                             <button 
                                onClick={() => setEditingJob({...editingJob, isFinished: !editingJob.isFinished, isCancelled: false})}
                                className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-colors border ${editingJob.isFinished ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-slate-400 border-slate-200'}`}
                             >
                                Finalizada
                             </button>
                             <button 
                                onClick={() => setEditingJob({...editingJob, isCancelled: !editingJob.isCancelled, isFinished: false})}
                                className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-colors border ${editingJob.isCancelled ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-slate-400 border-slate-200'}`}
                             >
                                Anulada
                             </button>
                          </div>
                       )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div className="relative">
                          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                          <input 
                             placeholder="Referencia" 
                             className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none"
                             value={editingJob.ref || ''}
                             onChange={e => setEditingJob({...editingJob, ref: e.target.value})}
                          />
                       </div>
                       <div className="relative">
                          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                          <input 
                             placeholder="Albarán" 
                             className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none"
                             value={editingJob.deliveryNote || ''}
                             onChange={e => setEditingJob({...editingJob, deliveryNote: e.target.value})}
                          />
                       </div>
                    </div>
                    
                    <div className="relative">
                       <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                       <input 
                          placeholder="Ubicación exacta (Muelle, Puerta, Nave...)" 
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none"
                          value={editingJob.locationDetails || ''}
                          onChange={e => setEditingJob({...editingJob, locationDetails: e.target.value})}
                       />
                    </div>

                    <div className="relative">
                       <Edit2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                       <input 
                          type="text"
                          placeholder="Nombre personalizado de la tarea (Opcional)" 
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none"
                          value={editingJob.customName || ''}
                          onChange={e => setEditingJob({...editingJob, customName: e.target.value})}
                       />
                    </div>
                 </div>

                 <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-2">
                    {editingJob.id ? (
                        <button 
                           onClick={() => setItemToDelete({ id: editingJob.id, type: 'job', name: 'esta tarea' })}
                           className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-red-500 hover:bg-red-50 transition-colors text-xs uppercase tracking-widest group"
                        >
                           <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" /> Eliminar
                        </button>
                    ) : <div></div>}
                    
                    <div className="flex gap-3">
                       <button onClick={() => setEditingJob(null)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 text-sm transition-colors">Cancelar</button>
                       <button onClick={() => saveJob(editingJob)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2">
                          <Save className="w-4 h-4" /> Guardar Tarea
                       </button>
                    </div>
                 </div>

              </div>
           </div>
        </div>
      )}

      {editingDailyNote && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditingDailyNote(null)}>
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900 italic uppercase tracking-tighter">Gestionar Nota</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Nota diaria de operario</p>
              </div>
              <button onClick={() => setEditingDailyNote(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Operario</label>
                <div className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700">
                  {planning.workers.find(w => w.id === editingDailyNote.workerId)?.name || 'Operario no encontrado'}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Fecha</label>
                <div className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700">
                  {formatDateDMY(editingDailyNote.date)}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tipo de nota</label>
                <div className="relative">
                  <select 
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none" 
                    value={editingDailyNote.type}
                    onChange={e => setEditingDailyNote({...editingDailyNote, type: e.target.value as NoteType})}
                  >
                    <option value="info">Información</option>
                    <option value="time">Horario</option>
                    <option value="medical">Médico</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"><ChevronDown className="w-4 h-4 text-slate-400" /></div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Texto de la nota</label>
                <textarea 
                  className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24 text-sm" 
                  placeholder="Escribe aquí la nota..."
                  value={editingDailyNote.text}
                  onChange={e => setEditingDailyNote({...editingDailyNote, text: e.target.value})}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 mt-6 border-t border-slate-100">
              <button 
                onClick={() => deleteDailyNote(editingDailyNote.id)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-red-500 hover:bg-red-50 transition-colors text-xs uppercase tracking-widest group"
              >
                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" /> Eliminar Nota
              </button>
              
              <div className="flex gap-3">
                <button onClick={() => setEditingDailyNote(null)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 text-sm transition-colors">Cancelar</button>
                <button onClick={saveDailyNote} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2">
                  <Save className="w-4 h-4" /> Guardar Nota
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {editingWorker && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditingWorker(null)}>
          <div className="bg-white w-full max-w-4xl rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900 italic uppercase tracking-tight">Editar Operario</h2>
              <button onClick={() => setEditingWorker(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            {/* Primera fila: Nombre - Apellidos - Apodo */}
            <div className="grid grid-cols-12 gap-4 mb-6">
              <div className="col-span-5 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nombre</label>
                 <input 
                   className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" 
                   value={editingWorker.firstName || ''} 
                   onChange={e => {
                     const firstName = e.target.value;
                     const lastName = editingWorker.lastName || '';
                     setEditingWorker({
                       ...editingWorker, 
                       firstName,
                       lastName,
                       name: `${firstName} ${lastName}`.trim()
                     });
                   }} 
                   placeholder="Juan"
                 />
              </div>
              <div className="col-span-5 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Apellidos</label>
                 <input 
                   className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" 
                   value={editingWorker.lastName || ''} 
                   onChange={e => {
                     const firstName = editingWorker.firstName || '';
                     const lastName = e.target.value;
                     setEditingWorker({
                       ...editingWorker, 
                       firstName,
                       lastName,
                       name: `${firstName} ${lastName}`.trim()
                     });
                   }} 
                   placeholder="García López"
                 />
              </div>
              <div className="col-span-2 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Apodo</label>
                 <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" value={editingWorker.apodo || ''} onChange={e => setEditingWorker({...editingWorker, apodo: e.target.value || undefined})} placeholder="Apodo" />
              </div>
            </div>

            {/* Segunda fila: Código - DNI - Teléfono */}
            <div className="grid grid-cols-12 gap-4 mb-6">
              <div className="col-span-3 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Código</label>
                 <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" value={editingWorker.code} onChange={e => setEditingWorker({...editingWorker, code: e.target.value})} />
              </div>
              <div className="col-span-4 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">DNI / NIE</label>
                 <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" value={editingWorker.dni} onChange={e => setEditingWorker({...editingWorker, dni: e.target.value})} />
              </div>
              <div className="col-span-5 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Teléfono</label>
                 <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" value={editingWorker.phone} onChange={e => setEditingWorker({...editingWorker, phone: e.target.value})} />
              </div>
            </div>

            {/* Tercera fila: Cargo/Puesto - Tipo Contrato - Estado Actual */}
            <div className="grid grid-cols-12 gap-4 mb-6">
              <div className="col-span-4 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Cargo / Puesto</label>
                 <div className="relative">
                   <select className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none" value={editingWorker.role} onChange={e => setEditingWorker({...editingWorker, role: e.target.value})}>
                     {WORKER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                   </select>
                   <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"><ChevronDown className="w-4 h-4 text-slate-400" /></div>
                 </div>
              </div>
              <div className="col-span-4 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tipo Contrato</label>
                 <div className="relative">
                   <select className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none" value={editingWorker.contractType} onChange={e => setEditingWorker({...editingWorker, contractType: e.target.value as ContractType})}>
                     {Object.values(ContractType).map(t => <option key={t} value={t}>{t}</option>)}
                   </select>
                   <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"><ChevronDown className="w-4 h-4 text-slate-400" /></div>
                 </div>
              </div>
              <div className="col-span-4 space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Estado Actual</label>
                 <div className="flex items-center gap-2 h-full">
                   <span className={`flex-1 px-3 py-3 rounded-xl text-xs font-black uppercase text-center ${
                     getCurrentWorkerStatus(editingWorker).status === WorkerStatus.DISPONIBLE ? 'bg-green-100 text-green-700' :
                     getCurrentWorkerStatus(editingWorker).status === WorkerStatus.VACACIONES ? 'bg-amber-100 text-amber-700' :
                     getCurrentWorkerStatus(editingWorker).status.includes('Baja') ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                   }`}>
                     {getCurrentWorkerStatus(editingWorker).status}
                   </span>
                 </div>
              </div>
            </div>

            {/* Resto del contenido del modal */}

            <div className="flex gap-4 mb-8">
              <label className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors flex-1">
                <input type="checkbox" className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" checked={editingWorker.hasVehicle} onChange={e => setEditingWorker({...editingWorker, hasVehicle: e.target.checked})} />
                <span className="text-xs font-black text-slate-600 uppercase tracking-wide">Vehículo Propio</span>
              </label>
              <label className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors flex-1">
                <input type="checkbox" className="w-5 h-5 rounded text-slate-600 focus:ring-slate-500 border-gray-300" checked={editingWorker.isArchived || false} onChange={e => setEditingWorker({...editingWorker, isArchived: e.target.checked})} />
                <span className="text-xs font-black text-slate-600 uppercase tracking-wide">Archivado</span>
              </label>
            </div>

            <div className="bg-blue-50/50 rounded-2xl p-6 mb-6 border border-blue-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <h3 className="font-black text-blue-900 uppercase tracking-widest text-xs">Formación y Cursos</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {planning.courses.map(course => (
                  <label key={course.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-blue-100 cursor-pointer hover:border-blue-300 transition-all">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                      checked={editingWorker.completedCourses?.includes(course.name)}
                      onChange={e => {
                        const current = editingWorker.completedCourses || [];
                        const updated = e.target.checked 
                          ? [...current, course.name]
                          : current.filter(c => c !== course.name);
                        setEditingWorker({...editingWorker, completedCourses: updated});
                      }}
                    />
                    <span className="text-[10px] font-bold text-slate-600 uppercase leading-tight">{course.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-amber-50/50 rounded-2xl p-6 mb-6 border border-amber-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                  <Fuel className="w-5 h-5" />
                </div>
                <h3 className="font-black text-amber-900 uppercase tracking-widest text-xs">Control Combustible</h3>
              </div>
              
              <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm mb-4">
                 <div className="grid grid-cols-3 gap-3 mb-3">
                    <input type="date" className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700" value={newFuelRecord.date} onChange={e => setNewFuelRecord({...newFuelRecord, date: e.target.value})} />
                    <input type="number" placeholder="Litros (Opcional)" className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700 placeholder:text-slate-400" value={newFuelRecord.liters} onChange={e => setNewFuelRecord({...newFuelRecord, liters: e.target.value})} />
                    <input type="number" placeholder="€ Coste" className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700 placeholder:text-slate-400" value={newFuelRecord.cost} onChange={e => setNewFuelRecord({...newFuelRecord, cost: e.target.value})} />
                 </div>
                 <button onClick={handleAddFuel} className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-colors shadow-lg shadow-amber-200">Registrar Repostaje</button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                 {planning.fuelRecords.filter(r => r.workerId === editingWorker.id).length === 0 ? (
                   <p className="text-center text-[10px] text-amber-400 font-bold italic py-4">Sin registros</p>
                 ) : (
                   planning.fuelRecords.filter(r => r.workerId === editingWorker.id).map(record => (
                     <div key={record.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-amber-50 text-xs">
                        <span className="font-bold text-slate-600">{formatDateDMY(record.date)}</span>
                        <div className="flex gap-4">
                           <span className="font-medium text-slate-500">{record.liters ? `${record.liters} L` : '-'}</span>
                           <span className="font-black text-amber-600">{record.cost} €</span>
                        </div>
                        <button onClick={() => handleDeleteFuel(record.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                     </div>
                   ))
                 )}
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-slate-400" />
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registros de Estados</label>
                </div>
                <button
                  onClick={() => {
                    setEditingStatusRecord({
                      status: WorkerStatus.VACACIONES,
                      startDate: new Date().toISOString().split('T')[0],
                      endDate: new Date().toISOString().split('T')[0]
                    });
                    setShowAddRecordForm(true);
                  }}
                  className="px-3 py-1 bg-blue-500 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-600 transition-colors"
                >
                  + Añadir Registro
                </button>
              </div>

              {showAddRecordForm && (
                <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado</label>
                      <select
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={editingStatusRecord?.status || WorkerStatus.VACACIONES}
                        onChange={e => setEditingStatusRecord(prev => prev ? {...prev, status: e.target.value as WorkerStatus} : null)}
                      >
                        <option value={WorkerStatus.VACACIONES}>Vacaciones</option>
                        <option value={WorkerStatus.BAJA_MEDICA}>Baja Médica</option>
                        <option value={WorkerStatus.BAJA_PATERNIDAD}>Baja Paternidad</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha Inicio</label>
                      <input
                        type="date"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={editingStatusRecord?.startDate || ''}
                        onChange={e => setEditingStatusRecord(prev => prev ? {...prev, startDate: e.target.value} : null)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha Fin</label>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                          value={editingStatusRecord?.endDate === 'IND.' ? '' : (editingStatusRecord?.endDate || '')}
                          onChange={e => setEditingStatusRecord(prev => prev ? {...prev, endDate: e.target.value} : null)}
                          placeholder="Seleccionar fecha"
                          disabled={editingStatusRecord?.endDate === 'IND.'}
                        />
                        <button
                          type="button"
                          onClick={() => setEditingStatusRecord(prev => prev ? {...prev, endDate: prev?.endDate === 'IND.' ? '' : 'IND.'} : null)}
                          className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-colors ${
                            editingStatusRecord?.endDate === 'IND.' 
                              ? 'bg-red-600 text-white' 
                              : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600'
                          }`}
                        >
                          IND.
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddStatusRecord}
                      className="px-3 py-1 bg-green-500 text-white rounded-lg text-[10px] font-black uppercase hover:bg-green-600 transition-colors"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => {
                        setShowAddRecordForm(false);
                        setEditingStatusRecord(null);
                      }}
                      className="px-3 py-1 bg-slate-300 text-slate-700 rounded-lg text-[10px] font-black uppercase hover:bg-slate-400 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-2 font-black text-slate-400 uppercase tracking-wider text-[10px]">Estado</th>
                      <th className="text-left py-2 px-2 font-black text-slate-400 uppercase tracking-wider text-[10px]">Fecha Inicio</th>
                      <th className="text-left py-2 px-2 font-black text-slate-400 uppercase tracking-wider text-[10px]">Fecha Fin</th>
                      <th className="text-left py-2 px-2 font-black text-slate-400 uppercase tracking-wider text-[10px]">Total Días</th>
                      <th className="text-center py-2 px-2 font-black text-slate-400 uppercase tracking-wider text-[10px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!editingWorker.statusRecords || editingWorker.statusRecords.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-slate-400 font-black text-[10px]">
                          Sin registros
                        </td>
                      </tr>
                    ) : (
                      editingWorker.statusRecords.map(record => (
                        <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-2">
                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${
                              record.status === WorkerStatus.VACACIONES ? 'bg-amber-100 text-amber-700' :
                              record.status.includes('Baja') ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-medium text-slate-600">{formatDateDMY(record.startDate)}</td>
                          <td className="py-2 px-2 font-medium text-slate-600">{formatDateDMY(record.endDate)}</td>
                          <td className="py-2 px-2 font-black text-slate-700">{record.totalDays} días</td>
                          <td className="py-2 px-2 text-center">
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => handleEditStatusRecord(record.id)}
                                className="p-1 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded transition-colors"
                                title="Editar"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteStatusRecord(record.id)}
                                className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-8">
               <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas y Observaciones</label>
               </div>
               <textarea 
                  className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-medium text-slate-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24" 
                  placeholder="Añadir notas sobre el operario..."
                  value={editingWorker.notes || ''}
                  onChange={e => setEditingWorker({...editingWorker, notes: e.target.value})}
               />
            </div>

            <div className="mb-8">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                     <StickyNote className="w-4 h-4 text-slate-400" />
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas de Tareas Diarias</label>
                  </div>
                  <div className="flex gap-2">
                     <button
                        onClick={() => setWorkerNoteFilters(prev => ({...prev, info: !prev.info}))}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                           workerNoteFilters.info 
                             ? 'bg-blue-500 text-white' 
                             : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                     >
                        Información
                     </button>
                     <button
                        onClick={() => setWorkerNoteFilters(prev => ({...prev, time: !prev.time}))}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                           workerNoteFilters.time 
                             ? 'bg-green-500 text-white' 
                             : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                     >
                        Horario
                     </button>
                     <button
                        onClick={() => setWorkerNoteFilters(prev => ({...prev, medical: !prev.medical}))}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                           workerNoteFilters.medical 
                             ? 'bg-red-500 text-white' 
                             : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                     >
                        Médico
                     </button>
                  </div>
               </div>
               
               <div className="bg-slate-50 rounded-xl p-4 max-h-60 overflow-y-auto custom-scrollbar">
                  {planning.dailyNotes?.filter(note => 
                     note.workerId === editingWorker.id && 
                     workerNoteFilters[note.type]
                  ).length === 0 ? (
                     <p className="text-center text-[10px] text-slate-400 font-bold py-4">
                        No hay notas para los filtros seleccionados
                     </p>
                  ) : (
                     <div className="space-y-2">
                        {planning.dailyNotes
                           .filter(note => 
                              note.workerId === editingWorker.id && 
                              workerNoteFilters[note.type]
                           )
                           .sort((a, b) => b.date.localeCompare(a.date))
                           .map(note => (
                              <div key={note.id} className="bg-white p-3 rounded-lg border border-slate-200">
                                 <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                       <span className="text-[9px] font-bold text-slate-500">
                                          {formatDateDMY(note.date)}
                                       </span>
                                       <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                          note.type === 'info' 
                                             ? 'bg-blue-100 text-blue-600'
                                             : note.type === 'time'
                                             ? 'bg-green-100 text-green-600'
                                             : 'bg-red-100 text-red-600'
                                       }`}>
                                          {note.type === 'info' ? 'Información' : 
                                           note.type === 'time' ? 'Horario' : 'Médico'}
                                       </span>
                                    </div>
                                 </div>
                                 <p className="text-[10px] text-slate-700 font-medium leading-relaxed">
                                    {note.text}
                                 </p>
                              </div>
                           ))}
                     </div>
                  )}
               </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
               <button 
                  onClick={() => setItemToDelete({ id: editingWorker.id, type: 'worker', name: editingWorker.name })} 
                  className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors"
               >
                  <Trash2 className="w-5 h-5" />
               </button>
               <div className="flex gap-3">
                  <button onClick={() => setEditingWorker(null)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors text-sm">Cancelar</button>
                  <button onClick={() => saveWorker(editingWorker)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">Guardar</button>
               </div>
            </div>

          </div>
        </div>
      )}

      {editingClient && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditingClient(null)}>
           <div className="bg-white w-full max-w-4xl rounded-[40px] p-10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
                 <div>
                    <h2 className="text-3xl font-black text-slate-900 italic uppercase tracking-tighter">Ficha Cliente</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Gestión comercial y operativa</p>
                 </div>
                 <button onClick={() => setEditingClient(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nombre Fiscal / Comercial</label>
                    <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-black text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-lg" placeholder="Nombre Empresa" value={editingClient.name} onChange={e => setEditingClient({...editingClient, name: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">CIF</label>
                        <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="B-12345678" value={editingClient.cif} onChange={e => setEditingClient({...editingClient, cif: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Acrónimo/Logo</label>
                        <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="ABC" maxLength={3} value={editingClient.logo} onChange={e => setEditingClient({...editingClient, logo: e.target.value.toUpperCase()})} />
                    </div>
                 </div>
              </div>

              <div className="bg-slate-50 rounded-[24px] p-6 mb-8 border border-slate-100">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 shadow-sm"><Phone className="w-4 h-4" /></div>
                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Datos de Contacto</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input className="bg-white border-none rounded-xl px-4 py-3 font-bold text-slate-600 text-xs focus:ring-2 focus:ring-blue-200 outline-none" placeholder="Persona de Contacto" value={editingClient.contactPerson} onChange={e => setEditingClient({...editingClient, contactPerson: e.target.value})} />
                    <input className="bg-white border-none rounded-xl px-4 py-3 font-bold text-slate-600 text-xs focus:ring-2 focus:ring-blue-200 outline-none" placeholder="Teléfono" value={editingClient.phone} onChange={e => setEditingClient({...editingClient, phone: e.target.value})} />
                    <input className="bg-white border-none rounded-xl px-4 py-3 font-bold text-slate-600 text-xs focus:ring-2 focus:ring-blue-200 outline-none" placeholder="Email" value={editingClient.email} onChange={e => setEditingClient({...editingClient, email: e.target.value})} />
                    <input className="bg-white border-none rounded-xl px-4 py-3 font-bold text-slate-600 text-xs focus:ring-2 focus:ring-blue-200 outline-none" placeholder="Dirección Principal" value={editingClient.location} onChange={e => setEditingClient({...editingClient, location: e.target.value})} />
                 </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Sedes / Centros</h3>
                        </div>
                        <button 
                            onClick={() => setEditingClient({
                                ...editingClient, 
                                centers: [...editingClient.centers, { id: `ct-${Date.now()}`, name: '', address: '', publicTransport: true }]
                            })}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-colors"
                        >
                            + Añadir Sede
                        </button>
                    </div>
                    <div className="space-y-3">
                        {editingClient.centers.map((center, idx) => (
                            <div key={center.id} className="bg-white border border-slate-200 p-4 rounded-xl relative group hover:border-blue-300 transition-colors">
                                <button 
                                    onClick={() => setEditingClient({
                                        ...editingClient,
                                        centers: editingClient.centers.filter((_, i) => i !== idx)
                                    })}
                                    className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                                <div className="space-y-2">
                                    <input 
                                        className="w-full font-black text-sm text-slate-800 placeholder:text-slate-300 border-none p-0 focus:ring-0" 
                                        placeholder="Nombre Sede (ej: MAD4)" 
                                        value={center.name} 
                                        onChange={e => {
                                            const newCenters = [...editingClient.centers];
                                            newCenters[idx].name = e.target.value;
                                            setEditingClient({...editingClient, centers: newCenters});
                                        }} 
                                    />
                                    <input 
                                        className="w-full font-medium text-xs text-slate-500 placeholder:text-slate-300 border-none p-0 focus:ring-0" 
                                        placeholder="Dirección completa" 
                                        value={center.address} 
                                        onChange={e => {
                                            const newCenters = [...editingClient.centers];
                                            newCenters[idx].address = e.target.value;
                                            setEditingClient({...editingClient, centers: newCenters});
                                        }} 
                                    />
                                </div>
                            </div>
                        ))}
                        {editingClient.centers.length === 0 && <p className="text-center text-[10px] text-slate-400 italic py-4">Sin sedes registradas</p>}
                    </div>
                 </div>

                 <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <GraduationCap className="w-4 h-4 text-purple-500" />
                        <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Formación Requerida</h3>
                    </div>
                    <div className="bg-purple-50/50 rounded-2xl p-4 border border-purple-100 grid grid-cols-1 gap-2">
                        {planning.courses.map(course => (
                            <label key={course.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg transition-colors cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300"
                                    checked={editingClient.requiredCourses.includes(course.name)}
                                    onChange={e => {
                                        const current = editingClient.requiredCourses || [];
                                        const updated = e.target.checked ? [...current, course.name] : current.filter(c => c !== course.name);
                                        setEditingClient({...editingClient, requiredCourses: updated});
                                    }}
                                />
                                <span className="text-[10px] font-bold text-slate-600 uppercase">{course.name}</span>
                            </label>
                        ))}
                    </div>
                 </div>
              </div>

              <div className="flex items-center justify-between pt-8 mt-8 border-t border-slate-100">
                 <button onClick={() => { setItemToDelete({ id: editingClient.id, type: 'client', name: editingClient.name }); }} className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-red-500 hover:bg-red-50 transition-colors text-xs uppercase tracking-widest">
                    <Trash2 className="w-4 h-4" /> Eliminar Cliente
                 </button>
                 <div className="flex gap-3">
                    <button onClick={() => setEditingClient(null)} className="px-8 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-colors text-xs uppercase tracking-widest">Cancelar</button>
                    <button onClick={() => saveClient(editingClient)} className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">Guardar Cambios</button>
                 </div>
              </div>

           </div>
        </div>
      )}

      {/* MODAL DUPLICAR TAREA */}
      {duplicatingJob && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setDuplicatingJob(null)}>
           <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 italic uppercase">Duplicar Tarea</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{duplicatingJob.customName || duplicatingJob.type}</p>
                 </div>
                 <button onClick={() => setDuplicatingJob(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              
              <div className="space-y-4 mb-8">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Fecha Destino</label>
                    <input 
                       type="date" 
                       className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                       value={duplicationDate}
                       onChange={e => setDuplicationDate(e.target.value)}
                    />
                 </div>
                 
                 <label className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 group">
                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${keepWorkersOnDuplicate ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                        {keepWorkersOnDuplicate && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <input 
                       type="checkbox" 
                       className="hidden"
                       checked={keepWorkersOnDuplicate}
                       onChange={e => setKeepWorkersOnDuplicate(e.target.checked)}
                    />
                    <div className="flex flex-col">
                       <span className="text-xs font-black text-slate-700 uppercase group-hover:text-blue-700 transition-colors">Mantener Operarios</span>
                       <span className="text-[9px] font-bold text-slate-400">Copiar la asignación actual</span>
                    </div>
                 </label>
              </div>

              <div className="flex gap-3">
                 <button onClick={() => setDuplicatingJob(null)} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors text-xs uppercase tracking-widest">Cancelar</button>
                 <button onClick={handleDuplicateJob} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 transform active:scale-95">
                    <Copy className="w-4 h-4" /> Duplicar
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL NOTIFICACIONES WHATSAPP (DISEÑO CENTRAL DE AVISOS) */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowNotificationsModal(false)}>
           <div className="bg-slate-50 w-full max-w-6xl h-[85vh] rounded-[32px] shadow-2xl animate-in zoom-in-95 flex overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
              
              {/* SIDEBAR LISTA (IZQUIERDA) */}
              <div className="w-1/3 bg-white border-r border-slate-200 flex flex-col">
                 <div className="p-6 border-b border-slate-100 bg-white z-10">
                    <h3 className="text-xl font-black text-slate-900 italic uppercase tracking-tight">Central Avisos</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                       {new Date(planning.currentDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <div className="flex items-center gap-2 mt-4">
                       <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase border border-amber-100">
                          {planning.jobs.filter(j => j.date === planning.currentDate && !j.isCancelled).flatMap(j => j.assignedWorkerIds).filter((id, i, arr) => arr.indexOf(id) === i && !(planning.notifications[planning.currentDate] || []).includes(id)).length} Pendientes
                       </span>
                    </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 bg-slate-50/50">
                    {planning.jobs
                       .filter(j => j.date === planning.currentDate && !j.isCancelled)
                       .flatMap(j => j.assignedWorkerIds)
                       .filter((id, index, self) => self.indexOf(id) === index)
                       .map(workerId => {
                          const worker = planning.workers.find(w => w.id === workerId);
                          if (!worker) return null;
                          const isNotified = (planning.notifications[planning.currentDate] || []).includes(workerId);
                          const isSelected = selectedNotificationWorkerId === workerId;

                          return (
                             <div 
                                key={workerId} 
                                onClick={() => setSelectedNotificationWorkerId(workerId)}
                                className={`p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-md ${
                                   isSelected 
                                      ? 'bg-white border-blue-500 ring-2 ring-blue-100 shadow-lg relative z-10' 
                                      : 'bg-white border-slate-200 hover:border-blue-300 text-slate-500'
                                }`}
                             >
                                <div className="flex justify-between items-start mb-2">
                                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                      {worker.code}
                                   </div>
                                   {isNotified ? (
                                      <span className="text-[9px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase">Enviado</span>
                                   ) : (
                                      <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase">Pendiente</span>
                                   )}
                                </div>
                                <h4 className={`font-black text-sm uppercase ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{worker.name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{worker.role}</p>
                             </div>
                          );
                       })}
                    {planning.jobs.filter(j => j.date === planning.currentDate && !j.isCancelled).length === 0 && (
                       <div className="p-8 text-center text-slate-400">
                          <p className="text-xs font-bold uppercase">No hay operarios hoy</p>
                       </div>
                    )}
                 </div>
              </div>

              {/* AREA PREVISUALIZACIÓN (DERECHA) */}
              <div className="flex-1 flex flex-col bg-slate-50 relative">
                 <div className="absolute top-4 right-4 z-20">
                    <button onClick={() => setShowNotificationsModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"><X className="w-6 h-6" /></button>
                 </div>

                 {selectedNotificationWorkerId ? (
                    (() => {
                       const worker = planning.workers.find(w => w.id === selectedNotificationWorkerId);
                       const workerJobs = planning.jobs.filter(j => j.date === planning.currentDate && !j.isCancelled && j.assignedWorkerIds.includes(selectedNotificationWorkerId));
                       const isNotified = (planning.notifications[planning.currentDate] || []).includes(selectedNotificationWorkerId);
                       
                       // CALCULAR FECHA
                       const dateObj = new Date(planning.currentDate);
                       const dateStr = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                       
                       const message = `Hola ${worker?.name.split(' ')[0]},\n\nServicio para: ${dateStr}\n\n${workerJobs.map(j => {
                          const client = planning.clients.find(c => c.id === j.clientId);
                          const center = client?.centers.find(ct => ct.id === j.centerId);
                          const address = center?.address || client?.location || '';
                          const mapUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
                          
                          return `   • *Cliente:* ${client?.name}\n   • *Centro:* ${center?.name || 'Sede Principal'}\n   • *Dirección:* ${address}\n   • *Ver en Mapa:* ${mapUrl}\n\n   • *Hora Inicio:* ${j.startTime}\n   • *Tarea:* ${j.customName || j.type}`;
                       }).join('\n\n')}\n\nPor favor, confirma recepción del mensaje`;

                       const encodedMessage = encodeURIComponent(message);
                       const whatsappUrl = `https://api.whatsapp.com/send/?phone=34${worker?.phone.replace(/\s+/g, '').replace(/^34/, '')}&text=${encodedMessage}&type=phone_number&app_absent=0`;

                       return (
                          <div className="flex-1 flex flex-col h-full">
                             <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex items-center justify-center bg-slate-100">
                                <div className="bg-white rounded-tr-3xl rounded-bl-3xl rounded-br-3xl p-6 shadow-sm max-w-sm w-full relative border border-slate-200">
                                   <div className="absolute -left-2 top-0 w-0 h-0 border-t-[10px] border-t-white border-l-[10px] border-l-transparent" />
                                   <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 font-medium">{message}</p>
                                   <div className="mt-2 flex justify-end">
                                      <span className="text-[9px] text-slate-400 font-bold">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                   </div>
                                </div>
                             </div>
                             <div className="p-6 bg-white border-t border-slate-200 shrink-0 flex items-center gap-4">
                                <a 
                                   href={whatsappUrl} 
                                   target="_blank" 
                                   rel="noopener noreferrer"
                                   onClick={() => toggleNotificationStatus(selectedNotificationWorkerId, planning.currentDate, true)}
                                   className="flex-1 bg-[#25D366] hover:bg-[#20bd5a] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-green-100 transition-all hover:-translate-y-0.5"
                                >
                                   <Send className="w-4 h-4" /> Enviar WhatsApp
                                </a>
                                {isNotified ? (
                                   <button 
                                      onClick={() => toggleNotificationStatus(selectedNotificationWorkerId, planning.currentDate, false)}
                                      className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
                                   >
                                      Marcar Pendiente
                                   </button>
                                ) : (
                                   <button 
                                      onClick={() => toggleNotificationStatus(selectedNotificationWorkerId, planning.currentDate, true)}
                                      className="px-6 py-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-100 transition-colors"
                                   >
                                      Marcar Enviado
                                   </button>
                                )}
                             </div>
                          </div>
                       );
                    })()
                 ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-8">
                       <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
                       <p className="font-black uppercase tracking-widest text-sm">Selecciona un operario</p>
                       <p className="text-xs font-bold mt-2 text-slate-400">Visualiza y envía los avisos por WhatsApp</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

    {/* CALENDARIO SELECTOR */}
    {showCalendarSelector && (
      <CalendarSelector
        currentDate={planning.currentDate}
        customHolidays={planning.customHolidays}
        onSelect={handleDateChange}
        onClose={() => setShowCalendarSelector(false)}
        onGoToToday={goToToday}
        jobs={planning.jobs}
      />
    )}

    {/* MODAL LISTADO DE OPERARIOS */}
    {workerListModal && (
      <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setWorkerListModal(null)}>
        <div className="bg-white w-full max-w-2xl rounded-[40px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
          
          <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">Listado de Operarios</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                {(() => {
                  const client = planning.clients.find(c => c.id === workerListModal.clientId);
                  const center = client?.centers.find(ct => ct.id === workerListModal.centerId);
                  return `${client?.name || 'Cliente'} - ${center?.name || 'Sede'} - ${formatDateDMY(workerListModal.date)}`;
                })()}
              </p>
            </div>
            <button onClick={() => setWorkerListModal(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Listado de operarios */}
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">Operarios Asignados</h3>
                <button
                  onClick={() => copyWorkerListToClipboard(workerListModal.clientId, workerListModal.centerId, workerListModal.date)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Copiar Listado
                </button>
              </div>
              
              <div className="space-y-2">
                {(() => {
                  // Obtener todas las tareas del cliente en esa fecha y sede
                  const relevantJobs = planning.jobs.filter(job => 
                    job.clientId === workerListModal.clientId && 
                    job.centerId === workerListModal.centerId && 
                    job.date === workerListModal.date && 
                    !job.isCancelled
                  );

                  // Recolectar todos los operarios únicos
                  const allWorkerIds = new Set<string>();
                  relevantJobs.forEach(job => {
                    job.assignedWorkerIds.forEach(workerId => {
                      allWorkerIds.add(workerId);
                    });
                  });

                  // Obtener información completa de los operarios
                  const workers = Array.from(allWorkerIds)
                    .map(workerId => planning.workers.find(w => w.id === workerId))
                    .filter(worker => worker !== undefined)
                    .sort((a, b) => a.name.localeCompare(b.name));

                  if (workers.length === 0) {
                    return (
                      <div className="text-center py-8 text-slate-400">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-black uppercase tracking-wider">No hay operarios asignados</p>
                      </div>
                    );
                  }

                  return workers.map((worker, index) => (
                    <div key={worker.id} className="bg-white rounded-xl p-4 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-black text-slate-900">{worker.name}</p>
                            <p className="text-xs text-slate-500">DNI: {worker.dni}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-600">{worker.role}</p>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* MODAL EDICIÓN TAREA ESTÁNDAR */}
    {editingStandardTask && (
      <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditingStandardTask(null)}>
        <div className="bg-white w-full max-w-lg rounded-[24px] p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
          
          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
            <h2 className="text-lg font-black text-slate-900 italic uppercase tracking-tighter">
              {editingStandardTask.id.startsWith('st-') ? 'Nueva Tarea' : 'Editar Tarea'}
            </h2>
            <div className="flex items-center gap-2">
              {!editingStandardTask.id.startsWith('st-') && (
                <button
                  onClick={() => deleteStandardTask(editingStandardTask.id)}
                  className="p-1.5 hover:bg-red-50 rounded-full transition-colors text-red-500"
                  title="Eliminar tarea"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setEditingStandardTask(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Nombre */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Nombre</label>
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-50"
                value={editingStandardTask.name}
                onChange={e => setEditingStandardTask({...editingStandardTask, name: e.target.value})}
                placeholder="Nombre de la tarea"
              />
            </div>

            {/* Tipo de Servicio y Nº Operarios en una fila */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Tipo</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-50"
                  value={editingStandardTask.type}
                  onChange={e => setEditingStandardTask({...editingStandardTask, type: e.target.value as JobType})}
                >
                  <option value="">Seleccionar</option>
                  <option value={JobType.CARGA}>Carga</option>
                  <option value={JobType.DESCARGA}>Descarga</option>
                  <option value={JobType.PICKING}>Picking</option>
                  <option value={JobType.MANIPULACION}>Manipulación</option>
                  <option value={JobType.OPERATIVA_EXTERNA}>Operativa Ext.</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Operarios</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-50"
                  value={editingStandardTask.defaultWorkers}
                  onChange={e => setEditingStandardTask({...editingStandardTask, defaultWorkers: parseInt(e.target.value) || 1})}
                />
              </div>
            </div>

            {/* Notas - más compacto */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Notas (máx. 8 palabras)</label>
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-50 resize-none"
                rows={2}
                maxLength={80}
                value={editingStandardTask.notes}
                onChange={e => {
                  const words = e.target.value.trim().split(/\s+/);
                  if (words.length <= 8) {
                    setEditingStandardTask({...editingStandardTask, notes: e.target.value});
                  }
                }}
                placeholder="Notas breves sobre la tarea..."
              />
              <p className="text-[10px] text-slate-400">
                {editingStandardTask.notes.trim().split(/\s+/).filter(w => w).length}/8 palabras
              </p>
            </div>

            {/* Asignación a Clientes - más compacto */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Asignar a Clientes</label>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 max-h-32 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-2">
                  {planning.clients.sort((a, b) => a.name.localeCompare(b.name)).map(client => (
                    <label key={client.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded transition-colors">
                      <input
                        type="checkbox"
                        className="w-3 h-3 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        checked={editingStandardTask.assignedClientIds.includes(client.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setEditingStandardTask({
                              ...editingStandardTask,
                              assignedClientIds: [...editingStandardTask.assignedClientIds, client.id]
                            });
                          } else {
                            setEditingStandardTask({
                              ...editingStandardTask,
                              assignedClientIds: editingStandardTask.assignedClientIds.filter(id => id !== client.id)
                            });
                          }
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xs text-slate-900 truncate">{client.name}</p>
                        <p className="text-[9px] text-slate-500 truncate">{client.location}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-[9px] text-slate-400">
                Clientes que verán esta plantilla rápida
              </p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
            <button
              onClick={() => setEditingStandardTask(null)}
              className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-black text-[10px] uppercase tracking-wider hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => saveStandardTask(editingStandardTask)}
              disabled={!editingStandardTask.name || !editingStandardTask.type}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-black text-[10px] uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingStandardTask.id.startsWith('st-') ? 'Crear' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* MODAL DE EDICIÓN DE CURSOS */}
    {editingCourse && (
      <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-slate-900 italic uppercase">Editar Curso</h2>
            <button
              onClick={() => setEditingCourse(null)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Información básica */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Nombre del Curso</label>
                <input
                  type="text"
                  className="w-full mt-2 p-3 border border-slate-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                  value={editingCourse.name}
                  onChange={(e) => setEditingCourse({...editingCourse, name: e.target.value})}
                  placeholder="Nombre del curso"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Descripción</label>
                <textarea
                  className="w-full mt-2 p-3 border border-slate-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                  rows={3}
                  value={editingCourse.description || ''}
                  onChange={(e) => setEditingCourse({...editingCourse, description: e.target.value})}
                  placeholder="Descripción del curso (opcional)"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Validez (meses)</label>
                <input
                  type="number"
                  className="w-full mt-2 p-3 border border-slate-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                  value={editingCourse.validityMonths || 12}
                  onChange={(e) => setEditingCourse({...editingCourse, validityMonths: parseInt(e.target.value) || 12})}
                  min="1"
                  max="120"
                />
                <p className="text-xs text-slate-500 mt-1">Tiempo en meses que el curso mantiene su validez</p>
              </div>
            </div>

            {/* Asignación de operarios */}
            <div className="space-y-4">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Operarios Asignados</label>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 max-h-60 overflow-y-auto">
                <div className="space-y-2">
                  {planning.workers
                    .filter(w => !w.isArchived)
                    .map(worker => {
                      const isAssigned = editingCourse.assignedWorkerIds.includes(worker.id);
                      return (
                        <label key={worker.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-100 cursor-pointer hover:bg-blue-50 transition-colors">
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                            checked={isAssigned}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditingCourse({
                                  ...editingCourse,
                                  assignedWorkerIds: [...editingCourse.assignedWorkerIds, worker.id]
                                });
                              } else {
                                setEditingCourse({
                                  ...editingCourse,
                                  assignedWorkerIds: editingCourse.assignedWorkerIds.filter(id => id !== worker.id)
                                });
                              }
                            }}
                          />
                          <div className="flex-1">
                            <p className="font-bold text-sm text-slate-900">{worker.name}</p>
                            <p className="text-xs text-slate-500">{worker.code} • {worker.contract}</p>
                          </div>
                          {isAssigned && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg">
                              Asignado
                            </span>
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {editingCourse.assignedWorkerIds.length} operarios seleccionados
              </p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={() => setEditingCourse(null)}
              className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => saveCourse(editingCourse)}
              disabled={!editingCourse.name.trim()}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Guardar Curso
            </button>
          </div>
        </div>
      </div>
    )}

    {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
    {itemToDelete && (
      <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Confirmar Eliminación</h2>
            <p className="text-sm text-slate-600">
              ¿Estás seguro de que deseas eliminar {itemToDelete.name}? Esta acción no se puede deshacer.
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setItemToDelete(null)}
              className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-lg font-black text-sm hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={executeDelete}
              className="flex-1 py-3 bg-red-600 text-white rounded-lg font-black text-sm hover:bg-red-700 transition-colors"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    )}

    
  </div>
);
};

export default App;
