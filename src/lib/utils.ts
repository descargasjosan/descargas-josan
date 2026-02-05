import { Job, Worker, WorkerStatus, WorkerStatusRecord, Holiday, ContractType, Client, WorkerImportData, ImportResult } from './types';
import { HOLIDAYS } from './constants';
import * as XLSX from 'xlsx';

export const formatDateDMY = (dateStr?: string): string => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}-${month}-${year}`;
};

export const isHoliday = (dateStr: string, customHolidays: Holiday[] = []): Holiday | undefined => {
  const custom = customHolidays.find(h => h.date === dateStr);
  if (custom) return custom;

  const staticHoliday = HOLIDAYS.find(h => h.date === dateStr);
  if (staticHoliday) return staticHoliday;

  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const recurring: Record<string, string> = {
    '01-01': 'Año Nuevo',
    '01-06': 'Reyes Magos',
    '05-01': 'Día del Trabajo',
    '08-15': 'Asunción de la Virgen',
    '10-12': 'Fiesta Nacional',
    '11-01': 'Todos los Santos',
    '12-06': 'Constitución Española',
    '12-08': 'Inmaculada Concepción',
    '12-25': 'Navidad',
    '01-22': 'San Vicente Mártir',
    '03-19': 'San José (Fallas)',
    '10-09': 'Día de la Comunitat Valenciana'
  };

  if (recurring[md]) {
    return { date: dateStr, name: recurring[md], isLocal: md.includes('01-22') || md.includes('03-19') || md.includes('10-09') };
  }

  return undefined;
};

export const isTimeOverlap = (s1: string, e1: string, s2: string, e2: string): boolean => {
  return s1 < e2 && s2 < e1;
};

export const isWeekend = (dateStr: string): boolean => {
  const day = new Date(dateStr).getDay();
  return day === 0 || day === 6; 
};

export const isWorkingDay = (dateStr: string, customHolidays: Holiday[] = []): boolean => {
  return !isWeekend(dateStr) && !isHoliday(dateStr, customHolidays);
};

export const getPreviousWorkingDay = (dateStr: string, customHolidays: Holiday[] = []): string => {
  let date = new Date(dateStr);
  let daysToSubtract = 1;
  while (true) {
    const checkDate = new Date(date);
    checkDate.setDate(date.getDate() - daysToSubtract);
    const checkStr = checkDate.toISOString().split('T')[0];
    if (isWorkingDay(checkStr, customHolidays)) return checkStr;
    daysToSubtract++;
    if (daysToSubtract > 30) break;
  }
  return dateStr;
};

export const getPreviousWeekday = (dateStr: string): string => {
  const date = new Date(dateStr);
  let daysToSubtract = 1;
  while (daysToSubtract < 7) {
    const prevDate = new Date(date);
    prevDate.setDate(date.getDate() - daysToSubtract);
    const day = prevDate.getDay();
    if (day !== 0 && day !== 6) {
      return prevDate.toISOString().split('T')[0];
    }
    daysToSubtract++;
  }
  return dateStr;
};

export const getNonWorkingDaysBetween = (startStr: string, endStr: string, customHolidays: Holiday[] = []): string[] => {
  const gaps: string[] = [];
  let current = new Date(startStr);
  const end = new Date(endStr);
  current.setDate(current.getDate() + 1);
  while (current < end) {
    const dateStr = current.toISOString().split('T')[0];
    if (!isWorkingDay(dateStr, customHolidays)) {
      const holiday = isHoliday(dateStr, customHolidays);
      gaps.push(holiday ? holiday.name : (new Date(dateStr).getDay() === 0 ? 'Domingo' : 'Sábado'));
    }
    current.setDate(current.getDate() + 1);
  }
  return gaps;
};

export const checkContinuityRisk = (worker: Worker, currentDate: string, allJobs: Job[], customHolidays: Holiday[] = []): string[] | null => {
  if (worker.contractType !== ContractType.FIJO_DISCONTINUO) return null;
  const prevWorkingDay = getPreviousWorkingDay(currentDate, customHolidays);
  const gaps = getNonWorkingDaysBetween(prevWorkingDay, currentDate, customHolidays);
  if (gaps.length === 0) return null;
  
  const workedPrevDay = allJobs.some(j => j.date === prevWorkingDay && !j.isCancelled && j.assignedWorkerIds.includes(worker.id));
  
  return workedPrevDay ? gaps : null;
};

export const validateAssignment = (
  worker: Worker,
  job: Job,
  allJobs: Job[],
  customHolidays: Holiday[] = [],
  clients: Client[] = [] 
): { error: string | null; warning: string | null } => {
  // 🔍 DEBUG: Log de validación
  console.log('🔍 DEBUG - Validando asignación:', {
    workerName: worker.name,
    workerId: worker.id,
    workerStatus: worker.status,
    jobId: job.id,
    clientId: job.clientId,
    assignedWorkerIds: job.assignedWorkerIds,
    restrictedClientIds: worker.restrictedClientIds
  });

  // Verificar si el operario está disponible o si su estado no disponible ha finalizado
  // 🔄 COMPATIBILIDAD: Aceptar "Activo" como equivalente a "Disponible"
  if (worker.status !== WorkerStatus.DISPONIBLE && worker.status !== 'Activo') {
    console.log('❌ DEBUG - Estado no disponible:', worker.status);
    // Si tiene fecha de fin de estado, verificar si la tarea es posterior
    if (worker.statusEndDate) {
      if (job.date <= worker.statusEndDate) {
        return { error: `Estado: ${worker.status} hasta ${formatDateDMY(worker.statusEndDate)}`, warning: null };
      }
      // Si la tarea es posterior al fin del estado, permitir la asignación
    } else {
      // Si no tiene fecha de fin, no permitir asignación
      return { error: `Estado: ${worker.status}`, warning: null };
    }
  }
  
  if (worker.restrictedClientIds?.includes(job.clientId)) {
    console.log('❌ DEBUG - Cliente restringido:', job.clientId);
    return { error: `Restricción cliente`, warning: null };
  }
  
  if (job.assignedWorkerIds.includes(worker.id)) {
    console.log('❌ DEBUG - Ya asignado:', worker.id);
    return { error: 'Ya asignado', warning: null };
  }
  
  const client = clients.find(c => c.id === job.clientId);
  if (client && client.requiredCourses && client.requiredCourses.length > 0) {
    const workerCourses = worker.completedCourses || [];
    const missingCourses = client.requiredCourses.filter(req => !workerCourses.includes(req));
    
    if (missingCourses.length > 0) {
      console.log('❌ DEBUG - Faltan cursos:', missingCourses);
      return { 
        error: null, 
        warning: `⚠️ FALTA FORMACIÓN EXIGIDA: ${missingCourses.join(', ')}` 
      };
    }
  }

  const continuityGaps = checkContinuityRisk(worker, job.date, allJobs, customHolidays);
  if (continuityGaps) {
    console.log('⚠️ DEBUG - Riesgo de continuidad:', continuityGaps);
    return { error: null, warning: `Aviso SS: trabajó el ${getPreviousWorkingDay(job.date, customHolidays)} y hay días no laborables de por medio.` };
  }
  
  console.log('✅ DEBUG - Validación exitosa');
  return { error: null, warning: null };
};

// Función helper para obtener el nombre a mostrar de un operario
// Si tiene apodo, muestra el apodo, sino muestra el nombre real
export const getWorkerDisplayName = (worker: Worker): string => {
  return worker.apodo && worker.apodo.trim() ? worker.apodo.trim() : worker.name;
};

// Función específica para reporte SS: "APELLIDOS, NOMBRE - DNI"
// Siempre usa firstName/lastName si existen, sino parsea del name original
export const getWorkerSSFormat = (worker: Worker): string => {
  let lastName = '';
  let firstName = '';
  
  // Si tenemos datos separados, los usamos
  if (worker.firstName && worker.lastName) {
    lastName = worker.lastName.trim();
    firstName = worker.firstName.trim();
  } else {
    // Si no, parseamos del name original
    const parts = worker.name.trim().split(/\s+/);
    if (parts.length > 1) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    } else {
      firstName = parts[0];
      lastName = '';
    }
  }
  
  // Formato SS: "APELLIDOS, NOMBRE - DNI"
  const formattedName = lastName ? `${lastName.toUpperCase()}, ${firstName}` : firstName;
  return `${formattedName} - ${worker.dni}`;
};

// Función para calcular días entre dos fechas
export const calculateDaysBetween = (startDate: string, endDate: string): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 para incluir ambos días
};

// Función para obtener el estado actual de un operario basado en sus registros
export const getCurrentWorkerStatus = (worker: Worker): { status: WorkerStatus, startDate?: string, endDate?: string } => {
  if (!worker.statusRecords || worker.statusRecords.length === 0) {
    return { status: WorkerStatus.DISPONIBLE };
  }

  const today = new Date().toISOString().split('T')[0];
  const activeRecord = worker.statusRecords.find(record => {
    const startDate = new Date(record.startDate);
    const endDate = record.endDate ? new Date(record.endDate) : new Date('9999-12-31'); // INDEFINIDO
    const currentDate = new Date(today);
    return currentDate >= startDate && currentDate <= endDate;
  });

  if (activeRecord) {
    return {
      status: activeRecord.status,
      startDate: activeRecord.startDate,
      endDate: activeRecord.endDate || undefined // Convertir null a undefined
    };
  }

  return { status: WorkerStatus.DISPONIBLE };
};

// Función para calcular el próximo cambio de estado de un operario
export const getNextStatusChange = (worker: Worker): { date: string, status: WorkerStatus } | null => {
  if (!worker.statusRecords || worker.statusRecords.length === 0) {
    return null;
  }

  const today = new Date().toISOString().split('T')[0];
  const currentStatus = getCurrentWorkerStatus(worker);
  
  // Si está en estado no disponible, buscar cuándo vuelve a Disponible
  if (currentStatus.status !== WorkerStatus.DISPONIBLE) {
    // Buscar el registro actual
    const currentRecord = worker.statusRecords.find(record => {
      const startDate = new Date(record.startDate);
      const endDate = record.endDate ? new Date(record.endDate) : new Date('9999-12-31'); // INDEFINIDO
      const currentDate = new Date(today);
      return currentDate >= startDate && currentDate <= endDate;
    });

    if (currentRecord) {
      // Si el registro es indefinido, no hay cambio de estado
      if (!currentRecord.endDate) {
        return null;
      }
      
      // El cambio es el día después de que termine el registro actual
      const endDate = new Date(currentRecord.endDate);
      endDate.setDate(endDate.getDate() + 1);
      
      return {
        date: endDate.toISOString().split('T')[0],
        status: WorkerStatus.DISPONIBLE
      };
    }
  }

  // Si está disponible, buscar el próximo registro futuro
  if (currentStatus.status === WorkerStatus.DISPONIBLE) {
    const futureRecords = worker.statusRecords
      .filter(record => new Date(record.startDate) > new Date(today))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    if (futureRecords.length > 0) {
      const nextRecord = futureRecords[0];
      return {
        date: nextRecord.startDate,
        status: nextRecord.status
      };
    }
  }

  return null;
};

// Función para generar IDs únicos compatible con todos los navegadores
const generateId = (): string => {
  // Intentar usar crypto.randomUUID si está disponible
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Alternativa: timestamp + random
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Función para añadir o actualizar un registro de estado
export const addOrUpdateStatusRecord = (
  worker: Worker, 
  status: WorkerStatus, 
  startDate: string, 
  endDate: string
): Worker => {
  if (status === WorkerStatus.DISPONIBLE || !startDate) {
    return worker;
  }

  const newRecord: WorkerStatusRecord = {
    id: generateId(),
    workerId: worker.id,
    status,
    startDate,
    endDate: endDate === 'IND.' ? null : endDate,
    totalDays: calculateDaysBetween(startDate, endDate === 'IND.' ? '9999-12-31' : endDate)
  };

  const existingRecords = worker.statusRecords || [];
  
  // Buscar si existe un registro que solape con el nuevo período
  const overlappingRecord = existingRecords.find(record => {
    const existingStart = new Date(record.startDate);
    const existingEnd = record.endDate ? new Date(record.endDate) : new Date('9999-12-31'); // INDEFINIDO
    const newStart = new Date(startDate);
    const newEnd = endDate === 'IND.' ? new Date('9999-12-31') : new Date(endDate);
    
    return newStart <= existingEnd && newEnd >= existingStart;
  });

  let updatedRecords: WorkerStatusRecord[];
  
  if (overlappingRecord) {
    // Reemplazar el registro solapado
    updatedRecords = existingRecords.map(record => 
      record.id === overlappingRecord.id ? newRecord : record
    );
  } else {
    // Añadir nuevo registro
    updatedRecords = [...existingRecords, newRecord];
  }

  // Ordenar registros por fecha de inicio
  updatedRecords.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return {
    ...worker,
    statusRecords: updatedRecords
  };
};

// Función para eliminar un registro de estado
export const removeStatusRecord = (worker: Worker, recordId: string): Worker => {
  const updatedRecords = (worker.statusRecords || []).filter(record => record.id !== recordId);
  return {
    ...worker,
    statusRecords: updatedRecords.length > 0 ? updatedRecords : undefined
  };
};

// --- FUNCIONES DE IMPORTACIÓN DE OPERARIOS ---

/**
 * Parsea un archivo Excel/CSV y extrae los datos de operarios
 */
export const parseWorkerImportFile = async (file: File): Promise<WorkerImportData[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          reject(new Error('El archivo no contiene hojas de cálculo'));
          return;
        }
        
        // Tomar la primera hoja del workbook
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convertir a JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (!jsonData || jsonData.length === 0) {
          reject(new Error('La hoja de cálculo está vacía'));
          return;
        }
        
        if (jsonData.length < 2) {
          reject(new Error('El archivo debe tener al menos una fila de datos (además de los encabezados)'));
          return;
        }
        
        // Mapear filas a WorkerImportData
        const workers: WorkerImportData[] = [];
        const headers = jsonData[0] as string[];
        
        // Validar que haya encabezados
        if (!headers || headers.length === 0) {
          reject(new Error('No se encontraron encabezados en la primera fila'));
          return;
        }
        
        // Logging para diagnóstico
        console.log('Encabezados detectados:', headers.map(h => `"${h}"`));
        
        // Buscar columnas por nombre (exacto primero, luego includes)
        const findColumnIndex = (headerName: string) => {
          // Búsqueda exacta primero
          let index = headers.findIndex(h => 
            h && h.toString().trim().toLowerCase() === headerName.toLowerCase()
          );
          
          // Si no encuentra, búsqueda parcial
          if (index === -1) {
            index = headers.findIndex(h => 
              h && h.toString().trim().toLowerCase().includes(headerName.toLowerCase())
            );
          }
          
          console.log(`Buscando "${headerName}": índice ${index}`);
          return index;
        };
        
        const codeIndex = findColumnIndex('código');
        const firstNameIndex = findColumnIndex('nombre');
        const lastNameIndex = findColumnIndex('apellidos');
        
        console.log('Índices finales:', { codeIndex, firstNameIndex, lastNameIndex });
        
        // Validar que se encontraron las columnas necesarias
        if (codeIndex === -1) {
          reject(new Error('No se encontró la columna "Código". Verifica los encabezados.'));
          return;
        }
        if (firstNameIndex === -1) {
          reject(new Error('No se encontró la columna "Nombre". Verifica los encabezados.'));
          return;
        }
        if (lastNameIndex === -1) {
          reject(new Error('No se encontró la columna "Apellidos". Verifica los encabezados.'));
          return;
        }
        
        // Procesar filas (saltar la primera fila que son los headers)
        let validRows = 0;
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          
          if (!row || row.length === 0) continue;
          
          const code = row[codeIndex]?.toString().trim();
          const firstName = row[firstNameIndex]?.toString().trim();
          const lastName = row[lastNameIndex]?.toString().trim();
          
          if (code && firstName && lastName) {
            workers.push({
              code,
              firstName,
              lastName
            });
            validRows++;
          }
        }
        
        if (workers.length === 0) {
          reject(new Error(`No se encontraron filas válidas con datos completos. Se procesaron ${jsonData.length - 1} filas pero ninguna tenía todos los campos requeridos.`));
          return;
        }
        
        console.log(`Parseo exitoso: ${workers.length} operarios válidos de ${jsonData.length - 1} filas procesadas`);
        resolve(workers);
        
      } catch (error) {
        console.error('Error en parseo:', error);
        if (error instanceof Error) {
          reject(new Error(`Error al parsear el archivo: ${error.message}`));
        } else {
          reject(new Error('Error desconocido al parsear el archivo'));
        }
      }
    };
    
    reader.onerror = (error) => {
      console.error('Error al leer archivo:', error);
      reject(new Error('Error al leer el archivo. Verifica que el archivo no esté dañado y que tengas permisos para leerlo.'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Importa datos de operarios mapeando por código
 */
export const importWorkersData = (
  importData: WorkerImportData[], 
  currentWorkers: Worker[]
): ImportResult => {
  const errors: string[] = [];
  const notFoundCodes: string[] = [];
  let updatedCount = 0;
  
  try {
    // Crear mapa de operarios por código para búsqueda rápida
    const workersByCode = new Map<string, Worker>();
    currentWorkers.forEach(worker => {
      workersByCode.set(worker.code.toLowerCase(), worker);
    });
    
    // Procesar cada operario importado
    importData.forEach(importedWorker => {
      const searchCode = importedWorker.code.toLowerCase();
      const existingWorker = workersByCode.get(searchCode);
      
      if (existingWorker) {
        // Actualizar datos del operario existente
        existingWorker.firstName = importedWorker.firstName;
        existingWorker.lastName = importedWorker.lastName;
        
        // Reconstruir el campo name para compatibilidad
        existingWorker.name = `${importedWorker.firstName} ${importedWorker.lastName}`;
        
        updatedCount++;
      } else {
        // Operario no encontrado por código
        notFoundCodes.push(importedWorker.code);
      }
    });
    
    // Construir mensaje de resultado
    let message = '';
    if (updatedCount > 0) {
      message += `Se actualizaron ${updatedCount} operarios correctamente. `;
    }
    
    if (notFoundCodes.length > 0) {
      message += `No se encontraron ${notFoundCodes.length} códigos: ${notFoundCodes.slice(0, 5).join(', ')}`;
      if (notFoundCodes.length > 5) {
        message += ` y ${notFoundCodes.length - 5} más...`;
      }
    }
    
    return {
      success: updatedCount > 0,
      message: message || 'No se realizaron cambios',
      updatedCount,
      notFoundCodes,
      errors
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Error durante la importación: ${error}`,
      updatedCount: 0,
      notFoundCodes,
      errors: [...errors, `Error general: ${error}`]
    };
  }
};
