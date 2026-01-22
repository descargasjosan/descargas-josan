
import { Job, Worker, WorkerStatus, Holiday, ContractType, Client } from './types';
import { HOLIDAYS } from './constants';

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
  // Verificar si el operario está disponible o si su estado no disponible ha finalizado
  if (worker.status !== WorkerStatus.DISPONIBLE) {
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
  
  if (worker.restrictedClientIds?.includes(job.clientId)) return { error: `Restricción cliente`, warning: null };
  if (job.assignedWorkerIds.includes(worker.id)) return { error: 'Ya asignado', warning: null };
  
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
