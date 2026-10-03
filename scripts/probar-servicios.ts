import 'dotenv/config';
import { supabase } from '../src/services/supabaseClient';

async function probarServicios() {
  console.log('='.repeat(70));
  console.log('🧪 PRUEBA DE CONECTIVIDAD Y SERVICIOS — ArizaERP');
  console.log('='.repeat(70));

  const testEmail = process.env.TEST_USER_EMAIL || (import.meta.env as Record<string, string | undefined>)?.TEST_USER_EMAIL;
  const testPassword = process.env.TEST_USER_PASSWORD || (import.meta.env as Record<string, string | undefined>)?.TEST_USER_PASSWORD;

  if (!testEmail || !testPassword) {
    console.error('❌ No se pudo autenticar el usuario de prueba, revisa TEST_USER_EMAIL y TEST_USER_PASSWORD en tu archivo .env.');
    process.exit(1);
  }

  process.stdout.write('🔐 Autenticando usuario de prueba...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (authError || !authData.user) {
    console.error('\n❌ No se pudo autenticar el usuario de prueba, revisa TEST_USER_EMAIL y TEST_USER_PASSWORD en tu archivo .env.');
    if (authError) {
      console.error(`   Detalle: ${authError.message}`);
    }
    process.exit(1);
  }

  console.log(` ✅ Autenticado como: ${authData.user.email}`);

  try {
    const { count, error } = await supabase.from('perfiles').select('*', { count: 'exact', head: true });
    if (error) {
      console.error('❌ Error al consultar la tabla perfiles:', error.message);
      process.exit(1);
    }
    console.log(`✅ Consulta exitosa. Filas en perfiles: ${count ?? 0}`);
  } catch (err) {
    console.error('💥 Error inesperado:', err);
    process.exit(1);
  }
}

probarServicios();
