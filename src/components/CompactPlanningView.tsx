
import React, { useState, useMemo, useEffect } from 'react';
import { CalendarDays, Search, Download, Table, ArrowRight, Clock, ChevronLeft, ChevronRight, X, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlanningState, Worker, ContractType, Job, Holiday } from '../lib/types';
import { formatDateDMY, isHoliday, getWorkerDisplayName } from '../lib/utils';

interface CompactPlanningViewProps {
  planning: PlanningState;
}

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

  useEffect(() => {
    setViewDate(new Date(currentDate));
  }, [currentDate]);
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const startOffset = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1); 
  
  const prevMonthDays = daysInMonth(viewDate.getFullYear(), viewDate.getMonth() - 1);
  const currentMonthDays = daysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  
  const dayElements = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    dayElements.push(<div key={`prev-${i}`} className="h-10 flex items-center justify-center text-slate-200 text-[10px] font-bold">{prevMonthDays - i}</div>);
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
        className={`h-10 rounded-lg flex flex-col items-center justify-center transition-all relative group ${
          isSelected ? 'bg-slate-900 text-white shadow-md' : 
          holiday ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100' :
          'hover:bg-slate-100 text-slate-700'
        }`}
        title={holiday ? holiday.name : undefined}
      >
        <span className={`text-xs font-black ${isToday && !isSelected ? 'text-blue-600' : ''}`}>{i}</span>
        <div className="flex gap-0.5 mt-0.5">
          {hasJobs && (
            <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-400'}`} />
          )}
          {holiday && (
            <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-amber-400'}`} />
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 border border-slate-200" onClick={e => e.stopPropagation()}>
         <div className="flex justify-between items-center mb-4">
             <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">Seleccionar Fecha</h3>
             <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4 text-slate-400" /></button>
         </div>
         <div className="flex justify-between items-center mb-4 px-2">
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
            <span className="font-black capitalize text-slate-900 text-sm">{viewDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
         </div>
         <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['L','M','X','J','V','S','D'].map(d => <span key={d} className="text-[9px] font-black text-slate-400 uppercase">{d}</span>)}
         </div>
         <div className="grid grid-cols-7 gap-1 mb-4">
             {dayElements}
         </div>
         <div className="flex flex-col gap-2">
             <button onClick={onGoToToday} className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-colors">Ir a Hoy</button>
         </div>
      </div>
    </div>
  );
};

const CompactPlanningView: React.FC<CompactPlanningViewProps> = ({ planning }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(planning.currentDate);
  const [endDate, setEndDate] = useState(planning.currentDate);
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [activeInput, setActiveInput] = useState<'start' | 'end'>('start');

  // Sincronizar solo cuando cambia la fecha externa (navegación global)
  useEffect(() => {
    setStartDate(planning.currentDate);
    if (viewMode === 'day') {
        setEndDate(planning.currentDate);
    }
  }, [planning.currentDate]);

  // Manejar cambio de modo
  useEffect(() => {
      if (viewMode === 'day') {
          setEndDate(startDate);
      } else {
          // Al cambiar a rango, si las fechas son iguales, sugerir una semana
          if (startDate === endDate) {
              const end = new Date(startDate);
              end.setDate(end.getDate() + 6);
              setEndDate(end.toISOString().split('T')[0]);
          }
      }
  }, [viewMode]);

  const filteredJobs = useMemo(() => {
    return planning.jobs.filter(j => j.date >= startDate && j.date <= endDate).filter(j => {
        const client = planning.clients.find(c => c.id === j.clientId);
        const searchLower = searchTerm.toLowerCase();
        return (
            client?.name.toLowerCase().includes(searchLower) || 
            j.type.toLowerCase().includes(searchLower) ||
            j.deliveryNote?.toLowerCase().includes(searchLower) ||
            j.ref?.toLowerCase().includes(searchLower)
        );
    }).sort((a, b) => {
        // Ordenar por fecha y luego por hora
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
    });
  }, [planning.jobs, startDate, endDate, searchTerm, planning.clients]);

  const exportToExcel = () => {
      const data = filteredJobs.map(job => {
          const client = planning.clients.find(c => c.id === job.clientId);
          const center = client?.centers.find(ct => ct.id === job.centerId);
          const workers = job.assignedWorkerIds.map(id => {
              const worker = planning.workers.find(w => w.id === id);
              return worker ? getWorkerDisplayName(worker) : '';
          }).filter(name => name).join(', ');
          
          return {
              Fecha: formatDateDMY(job.date),
              Cliente: client?.name,
              Sede: center?.name,
              Tarea: job.customName || job.type,
              Albarán: job.deliveryNote || '',
              Inicio: job.startTime,
              Fin: job.endTime,
              Operarios: workers,
              Estado: job.isCancelled ? 'ANULADA' : job.isFinished ? 'FINALIZADA' : 'PENDIENTE'
          };
      });
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vista Compacta");
      XLSX.writeFile(wb, "Planificacion_Compacta.xlsx");
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
        {showCalendar && (
            <CalendarSelector 
                currentDate={activeInput === 'start' ? startDate : endDate} 
                customHolidays={planning.customHolidays}
                onSelect={(d) => { 
                    if (viewMode === 'day') {
                        setStartDate(d);
                        setEndDate(d);
                    } else {
                        if (activeInput === 'start') {
                            setStartDate(d);
                            if (d > endDate) setEndDate(d);
                        } else {
                            setEndDate(d);
                            if (d < startDate) setStartDate(d);
                        }
                    }
                    setShowCalendar(false); 
                }}
                onClose={() => setShowCalendar(false)}
                onGoToToday={() => { 
                    const today = new Date().toISOString().split('T')[0];
                    if (viewMode === 'day') {
                        setStartDate(today);
                        setEndDate(today);
                    } else {
                        // En modo rango, actualizamos solo el input activo
                        if (activeInput === 'start') {
                            setStartDate(today);
                            if (today > endDate) setEndDate(today);
                        } else {
                            setEndDate(today);
                            if (today < startDate) setStartDate(today);
                        }
                    }
                    setShowCalendar(false); 
                }}
                jobs={planning.jobs}
            />
        )}

        {/* Header de Control Compacto */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center shrink-0 shadow-sm z-30">
            <div className="flex items-center gap-4">
                <div className="flex flex-col">
                    <h2 className="text-lg font-black text-slate-900 italic uppercase tracking-tight leading-none">Vista Compacta</h2>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setViewMode('day')} className={`px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all ${viewMode === 'day' ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Día</button>
                    <button onClick={() => setViewMode('week')} className={`px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all ${viewMode === 'week' ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Rango</button>
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <button onClick={() => { setActiveInput('start'); setShowCalendar(true); }} className="text-xs font-bold text-slate-700 hover:text-blue-600 uppercase">
                        {formatDateDMY(startDate)}
                    </button>
                    {viewMode === 'week' && (
                        <>
                            <ArrowRight className="w-3 h-3 text-slate-300" />
                            <button onClick={() => { setActiveInput('end'); setShowCalendar(true); }} className="text-xs font-bold text-slate-700 hover:text-blue-600 uppercase">
                                {formatDateDMY(endDate)}
                            </button>
                        </>
                    )}
                </div>

                {viewMode === 'day' && (
                    <button 
                        onClick={() => {
                            const today = new Date().toISOString().split('T')[0];
                            setStartDate(today);
                            setEndDate(today);
                        }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors"
                    >
                        Hoy
                    </button>
                )}
            </div>

            <div className="flex items-center gap-3">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input 
                    className="pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 w-64 bg-slate-50 focus:bg-white transition-colors" 
                    placeholder="Filtrar cliente o tarea..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
               </div>
               <button onClick={exportToExcel} className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-[10px] font-black uppercase tracking-widest">
                  <Download className="w-3.5 h-3.5" /> Excel
               </button>
            </div>
        </div>

        {/* Tabla Compacta */}
        <div className="flex-1 overflow-auto bg-white custom-scrollbar">
           <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900 text-white sticky top-0 z-20 shadow-md">
                 <tr>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-700 w-24">Fecha</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-700 w-48">Cliente</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-700 w-32">Sede</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-700 w-48">Tarea</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-700 w-24 border-l border-slate-700">Albarán</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-700 w-24 text-center">H. Inicio</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-700 w-16 text-center">Nº Ops</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest">Operarios Asignados</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {filteredJobs.length === 0 ? (
                     <tr><td colSpan={8} className="p-12 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">No hay tareas que coincidan con los filtros</td></tr>
                 ) : (
                     filteredJobs.map((job, index) => {
                         const client = planning.clients.find(c => c.id === job.clientId);
                         const center = client?.centers.find(ct => ct.id === job.centerId);
                         const isCancelled = job.isCancelled;
                         
                         return (
                             <tr key={job.id} className={`group hover:bg-blue-50/50 transition-colors text-xs ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} ${isCancelled ? 'opacity-60 bg-red-50/30' : ''}`}>
                                 <td className="px-3 py-2 font-bold text-slate-500 border-r border-slate-100 whitespace-nowrap">
                                     {formatDateDMY(job.date).substring(0, 5)} <span className="text-[10px] text-slate-400">{formatDateDMY(job.date).substring(5)}</span>
                                 </td>
                                 <td className="px-3 py-2 font-black text-slate-800 border-r border-slate-100 truncate max-w-[200px]" title={client?.name}>
                                     {client?.name}
                                 </td>
                                 <td className="px-3 py-2 font-bold text-slate-500 border-r border-slate-100 truncate max-w-[150px] uppercase text-[10px]" title={center?.name}>
                                     {center?.name}
                                 </td>
                                 <td className="px-3 py-2 border-r border-slate-100 truncate max-w-[200px]">
                                     <span className="font-bold text-slate-700">{job.customName || job.type}</span>
                                     {isCancelled && <span className="ml-2 text-[9px] text-red-500 font-black uppercase bg-red-100 px-1 rounded">Anulada</span>}
                                 </td>
                                 <td className="px-3 py-2 border-l border-r border-slate-100 text-[10px] font-bold text-slate-500 truncate w-24">
                                     {job.deliveryNote ? (
                                         <span className="bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-100 block truncate text-center">{job.deliveryNote}</span>
                                     ) : <span className="text-center block text-slate-300">-</span>}
                                 </td>
                                 <td className="px-3 py-2 text-center font-black text-blue-600 border-r border-slate-100">
                                     {job.startTime}
                                 </td>
                                 <td className={`px-3 py-2 text-center font-bold border-r border-slate-100 ${job.assignedWorkerIds.length < job.requiredWorkers ? 'text-amber-500 bg-amber-50' : 'text-slate-600'}`}>
                                     {job.assignedWorkerIds.length}/{job.requiredWorkers}
                                 </td>
                                 <td className="px-3 py-1.5">
                                     {/* LÓGICA DE AGRUPACIÓN POR HORARIO DE OPERARIOS EN UNA SOLA LÍNEA */}
                                     {(() => {
                                         const groupedWorkerIds: Record<string, string[]> = {};
                                         job.assignedWorkerIds.forEach(wid => {
                                             const time = job.workerTimes?.[wid] || job.startTime;
                                             if (!groupedWorkerIds[time]) groupedWorkerIds[time] = [];
                                             groupedWorkerIds[time].push(wid);
                                         });

                                         const sortedTimes = Object.keys(groupedWorkerIds).sort();
                                         const elements = [];

                                         sortedTimes.forEach((timeGroup, index) => {
                                             const workerIds = groupedWorkerIds[timeGroup];
                                             
                                             // Añadir badge de hora ANTES de los operarios si es una hora de refuerzo (no la hora principal)
                                             if (timeGroup !== job.startTime) {
                                                 elements.push(
                                                     <div key={`badge-${timeGroup}`} className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded border border-blue-200 text-[10px] font-black">
                                                         <Clock className="w-3 h-3" />
                                                         {timeGroup}
                                                     </div>
                                                 );
                                             }
                                             
                                             // Añadir operarios de esta hora
                                             workerIds.forEach(wid => {
                                                 const w = planning.workers.find(wk => wk.id === wid);
                                                 if (!w) return;
                                                 
                                                 // CALCULAR SI ES LA PRIMERA TAREA DEL DÍA PARA EL FONDO VERDE
                                                 const workerDailyJobs = planning.jobs
                                                     .filter(j => j.date === job.date && !j.isCancelled && j.assignedWorkerIds.includes(wid))
                                                     .sort((a, b) => (a.workerTimes?.[wid] || a.startTime).localeCompare(b.workerTimes?.[wid] || b.startTime));
                                                 
                                                 const isFirstJob = workerDailyJobs[0]?.id === job.id;
                                                 
                                                 // Color del código según contrato
                                                 let codeColorClass = '';
                                                 if (w.contractType === ContractType.INDEFINIDO) {
                                                     codeColorClass = 'text-slate-900';
                                                 } else if (w.contractType === ContractType.AUTONOMO || w.contractType === ContractType.AUTONOMA_COLABORADORA) {
                                                     codeColorClass = 'text-blue-600';
                                                 } else {
                                                     codeColorClass = 'text-red-600';
                                                 }

                                                 // Fondo: Verde si NO es la primera tarea, blanco por defecto
                                                 let bgClass = 'bg-white border-slate-200';
                                                 if (!isFirstJob) {
                                                     bgClass = 'bg-green-100 border-green-200';
                                                 }

                                                 elements.push(
                                                     <div key={wid} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase whitespace-nowrap ${bgClass}`} title={w.role}>
                                                         <span className={`font-black ${codeColorClass}`}>{w.code}</span>
                                                         <span className="truncate max-w-[80px] text-slate-900">{w.name.split(' ')[0]}</span>
                                                     </div>
                                                 );
                                             });
                                         });

                                         return <div className="flex flex-wrap gap-1.5">{elements}</div>;
                                     })()}
                                 </td>
                             </tr>
                         );
                     })
                 )}
              </tbody>
           </table>
        </div>
        
        {/* Footer Informativo */}
        <div className="bg-white border-t border-slate-200 px-4 py-2 text-[10px] font-bold text-slate-400 flex justify-between uppercase tracking-wider shrink-0">
            <span>Mostrando {filteredJobs.length} registros</span>
            <span>Rango: {formatDateDMY(startDate)} - {formatDateDMY(endDate)}</span>
        </div>
    </div>
  );
};

export default CompactPlanningView;
