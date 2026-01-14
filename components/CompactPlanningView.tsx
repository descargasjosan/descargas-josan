import React, { useState, useMemo } from 'react';
import { CalendarDays, Search, Download, Table, ArrowRight, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlanningState, Worker, ContractType, Job } from '../types';
import { formatDateDMY } from '../utils';

interface CompactPlanningViewProps {
  planning: PlanningState;
}

const CompactPlanningView: React.FC<CompactPlanningViewProps> = ({ planning }) => {
  // Rango de fechas por defecto: Hoy + 7 días
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextWeek.toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');

  // Filtrar y preparar datos
  const rows = useMemo(() => {
    return planning.jobs
      .filter(job => {
        const inDateRange = job.date >= startDate && job.date <= endDate;
        if (!inDateRange) return false;

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
  }, [planning.jobs, planning.clients, planning.workers, startDate, endDate, searchTerm]);

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
    XLSX.writeFile(wb, `Planificacion_Compacta_${startDate}_${endDate}.xlsx`);
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
          <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
            <tr>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-24">Fecha</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-52">Cliente</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-24">Sede</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-64">Tarea</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-20 text-center">H. Inicio</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-20 text-center">Nº Ops</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">Operarios Asignados</th>
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
        <span>Rango: {formatDateDMY(startDate)} - {formatDateDMY(endDate)}</span>
      </div>
    </div>
  );
};

export default CompactPlanningView;