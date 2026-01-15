
import React, { useState, useMemo } from 'react';
import { 
  BarChart3, Users, Clock, CalendarDays, Filter, Building2, MapPin, 
  TrendingUp, Activity, Calculator, ArrowRight, Ban, X, FileText, AlertCircle, Download, FileSpreadsheet, User, Briefcase, CheckCircle2, Stethoscope, StickyNote
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlanningState, Job, Worker, NoteType } from '../types';
import { formatDateDMY } from '../utils';

interface StatisticsPanelProps {
  planning: PlanningState;
}

const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ planning }) => {
  // FECHAS POR DEFECTO: Primer y último día del mes actual
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [selectedCenterId, setSelectedCenterId] = useState<string>('all');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all'); 
  
  const [showCancelledDetails, setShowCancelledDetails] = useState(false);

  const sortedWorkers = useMemo(() => {
    return [...planning.workers]
        .filter(w => !w.isArchived)
        .sort((a, b) => a.name.localeCompare(b.name));
  }, [planning.workers]);

  const jobsInScope = useMemo(() => {
    return planning.jobs.filter(job => {
      if (job.date < startDate || job.date > endDate) return false;
      if (selectedClientId !== 'all' && job.clientId !== selectedClientId) return false;
      if (selectedCenterId !== 'all' && job.centerId !== selectedCenterId) return false;
      if (selectedWorkerId !== 'all' && !job.assignedWorkerIds.includes(selectedWorkerId)) return false;
      return true;
    });
  }, [planning.jobs, startDate, endDate, selectedClientId, selectedCenterId, selectedWorkerId]);

  const activeJobs = useMemo(() => jobsInScope.filter(j => !j.isCancelled), [jobsInScope]);
  const cancelledJobs = useMemo(() => jobsInScope.filter(j => j.isCancelled), [jobsInScope]);

  const flattenedActivity = useMemo(() => {
    const activity: Array<{
      id: string;
      date: string;
      worker: Worker;
      job?: Job;
      clientName: string;
      centerName: string;
      isAbsence?: boolean;
      absenceType?: string;
      noteText?: string;
    }> = [];

    // 1. Agregar trabajos activos
    activeJobs.forEach(job => {
      const client = planning.clients.find(c => c.id === job.clientId);
      const center = client?.centers.find(ct => ct.id === job.centerId);

      job.assignedWorkerIds.forEach(workerId => {
        if (selectedWorkerId !== 'all' && workerId !== selectedWorkerId) return;

        const worker = planning.workers.find(w => w.id === workerId);
        if (worker) {
          activity.push({
            id: `${job.id}-${worker.id}`,
            date: job.date,
            worker,
            job,
            clientName: client?.name || '---',
            centerName: center?.name || '---'
          });
        }
      });
    });

    // 2. Agregar Ausencias (solo si hay un trabajador seleccionado)
    if (selectedWorkerId !== 'all') {
      const worker = planning.workers.find(w => w.id === selectedWorkerId);
      if (worker) {
        const notes = planning.dailyNotes?.filter(n => n.workerId === selectedWorkerId && n.date >= startDate && n.date <= endDate) || [];
        
        notes.forEach(note => {
          const text = note.text.toLowerCase();
          const isMedical = note.type === 'medical';
          const isVacation = text.includes('vacaciones') || text.includes('fiesta') || text.includes('permiso') || text.includes('ausencia') || text.includes('vaca');
          
          if (isMedical || isVacation) {
            activity.push({
              id: `absence-${note.id}`,
              date: note.date,
              worker,
              clientName: 'AUSENCIA',
              centerName: 'REGISTRO INTERNO',
              isAbsence: true,
              absenceType: isMedical ? 'BAJA MÉDICA' : 'VACACIONES / PERMISO',
              noteText: note.text
            });
          }
        });
      }
    }

    return activity.sort((a, b) => b.date.localeCompare(a.date) || a.worker.name.localeCompare(b.worker.name));
  }, [activeJobs, planning.workers, planning.clients, planning.dailyNotes, selectedWorkerId, startDate, endDate]);


  const stats = useMemo(() => {
    const uniqueWorkers = new Set<string>();
    const workersPerDay: Record<string, Set<string>> = {};
    let totalManHours = 0;

    activeJobs.forEach(job => {
      const effectiveEndTimeStr = (job.isFinished && job.actualEndTime) ? job.actualEndTime : job.endTime;
      
      const parseTime = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h + (m || 0) / 60;
      };

      const endDec = parseTime(effectiveEndTimeStr);

      job.assignedWorkerIds.forEach(wid => {
          if (selectedWorkerId === 'all' || wid === selectedWorkerId) {
              uniqueWorkers.add(wid);
              
              // CÁLCULO DE DURACIÓN INDIVIDUAL (REFUERZOS)
              const startDec = parseTime(job.workerTimes?.[wid] || job.startTime);
              let duration = endDec - startDec;
              if (duration < 0) duration = 0;
              totalManHours += duration;
          }
      });

      if (!workersPerDay[job.date]) {
        workersPerDay[job.date] = new Set();
      }
      job.assignedWorkerIds.forEach(wid => {
          if (selectedWorkerId === 'all' || wid === selectedWorkerId) {
              workersPerDay[job.date].add(wid);
          }
      });
    });

    const activeDays = Object.keys(workersPerDay).length;
    let sumDailyWorkers = 0;
    Object.values(workersPerDay).forEach(set => sumDailyWorkers += set.size);
    const averageDailyWorkers = activeDays > 0 ? (sumDailyWorkers / activeDays) : 0;

    return {
      totalUniqueWorkers: uniqueWorkers.size,
      averageDailyWorkers: averageDailyWorkers,
      totalManHours: totalManHours,
      activeDays
    };
  }, [activeJobs, selectedWorkerId]);

  const cancellationRate = jobsInScope.length > 0 
    ? ((cancelledJobs.length / jobsInScope.length) * 100).toFixed(1) 
    : "0.0";

  const selectedClient = planning.clients.find(c => c.id === selectedClientId);
  const selectedWorker = planning.workers.find(w => w.id === selectedWorkerId);

  const formatDateForExcel = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const exportStatsToExcel = () => {
    const wb = XLSX.utils.book_new();

    const summaryData = [
       { Concepto: 'Periodo Inicio', Valor: formatDateForExcel(startDate) },
       { Concepto: 'Periodo Fin', Valor: formatDateForExcel(endDate) },
       { Concepto: 'Cliente Filtrado', Valor: selectedClient ? selectedClient.name : 'TODOS' },
       { Concepto: 'Trabajador Filtrado', Valor: selectedWorker ? selectedWorker.name : 'TODOS' },
       { Concepto: '', Valor: '' },
       { Concepto: 'Operarios Únicos', Valor: stats.totalUniqueWorkers },
       { Concepto: 'Media Operarios/Día', Valor: stats.averageDailyWorkers.toFixed(2) },
       { Concepto: 'Horas Totales', Valor: stats.totalManHours.toFixed(2) },
       { Concepto: 'Servicios Realizados', Valor: activeJobs.length },
       { Concepto: 'Servicios Anulados', Valor: cancelledJobs.length },
       { Concepto: 'Tasa Cancelación', Valor: `${cancellationRate}%` }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen KPI");

    const detailedData = flattenedActivity.map(item => {
        if (item.isAbsence) {
           return {
            'Fecha': formatDateForExcel(item.date),
            'Código Operario': item.worker.code,
            'Nombre Operario': item.worker.name,
            'Cliente': 'AUSENCIA',
            'Sede': '-',
            'Tarea': item.absenceType,
            'Inicio': '-',
            'Fin': '-',
            'Duración (h)': '0.00',
            'Estado': 'AUSENCIA'
           };
        }
        const [h1, m1] = (item.job!.workerTimes?.[item.worker.id] || item.job!.startTime).split(':').map(Number);
        const [h2, m2] = (item.job!.isFinished && item.job!.actualEndTime ? item.job!.actualEndTime : item.job!.endTime).split(':').map(Number);
        let duration = (h2 + m2/60) - (h1 + m1/60);
        if(duration < 0) duration = 0;

        return {
            'Fecha': formatDateForExcel(item.date),
            'Código Operario': item.worker.code,
            'Nombre Operario': item.worker.name,
            'Cliente': item.clientName,
            'Sede': item.centerName,
            'Tarea': item.job!.customName || item.job!.type,
            'Inicio': item.job!.workerTimes?.[item.worker.id] || item.job!.startTime,
            'Fin': item.job!.isFinished && item.job!.actualEndTime ? item.job!.actualEndTime : item.job!.endTime,
            'Duración (h)': duration.toFixed(2),
            'Estado': item.job!.isFinished ? 'FINALIZADA' : 'PENDIENTE'
        };
    });
    const wsDetailed = XLSX.utils.json_to_sheet(detailedData);
    XLSX.utils.book_append_sheet(wb, wsDetailed, "Detalle Actividad Operarios");

    const fileName = `Informe_Completo_${formatDateForExcel(startDate).replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportActivityList = () => {
    const wb = XLSX.utils.book_new();
    const detailedData = flattenedActivity.map(item => {
        if (item.isAbsence) {
            return {
                'Fecha': formatDateForExcel(item.date),
                'Código Operario': item.worker.code,
                'Nombre Operario': item.worker.name,
                'Cliente': 'AUSENCIA',
                'Sede': '-',
                'Tarea': item.absenceType,
                'Horario': '-',
                'Estado': 'AUSENCIA'
            };
        }
        const startTime = item.job!.workerTimes?.[item.worker.id] || item.job!.startTime;
        const endTime = (item.job!.isFinished && item.job!.actualEndTime ? item.job!.actualEndTime : item.job!.endTime);
        return {
            'Fecha': formatDateForExcel(item.date),
            'Código Operario': item.worker.code,
            'Nombre Operario': item.worker.name,
            'Cliente': item.clientName,
            'Sede': item.centerName,
            'Tarea': item.job!.customName || item.job!.type,
            'Horario': `${startTime} - ${endTime}`,
            'Estado': item.job!.isFinished ? 'FINALIZADA' : 'PENDIENTE'
        };
    });
    const wsDetailed = XLSX.utils.json_to_sheet(detailedData);
    XLSX.utils.book_append_sheet(wb, wsDetailed, "Listado Operarios");
    XLSX.writeFile(wb, `Listado_Actividad_${startDate}.xlsx`);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 flex flex-col h-full custom-scrollbar">
      
      <div className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-20 shadow-sm">
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 text-white">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 italic uppercase tracking-tighter leading-none">Análisis Operativo</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Estadísticas y Rendimiento</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <div className="flex items-center gap-2">
                      <input type="date" className="text-[10px] font-bold text-slate-700 bg-transparent outline-none uppercase cursor-pointer" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <input type="date" className="text-[10px] font-bold text-slate-700 bg-transparent outline-none uppercase cursor-pointer" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                </div>

                <div className="w-px h-8 bg-slate-200 mx-1" />

                <div className="relative group">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <select 
                      className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-700 outline-none focus:border-blue-400 hover:border-blue-300 transition-all appearance-none cursor-pointer min-w-[140px]"
                      value={selectedClientId}
                      onChange={(e) => { setSelectedClientId(e.target.value); setSelectedCenterId('all'); }}
                  >
                    <option value="all">Todos los Clientes</option>
                    {planning.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none" />
                </div>

                <div className={`relative group ${selectedClientId === 'all' ? 'opacity-50 pointer-events-none' : ''}`}>
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <select 
                      className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-700 outline-none focus:border-blue-400 hover:border-blue-300 transition-all appearance-none cursor-pointer min-w-[140px]"
                      value={selectedCenterId}
                      onChange={(e) => setSelectedCenterId(e.target.value)}
                      disabled={selectedClientId === 'all'}
                  >
                    <option value="all">Todas las Sedes</option>
                    {selectedClient?.centers.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                  </select>
                  <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none" />
                </div>

                <div className="w-px h-8 bg-slate-200 mx-1" />

                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <select 
                      className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-700 outline-none focus:border-blue-400 hover:border-blue-300 transition-all appearance-none cursor-pointer min-w-[140px]"
                      value={selectedWorkerId}
                      onChange={(e) => setSelectedWorkerId(e.target.value)}
                  >
                    <option value="all">Todos los Operarios</option>
                    {sortedWorkers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none" />
                </div>

              </div>

              <button onClick={exportStatsToExcel} className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-2xl hover:bg-green-600 hover:text-white transition-all shadow-sm group" title="Descargar Informe Completo (KPI + Listados)">
                <FileSpreadsheet className="w-5 h-5" />
              </button>
            </div>
         </div>
      </div>

      <div className="p-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
           
           <div onClick={() => setShowCancelledDetails(false)} className={`bg-white rounded-[32px] p-6 border shadow-sm relative overflow-hidden group hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer ${!showCancelledDetails && selectedWorkerId === 'all' ? 'border-blue-200 ring-4 ring-blue-50' : 'border-slate-100'}`}>
              <div className="absolute right-0 top-0 w-32 h-32 bg-blue-50 rounded-full -mr-10 -mt-10 group-hover:bg-blue-100 transition-colors" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm mb-4">
                  {selectedWorkerId === 'all' ? <Users className="w-6 h-6" /> : <CalendarDays className="w-6 h-6" />}
                </div>
                {selectedWorkerId === 'all' ? (
                    <>
                        <h3 className="text-4xl font-[900] text-slate-900 mb-1">{stats.totalUniqueWorkers}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operarios Totales</p>
                    </>
                ) : (
                    <>
                        <h3 className="text-4xl font-[900] text-slate-900 mb-1">{stats.activeDays}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Días Trabajados</p>
                    </>
                )}
                <div className="mt-4 flex items-center gap-2">
                   <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase">
                       {selectedWorkerId === 'all' ? 'Recuento Único' : 'En periodo'}
                   </span>
                </div>
              </div>
           </div>

           <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <div className="absolute right-0 top-0 w-32 h-32 bg-purple-50 rounded-full -mr-10 -mt-10 group-hover:bg-purple-100 transition-colors" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-purple-600 shadow-sm mb-4">
                  <Activity className="w-6 h-6" />
                </div>
                {selectedWorkerId === 'all' ? (
                    <>
                        <h3 className="text-4xl font-[900] text-slate-900 mb-1">
                        {stats.averageDailyWorkers.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
                        </h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Media Empleados/Día</p>
                    </>
                ) : (
                    <>
                        <h3 className="text-4xl font-[900] text-slate-900 mb-1">
                            {activeJobs.length}
                        </h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Servicios Totales</p>
                    </>
                )}
                <div className="mt-4 flex items-center gap-2">
                   <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase">
                       {selectedWorkerId === 'all' ? `Base: ${stats.activeDays} días` : 'Asignados'}
                   </span>
                </div>
              </div>
           </div>

           <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-50 rounded-full -mr-10 -mt-10 group-hover:bg-emerald-100 transition-colors" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm mb-4">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">
                  {stats.totalManHours.toLocaleString('es-ES', { maximumFractionDigits: 2 })} h
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Horas {selectedWorkerId === 'all' ? 'Globales' : 'Trabajador'}</p>
                <div className="mt-4 flex items-center gap-2">
                   <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase">Realizadas</span>
                </div>
              </div>
           </div>

           <div onClick={() => setShowCancelledDetails(!showCancelledDetails)} className={`bg-white rounded-[32px] p-6 border shadow-sm relative overflow-hidden group hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer ${showCancelledDetails ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100'}`}>
              <div className="absolute right-0 top-0 w-32 h-32 bg-red-50 rounded-full -mr-10 -mt-10 group-hover:bg-red-100 transition-colors" />
              <div className="relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm mb-4 transition-colors ${showCancelledDetails ? 'bg-red-600 text-white' : 'bg-white text-red-600'}`}>
                  {showCancelledDetails ? <X className="w-6 h-6" /> : <Ban className="w-6 h-6" />}
                </div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">
                  {cancelledJobs.length}
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Servicios Anulados</p>
                <div className="mt-4 flex items-center gap-2">
                   <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-colors ${showCancelledDetails ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'}`}>
                      {showCancelledDetails ? 'Ver Detalle' : `Tasa: ${cancellationRate}%`}
                   </span>
                </div>
              </div>
           </div>

        </div>

        {showCancelledDetails ? (
           <div className="bg-white rounded-[32px] border border-red-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="p-8 border-b border-red-50 bg-red-50/30 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600">
                      <FileText className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="text-lg font-black text-red-900 uppercase italic">Registro de Anulaciones</h3>
                      <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Detalle de servicios cancelados en el periodo</p>
                   </div>
                </div>
                <button onClick={() => setShowCancelledDetails(false)} className="p-2 hover:bg-red-100 rounded-xl text-red-400 hover:text-red-700 transition-colors">
                   <X className="w-6 h-6" />
                </button>
              </div>

              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="bg-red-50/50 border-b border-red-100">
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase tracking-widest">Fecha</th>
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase tracking-widest">Horario</th>
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase tracking-widest">Cliente / Sede</th>
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase tracking-widest">Servicio Contratado</th>
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase tracking-widest text-center">Operarios</th>
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase tracking-widest">Motivo</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                       {cancelledJobs.length > 0 ? (
                          cancelledJobs.map(job => {
                             const client = planning.clients.find(c => c.id === job.clientId);
                             const center = client?.centers.find(ct => ct.id === job.centerId);
                             return (
                                <tr key={job.id} className="hover:bg-red-50/30 transition-colors">
                                   <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                         <CalendarDays className="w-4 h-4 text-red-300" />
                                         <span className="text-xs font-black text-slate-700">{formatDateDMY(job.date)}</span>
                                      </div>
                                   </td>
                                   <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                         <Clock className="w-4 h-4 text-red-300" />
                                         <span className="text-xs font-bold text-slate-500">{job.startTime} - {job.endTime}</span>
                                      </div>
                                   </td>
                                   <td className="px-6 py-4">
                                      <div>
                                         <p className="text-xs font-black text-slate-900">{client?.name || 'Desconocido'}</p>
                                         <p className="text-[9px] font-bold text-slate-400 uppercase">{center?.name || 'Sede Principal'}</p>
                                      </div>
                                   </td>
                                   <td className="px-6 py-4">
                                      <span className="text-xs font-bold text-slate-600 uppercase">{job.customName || job.type}</span>
                                   </td>
                                   <td className="px-6 py-4 text-center">
                                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 text-red-700 font-black text-xs">
                                         {job.requiredWorkers}
                                      </span>
                                   </td>
                                   <td className="px-6 py-4 max-w-xs">
                                      {job.cancellationReason ? (
                                         <p className="text-[10px] font-medium text-red-600 bg-red-50 p-2 rounded-lg italic">
                                            "{job.cancellationReason}"
                                         </p>
                                      ) : (
                                         <span className="text-[10px] text-slate-300 italic">Sin motivo especificado</span>
                                      )}
                                   </td>
                                </tr>
                             );
                          })
                       ) : (
                          <tr>
                             <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                                <p className="font-black uppercase text-xs tracking-widest">No hay anulaciones en este periodo</p>
                             </td>
                          </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        ) : (
            <div className="bg-white rounded-[32px] border border-blue-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                <div className="p-8 border-b border-blue-50 bg-blue-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-blue-900 uppercase italic">
                                {selectedWorkerId === 'all' ? 'Registro Actividad Operarios' : 'Historial Individual (Tareas y Ausencias)'}
                            </h3>
                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                                {selectedWorkerId === 'all' 
                                    ? 'Listado detallado de todas las asignaciones diarias' 
                                    : `${selectedWorker?.name} (${selectedWorker?.code})`
                                }
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={exportActivityList}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-sm"
                    >
                        <Download className="w-4 h-4" /> Exportar Listado
                    </button>
                </div>

                <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-left relative">
                        <thead className="sticky top-0 z-10">
                        <tr className="bg-blue-50 border-b border-blue-100">
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-50">Fecha</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-50">Operario</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-50">Cliente / Sede</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-50">Tarea / Ausencia</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-50">Horario / Nota</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-50 text-right">Estado</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-50">
                        {flattenedActivity.map(item => {
                            if (item.isAbsence) {
                               return (
                                <tr key={item.id} className="bg-amber-50/40 hover:bg-amber-100/50 transition-colors italic">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <CalendarDays className="w-4 h-4 text-amber-400" />
                                            <span className="text-xs font-black text-slate-700">{formatDateDMY(item.date)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center text-[9px] font-black text-amber-600">
                                                {item.worker.code}
                                            </div>
                                            <span className="text-xs font-bold text-slate-700">{item.worker.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-[10px] font-black text-amber-600 uppercase bg-white px-2 py-1 rounded border border-amber-100">AUSENCIA</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                           {item.absenceType?.includes('BAJA') ? <Stethoscope className="w-3 h-3 text-red-400" /> : <Briefcase className="w-3 h-3 text-blue-400" />}
                                           <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{item.absenceType}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-[10px] text-slate-500 font-medium truncate max-w-xs" title={item.noteText}>{item.noteText || '-'}</p>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-1 rounded-lg uppercase">REGISTRADA</span>
                                    </td>
                                </tr>
                               );
                            }
                            
                            const startTime = item.job!.workerTimes?.[item.worker.id] || item.job!.startTime;
                            const endTime = (item.job!.isFinished && item.job!.actualEndTime) ? item.job!.actualEndTime : item.job!.endTime;
                            return (
                                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <CalendarDays className="w-4 h-4 text-blue-300" />
                                            <span className="text-xs font-black text-slate-700">{formatDateDMY(item.date)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-600">
                                                {item.worker.code}
                                            </div>
                                            <span className="text-xs font-bold text-slate-700 truncate max-w-[150px]">{item.worker.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div>
                                            <p className="text-xs font-black text-slate-900">{item.clientName}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">{item.centerName}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-bold text-slate-700 uppercase bg-slate-100 px-2 py-1 rounded-lg truncate max-w-[150px] block">
                                            {item.job!.customName || item.job!.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3 h-3 text-slate-300" />
                                            <span className="text-xs font-bold text-slate-500">{startTime} - {endTime}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {item.job!.isFinished ? (
                                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 uppercase">
                                                <CheckCircle2 className="w-3 h-3" /> Finalizada
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg uppercase">
                                                Pendiente
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {flattenedActivity.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                    <Briefcase className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                                    <p className="font-black uppercase text-xs tracking-widest">No hay actividad registrada con los filtros actuales</p>
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default StatisticsPanel;
