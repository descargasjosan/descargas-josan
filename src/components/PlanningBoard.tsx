
import React, { useState, useEffect, useRef } from 'react';
import { Clock, MapPin, Users, Plus, Edit2, X, AlertCircle, Search, Move, AlertTriangle, Euro, ArrowRightLeft, CheckCircle2, MoreHorizontal, CalendarPlus, Ban, Flag, Briefcase, Award, TrendingUp, UserCheck, StickyNote, Stethoscope, FileText, List, FileSpreadsheet } from 'lucide-react';
import { Job, PlanningState, Worker, WorkerStatus, ContractType, ReinforcementGroup } from '../lib/types';
import { isTimeOverlap, checkContinuityRisk, formatDateDMY, getWorkerDisplayName } from '../lib/utils';

interface PlanningBoardProps {
  planning: PlanningState;
  datesToShow: string[];
  onDropWorker: (workerId: string, jobId: string) => void;
  onRemoveWorker: (workerId: string, jobId: string) => void;
  onAddJob: (clientId: string, date: string) => void; 
  onEditJob: (job: Job) => void;
  onDuplicateJob: (job: Job) => void;
  onShowWorkerList: (clientId: string, centerId: string, date: string) => void;
  onExportAccessList: (centerId: string, date: string) => void;
  highlightedWorker: string | null;
  draggedWorkerId: string | null;
  onDragStartFromBoard: (workerId: string, jobId: string) => void;
  onReorderJob: (sourceJobId: string, targetJobId: string) => void;
  onReorderClient: (sourceClientId: string, targetClientId: string) => void;
  onEditNote: (workerId: string, date: string) => void;
  onUpdateJobReinforcementGroups: (jobId: string, groups: ReinforcementGroup[]) => void;
}

const PlanningBoard: React.FC<PlanningBoardProps> = ({ 
  planning, 
  datesToShow,
  onDropWorker, 
  onRemoveWorker,
  onAddJob,
  onEditJob,
  onDuplicateJob,
  onShowWorkerList,
  onExportAccessList,
  highlightedWorker,
  draggedWorkerId,
  onDragStartFromBoard,
  onReorderJob,
  onReorderClient,
  onEditNote,
  onUpdateJobReinforcementGroups
}) => {
  const [dragOverJobId, setDragOverJobId] = useState<string | null>(null);
  const [dragOverClientId, setDragOverClientId] = useState<string | null>(null);
  const [selectorJobId, setSelectorJobId] = useState<string | null>(null);
  const [workerSearch, setWorkerSearch] = useState('');
  
  // ESTADO PARA MENÚ CONTEXTUAL
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, workerId: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  // ESTADO PARA MODAL DE GRUPOS DE REFUERZO
  const [reinforcementModal, setReinforcementModal] = useState<{ jobId: string, groups: ReinforcementGroup[] } | null>(null);
  const [newGroupTime, setNewGroupTime] = useState<string>('');
  const [reinforcementWorkerSearch, setReinforcementWorkerSearch] = useState<string>('');
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);

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
  
  const handleClientDragOver = (e: React.DragEvent, clientId: string) => { e.preventDefault(); dragOverClientId !== clientId && setDragOverClientId(clientId); };
  
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

  // Filtrado robusto de trabajadores para el selector
  const filteredWorkers = planning.workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(workerSearch.toLowerCase()) || w.code.includes(workerSearch);
    if (!matchesSearch) return false;

    // Verificar disponibilidad real (considerando fechas de fin de baja/vacaciones)
    const currentDate = datesToShow.length > 0 ? datesToShow[0] : new Date().toISOString().split('T')[0];
    
    // Si el estado es "NO DISPONIBLE", comprobar si ya ha expirado
    const isUnavailableStatus = [
      WorkerStatus.VACACIONES, 
      WorkerStatus.BAJA_MEDICA, 
      WorkerStatus.BAJA_PATERNIDAD
    ].includes(w.status);

    if (isUnavailableStatus) {
       // Si no tiene fecha fin, o la fecha fin es futura, no mostrar
       if (!w.statusEndDate || w.statusEndDate >= currentDate) {
          return false;
       }
       // Si la fecha fin ya pasó, se considera disponible
    } else if (w.status !== WorkerStatus.DISPONIBLE) {
       // Otros estados no disponibles
       return false;
    }

    // Verificar bloqueos temporales específicos
    if (w.statusStartDate && w.statusEndDate) {
      const isInStatusPeriod = currentDate >= w.statusStartDate && currentDate <= w.statusEndDate;
      // Si está en periodo de bloqueo y NO es uno de los estados que ya comprobamos arriba (que ya sabemos que expiró si llegamos aquí)
      // En realidad, si llegamos aquí es porque o es DISPONIBLE o expiró el estado anterior.
      // Pero si tiene un rango explícito de "bloqueo" siendo DISPONIBLE (caso raro), lo respetamos.
      if (isInStatusPeriod && w.status === WorkerStatus.DISPONIBLE) return false;
    }

    return true;
  });

  const getEffectiveEndTime = (job: Job) => {
    if (job.isFinished && job.actualEndTime) return job.actualEndTime;
    return job.endTime;
  };

  const currentHmm = currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const currentDateStr = currentTime.toISOString().split('T')[0];

  // Calcular estadísticas globales
  const referenceDate = datesToShow[0];
  const dailyJobsForStats = planning.jobs.filter(j => j.date === referenceDate);
  const activeDailyJobsForStats = dailyJobsForStats.filter(j => !j.isCancelled);
  const uniqueWorkerIdsStats = new Set(activeDailyJobsForStats.flatMap(j => j.assignedWorkerIds));
  const activeWorkersStats = planning.workers.filter(w => uniqueWorkerIdsStats.has(w.id));

  const stats = {
    total: activeWorkersStats.length,
    jefes: activeWorkersStats.filter(w => 
      (w.contractType === ContractType.FIJO || w.contractType === ContractType.INDEFINIDO) && 
      (w.role.toLowerCase().includes('jefe') || w.role.toLowerCase().includes('gerente') || w.role.toLowerCase().includes('director'))
    ).length,
    mozos: activeWorkersStats.filter(w => 
      (w.contractType === ContractType.FIJO || w.contractType === ContractType.INDEFINIDO) && 
      !(w.role.toLowerCase().includes('jefe') || w.role.toLowerCase().includes('gerente') || w.role.toLowerCase().includes('director'))
    ).length,
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
              {filteredWorkers.length === 0 ? (
                 <div className="p-8 text-center opacity-50">
                    <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-bold text-slate-400">No se encontraron operarios disponibles</p>
                 </div>
              ) : (
                filteredWorkers.map(worker => {
                  const targetJob = planning.jobs.find(j => j.id === selectorJobId);
                  const continuityGaps = targetJob ? checkContinuityRisk(worker, targetJob.date, planning.jobs, planning.customHolidays) : null;
                  
                  let itemClass = '';
                  if (worker.contractType === ContractType.INDEFINIDO) {
                      itemClass = 'bg-slate-900 text-white group-hover:bg-slate-800';
                  } else if (worker.contractType === ContractType.AUTONOMO || worker.contractType === ContractType.AUTONOMA_COLABORADORA) {
                      itemClass = 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white';
                  } else {
                      itemClass = 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white';
                  }

                  return (
                    <button key={worker.id} onClick={() => { onDropWorker(worker.id, selectorJobId); setSelectorJobId(null); setWorkerSearch(''); }} className="w-full flex items-center justify-between p-3 hover:bg-blue-50 rounded-2xl transition-all group border border-transparent hover:border-blue-100 mb-1">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black transition-colors ${itemClass}`}>
                          {worker.code}
                        </div>
                        <div className="text-left"><p className="text-sm font-black text-slate-900 tracking-tight group-hover:text-blue-700">{getWorkerDisplayName(worker)}</p><p className="text-[10px] font-bold text-slate-400 uppercase">{worker.role}</p></div>
                      </div>
                      {continuityGaps && <Euro className="w-4 h-4 text-amber-500" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* BARRA DE ESTADÍSTICAS COMPACTA */}
      {datesToShow.length === 1 && (
        <div className="bg-white rounded-[20px] p-3 border border-slate-200 shadow-sm flex items-center justify-between gap-4 overflow-x-auto custom-scrollbar mb-2">
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
          const isViewToday = date === currentDateStr;
          const isViewPast = date < currentDateStr;

          // NUEVO: Agrupar por albarán + cliente
          const groupedJobs = dailyJobs.reduce((groups: Record<string, { albaran: string; client: any; clientName: string; jobs: Job[] }>, job) => {
            const client = planning.clients.find(c => c.id === job.clientId);
            const clientName = client?.name || 'Cliente Desconocido';
            
            // Crear clave de agrupación usando deliveryNote (el campo correcto)
            const albaranKey = job.deliveryNote || 'Sin Albarán';
            const groupKey = `${albaranKey} - ${clientName}`;
            
            if (!groups[groupKey]) {
              groups[groupKey] = {
                albaran: job.deliveryNote || 'Sin Albarán',
                client: client,
                clientName: clientName,
                jobs: []
              };
            }
            
            groups[groupKey].jobs.push(job);
            return groups;
          }, {});

          // Ordenar grupos: albaranes numéricos primero, luego "Sin Albarán"
          const sortedGroups = Object.entries(groupedJobs).sort(([keyA], [keyB]) => {
            const albaranA = keyA.split(' - ')[0];
            const albaranB = keyB.split(' - ')[0];
            
            // Si ambos son "Sin Albarán", mantener orden
            if (albaranA === 'Sin Albarán' && albaranB === 'Sin Albarán') return 0;
            
            // "Sin Albarán" va al final
            if (albaranA === 'Sin Albarán') return 1;
            if (albaranB === 'Sin Albarán') return -1;
            
            // Orden numérico de albaranes
            return albaranA.localeCompare(albaranB);
          });

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

              {sortedGroups.length > 0 ? (
                <div className="space-y-4">
                  {sortedGroups.map(([groupKey, groupData]: [string, { albaran: string; client: any; clientName: string; jobs: Job[] }]) => {
                    const isDragOverClient = dragOverClientId === groupData.client?.id;
                    
                    return (
                      <div 
                        key={`${date}-${groupKey}`} 
                        draggable
                        onDragStart={(e) => {
                           e.dataTransfer.setData('clientId', groupData.client?.id || '');
                           e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => handleClientDragOver(e, groupData.client?.id || '')}
                        onDragLeave={() => setDragOverClientId(null)}
                        onDrop={(e) => handleDrop(e, groupData.client?.id || '', 'client')}
                        className={`bg-white rounded-[24px] border shadow-sm overflow-hidden transition-all duration-200 ${isDragOverClient ? 'border-blue-400 ring-2 ring-blue-100 transform scale-[1.01]' : 'border-slate-200'}`}
                      >
                        <div className="px-4 py-0.5 bg-slate-900 text-white flex items-center justify-between cursor-grab active:cursor-grabbing">
                          <div className="flex items-center gap-3">
                            <div className="text-slate-500 hover:text-white transition-colors" title="Mover Grupo"><Move className="w-4 h-4" /></div>
                            <h3 className="text-[12px] font-black uppercase tracking-tight">{groupData.clientName}</h3>
                          </div>
                          <button 
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => onAddJob(groupData.client?.id || '', date)} 
                            className="bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded-lg font-black text-[8px] uppercase tracking-widest transition-all flex items-center gap-1 border border-white/10"
                          >
                            <Plus className="w-3 h-3" /> Nueva Tarea
                          </button>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {groupData.jobs.map(job => {
                            const center = groupData.client?.centers?.find(c => c.id === job.centerId);
                            const isFull = job.assignedWorkerIds.length >= job.requiredWorkers;
                            const progress = (job.assignedWorkerIds.length / job.requiredWorkers) * 100;
                            const isCancelled = job.isCancelled;
                            const isFinishedManual = job.isFinished;
                            const isFinishedTime = !isCancelled && !isFinishedManual && ((isViewToday && currentHmm > job.endTime) || isViewPast);
                            
                            // 🎯 LÓGICA DE RESALTADO DE TRABAJADOR
                            const isWorkerHighlighted = highlightedWorker && job.assignedWorkerIds.includes(highlightedWorker);
                            
                            let containerClass = 'transition-all relative';
                            if (isCancelled) containerClass += ' bg-[#FFD4D4] opacity-80 cursor-not-allowed';
                            else if (isFinishedManual || isFinishedTime) containerClass += ' bg-[#D1E3FF]';
                            else if (dragOverJobId === job.id) containerClass += ' bg-blue-50 ring-2 ring-blue-500 z-10';
                            else if (isWorkerHighlighted) containerClass += ' bg-orange-50 ring-2 ring-orange-500 z-10 shadow-orange-200 shadow-lg';
                            else containerClass += ' bg-white hover:bg-slate-50/50';

                            // LÓGICA DE AGRUPACIÓN POR HORARIO DE OPERARIOS
                            const groupedWorkerIds: Record<string, string[]> = {};
                            job.assignedWorkerIds.forEach(wid => {
                                const time = job.workerTimes?.[wid] || job.startTime;
                                if (!groupedWorkerIds[time]) groupedWorkerIds[time] = [];
                                groupedWorkerIds[time].push(wid);
                            });
                            // Ordenar tiempos (keys) para renderizado consistente
                            const sortedTimes = Object.keys(groupedWorkerIds).sort();

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

                                {/* Columna ALBARÁN */}
                                <div className="lg:w-28 px-4 py-2 border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0">
                                  <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                                    <FileText className="w-2.5 h-2.5" />
                                    <span className="text-[8px] font-black uppercase tracking-widest">ALB.</span>
                                    {job.deliveryNote ? (
                                      <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-100 truncate">
                                        {job.deliveryNote}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-300 italic">-</span>
                                    )}
                                  </div>
                                </div>

                                {/* Columna TAREA + ACCIONES */}
                                <div className="lg:w-64 px-4 py-1 border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0 group/actions">
                                  <div className="flex items-center justify-between">
                                    {/* Columna A: Texto y Referencia */}
                                    <div className="text-left">
                                      <p className="text-[11px] font-black text-slate-900 leading-tight truncate">{job.customName || job.type}</p>
                                      {job.ref && <p className="text-[8px] font-bold text-slate-400 truncate italic">Ref: {job.ref}</p>}
                                    </div>
                                    
                                    {/* Columna B: Iconos */}
                                    <div className="grid grid-cols-2 gap-0.5 z-30 relative">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); onDuplicateJob(job); }} 
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors" 
                                        title="Duplicar tarea"
                                      >
                                        <CalendarPlus className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); onEditJob(job); }} 
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors" 
                                        title="Editar tarea"
                                      >
                                        <Edit2 className="w-2.5 h-2.5" />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); onShowWorkerList(job.clientId, job.centerId, job.date); }} 
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="p-0.5 text-slate-400 hover:text-green-600 transition-colors" 
                                        title="Listado de operarios"
                                      >
                                        <List className="w-2.5 h-2.5" />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); onExportAccessList(job.centerId, job.date); }} 
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="p-0.5 text-slate-400 hover:text-green-700 transition-colors" 
                                        title="Exportar listado Excel"
                                      >
                                        <FileSpreadsheet className="w-3 h-3" />
                                      </button>
                                    </div>
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
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Operarios</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] font-black text-slate-900">{job.assignedWorkerIds.length}/{job.requiredWorkers}</span>
                                      {job.isImposed && (
                                        <span className="text-[6px] font-black text-orange-600 uppercase tracking-wider bg-orange-50 px-1 rounded leading-none">
                                          SOLIC
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-700 ${progress >= 100 ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(progress, 100)}%` }} />
                                  </div>
                                </div>

                                {/* Columna EQUIPO ASIGNADO (Con soporte para franjas horarias / refuerzos) */}
                                <div className="flex-1 px-4 py-1 flex flex-wrap gap-x-4 gap-y-2 items-center min-h-[44px]">
                                  {sortedTimes.map(timeGroup => (
                                     <div key={timeGroup} className="flex items-center gap-2 border-r border-slate-50 last:border-0 pr-4 last:pr-0">
                                        {/* CABECERA DE FRANJA (Solo si es distinta a la de la tarea) */}
                                        {timeGroup !== job.startTime && (
                                            <div className="flex flex-col items-center justify-center mr-1">
                                                <span className="text-[7px] font-black text-blue-600 uppercase leading-none mb-0.5">Refuerzo</span>
                                                <span className="text-[9px] font-black text-slate-900 bg-blue-100 px-1 rounded leading-none">{timeGroup}</span>
                                            </div>
                                        )}
                                        <div className="flex flex-wrap gap-1.5">
                                            {groupedWorkerIds[timeGroup].map(workerId => {
                                                const worker = planning.workers.find(w => w.id === workerId);
                                                if (!worker) return null;

                                                const dailyNote = planning.dailyNotes?.find(n => n.workerId === worker.id && n.date === date);
                                                
                                                // REFINADO: Detección de si es la primera tarea del día considerando tiempos de refuerzo
                                                const workerDailyJobs = dailyJobs
                                                  .filter(j => j.assignedWorkerIds.includes(workerId))
                                                  .sort((a, b) => {
                                                     const timeA = a.workerTimes?.[workerId] || a.startTime;
                                                     const timeB = b.workerTimes?.[workerId] || b.startTime;
                                                     return timeA.localeCompare(timeB);
                                                  });
                                                
                                                const isFirstJob = workerDailyJobs[0]?.id === job.id;
                                                const currentJobEndTime = getEffectiveEndTime(job);
                                                const hasOverlap = dailyJobs.some(otherJob => {
                                                  if (otherJob.id === job.id || otherJob.isCancelled || !otherJob.assignedWorkerIds.includes(worker.id)) return false; 
                                                  const otherJobEndTime = getEffectiveEndTime(otherJob);
                                                  const otherWorkerStartTime = otherJob.workerTimes?.[workerId] || otherJob.startTime;
                                                  return isTimeOverlap(timeGroup, currentJobEndTime, otherWorkerStartTime, otherJobEndTime);
                                                });
                                                
                                                const continuityGaps = checkContinuityRisk(worker, date, planning.jobs, planning.customHolidays);
                                                
                                                let codeColorClass = '';
                                                if (worker.contractType === ContractType.INDEFINIDO) codeColorClass = 'text-slate-900 font-black';
                                                else if (worker.contractType === ContractType.AUTONOMO || worker.contractType === ContractType.AUTONOMA_COLABORADORA) codeColorClass = 'text-blue-600 font-black';
                                                else codeColorClass = 'text-red-600 font-black';

                                                return (
                                                  <div 
                                                    key={worker.id} 
                                                    draggable={!isCancelled} 
                                                    onDragStart={(e) => {
                                                       e.stopPropagation(); 
                                                       if (!isCancelled) onDragStartFromBoard(worker.id, job.id);
                                                    }}
                                                    onContextMenu={(e) => handleContextMenu(e, worker.id)}
                                                    title={dailyNote ? dailyNote.text : undefined}
                                                    className={`flex items-center gap-1.5 pl-1.5 pr-0.5 py-0.5 rounded-lg border transition-all shadow-sm text-[10px] font-black uppercase relative ${!isCancelled ? 'cursor-grab active:cursor-grabbing' : ''} ${
                                                      highlightedWorker === worker.id ? 'bg-orange-500 border-orange-600 text-white ring-2 ring-orange-400 shadow-orange-300 shadow-lg' :
                                                      hasOverlap ? 'bg-red-50 border-red-200 text-red-700 ring-1 ring-red-100' : 
                                                      !isFirstJob ? 'bg-green-100 border-green-300 text-green-800' : 
                                                      'bg-white border-slate-200 text-slate-700'
                                                    } ${dailyNote ? 'pr-2' : ''}`}
                                                  >
                                                    <span className={codeColorClass}>{worker.code}</span>
                                                    <span className="truncate max-w-[60px]">{worker.apodo && worker.apodo.trim() ? getWorkerDisplayName(worker) : getWorkerDisplayName(worker).split(' ')[0]}</span>
                                                    
                                                    {continuityGaps && <Euro className="w-2.5 h-2.5 text-amber-500" />}
                                                    {dailyNote && (
                                                      <div className={`w-3 h-3 rounded-full flex items-center justify-center ml-0.5 ${dailyNote.type === 'medical' ? 'text-red-500' : 'text-amber-500'}`}>
                                                         {dailyNote.type === 'medical' ? <Stethoscope className="w-3 h-3" /> : <StickyNote className="w-3 h-3" />}
                                                      </div>
                                                    )}
                                                    <button onClick={() => !isCancelled && onRemoveWorker(worker.id, job.id)} disabled={isCancelled} className={`p-0.5 ml-0.5 ${isCancelled ? 'opacity-0' : 'hover:text-red-500'}`}><X className="w-2.5 h-2.5" /></button>
                                                  </div>
                                                );
                                            })}
                                        </div>
                                     </div>
                                  ))}
                                  
                                  {!isFull && !isCancelled && !isFinishedManual && !isFinishedTime && (
                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setReinforcementModal({ 
                                            jobId: job.id, 
                                            groups: job.reinforcementGroups || []
                                          });
                                        }} 
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                          (job.reinforcementGroups?.length || 0) > 0 
                                            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 border border-blue-300' 
                                            : 'border border-dashed border-slate-300 text-slate-300 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50'
                                        }`}
                                        title={(job.reinforcementGroups?.length || 0) > 0 ? `${job.reinforcementGroups?.length} grupo(s) de refuerzo` : "Configurar grupos de refuerzo"}
                                      >
                                        <Clock className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setSelectorJobId(job.id);
                                        }} 
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                                        title="Añadir Operario"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>
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

      {/* MODAL PARA CONFIGURAR GRUPOS DE REFUERZO */}
      {reinforcementModal && (
        <div className="fixed inset-0 z-[400] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setReinforcementModal(null)}>
          <div className="bg-white rounded-[24px] p-6 shadow-2xl w-96 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-900">Grupos de Refuerzo</h3>
              <button onClick={() => setReinforcementModal(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            
            {/* Lista de grupos existentes */}
            {reinforcementModal.groups.length > 0 && (
              <div className="space-y-3 mb-6">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">Grupos Configurados</h4>
                {reinforcementModal.groups.map((group, index) => (
                  <div key={group.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="font-black text-sm">{group.startTime}</span>
                      </div>
                      <button 
                        onClick={() => {
                          const updatedGroups = reinforcementModal.groups.filter(g => g.id !== group.id);
                          onUpdateJobReinforcementGroups(reinforcementModal.jobId, updatedGroups);
                          setReinforcementModal({ ...reinforcementModal, groups: updatedGroups });
                        }}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    
                    {/* Operarios asignados a este grupo */}
                    <div className="space-y-1">
                      {group.workerIds.map(workerId => {
                        const worker = planning.workers.find(w => w.id === workerId);
                        return worker ? (
                          <div key={workerId} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-xs">
                            <span className="font-medium">{getWorkerDisplayName(worker)}</span>
                            <button 
                              onClick={() => {
                                const updatedGroups = reinforcementModal.groups.map(g => 
                                  g.id === group.id 
                                    ? { ...g, workerIds: g.workerIds.filter(id => id !== workerId) }
                                    : g
                                );
                                onUpdateJobReinforcementGroups(reinforcementModal.jobId, updatedGroups);
                                setReinforcementModal({ ...reinforcementModal, groups: updatedGroups });
                              }}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Añadir nuevo grupo */}
            <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">Añadir Nuevo Grupo</h4>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                  Hora de inicio
                </label>
                <input
                  type="time"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newGroupTime}
                  onChange={e => setNewGroupTime(e.target.value)}
                />
              </div>

              {/* Selector de operarios */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                  Operarios de refuerzo
                </label>
                
                {/* Filtro de búsqueda */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar operario o código..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    value={reinforcementWorkerSearch}
                    onChange={e => setReinforcementWorkerSearch(e.target.value)}
                  />
                </div>

                {/* Lista de operarios filtrados */}
                <div className="max-h-40 overflow-y-auto custom-scrollbar border border-slate-200 rounded-xl bg-slate-50">
                  {planning.workers
                    .filter(w => !w.isArchived)
                    .filter(w => {
                      // 🎯 USAR LA MISMA LÓGICA DE DISPONIBILIDAD QUE EL SIDEBAR
                      const currentDate = reinforcementModal?.jobId ? 
                        planning.jobs.find(j => j.id === reinforcementModal.jobId)?.date || new Date().toISOString().split('T')[0] :
                        new Date().toISOString().split('T')[0];
                      
                      // Si el estado es "NO DISPONIBLE", comprobar si ya ha expirado
                      const isUnavailableStatus = [
                        WorkerStatus.VACACIONES, 
                        WorkerStatus.BAJA_MEDICA, 
                        WorkerStatus.BAJA_PATERNIDAD
                      ].includes(w.status);

                      if (isUnavailableStatus) {
                         // Si no tiene fecha fin, o la fecha fin es futura, no mostrar
                         if (!w.statusEndDate || w.statusEndDate >= currentDate) {
                            return false;
                         }
                      }
                      
                      return true;
                    })
                    .filter(w => 
                      reinforcementWorkerSearch === '' || 
                      w.name.toLowerCase().includes(reinforcementWorkerSearch.toLowerCase()) ||
                      w.code.toLowerCase().includes(reinforcementWorkerSearch.toLowerCase())
                    )
                    .map(worker => {
                      const isAlreadyAssigned = reinforcementModal.groups.some(g => g.workerIds.includes(worker.id));
                      const isSelected = selectedWorkers.includes(worker.id);
                      
                      return (
                        <div key={worker.id} className="flex items-center justify-between p-3 hover:bg-white rounded-lg transition-colors">
                          <span className="text-sm font-medium">{getWorkerDisplayName(worker)} ({worker.code})</span>
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            disabled={isAlreadyAssigned}
                            checked={isAlreadyAssigned || isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedWorkers([...selectedWorkers, worker.id]);
                              } else {
                                setSelectedWorkers(selectedWorkers.filter(id => id !== worker.id));
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                </div>

                {/* Botón para añadir seleccionados */}
                {selectedWorkers.length > 0 && newGroupTime && (
                  <button
                    onClick={() => {
                      const updatedGroups = [...reinforcementModal.groups, {
                        id: `group-${Date.now()}`,
                        startTime: newGroupTime,
                        workerIds: selectedWorkers,
                        createdAt: new Date().toISOString()
                      }];
                      onUpdateJobReinforcementGroups(reinforcementModal.jobId, updatedGroups);
                      setReinforcementModal({ ...reinforcementModal, groups: updatedGroups });
                      setSelectedWorkers([]);
                      setNewGroupTime('');
                    }}
                    className="w-full mt-3 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-colors"
                  >
                    Añadir {selectedWorkers.length} operario(s) a las {newGroupTime}
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => {
                  setReinforcementModal(null);
                  setNewGroupTime('');
                  setReinforcementWorkerSearch('');
                  setSelectedWorkers([]);
                }}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanningBoard;
