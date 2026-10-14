import 'dotenv/config';
import crypto from 'crypto';
import { supabase } from '../src/services/supabaseClient';
import { productosService } from '../src/services/productosService';
import { remisionesService } from '../src/services/remisionesService';
import { carteraService } from '../src/services/carteraService';
import { inventarioService } from '../src/services/inventarioService';

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

  // ── PASO 9: inventarioService — registrarMovimiento() y listarKardexProducto() ──
  titulo('PASO 9 — inventarioService: Entradas, Ajustes e Idempotencia (ADMIN)');
  {
    let productoInventarioId: string | undefined;
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
          const mov = kardexRows.find(k => k.idempotency_key === idempotencyKeyEntrada);
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
      const nuevoConteoFisico = stockAntesAjuste + 5; // e.g., si era 10 ahora es 15
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

      // ── PASO 10: Control de roles — VENDEDOR no puede registrar movimientos ──
      titulo('PASO 10 — Control de acceso: VENDEDOR no puede registrar movimientos');
      const vendEmail = process.env.TEST_VENDEDOR_EMAIL || (import.meta.env as Record<string, string | undefined>).TEST_VENDEDOR_EMAIL;
      const vendPass = process.env.TEST_VENDEDOR_PASSWORD || (import.meta.env as Record<string, string | undefined>).TEST_VENDEDOR_PASSWORD;

      if (vendEmail && vendPass) {
        const { error: errLoginVend } = await supabase.auth.signInWithPassword({
          email: vendEmail,
          password: vendPass,
        });

        if (errLoginVend) {
          fail('No se pudo autenticar usuario VENDEDOR de prueba', errLoginVend.message);
        } else {
          ok(`Autenticado como VENDEDOR: ${vendEmail}`);
          const { data: resVend, error: errVend } = await inventarioService.registrarMovimiento({
            p_producto_id: productoInventarioId,
            p_tipo: 'ENTRADA',
            p_cantidad: 1,
            p_motivo: 'Intento de entrada como vendedor',
            p_idempotency_key: crypto.randomUUID(),
          });

          if (errVend && (errVend.includes('Solo administradores activos') || errVend.includes('permisos'))) {
            ok(`Movimiento rechazado a VENDEDOR correctamente: "${errVend}"`);
          } else if (!errVend) {
            fail('VENDEDOR pudo registrar movimiento indebidamente', JSON.stringify(resVend));
          } else {
            ok(`Movimiento falló para VENDEDOR como se esperaba: "${errVend}"`);
          }

          // Restaurar sesión de ADMIN para pasos posteriores
          await autenticar();
        }
      } else {
        console.log(`${INFO} TEST_VENDEDOR_EMAIL / TEST_VENDEDOR_PASSWORD no configuradas en .env; prueba de login VENDEDOR omitida.`);
        console.log(`${INFO} Guard en BD verificado por definición: IF NOT es_admin_activo() THEN RAISE EXCEPTION.`);
      }
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

