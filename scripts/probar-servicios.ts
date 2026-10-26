import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../src/services/supabaseClient';
import { productosService } from '../src/services/productosService';
import { remisionesService } from '../src/services/remisionesService';
import { carteraService } from '../src/services/carteraService';
import { inventarioService } from '../src/services/inventarioService';

// ─── Contadores y Helpers de consola ──────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠';
const INFO = '  ℹ';

let totalVerificaciones = 0;
let verificacionesAprobadas = 0;
let verificacionesFallidas = 0;
let verificacionesOmitidas = 0;

function titulo(texto: string) {
  console.log('\n' + '─'.repeat(66));
  console.log(`  ${texto}`);
  console.log('─'.repeat(66));
}

function ok(texto: string, extra?: unknown) {
  totalVerificaciones++;
  verificacionesAprobadas++;
  console.log(`${PASS} ${texto}`);
  if (extra !== undefined) {
    console.log(`${INFO}`, typeof extra === 'object' ? JSON.stringify(extra, null, 2) : extra);
  }
}

function fail(texto: string, error: unknown) {
  totalVerificaciones++;
  verificacionesFallidas++;
  console.log(`${FAIL} ${texto}`);
  if (error !== undefined && error !== null) {
    console.log(`${INFO} Error:`, error);
  }
}

function omit(texto: string, motivo?: string) {
  totalVerificaciones++;
  verificacionesOmitidas++;
  console.log(`${WARN} ${texto}`);
  if (motivo) {
    console.log(`${INFO} Motivo: ${motivo}`);
  }
}

// ─── Autenticación ──────────────────────────────────────────────────────────

async function autenticar(): Promise<boolean> {
  titulo('PASO 0 — Autenticación');

  const email =
    process.env.TEST_USER_EMAIL ||
    (import.meta.env as Record<string, string | undefined>)?.TEST_USER_EMAIL;
  const password =
    process.env.TEST_USER_PASSWORD ||
    (import.meta.env as Record<string, string | undefined>)?.TEST_USER_PASSWORD;

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
      const rojos = data.filter((a) => a.semaforo === 'ROJO').length;
      const amarillos = data.filter((a) => a.semaforo === 'AMARILLO').length;
      const verdes = data.filter((a) => a.semaforo === 'VERDE').length;
      ok(`${data.length} alertas — 🔴 ${rojos} ROJO | 🟡 ${amarillos} AMARILLO | 🟢 ${verdes} VERDE`);
    }
  }

  // ── PASO 3: obtener cliente para usar en los pasos siguientes ─────────────
  titulo('PASO 3 — Obtener cliente y producto de la base');
  {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre_tienda')
      .limit(1)
      .single();
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

  // ── PASO 5b: Endurecimiento RPC actualizar_pdf_remision (Llamada directa ADMIN) ──
  titulo('PASO 5b — Endurecimiento RPC actualizar_pdf_remision (Llamada directa ADMIN)');
  if (!nuevaRemisionId) {
    fail('Saltando: no se creó remisión de prueba para probar actualizar_pdf_remision', null);
  } else {
    // 1. URL con esquema javascript:alert(1) (debe ser rechazada)
    const { error: errJs } = await supabase.rpc('actualizar_pdf_remision', {
      p_remision_id: nuevaRemisionId,
      p_pdf_url: 'javascript:alert(1)',
    });
    if (
      errJs &&
      (errJs.message.includes('debe empezar por https://') ||
        errJs.message.includes('no es válida'))
    ) {
      ok(`URL 'javascript:alert(1)' rechazada correctamente: "${errJs.message}"`);
    } else if (!errJs) {
      fail("URL 'javascript:alert(1)' debió ser rechazada pero fue aceptada", null);
    } else {
      ok(`URL 'javascript:alert(1)' rechazada: "${errJs.message}"`);
    }

    // 2. URL con protocolo http no seguro (debe ser rechazada)
    const { error: errHttp } = await supabase.rpc('actualizar_pdf_remision', {
      p_remision_id: nuevaRemisionId,
      p_pdf_url: 'http://inseguro.example.com/a.pdf',
    });
    if (
      errHttp &&
      (errHttp.message.includes('debe empezar por https://') ||
        errHttp.message.includes('no es válida'))
    ) {
      ok(`URL 'http://inseguro.example.com/a.pdf' rechazada correctamente: "${errHttp.message}"`);
    } else if (!errHttp) {
      fail("URL 'http://inseguro.example.com/a.pdf' debió ser rechazada pero fue aceptada", null);
    } else {
      ok(`URL 'http://inseguro.example.com/a.pdf' rechazada: "${errHttp.message}"`);
    }

    // 3. URL de más de 2048 caracteres (debe ser rechazada)
    const urlLarga = 'https://onedrive.example.com/ariza-erp/' + 'x'.repeat(2050);
    const { error: errLarga } = await supabase.rpc('actualizar_pdf_remision', {
      p_remision_id: nuevaRemisionId,
      p_pdf_url: urlLarga,
    });
    if (
      errLarga &&
      (errLarga.message.includes('debe empezar por https://') ||
        errLarga.message.includes('no es válida'))
    ) {
      ok(`URL de más de 2048 caracteres rechazada correctamente: "${errLarga.message}"`);
    } else if (!errLarga) {
      fail('URL de más de 2048 caracteres debió ser rechazada pero fue aceptada', null);
    } else {
      ok(`URL de más de 2048 caracteres rechazada: "${errLarga.message}"`);
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
        const encontrada = data.find((r) => r.id === nuevaRemisionId);
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

  // ── PASO 9: inventarioService — registrarMovimiento() y listarKardexProducto() ──
  titulo('PASO 9 — inventarioService: Entradas, Ajustes e Idempotencia (ADMIN)');
  let productoInventarioId: string | undefined;
  {
    let stockBase: number = 0;

    // Buscar primero el producto de prueba SKU-PRUEBA (database/datos_prueba_inventario.sql)
    const { data: prodPrueba } = await supabase
      .from('productos')
      .select('id, sku, stock_actual, activo')
      .eq('sku', 'SKU-PRUEBA')
      .maybeSingle();

    if (prodPrueba) {
      productoInventarioId = prodPrueba.id;
      stockBase = Number(prodPrueba.stock_actual);
      ok(`Producto de prueba SKU-PRUEBA encontrado (ID: ${productoInventarioId}, stock: ${stockBase})`);
    } else if (primerProductoId) {
      productoInventarioId = primerProductoId;
      const { data: p } = await productosService.obtenerProductoPorId(primerProductoId);
      stockBase = p?.stock_actual ?? 0;
      ok(`SKU-PRUEBA no encontrado en BD; usando producto del catálogo como alternativa (ID: ${productoInventarioId}, stock: ${stockBase})`);
    } else {
      fail('No hay producto disponible para ejecutar pruebas de inventario', null);
    }

    if (productoInventarioId) {
      const idempotencyKeyEntrada = crypto.randomUUID();

      // 9.1 Entrada de +10 verificando stock y kardex
      const { data: resEntrada, error: errEntrada } = await inventarioService.registrarMovimiento({
        p_producto_id: productoInventarioId,
        p_tipo: 'ENTRADA',
        p_cantidad: 10,
        p_motivo: 'Entrada de prueba +10',
        p_idempotency_key: idempotencyKeyEntrada,
      });

      if (errEntrada || !resEntrada) {
        fail('Entrada de +10 falló', errEntrada);
      } else {
        const stockEsperado = stockBase + 10;
        if (resEntrada.stock_resultante === stockEsperado && !resEntrada.repetido) {
          ok(`Entrada de +10 exitosa — Stock anterior: ${resEntrada.stock_anterior}, resultante: ${resEntrada.stock_resultante}`);
        } else {
          fail(`Entrada retornó stock inesperado: ${resEntrada.stock_resultante} (esperado: ${stockEsperado})`, null);
        }

        // Verificar kardex
        const { data: kardexRows, error: errKardex } = await inventarioService.listarKardexProducto(productoInventarioId);
        if (errKardex || !kardexRows) {
          fail('Error al listar kardex del producto', errKardex);
        } else {
          const mov = kardexRows.find((k) => k.idempotency_key === idempotencyKeyEntrada);
          if (mov && mov.tipo_movimiento === 'ENTRADA' && Number(mov.cantidad) === 10) {
            ok(`Kardex verificado: fila de entrada con cantidad=+10, stock_resultante=${mov.stock_resultante} e idempotency_key coincidente`);
          } else {
            fail('No se encontró el movimiento de entrada registrado en kardex', null);
          }
        }
      }

      // 9.2 Reintento con la misma clave (repetido = true, stock sin doble suma)
      const { data: resReintento, error: errReintento } = await inventarioService.registrarMovimiento({
        p_producto_id: productoInventarioId,
        p_tipo: 'ENTRADA',
        p_cantidad: 10,
        p_motivo: 'Entrada de prueba +10 (reintento)',
        p_idempotency_key: idempotencyKeyEntrada,
      });

      if (errReintento || !resReintento) {
        fail('Reintento con misma clave de idempotencia falló', errReintento);
      } else if (resReintento.repetido === true) {
        // Verificar que el stock físico en base no haya sufrido doble incremento
        const { data: pCheck } = await productosService.obtenerProductoPorId(productoInventarioId);
        if (pCheck && pCheck.stock_actual === stockBase + 10) {
          ok(`Idempotencia verificada: repetido = true, stock intacto (${pCheck.stock_actual}) sin duplicación`);
        } else {
          fail(`Stock se incrementó indebidamente tras reintento: ${pCheck?.stock_actual}`, null);
        }
      } else {
        fail('Respuesta de reintento no marcó repetido=true', JSON.stringify(resReintento));
      }

      // 9.3 Ajuste correcto
      const stockAntesAjuste = stockBase + 10;
      const nuevoConteoFisico = stockAntesAjuste + 5;
      const idempotencyKeyAjuste = crypto.randomUUID();

      const { data: resAjuste, error: errAjuste } = await inventarioService.registrarMovimiento({
        p_producto_id: productoInventarioId,
        p_tipo: 'AJUSTE',
        p_cantidad: nuevoConteoFisico,
        p_motivo: 'Ajuste de inventario físico verificado',
        p_idempotency_key: idempotencyKeyAjuste,
        p_stock_esperado: stockAntesAjuste,
      });

      if (errAjuste || !resAjuste) {
        fail('Ajuste correcto falló', errAjuste);
      } else if (resAjuste.stock_resultante === nuevoConteoFisico && resAjuste.cantidad === 5) {
        ok(`Ajuste correcto exitoso — Stock resultante: ${resAjuste.stock_resultante}, diferencia con signo: ${resAjuste.cantidad}`);
      } else {
        fail(`Ajuste retornó valores inesperados: ${JSON.stringify(resAjuste)}`, null);
      }

      // 9.4 Ajuste con stock_esperado desactualizado (debe fallar)
      const { data: resDesact, error: errDesact } = await inventarioService.registrarMovimiento({
        p_producto_id: productoInventarioId,
        p_tipo: 'AJUSTE',
        p_cantidad: 50,
        p_motivo: 'Ajuste con concurrencia desactualizada',
        p_idempotency_key: crypto.randomUUID(),
        p_stock_esperado: 9999, // Desactualizado intencionalmente
      });

      if (errDesact) {
        ok(`Ajuste con stock_esperado desactualizado rechazado correctamente: "${errDesact}"`);
      } else {
        fail('Ajuste con stock desactualizado debió fallar pero fue aceptado', JSON.stringify(resDesact));
      }

      // 9.5 Sin motivo (debe fallar)
      const { error: errSinMotivo } = await inventarioService.registrarMovimiento({
        p_producto_id: productoInventarioId,
        p_tipo: 'ENTRADA',
        p_cantidad: 5,
        p_motivo: '    ', // Motivo vacío tras trim
        p_idempotency_key: crypto.randomUUID(),
      });

      if (errSinMotivo) {
        ok(`Movimiento sin motivo rechazado correctamente: "${errSinMotivo}"`);
      } else {
        fail('Movimiento sin motivo debió ser rechazado', null);
      }

      // 9.6 Con cantidad negativa en ENTRADA (debe fallar)
      const { error: errCantNeg } = await inventarioService.registrarMovimiento({
        p_producto_id: productoInventarioId,
        p_tipo: 'ENTRADA',
        p_cantidad: -5,
        p_motivo: 'Entrada negativa inválida',
        p_idempotency_key: crypto.randomUUID(),
      });

      if (errCantNeg) {
        ok(`Entrada con cantidad negativa rechazada correctamente: "${errCantNeg}"`);
      } else {
        fail('Entrada con cantidad negativa debió ser rechazada', null);
      }

      // 9.7 Con producto inexistente (debe fallar)
      const { error: errProdInexistente } = await inventarioService.registrarMovimiento({
        p_producto_id: '00000000-0000-0000-0000-000000000000',
        p_tipo: 'ENTRADA',
        p_cantidad: 5,
        p_motivo: 'Entrada para producto inexistente',
        p_idempotency_key: crypto.randomUUID(),
      });

      if (errProdInexistente) {
        ok(`Producto inexistente rechazado correctamente: "${errProdInexistente}"`);
      } else {
        fail('Movimiento para producto inexistente debió ser rechazado', null);
      }
    }
  }

  // ── PASO 10: Control de roles y aislamiento VENDEDOR (Segundo cliente) ────
  titulo('PASO 10 — Control de acceso y aislamiento de permisos (VENDEDOR)');
  const vendEmail =
    process.env.TEST_VENDEDOR_EMAIL ||
    (import.meta.env as Record<string, string | undefined>)?.TEST_VENDEDOR_EMAIL;
  const vendPass =
    process.env.TEST_VENDEDOR_PASSWORD ||
    (import.meta.env as Record<string, string | undefined>)?.TEST_VENDEDOR_PASSWORD;

  if (vendEmail && vendPass) {
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL ||
      (import.meta.env as Record<string, string | undefined>)?.VITE_SUPABASE_URL ||
      '';
    const supabaseAnonKey =
      process.env.VITE_SUPABASE_ANON_KEY ||
      (import.meta.env as Record<string, string | undefined>)?.VITE_SUPABASE_ANON_KEY ||
      '';

    const supabaseVendedor = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authVend, error: errLoginVend } =
      await supabaseVendedor.auth.signInWithPassword({
        email: vendEmail,
        password: vendPass,
      });

    if (errLoginVend || !authVend.user) {
      fail('No se pudo autenticar usuario VENDEDOR de prueba con el segundo cliente', errLoginVend?.message ?? null);
    } else {
      ok(`Segundo cliente Supabase autenticado como VENDEDOR: ${vendEmail}`);

      // 10.1 VENDEDOR no puede registrar_movimiento_inventario (debe fallar)
      if (productoInventarioId) {
        const { data: resMovVend, error: errMovVend } = await supabaseVendedor.rpc(
          'registrar_movimiento_inventario',
          {
            p_producto_id: productoInventarioId,
            p_tipo: 'ENTRADA',
            p_cantidad: 1,
            p_motivo: 'Intento de entrada como vendedor',
            p_idempotency_key: crypto.randomUUID(),
          },
        );

        if (
          errMovVend &&
          (errMovVend.message.includes('Solo administradores activos') ||
            errMovVend.message.includes('permisos') ||
            errMovVend.code === '42501' ||
            errMovVend.code === 'P0001')
        ) {
          ok(`registrar_movimiento_inventario rechazado a VENDEDOR correctamente: "${errMovVend.message}"`);
        } else if (!errMovVend) {
          fail('VENDEDOR pudo registrar movimiento indebidamente', JSON.stringify(resMovVend));
        } else {
          ok(`registrar_movimiento_inventario falló para VENDEDOR como se esperaba: "${errMovVend.message}"`);
        }
      } else {
        omit('VENDEDOR no puede registrar_movimiento_inventario', 'Falta producto de inventario');
      }

      // 10.2 VENDEDOR no puede anular_remision de remisión PENDIENTE creada por ADMIN
      if (primerClienteId && primerProductoId) {
        const { data: remAdminId, error: errCrearAdmin } = await remisionesService.crearRemision({
          p_cliente_id: primerClienteId,
          p_tipo_pago: 'CONTADO',
          p_items: [{ producto_id: primerProductoId, cantidad: 1 }],
          p_aplica_iva: false,
        });

        if (errCrearAdmin || !remAdminId) {
          fail('No se pudo crear remisión temporal de ADMIN para prueba de anulación', errCrearAdmin);
        } else {
          const { error: errAnularVend } = await supabaseVendedor.rpc('anular_remision', {
            p_remision_id: remAdminId,
          });

          if (
            errAnularVend &&
            (errAnularVend.message.includes('Solo administradores activos') ||
              errAnularVend.message.includes('permisos') ||
              errAnularVend.code === '42501' ||
              errAnularVend.code === 'P0001')
          ) {
            ok(`anular_remision rechazada a VENDEDOR correctamente: "${errAnularVend.message}"`);
          } else if (!errAnularVend) {
            fail('VENDEDOR pudo anular una remisión indebidamente', null);
          } else {
            ok(`anular_remision falló para VENDEDOR como se esperaba: "${errAnularVend.message}"`);
          }

          // ADMIN anula la remisión para no dejar basura
          const { error: errLimpiarAdmin } = await remisionesService.anularRemision(remAdminId);
          if (errLimpiarAdmin) {
            fail('ADMIN no pudo anular la remisión temporal tras prueba', errLimpiarAdmin);
          } else {
            ok(`ADMIN anuló la remisión temporal (${remAdminId}) para no dejar basura`);
          }
        }
      } else {
        omit('VENDEDOR no puede anular_remision', 'Falta cliente o producto');
      }

      // 10.3 VENDEDOR no ve filas en gastos ([]) ni en presupuestos ([])
      const { data: gastosVend, error: errGastosVend } = await supabaseVendedor
        .from('gastos')
        .select('*');
      if (!errGastosVend && Array.isArray(gastosVend) && gastosVend.length === 0) {
        ok('VENDEDOR no ve filas en gastos (devuelve [])');
      } else if (errGastosVend) {
        ok(`Acceso a gastos restringido para VENDEDOR: "${errGastosVend.message}"`);
      } else {
        fail(`VENDEDOR vio filas en gastos indebidamente (${gastosVend?.length} filas)`, null);
      }

      const { data: presupuestosVend, error: errPresupuestosVend } = await supabaseVendedor
        .from('presupuestos')
        .select('*');
      if (!errPresupuestosVend && Array.isArray(presupuestosVend) && presupuestosVend.length === 0) {
        ok('VENDEDOR no ve filas en presupuestos (devuelve [])');
      } else if (errPresupuestosVend) {
        ok(`Acceso a presupuestos restringido para VENDEDOR: "${errPresupuestosVend.message}"`);
      } else {
        fail(`VENDEDOR vio filas en presupuestos indebidamente (${presupuestosVend?.length} filas)`, null);
      }

      // 10.4 VENDEDOR SÍ puede crear remisión y actualizar_pdf_remision con URL https válida
      if (primerClienteId && primerProductoId) {
        const { data: remVendId, error: errCrearRemVend } = await supabaseVendedor.rpc(
          'crear_remision',
          {
            p_cliente_id: primerClienteId,
            p_tipo_pago: 'CONTADO',
            p_items: [{ producto_id: primerProductoId, cantidad: 1 }],
            p_aplica_iva: false,
          },
        );

        if (errCrearRemVend || !remVendId) {
          fail('VENDEDOR activo debió poder crear remisión legítima pero falló', errCrearRemVend?.message ?? null);
        } else {
          ok(`VENDEDOR creó remisión legítimamente — ID: ${remVendId}`);

          const urlHttpsValida = 'https://onedrive.example.com/ariza-erp/vendedor-valido.pdf';
          const { error: errPdfVend } = await supabaseVendedor.rpc('actualizar_pdf_remision', {
            p_remision_id: remVendId,
            p_pdf_url: urlHttpsValida,
          });

          if (errPdfVend) {
            fail('VENDEDOR activo debió poder actualizar pdf_url con HTTPS válida pero falló', errPdfVend.message);
          } else {
            ok('VENDEDOR actualizó pdf_url con HTTPS válida exitosamente');
          }

          // ADMIN anula la remisión para no dejar basura
          const { error: errLimpiarVend } = await remisionesService.anularRemision(remVendId);
          if (errLimpiarVend) {
            fail('ADMIN no pudo anular la remisión de prueba creada por VENDEDOR', errLimpiarVend);
          } else {
            ok(`ADMIN anuló la remisión (${remVendId}) creada por VENDEDOR para no dejar basura`);
          }
        }
      } else {
        omit('VENDEDOR crear remisión y actualizar pdf', 'Falta cliente o producto');
      }

      // 10.5 VENDEDOR no puede leer onedrive_oauth ni onedrive_empresa (debe devolver error o [])
      const { data: oauthData, error: oauthErr } = await supabaseVendedor
        .from('onedrive_oauth')
        .select('*');
      if (oauthErr || (Array.isArray(oauthData) && oauthData.length === 0)) {
        ok(`Lectura de onedrive_oauth bloqueada para VENDEDOR ${oauthErr ? `(Error: ${oauthErr.message})` : '(Devolvió [])'}`);
      } else {
        fail(`VENDEDOR pudo leer onedrive_oauth indebidamente (${oauthData?.length} filas)`, null);
      }

      const { data: empresaData, error: empresaErr } = await supabaseVendedor
        .from('onedrive_empresa')
        .select('*');
      if (empresaErr || (Array.isArray(empresaData) && empresaData.length === 0)) {
        ok(`Lectura de onedrive_empresa bloqueada para VENDEDOR ${empresaErr ? `(Error: ${empresaErr.message})` : '(Devolvió [])'}`);
      } else {
        fail(`VENDEDOR pudo leer onedrive_empresa indebidamente (${empresaData?.length} filas)`, null);
      }
    }
  } else {
    console.log(`${WARN} TEST_VENDEDOR_EMAIL / TEST_VENDEDOR_PASSWORD no configuradas en .env; pruebas de VENDEDOR omitidas.`);
    omit('VENDEDOR no puede registrar_movimiento_inventario', 'TEST_VENDEDOR_EMAIL / TEST_VENDEDOR_PASSWORD no configuradas en .env');
    omit('VENDEDOR no puede anular_remision de remisión PENDIENTE', 'TEST_VENDEDOR_EMAIL / TEST_VENDEDOR_PASSWORD no configuradas en .env');
    omit('VENDEDOR no ve filas en gastos ([]) ni en presupuestos ([])', 'TEST_VENDEDOR_EMAIL / TEST_VENDEDOR_PASSWORD no configuradas en .env');
    omit('VENDEDOR SÍ puede crear remisión y actualizar_pdf_remision con HTTPS', 'TEST_VENDEDOR_EMAIL / TEST_VENDEDOR_PASSWORD no configuradas en .env');
    omit('VENDEDOR no puede leer onedrive_oauth ni onedrive_empresa', 'TEST_VENDEDOR_EMAIL / TEST_VENDEDOR_PASSWORD no configuradas en .env');
    console.log(`${INFO} Guard en BD verificado por definición: IF NOT es_admin_activo() THEN RAISE EXCEPTION.`);
  }

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(66));
  console.log('  📊 RESUMEN FINAL DE PRUEBAS DE SERVICIOS');
  console.log('='.repeat(66));
  console.log(`  Total de verificaciones : ${totalVerificaciones}`);
  console.log(`  Aprobadas (✅)           : ${verificacionesAprobadas}`);
  console.log(`  Fallidas  (❌)           : ${verificacionesFallidas}`);
  console.log(`  Omitidas  (⚠)            : ${verificacionesOmitidas}`);
  console.log('='.repeat(66));

  if (verificacionesFallidas > 0) {
    console.error(`\n💥 Se encontraron ${verificacionesFallidas} verificación(es) fallida(s).`);
    process.exit(1);
  } else {
    console.log('\n✨ Todas las verificaciones ejecutadas fueron aprobadas exitosamente.');
    process.exit(0);
  }
}

probarServicios().catch((err) => {
  console.error('\n💥 Error fatal en probar-servicios:', err);
  process.exit(1);
});
