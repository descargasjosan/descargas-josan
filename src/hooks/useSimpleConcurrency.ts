import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { PlanningState } from '../types';

interface UseSimpleConcurrencyProps {
  planning: PlanningState;
  setPlanning: (planning: PlanningState) => void;
  showNotification: (message: string, type: 'error' | 'success' | 'warning' | 'info') => void;
}

export const useSimpleConcurrency = ({ 
  planning, 
  setPlanning, 
  showNotification 
}: UseSimpleConcurrencyProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTime = useRef<string>('');

  // 🔄 Suscripción a cambios en tiempo real
  useEffect(() => {
    const channel = supabase
      .channel('planning_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'planning_snapshots'
        },
        (payload) => {
          console.log('🔄 Cambio detectado:', payload);
          
          const newData = payload.new as any;
          console.log('📥 Registro actualizado recibido:', newData.updated_at);
          console.log('⏰ Último guardado local:', lastSaveTime.current);
          
          // Solo actualizar si el nuevo registro es más reciente que nuestro último guardado
          if (!lastSaveTime.current || newData.updated_at > lastSaveTime.current) {
            console.log('📥 Actualizando datos desde servidor...');
            try {
              const parsedData = JSON.parse(newData.data);
              setPlanning(parsedData);
              showNotification('Datos actualizados desde otro usuario', 'info');
            } catch (error) {
              console.error('❌ Error procesando datos remotos:', error);
            }
          } else {
            console.log('⏭️ Ignorando cambio antiguo:', newData.updated_at);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setPlanning, showNotification]);

  // 💾 Función de guardado simple
  const saveData = useCallback(async (showSuccessNotification = false) => {
    if (isSaving) {
      console.log('⏭️ Ya se está guardando, omitiendo...');
      return;
    }
    
    setIsSaving(true);
    
    try {
      console.log('💾 Iniciando guardado...');
      console.log('📊 Datos a guardar:', {
        workersCount: planning.workers?.length || 0,
        jobsCount: planning.jobs?.length || 0,
        clientsCount: planning.clients?.length || 0
      });
      
      const timestamp = new Date().toISOString();
      const dataToSave = {
        id: 999999999999, // ID grande fijo para bigint
        data: JSON.stringify(planning),
        updated_at: timestamp
      };

      console.log('🔍 Enviando a Supabase: ID fijo grande = 999999999999');

      const { error, data } = await supabase
        .from('planning_snapshots')
        .upsert(dataToSave);

      if (error) {
        console.error('❌ Error guardando:', error);
        console.error('❌ Detalles del error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        showNotification(`Error guardando datos: ${error.message}`, 'error');
        return;
      }

      lastSaveTime.current = timestamp;
      console.log('✅ Guardado completado:', timestamp);
      console.log('📋 Respuesta de Supabase:', data);
      
      // Verificar que los datos realmente se guardaron
      const { data: verifyData, error: verifyError } = await supabase
        .from('planning_snapshots')
        .select('*')
        .eq('id', 999999999999)
        .single();
      
      if (verifyError) {
        console.error('❌ Error verificando guardado:', verifyError);
      } else {
        console.log('✅ Verificación exitosa - Datos en BD:', verifyData);
      }
      
      // Solo mostrar notificación de éxito si es guardado manual
      if (showSuccessNotification) {
        showNotification('Datos guardados correctamente', 'success');
      }
      
    } catch (error) {
      console.error('❌ Error en guardado:', error);
      showNotification(`Error crítico guardando datos: ${error}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [planning, isSaving, showNotification]);

  // 🔄 Guardado automático con debounce (sin notificación)
  const triggerAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveData(false); // No mostrar notificación en guardado automático
    }, 2000); // 2 segundos debounce
  }, [saveData]);

  // 🔄 Efecto para guardado automático
  useEffect(() => {
    triggerAutoSave();
  }, [planning, triggerAutoSave]);

  // 🧹 Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveData: () => saveData(true), // Guardado manual con notificación
    isSaving,
    triggerAutoSave
  };
};
