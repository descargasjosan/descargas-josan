import React, { useState, useMemo } from 'react';
import { 
  BarChart3, Users, Clock, CalendarDays, Filter, Building2, MapPin, 
  TrendingUp, Activity, Calculator, ArrowRight, Ban, X, FileText, AlertCircle, Download, FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlanningState, Job } from '../types';
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
  
  // Estado para controlar si se muestra el detalle de anulaciones
  const [showCancelledDetails, setShowCancelledDetails] = useState(false);

  // --- LÓGICA DE FILTRADO BASE ---
  // Primero obtenemos todas las tareas que caen dentro del rango y filtros de cliente/sede
  // INDEPENDIENTEMENTE de si están anuladas o no.
  const jobsInScope = useMemo(() => {
    return planning.jobs.filter(job => {
      // 1. Filtro Fecha
      if (job.date < startDate || job.date > endDate) return false;

      // 2. Filtro Cliente
      if (selectedClientId !== 'all' && job.clientId !== selectedClientId) return false;

      // 3. Filtro Sede
      if (selectedCenterId !== 'all' && job.centerId !== selectedCenterId) return false;

      return true;
    });
  }, [planning.jobs, startDate, endDate, selectedClientId, selectedCenterId]);

  // --- SEPARACIÓN DE ESTADOS ---
  const activeJobs = useMemo(() => jobsInScope.filter(j => !j.isCancelled), [jobsInScope]);
  const cancelledJobs = useMemo(() => jobsInScope.filter(j => j.isCancelled), [jobsInScope]);

  // --- CÁLCULOS ESTADÍSTICOS (Solo sobre tareas activas) ---
  const stats = useMemo(() => {
    const uniqueWorkers = new Set<string>();
    const workersPerDay: Record<string, Set<string>> = {};
    let totalManHours = 0;

    activeJobs.forEach(job => {
      // A. Operarios únicos totales
      job.assignedWorkerIds.forEach(id => uniqueWorkers.add(id));

      // B. Agrupación por día para media
      if (!workersPerDay[job.date]) {
        workersPerDay[job.date] = new Set();
      }
      job.assignedWorkerIds.forEach(id => workersPerDay[job.date].add(id));

      // C. Cálculo de horas
      const parseTime = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h + m / 60;
      };

      const effectiveEndTimeStr = (job.isFinished && job.actualEndTime) ? job.actualEndTime : job.endTime;
      
      const startDec = parseTime(job.startTime);
      const endDec = parseTime(effectiveEndTimeStr);
      
      let duration = endDec - startDec;
      if (duration < 0) duration = 0; 

      totalManHours += duration * job.assignedWorkerIds.length;
    });

    // D. Calcular Media Diaria
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
  }, [activeJobs]);

  // --- CÁLCULOS DE ANULACIONES ---
  const cancellationRate = jobsInScope.length > 0 
    ? ((cancelledJobs.length / jobsInScope.length) * 100).toFixed(1) 
    : "0.0";

  // --- AUXILIARES ---
  const selectedClient = planning.clients.find(c => c.id === selectedClientId);

  // --- FUNCIÓN DE EXPORTACIÓN ESTADÍSTICA ---
  const exportStatsToExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. HOJA RESUMEN (KPIs)
    const summaryData = [
       { Concepto: 'Periodo Inicio', Valor: formatDateDMY(startDate) },
       { Concepto: 'Periodo Fin', Valor: formatDateDMY(endDate) },
       { Concepto: 'Cliente Filtrado', Valor: selectedClient ? selectedClient.name : 'TODOS' },
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

    // 2. HOJA DETALLE SERVICIOS (ACTIVOS)
    const activeData = activeJobs.map(j => {
       const client = planning.clients.find(c => c.id === j.clientId);
       const center = client?.centers.find(ct => ct.id === j.centerId);
       
       // Calc duration
       const [h1, m1] = j.startTime.split(':').map(Number);
       const [h2, m2] = (j.isFinished && j.actualEndTime ? j.actualEndTime : j.endTime).split(':').map(Number);
       let duration = (h2 + m2/60) - (h1 + m1/60);
       if(duration < 0) duration = 0;

       return {
          'Fecha': j.date,
          'Cliente': client?.name || '---',
          'Sede': center?.name || '---',
          'Tarea': j.customName || j.type,
          'Inicio': j.startTime,
          'Fin': j.isFinished && j.actualEndTime ? j.actualEndTime : j.endTime,
          'Duración (h)': duration.toFixed(2),
          'Num Operarios': j.assignedWorkerIds.length,
          'Estado': j.isFinished ? 'FINALIZADA' : 'PENDIENTE'
       };
    });
    const wsActive = XLSX.utils.json_to_sheet(activeData);
    XLSX.utils.book_append_sheet(wb, wsActive, "Servicios Realizados");

    // 3. HOJA ANULACIONES
    const cancelledData = cancelledJobs.map(j => {
       const client = planning.clients.find(c => c.id === j.clientId);
       const center = client?.centers.find(ct => ct.id === j.centerId);
       return {
          'Fecha': j.date,
          'Cliente': client?.name || '---',
          'Sede': center?.name || '---',
          'Tarea': j.customName || j.type,
          'Horario Previsto': `${j.startTime} - ${j.endTime}`,
          'Operarios Previstos': j.requiredWorkers,
          'Motivo Anulación': j.cancellationReason || ''
       };
    });
    const wsCancelled = XLSX.utils.json_to_sheet(cancelledData);
    XLSX.utils.book_append_sheet(wb, wsCancelled, "Servicios Anulados");

    XLSX.writeFile(wb, `josan_stats_${startDate}_${endDate}.xlsx`);
  };


  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 flex flex-col h-full custom-scrollbar">
      
      {/* 1. BARRA DE CONTROL Y FILTROS */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-20 shadow-sm">
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            
            {/* Título */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 text-white">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 italic uppercase tracking-tighter leading-none">Análisis Operativo</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                  Estadísticas y Rendimiento
                </p>
              </div>
            </div>

            {/* Area de Filtros y Acciones */}
            <div className="flex items-center gap-4">
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                
                {/* Fechas */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <div className="flex items-center gap-2">
                      <input 
                        type="date" 
                        className="text-[10px] font-bold text-slate-700 bg-transparent outline-none uppercase cursor-pointer"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <input 
                        type="date" 
                        className="text-[10px] font-bold text-slate-700 bg-transparent outline-none uppercase cursor-pointer"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                </div>

                <div className="w-px h-8 bg-slate-200 mx-1" />

                {/* Selector Cliente */}
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

                {/* Selector Sede (Dependiente) */}
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
              </div>

              {/* Botón Exportar Informe */}
              <button 
                onClick={exportStatsToExcel}
                className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-2xl hover:bg-green-600 hover:text-white transition-all shadow-sm group"
                title="Descargar Informe en Excel"
              >
                <FileSpreadsheet className="w-5 h-5" />
              </button>
            </div>
         </div>
      </div>

      {/* 2. CONTENIDO PRINCIPAL SCROLLABLE */}
      <div className="p-8">
        
        {/* KPI CARDS - GRID AJUSTADO A 4 COLUMNAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
           
           {/* KPI 1: Operarios Totales */}
           <div 
             onClick={() => setShowCancelledDetails(false)}
             className={`bg-white rounded-[32px] p-6 border shadow-sm relative overflow-hidden group hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer ${!showCancelledDetails ? 'border-blue-200 ring-4 ring-blue-50' : 'border-slate-100'}`}
           >
              <div className="absolute right-0 top-0 w-32 h-32 bg-blue-50 rounded-full -mr-10 -mt-10 group-hover:bg-blue-100 transition-colors" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm mb-4">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">{stats.totalUniqueWorkers}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operarios Totales</p>
                <div className="mt-4 flex items-center gap-2">
                   <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase">Recuento Único</span>
                   <span className="text-[9px] text-slate-400 font-bold uppercase">En periodo</span>
                </div>
              </div>
           </div>

           {/* KPI 2: Media Diaria */}
           <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <div className="absolute right-0 top-0 w-32 h-32 bg-purple-50 rounded-full -mr-10 -mt-10 group-hover:bg-purple-100 transition-colors" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-purple-600 shadow-sm mb-4">
                  <Activity className="w-6 h-6" />
                </div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">
                  {stats.averageDailyWorkers.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Media Empleados/Día</p>
                <div className="mt-4 flex items-center gap-2">
                   <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase">Base: {stats.activeDays} días</span>
                   <span className="text-[9px] text-slate-400 font-bold uppercase">Trabajados</span>
                </div>
              </div>
           </div>

           {/* KPI 3: Horas Totales */}
           <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-50 rounded-full -mr-10 -mt-10 group-hover:bg-emerald-100 transition-colors" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm mb-4">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-4xl font-[900] text-slate-900 mb-1">
                  {stats.totalManHours.toLocaleString('es-ES', { maximumFractionDigits: 2 })} h
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Horas Hombre</p>
                <div className="mt-4 flex items-center gap-2">
                   <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase">Realizadas</span>
                   <span className="text-[9px] text-slate-400 font-bold uppercase truncate">Solo activas</span>
                </div>
              </div>
           </div>

           {/* KPI 4: Tareas Anuladas (NUEVO + CLICKABLE) */}
           <div 
             onClick={() => setShowCancelledDetails(!showCancelledDetails)}
             className={`bg-white rounded-[32px] p-6 border shadow-sm relative overflow-hidden group hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer ${showCancelledDetails ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100'}`}
           >
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
                   <span className="text-[9px] text-slate-400 font-bold uppercase truncate">
                      {showCancelledDetails ? 'Click para cerrar' : 'Click para ver listado'}
                   </span>
                </div>
              </div>
           </div>

        </div>

        {/* CONTENIDO VARIABLE: DESGLOSE VS LISTADO ANULACIONES */}
        {showCancelledDetails ? (
           // VISTA DE LISTADO DETALLADO DE ANULACIONES
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
           // VISTA ORIGINAL: DESGLOSE DETALLADO GENÉRICO
           <div className="bg-white rounded-[32px] border border-slate-100 p-8 text-center shadow-sm animate-in fade-in slide-in-from-bottom-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-50 mb-4 text-slate-300">
                <TrendingUp className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-slate-900 italic uppercase">Desglose Detallado</h3>
              <p className="text-xs font-bold text-slate-400 max-w-lg mx-auto mt-2 leading-relaxed">
                Los datos mostrados arriba corresponden al filtro actual: <br/>
                <span className="text-blue-600">
                  {startDate.split('-').reverse().join('/')} - {endDate.split('-').reverse().join('/')}
                </span>
                <br/>
                {selectedClient ? `Cliente: ${selectedClient.name}` : 'Todos los clientes'}
              </p>
              
              <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tareas Totales</p>
                  <p className="text-xl font-black text-slate-900">{jobsInScope.length}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tareas Realizadas</p>
                  <p className="text-xl font-black text-slate-900">{activeJobs.length}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Días en Rango</p>
                  <p className="text-xl font-black text-slate-900">
                    {Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24)) + 1}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Coste Estimado</p>
                   <div className="flex items-center justify-center gap-1 text-slate-300 font-black text-xl">
                      <Calculator className="w-4 h-4" /> <span>---</span>
                   </div>
                </div>
              </div>
           </div>
        )}

      </div>
    </div>
  );
};

export default StatisticsPanel;