
import { WorkerStatus, JobType, Worker, Client, Job, ContractType, Holiday, StandardTask, Vehicle } from './types';

const today = new Date().toISOString().split('T')[0];

export const WORKER_ROLES = [
  'Mozo',
  'Carretillero',
  'Jefe de Equipo',
  'Administrativo',
  'Conductor',
  'Limpieza'
];

export const AVAILABLE_COURSES = [
  "PRL Básico (60h)",
  "Carnet Carretillero",
  "Trabajos en Altura",
  "Manipulador Alimentos",
  "Seguridad Eléctrica",
  "Primeros Auxilios",
  "Gestión de Residuos"
];

export const HOLIDAYS: Holiday[] = [
  { date: '2025-01-01', name: 'Año Nuevo', isLocal: false },
  { date: '2025-01-06', name: 'Reyes Magos', isLocal: false },
  { date: '2025-04-18', name: 'Viernes Santo', isLocal: false },
  { date: '2025-05-01', name: 'Día del Trabajo', isLocal: false },
  { date: '2025-08-15', name: 'Asunción de la Virgen', isLocal: false },
  { date: '2025-10-12', name: 'Fiesta Nacional', isLocal: false },
  { date: '2025-11-01', name: 'Todos los Santos', isLocal: false },
  { date: '2025-12-06', name: 'Constitución Española', isLocal: false },
  { date: '2025-12-08', name: 'Inmaculada Concepción', isLocal: false },
  { date: '2025-12-25', name: 'Navidad', isLocal: false },
  
  { date: '2025-01-22', name: 'San Vicente Mártir', isLocal: true },
  { date: '2025-03-19', name: 'San José (Fallas)', isLocal: true },
  { date: '2025-04-21', name: 'Lunes de Pascua (S.V. Ferrer)', isLocal: true },
  { date: '2025-10-09', name: 'Día de la Comunitat Valenciana', isLocal: true },
];

export const MOCK_STANDARD_TASKS: StandardTask[] = [
  {
    id: 'st1',
    name: 'Descarga Contenedor 20ft',
    defaultWorkers: 2,
    packages: '300-500',
    refs: 'General'
  },
  {
    id: 'st2',
    name: 'Descarga Contenedor 40ft (Paletizado)',
    defaultWorkers: 3,
    packages: '20-24 Palets',
    refs: 'SKU-A, SKU-B'
  },
  {
    id: 'st3',
    name: 'Descarga a Granel (Manual)',
    defaultWorkers: 4,
    packages: '1200 cajas',
    refs: 'Varios'
  }
];

export const MOCK_WORKERS: Worker[] = [
  { 
    id: 'w1', 
    code: '1001',
    name: 'Juan Domínguez', 
    dni: '12345678A',
    phone: '600111222',
    role: 'Carretillero', 
    status: WorkerStatus.DISPONIBLE, 
    contractType: ContractType.FIJO,
    hasVehicle: true, 
    startTime: '08:00', 
    endTime: '16:00', 
    restrictions: [], 
    restrictedClientIds: [],
    skills: [JobType.CARGA, JobType.DESCARGA],
    completedCourses: ["PRL Básico (60h)", "Carnet Carretillero"]
  },
  { 
    id: 'w2', 
    code: '1025',
    name: 'María Rodríguez', 
    dni: '87654321B',
    phone: '600333444',
    role: 'Mozo', 
    status: WorkerStatus.DISPONIBLE, 
    contractType: ContractType.FIJO_DISCONTINUO,
    hasVehicle: false, 
    startTime: '09:00', 
    endTime: '17:00', 
    restrictions: [], 
    restrictedClientIds: ['c2'],
    skills: [JobType.PICKING, JobType.MANIPULACION],
    completedCourses: ["PRL Básico (60h)", "Manipulador Alimentos"]
  },
  { 
    id: 'w3', 
    code: '1142',
    name: 'Carlos Ruiz', 
    dni: '45678912C',
    phone: '600555666',
    role: 'Mozo', 
    status: WorkerStatus.DISPONIBLE, 
    contractType: ContractType.FIJO_DISCONTINUO,
    hasVehicle: true, 
    startTime: '08:00', 
    endTime: '16:00', 
    restrictions: ['Empresa X'], 
    restrictedClientIds: [],
    skills: [JobType.MANIPULACION],
    completedCourses: []
  }
];

export const MOCK_CLIENTS: Client[] = [
  {
    id: 'c1',
    name: 'Cliente Amazon',
    cif: 'B12345678',
    logo: 'AMZ',
    phone: '912344556',
    contactPerson: 'Sonia Martínez',
    email: 'ops@amazon.es',
    location: 'San Fernando de Henares, Madrid',
    priority: 1,
    centers: [
      { id: 'center1', name: 'MAD4 - San Fernando', address: 'Calle Principal 123', publicTransport: true }
    ],
    regularTasks: [
      { id: 'rt1', name: 'Descarga Contenedor 40ft', defaultWorkers: 4, category: JobType.DESCARGA },
      { id: 'rt2', name: 'Picking Urgente Sorter', defaultWorkers: 2, category: JobType.PICKING }
    ],
    requiredCourses: ["PRL Básico (60h)"],
    allowFreeTextTask: true
  },
  {
    id: 'c2',
    name: 'Cliente Zara',
    cif: 'A87654321',
    logo: 'Z',
    phone: '934556677',
    contactPerson: 'Pablo Casado',
    email: 'logistica@zara.com',
    location: 'Arteixo, A Coruña',
    priority: 2,
    centers: [
      { id: 'center2', name: 'BCN1 - El Prat', address: 'Polígono Ind. Sur 45', publicTransport: false }
    ],
    regularTasks: [
      { id: 'rt3', name: 'Etiquetado Textil', defaultWorkers: 6, category: JobType.MANIPULACION }
    ],
    requiredCourses: [],
    allowFreeTextTask: true
  }
];

export const MOCK_JOBS: Job[] = [
  {
    id: 'j1',
    date: today,
    clientId: 'c1',
    centerId: 'center1',
    type: JobType.DESCARGA,
    startTime: '08:00',
    endTime: '12:00',
    requiredWorkers: 4,
    assignedWorkerIds: ['w1', 'w2'],
    ref: '#OP-8832',
    locationDetails: 'Muelle 12'
  }
];

export const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'v1',
    plate: '1234 KLR',
    brand: 'Renault',
    model: 'Kangoo',
    status: 'active',
    nextItvDate: '2025-06-15',
    notes: 'Furgoneta principal reparto'
  },
  {
    id: 'v2',
    plate: '9876 HBB',
    brand: 'Peugeot',
    model: 'Partner',
    status: 'active',
    nextItvDate: '2024-12-01',
    nextRevisionDate: '2025-02-01',
    notes: 'Golpe en puerta trasera'
  }
];
