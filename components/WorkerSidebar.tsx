import React from 'react';
import { Search, User, Car, Euro, CalendarCheck } from 'lucide-react';
import { Worker, PlanningState, WorkerStatus, ContractType } from '../types';
import { checkContinuityRisk } from '../utils';

interface WorkerSidebarProps {
  workers: Worker[];
  planning: PlanningState;
  onDragStart: (worker: Worker) => void;
  selectedWorkerId: string | null;
  onSelectWorker: (id: string) => void;
  onUpdateWorkerStatus: (workerId: string, status: WorkerStatus) => void;
}

const WorkerSidebar: React.FC<WorkerSidebarProps> = ({ 
  workers, 
  planning, 
  onDragStart,
  selectedWorkerId,
  onSelectWorker
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');

  // FILTRO: Activos O (Inactivos cuya fecha de fin ya pasó respecto a la fecha de planificación)
  // ADEMÁS: Excluimos los archivados (isArchived === true)
  const filteredWorkers = workers.filter(w => {
    // Si está archivado, no se muestra en la agenda diaria
    if (w.isArchived) return false;

    const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.code.includes(searchTerm);
    
    const isActive = w.status === WorkerStatus.ACTIVO || w.status === WorkerStatus.DISPONIBLE;
    
    // Si tiene fecha de fin (ej: fin de vacaciones), verificamos si para la fecha actual del planning ya ha vuelto.
    // planning.currentDate > w.statusEndDate significa que el día actual es posterior al último día de baja.
    const isBackFromLeave = w.statusEndDate ? planning.currentDate > w.statusEndDate : false;

    return (isActive || isBackFromLeave) && matchesSearch;
  });

  return (
    <div className="w-72 border-r bg-white h-screen flex flex-col sticky top-0 shrink-0">
      {/* Cabecera Compacta */}
      <div className="p-3 border-b bg-white z-10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-[900] tracking-tight uppercase text-slate-900 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" /> Operarios Disponibles
          </h2>
          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md text-[9px] font-black border border-slate-200">
            {filteredWorkers.length}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-50 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Lista Compacta */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
        {filteredWorkers.map(worker => {
          const isSelected = selectedWorkerId === worker.id;
          // MODIFICADO: Ignorar tareas anuladas para el conteo de asignaciones
          const assignedJobsCount = planning.jobs.filter(j => j.date === planning.currentDate && !j.isCancelled && j.assignedWorkerIds.includes(worker.id)).length;
          const continuityGaps = checkContinuityRisk(worker, planning.currentDate, planning.jobs, planning.customHolidays);
          
          // Detectar si se muestra porque volvió de una baja/vacaciones pero aún no se actualizó el estado
          const isTechnicallyInactive = worker.status !== WorkerStatus.ACTIVO && worker.status !== WorkerStatus.DISPONIBLE;
          
          // Lógica de colores por Rol
          const isLeader = worker.role.toLowerCase().includes('jefe');
          let avatarClass = 'bg-white border-slate-200';
          
          if (worker.contractType === ContractType.FIJO) {
             if (isLeader) {
                 avatarClass += ' text-blue-600'; // Jefe de Equipo
             } else {
                 avatarClass += ' text-slate-900'; // Mozo Fijo
             }
          } else {
             avatarClass += ' text-red-500'; // Fijo Discontinuo
          }

          return (
            <div
              key={worker.id}
              draggable
              onDragStart={() => onDragStart(worker)}
              onClick={() => onSelectWorker(worker.id)}
              className={`
                group flex items-center gap-2 p-2 border-b border-slate-50 cursor-grab active:cursor-grabbing transition-all hover:bg-slate-50
                ${isSelected ? 'bg-blue-50/80 border-blue-100' : ''}
                ${continuityGaps ? 'bg-amber-50/40' : ''}
              `}
            >
              {/* CÓDIGO (Avatar pequeño) */}
              <div className={`
                w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 border shadow-sm relative
                ${avatarClass}
              `}>
                {worker.code}
                {isTechnicallyInactive && (
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" title="Disponible por fecha" />
                )}
              </div>

              {/* INFORMACIÓN PRINCIPAL (Una columna apretada) */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  <p className={`text-[11px] font-black truncate leading-none ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                    {worker.name}
                  </p>
                  {/* Icono de Riesgo SS (Si existe) */}
                  {continuityGaps && (
                    <div title="Riesgo Cotización">
                      <Euro className="w-3 h-3 text-amber-500 shrink-0" />
                    </div>
                  )}
                  {/* Icono de vuelta de baja */}
                  {isTechnicallyInactive && (
                    <div title="Vuelta de baja/vacaciones">
                      <CalendarCheck className="w-3 h-3 text-green-500 shrink-0" />
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate leading-none">
                    {worker.role}
                  </p>
                   {/* Icono de Vehículo (Si tiene) */}
                  {worker.hasVehicle && (
                    <div className="flex items-center gap-0.5 text-slate-400" title="Vehículo Propio">
                      <Car className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>
              </div>

              {/* ESTADO (Badge Derecha) */}
              <div className={`
                px-2 py-1 rounded-[6px] text-[8px] font-black uppercase tracking-wider shrink-0 border
                ${assignedJobsCount > 0 
                  ? 'bg-blue-100 text-blue-700 border-blue-200' 
                  : 'bg-green-100 text-green-700 border-green-200'}
              `}>
                {assignedJobsCount > 0 ? `${assignedJobsCount} ASIG` : 'LIBRE'}
              </div>
            </div>
          );
        })}
        
        {filteredWorkers.length === 0 && (
          <div className="p-8 text-center opacity-40">
            <p className="text-[10px] font-black uppercase text-slate-400">No hay operarios disponibles</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerSidebar;