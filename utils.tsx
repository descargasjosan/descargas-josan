import { Job, Worker, WorkerStatus, Holiday, ContractType, Client } from './types';
import { HOLIDAYS } from './constants';

/**
 * Formatea una fecha de YYYY-MM-DD a DD-MM-YYYY para visualización
 */
export const formatDateDMY = (dateStr?: string): string => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}-${month}-${year}`;
};

/**
 * Checks if a date is a public holiday (static, custom or recurring)
 */
export const isHoliday = (dateStr: string, customHolidays: Holiday[] = []): Holiday | undefined => {
  // 1. Check custom holidays first
  const custom = customHolidays.find(h => h.date === dateStr);
  if (custom) return custom;

  // 2. Check static holidays (usually current year)
  const staticHoliday = HOLIDAYS.find(h => h.date === dateStr);
  if (staticHoliday) return staticHoliday;

  // 3. Check recurring holidays (Fixed date every year)
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
    // Valencia locals (typically fixed)
    '01-22': 'San Vicente Mártir',
    '03-19': 'San José (Fallas)',
    '10-09': 'Día de la Comunitat Valenciana'
  };

  if (recurring[md]) {
    return { date: dateStr, name: recurring[md], isLocal: md.includes('01-22') || md.includes('03-19') || md.includes('10-09') };
  }

  return undefined;
};

// Fix: Added missing isTimeOverlap utility to check for shift conflicts
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

// Función estándar para fechas disponibles (salta festivos y findes)
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

// NUEVA FUNCIÓN: Obtiene el día anterior saltando SOLO fines de semana (Lunes -> Viernes).
// Ignora si el viernes fue festivo o no, simplemente busca el día cronológico L-V anterior.
export const getPreviousWeekday = (dateStr: string): string => {
  const date = new Date(dateStr);
  let daysToSubtract = 1;
  while (daysToSubtract < 7) {
    const prevDate = new Date(date);
    prevDate.setDate(date.getDate() - daysToSubtract);
    const day = prevDate.getDay();
    // 0 es Domingo, 6 es Sábado. Si no es ninguno, devolvemos la fecha.
    if (day !== 0 && day !== 6) {
      return prevDate.toISOString().split('T')[0];
    }
    daysToSubtract++;
  }
  return dateStr; // Fallback
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
  
  // MODIFICADO: Ignorar tareas anuladas en la verificación de continuidad
  const workedPrevDay = allJobs.some(j => j.date === prevWorkingDay && !j.isCancelled && j.assignedWorkerIds.includes(worker.id));
  
  return workedPrevDay ? gaps : null;
};

export const validateAssignment = (
  worker: Worker,
  job: Job,
  allJobs: Job[],
  customHolidays: Holiday[] = [],
  clients: Client[] = [] // Nuevo parámetro opcional para validar cursos
): { error: string | null; warning: string | null } => {
  if (worker.status !== WorkerStatus.ACTIVO) return { error: `Estado: ${worker.status}`, warning: null };
  if (worker.restrictedClientIds?.includes(job.clientId)) return { error: `Restricción cliente`, warning: null };
  if (job.assignedWorkerIds.includes(worker.id)) return { error: 'Ya asignado', warning: null };
  
  // 1. Validación de Cursos (Formación)
  const client = clients.find(c => c.id === job.clientId);
  if (client && client.requiredCourses && client.requiredCourses.length > 0) {
    const workerCourses = worker.completedCourses || [];
    const missingCourses = client.requiredCourses.filter(req => !workerCourses.includes(req));
    
    if (missingCourses.length > 0) {
      return { 
        error: null, 
        warning: `⚠️ FALTA FORMACIÓN EXIGIDA: ${missingCourses.join(', ')}` 
      };
    }
  }

  const continuityGaps = checkContinuityRisk(worker, job.date, allJobs, customHolidays);
  if (continuityGaps) return { error: null, warning: `Aviso SS: trabajó el ${getPreviousWorkingDay(job.date, customHolidays)} y hay días no laborables de por medio.` };
  
  return { error: null, warning: null };
};