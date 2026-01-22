
import React from 'react';
import { Search, User, Car, Euro, CalendarCheck, Briefcase } from 'lucide-react';
import { Worker, PlanningState, WorkerStatus, ContractType } from '../lib/types';
import { checkContinuityRisk } from '../lib/utils';

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
  const [filterDiscontinuos, setFilterDiscontinuos] = React.useState(false);

  // Función para acortar el nombre: "Juan Domínguez" -> "Juan D."
  const getShortName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    const firstName = parts[0];
    const lastNameInitial = parts[1][0].toUpperCase();
    return `${firstName} ${lastNameInitial}.`;
  };

  // FILTRO: Muestra trabajadores activos/disponibles y gestiona las fechas de bajas/vacaciones
  const filteredWorkers = workers.filter(w => {
    // 1. Descartar archivados
    if (w.isArchived) return false;

    // 2. Filtro de búsqueda (Nombre o Código)
    const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.code.includes(searchTerm);
    if (!matchesSearch) return false;

    // 3. Filtro rápido de Fijos Discontinuos
    if (filterDiscontinuos && w.contractType !== ContractType.FIJO_DISCONTINUO) return false;
    
    // 4. Lógica de Estado
    const isUnavailableStatus = [
      WorkerStatus.VACACIONES, 
      WorkerStatus.BAJA_MEDICA, 
      WorkerStatus.BAJA_PATERNIDAD
    ].includes(w.status);

    if (isUnavailableStatus) {
      // Si está en estado no disponible, verificamos si el periodo ya venció
      // Si la fecha actual es mayor a la fecha fin, el trabajador vuelve a estar visible
      if (w.statusEndDate && planning.currentDate > w.statusEndDate) {
        return true; 
      }
      return false; // Sigue no disponible
    }

    // Si el estado es DISPONIBLE o ACTIVO, verificamos si tiene un periodo de bloqueo temporal
    if (w.statusStartDate && w.statusEndDate) {
      const isInStatusPeriod = planning.currentDate >= w.statusStartDate && planning.currentDate <= w.statusEndDate;
      if (isInStatusPeriod) return false; // Ocultar si hoy está dentro del rango de bloqueo
    }

    return true;
  });

  return (
    <div className="w-60 border-r bg-white h-screen flex flex-col sticky top-0 shrink-0">
      {/* Cabecera Compacta */}
      <div className="p-3 border-b bg-white z-10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[10px] font-[900] tracking-tight uppercase text-slate-900 flex items-center gap-1.5">
            <User className="w-3 h-3 text-slate-400" /> Disponibles
          </h2>
          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md text-[9px] font-black border border-slate-200">
            {filteredWorkers.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-50 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {/* BOTÓN FILTRO DISCONTINUOS */}
          <button 
            onClick={() => setFilterDiscontinuos(!filterDiscontinuos)}
            title="Filtrar Fijos Discontinuos"
            className={`px-2 py-1.5 rounded-lg border text-[9px] font-[900] transition-all flex items-center gap-1 uppercase tracking-tighter ${
              filterDiscontinuos 
                ? 'bg-red-500 border-red-600 text-white shadow-sm' 
                : 'bg-white border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500'
            }`}
          >
            <Briefcase className={`w-3 h-3 ${filterDiscontinuos ? 'text-white' : 'text-slate-300'}`} />
            F.D.
          </button>
        </div>
      </div>

      {/* Lista Compacta */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
        {filteredWorkers.map(worker => {
          const isSelected = selectedWorkerId === worker.id;
          const assignedJobsCount = planning.jobs.filter(j => j.date === planning.currentDate && !j.isCancelled && j.assignedWorkerIds.includes(worker.id)).length;
          const continuityGaps = checkContinuityRisk(worker, planning.currentDate, planning.jobs, planning.customHolidays);
          
          // Verificar si está técnicamente inactivo pero disponible por fecha (recuperado)
          const isRecovered = [WorkerStatus.VACACIONES, WorkerStatus.BAJA_MEDICA, WorkerStatus.BAJA_PATERNIDAD].includes(worker.status) && worker.statusEndDate && planning.currentDate > worker.statusEndDate;
          
          let avatarClass = '';
          if (worker.contractType === ContractType.INDEFINIDO) {
             avatarClass = 'bg-slate-900 text-white border-slate-900 shadow-sm'; 
          } else if (worker.contractType === ContractType.AUTONOMO || worker.contractType === ContractType.AUTONOMA_COLABORADORA) {
             avatarClass = 'bg-blue-50 text-blue-600 border-blue-100';
          } else {
             avatarClass = 'bg-red-50 text-red-600 border-red-100';
          }

          return (
            <div
              key={worker.id}
              draggable
              onDragStart={() => onDragStart(worker)}
              onClick={() => onSelectWorker(worker.id)}
              title={`${worker.name}\nTel: ${worker.phone}`}
              className={`
                group flex items-center gap-2 p-2 border-b border-slate-50 cursor-grab active:cursor-grabbing transition-all hover:bg-slate-50
                ${isSelected ? 'bg-blue-50/80 border-blue-100' : ''}
                ${continuityGaps ? 'bg-amber-50/40' : ''}
              `}
            >
              {/* CÓDIGO (Avatar pequeño) */}
              <div className={`
                w-7 h-7 rounded-lg flex items-center justify-center font-black text-[9px] shrink-0 border relative
                ${avatarClass}
              `}>
                {worker.code}
                {isRecovered && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full border border-white" title="Disponible por fin de periodo" />
                )}
              </div>

              {/* INFORMACIÓN PRINCIPAL (Nombre Abreviado) */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1">
                  <p className={`text-[10px] font-black truncate leading-none ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                    {getShortName(worker.name)}
                  </p>
                  {continuityGaps && (
                    <div title="Riesgo Cotización">
                      <Euro className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                    </div>
                  )}
                  {isRecovered && (
                    <div title="Vuelta de baja/vacaciones">
                      <CalendarCheck className="w-2.5 h-2.5 text-green-500 shrink-0" />
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight truncate leading-none">
                    {worker.role}
                  </p>
                  {worker.hasVehicle && (
                    <div className="flex items-center text-slate-300" title="Vehículo Propio">
                      <Car className="w-2 h-2" />
                    </div>
                  )}
                </div>
              </div>

              {/* ESTADO (Badge Derecha) */}
              <div className={`
                px-1.5 py-0.5 rounded-[4px] text-[7px] font-[900] uppercase tracking-tighter shrink-0 border
                ${assignedJobsCount > 0 
                  ? 'bg-blue-100 text-blue-700 border-blue-200' 
                  : 'bg-green-50 text-green-700 border-green-100'}
              `}>
                {assignedJobsCount > 0 ? `${assignedJobsCount} ASIG` : 'LIBRE'}
              </div>
            </div>
          );
        })}
        
        {filteredWorkers.length === 0 && (
          <div className="p-8 text-center opacity-40">
            <p className="text-[9px] font-black uppercase text-slate-400">Sin resultados</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerSidebar;
