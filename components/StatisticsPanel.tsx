
import React, { useState, useMemo } from 'react';
import { 
  BarChart3, Users, Clock, CalendarDays, Filter, Building2, MapPin, 
  TrendingUp, Activity, Calculator, ArrowRight, Ban, X, FileText, AlertCircle, Download, FileSpreadsheet, User, Briefcase, CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlanningState, Job, Worker } from '../types';
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

  // Workers sorted for dropdown - Aseguramos que existan datos
  const sortedWorkers = useMemo(() => {
    if (!planning.workers) return [];
    return [...planning.workers]
        .filter(w => !w.isArchived)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [planning.workers]);

  const selectedClient = useMemo(() => 
    planning.clients.find(c => c.id === selectedClientId), 
    [planning.clients, selectedClientId]
  );
  
  const selectedWorker = useMemo(() => 
    planning.workers.find(w => w.id === selectedWorkerId), 
    [planning.workers, selectedWorkerId]
  );

  // --- LÓGICA DE FILTRADO BASE ---
  const jobsInScope = useMemo(() => {
    return (planning.jobs || []).filter(job => {
      if (job.date < startDate || job.date > endDate) return false;
      if (selectedClientId !== 'all' && job.clientId !== selectedClientId) return false;
      if (selectedCenterId !== 'all' && job.centerId !== selectedCenterId) return false;
      if (selectedWorkerId !== 'all' && !job.assignedWorkerIds.includes(selectedWorkerId)) return false;
      return true;
    });
  }, [planning.jobs, startDate, endDate, selectedClientId, selectedCenterId, selectedWorkerId]);

  // --- SEPARACIÓN DE ESTADOS ---
  const activeJobs = useMemo(() => jobsInScope.filter(j => !j.isCancelled), [jobsInScope]);
  const cancelledJobs = useMemo(() => jobsInScope.filter(j => j.isCancelled), [jobsInScope]);

  // --- ACTIVIDAD APLANADA ---
  const flattenedActivity = useMemo(() => {
    const activity: Array<{
      id: string;
      date: string;
      worker: Worker;
      job: Job;
      clientName: string;
      centerName: string;
    }> = [];

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

    return activity.sort((a, b) => b.date.localeCompare(a.date) || a.worker.name.localeCompare(b.worker.name));
  }, [activeJobs, planning.workers, planning.clients, selectedWorkerId]);


  // --- CÁLCULOS ESTADÍSTICOS ---
  const stats = useMemo(() => {
    const uniqueWorkers = new Set<string>();
    const workersPerDay: Record<string, Set<string>> = {};
    let totalManHours = 0;

    activeJobs.forEach(job => {
      job.assignedWorkerIds.forEach(id => {
          if (selectedWorkerId === 'all' || id === selectedWorkerId) {
              uniqueWorkers.add(id);
          }
      });

      if (!workersPerDay[job.date]) {
        workersPerDay[job.date] = new Set();
      }
      job.assignedWorkerIds.forEach(id => {
          if (selectedWorkerId === 'all' || id === selectedWorkerId) {
              workersPerDay[job.date].add(id);
          }
      });

      const parseTime = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h + (m || 0) / 60;
      };

      const effectiveEndTimeStr = (job.isFinished && job.actualEndTime) ? job.actualEndTime : job.endTime;
      const startDec = parseTime(job.startTime);
      const endDec = parseTime(effectiveEndTimeStr);
      let duration = endDec - startDec;
      if (duration < 0) duration = 0; 

      const workersCount = selectedWorkerId === 'all' ? job.assignedWorkerIds.length : 1;
      totalManHours += duration * workersCount;
    });

    const activeDaysCount = Object.keys(workersPerDay).length;
    let sumDailyWorkers = 0;
    Object.values(workersPerDay).forEach(set => sumDailyWorkers += set.size);
    const averageDailyWorkers = activeDaysCount > 0 ? (sumDailyWorkers / activeDaysCount) : 0;

    return {
      totalUniqueWorkers: uniqueWorkers.size,
      averageDailyWorkers,
      totalManHours,
      activeDays: activeDaysCount
    };
  }, [activeJobs, selectedWorkerId]);

  const cancellationRate = jobsInScope.length > 0 
    ? ((cancelledJobs.length / jobsInScope.length) * 100).toFixed(1) 
    : "0.0";

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
        const [h1, m1] = item.job.startTime.split(':').map(Number);
        const [h2, m2] = (item.job.isFinished && item.job.actualEndTime ? item.job.actualEndTime : item.job.endTime).split(':').map(Number);
        let duration = (h2 + m2/60) - (h1 + m1/60);
        if(duration < 0) duration = 0;

        return {
            'Fecha': formatDateForExcel(item.date),
            'Código Operario': item.worker.code,
            'Nombre Operario': item.worker.name,
            'Cliente': item.clientName,
            'Sede': item.centerName,
            'Tarea': item.job.customName || item.job.type,
            'Inicio': item.job.startTime,
            'Fin': item.job.isFinished && item.job.actualEndTime ? item.job.actualEndTime : item.job.endTime,
            'Duración (h)': duration.toFixed(2),
            'Estado': item.job.isFinished ? 'FINALIZADA' : 'PENDIENTE'
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
        const [h1, m1] = item.job.startTime.split(':').map(Number);
        const [h2, m2] = (item.job.isFinished && item.job.actualEndTime ? item.job.actualEndTime : item.job.endTime).split(':').map(Number);
        let duration = (h2 + (m1||0)/60) - (h1 + (m1||0)/60); // Simplified for ref
        return {
            'Fecha': formatDateForExcel(item.date),
            'Código Operario': item.worker.code,
            'Nombre Operario': item.worker.name,
            'Cliente': item.clientName,
            'Sede': item.centerName,
            'Tarea': item.job.customName || item.job.type,
            'Inicio': item.job.startTime,
            'Fin': item.job.isFinished && item.job.actualEndTime ? item.job.actualEndTime : item.job.endTime,
            'Duración (h)': duration.toFixed(2),
            'Estado': item.job.isFinished ? 'FINALIZADA' : 'PENDIENTE'
        };
    });
    const wsDetailed = XLSX.utils.json_to_sheet(detailedData);
    XLSX.utils.book_append_sheet(wb, wsDetailed, "Listado Operarios");
    XLSX.writeFile(wb, `Listado_Actividad_${startDate}.xlsx`);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 flex flex-col h-full custom-scrollbar">
      
      {/* 1. BARRA DE CONTROL Y FILTROS */}
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
                
                {/* Fechas */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <div className="flex items-center gap-2">
                      <input type="date" className="text-[10px] font-bold text-slate-700 bg-transparent outline-none uppercase" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <input type="date" className="text-[10px] font-bold text-slate-700 bg-transparent outline-none uppercase" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                </div>

                <div className="w-px h-8 bg-slate-200 mx-1" />

                {/* Filtro Cliente */}
                <div className="relative group">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select 
                      className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-blue-400 min-w-[160px] cursor-pointer"
                      value={selectedClientId}
                      onChange={(e) => { setSelectedClientId(e.target.value); setSelectedCenterId('all'); }}
                  >
                    <option value="all" className="text-slate-900">Todos los Clientes</option>
                    {planning.clients.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>)}
                  </select>
                </div>

                {/* Filtro Operario - CORREGIDO VISUALMENTE */}
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select 
                      className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-blue-400 min-w-[180px] cursor-pointer"
                      value={selectedWorkerId}
                      onChange={(e) => setSelectedWorkerId(e.target.value)}
                  >
                    <option value="all" className="text-slate-900">Todos los Operarios</option>
                    {sortedWorkers.map(w => (
                      <option key={w.id} value={w.id} className="text-slate-900">
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>

              </div>
              <button onClick={exportStatsToExcel} className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-2xl hover:bg-green-600 hover:text-white transition-all shadow-sm">
                <FileSpreadsheet className="w-5 h-5" />
              </button>
            </div>
         </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
           <div onClick={() => setShowCancelledDetails(false)} className={`bg-white rounded-[32px] p-6 border shadow-sm relative overflow-hidden group hover:shadow-xl transition-all cursor-pointer ${!showCancelledDetails ? 'border-blue-200 ring-4 ring-blue-50' : 'border-slate-100'}`}>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm mb-4"><Users className="w-6 h-6" /></div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">{selectedWorkerId === 'all' ? stats.totalUniqueWorkers : stats.activeDays}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedWorkerId === 'all' ? 'Operarios Totales' : 'Días Trabajados'}</p>
              </div>
           </div>

           <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all">
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-purple-600 shadow-sm mb-4"><Activity className="w-6 h-6" /></div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">{selectedWorkerId === 'all' ? stats.averageDailyWorkers.toFixed(1) : activeJobs.length}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedWorkerId === 'all' ? 'Media Operarios/Día' : 'Servicios Totales'}</p>
              </div>
           </div>

           <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all">
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm mb-4"><Clock className="w-6 h-6" /></div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">{stats.totalManHours.toFixed(1)} h</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horas Totales</p>
              </div>
           </div>

           <div onClick={() => setShowCancelledDetails(!showCancelledDetails)} className={`bg-white rounded-[32px] p-6 border shadow-sm relative overflow-hidden group hover:shadow-xl transition-all cursor-pointer ${showCancelledDetails ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100'}`}>
              <div className="relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm mb-4 transition-colors ${showCancelledDetails ? 'bg-red-600 text-white' : 'bg-white text-red-600'}`}><Ban className="w-6 h-6" /></div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">{cancelledJobs.length}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anulaciones</p>
              </div>
           </div>
        </div>

        {showCancelledDetails ? (
           <div className="bg-white rounded-[32px] border border-red-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="p-8 border-b border-red-50 bg-red-50/30 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600"><FileText className="w-6 h-6" /></div>
                   <div><h3 className="text-lg font-black text-red-900 uppercase italic">Registro de Anulaciones</h3></div>
                </div>
                <button onClick={() => setShowCancelledDetails(false)} className="p-2 hover:bg-red-100 rounded-xl text-red-400"><X className="w-6 h-6" /></button>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="bg-red-50/50 border-b border-red-100">
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase">Fecha</th>
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase">Cliente</th>
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase">Tarea</th>
                          <th className="px-6 py-4 text-[10px] font-black text-red-400 uppercase">Motivo</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                       {cancelledJobs.map(job => (
                          <tr key={job.id} className="hover:bg-red-50/30">
                             <td className="px-6 py-4 text-xs font-black">{formatDateDMY(job.date)}</td>
                             <td className="px-6 py-4 text-xs font-bold text-slate-600">{planning.clients.find(c => c.id === job.clientId)?.name}</td>
                             <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase">{job.customName || job.type}</td>
                             <td className="px-6 py-4 text-[10px] text-red-500 italic">{job.cancellationReason || '---'}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        ) : (
            <div className="bg-white rounded-[32px] border border-blue-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                <div className="p-8 border-b border-blue-50 bg-blue-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600"><Users className="w-6 h-6" /></div>
                        <div><h3 className="text-lg font-black text-blue-900 uppercase italic">Historial de Operarios</h3></div>
                    </div>
                    <button onClick={exportActivityList} className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white rounded-xl transition-all font-black text-[10px] uppercase shadow-sm"><Download className="w-4 h-4" /> Exportar Listado</button>
                </div>
                <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-left relative">
                        <thead className="sticky top-0 z-10 bg-blue-50">
                        <tr className="border-b border-blue-100">
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase">Fecha</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase">Operario</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase">Cliente</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase">Tarea</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase text-right">Estado</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-50">
                        {flattenedActivity.map(item => (
                                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-6 py-4 text-xs font-black text-slate-700">{formatDateDMY(item.date)}</td>
                                    <td className="px-6 py-4"><span className="text-xs font-bold text-slate-700">{item.worker.name}</span></td>
                                    <td className="px-6 py-4 text-xs font-black text-slate-900">{item.clientName}</td>
                                    <td className="px-6 py-4"><span className="text-[10px] font-bold text-slate-700 uppercase bg-slate-100 px-2 py-1 rounded-lg">{item.job.customName || item.job.type}</span></td>
                                    <td className="px-6 py-4 text-right">{item.job.isFinished ? <span className="text-[9px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded-lg">Finalizada</span> : <span className="text-[9px] font-black text-slate-400 uppercase">Pendiente</span>}</td>
                                </tr>
                        ))}
                        {flattenedActivity.length === 0 && (
                          <tr>
                             <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                <p className="text-xs font-bold uppercase tracking-widest">No hay actividad para mostrar</p>
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
