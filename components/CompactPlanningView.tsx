import React, { useState, useMemo, useEffect } from 'react';
import { CalendarDays, Search, Download, Table, ArrowRight, Clock, ChevronLeft, ChevronRight, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlanningState, Worker, ContractType, Job, Holiday } from '../types';
import { formatDateDMY, isHoliday } from '../utils';

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

const CompactPlanningView: React.FC<CompactPlanningViewProps> = ({ planning }) => {
  // Rango de fechas por defecto: Hoy + 7 días
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  const [viewMode, setViewMode] = useState<'range' | 'day'>('range');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextWeek.toISOString().split('T')[0]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showCalendarSelector, setShowCalendarSelector] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  const goToToday = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    setSelectedDate(todayStr);
    setShowCalendarSelector(false);
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setShowCalendarSelector(false);
  };

  // Filtrar y preparar datos
  const rows = useMemo(() => {
    return planning.jobs
      .filter(job => {
        // Si está en modo día, filtrar solo por ese día
        if (viewMode === 'day') {
          if (job.date !== selectedDate) return false;
        } else {
          // Si está en modo rango, usar el rango de fechas
          const inDateRange = job.date >= startDate && job.date <= endDate;
          if (!inDateRange) return false;
        }

        if (searchTerm === '') return true;

        const client = planning.clients.find(c => c.id === job.clientId);
        const searchLower = searchTerm.toLowerCase();
        
        return (
          client?.name.toLowerCase().includes(searchLower) ||
          job.customName?.toLowerCase().includes(searchLower) ||
          job.type.toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map(job => {
        const client = planning.clients.find(c => c.id === job.clientId);
        const center = client?.centers.find(c => c.id === job.centerId);
        
        // Obtener todos los trabajos de hoy para detectar duplicados
        const dailyJobs = planning.jobs.filter(j => j.date === job.date && !j.isCancelled);

        const assignedWorkersList = job.assignedWorkerIds
          .map(id => {
              const w = planning.workers.find(worker => worker.id === id);
              if (!w) return null;
              
              // Determinar si este trabajador ya ha tenido un trabajo antes en este mismo día
              const workerJobsToday = dailyJobs
                .filter(j => j.assignedWorkerIds.includes(id))
                .sort((a, b) => {
                    const timeA = a.workerTimes?.[id] || a.startTime;
                    const timeB = b.workerTimes?.[id] || b.startTime;
                    return timeA.localeCompare(timeB);
                });
              
              const isNotFirstJob = workerJobsToday.length > 1 && workerJobsToday[0].id !== job.id;

              return {
                  ...w,
                  customStartTime: job.workerTimes?.[id] || job.startTime,
                  isRepeating: isNotFirstJob
              };
          })
          .filter((w): w is (Worker & { customStartTime: string, isRepeating: boolean }) => !!w);

        // Agrupación por tiempo para el renderizado
        const workersByTime: Record<string, typeof assignedWorkersList> = {};
        assignedWorkersList.forEach(w => {
          if (!workersByTime[w.customStartTime]) workersByTime[w.customStartTime] = [];
          workersByTime[w.customStartTime].push(w);
        });
        const sortedTimes = Object.keys(workersByTime).sort();

        const workerNamesForExcel = assignedWorkersList
          .map(w => `(${w.code}) ${w.name} [${w.customStartTime}]${w.isRepeating ? ' (REPETIDO)' : ''}`)
          .join(', ');

        return {
          id: job.id,
          date: job.date,
          dateFormatted: formatDateDMY(job.date),
          clientName: client?.name || '---',
          centerName: center?.name || '---',
          taskName: job.customName || job.type,
          startTime: job.startTime,
          requiredWorkers: job.requiredWorkers,
          assignedCount: job.assignedWorkerIds.length,
          workersByTime,
          sortedTimes,
          workerNames: workerNamesForExcel, 
          isCancelled: job.isCancelled,
          isFinished: job.isFinished
        };
      });
  }, [planning.jobs, planning.clients, planning.workers, startDate, endDate, searchTerm, viewMode, selectedDate]);

  const exportCompactExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsData = rows.map(r => ({
      'Fecha': r.dateFormatted,
      'Cliente': r.clientName,
      'Sede': r.centerName,
      'Tarea': r.taskName,
      'Hora Inicio Tarea': r.startTime,
      'Nº Ops': `${r.assignedCount}/${r.requiredWorkers}`,
      'Operarios (y horario indiv)': r.workerNames,
      'Estado': r.isCancelled ? 'ANULADA' : r.isFinished ? 'FINALIZADA' : 'PENDIENTE'
    }));
    
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 80 }, { wch: 12 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Planificación Compacta");
    const fileName = viewMode === 'day' 
      ? `Planificacion_Compacta_${selectedDate}.xlsx`
      : `Planificacion_Compacta_${startDate}_${endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-md">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 italic uppercase tracking-tighter">Vista Compacta</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Listado tipo hoja de cálculo</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de modo: Rango o Día */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('range')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === 'range'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Rango
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === 'day'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Día
            </button>
          </div>

          {viewMode === 'range' ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <input 
                type="date" 
                className="text-xs font-bold text-slate-700 bg-transparent outline-none uppercase"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <input 
                type="date" 
                className="text-xs font-bold text-slate-700 bg-transparent outline-none uppercase"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button onClick={() => {
                const prevDate = new Date(selectedDate);
                prevDate.setDate(prevDate.getDate() - 1);
                setSelectedDate(prevDate.toISOString().split('T')[0]);
              }} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setShowCalendarSelector(true)} 
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm text-xs font-black uppercase tracking-widest text-slate-700 hover:text-blue-600 transition-colors"
              >
                <CalendarDays className="w-4 h-4 text-blue-500" />
                {formatDateDisplay(selectedDate)}
              </button>
              <button onClick={() => {
                const nextDate = new Date(selectedDate);
                nextDate.setDate(nextDate.getDate() + 1);
                setSelectedDate(nextDate.toISOString().split('T')[0]);
              }} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button 
                onClick={goToToday} 
                className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors"
              >
                Hoy
              </button>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtrar cliente o tarea..." 
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none w-64 focus:border-blue-400 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button 
            onClick={exportCompactExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-600 hover:text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-sm"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-0">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-900 shadow-md">
            <tr>
              <th className="px-3 py-3 text-[10px] font-black text-white uppercase tracking-widest border-b border-slate-800 w-24">Fecha</th>
              <th className="px-3 py-3 text-[10px] font-black text-white uppercase tracking-widest border-b border-slate-800 w-52">Cliente</th>
              <th className="px-3 py-3 text-[10px] font-black text-white uppercase tracking-widest border-b border-slate-800 w-24">Sede</th>
              <th className="px-3 py-3 text-[10px] font-black text-white uppercase tracking-widest border-b border-slate-800 w-64">Tarea</th>
              <th className="px-3 py-3 text-[10px] font-black text-white uppercase tracking-widest border-b border-slate-800 w-20 text-center">H. Inicio</th>
              <th className="px-3 py-3 text-[10px] font-black text-white uppercase tracking-widest border-b border-slate-800 w-20 text-center">Nº Ops</th>
              <th className="px-3 py-3 text-[10px] font-black text-white uppercase tracking-widest border-b border-slate-800">Operarios Asignados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, index) => (
              <tr 
                key={row.id} 
                className={`
                  group transition-colors text-xs
                  ${row.isCancelled 
                    ? 'bg-red-50 hover:bg-red-100' 
                    : index % 2 === 0 
                      ? 'bg-white hover:bg-blue-50' 
                      : 'bg-slate-100 hover:bg-blue-50'}
                `}
              >
                <td className="px-3 py-2 border-r border-slate-200/50 font-bold text-slate-700 whitespace-nowrap">
                  {row.dateFormatted}
                </td>
                <td className="px-3 py-2 border-r border-slate-200/50 font-black text-slate-800 truncate max-w-[13rem]" title={row.clientName}>
                  {row.clientName}
                </td>
                <td className="px-3 py-2 border-r border-slate-200/50 font-bold text-slate-500 truncate max-w-[6rem]" title={row.centerName}>
                  {row.centerName}
                </td>
                <td className="px-3 py-2 border-r border-slate-200/50 font-medium text-slate-600 truncate max-w-[16rem]" title={row.taskName}>
                  {row.isCancelled ? <span className="text-red-600 font-black">[ANULADA] </span> : ''}
                  {row.taskName}
                </td>
                <td className="px-3 py-2 border-r border-slate-200/50 font-black text-blue-600 text-center">
                  {row.startTime}
                </td>
                <td className="px-3 py-2 border-r border-slate-200/50 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                    row.assignedCount < row.requiredWorkers 
                      ? 'bg-amber-100 text-amber-700' 
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {row.assignedCount}/{row.requiredWorkers}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-2 items-center">
                    {row.sortedTimes.length > 0 ? (
                        row.sortedTimes.map(time => (
                          <React.Fragment key={time}>
                            {/* Mostrar el reloj y la hora solo si NO es la hora base de la tarea */}
                            {time !== row.startTime && (
                              <div className="flex items-center gap-1 shrink-0 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-black text-[9px] uppercase">
                                <Clock className="w-2.5 h-2.5" />
                                {time}
                              </div>
                            )}
                            {row.workersByTime[time].map(worker => {
                                let codeColorClass = '';
                                if (worker.contractType === ContractType.INDEFINIDO) codeColorClass = 'text-slate-900';
                                else if (worker.contractType === ContractType.AUTONOMO || worker.contractType === ContractType.AUTONOMA_COLABORADORA) codeColorClass = 'text-blue-600';
                                else codeColorClass = 'text-red-600';

                                return (
                                    <div 
                                        key={worker.id} 
                                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-black uppercase shadow-sm ${
                                            worker.isRepeating 
                                              ? 'bg-green-50 border-green-200 text-green-700' 
                                              : 'bg-white border-slate-200 text-slate-700'
                                        }`}
                                        title={`${worker.name}${worker.isRepeating ? ' (Repite tarea)' : ''}`}
                                    >
                                        <span className={codeColorClass}>{worker.code}</span>
                                        <span className="truncate max-w-[100px]">{worker.name.split(' ')[0]}</span>
                                    </div>
                                );
                            })}
                          </React.Fragment>
                        ))
                    ) : (
                        <span className="text-slate-300 italic text-[10px] font-medium">Sin asignar</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 text-[10px] text-slate-400 font-bold flex justify-between">
        <span>Mostrando {rows.length} registros</span>
        <span>
          {viewMode === 'day' 
            ? `Día: ${formatDateDMY(selectedDate)}`
            : `Rango: ${formatDateDMY(startDate)} - ${formatDateDMY(endDate)}`
          }
        </span>
      </div>

      {showCalendarSelector && (
        <CalendarSelector 
          currentDate={selectedDate}
          customHolidays={planning.customHolidays}
          onSelect={handleDateSelect}
          onClose={() => setShowCalendarSelector(false)}
          onGoToToday={goToToday}
          jobs={planning.jobs}
        />
      )}
    </div>
  );
};

export default CompactPlanningView;