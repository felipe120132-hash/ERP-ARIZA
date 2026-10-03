import 'dotenv/config';
import type { ZodType } from 'zod';
import { supabase } from '../src/services/supabaseClient';
import {
  perfilSchema,
  productoSchema,
  clienteSchema,
  precioClienteSchema,
  remisionSchema,
  detalleRemisionSchema,
  kardexSchema,
  abonoCarteraSchema,
  gastoSchema,
  presupuestoSchema,
  documentoSchema,
} from '../src/types/schemas';

interface TableConfig {
  table: string;
  schema: ZodType;
}

const TABLES: TableConfig[] = [
  { table: 'perfiles', schema: perfilSchema },
  { table: 'productos', schema: productoSchema },
  { table: 'clientes', schema: clienteSchema },
  { table: 'precios_cliente', schema: precioClienteSchema },
  { table: 'remisiones', schema: remisionSchema },
  { table: 'detalles_remision', schema: detalleRemisionSchema },
  { table: 'kardex', schema: kardexSchema },
  { table: 'abonos_cartera', schema: abonoCarteraSchema },
  { table: 'gastos', schema: gastoSchema },
  { table: 'presupuestos', schema: presupuestoSchema },
  { table: 'documentos', schema: documentoSchema },
];

interface TableResult {
  table: string;
  total: number;
  passed: number;
  failed: number;
  error?: string;
  failures: Array<{
    rowIndex: number;
    identifier?: string;
    issues: Array<{ path: string; message: string; code: string }>;
  }>;
}

async function validarModelo() {
  console.log('='.repeat(70));
  console.log('🔍 INICIANDO VALIDACIÓN DEL MODELO DE DATOS — ArizaERP');
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
  console.log(`Conectando a Supabase para validar ${TABLES.length} tablas...\n`);

  const results: TableResult[] = [];
  let globalTotal = 0;
  let globalPassed = 0;
  let globalFailed = 0;
  let hasErrors = false;

  for (const { table, schema } of TABLES) {
    process.stdout.write(`⏳ Validando tabla: ${table.padEnd(22)}`);

    const { data, error } = await supabase.from(table).select('*');

    if (error) {
      console.log(`❌ ERROR AL CONSULTAR`);
      results.push({
        table,
        total: 0,
        passed: 0,
        failed: 0,
        error: error.message,
        failures: [],
      });
      hasErrors = true;
      continue;
    }

    const rows = (data as Record<string, unknown>[]) || [];
    let passed = 0;
    let failed = 0;
    const failures: TableResult['failures'] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const parseResult = schema.safeParse(row);

      if (parseResult.success) {
        passed++;
      } else {
        failed++;
        const identifier = (row.id as string) || (row.sku as string) || (row.consecutivo ? String(row.consecutivo) : undefined);
        failures.push({
          rowIndex: i + 1,
          identifier,
          issues: parseResult.error.issues.map((issue) => ({
            path: issue.path.join('.') || '(root)',
            message: issue.message,
            code: issue.code,
          })),
        });
      }
    }

    globalTotal += rows.length;
    globalPassed += passed;
    globalFailed += failed;

    if (failed > 0) {
      hasErrors = true;
      console.log(`⚠️  ${passed} OK / ${failed} FALLARON (Total: ${rows.length})`);
    } else {
      console.log(`✅ ${passed} OK / 0 fallos (Total: ${rows.length})`);
    }

    results.push({
      table,
      total: rows.length,
      passed,
      failed,
      failures,
    });
  }

  // Detalle de errores si los hubo
  const tablesWithFailures = results.filter((r) => r.failed > 0 || r.error);
  if (tablesWithFailures.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('📋 DETALLE DE FALLOS Y ERRORES');
    console.log('='.repeat(70));

    for (const res of tablesWithFailures) {
      console.log(`\n🔴 TABLA: ${res.table}`);
      if (res.error) {
        console.log(`   Error de consulta: ${res.error}`);
        continue;
      }

      for (const fail of res.failures) {
        const idStr = fail.identifier ? ` [ID: ${fail.identifier}]` : '';
        console.log(`   - Fila #${fail.rowIndex}${idStr}:`);
        for (const issue of fail.issues) {
          console.log(`       • Campo: "${issue.path}" -> ${issue.message} (Código: ${issue.code})`);
        }
      }
    }
  }

  // Resumen final
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMEN GENERAL DE VALIDACIÓN');
  console.log('='.repeat(70));
  console.log(`Tablas evaluadas : ${TABLES.length}`);
  console.log(`Filas totales    : ${globalTotal}`);
  console.log(`Filas válidas    : ${globalPassed}`);
  console.log(`Filas fallidas   : ${globalFailed}`);
  console.log('='.repeat(70));

  if (hasErrors) {
    console.log('❌ Se encontraron discrepancias en el modelo o errores de consulta.');
    process.exit(1);
  } else {
    console.log('✨ ¡Todas las filas de todas las tablas cumplen estrictamente sus schemas!');
    process.exit(0);
  }
}

validarModelo().catch((err) => {
  console.error('\n💥 Error fatal al ejecutar script de validación:', err.message || err);
  process.exit(1);
});
