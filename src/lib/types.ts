
export enum WorkerStatus {
  VACACIONES = 'Vacaciones',
  BAJA_MEDICA = 'Baja Médica',
  BAJA_PATERNIDAD = 'Baja Paternidad',
  DISPONIBLE = 'Disponible'
}

export enum ContractType {
  FIJO = 'Fijo',
  FIJO_DISCONTINUO = 'Fijo Discontinuo',
  INDEFINIDO = 'Indefinido',
  AUTONOMO = 'Autónomo',
  AUTONOMA_COLABORADORA = 'Autónoma Colaboradora'
}

export enum JobType {
  CARGA = 'Carga',
  DESCARGA = 'Descarga',
  PICKING = 'Picking',
  MANIPULACION = 'Manipulación',
  OPERATIVA_EXTERNA = 'Operativa Externa'
}

export type NoteType = 'info' | 'time' | 'medical';

export interface DailyNote {
  id: string;
  workerId: string;
  date: string; // YYYY-MM-DD
  text: string;
  type: NoteType;
}

export interface FuelRecord {
  id: string;
  workerId: string;
  date: string;
  liters?: number;
  cost: number;
  odometer?: number;
  notes?: string;
}

export interface Holiday {
  date: string;
  name: string;
  isLocal: boolean;
}

export interface Course {
  id: string;
  name: string;
  description?: string;
  validityMonths?: number; // Meses de validez, por defecto 12
  assignedWorkerIds: string[]; // Operarios que han realizado el curso
  createdAt: string;
  updatedAt: string;
}

export interface RegularTask {
  id: string;
  name: string;
  defaultWorkers: number;
  category: JobType;
}

export interface StandardTask {
  id: string;
  name: string;
  type: JobType;
  defaultWorkers: number;
  notes: string;
  assignedClientIds: string[];
}

export interface WorkerStatusRecord {
  id: string;
  workerId: string;
  status: WorkerStatus;
  startDate: string;
  endDate: string;
  totalDays: number;
}

export interface Worker {
  id: string;
  code: string;
  name: string;
  firstName?: string;   // Nuevo: nombre separado
  lastName?: string;    // Nuevo: apellido separado
  apodo?: string; // Apodo o nombre alternativo para mostrar en badges
  dni: string;
  phone: string;
  role: string;
  status: WorkerStatus;
  statusStartDate?: string;
  statusEndDate?: string;
  contractType: ContractType;
  hasVehicle: boolean;
  startTime?: string;
  endTime?: string;
  restrictions: string[];
  restrictedClientIds: string[];
  skills: JobType[];
  completedCourses: string[]; 
  isArchived?: boolean; 
  notes?: string;
  statusRecords?: WorkerStatusRecord[]; // Nuevos registros de estados
}

export interface WorkCenter {
  id: string;
  name: string;
  address: string;
  publicTransport: boolean;
  transportType?: string; 
  observations?: string;
}

export interface Client {
  id: string;
  name: string;
  cif: string;
  logo: string;
  phone: string;
  contactPerson: string;
  email: string;
  location: string;
  priority: number;
  centers: WorkCenter[];
  regularTasks: RegularTask[];
  requiredCourses: string[]; 
  allowFreeTextTask: boolean;
}

export interface ReinforcementGroup {
  id: string;
  startTime: string;
  workerIds: string[];
  createdAt: string;
}

export interface Job {
  id: string;
  date: string;
  clientId: string;
  centerId: string;
  type: JobType;
  customName?: string;
  startTime: string; 
  endTime: string;
  requiredWorkers: number;
  assignedWorkerIds: string[];
  workerTimes?: Record<string, string>;
  reinforcementGroups?: ReinforcementGroup[]; // Grupos de refuerzo con múltiples horarios
  ref?: string;
  deliveryNote?: string;
  locationDetails?: string;
  isCancelled?: boolean; 
  cancellationReason?: string; 
  isFinished?: boolean; 
  actualEndTime?: string; 
}

// --- NUEVOS TIPOS PARA GESTIÓN DE FLOTA ---

export interface Vehicle {
  id: string;
  plate: string;        // Matrícula
  brand: string;        // Marca
  model: string;        // Modelo
  alias?: string;       // Nombre interno (ej: "Furgoneta 1")
  purchaseDate?: string;
  nextItvDate?: string;
  nextRevisionDate?: string;
  nextTireChangeDate?: string;
  insuranceExpiryDate?: string;
  status: 'active' | 'repair' | 'inactive';
  notes?: string;
}

export interface VehicleAssignment {
  id: string;
  vehicleId: string;
  workerId: string;
  date: string;
  startTime?: string; // Opcional, por defecto turno completo
}

export interface PlanningState {
  currentDate: string;
  workers: Worker[];
  clients: Client[];
  jobs: Job[];
  customHolidays: Holiday[];
  notifications: Record<string, string[]>; 
  courses: Course[]; // Nuevo sistema de cursos
  standardTasks: StandardTask[]; 
  dailyNotes: DailyNote[]; 
  fuelRecords: FuelRecord[];
  vehicles: Vehicle[]; // Nuevo campo
  vehicleAssignments: VehicleAssignment[]; // Nuevo campo
}

export type ViewType = 'planning' | 'clients' | 'workers' | 'stats' | 'databases' | 'compact' | 'fleet';

// --- TIPOS PARA IMPORTACIÓN DE OPERARIOS ---

export interface WorkerImportData {
  code: string;        // Código del operario (para mapeo)
  firstName: string;   // Nombre
  lastName: string;    // Apellidos
}

export interface ImportResult {
  success: boolean;
  message: string;
  updatedCount: number;
  notFoundCodes: string[];
  errors: string[];
}
