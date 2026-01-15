
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Sparkles, AlertTriangle, X,
  Building2, Users, Search, Mail, MapPin, Car, Edit2, LayoutGrid, CalendarDays, Clock, 
  Trash2, RotateCcw, Cloud, CloudOff, Loader2, Database, BarChart3, DownloadCloud,
  ClipboardList, Package, Hash, BookOpen, GraduationCap, StickyNote, Stethoscope,
  MessageCircle, Send, CheckCircle2, ListTodo, UserCircle, Save, Download, Upload, FileSpreadsheet,
  FileText, Briefcase, Archive, Phone, Filter, ArrowRight, LayoutList, Fuel, Euro, Table, RefreshCcw, Copy, Bus, Settings, CalendarPlus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import WorkerSidebar from './components/WorkerSidebar';
import PlanningBoard from './components/PlanningBoard';
import StatisticsPanel from './components/StatisticsPanel';
import { MOCK_WORKERS, MOCK_CLIENTS, MOCK_JOBS, AVAILABLE_COURSES, MOCK_STANDARD_TASKS } from './constants';
import { PlanningState, Worker, Job, JobType, WorkerStatus, Client, ViewType, ContractType, Holiday, WorkCenter, StandardTask, DailyNote, RegularTask, FuelRecord } from './types';
import { validateAssignment, getPreviousWeekday, isHoliday, formatDateDMY } from './utils';

// --- CONFIGURACIÓN SUPABASE ---
const supabaseUrl = 'https://zblasxlrrjeycwjefitp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpibGFzeGxycmpleWN3amVmaXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1NjIwMzQsImV4cCI6MjA4MjEzODAzNH0.g0i_tan90kUcAzdEvAsFd5jGciCvd1gdWjZrxdTxIY8';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- LISTADO DE CARGOS DEFINITIVO ---
const WORKER_ROLES = [
  "Gerente",
  "Director de operaciones",
  "Director Administración",
  "Jefe de equipo",
  "Mozo almacén"
];

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
  const [view, setView] = useState<ViewType>('planning');
  
  // ESTADOS VISTA PLANNING (Diario vs Rango)
  const [viewMode, setViewMode] = useState<'day' | 'range'>('day');
  const [rangeStartDate, setRangeStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [rangeEndDate, setRangeEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Estado inicial por defecto (MOCK)
  const defaultState: PlanningState = { 
    currentDate: new Date().toISOString().split('T')[0], 
    workers: MOCK_WORKERS, 
    clients: MOCK_CLIENTS, 
    jobs: MOCK_JOBS, 
    customHolidays: [], 
    notifications: {},
    availableCourses: AVAILABLE_COURSES,
    standardTasks: MOCK_STANDARD_TASKS,
    dailyNotes: [],
    fuelRecords: [] // Inicializar array de combustible
  };

  const [planning, setPlanning] = useState<PlanningState>(defaultState);
  
  // --- LÓGICA DE SINCRONIZACIÓN (DATABASE - SIN LOGIN) ---
  const [dbStatus, setDbStatus] = useState<'loading' | 'connected' | 'error' | 'saving'>('connected');
  const isRemoteUpdate = useRef(false);
  const isLoaded = useRef(false);

  // 1. Cargar datos iniciales y Suscribirse a cambios
  useEffect(() => {
    const initDb = async () => {
      try {
        setDbStatus('loading'); 
        
        const { data, error } = await supabase.from('planning_snapshots').select('data').eq('id', 1).single();
        
        if (data && data.data && Object.keys(data.data).length > 0) {
          const remoteData = data.data;
          const mergedState = {
             ...defaultState, 
             ...remoteData,   
             workers: (remoteData.workers && remoteData.workers.length > 0) ? remoteData.workers : defaultState.workers,
             clients: (remoteData.clients && remoteData.clients.length > 0) ? remoteData.clients : defaultState.clients,
             jobs: remoteData.jobs || [],
             availableCourses: (remoteData.availableCourses && remoteData.availableCourses.length > 0) ? remoteData.availableCourses : defaultState.availableCourses,
             standardTasks: (remoteData.standardTasks && remoteData.standardTasks.length > 0) ? remoteData.standardTasks : defaultState.standardTasks,
             dailyNotes: (remoteData.dailyNotes && remoteData.dailyNotes.length >= 0) ? remoteData.dailyNotes : defaultState.dailyNotes,
             fuelRecords: (remoteData.fuelRecords && remoteData.fuelRecords.length >= 0) ? remoteData.fuelRecords : defaultState.fuelRecords,
             currentDate: new Date().toISOString().split('T')[0] 
          };

          setPlanning(mergedState);
          setDbStatus('connected');
        } else {
          // Si no existe snapshot, crearlo
          await supabase.from('planning_snapshots').upsert({ id: 1, data: defaultState });
          setDbStatus('connected'); 
        }
        
        isLoaded.current = true;

      } catch (e) {
        console.error("Error conectando a Supabase (Modo Local)", e);
        setDbStatus('error');
        isLoaded.current = true; 
      }
    };

    initDb();

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
  }, []); 

  // 2. Auto-guardado
  useEffect(() => {
    if (!isLoaded.current) return;
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    setDbStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await supabase.from('planning_snapshots').upsert({ id: 1, data: planning, updated_at: new Date() });
        setDbStatus('connected');
      } catch (e) {
        setDbStatus('error'); 
      }
    }, 1000); 

    return () => clearTimeout(timer);
  }, [planning]); 


  const backupInputRef = useRef<HTMLInputElement>(null);
  // RESTAURADO ESTADO DRAGGEDWORKER
  const [draggedWorkerId, setDraggedWorkerId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'error' | 'success' | 'warning'} | null>(null);
  const [workerTableSearch, setWorkerTableSearch] = useState('');
  // ESTADOS WHATSAPP CENTRAL
  const [selectedNotifyWorkerId, setSelectedNotifyWorkerId] = useState<string | null>(null);
  const [whatsappPreviewText, setWhatsappPreviewText] = useState('');
  
  const [showArchivedWorkers, setShowArchivedWorkers] = useState(false); 
  
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState<string | null>(null);
  
  // ESTADOS CONFIRMACIÓN SUB-ITEMS CLIENTE
  const [confirmDeleteCenterId, setConfirmDeleteCenterId] = useState<string | null>(null);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

  // Modales y Estados de UI
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showSSReport, setShowSSReport] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showCalendarSelector, setShowCalendarSelector] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [duplicatingJob, setDuplicatingJob] = useState<Job | null>(null);
  const [duplicationDate, setDuplicationDate] = useState<string>('');
  const [keepWorkersOnDuplicate, setKeepWorkersOnDuplicate] = useState(false);
  
  const [showClientRequirements, setShowClientRequirements] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');

  const [dbTab, setDbTab] = useState<'tasks' | 'courses'>('tasks');
  const [editingStandardTask, setEditingStandardTask] = useState<StandardTask | null>(null);
  const [taskSearch, setTaskSearch] = useState('');

  // ESTADO PARA NOTAS DIARIAS (MODAL)
  const [editingDailyNote, setEditingDailyNote] = useState<DailyNote | null>(null);
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>('all');

  // ESTADO PARA NUEVO REGISTRO DE GASOLINA
  const [newFuelRecord, setNewFuelRecord] = useState<{liters: string, cost: string, odometer: string, date: string}>({
    liters: '', cost: '', odometer: '', date: new Date().toISOString().split('T')[0]
  });

  const showNotification = useCallback((message: string, type: 'error' | 'success' | 'warning' = 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const handleDragStart = (worker: Worker) => {
    setDraggedWorkerId(worker.id);
  };

  // ... (Funciones auxiliares: formatDateDisplay, handleDateChange, etc.) ...
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

  const handleDateChange = (newDate: string) => {
    if (newDate) {
      setPlanning(prev => ({ ...prev, currentDate: newDate }));
      setShowCalendarSelector(false);
      showNotification(`Cargando agenda: ${formatDateDisplay(newDate)}`, 'success');
    }
  };

  const goToToday = () => {
    handleDateChange(new Date().toISOString().split('T')[0]);
  };

  const toggleNotificationStatus = (workerId: string, date: string, markAsDone: boolean) => {
    setPlanning(prev => {
      const currentNotified = prev.notifications[date] || [];
      let newNotified;
      if (markAsDone) {
        if (!currentNotified.includes(workerId)) {
          newNotified = [...currentNotified, workerId];
        } else {
          newNotified = currentNotified;
        }
      } else {
        newNotified = currentNotified.filter(id => id !== workerId);
      }
      return {
        ...prev,
        notifications: {
          ...prev.notifications,
          [date]: newNotified
        }
      };
    });
  };

  const generateWhatsAppMessage = (worker: Worker, job: Job, center: any, client: Client, note: string = '') => {
      let mapsLink = "";
      if (center?.address) {
        const query = encodeURIComponent(`${center.address}`);
        mapsLink = `https://www.google.com/maps/search/?api=1&query=${query}`;
      }

      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      
      const isTomorrow = job.date === tomorrowStr;
      const datePrefix = isTomorrow ? "Servicio para mañana" : "Servicio para";

      const lines = [
        `Hola *${worker.name.split(' ')[0]}*,`,
        "",
        `*${datePrefix}: ${formatDateDisplay(job.date)}*`,
        "",
        `   • *Cliente:* ${client.name}`,
        `   • *Centro:* ${center?.name || 'Sede Principal'}`,
        `   • *Dirección:* ${center?.address || 'Ubicación habitual'}`,
        mapsLink ? `   • *Ver en Mapa:* ${mapsLink}` : null,
        "",
        `   • *Hora Inicio:* ${job.startTime}`,
        `   • *Tarea:* ${job.customName || job.type}`,
        note ? `   • *Nota:* ${note}` : null,
        "",
        "Por favor, confirma recepción del mensaje"
      ];

      return lines.filter(line => line !== null).join("\n");
  };

  const openWhatsApp = (worker: Worker, message: string) => {
    const phone = worker.phone.replace(/\D/g, ''); 
    const finalPhone = phone.startsWith('34') ? phone : `34${phone}`;
    const url = `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const ssReport = useMemo(() => {
    try {
      const todayStr = planning.currentDate;
      const prevWorkingDayStr = getPreviousWeekday(todayStr); 
      const targetWorkers = planning.workers.filter(w => w.contractType === ContractType.FIJO_DISCONTINUO);
      const safeJobs = planning.jobs || [];
      
      const workedPrevDayIds = new Set(
        safeJobs
          .filter(j => j.date === prevWorkingDayStr && !j.isCancelled)
          .flatMap(j => j.assignedWorkerIds || [])
      );
      
      const worksTodayIds = new Set(
        safeJobs
          .filter(j => j.date === todayStr && !j.isCancelled)
          .flatMap(j => j.assignedWorkerIds || [])
      );
      
      const altas = targetWorkers.filter(w => worksTodayIds.has(w.id) && !workedPrevDayIds.has(w.id));
      const bajas = targetWorkers.filter(w => workedPrevDayIds.has(w.id) && !worksTodayIds.has(w.id));
      return { altas, bajas, prevDate: prevWorkingDayStr };
    } catch (e) {
      console.error("Error generating SS Report", e);
      return { altas: [], bajas: [], prevDate: planning.currentDate };
    }
  }, [planning.currentDate, planning.jobs, planning.workers]);

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
          showNotification("Copiado al portapapeles", "success");
      }).catch(() => {
          showNotification("Error al copiar", "error");
      });
  };

  const handleCopyList = (list: Worker[], type: 'altas' | 'bajas') => {
      const title = type === 'altas' ? `ALTAS ${formatDateDMY(planning.currentDate)}` : `BAJAS ${formatDateDMY(planning.currentDate)}`;
      const content = list.map(w => `${w.name} - ${w.dni}`).join('\n');
      copyToClipboard(`${title}\n\n${content}`);
  };

  // ... (Export functions: exportDatabaseToExcel, exportBackup, downloadExcelTemplate - se mantienen igual) ...
  const exportDatabaseToExcel = () => {
    const wb = XLSX.utils.book_new();

    const workersData = planning.workers.map(w => ({
       'Código': w.code,
       'Nombre': w.name,
       'DNI': w.dni,
       'Teléfono': w.phone,
       'Rol': w.role,
       'Estado': w.status,
       'Contrato': w.contractType,
       'Vehículo': w.hasVehicle ? 'SI' : 'NO',
       'Cursos': (w.completedCourses || []).join(', '),
       'Archivado': w.isArchived ? 'SI' : 'NO'
    }));
    const wsWorkers = XLSX.utils.json_to_sheet(workersData);
    XLSX.utils.book_append_sheet(wb, wsWorkers, "Operarios");

    const clientsData = planning.clients.map(c => ({
       'ID': c.id,
       'Empresa': c.name,
       'CIF': c.cif,
       'Teléfono': c.phone,
       'Contacto': c.contactPerson,
       'Email': c.email,
       'Cursos Exigidos': (c.requiredCourses || []).join(', '),
       'Num Sedes': c.centers.length
    }));
    const wsClients = XLSX.utils.json_to_sheet(clientsData);
    XLSX.utils.book_append_sheet(wb, wsClients, "Clientes");

    const jobsData = planning.jobs.map(j => {
       const client = planning.clients.find(c => c.id === j.clientId);
       const center = client?.centers?.find(ct => ct.id === j.centerId);
       return {
          'Fecha': j.date,
          'Hora Inicio': j.startTime,
          'Hora Fin Est': j.endTime,
          'Cliente': client?.name || '---',
          'Sede': center?.name || '---',
          'Tarea': j.customName || j.type,
          'Referencia': j.ref || '',
          'Albarán': j.deliveryNote || '', // NUEVO CAMPO ALBARÁN
          'Num Operarios': j.assignedWorkerIds.length,
          'Estado': j.isCancelled ? 'ANULADA' : j.isFinished ? 'FINALIZADA' : 'PENDIENTE',
          'Motivo Anulación': j.cancellationReason || '',
          'Hora Real Fin': j.actualEndTime || ''
       };
    });
    const wsJobs = XLSX.utils.json_to_sheet(jobsData);
    XLSX.utils.book_append_sheet(wb, wsJobs, "Agenda Completa");

    XLSX.writeFile(wb, `josan_db_export_${planning.currentDate}.xlsx`);
    showNotification("Base de datos exportada a Excel", "success");
  };

  // RESTAURADA FUNCIÓN DE BACKUP JSON
  const exportBackup = () => {
    const dataStr = JSON.stringify(planning, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `josan_backup_${planning.currentDate}.json`;
    link.click();
    showNotification("Copia de seguridad descargada", "success");
  };

  const handleResetData = () => {
      const confirmed = window.confirm("¿Estás seguro? Esto borrará TODOS los datos actuales y cargará los datos de ejemplo.");
      if (confirmed) {
          const resetState = { 
            ...defaultState,
            currentDate: new Date().toISOString().split('T')[0] // Ensure we are on today
          };
          setPlanning(resetState);
          showNotification("Datos de ejemplo cargados y guardados", "success");
          setShowBackupModal(false);
      }
  };

  const downloadExcelTemplate = () => {
    const workerTemplate = [
      ["Código", "Nombre Completo", "DNI/NIE", "Teléfono", "Cargo", "Estado", "Tipo Contrato", "Vehículo Propio", "Cursos Completados (Separados por coma)", "Trabaja Actualmente (SI/NO)"],
      ["1001", "Juan Pérez", "12345678A", "600111222", "Mozo", "Activo", "Fijo", "SI", "PRL Básico, Carnet Carretillero", "SI"]
    ];

    const clientHeader = [
      "Nombre Empresa", "CIF", "Teléfono", "Persona Contacto", "Email", "Cursos Exigidos"
    ];
    for (let i = 1; i <= 5; i++) {
      clientHeader.push(`Sede ${i} Nombre`, `Sede ${i} Dirección`, `Sede ${i} Transp. Pub (SI/NO)`, `Sede ${i} Tipo Transp`);
    }
    for (let i = 1; i <= 20; i++) {
      clientHeader.push(`Tarea ${i} Nombre`, `Tarea ${i} Mozos`);
    }
    const clientExample = ["Logística S.A.", "B12345678", "912344556", "Carlos Ruiz", "carlos@logistica.com", "PRL Básico"];

    const wb = XLSX.utils.book_new();
    const wsWorkers = XLSX.utils.aoa_to_sheet(workerTemplate);
    const wsClients = XLSX.utils.aoa_to_sheet([clientHeader, clientExample]);

    XLSX.utils.book_append_sheet(wb, wsWorkers, "Trabajadores");
    XLSX.utils.book_append_sheet(wb, wsClients, "Clientes");

    XLSX.writeFile(wb, "plantilla_carga_josan.xlsx");
    showNotification("Plantilla Excel descargada", "success");
  };

  // --- CRUD HELPERS ---
  const handleOpenNote = (workerId: string) => {
    const existingNote = planning.dailyNotes?.find(n => n.workerId === workerId && n.date === planning.currentDate);
    
    if (existingNote) {
      setEditingDailyNote(existingNote);
    } else {
      setEditingDailyNote({
        id: `note-${Date.now()}`,
        workerId: workerId,
        date: planning.currentDate,
        text: '',
        type: 'info'
      });
    }
  };

  const saveDailyNote = () => {
    if (!editingDailyNote || !editingDailyNote.text.trim()) {
      if (planning.dailyNotes?.some(n => n.id === editingDailyNote?.id)) {
         deleteDailyNote(editingDailyNote.id);
         setEditingDailyNote(null);
         return;
      }
      setEditingDailyNote(null);
      return;
    }

    setPlanning(prev => {
      const notes = prev.dailyNotes || [];
      const existingIndex = notes.findIndex(n => n.id === editingDailyNote.id);
      
      if (existingIndex >= 0) {
        const updated = [...notes];
        updated[existingIndex] = editingDailyNote;
        return { ...prev, dailyNotes: updated };
      } else {
        return { ...prev, dailyNotes: [...notes, editingDailyNote] };
      }
    });
    setEditingDailyNote(null);
    showNotification("Nota guardada", "success");
  };

  const deleteDailyNote = (noteId: string) => {
    setPlanning(prev => ({
      ...prev,
      dailyNotes: prev.dailyNotes?.filter(n => n.id !== noteId)
    }));
    setEditingDailyNote(null);
    showNotification("Nota eliminada", "success");
  };

  const handleAddGlobalCourse = () => {
    if (!newCourseName.trim()) return;
    const course = newCourseName.trim();
    if (planning.availableCourses.includes(course)) {
      showNotification("El curso ya existe en el catálogo", "warning");
      return;
    }
    setPlanning(prev => ({
      ...prev,
      availableCourses: [...prev.availableCourses, course]
    }));
    setNewCourseName('');
    showNotification("Curso añadido al catálogo global", "success");
  };

  const deleteGlobalCourse = (courseName: string) => {
    setPlanning(prev => ({
      ...prev,
      availableCourses: prev.availableCourses.filter(c => c !== courseName)
    }));
    setConfirmDeleteCourse(null);
    showNotification("Curso eliminado del catálogo", "success");
  };

  const handleOpenNewStandardTask = () => {
    setEditingStandardTask({
      id: `st-${Date.now()}`,
      name: '',
      defaultWorkers: 2,
      packages: '',
      refs: ''
    });
    setConfirmDeleteId(null);
  };

  const saveStandardTask = (task: StandardTask) => {
    if (!task.name) {
      showNotification("El nombre de la tarea es obligatorio", "error");
      return;
    }
    setPlanning(prev => {
      const exists = prev.standardTasks.find(t => t.id === task.id);
      return {
        ...prev,
        standardTasks: exists 
          ? prev.standardTasks.map(t => t.id === task.id ? task : t)
          : [...prev.standardTasks, task]
      };
    });
    setEditingStandardTask(null);
    showNotification("Tarea guardada correctamente", "success");
  };

  const deleteStandardTask = (id: string) => {
    setPlanning(prev => ({
      ...prev,
      standardTasks: prev.standardTasks.filter(t => t.id !== id)
    }));
    setEditingStandardTask(null);
    setConfirmDeleteId(null);
    showNotification("Tarea eliminada", "warning");
  };

  const handleReorderJobs = (sourceJobId: string, targetJobId: string) => {
    setPlanning(prev => {
      const jobs = [...prev.jobs];
      const sourceIndex = jobs.findIndex(j => j.id === sourceJobId);
      const targetIndex = jobs.findIndex(j => j.id === targetJobId);
      
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return prev;

      const [movedJob] = jobs.splice(sourceIndex, 1);
      jobs.splice(targetIndex, 0, movedJob);

      return { ...prev, jobs };
    });
  };

  const handleReorderClients = (sourceClientId: string, targetClientId: string) => {
    setPlanning(prev => {
      const clients = [...prev.clients];
      const sourceIndex = clients.findIndex(c => c.id === sourceClientId);
      const targetIndex = clients.findIndex(c => c.id === targetClientId);
      
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return prev;

      const [movedClient] = clients.splice(sourceIndex, 1);
      clients.splice(targetIndex, 0, movedClient);

      return { ...prev, clients };
    });
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    
    if (file.name.endsWith('.json')) {
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target?.result as string);
          if (data.workers && data.clients && data.jobs) {
            setPlanning({ ...data, currentDate: new Date().toISOString().split('T')[0] });
            showNotification("Base de datos importada con éxito", "success");
            setShowBackupModal(false);
          } else {
            showNotification("Formato JSON no compatible", "error");
          }
        } catch (err) {
          showNotification("Error al procesar el JSON", "error");
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = (evt) => {
        try {
          const data = evt.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          // 1. Parse Workers
          const workersSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('trabajadores') || n.toLowerCase().includes('operarios'));
          let newWorkers: Worker[] = [];
          if (workersSheetName) {
             const worksheet = workbook.Sheets[workersSheetName];
             const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);
             
             // FUNCIÓN HELPER PARA ENCONTRAR COLUMNAS CON NOMBRES APROXIMADOS
             // MODIFICADO: AÑADIDA LÓGICA MÁS ROBUSTA PARA CÓDIGO
             const cleanStr = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

             const findColumnValue = (row: any, possibleNames: string[]) => {
                const keys = Object.keys(row);
                for (const name of possibleNames) {
                    const cleanName = cleanStr(name);
                    const foundKey = keys.find(k => cleanStr(k).includes(cleanName));
                    if (foundKey && row[foundKey] !== undefined) return row[foundKey];
                }
                return undefined;
             };

             newWorkers = jsonData.map((row: any) => {
                // Recuperar valores usando múltiples posibles nombres de columna
                // FIX: Eliminado 'id' para evitar conflictos con 'apellidos'
                const codeVal = findColumnValue(row, ['cod', 'codigo', 'referencia', 'nº', 'numero']);
                const nameVal = findColumnValue(row, ['nombre', 'worker', 'empleado', 'apellidos']);
                const dniVal = findColumnValue(row, ['dni', 'nie', 'nif', 'documento']);
                const phoneVal = findColumnValue(row, ['telefono', 'movil', 'celular']);
                const roleVal = findColumnValue(row, ['cargo', 'puesto', 'rol', 'categoria']);
                const statusVal = findColumnValue(row, ['estado', 'status', 'situacion']);
                const contractVal = findColumnValue(row, ['contrato', 'tipo']);
                const vehicleVal = findColumnValue(row, ['vehiculo', 'coche']);
                const coursesVal = findColumnValue(row, ['cursos', 'formacion']);
                
                // ARCHIVADO: Lógica mejorada (busca columna "Archivado" o columna "Activo")
                const archivedCol = findColumnValue(row, ['archivado', 'baja', 'archived']);
                const activeCol = findColumnValue(row, ['trabaja', 'activo', 'alta']);
                
                let isArchived = false;
                
                if (archivedCol !== undefined) {
                    // Si existe columna "Archivado", SI/TRUE/1 significa archivado
                    const val = String(archivedCol).trim().toUpperCase();
                    if (['SI', 'YES', 'TRUE', '1'].includes(val)) isArchived = true;
                } else if (activeCol !== undefined) {
                    // Si existe columna "Activo", NO/FALSE/0 significa archivado
                    const val = String(activeCol).trim().toUpperCase();
                    if (['NO', 'FALSE', '0', 'BAJA'].includes(val)) isArchived = true;
                }

                // LÓGICA CONTRATO ACTUALIZADA
                let finalContract = ContractType.FIJO_DISCONTINUO; // Default safe
                if (contractVal) {
                    const cStr = String(contractVal).toLowerCase();
                    if (cStr.includes('colaboradora')) {
                        finalContract = ContractType.AUTONOMA_COLABORADORA;
                    } else if (cStr.includes('autonomo') || cStr.includes('autónomo')) {
                        finalContract = ContractType.AUTONOMO;
                    } else if (cStr.includes('indefinido') || (cStr.includes('fijo') && !cStr.includes('discontinuo'))) {
                        finalContract = ContractType.INDEFINIDO;
                    } else if (cStr.includes('discontinuo') || cStr.includes('temporal') || cStr.includes('obra')) {
                        finalContract = ContractType.FIJO_DISCONTINUO;
                    }
                }

                return {
                   id: `w-${Math.random().toString(36).substr(2, 9)}`,
                   code: codeVal ? String(codeVal) : '000',
                   name: nameVal || 'Sin Nombre',
                   dni: dniVal || '',
                   phone: phoneVal ? String(phoneVal) : '',
                   role: roleVal || 'Mozo almacén',
                   status: (statusVal as WorkerStatus) || WorkerStatus.ACTIVO,
                   contractType: finalContract,
                   hasVehicle: (vehicleVal || '').toString().toUpperCase() === 'SI',
                   completedCourses: coursesVal ? String(coursesVal).split(',').map((c: string) => c.trim()) : [],
                   isArchived: isArchived,
                   restrictions: [],
                   restrictedClientIds: [],
                   skills: []
                };
             });
          }

          if (newWorkers.length > 0) {
             setPlanning(prev => ({
                ...prev,
                workers: newWorkers
             }));
             showNotification(`Importados ${newWorkers.length} operarios desde Excel`, "success");
             setShowBackupModal(false);
          } else {
             showNotification("No se encontraron datos válidos en la hoja 'Trabajadores'", "warning");
          }

        } catch (err) {
          console.error(err);
          showNotification("Error al procesar el archivo Excel", "error");
        }
      };
      reader.readAsBinaryString(file);
    }
    e.target.value = '';
  };

  const handleOpenNewJob = (clientId: string = '', date?: string) => {
    const firstClient = clientId ? planning.clients.find(c => c.id === clientId) : planning.clients[0];
    const targetDate = date || planning.currentDate;
    
    const newJob: Job = {
      id: `j-${Date.now()}`,
      date: targetDate,
      clientId: firstClient?.id || '',
      centerId: firstClient?.centers?.[0]?.id || '',
      type: JobType.DESCARGA,
      startTime: '08:00',
      endTime: '12:00',
      requiredWorkers: 2,
      assignedWorkerIds: [],
      ref: '',
      deliveryNote: '', 
      locationDetails: ''
    };
    setEditingJob(newJob);
    setConfirmDeleteId(null);
  };

  const saveJob = (job: Job) => {
    if (!job.clientId || !job.centerId) {
      showNotification("Debe seleccionar cliente y centro", "error");
      return;
    }
    setPlanning(prev => {
      const exists = prev.jobs.some(j => j.id === job.id);
      return {
        ...prev,
        jobs: exists ? prev.jobs.map(j => j.id === job.id ? job : j) : [...prev.jobs, job]
      };
    });
    setEditingJob(null);
    showNotification(job.isCancelled ? "Tarea anulada" : job.isFinished ? "Tarea finalizada" : "Tarea guardada", "success");
  };

  const deleteJob = (id: string) => {
    setPlanning(prev => ({ ...prev, jobs: prev.jobs.filter(j => j.id !== id) }));
    setEditingJob(null);
    setConfirmDeleteId(null);
    showNotification("Tarea eliminada", "warning");
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
      isCancelled: false, 
      cancellationReason: '',
      isFinished: false, 
      actualEndTime: undefined,
      assignedWorkerIds: keepWorkersOnDuplicate ? duplicatingJob.assignedWorkerIds : [] 
    };

    setPlanning(prev => ({ ...prev, jobs: [...prev.jobs, newJob] }));
    showNotification(`Tarea duplicada al ${formatDateDisplay(duplicationDate)}`, "success");
    setDuplicatingJob(null);
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
        if (sourceJobId && j.id === sourceJobId) assigned = assigned.filter(id => id !== workerId);
        if (j.id === jobId) assigned = [...assigned.filter(id => id !== workerId), workerId];
        return { ...j, assignedWorkerIds: assigned };
      })
    }));
    if (!validation.warning) showNotification("Mozo asignado", "success");
  }, [planning, showNotification]);

  const handleUpdateWorkerStatus = (workerId: string, status: WorkerStatus) => {
    setPlanning(prev => ({ ...prev, workers: prev.workers.map(w => w.id === workerId ? { ...w, status } : w) }));
  };

  const handleRemoveWorker = (workerId: string, jobId: string) => {
    setPlanning(prev => ({
      ...prev,
      jobs: prev.jobs.map(j => 
        j.id === jobId 
          ? { ...j, assignedWorkerIds: j.assignedWorkerIds.filter(id => id !== workerId) } 
          : j
      )
    }));
  };

  const shiftDate = (days: number) => {
    const date = new Date(planning.currentDate);
    date.setDate(date.getDate() + days);
    handleDateChange(date.toISOString().split('T')[0]);
  };

  const notifiedCount = (planning.notifications[planning.currentDate] || []).length;

  const datesToShow = useMemo(() => {
    if (viewMode === 'day') return [planning.currentDate];
    const dates = [];
    let current = new Date(rangeStartDate);
    const end = new Date(rangeEndDate);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [viewMode, planning.currentDate, rangeStartDate, rangeEndDate]);

  const handleOpenNewWorker = () => {
    setEditingWorker({
      id: `w-${Date.now()}`,
      code: '',
      name: '',
      dni: '',
      phone: '',
      role: 'Mozo almacén',
      status: WorkerStatus.ACTIVO,
      contractType: ContractType.FIJO_DISCONTINUO,
      hasVehicle: false,
      completedCourses: [],
      restrictions: [],
      restrictedClientIds: [],
      skills: [],
      isArchived: false
    });
    setConfirmDeleteId(null);
  };
  
  const saveWorker = (worker: Worker | null) => {
    if (!worker) return;
    if (!worker.name || !worker.code) {
      showNotification("Nombre y Código son obligatorios", "error");
      return;
    }
    setPlanning(prev => {
      const exists = prev.workers.find(w => w.id === worker.id);
      return {
        ...prev,
        workers: exists 
          ? prev.workers.map(w => w.id === worker.id ? worker : w)
          : [...prev.workers, worker]
      };
    });
    setEditingWorker(null);
    showNotification("Operario guardado", "success");
  };

  const filteredWorkersTable = useMemo(() => {
    return planning.workers.filter(w => {
      if (!showArchivedWorkers && w.isArchived) return false;
      const search = workerTableSearch.toLowerCase();
      return (
        w.name.toLowerCase().includes(search) ||
        w.code.toLowerCase().includes(search) ||
        w.dni.toLowerCase().includes(search)
      );
    });
  }, [planning.workers, workerTableSearch, showArchivedWorkers]);

  const handleOpenNewClient = () => {
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

  const saveClient = (client: Client | null) => {
      if (!client) return;
      if (!client.name) {
          showNotification("El nombre de la empresa es obligatorio", "error");
          return;
      }
      setPlanning(prev => {
          const exists = prev.clients.find(c => c.id === client.id);
          return {
              ...prev,
              clients: exists 
                  ? prev.clients.map(c => c.id === client.id ? client : c)
                  : [...prev.clients, client]
          };
      });
      setEditingClient(null);
      showNotification("Cliente guardado", "success");
  };

  const deleteClient = (id: string) => {
      setPlanning(prev => ({
          ...prev,
          clients: prev.clients.filter(c => c.id !== id)
      }));
      setEditingClient(null);
      setConfirmDeleteId(null);
      showNotification("Cliente eliminado", "warning");
  };

  const filteredTasks = useMemo(() => {
      if (!taskSearch) return planning.standardTasks;
      return planning.standardTasks.filter(t => t.name.toLowerCase().includes(taskSearch.toLowerCase()));
  }, [planning.standardTasks, taskSearch]);

  const handleAddFuel = () => {
      if (!editingWorker) return;
      // CORRECCIÓN: Solo validamos el coste
      if (!newFuelRecord.cost) {
          showNotification("El coste es obligatorio", "error");
          return;
      }
      const record: FuelRecord = {
          id: `fuel-${Date.now()}`,
          workerId: editingWorker.id,
          date: newFuelRecord.date,
          // Litros es opcional ahora
          liters: newFuelRecord.liters ? parseFloat(newFuelRecord.liters) : undefined,
          cost: parseFloat(newFuelRecord.cost),
          odometer: newFuelRecord.odometer ? parseFloat(newFuelRecord.odometer) : undefined
      };
      
      setPlanning(prev => ({
          ...prev,
          fuelRecords: [...prev.fuelRecords, record]
      }));
      
      setNewFuelRecord({
          liters: '', cost: '', odometer: '', date: new Date().toISOString().split('T')[0]
      });
      showNotification("Repostaje registrado", "success");
  };

  const handleDeleteFuel = (id: string) => {
      setPlanning(prev => ({
          ...prev,
          fuelRecords: prev.fuelRecords.filter(fr => fr.id !== id)
      }));
      showNotification("Registro de combustible eliminado", "success");
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden text-slate-900">
      <input type="file" ref={backupInputRef} className="hidden" accept=".json,.xlsx,.xls" onChange={importData} />
      
      {/* ... (Notifications and Sidebar) ... */}
      {notification && (
        <div className={`fixed top-6 right-6 z-[300] flex items-center gap-4 px-6 py-4 rounded-3xl shadow-2xl border transition-all animate-in fade-in slide-in-from-top-6 ${notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : notification.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-700'}`}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white shadow-sm">
             {notification.type === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <Sparkles className={`w-4 h-4 ${notification.type === 'error' ? 'text-red-500' : 'text-green-500'}`} />}
          </div>
          <div><p className="font-black text-xs uppercase tracking-tight">{notification.message}</p></div>
        </div>
      )}

      <div className={`fixed bottom-4 left-4 z-[400] px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border shadow-sm transition-all ${dbStatus === 'connected' ? 'bg-green-50 text-green-600 border-green-100' : dbStatus === 'saving' ? 'bg-blue-50 text-blue-600 border-blue-100' : dbStatus === 'loading' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
         {dbStatus === 'connected' && <><Cloud className="w-3 h-3" /> Conectado</>}
         {dbStatus === 'saving' && <><RotateCcw className="w-3 h-3 animate-spin" /> Guardando...</>}
         {dbStatus === 'loading' && <><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</>}
         {dbStatus === 'error' && <><CloudOff className="w-3 h-3" /> Sin conexión (Local)</>}
      </div>

      <aside className="w-20 bg-slate-900 flex flex-col items-center py-8 gap-8 shrink-0 z-50 shadow-2xl">
         <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/50 mb-4 cursor-default">
           <LayoutGrid className="w-6 h-6 text-white" />
         </div>

         <nav className="flex-1 flex flex-col gap-4 w-full px-3">
            <button onClick={() => setView('planning')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'planning' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Planificación">
               <CalendarIcon className="w-6 h-6" />
            </button>
            <button onClick={() => setShowSSReport(true)} className="p-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-all flex justify-center" title="Reporte SS">
               <ListTodo className="w-6 h-6" />
            </button>
            <button onClick={() => setView('workers')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'workers' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Gestión Operarios">
               <Users className="w-6 h-6" />
            </button>
            <button onClick={() => setView('clients')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'clients' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Gestión Clientes">
               <Building2 className="w-6 h-6" />
            </button>
            <button onClick={() => setView('databases')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'databases' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Bases de Datos">
               <Database className="w-6 h-6" />
            </button>
            <button onClick={() => setView('stats')} className={`p-3 rounded-xl transition-all flex justify-center ${view === 'stats' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`} title="Estadísticas">
               <BarChart3 className="w-6 h-6" />
            </button>
         </nav>

         <div className="flex flex-col gap-4 w-full px-3">
            <button onClick={() => setShowBackupModal(true)} className="p-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-all flex justify-center" title="Base de Datos">
               <DownloadCloud className="w-6 h-6" />
            </button>
         </div>
      </aside>

      <div className="flex-1 flex overflow-hidden relative">
         {view === 'planning' && (
           <>
             <WorkerSidebar 
               workers={planning.workers} 
               planning={planning}
               selectedWorkerId={selectedWorkerId}
               onSelectWorker={setSelectedWorkerId}
               onUpdateWorkerStatus={handleUpdateWorkerStatus}
               onDragStart={handleDragStart}
             />
             <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
                <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 z-20 shadow-sm">
                   <div className="flex items-center gap-4">
                      <h1 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">Planificación</h1>
                      
                      {/* TOGGLE VISTA (Diaria / Rango) */}
                      <div className="flex p-1 bg-slate-100 rounded-xl">
                          <button 
                            onClick={() => setViewMode('day')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            Diaria
                          </button>
                          <button 
                            onClick={() => setViewMode('range')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'range' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            Multi-día
                          </button>
                      </div>

                      {/* SELECTORES DE FECHA */}
                      {viewMode === 'day' ? (
                          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                            <button onClick={() => shiftDate(-1)} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
                            <button onClick={() => setShowCalendarSelector(true)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm text-xs font-black uppercase tracking-widest text-slate-700 hover:text-blue-600 transition-colors">
                              <CalendarDays className="w-4 h-4 text-blue-500" />
                              {formatDateDisplay(planning.currentDate)}
                            </button>
                            <button onClick={() => shiftDate(1)} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500"><ChevronRight className="w-4 h-4" /></button>
                          </div>
                      ) : (
                          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                             <div className="flex items-center gap-1 px-3 py-2 bg-white rounded-lg shadow-sm">
                                <input 
                                    type="date" 
                                    className="text-xs font-bold text-slate-700 bg-transparent outline-none uppercase"
                                    value={rangeStartDate}
                                    onChange={(e) => {
                                        setRangeStartDate(e.target.value);
                                        if(e.target.value > rangeEndDate) setRangeEndDate(e.target.value);
                                    }}
                                />
                                <span className="text-slate-300 mx-1">-</span>
                                <input 
                                    type="date" 
                                    className="text-xs font-bold text-slate-700 bg-transparent outline-none uppercase"
                                    value={rangeEndDate}
                                    onChange={(e) => setRangeEndDate(e.target.value)}
                                    min={rangeStartDate}
                                />
                             </div>
                          </div>
                      )}

                      <button onClick={goToToday} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors">Hoy</button>
                   </div>
                   
                   <div className="flex items-center gap-3">
                      <button onClick={() => setShowNotificationsModal(true)} className="relative p-3 bg-slate-50 rounded-xl hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                         <MessageCircle className="w-5 h-5" />
                         {notifiedCount > 0 && (
                            <span className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></span>
                         )}
                      </button>
                   </div>
                </header>

                <PlanningBoard 
                   planning={planning}
                   datesToShow={datesToShow}
                   onDropWorker={handleAssignWorker}
                   onRemoveWorker={handleRemoveWorker}
                   onAddJob={handleOpenNewJob}
                   onEditJob={setEditingJob}
                   onDuplicateJob={handleOpenDuplicate}
                   onDragStartFromBoard={(wId) => setDraggedWorkerId(wId)}
                   onReorderJob={handleReorderJobs}
                   onReorderClient={handleReorderClients}
                   onEditNote={handleOpenNote}
                   draggedWorkerId={draggedWorkerId}
                />
             </div>
           </>
         )}

         {/* ... (Workers List View) ... */}
         {view === 'workers' && (
           <div className="flex-1 bg-slate-50 overflow-y-auto p-8 custom-scrollbar">
             <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
                   <Users className="w-6 h-6" />
                 </div>
                 <div>
                   <h2 className="text-2xl font-black text-slate-900 italic uppercase">Gestión de Operarios</h2>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Base de datos de personal</p>
                 </div>
               </div>
               <button onClick={handleOpenNewWorker} className="bg-slate-900 text-white px-6 py-4 rounded-[24px] font-black text-[12px] uppercase tracking-widest shadow-xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                 <Plus className="w-4 h-4" /> Nuevo Operario
               </button>
             </div>
             
             <div className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm mb-6 flex items-center gap-4 sticky top-0 z-10">
                <Search className="w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar operario por nombre, código, DNI..." 
                  className="flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-300"
                  value={workerTableSearch}
                  onChange={(e) => setWorkerTableSearch(e.target.value)}
                />
                <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                  <span className="text-[10px] font-black uppercase text-slate-400">Ver Archivados</span>
                  <button onClick={() => setShowArchivedWorkers(!showArchivedWorkers)} className={`w-10 h-6 rounded-full p-1 transition-colors ${showArchivedWorkers ? 'bg-blue-600' : 'bg-slate-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showArchivedWorkers ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
             </div>

             <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Operario</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">DNI</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Teléfono</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Vehículo</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredWorkersTable.map(worker => (
                      <tr key={worker.id} onClick={() => setEditingWorker(worker)} className={`hover:bg-slate-50 cursor-pointer transition-colors group ${worker.isArchived ? 'opacity-50 grayscale' : ''}`}>
                         <td className="px-6 py-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shadow-sm ${
                                worker.contractType === ContractType.INDEFINIDO 
                                ? 'bg-slate-900 text-white' 
                                : (worker.contractType === ContractType.AUTONOMO || worker.contractType === ContractType.AUTONOMA_COLABORADORA)
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'bg-red-50 text-red-600'
                            }`}>
                                {worker.code}
                            </div>
                         </td>
                         <td className="px-6 py-4"><div><p className="text-sm font-black text-slate-900">{worker.name}</p><p className="text-[10px] font-bold text-slate-400 uppercase">{worker.role}</p></div></td>
                         <td className="px-6 py-4 text-xs font-bold text-slate-500">{worker.dni}</td>
                         <td className="px-6 py-4 text-xs font-bold text-slate-500">{worker.phone}</td>
                         <td className="px-6 py-4 text-center">{worker.hasVehicle ? (<div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-600"><Car className="w-4 h-4" /></div>) : (<span className="text-slate-200">-</span>)}</td>
                         <td className="px-6 py-4"><span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border inline-block ${worker.status === WorkerStatus.ACTIVO ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{worker.status}</span></td>
                         <td className="px-6 py-4 text-right"><button onClick={(e) => { e.stopPropagation(); setEditingWorker(worker); }} className="p-2 text-slate-300 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                    {filteredWorkersTable.length === 0 && (
                       <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400"><p className="text-xs font-bold uppercase tracking-widest">No se encontraron operarios</p></td></tr>
                    )}
                  </tbody>
                </table>
             </div>
           </div>
         )}
         
         {/* ... (Other Views: Clients, DB, Stats - no changes) ... */}
         {view === 'clients' && (
           <div className="flex-1 bg-slate-50 overflow-y-auto p-8 custom-scrollbar">
             <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
                   <Building2 className="w-6 h-6" />
                 </div>
                 <div>
                   <h2 className="text-2xl font-black text-slate-900 italic uppercase">Clientes</h2>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Gestión de empresas y sedes</p>
                 </div>
               </div>
               <button onClick={handleOpenNewClient} className="bg-slate-900 text-white px-6 py-4 rounded-[24px] font-black text-[12px] uppercase tracking-widest shadow-xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                 <Plus className="w-4 h-4" /> Nuevo Cliente
               </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {planning.clients.map(client => (
                  <div key={client.id} onClick={() => setEditingClient(client)} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm cursor-pointer hover:shadow-md transition-all group">
                     <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-xs text-slate-900 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                           {client.logo}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setEditingClient(client); }} className="p-2 text-slate-300 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                     </div>
                     <h3 className="text-lg font-black text-slate-900 mb-1">{client.name}</h3>
                     <p className="text-xs font-bold text-slate-400 mb-4">{client.location}</p>
                     
                     <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 bg-slate-50 p-2 rounded-xl">
                           <MapPin className="w-3 h-3" /> {client.centers.length} Sedes
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 bg-slate-50 p-2 rounded-xl">
                           <Users className="w-3 h-3" /> {client.contactPerson}
                        </div>
                     </div>
                  </div>
                ))}
             </div>
           </div>
         )}

         {view === 'databases' && (
            <div className="flex-1 bg-slate-50 overflow-y-auto p-8 custom-scrollbar">
               <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
                     <Database className="w-6 h-6" />
                  </div>
                  <div>
                     <h2 className="text-2xl font-black text-slate-900 italic uppercase">Bases de Datos</h2>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configuración y Catálogos</p>
                  </div>
               </div>
               
               <div className="flex gap-4 mb-6 border-b border-slate-200">
                  <button onClick={() => setDbTab('tasks')} className={`pb-4 px-2 text-xs font-black uppercase tracking-widest transition-all ${dbTab === 'tasks' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Tareas Estándar</button>
                  <button onClick={() => setDbTab('courses')} className={`pb-4 px-2 text-xs font-black uppercase tracking-widest transition-all ${dbTab === 'courses' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Cursos Formación</button>
               </div>

               {dbTab === 'tasks' && (
                  <div>
                     <div className="flex justify-between items-center mb-4">
                        <input type="text" placeholder="Buscar tarea..." value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none" />
                        <button onClick={handleOpenNewStandardTask} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Nueva Tarea</button>
                     </div>
                     <div className="space-y-2">
                        {filteredTasks.map(task => (
                           <div key={task.id} onClick={() => setEditingStandardTask(task)} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center cursor-pointer hover:border-blue-300">
                              <div>
                                 <p className="text-sm font-black text-slate-900">{task.name}</p>
                                 <p className="text-[10px] text-slate-400 font-bold uppercase">{task.defaultWorkers} Operarios | {task.packages}</p>
                              </div>
                              <Edit2 className="w-4 h-4 text-slate-300" />
                           </div>
                        ))}
                     </div>
                  </div>
               )}

               {dbTab === 'courses' && (
                  <div>
                     <div className="flex gap-2 mb-4">
                        <input type="text" placeholder="Nuevo Curso..." value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none" />
                        <button onClick={handleAddGlobalCourse} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Añadir</button>
                     </div>
                     <div className="space-y-2">
                        {planning.availableCourses.map((course, idx) => (
                           <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                              <p className="text-xs font-bold text-slate-700">{course}</p>
                              <button onClick={() => { setConfirmDeleteCourse(course); }} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                           </div>
                        ))}
                        {confirmDeleteCourse && (
                           <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDeleteCourse(null)}>
                              <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
                                 <h3 className="text-lg font-black text-slate-900 mb-2">Eliminar Curso</h3>
                                 <p className="text-sm text-slate-500 mb-6">¿Estás seguro de eliminar "{confirmDeleteCourse}"?</p>
                                 <div className="flex justify-end gap-3">
                                    <button onClick={() => setConfirmDeleteCourse(null)} className="px-4 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                                    <button onClick={() => deleteGlobalCourse(confirmDeleteCourse)} className="px-4 py-2 rounded-xl font-bold bg-red-600 text-white">Eliminar</button>
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>
               )}
            </div>
         )}

         {view === 'stats' && (
            <StatisticsPanel planning={planning} />
         )}

      </div>

      {/* MODAL DUPLICAR TAREA (Faltaba) */}
      {duplicatingJob && (
          <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDuplicatingJob(null)}>
             <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-black text-slate-900 italic uppercase mb-4">Duplicar Tarea</h3>
                <div className="space-y-4">
                   <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Fecha Destino</label>
                      <input type="date" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs outline-none" value={duplicationDate} onChange={e => setDuplicationDate(e.target.value)} />
                   </div>
                   <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                      <input type="checkbox" className="w-4 h-4 text-slate-900 rounded" checked={keepWorkersOnDuplicate} onChange={e => setKeepWorkersOnDuplicate(e.target.checked)} />
                      <span className="text-xs font-bold text-slate-600">Mantener Operarios Asignados</span>
                   </label>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                   <button onClick={() => setDuplicatingJob(null)} className="px-4 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
                   <button onClick={handleDuplicateJob} className="px-6 py-2 rounded-xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center gap-2"><CalendarPlus className="w-4 h-4" /> Duplicar</button>
                </div>
             </div>
          </div>
      )}

      {/* MODAL NOTA DIARIA (AÑADIDO) */}
      {editingDailyNote && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditingDailyNote(null)}>
           <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-black text-slate-900 italic uppercase mb-4">Nota Diaria</h3>
              <p className="text-xs font-bold text-slate-400 mb-4">{formatDateDisplay(editingDailyNote.date)}</p>
              
              <div className="space-y-4">
                 <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Tipo de Nota</label>
                    <div className="flex gap-2">
                       <button onClick={() => setEditingDailyNote({...editingDailyNote, type: 'info'})} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${editingDailyNote.type === 'info' ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-400'}`}>Info</button>
                       <button onClick={() => setEditingDailyNote({...editingDailyNote, type: 'medical'})} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${editingDailyNote.type === 'medical' ? 'bg-red-100 text-red-700' : 'bg-slate-50 text-slate-400'}`}>Médica</button>
                       <button onClick={() => setEditingDailyNote({...editingDailyNote, type: 'time'})} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${editingDailyNote.type === 'time' ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400'}`}>Horario</button>
                    </div>
                 </div>
                 
                 <textarea 
                    className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none resize-none focus:ring-2 focus:ring-blue-100"
                    placeholder="Escribe la nota aquí..."
                    value={editingDailyNote.text}
                    onChange={e => setEditingDailyNote({...editingDailyNote, text: e.target.value})}
                 />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                 {editingDailyNote.text && (
                    <button onClick={() => deleteDailyNote(editingDailyNote.id)} className="px-4 py-2 bg-red-50 text-red-500 rounded-xl mr-auto"><Trash2 className="w-4 h-4" /></button>
                 )}
                 <button onClick={() => setEditingDailyNote(null)} className="px-6 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                 <button onClick={saveDailyNote} className="px-6 py-2 rounded-xl font-bold bg-slate-900 text-white">Guardar</button>
              </div>
           </div>
        </div>
      )}

      {/* SS Report Modal - RESTAURADO Y VERIFICADO */}
      {showSSReport && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6" onClick={() => setShowSSReport(false)}>
           <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 p-8" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
                 <div>
                    <h2 className="text-2xl font-black text-slate-900 italic uppercase flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                            <ListTodo className="w-6 h-6" />
                        </div>
                        Reporte SS (Fijos Discontinuos)
                    </h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2 ml-14">Comparativa: {formatDateDisplay(ssReport.prevDate)} vs {formatDateDisplay(planning.currentDate)}</p>
                 </div>
                 <button onClick={() => setShowSSReport(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
              </div>

              <div className="grid grid-cols-2 gap-8">
                 {/* ALTAS */}
                 <div className="bg-emerald-50/50 rounded-3xl p-6 border border-emerald-100 flex flex-col h-full relative group">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" /> Altas Necesarias
                        </h3>
                        <div className="flex items-center gap-2">
                           {ssReport.altas.length > 0 && (
                              <button onClick={() => handleCopyList(ssReport.altas, 'altas')} className="p-2 bg-white text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors shadow-sm" title="Copiar Lista">
                                 <Copy className="w-3 h-3" />
                              </button>
                           )}
                           <span className="bg-white text-emerald-600 px-3 py-1 rounded-lg text-[10px] font-black shadow-sm border border-emerald-100">{ssReport.altas.length}</span>
                        </div>
                    </div>
                    
                    <div className="flex-1">
                        {ssReport.altas.length > 0 ? (
                        <ul className="space-y-3">
                            {ssReport.altas.map(w => (
                                <li key={w.id} className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-emerald-100/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-black">{w.code}</div>
                                        <div>
                                            <span className="block text-xs font-black text-slate-900">{w.name}</span>
                                            <span className="block text-[9px] font-bold text-slate-400">{w.dni}</span>
                                        </div>
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                </li>
                            ))}
                        </ul>
                        ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8 opacity-50">
                            <CheckCircle2 className="w-8 h-8 text-emerald-300 mb-2" />
                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Sin altas para hoy</p>
                        </div>
                        )}
                    </div>
                 </div>

                 {/* BAJAS */}
                 <div className="bg-rose-50/50 rounded-3xl p-6 border border-rose-100 flex flex-col h-full relative group">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-black text-rose-800 uppercase tracking-widest flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" /> Bajas Necesarias
                        </h3>
                        <div className="flex items-center gap-2">
                           {ssReport.bajas.length > 0 && (
                              <button onClick={() => handleCopyList(ssReport.bajas, 'bajas')} className="p-2 bg-white text-rose-600 rounded-lg hover:bg-rose-100 transition-colors shadow-sm" title="Copiar Lista">
                                 <Copy className="w-3 h-3" />
                              </button>
                           )}
                           <span className="bg-white text-rose-600 px-3 py-1 rounded-lg text-[10px] font-black shadow-sm border border-rose-100">{ssReport.bajas.length}</span>
                        </div>
                    </div>
                    
                    <div className="flex-1">
                        {ssReport.bajas.length > 0 ? (
                        <ul className="space-y-3">
                            {ssReport.bajas.map(w => (
                                <li key={w.id} className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-rose-100/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-black">{w.code}</div>
                                        <div>
                                            <span className="block text-xs font-black text-slate-900">{w.name}</span>
                                            <span className="block text-[9px] font-bold text-slate-400">{w.dni}</span>
                                        </div>
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-rose-400" />
                                </li>
                            ))}
                        </ul>
                        ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8 opacity-50">
                            <CheckCircle2 className="w-8 h-8 text-rose-300 mb-2" />
                            <p className="text-[10px] font-bold text-rose-700 uppercase tracking-widest">Sin bajas para hoy</p>
                        </div>
                        )}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
      
      {/* Job Modal */}
      {editingJob && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingJob(null)}>
           <div className="bg-white w-full max-w-lg rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-slate-900 uppercase italic">
                      {editingJob.id.startsWith('j-') ? 'Editar Tarea' : 'Nueva Tarea'}
                  </h2>
                  <button onClick={() => setEditingJob(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                      <X className="w-5 h-5 text-slate-400" />
                  </button>
              </div>
              
              <div className="space-y-4">
                 {/* 1. SELECCIÓN DE CLIENTE */}
                 <div>
                     <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Cliente</label>
                     <select 
                        className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-100" 
                        value={editingJob.clientId} 
                        onChange={e => {
                            const newClientId = e.target.value;
                            const client = planning.clients.find(c => c.id === newClientId);
                            setEditingJob(prev => prev ? ({
                                ...prev, 
                                clientId: newClientId,
                                centerId: client?.centers[0]?.id || '', // Auto-select first center
                                requiredWorkers: 2, // Reset default
                                customName: '' // Reset task name
                            }) : null);
                        }}
                     >
                        <option value="">Seleccionar Cliente</option>
                        {planning.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                     </select>
                 </div>

                 {/* 2. SELECCIÓN DE SEDE (Si hay cliente seleccionado) */}
                 {editingJob.clientId && (
                     <div>
                         <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Sede / Centro</label>
                         <select 
                            className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-100" 
                            value={editingJob.centerId} 
                            onChange={e => setEditingJob({...editingJob, centerId: e.target.value})}
                         >
                            {planning.clients.find(c => c.id === editingJob.clientId)?.centers.map(center => (
                                <option key={center.id} value={center.id}>{center.name} - {center.address}</option>
                            ))}
                         </select>
                     </div>
                 )}

                 {/* 3. SELECCIÓN DE TAREA (Plantilla + Texto Libre) */}
                 <div className="grid grid-cols-1 gap-2">
                     <label className="text-[10px] font-black uppercase text-slate-400 block">Tarea a Realizar</label>
                     
                     {/* Selector de Plantilla */}
                     <select 
                        className="w-full p-2 bg-slate-50 rounded-xl font-bold text-xs text-slate-500 outline-none border border-transparent hover:border-slate-200 transition-colors"
                        onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            
                            // Buscar en Tareas Cliente
                            const client = planning.clients.find(c => c.id === editingJob.clientId);
                            const regularTask = client?.regularTasks?.find(t => t.id === val);
                            
                            if (regularTask) {
                                setEditingJob({
                                    ...editingJob,
                                    customName: regularTask.name,
                                    requiredWorkers: regularTask.defaultWorkers,
                                    type: regularTask.category
                                });
                                return;
                            }

                            // Buscar en Tareas Estándar Globales
                            const stdTask = planning.standardTasks.find(t => t.id === val);
                            if (stdTask) {
                                setEditingJob({
                                    ...editingJob,
                                    customName: stdTask.name,
                                    requiredWorkers: stdTask.defaultWorkers,
                                    type: JobType.DESCARGA // Default or inferred
                                });
                            }
                        }}
                        defaultValue=""
                     >
                        <option value="" disabled>-- Cargar Plantilla (Opcional) --</option>
                        
                        {/* Tareas del Cliente */}
                        {planning.clients.find(c => c.id === editingJob.clientId)?.regularTasks?.length ? (
                            <optgroup label="Tareas Habituales Cliente">
                                {planning.clients.find(c => c.id === editingJob.clientId)?.regularTasks.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} ({t.defaultWorkers} ops)</option>
                                ))}
                            </optgroup>
                        ) : null}

                        {/* Tareas Estándar */}
                        <optgroup label="Tareas Estándar">
                            {planning.standardTasks.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.defaultWorkers} ops)</option>
                            ))}
                        </optgroup>
                     </select>

                     {/* Input Texto Libre */}
                     <input 
                        type="text" 
                        placeholder="Nombre de la tarea o referencia..." 
                        className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-100" 
                        value={editingJob.customName || ''} 
                        onChange={e => setEditingJob({...editingJob, customName: e.target.value})} 
                     />
                 </div>

                 {/* 4. HORARIO Y OPERARIOS */}
                 <div className="flex gap-4">
                    <div className="flex-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Horario Previsto</label>
                        <div className="flex gap-2">
                            <input type="time" className="flex-1 p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none" value={editingJob.startTime} onChange={e => setEditingJob({...editingJob, startTime: e.target.value})} />
                            <input type="time" className="flex-1 p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none" value={editingJob.endTime} onChange={e => setEditingJob({...editingJob, endTime: e.target.value})} />
                        </div>
                    </div>
                    <div className="w-24">
                        <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Operarios</label>
                        <input type="number" min="1" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none text-center" value={editingJob.requiredWorkers} onChange={e => setEditingJob({...editingJob, requiredWorkers: parseInt(e.target.value) || 1})} />
                    </div>
                 </div>

                 {/* 5. ESTADOS Y ACCIONES (Finalizar / Anular) */}
                 <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                     {/* Finalizar Manualmente */}
                     <div className={`p-3 rounded-xl border transition-all ${editingJob.isFinished ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input 
                                type="checkbox" 
                                className="w-4 h-4 text-blue-600 rounded" 
                                checked={editingJob.isFinished || false} 
                                onChange={e => setEditingJob({
                                    ...editingJob, 
                                    isFinished: e.target.checked, 
                                    isCancelled: false, // Mutually exclusive usually
                                    actualEndTime: e.target.checked ? (editingJob.actualEndTime || editingJob.endTime) : undefined 
                                })} 
                            />
                            <span className={`text-xs font-black uppercase ${editingJob.isFinished ? 'text-blue-700' : 'text-slate-500'}`}>Finalizada</span>
                        </label>
                        {editingJob.isFinished && (
                            <div className="animate-in fade-in slide-in-from-top-1">
                                <label className="text-[9px] font-bold text-blue-400 uppercase block mb-1">Hora Real Fin</label>
                                <input 
                                    type="time" 
                                    className="w-full p-1.5 bg-white rounded-lg font-bold text-xs text-blue-900 outline-none border border-blue-100" 
                                    value={editingJob.actualEndTime || ''} 
                                    onChange={e => setEditingJob({...editingJob, actualEndTime: e.target.value})} 
                                />
                            </div>
                        )}
                     </div>

                     {/* Anular */}
                     <div className={`p-3 rounded-xl border transition-all ${editingJob.isCancelled ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input 
                                type="checkbox" 
                                className="w-4 h-4 text-red-600 rounded" 
                                checked={editingJob.isCancelled || false} 
                                onChange={e => setEditingJob({
                                    ...editingJob, 
                                    isCancelled: e.target.checked, 
                                    isFinished: false, // Mutually exclusive
                                    cancellationReason: e.target.checked ? (editingJob.cancellationReason || '') : undefined
                                })} 
                            />
                            <span className={`text-xs font-black uppercase ${editingJob.isCancelled ? 'text-red-700' : 'text-slate-500'}`}>Anular Tarea</span>
                        </label>
                        {editingJob.isCancelled && (
                            <div className="animate-in fade-in slide-in-from-top-1">
                                <input 
                                    type="text" 
                                    placeholder="Motivo anulación..." 
                                    className="w-full p-1.5 bg-white rounded-lg font-bold text-xs text-red-900 outline-none border border-red-100 placeholder:text-red-300" 
                                    value={editingJob.cancellationReason || ''} 
                                    onChange={e => setEditingJob({...editingJob, cancellationReason: e.target.value})} 
                                />
                            </div>
                        )}
                     </div>
                 </div>
                 
                 {/* Albarán / Referencia Extra */}
                 <div className="grid grid-cols-2 gap-4">
                    <input type="text" placeholder="Nº Albarán (Opcional)" className="p-3 bg-slate-50 rounded-xl font-bold text-xs outline-none" value={editingJob.deliveryNote || ''} onChange={e => setEditingJob({...editingJob, deliveryNote: e.target.value})} />
                    <input type="text" placeholder="Ref. Interna (Opcional)" className="p-3 bg-slate-50 rounded-xl font-bold text-xs outline-none" value={editingJob.ref || ''} onChange={e => setEditingJob({...editingJob, ref: e.target.value})} />
                 </div>

              </div>

              <div className="flex justify-end gap-3 mt-8">
                 {editingJob.id.startsWith('j-') && (
                    <button 
                        onClick={() => {
                            if(window.confirm('¿Eliminar tarea definitivamente?')) deleteJob(editingJob.id);
                        }} 
                        className="px-4 py-3 bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl mr-auto transition-colors"
                        title="Eliminar"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                 )}
                 <button onClick={() => setEditingJob(null)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
                 <button onClick={() => saveJob(editingJob)} className="px-8 py-3 rounded-xl font-bold bg-slate-900 text-white shadow-lg hover:bg-slate-800 transition-all transform hover:scale-[1.02] active:scale-95">Guardar</button>
              </div>
           </div>
        </div>
      )}

      {/* NUEVO: Modal de Edición de Cliente AVANZADO */}
      {editingClient && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingClient(null)}>
           <div className="bg-white w-full max-w-4xl rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black text-slate-900 uppercase italic">Ficha de Cliente</h2>
                 <button onClick={() => setEditingClient(null)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              
              <div className="flex-1 space-y-8 overflow-y-auto custom-scrollbar pr-2">
                 
                 {/* 1. Identidad */}
                 <section className="space-y-4">
                    <div className="flex items-start gap-6">
                       <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-300">
                          <input 
                             type="text" 
                             maxLength={3} 
                             className="w-full h-full bg-transparent text-center text-xl font-black uppercase placeholder:text-slate-300 outline-none"
                             placeholder="IMG" 
                             value={editingClient.logo} 
                             onChange={e => setEditingClient({...editingClient, logo: e.target.value.toUpperCase()})}
                          />
                       </div>
                       <div className="flex-1 grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                             <label className="text-[10px] font-black uppercase text-slate-400">Nombre Fiscal</label>
                             <input type="text" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingClient.name} onChange={e => setEditingClient({...editingClient, name: e.target.value})} />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-black uppercase text-slate-400">CIF / NIF</label>
                             <input type="text" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingClient.cif} onChange={e => setEditingClient({...editingClient, cif: e.target.value})} />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-black uppercase text-slate-400">Prioridad (1 Alta - 3 Baja)</label>
                             <select className="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none" value={editingClient.priority} onChange={e => setEditingClient({...editingClient, priority: parseInt(e.target.value)})}>
                                <option value={1}>1 - Crítica</option>
                                <option value={2}>2 - Normal</option>
                                <option value={3}>3 - Baja</option>
                             </select>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-black uppercase text-slate-400">Ubicación General</label>
                             <input type="text" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingClient.location} onChange={e => setEditingClient({...editingClient, location: e.target.value})} />
                          </div>
                       </div>
                    </div>
                 </section>

                 <hr className="border-slate-100" />

                 {/* 2. Contacto */}
                 <section>
                    <h3 className="text-sm font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> Datos de Contacto</h3>
                    <div className="grid grid-cols-3 gap-4">
                       <input type="text" placeholder="Persona Contacto" className="p-3 bg-slate-50 rounded-xl font-bold text-xs" value={editingClient.contactPerson} onChange={e => setEditingClient({...editingClient, contactPerson: e.target.value})} />
                       <input type="text" placeholder="Teléfono" className="p-3 bg-slate-50 rounded-xl font-bold text-xs" value={editingClient.phone} onChange={e => setEditingClient({...editingClient, phone: e.target.value})} />
                       <input type="email" placeholder="Email" className="p-3 bg-slate-50 rounded-xl font-bold text-xs" value={editingClient.email} onChange={e => setEditingClient({...editingClient, email: e.target.value})} />
                    </div>
                 </section>

                 {/* 3. Sedes */}
                 <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                       <h3 className="text-sm font-black uppercase text-slate-600 flex items-center gap-2"><MapPin className="w-4 h-4" /> Sedes y Centros</h3>
                       <button onClick={() => setEditingClient({...editingClient, centers: [...editingClient.centers, { id: `ct-${Date.now()}`, name: '', address: '', publicTransport: false }]})} className="text-blue-600 text-[10px] font-black uppercase hover:underline">+ Añadir Sede</button>
                    </div>
                    <div className="space-y-3">
                       {editingClient.centers.map((center, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-12 gap-3 items-center group">
                             <div className="col-span-3">
                                <input type="text" placeholder="Nombre Sede" className="w-full text-xs font-bold outline-none placeholder:text-slate-300" value={center.name} onChange={(e) => {
                                   const newCenters = [...editingClient.centers];
                                   newCenters[idx].name = e.target.value;
                                   setEditingClient({...editingClient, centers: newCenters});
                                }} />
                             </div>
                             <div className="col-span-6 border-l border-slate-100 pl-3">
                                <input type="text" placeholder="Dirección Completa" className="w-full text-xs text-slate-500 outline-none placeholder:text-slate-300" value={center.address} onChange={(e) => {
                                   const newCenters = [...editingClient.centers];
                                   newCenters[idx].address = e.target.value;
                                   setEditingClient({...editingClient, centers: newCenters});
                                }} />
                             </div>
                             <div className="col-span-2 flex justify-center">
                                <button 
                                   onClick={() => {
                                      const newCenters = [...editingClient.centers];
                                      newCenters[idx].publicTransport = !newCenters[idx].publicTransport;
                                      setEditingClient({...editingClient, centers: newCenters});
                                   }}
                                   className={`p-1.5 rounded-lg transition-colors ${center.publicTransport ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}
                                   title="Tiene Transporte Público"
                                >
                                   <Bus className="w-4 h-4" />
                                </button>
                             </div>
                             <div className="col-span-1 flex justify-end">
                                <button onClick={() => {
                                   const newCenters = editingClient.centers.filter((_, i) => i !== idx);
                                   setEditingClient({...editingClient, centers: newCenters});
                                }} className="text-slate-300 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                             </div>
                          </div>
                       ))}
                       {editingClient.centers.length === 0 && <p className="text-center text-xs text-slate-400 italic py-4">No hay sedes registradas</p>}
                    </div>
                 </section>

                 {/* 4. Tareas Habituales */}
                 <section className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                    <div className="flex justify-between items-center mb-4">
                       <h3 className="text-sm font-black uppercase text-blue-800 flex items-center gap-2"><Briefcase className="w-4 h-4" /> Tareas Habituales</h3>
                       <button onClick={() => setEditingClient({...editingClient, regularTasks: [...(editingClient.regularTasks || []), { id: `rt-${Date.now()}`, name: '', defaultWorkers: 2, category: JobType.DESCARGA }]})} className="text-blue-600 text-[10px] font-black uppercase hover:underline">+ Añadir Tarea</button>
                    </div>
                    <div className="space-y-3">
                       {(editingClient.regularTasks || []).map((task, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-2xl border border-blue-100 shadow-sm grid grid-cols-12 gap-3 items-center">
                             <div className="col-span-5">
                                <input type="text" placeholder="Nombre Tarea" className="w-full text-xs font-bold outline-none" value={task.name} onChange={(e) => {
                                   const newTasks = [...(editingClient.regularTasks || [])];
                                   newTasks[idx].name = e.target.value;
                                   setEditingClient({...editingClient, regularTasks: newTasks});
                                }} />
                             </div>
                             <div className="col-span-4">
                                <select className="w-full text-[10px] font-bold uppercase bg-transparent outline-none" value={task.category} onChange={(e) => {
                                   const newTasks = [...(editingClient.regularTasks || [])];
                                   newTasks[idx].category = e.target.value as JobType;
                                   setEditingClient({...editingClient, regularTasks: newTasks});
                                }}>
                                   {Object.values(JobType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                             </div>
                             <div className="col-span-2 flex items-center gap-2">
                                <Users className="w-3 h-3 text-slate-400" />
                                <input type="number" className="w-12 text-xs font-bold bg-slate-50 rounded p-1 text-center" value={task.defaultWorkers} onChange={(e) => {
                                   const newTasks = [...(editingClient.regularTasks || [])];
                                   newTasks[idx].defaultWorkers = parseInt(e.target.value);
                                   setEditingClient({...editingClient, regularTasks: newTasks});
                                }} />
                             </div>
                             <div className="col-span-1 flex justify-end">
                                <button onClick={() => {
                                   const newTasks = (editingClient.regularTasks || []).filter((_, i) => i !== idx);
                                   setEditingClient({...editingClient, regularTasks: newTasks});
                                }} className="text-slate-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                             </div>
                          </div>
                       ))}
                    </div>
                 </section>

                 <div className="grid grid-cols-2 gap-8">
                    {/* 5. Formación Exigida */}
                    <section>
                       <h3 className="text-sm font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Formación Exigida</h3>
                       <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 h-48 overflow-y-auto custom-scrollbar">
                          {planning.availableCourses.map(course => (
                             <label key={course} className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-white p-2 rounded-lg transition-colors">
                                <input 
                                   type="checkbox" 
                                   className="w-4 h-4 text-slate-900 rounded"
                                   checked={(editingClient.requiredCourses || []).includes(course)}
                                   onChange={(e) => {
                                      const current = editingClient.requiredCourses || [];
                                      let updated;
                                      if (e.target.checked) updated = [...current, course];
                                      else updated = current.filter(c => c !== course);
                                      setEditingClient({...editingClient, requiredCourses: updated});
                                   }}
                                />
                                <span className="text-xs font-bold text-slate-600">{course}</span>
                             </label>
                          ))}
                       </div>
                    </section>

                    {/* 6. Configuración */}
                    <section>
                       <h3 className="text-sm font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><Settings className="w-4 h-4" /> Configuración</h3>
                       <div className="space-y-3">
                          <label className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100 cursor-pointer">
                             <span className="text-xs font-bold text-slate-700">Permitir Tareas Texto Libre</span>
                             <div className={`w-10 h-6 rounded-full p-1 transition-colors ${editingClient.allowFreeTextTask ? 'bg-green-500' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${editingClient.allowFreeTextTask ? 'translate-x-4' : ''}`} />
                             </div>
                             <input type="checkbox" className="hidden" checked={editingClient.allowFreeTextTask} onChange={e => setEditingClient({...editingClient, allowFreeTextTask: e.target.checked})} />
                          </label>
                       </div>
                    </section>
                 </div>

              </div>

              {/* Footer Buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-100">
                 {editingClient.id.startsWith('c-') && <button onClick={() => deleteClient(editingClient.id)} className="px-4 py-3 bg-red-50 text-red-500 rounded-xl mr-auto hover:bg-red-100 transition-colors"><Trash2 className="w-5 h-5" /></button>}
                 <button onClick={() => setEditingClient(null)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
                 <button onClick={() => saveClient(editingClient)} className="px-6 py-3 rounded-xl font-bold bg-slate-900 text-white hover:shadow-lg transition-all">Guardar Ficha</button>
              </div>
           </div>
        </div>
      )}

      {/* NUEVO: Modal de Tarea Estándar (FALTABA) */}
      {editingStandardTask && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingStandardTask(null)}>
            <div className="bg-white p-8 rounded-[32px] shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-black text-slate-900 mb-6 uppercase italic">Editar Tarea Estándar</h2>
                <div className="space-y-4">
                    <input type="text" placeholder="Nombre Tarea" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingStandardTask.name} onChange={e => setEditingStandardTask({...editingStandardTask, name: e.target.value})} />
                    <input type="number" placeholder="Operarios por defecto" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingStandardTask.defaultWorkers} onChange={e => setEditingStandardTask({...editingStandardTask, defaultWorkers: parseInt(e.target.value)})} />
                    <input type="text" placeholder="Paquetería (ej: 300-500)" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingStandardTask.packages} onChange={e => setEditingStandardTask({...editingStandardTask, packages: e.target.value})} />
                    <input type="text" placeholder="Referencias (ej: General, SKU-A)" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingStandardTask.refs} onChange={e => setEditingStandardTask({...editingStandardTask, refs: e.target.value})} />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    {editingStandardTask.id.startsWith('st-') && <button onClick={() => deleteStandardTask(editingStandardTask.id)} className="px-4 py-3 bg-red-50 text-red-500 rounded-xl mr-auto"><Trash2 className="w-5 h-5" /></button>}
                    <button onClick={() => setEditingStandardTask(null)} className="px-6 py-3 rounded-xl font-bold text-slate-500">Cancelar</button>
                    <button onClick={() => saveStandardTask(editingStandardTask)} className="px-6 py-3 rounded-xl font-bold bg-slate-900 text-white">Guardar</button>
                </div>
            </div>
        </div>
      )}

      {/* Worker Modal - ADVANCED with Fuel & Notes */}
      {editingWorker && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingWorker(null)}>
           <div className="bg-white w-full max-w-2xl rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black text-slate-900 uppercase italic">Editar Operario</h2>
                 <button onClick={() => setEditingWorker(null)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              
              <div className="flex-1 space-y-8 overflow-y-auto custom-scrollbar pr-2">
                 {/* Datos Básicos */}
                 <section className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="Nombre" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingWorker.name} onChange={e => setEditingWorker({...editingWorker, name: e.target.value})} />
                        <input type="text" placeholder="Código" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingWorker.code} onChange={e => setEditingWorker({...editingWorker, code: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="DNI" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingWorker.dni} onChange={e => setEditingWorker({...editingWorker, dni: e.target.value})} />
                        <input type="text" placeholder="Teléfono" className="w-full p-3 bg-slate-50 rounded-xl font-bold" value={editingWorker.phone} onChange={e => setEditingWorker({...editingWorker, phone: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <select className="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none" value={editingWorker.role} onChange={e => setEditingWorker({...editingWorker, role: e.target.value})}>
                            {WORKER_ROLES.map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                        {/* SELECTOR DE CONTRATO ACTUALIZADO */}
                        <select className="w-full p-3 bg-slate-50 rounded-xl font-bold outline-none" value={editingWorker.contractType} onChange={e => setEditingWorker({...editingWorker, contractType: e.target.value as ContractType})}>
                            <option value={ContractType.INDEFINIDO}>Indefinido</option>
                            <option value={ContractType.FIJO_DISCONTINUO}>Fijo Discontinuo</option>
                            <option value={ContractType.AUTONOMO}>Autónomo</option>
                            <option value={ContractType.AUTONOMA_COLABORADORA}>Autónoma Colaboradora</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl">
                            <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" checked={editingWorker.hasVehicle} onChange={e => setEditingWorker({...editingWorker, hasVehicle: e.target.checked})} />
                            <span className="text-xs font-black uppercase text-slate-600">Vehículo Propio</span>
                        </label>
                         <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl">
                            <input type="checkbox" className="w-4 h-4 text-slate-400 rounded" checked={editingWorker.isArchived || false} onChange={e => setEditingWorker({...editingWorker, isArchived: e.target.checked})} />
                            <span className="text-xs font-black uppercase text-slate-400">Archivado</span>
                        </label>
                    </div>
                 </section>

                 {/* ... (Resto del modal sin cambios) ... */}
                 
                 {/* Formación y Cursos */}
                 <section className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><GraduationCap className="w-4 h-4" /></div>
                        <h3 className="text-sm font-black uppercase text-blue-800 tracking-widest">Formación y Cursos</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {planning.availableCourses.map(course => (
                            <label key={course} className="flex items-center gap-2 cursor-pointer bg-white p-3 rounded-xl border border-blue-100 hover:border-blue-300 transition-all">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                                    checked={editingWorker.completedCourses?.includes(course) || false}
                                    onChange={(e) => {
                                        const current = editingWorker.completedCourses || [];
                                        let updated;
                                        if (e.target.checked) {
                                            updated = [...current, course];
                                        } else {
                                            updated = current.filter(c => c !== course);
                                        }
                                        setEditingWorker({...editingWorker, completedCourses: updated});
                                    }}
                                />
                                <span className="text-[10px] font-bold text-slate-700 uppercase">{course}</span>
                            </label>
                        ))}
                    </div>
                 </section>

                 {/* Control de Gasolina (NUEVO) */}
                 {planning.workers.some(w => w.id === editingWorker.id) && (
                    <section className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Fuel className="w-4 h-4" /></div>
                            <h3 className="text-sm font-black uppercase text-amber-800 tracking-widest">Control Combustible</h3>
                        </div>
                        
                        <div className="bg-white p-4 rounded-2xl border border-amber-100 mb-4">
                            <div className="grid grid-cols-3 gap-3 mb-3">
                                <input type="date" className="bg-slate-50 rounded-lg px-2 py-1.5 text-xs font-bold" value={newFuelRecord.date} onChange={e => setNewFuelRecord({...newFuelRecord, date: e.target.value})} />
                                <input type="number" step="0.01" placeholder="Litros (Opcional)" className="bg-slate-50 rounded-lg px-2 py-1.5 text-xs font-bold" value={newFuelRecord.liters} onChange={e => setNewFuelRecord({...newFuelRecord, liters: e.target.value})} />
                                <input type="number" step="0.01" placeholder="€ Coste" className="bg-slate-50 rounded-lg px-2 py-1.5 text-xs font-bold" value={newFuelRecord.cost} onChange={e => setNewFuelRecord({...newFuelRecord, cost: e.target.value})} />
                            </div>
                            <button onClick={handleAddFuel} className="w-full bg-amber-500 text-white py-2 rounded-xl text-[10px] font-black uppercase hover:bg-amber-600">Registrar Repostaje</button>
                        </div>

                        <div className="max-h-[150px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                             {planning.fuelRecords?.filter(fr => fr.workerId === editingWorker.id).map(fr => (
                                 <div key={fr.id} className="flex justify-between items-center p-2 bg-white rounded-xl border border-slate-100 text-xs">
                                     <span className="font-bold text-slate-500">{formatDateDMY(fr.date)}</span>
                                     <span className="font-black text-slate-800">
                                         {fr.liters ? `${fr.liters}L - ` : ''}{fr.cost}€
                                     </span>
                                     <button onClick={() => handleDeleteFuel(fr.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                                 </div>
                             ))}
                             {(planning.fuelRecords?.filter(fr => fr.workerId === editingWorker.id).length || 0) === 0 && (
                                 <p className="text-center text-[10px] text-slate-400 italic">Sin registros</p>
                             )}
                        </div>
                    </section>
                 )}

                 {/* Historial Notas */}
                 <section className="border-t border-slate-100 pt-6">
                    <h3 className="text-xs font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><StickyNote className="w-4 h-4" /> Notas y Observaciones</h3>
                     <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                         {planning.dailyNotes?.filter(n => n.workerId === editingWorker.id).map(note => (
                             <div key={note.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                                 <div className="flex justify-between mb-1">
                                     <span className="font-black text-slate-400 uppercase text-[9px]">{formatDateDMY(note.date)}</span>
                                     {note.type === 'medical' && <Stethoscope className="w-3 h-3 text-red-500" />}
                                 </div>
                                 <p className="font-bold text-slate-700">{note.text}</p>
                             </div>
                         ))}
                     </div>
                 </section>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-100">
                 {planning.workers.some(w => w.id === editingWorker.id) && (
                    <button onClick={() => setConfirmDeleteId(editingWorker.id)} className="px-4 py-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors mr-auto"><Trash2 className="w-5 h-5" /></button>
                 )}
                 <button onClick={() => setEditingWorker(null)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                 <button onClick={() => saveWorker(editingWorker)} className="px-6 py-3 rounded-xl font-bold bg-slate-900 text-white shadow-lg">Guardar</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL BACKUP (IMPORT) - Asegurado z-index y visibilidad */}
      {showBackupModal && (
         <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowBackupModal(false)}>
            <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
               <h3 className="text-lg font-black text-slate-900 italic uppercase mb-4">Base de Datos</h3>
               <div className="space-y-3">
                  <button onClick={exportBackup} className="w-full py-4 bg-slate-100 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center gap-2"><DownloadCloud className="w-4 h-4" /> Exportar Backup JSON</button>
                  <button onClick={exportDatabaseToExcel} className="w-full py-4 bg-green-50 rounded-2xl font-black text-xs uppercase tracking-widest text-green-600 hover:bg-green-100 flex items-center justify-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Exportar Todo a Excel</button>
                  <button onClick={() => backupInputRef.current?.click()} className="w-full py-4 bg-slate-100 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> Importar Excel / JSON</button>
                  <button onClick={downloadExcelTemplate} className="w-full py-4 bg-purple-50 rounded-2xl font-black text-xs uppercase tracking-widest text-purple-600 hover:bg-purple-100 flex items-center justify-center gap-2"><Table className="w-4 h-4" /> Descargar Plantilla</button>
               </div>
            </div>
         </div>
      )}

      {/* CORRECCIÓN: AÑADIR MODAL DE CALENDARIO */}
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

      {/* CORRECCIÓN: AÑADIR MODAL DE NOTIFICACIONES WHATSAPP */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowNotificationsModal(false)}>
           <div className="bg-white w-full max-w-4xl h-[80vh] rounded-[32px] shadow-2xl flex overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              
              {(() => {
                  const dailyJobs = planning.jobs.filter(j => j.date === planning.currentDate && !j.isCancelled);
                  const notifiedList = planning.notifications[planning.currentDate] || [];
                  const workerIds = Array.from(new Set(dailyJobs.flatMap(j => j.assignedWorkerIds)));
                  const pendingCount = workerIds.filter(wid => !notifiedList.includes(wid)).length;
                  
                  return (
                    <>
                      <div className="w-1/3 bg-slate-50 border-r border-slate-100 flex flex-col">
                         <div className="p-6 border-b border-slate-100">
                            <h2 className="text-lg font-black text-slate-900 italic uppercase">Central Avisos</h2>
                            <div className="flex justify-between items-end mt-1">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{formatDateDisplay(planning.currentDate)}</p>
                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${pendingCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                                    {pendingCount} Pendientes
                                </span>
                            </div>
                         </div>
                         <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {workerIds.length === 0 ? <p className="text-center text-xs text-slate-400 py-4">No hay operarios asignados hoy</p> : 
                                workerIds.map(wid => {
                                  const worker = planning.workers.find(w => w.id === wid);
                                  if (!worker) return null;
                                  const isNotified = notifiedList.includes(wid);
                                  const isSelected = selectedNotifyWorkerId === wid;
                                  return (
                                     <button 
                                        key={wid}
                                        onClick={() => {
                                           setSelectedNotifyWorkerId(wid);
                                           const jobs = dailyJobs.filter(j => j.assignedWorkerIds.includes(wid));
                                           if (jobs.length > 0) {
                                              const job = jobs[0];
                                              const client = planning.clients.find(c => c.id === job.clientId);
                                              const center = client?.centers.find(ct => ct.id === job.centerId);
                                              if (client) {
                                                 setWhatsappPreviewText(generateWhatsAppMessage(worker, job, center, client));
                                              }
                                           }
                                        }}
                                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${isSelected ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white border-slate-200 hover:border-blue-300'}`}
                                     >
                                        <div className="flex items-center gap-3">
                                           <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${isNotified ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                                              {worker.code}
                                           </div>
                                           <div>
                                              <p className="text-xs font-black text-slate-900 truncate max-w-[100px]">{worker.name.split(' ')[0]}</p>
                                              <p className="text-[9px] font-bold text-slate-400 uppercase">{isNotified ? 'Notificado' : 'Pendiente'}</p>
                                           </div>
                                        </div>
                                        {isNotified && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                     </button>
                                  );
                                })
                            }
                         </div>
                      </div>

                      <div className="flex-1 flex flex-col bg-white">
                         <div className="flex-1 p-8 flex flex-col">
                            {selectedNotifyWorkerId ? (
                               <>
                                  <h3 className="text-sm font-black uppercase text-slate-400 mb-4 flex items-center gap-2">
                                     <MessageCircle className="w-4 h-4" /> Vista Previa Mensaje
                                  </h3>
                                  <textarea 
                                     className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm font-medium text-slate-700 leading-relaxed focus:outline-none focus:ring-4 focus:ring-blue-50 resize-none mb-6"
                                     value={whatsappPreviewText}
                                     onChange={(e) => setWhatsappPreviewText(e.target.value)}
                                  />
                                  <div className="flex justify-end gap-4">
                                     {(() => {
                                         const isSelectedNotified = notifiedList.includes(selectedNotifyWorkerId);
                                         return (
                                             <button 
                                                onClick={() => {
                                                   toggleNotificationStatus(selectedNotifyWorkerId, planning.currentDate, !isSelectedNotified);
                                                }}
                                                className={`px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-3 ${isSelectedNotified ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                                             >
                                                {isSelectedNotified ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                                {isSelectedNotified ? 'Desmarcar' : 'Marcar Manual'}
                                             </button>
                                         );
                                     })()}
                                     
                                     <button 
                                        onClick={() => {
                                           const worker = planning.workers.find(w => w.id === selectedNotifyWorkerId);
                                           if (worker) {
                                              openWhatsApp(worker, whatsappPreviewText);
                                              toggleNotificationStatus(worker.id, planning.currentDate, true);
                                           }
                                        }}
                                        className="bg-[#25D366] hover:bg-[#128C7E] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center gap-3"
                                     >
                                        <Send className="w-4 h-4" /> Enviar WhatsApp
                                     </button>
                                  </div>
                               </>
                            ) : (
                               <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50">
                                  <MessageCircle className="w-16 h-16 mb-4" />
                                  <p className="text-xs font-black uppercase tracking-widest">Selecciona un operario</p>
                               </div>
                            )}
                         </div>
                         <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button onClick={() => setShowNotificationsModal(false)} className="px-6 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">Cerrar</button>
                         </div>
                      </div>
                    </>
                  );
              })()}

           </div>
        </div>
      )}

    </div>
  );
};

export default App;