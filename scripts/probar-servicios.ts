import 'dotenv/config';
import { supabase } from '../src/services/supabaseClient';
import { productosService } from '../src/services/productosService';
import { remisionesService } from '../src/services/remisionesService';
import { carteraService } from '../src/services/carteraService';

// ─── Helpers de consola ──────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const INFO = '  ℹ';

function titulo(texto: string) {
  console.log('\n' + '─'.repeat(66));
  console.log(`  ${texto}`);
  console.log('─'.repeat(66));
}

function ok(texto: string, extra?: unknown) {
  console.log(`${PASS} ${texto}`);
  if (extra !== undefined) {
    console.log(`${INFO}`, typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra);
  }
}

function fail(texto: string, error: string | null) {
  console.log(`${FAIL} ${texto}`);
  if (error) console.log(`${INFO} Error: ${error}`);
}

// ─── Autenticación ──────────────────────────────────────────────────────────

async function autenticar(): Promise<boolean> {
  titulo('PASO 0 — Autenticación');

  const email = process.env.TEST_USER_EMAIL || (import.meta.env as Record<string, string | undefined>).TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD || (import.meta.env as Record<string, string | undefined>).TEST_USER_PASSWORD;

  if (!email || !password) {
    fail('Variables TEST_USER_EMAIL / TEST_USER_PASSWORD no configuradas en .env', null);
    return false;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    fail('Login fallido', error?.message ?? 'sin detalle');
    return false;
  }

  ok(`Autenticado como: ${data.user.email}`);
  return true;
}

// ─── Pasos del script ────────────────────────────────────────────────────────

async function probarServicios() {
  console.log('\n' + '='.repeat(66));
  console.log('  🧪  PRUEBA DE SERVICIOS — ArizaERP');
  console.log('='.repeat(66));

  if (!(await autenticar())) {
    process.exit(1);
  }

  let primerProductoId: string | undefined;
  let primerClienteId: string | undefined;
  let nuevaRemisionId: string | undefined;

  // ── PASO 1: listarProductos ──────────────────────────────────────────────
  titulo('PASO 1 — listarProductos()');
  {
    const { data, error } = await productosService.listarProductos();
    if (error || !data) {
      fail('listarProductos falló', error);
    } else {
      ok(`Se recibieron ${data.length} producto(s)`);
      if (data.length > 0) {
        primerProductoId = data[0].id;
        ok(`Primer producto: SKU=${data[0].sku}, nombre="${data[0].nombre}", stock=${data[0].stock_actual}`);
      }
    }
  }

  // ── PASO 2: listarAlertasStock ───────────────────────────────────────────
  titulo('PASO 2 — listarAlertasStock()');
  {
    const { data, error } = await productosService.listarAlertasStock();
    if (error || !data) {
      fail('listarAlertasStock falló', error);
    } else {
      const rojos = data.filter(a => a.semaforo === 'ROJO').length;
      const amarillos = data.filter(a => a.semaforo === 'AMARILLO').length;
      const verdes = data.filter(a => a.semaforo === 'VERDE').length;
      ok(`${data.length} alertas — 🔴 ${rojos} ROJO | 🟡 ${amarillos} AMARILLO | 🟢 ${verdes} VERDE`);
    }
  }

  // ── PASO 3: obtener cliente para usar en los pasos siguientes ─────────────
  titulo('PASO 3 — Obtener cliente y producto de la base');
  {
    const { data, error } = await supabase.from('clientes').select('id, nombre_tienda').limit(1).single();
    if (error || !data) {
      fail('No se pudo obtener un cliente de la base', error?.message ?? null);
    } else {
      primerClienteId = (data as { id: string; nombre_tienda: string }).id;
      ok(`Cliente de prueba: "${(data as { id: string; nombre_tienda: string }).nombre_tienda}" (ID: ${primerClienteId})`);
    }

    if (!primerProductoId) {
      fail('No hay producto disponible para crear la remisión de prueba', null);
    } else {
      ok(`Producto de prueba ID: ${primerProductoId}`);
    }
  }

  // ── PASO 4: crearRemision ────────────────────────────────────────────────
  titulo('PASO 4 — crearRemision()');
  if (!primerClienteId || !primerProductoId) {
    fail('Saltando: falta cliente o producto de prueba', null);
  } else {
    const { data, error } = await remisionesService.crearRemision({
      p_cliente_id: primerClienteId,
      p_tipo_pago: 'CONTADO',
      p_items: [{ producto_id: primerProductoId, cantidad: 1 }],
      p_aplica_iva: false,
    });

    if (error || !data) {
      fail('crearRemision falló', error);
    } else {
      nuevaRemisionId = data;
      ok(`Remisión creada — ID: ${nuevaRemisionId}`);
    }
  }

  // ── PASO 5: actualizarPdfUrl ─────────────────────────────────────────────
  titulo('PASO 5 — actualizarPdfUrl()');
  const PDF_URL_PRUEBA = 'https://onedrive.example.com/ariza-erp/test.pdf';
  if (!nuevaRemisionId) {
    fail('Saltando: no se creó remisión de prueba en el paso anterior', null);
  } else {
    const { data, error } = await remisionesService.actualizarPdfUrl(
      nuevaRemisionId,
      PDF_URL_PRUEBA,
    );
    if (error || !data) {
      fail('actualizarPdfUrl falló', error);
    } else {
      ok(`pdf_url actualizado en remisión ${nuevaRemisionId}`);
      ok(`URL guardada: ${PDF_URL_PRUEBA}`);
    }
  }

  // ── PASO 6: listarRemisiones — confirmar pdf_url actualizada ─────────────
  titulo('PASO 6 — listarRemisiones() (confirmar pdf_url actualizada)');
  {
    const { data, error } = await remisionesService.listarRemisiones({ estado: 'PENDIENTE' });
    if (error || !data) {
      fail('listarRemisiones falló', error);
    } else {
      ok(`${data.length} remisión(es) PENDIENTE encontrada(s)`);
      if (nuevaRemisionId) {
        const encontrada = data.find(r => r.id === nuevaRemisionId);
        if (encontrada) {
          ok(`Remisión de prueba encontrada — consecutivo #${encontrada.consecutivo}, total=${encontrada.total}`);
          if (encontrada.pdf_url === PDF_URL_PRUEBA) {
            ok(`pdf_url verificado correctamente: ${encontrada.pdf_url}`);
          } else {
            fail(
              `pdf_url no coincide — esperado: "${PDF_URL_PRUEBA}", recibido: "${encontrada.pdf_url}"`,
              null,
            );
          }
        } else {
          fail('La remisión de prueba NO aparece en el listado', null);
        }
      }
    }
  }

  // ── PASO 7: anularRemision ───────────────────────────────────────────────
  titulo('PASO 7 — anularRemision()');
  if (!nuevaRemisionId) {
    fail('Saltando: no se creó remisión de prueba en el paso anterior', null);
  } else {
    const { data, error } = await remisionesService.anularRemision(nuevaRemisionId);
    if (error || !data) {
      fail('anularRemision falló', error);
    } else {
      ok(`Remisión ${nuevaRemisionId} anulada correctamente`);
    }
  }

  // ── PASO 8: registrarAbono ───────────────────────────────────────────────
  titulo('PASO 8 — registrarAbono()');
  if (!primerClienteId) {
    fail('Saltando: no se obtuvo cliente de prueba', null);
  } else {
    const { data, error } = await carteraService.registrarAbono({
      p_cliente_id: primerClienteId,
      p_monto: 1000,
      p_metodo_pago: 'EFECTIVO',
    });

    if (error || !data) {
      fail('registrarAbono falló', error);
    } else {
      ok(`Abono registrado — ID: ${data}`);
    }
  }

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(66));
  console.log('  ✔  Prueba de servicios finalizada.');
  console.log('='.repeat(66) + '\n');
}

probarServicios().catch(err => {
  console.error('\n💥 Error fatal en probar-servicios:', err);
  process.exit(1);
});

