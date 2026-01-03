
export enum WorkerStatus {
  ACTIVO = 'Activo',
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

// NUEVO: Registro de repostaje
export interface FuelRecord {
  id: string;
  workerId: string;
  date: string;
  liters: number;
  cost: number;
  odometer?: number; // Kilometraje del vehículo al repostar
  notes?: string;
}

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  isLocal: boolean;
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
  defaultWorkers: number;
  packages: string; 
  refs: string;     
}

export interface Worker {
  id: string;
  code: string;
  name: string;
  dni: string;
  phone: string;
  role: string;
  status: WorkerStatus;
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
  ref?: string;
  deliveryNote?: string;
  locationDetails?: string;
  isCancelled?: boolean; 
  cancellationReason?: string; 
  isFinished?: boolean; 
  actualEndTime?: string; 
}

export interface PlanningState {
  currentDate: string;
  workers: Worker[];
  clients: Client[];
  jobs: Job[];
  customHolidays: Holiday[];
  notifications: Record<string, string[]>; 
  availableCourses: string[]; 
  standardTasks: StandardTask[]; 
  dailyNotes: DailyNote[]; 
  fuelRecords: FuelRecord[]; // NUEVO: Array para guardar los repostajes
}

export type ViewType = 'planning' | 'clients' | 'workers' | 'stats' | 'databases';