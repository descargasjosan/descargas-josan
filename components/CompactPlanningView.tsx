import React, { useState, useMemo } from 'react';
import { CalendarDays, Search, Download, Table, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlanningState, Worker, ContractType } from '../types';
import { formatDateDMY } from '../utils';

interface CompactPlanningViewProps {
  planning: PlanningState;
  viewMode: 'day' | 'range';
  setViewMode: (mode: 'day' | 'range') => void;
  rangeStartDate: string;
  setRangeStartDate: (date: string) => void;
  rangeEndDate: string;
  setRangeEndDate: (date: string) => void;
  onDateChange: (date: string) => void;
  onGoToToday: () => void;
}

const CompactPlanningView: React.FC<CompactPlanningViewProps> = ({ 
  planning, 
  viewMode, 
  setViewMode, 
  rangeStartDate, 
  setRangeStartDate, 
  rangeEndDate, 
  setRangeEndDate, 
  onDateChange, 
  onGoToToday 
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filtrar y preparar datos basados en el modo de vista actual
  const rows = useMemo(() => {
    return planning.jobs
      .filter(job => {
        // Lógica de filtrado por fecha
        let inDateRange = false;
        if (viewMode === 'day') {
          inDateRange = job.date === planning.currentDate;
        } else {
          inDateRange = job.date >= rangeStartDate && job.date <= rangeEndDate;
        }

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
        const assignedWorkersList = job.assignedWorkerIds
          .map(id => planning.workers.find(w => w.id === id))
          .filter((w): w is Worker => !!w);

        const workerNamesForExcel = assignedWorkersList
          .map(w => `(${w.code}) ${w.name}`)
          .join(', ');

        return {
          id: job.id,
          date: job.date,
          dateFormatted: formatDateDMY(job.date),
          clientName: client?.name || '---',
          taskName: job.customName || job.type,
          startTime: job.startTime,
          requiredWorkers: job.requiredWorkers,
          assignedCount: job.assignedWorkerIds.length,
          assignedWorkersList, // Array de objetos para renderizar chips
          workerNames: workerNamesForExcel, // String para Excel
          isCancelled: job.isCancelled,
          isFinished: job.isFinished
        };
      });
  }, [planning.jobs, planning.clients, planning.workers, planning.currentDate, rangeStartDate, rangeEndDate, viewMode, searchTerm]);

  const exportCompactExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsData = rows.map(r => ({
      'Fecha': r.dateFormatted,
      'Cliente': r.clientName,
      'Tarea': r.taskName,
      'Hora Inicio': r.startTime,
      'Nº Ops': `${r.assignedCount}/${r.requiredWorkers}`,
      'Operarios': r.workerNames,
      'Estado': r.isCancelled ? 'ANULADA' : r.isFinished ? 'FINALIZADA' : 'PENDIENTE'
    }));
    
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 12 }, // Fecha
      { wch: 25 }, // Cliente
      { wch: 30 }, // Tarea
      { wch: 10 }, // Hora
      { wch: 8 },  // Nº Ops
      { wch: 60 }, // Operarios
      { wch: 12 }  // Estado
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Planificación Compacta");
    const suffix = viewMode === 'day' ? planning.currentDate : `${rangeStartDate}_${rangeEndDate}`;
    XLSX.writeFile(wb, `Planificacion_Compacta_${suffix}.xlsx`);
  };

  const shiftDate = (days: number) => {
    const date = new Date(planning.currentDate);
    date.setDate(date.getDate() + days);
    onDateChange(date.toISOString().split('T')[0]);
  };

  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col h-full">
      {/* HEADER DE CONTROL (Estilo sincronizado con PlanningBoard) */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white shadow-sm z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-md">
               <Table className="w-5 h-5" />
             </div>
             <div>
               <h2 className="text-xl font-black text-slate-900 italic uppercase tracking-tighter leading-none">Vista Compacta</h2>
             </div>
          </div>

          {/* Toggle Modo */}
          <div className="flex p-1 bg-slate-100 rounded-xl ml-4">
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

          {/* Selectores de Fecha */}
          {viewMode === 'day' ? (
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                <button onClick={() => shiftDate(-1)} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm text-xs font-black uppercase tracking-widest text-slate-700">
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  <input 
                    type="date" 
                    value={planning.currentDate} 
                    onChange={(e) => onDateChange(e.target.value)} 
                    className="outline-none bg-transparent cursor-pointer" 
                  />
                </div>
                <button onClick={() => shiftDate(1)} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-500"><ChevronRight className="w-4 h-4" /></button>
              </div>
          ) : (
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                 <div className="flex items-center gap-1 px-3 py-2 bg-white rounded-lg shadow-sm">
                    <input 
                        type="date" 
                        className="text-xs font-bold text-slate-700 bg-transparent outline-none uppercase cursor-pointer"
                        value={rangeStartDate}
                        onChange={(e) => setRangeStartDate(e.target.value)}
                    />
                    <span className="text-slate-300 mx-1">-</span>
                    <input 
                        type="date" 
                        className="text-xs font-bold text-slate-700 bg-transparent outline-none uppercase cursor-pointer"
                        value={rangeEndDate}
                        onChange={(e) => setRangeEndDate(e.target.value)}
                        min={rangeStartDate}
                    />
                 </div>
              </div>
          )}

          <button onClick={onGoToToday} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors">Hoy</button>
        </div>

        <div className="flex items-center gap-3">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtrar cliente o tarea..." 
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none w-64 focus:border-blue-400 focus:bg-white transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button 
            onClick={exportCompactExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-600 hover:text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-sm"
          >
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
        </div>
      </div>

      {/* TABLA COMPACTA */}
      <div className="flex-1 overflow-auto custom-scrollbar p-0 bg-slate-50">
        <table className="w-full text-left border-collapse bg-white">
          <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
            <tr>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-28">Fecha</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-48">Cliente</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-64">Tarea</th>
              <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 w-24 text-center">Hora Inicio</th>
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
                      : 'bg-slate-50 hover:bg-blue-50'}
                `}
              >
                <td className="px-3 py-2 border-r border-slate-200/50 font-bold text-slate-700 whitespace-nowrap">
                  {row.dateFormatted}
                </td>
                <td className="px-3 py-2 border-r border-slate-200/50 font-black text-slate-800 truncate max-w-[12rem]" title={row.clientName}>
                  {row.clientName}
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
                  <div className="flex flex-wrap gap-1.5">
                    {row.assignedWorkersList.length > 0 ? (
                        row.assignedWorkersList.map(worker => {
                            // Lógica para saber si es su primer trabajo del día
                            const dailyJobs = planning.jobs.filter(j => j.date === row.date && !j.isCancelled);
                            const workerDailyJobs = dailyJobs
                                .filter(j => j.assignedWorkerIds.includes(worker.id))
                                .sort((a, b) => a.startTime.localeCompare(b.startTime));
                            
                            const isFirstJob = workerDailyJobs[0]?.id === row.id;

                            let codeColorClass = '';
                            if (worker.contractType === ContractType.INDEFINIDO) {
                                codeColorClass = 'text-slate-900';
                            } else if (worker.contractType === ContractType.AUTONOMO || worker.contractType === ContractType.AUTONOMA_COLABORADORA) {
                                codeColorClass = 'text-blue-600';
                            } else {
                                codeColorClass = 'text-red-600';
                            }

                            return (
                                <div 
                                    key={worker.id} 
                                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-black uppercase shadow-sm ${
                                        !isFirstJob 
                                            ? 'bg-green-50 border-green-200 text-green-700' 
                                            : 'bg-white border-slate-200 text-slate-700'
                                    }`}
                                    title={`${worker.name} - ${worker.role} (${worker.contractType})`}
                                >
                                    <span className={codeColorClass}>{worker.code}</span>
                                    <span className="truncate max-w-[120px]">{worker.name.split(' ')[0]}</span>
                                </div>
                            );
                        })
                    ) : (
                        <span className="text-slate-300 italic text-[10px] font-medium">Sin asignar</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-24 text-center text-slate-400 bg-white">
                  <Table className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">No hay registros para este periodo</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Footer Informativo */}
      <div className="bg-slate-900 border-t border-slate-800 px-6 py-2.5 text-[10px] text-slate-400 font-black uppercase tracking-widest flex justify-between z-10">
        <span>Mostrando {rows.length} tareas planificadas</span>
        <span>Modo: {viewMode === 'day' ? `Día ${formatDateDMY(planning.currentDate)}` : `${formatDateDMY(rangeStartDate)} al ${formatDateDMY(rangeEndDate)}`}</span>
      </div>
    </div>
  );
};

export default CompactPlanningView;