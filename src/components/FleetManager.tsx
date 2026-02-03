
import React, { useState } from 'react';
import { Car, Wrench, AlertTriangle, Calendar, Plus, X, Edit2, Trash2, CheckCircle2, User, Gauge } from 'lucide-react';
import { PlanningState, Vehicle, Worker } from '../lib/types';
import { formatDateDMY } from '../lib/utils';

interface FleetManagerProps {
  planning: PlanningState;
  onAddVehicle: (v: Vehicle) => void;
  onEditVehicle: (v: Vehicle) => void;
  onDeleteVehicle: (id: string) => void;
  onAssignWorker: (vehicleId: string, workerId: string) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  draggedWorkerId: string | null;
}

const FleetManager: React.FC<FleetManagerProps> = ({
  planning,
  onAddVehicle,
  onEditVehicle,
  onDeleteVehicle,
  onAssignWorker,
  onRemoveAssignment,
  draggedWorkerId
}) => {
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, vehicleId: string) => {
    e.preventDefault();
    if (draggedWorkerId) {
      onAssignWorker(vehicleId, draggedWorkerId);
    }
  };

  const handleOpenForm = (v?: Vehicle) => {
    if (v) {
      setEditingVehicle(v);
    } else {
      setEditingVehicle({
        id: `v-${Date.now()}`,
        plate: '',
        brand: '',
        model: '',
        status: 'active'
      });
    }
    setShowForm(true);
  };

  const checkAlert = (dateStr?: string, type: string = ''): { status: 'ok' | 'warning' | 'error', text: string } | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { status: 'error', text: `${type} Vencida (${formatDateDMY(dateStr)})` };
    if (diffDays < 30) return { status: 'warning', text: `${type} Caduca en ${diffDays} días` };
    return { status: 'ok', text: `${type}: ${formatDateDMY(dateStr)}` };
  };

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto p-8 custom-scrollbar">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">Gestión de Vehículos</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            Asignación de vehículos para el <span className="text-blue-600">{formatDateDMY(planning.currentDate)}</span>
          </p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg"
        >
          <Plus className="w-4 h-4" /> Añadir Vehículo
        </button>
      </div>

      {/* GRID DE VEHÍCULOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
        {planning.vehicles.map(vehicle => {
          const assignment = planning.vehicleAssignments.find(a => a.vehicleId === vehicle.id && a.date === planning.currentDate);
          const assignedWorker = assignment ? planning.workers.find(w => w.id === assignment.workerId) : null;
          
          const itvAlert = checkAlert(vehicle.nextItvDate, 'ITV');
          const revAlert = checkAlert(vehicle.nextRevisionDate, 'Revisión');
          
          const isDragTarget = draggedWorkerId !== null;

          return (
            <div 
              key={vehicle.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, vehicle.id)}
              className={`bg-white rounded-[32px] p-6 border transition-all duration-300 relative group overflow-hidden ${
                vehicle.status === 'repair' ? 'border-red-200 bg-red-50/30' : 
                isDragTarget ? 'border-blue-300 ring-4 ring-blue-50 scale-[1.02]' : 'border-slate-100 hover:shadow-xl'
              }`}
            >
              {/* Header Card */}
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${vehicle.status === 'repair' ? 'bg-red-500' : 'bg-slate-900'}`}>
                    <Car className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-none">{vehicle.plate}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">{vehicle.brand} {vehicle.model}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onClick={() => handleOpenForm(vehicle)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Status & Alerts */}
              <div className="space-y-2 mb-6 relative z-10">
                {vehicle.status === 'repair' && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-100 px-3 py-2 rounded-xl text-[10px] font-black uppercase">
                    <Wrench className="w-4 h-4" /> En Taller / Averiado
                  </div>
                )}
                
                {itvAlert && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase ${
                    itvAlert.status === 'error' ? 'bg-red-100 text-red-600' : 
                    itvAlert.status === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'
                  }`}>
                    <Calendar className="w-4 h-4" /> {itvAlert.text}
                  </div>
                )}

                {revAlert && revAlert.status !== 'ok' && (
                   <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase ${
                    revAlert.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                  }`}>
                    <Gauge className="w-4 h-4" /> {revAlert.text}
                  </div>
                )}
              </div>

              {/* Assignment Zone */}
              <div className={`border-t border-slate-100 pt-4 mt-auto relative z-10 ${vehicle.status === 'repair' ? 'opacity-50 pointer-events-none' : ''}`}>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Conductor Asignado</p>
                
                {assignedWorker ? (
                  <div className="bg-slate-50 p-3 rounded-2xl flex items-center justify-between border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-black text-[10px]">
                        {assignedWorker.code}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900">{assignedWorker.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{assignedWorker.role}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => assignment && onRemoveAssignment(assignment.id)} 
                      className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="h-14 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-300 text-[10px] font-bold uppercase tracking-wide bg-slate-50/50">
                    Arrastra un operario aquí
                  </div>
                )}
              </div>

              {/* Decorative BG */}
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-slate-50 rounded-full z-0 group-hover:scale-150 transition-transform duration-500" />
            </div>
          );
        })}
        
        {planning.vehicles.length === 0 && (
           <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-[32px]">
              <Car className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-sm font-black uppercase tracking-widest">No hay vehículos registrados</p>
              <button onClick={() => handleOpenForm()} className="mt-4 text-blue-600 font-bold hover:underline">Registrar el primero</button>
           </div>
        )}
      </div>

      {/* MODAL FORMULARIO */}
      {showForm && editingVehicle && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full max-w-lg rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 italic uppercase">Datos del Vehículo</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Matrícula</label>
                  <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-900 text-lg uppercase focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0000 XXX" value={editingVehicle.plate} onChange={e => setEditingVehicle({...editingVehicle, plate: e.target.value.toUpperCase()})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Estado</label>
                  <select 
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3.5 font-bold text-slate-700 outline-none"
                    value={editingVehicle.status}
                    onChange={e => setEditingVehicle({...editingVehicle, status: e.target.value as any})}
                  >
                    <option value="active">🟢 Activo</option>
                    <option value="repair">🔴 En Taller</option>
                    <option value="inactive">⚪ Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Marca</label>
                  <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 outline-none" placeholder="Ej: Renault" value={editingVehicle.brand} onChange={e => setEditingVehicle({...editingVehicle, brand: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Modelo</label>
                  <input className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 outline-none" placeholder="Ej: Kangoo" value={editingVehicle.model} onChange={e => setEditingVehicle({...editingVehicle, model: e.target.value})} />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl space-y-3">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Calendar className="w-3 h-3" /> Vencimientos</p>
                 <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                       <label className="text-[9px] font-bold text-slate-500 uppercase">Próxima ITV</label>
                       <input type="date" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700" value={editingVehicle.nextItvDate || ''} onChange={e => setEditingVehicle({...editingVehicle, nextItvDate: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-bold text-slate-500 uppercase">Próx. Revisión</label>
                       <input type="date" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700" value={editingVehicle.nextRevisionDate || ''} onChange={e => setEditingVehicle({...editingVehicle, nextRevisionDate: e.target.value})} />
                    </div>
                 </div>
              </div>

              <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Notas</label>
                  <textarea className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-medium text-sm text-slate-700 outline-none h-20 resize-none" placeholder="Observaciones..." value={editingVehicle.notes || ''} onChange={e => setEditingVehicle({...editingVehicle, notes: e.target.value})} />
              </div>
            </div>

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
               {editingVehicle.id && !editingVehicle.id.toString().startsWith('v-') ? (
                 <button onClick={() => { onDeleteVehicle(editingVehicle.id); setShowForm(false); }} className="text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors"><Trash2 className="w-5 h-5" /></button>
               ) : <div />}
               
               <div className="flex gap-3">
                  <button onClick={() => setShowForm(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 text-sm">Cancelar</button>
                  <button 
                    onClick={() => { 
                      if(!editingVehicle.plate.trim()){
                        alert('La matrícula es obligatoria');
                        return;
                      }
                      if(!editingVehicle.brand.trim()){
                        alert('La marca es obligatoria');
                        return;
                      }
                      if(!editingVehicle.model.trim()){
                        alert('El modelo es obligatorio');
                        return;
                      }
                      
                      try {
                        if(editingVehicle.id.startsWith('v-')) {
                          onAddVehicle(editingVehicle);
                        } else {
                          onEditVehicle(editingVehicle);
                        }
                        setShowForm(false);
                      } catch (error) {
                        console.error('Error al guardar vehículo:', error);
                        alert('Error al guardar el vehículo. Inténtalo de nuevo.');
                      }
                    }} 
                    className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 shadow-lg"
                  >
                    Guardar
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetManager;
