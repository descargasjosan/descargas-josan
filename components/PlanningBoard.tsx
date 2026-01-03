
import React, { useState, useEffect, useRef } from 'react';
import { Clock, MapPin, Users, Plus, Edit2, X, AlertCircle, Search, Move, AlertTriangle, Euro, ArrowRightLeft, CheckCircle2, MoreHorizontal, CalendarPlus, Ban, Flag, Briefcase, Award, TrendingUp, UserCheck, StickyNote, Stethoscope, FileText } from 'lucide-react';
import { Job, PlanningState, Worker, WorkerStatus, ContractType } from '../types';
import { isTimeOverlap, checkContinuityRisk, formatDateDMY } from '../utils';

interface PlanningBoardProps {
  planning: PlanningState;
  datesToShow: string[]; // MODIFICADO: Recibe un array de fechas para renderizar
  onDropWorker: (workerId: string, jobId: string) => void;
  onRemoveWorker: (workerId: string, jobId: string) => void;
  onAddJob: (clientId: string, date: string) => void; // MODIFICADO: Recibe la fecha específica
  onEditJob: (job: Job) => void;
  onDuplicateJob: (job: Job) => void;
  draggedWorkerId: string | null;
  onDragStartFromBoard: (workerId: string, jobId: string) => void;
  onReorderJob: (sourceJobId: string, targetJobId: string) => void;
  onReorderClient: (sourceClientId: string, targetClientId: string) => void;
  onEditNote: (workerId: string) => void; 
}

const PlanningBoard: React.FC<PlanningBoardProps> = ({ 
  planning, 
  datesToShow,
  onDropWorker, 
  onRemoveWorker,
  onAddJob,
  onEditJob,
  onDuplicateJob,
  draggedWorkerId,
  onDragStartFromBoard,
  onReorderJob,
  onReorderClient,
  onEditNote
}) => {
  const [dragOverJobId, setDragOverJobId] = useState<string | null>(null);
  const [dragOverClientId, setDragOverClientId] = useState<string | null>(null);
  const [selectorJobId, setSelectorJobId] = useState<string | null>(null);
  const [workerSearch, setWorkerSearch] = useState('');
  
  // ESTADO PARA MENÚ CONTEXTUAL
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, workerId: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    const handleClickOutside = (e: MouseEvent) => {
        if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
            setContextMenu(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        clearInterval(timer);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent, jobId: string) => { e.preventDefault(); setDragOverJobId(jobId); };
  
  const handleClientDragOver = (e: React.DragEvent, clientId: string) => { e.preventDefault(); setDragOverClientId(clientId); };
  
  const handleDrop = (e: React.DragEvent, targetId: string, type: 'job' | 'client') => { 
    e.preventDefault(); 
    if (type === 'job') setDragOverJobId(null);
    else setDragOverClientId(null);
    
    if (draggedWorkerId && type === 'job') {
        onDropWorker(draggedWorkerId, targetId);
        return;
    }

    const sourceJobId = e.dataTransfer.getData('jobId');
    if (sourceJobId && type === 'job' && sourceJobId !== targetId) {
        onReorderJob(sourceJobId, targetId);
        return;
    }

    const sourceClientId = e.dataTransfer.getData('clientId');
    if (sourceClientId && type === 'client' && sourceClientId !== targetId) {
        onReorderClient(sourceClientId, targetId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, workerId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, workerId });
  };

  const filteredWorkers = planning.workers.filter(w => 
    w.status === WorkerStatus.ACTIVO && (w.name.toLowerCase().includes(workerSearch.toLowerCase()) || w.code.includes(workerSearch))
  );

  const getEffectiveEndTime = (job: Job) => {
    if (job.isFinished && job.actualEndTime) return job.actualEndTime;
    return job.endTime;
  };

  const currentHmm = currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const currentDateStr = currentTime.toISOString().split('T')[0];

  // Calcular estadísticas globales (del primer día o acumuladas si se prefiere, aquí hacemos del primer día para simplificar la barra superior en modo diario)
  // En modo rango, la barra superior podría mostrar totales o estar oculta/simplificada. 
  // Mantendremos la lógica actual basada en el primer día del array para la barra superior por coherencia visual.
  const referenceDate = datesToShow[0];
  const dailyJobsForStats = planning.jobs.filter(j => j.date === referenceDate);
  const activeDailyJobsForStats = dailyJobsForStats.filter(j => !j.isCancelled);
  const uniqueWorkerIdsStats = new Set(activeDailyJobsForStats.flatMap(j => j.assignedWorkerIds));
  const activeWorkersStats = planning.workers.filter(w => uniqueWorkerIdsStats.has(w.id));

  const stats = {
    total: activeWorkersStats.length,
    jefes: activeWorkersStats.filter(w => w.contractType === ContractType.FIJO && w.role.toLowerCase().includes('jefe')).length,
    mozos: activeWorkersStats.filter(w => w.contractType === ContractType.FIJO && !w.role.toLowerCase().includes('jefe')).length,
    discontinuos: activeWorkersStats.filter(w => w.contractType === ContractType.FIJO_DISCONTINUO).length
  };

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto p-4 space-y-4 pb-32 custom-scrollbar relative">
      
      {/* MENÚ CONTEXTUAL */}
      {contextMenu && (
          <div 
            ref={contextMenuRef}
            className="fixed z-[300] bg-white rounded-xl shadow-2xl border border-slate-100 w-48 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
             <button 
                onClick={() => { onEditNote(contextMenu.workerId); setContextMenu(null); }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-700 flex items-center gap-2 transition-colors"
             >
                <StickyNote className="w-4 h-4 text-blue-500" /> Gestionar Nota
             </button>
          </div>
      )}

      {/* Selector Modal */}
      {selectorJobId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectorJobId(null)}>
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-100" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100">
              <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-black text-slate-900 italic tracking-tight uppercase">Asignar Operario</h3><button onClick={() => setSelectorJobId(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><X className="w-5 h-5 text-slate-400" /></button></div>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input autoFocus type="text" placeholder="Buscar por nombre o código..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-50 outline-none" value={workerSearch} onChange={(e) => setWorkerSearch(e.target.value)} /></div>
            </div>
            <div className="max-h-[350px] overflow-y-auto p-2 custom-scrollbar">
              {filteredWorkers.map(worker => {
                // Buscamos el trabajo actual para validar continuidad correctamente
                const targetJob = planning.jobs.find(j => j.id === selectorJobId);
                const continuityGaps = targetJob ? checkContinuityRisk(worker, targetJob.date, planning.jobs, planning.customHolidays) : null;
                
                const isLeader = worker.role.toLowerCase().includes('jefe');
                let itemClass = '';
                if (worker.contractType === ContractType.FIJO) {
                    itemClass = isLeader ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white' : 'bg-slate-100 text-slate-900 group-hover:bg-slate-800 group-hover:text-white';
                } else {
                    itemClass = 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white';
                }

                return (
                  <button key={worker.id} onClick={() => { onDropWorker(worker.id, selectorJobId); setSelectorJobId(null); setWorkerSearch(''); }} className="w-full flex items-center justify-between p-3 hover:bg-blue-50 rounded-2xl transition-all group border border-transparent hover:border-blue-100 mb-1">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black transition-colors ${itemClass}`}>
                        {worker.code}
                      </div>
                      <div className="text-left"><p className="text-sm font-black text-slate-900 tracking-tight group-hover:text-blue-700">{worker.name}</p><p className="text-[10px] font-bold text-slate-400 uppercase">{worker.role}</p></div>
                    </div>
                    {continuityGaps && <Euro className="w-4 h-4 text-amber-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* BARRA DE ESTADÍSTICAS COMPACTA (Solo visible si es 1 día o muestra datos del primer día del rango) */}
      {datesToShow.length === 1 && (
        <div className="bg-white rounded-[20px] p-3 border border-slate-200 shadow-sm flex items-center justify-between gap-4 overflow-x-auto custom-scrollbar mb-2">
           {/* ... (Estadísticas sin cambios) ... */}
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 pr-6 border-r border-slate-100">
                 <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                   <TrendingUp className="w-5 h-5" />
                 </div>
                 <div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Operarios</p>
                    <p className="text-xl font-black text-slate-900 leading-none">{stats.total}</p>
                 </div>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Award className="w-4 h-4" /></div>
                 <div><p className="text-lg font-black text-blue-600 leading-none">{stats.jefes}</p><p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">Jefes Equipo</p></div>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><UserCheck className="w-4 h-4" /></div>
                 <div><p className="text-lg font-black text-slate-700 leading-none">{stats.mozos}</p><p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">Mozos Fijos</p></div>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><Briefcase className="w-4 h-4" /></div>
                 <div><p className="text-lg font-black text-red-600 leading-none">{stats.discontinuos}</p><p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">Fijos Disc.</p></div>
              </div>
           </div>
        </div>
      )}

      {/* BUCLE PRINCIPAL DE FECHAS */}
      <div className="space-y-12">
        {datesToShow.map(date => {
          const dailyJobs = planning.jobs.filter(j => j.date === date);
          const activeClientIds = new Set(dailyJobs.map(j => j.clientId));
          const activeClients = planning.clients.filter(c => activeClientIds.has(c.id));
          const isViewToday = date === currentDateStr;
          const isViewPast = date < currentDateStr;

          return (
            <div key={date} className="animate-in fade-in slide-in-from-bottom-2">
              {datesToShow.length > 1 && (
                <div className="flex items-center gap-4 mb-4 pb-2 border-b border-slate-200">
                   <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest shadow-md">
                      {formatDateDMY(date)}
                   </div>
                   <div className="text-xs font-bold text-slate-400 uppercase">
                      {new Date(date).toLocaleDateString('es-ES', { weekday: 'long' })}
                   </div>
                </div>
              )}

              {activeClients.length > 0 ? (
                <div className="space-y-4">
                  {activeClients.map(client => {
                    const clientJobs = dailyJobs.filter(j => j.clientId === client.id);
                    const isDragOverClient = dragOverClientId === client.id;
                    
                    return (
                      <div 
                        key={`${date}-${client.id}`} 
                        draggable
                        onDragStart={(e) => {
                           e.dataTransfer.setData('clientId', client.id);
                           e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => handleClientDragOver(e, client.id)}
                        onDragLeave={() => setDragOverClientId(null)}
                        onDrop={(e) => handleDrop(e, client.id, 'client')}
                        className={`bg-white rounded-[24px] border shadow-sm overflow-hidden transition-all duration-200 ${isDragOverClient ? 'border-blue-400 ring-2 ring-blue-100 transform scale-[1.01]' : 'border-slate-200'}`}
                      >
                        <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between cursor-grab active:cursor-grabbing">
                          <div className="flex items-center gap-3">
                            <div className="text-slate-500 hover:text-white transition-colors" title="Mover Cliente"><Move className="w-4 h-4" /></div>
                            <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-lg flex items-center justify-center font-black text-[10px]">{client.logo}</div>
                            <h3 className="text-[13px] font-black uppercase tracking-tight">{client.name}</h3>
                          </div>
                          <button 
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => onAddJob(client.id, date)} 
                            className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-1.5 border border-white/10"
                          >
                            <Plus className="w-3 h-3" /> Nueva Tarea
                          </button>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {clientJobs.map(job => {
                            const center = client.centers.find(c => c.id === job.centerId);
                            const isFull = job.assignedWorkerIds.length >= job.requiredWorkers;
                            const progress = (job.assignedWorkerIds.length / job.requiredWorkers) * 100;
                            const isCancelled = job.isCancelled;
                            const isFinishedManual = job.isFinished;
                            const isFinishedTime = !isCancelled && !isFinishedManual && ((isViewToday && currentHmm > job.endTime) || isViewPast);
                            
                            let containerClass = 'transition-all relative';
                            if (isCancelled) containerClass += ' bg-[#FFD4D4] opacity-80 cursor-not-allowed';
                            else if (isFinishedManual || isFinishedTime) containerClass += ' bg-[#D1E3FF]';
                            else if (dragOverJobId === job.id) containerClass += ' bg-blue-50 ring-2 ring-blue-500 z-10';
                            else containerClass += ' bg-white hover:bg-slate-50/50';

                            return (
                              <div 
                                key={job.id} 
                                draggable={!isCancelled} 
                                onDragStart={(e) => {
                                   if (!isCancelled) {
                                      e.dataTransfer.setData('jobId', job.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.stopPropagation();
                                   }
                                }}
                                onDragOver={(e) => !isCancelled && handleDragOver(e, job.id)} 
                                onDragLeave={() => setDragOverJobId(null)} 
                                onDrop={(e) => !isCancelled && handleDrop(e, job.id, 'job')}
                                className={`flex flex-col lg:flex-row items-stretch lg:items-center ${containerClass}`}
                              >
                                {/* ... (Etiquetas Estado) ... */}
                                {isCancelled && (
                                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                                     <div className="bg-red-100/90 text-red-600 px-4 py-1 rounded-full border border-red-200 font-black text-[10px] uppercase tracking-[0.2em] shadow-sm flex items-center gap-2 transform -rotate-2">
                                       <Ban className="w-3 h-3" /> ANULADA
                                     </div>
                                   </div>
                                )}
                                
                                {isFinishedManual && !isCancelled && (
                                   <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none z-0 opacity-40 lg:opacity-100">
                                     <div className="text-blue-800 lg:text-blue-900/40 px-2 py-1 rounded-lg font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-1">
                                       <Flag className="w-3 h-3" /> FINALIZADA
                                     </div>
                                   </div>
                                )}

                                {!isCancelled && (
                                   <div className="hidden lg:flex pl-3 py-2 items-center justify-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors" title="Reordenar Tarea">
                                      <Move className="w-3 h-3" />
                                   </div>
                                )}

                                {/* Columna SEDE */}
                                <div className="lg:w-32 px-4 py-2 border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0">
                                  <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                                    <MapPin className="w-2.5 h-2.5" />
                                    <span className="text-[8px] font-black uppercase tracking-widest">Sede</span>
                                  </div>
                                  <p className="text-[11px] font-black text-slate-900 uppercase truncate leading-tight">{center?.name || 'Central'}</p>
                                </div>

                                {/* Columna ALBARÁN (NUEVA) */}
                                <div className="lg:w-28 px-4 py-2 border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0">
                                  <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                                    <FileText className="w-2.5 h-2.5" />
                                    <span className="text-[8px] font-black uppercase tracking-widest">Albarán</span>
                                  </div>
                                  {job.deliveryNote ? (
                                    <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 truncate block">
                                      {job.deliveryNote}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-300 italic">-</span>
                                  )}
                                </div>

                                {/* Columna TAREA + ACCIONES */}
                                <div className="lg:w-48 px-4 py-2 border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0 group/actions">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <div className="flex items-center gap-1.5 text-slate-400">
                                      <Plus className="w-2.5 h-2.5 rotate-45" />
                                      <span className="text-[8px] font-black uppercase tracking-widest">Tarea</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover/actions:opacity-100 transition-opacity z-30 relative">
                                      <button onClick={() => onDuplicateJob(job)} className="p-0.5 text-slate-300 hover:text-blue-600 transition-colors" title="Duplicar tarea">
                                        <CalendarPlus className="w-3 h-3" />
                                      </button>
                                      <button onClick={() => onEditJob(job)} className="p-0.5 text-slate-300 hover:text-blue-600 transition-colors" title="Editar tarea">
                                        <Edit2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-[11px] font-black text-slate-900 leading-tight truncate">{job.customName || job.type}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                      {job.ref && <p className="text-[8px] font-bold text-slate-400 truncate italic">Ref: {job.ref}</p>}
                                  </div>
                                </div>

                                {/* Columna HORARIO */}
                                <div className="lg:w-32 px-4 py-2 border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0">
                                  <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                                    <Clock className="w-2.5 h-2.5" />
                                    <span className="text-[8px] font-black uppercase tracking-widest">Horario</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                     <p className={`text-[10px] font-black px-1.5 py-0.5 rounded-md inline-block ${isFinishedManual || isFinishedTime ? 'bg-white/50 text-slate-500 line-through decoration-slate-400' : 'bg-blue-50 text-blue-600'}`}>
                                        {job.startTime} - {job.endTime}
                                     </p>
                                     {isFinishedManual && job.actualEndTime && (
                                       <span className="text-[10px] font-black text-blue-800 bg-white/50 px-1.5 py-0.5 rounded-md">
                                         {job.actualEndTime}
                                       </span>
                                     )}
                                  </div>
                                </div>

                                {/* Columna DOTACIÓN */}
                                <div className="lg:w-24 px-4 py-2 border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Operarios</span>
                                    <span className="text-[9px] font-black text-slate-900">{job.assignedWorkerIds.length}/{job.requiredWorkers}</span>
                                  </div>
                                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-700 ${progress >= 100 ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(progress, 100)}%` }} />
                                  </div>
                                </div>

                                {/* Columna EQUIPO ASIGNADO (Flexible) */}
                                <div className="flex-1 px-4 py-1.5 flex flex-wrap gap-1.5 items-center min-h-[44px]">
                                  {job.assignedWorkerIds.map(workerId => {
                                    const worker = planning.workers.find(w => w.id === workerId);
                                    if (!worker) return null;

                                    // BUSCAR NOTA PARA ESTE OPERARIO HOY
                                    const dailyNote = planning.dailyNotes?.find(n => n.workerId === worker.id && n.date === date);

                                    const workerDailyJobs = dailyJobs
                                      .filter(j => j.assignedWorkerIds.includes(workerId))
                                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                                    
                                    const isFirstJob = workerDailyJobs[0]?.id === job.id;
                                    
                                    const currentJobEndTime = getEffectiveEndTime(job);
                                    const hasOverlap = dailyJobs.some(otherJob => {
                                      if (otherJob.id === job.id) return false; 
                                      if (otherJob.isCancelled) return false; 
                                      if (!otherJob.assignedWorkerIds.includes(worker.id)) return false; 

                                      const otherJobEndTime = getEffectiveEndTime(otherJob);
                                      return isTimeOverlap(job.startTime, currentJobEndTime, otherJob.startTime, otherJobEndTime);
                                    });
                                    
                                    const continuityGaps = checkContinuityRisk(worker, date, planning.jobs, planning.customHolidays);
                                    const isLeader = worker.role.toLowerCase().includes('jefe');
                                    let codeColorClass = 'text-red-500';
                                    if (worker.contractType === ContractType.FIJO) {
                                        codeColorClass = isLeader ? 'text-blue-600' : 'text-slate-900';
                                    }

                                    return (
                                      <div 
                                        key={worker.id} 
                                        draggable={!isCancelled} 
                                        onDragStart={(e) => {
                                           e.stopPropagation(); 
                                           if (!isCancelled) onDragStartFromBoard(worker.id, job.id);
                                        }}
                                        onContextMenu={(e) => handleContextMenu(e, worker.id)} // CLICK DERECHO
                                        title={dailyNote ? dailyNote.text : undefined} // Tooltip simple con la nota
                                        className={`flex items-center gap-1.5 pl-1.5 pr-0.5 py-0.5 rounded-lg border transition-all shadow-sm text-[10px] font-black uppercase relative ${!isCancelled ? 'cursor-grab active:cursor-grabbing' : ''} ${
                                          hasOverlap ? 'bg-red-50 border-red-200 text-red-700 ring-1 ring-red-100' : 
                                          !isFirstJob ? 'bg-green-50 border-green-200 text-green-700' : 
                                          'bg-white border-slate-200 text-slate-700'
                                        } ${dailyNote ? 'pr-2' : ''}`}
                                      >
                                        <span className={codeColorClass}>{worker.code}</span>
                                        <span className="truncate max-w-[60px]">{worker.name.split(' ')[0]}</span>
                                        
                                        {/* ICONOS INDICADORES */}
                                        {continuityGaps && <Euro className="w-2.5 h-2.5 text-amber-500" />}
                                        
                                        {/* INDICADOR DE NOTA */}
                                        {dailyNote && (
                                          <div className={`w-3 h-3 rounded-full flex items-center justify-center ml-0.5 ${dailyNote.type === 'medical' ? 'text-red-500' : 'text-amber-500'}`}>
                                             {dailyNote.type === 'medical' ? <Stethoscope className="w-3 h-3" /> : <StickyNote className="w-3 h-3" />}
                                          </div>
                                        )}

                                        <button onClick={() => !isCancelled && onRemoveWorker(worker.id, job.id)} disabled={isCancelled} className={`p-0.5 ml-0.5 ${isCancelled ? 'opacity-0' : 'hover:text-red-500'}`}><X className="w-2.5 h-2.5" /></button>
                                      </div>
                                    );
                                  })}
                                  
                                  {!isFull && !isCancelled && !isFinishedManual && !isFinishedTime && (
                                    <button 
                                      onClick={() => setSelectorJobId(job.id)} 
                                      className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                                      title="Añadir Operario"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-slate-300 bg-white/50 rounded-[24px] border border-dashed border-slate-200">
                  <Clock className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Sin actividad para el {formatDateDMY(date)}</p>
                  <button onClick={() => onAddJob('', date)} className="mt-4 text-[10px] font-black text-blue-600 hover:underline">+ Añadir Tarea Manual</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlanningBoard;
