import React from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Holiday, Job } from '../lib/types';
import { isHoliday, formatDateDisplay } from '../lib/utils';

interface CalendarSelectorProps {
  currentDate: string;
  customHolidays: Holiday[];
  onSelect: (date: string) => void;
  onClose: () => void;
  onGoToToday: () => void;
  jobs: Job[];
}

const CalendarSelector: React.FC<CalendarSelectorProps> = ({
  currentDate,
  customHolidays,
  onSelect,
  onClose,
  onGoToToday,
  jobs
}) => {
  const [selectedMonth, setSelectedMonth] = React.useState(() => {
    const date = new Date(currentDate);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const getDaysInMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date): number => {
    // getDay() devuelve 0=Domingo, 1=Lunes, etc.
    // Queremos que Lunes=0, Martes=1, ..., Domingo=6
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1; // Convertir Domingo(0) a 6, y restar 1 a los demás
  };

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(selectedMonth);
    const firstDay = getFirstDayOfMonth(selectedMonth);
    const days: any[] = [];

    // Añadir espacios vacíos al principio
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Añadir días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day);
      const dateStr = date.toISOString().split('T')[0];
      const holiday = isHoliday(dateStr, customHolidays);
      const hasJobs = jobs.filter((job: Job) => job.date === dateStr && !job.isCancelled).length > 0;
      
      days.push({
        date,
        dateStr,
        day,
        isHoliday: !!holiday,
        holidayName: holiday?.name,
        hasJobs,
        isToday: dateStr === currentDate
      });
    }

    return days;
  };

  const handlePrevMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));
  };

  const handleDateClick = (dateStr: string) => {
    onSelect(dateStr);
    onClose();
  };

  const calendarDays = generateCalendarDays();
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={handlePrevMonth}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold">
              {selectedMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </h2>
            <button 
              onClick={handleNextMonth}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onGoToToday}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
            >
              Hoy
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="p-4">
          {/* Week day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day: string) => (
              <div key={day} className="text-center text-xs font-bold text-slate-600 uppercase">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day: any, index: number) => {
              if (!day) {
                return <div key={`empty-${index}`} className="h-8" />;
              }

              const bgColor = day.isToday 
                ? 'bg-blue-500 text-white' 
                : day.isHoliday 
                  ? 'bg-red-100 text-red-700' 
                  : day.hasJobs 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-slate-50 text-slate-600';

              return (
                <button
                  key={day.dateStr}
                  onClick={() => handleDateClick(day.dateStr)}
                  className={`h-8 rounded text-xs font-medium transition-colors hover:opacity-80 ${bgColor}`}
                  title={day.isHoliday ? day.holidayName : `${day.dateStr} - ${day.hasJobs ? 'Con tareas' : 'Sin tareas'}`}
                >
                  {day.day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span>Hoy</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
              <span>Festivo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
              <span>Con tareas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-slate-50 border border-slate-200 rounded"></div>
              <span>Sin tareas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarSelector;
