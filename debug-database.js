// SCRIPT PARA DEBUGGING DE BORRADO DE DATOS
// Ejecutar en la consola del navegador cuando los datos "desaparezcan"

// 1. Verificar estado actual
console.log('=== ESTADO ACTUAL ===');
console.log('Jobs en planning:', planning?.jobs?.length || 0);
console.log('Workers en planning:', planning?.workers?.length || 0);
console.log('Clients en planning:', planning?.clients?.length || 0);

// 2. Verificar datos en Supabase
const checkSupabaseData = async () => {
  try {
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .limit(10);
    
    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select('*')
      .limit(10);
    
    console.log('=== DATOS EN SUPABASE ===');
    console.log('Jobs en Supabase:', jobs?.length || 0, jobsError);
    console.log('Workers en Supabase:', workers?.length || 0, workersError);
    
    return { jobs, workers };
  } catch (error) {
    console.error('Error checking Supabase:', error);
  }
};

// 3. Monitorear operaciones de borrado
const originalDelete = supabase.from;
supabase.from = function(table) {
  const tableRef = originalDelete.call(this, table);
  const originalDeleteMethod = tableRef.delete;
  
  tableRef.delete = function() {
    console.warn(`⚠️ DELETE OPERATION on table: ${table}`, this);
    console.trace('Stack trace for DELETE operation');
    return originalDeleteMethod.apply(this, arguments);
  };
  
  return tableRef;
};

// 4. Verificar políticas RLS
const checkRLS = async () => {
  try {
    const { data, error } = await supabase.rpc('get_current_user_policies');
    console.log('=== POLÍTICAS RLS ===');
    console.log('User policies:', data, error);
  } catch (error) {
    console.error('Error checking RLS:', error);
  }
};

// Ejecutar verificación
checkSupabaseData();
checkRLS();

console.log('🔍 Debugging activado. Las operaciones DELETE serán logged.');
