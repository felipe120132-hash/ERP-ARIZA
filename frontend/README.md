# Ariza One — Frontend

Primera entrega en React + TypeScript + Vite, Tailwind CSS y componentes oficiales de shadcn/ui (Radix). Conserva la dirección visual Minimal HUD del mockup, guardado en `mockup/`.

## Ejecutar

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar únicamente la URL y clave pública de Supabase.
3. `npm run dev` — abre la URL que indica Vite.
4. `npm run build` — verifica TypeScript y compila producción.

No colocar `service_role`, contraseñas de prueba ni secretos de Microsoft en variables `VITE_`. `.env.local` está excluido de Git. El despliegue SPA debe redirigir las rutas a `index.html`.

## Alcance operativo

- Login, recuperación de sesión, cierre de sesión local y verificación de perfil activo.
- Navegación adaptable, menú móvil y controles por rol. La autorización efectiva sigue dependiendo de RLS.
- Catálogo de productos activos, búsqueda por nombre/SKU (ignora tildes), categoría, origen, precios base tienda/distribuidor, paginación, vista de tarjetas/lista y panel de detalle.
- Stock y semáforo obtenidos del backend; imágenes mediante URLs firmadas con renovación periódica.
- Estados de carga, error con reintento, catálogo vacío y ausencia de imágenes.
- Las demás rutas indican explícitamente que están pendientes. La administración de productos/clientes, finanzas y OneDrive siguen pendientes; pedidos/remisiones y cartera/abonos se describen en las siguientes entregas.

## Arquitectura e integración

`src/services/` y `src/types/` parten de ERP-ARIZA (commit revisado: 57c0a0d). Las pantallas no importan `supabaseClient`. Se añadieron `authService` e `imagenesService` y un contexto de autenticación que rechaza perfiles ausentes/inactivos y evita consultas dentro del callback síncrono de Supabase.

Los precios del catálogo son informativos. El carrito previsualiza un subtotal estimado sin IVA según el tipo de cliente y sus acuerdos de precio; el importe definitivo de una remisión viene de las RPC. Los semáforos provienen del backend.

## Verificación

Con Vite activo en `http://127.0.0.1:5173`, ejecutar `npm test`. Requiere Chrome instalado y `.env.local` para identificar el dominio interceptado. Playwright sustituye las respuestas de Supabase: los tests no envían credenciales ni modifican la base. Cubren login inválido, filtros, paginación, detalle, persistencia de filtros, cierre de sesión, móvil, restricciones del vendedor, perfil inactivo y error de catálogo.

Se verificó además login y lectura del catálogo real con la cuenta de prueba existente, sin mutaciones de negocio. Las capturas de `output/frontend/` incluyen datos simulados; `catalogo-real.png` corresponde a la lectura real.

## Segunda entrega: pedidos y remisiones

- Carrito con cliente activo buscable, cantidades de hasta dos decimales, eliminación de líneas, contado/crédito y switch de IVA. Conserva el borrador al navegar dentro de la sesión; al recargar no se persiste y el navegador muestra una advertencia si hay líneas pendientes.
- Revisión explícita antes de registrar. El único envío de venta usa `crear_remision`; no se envían precios, impuestos ni totales calculados por el frontend.
- Protección de doble clic y bloqueo de reenvío ante una respuesta incierta. La RPC actual no ofrece clave de idempotencia: ante pérdida de conexión hay que comprobar el historial antes de iniciar otro pedido.
- Tras recibir el UUID se limpia el carrito y se abre el detalle. Los reintentos del detalle son solo lecturas y no crean otra venta. Volver al catálogo consulta las existencias actualizadas.
- Historial `/remisiones` con búsqueda, filtros de cliente/estado/pago y paginación; detalle por URL `/remisiones/:id`, con cifras del servidor a dos decimales.
- PDF, OneDrive y anulación quedan fuera de esta entrega. Tampoco se ofrece cotización definitiva previa al registro.
- Verificación: 12 pruebas de navegador con respuestas simuladas, incluyendo payload de la RPC, doble clic, stock insuficiente, validaciones, respuesta incierta, fallo de lectura posterior, filtros y móvil. No se ejecutaron ventas reales durante esta implementación.

## Tercera entrega: cartera y clientes

- `/cartera`: clientes, búsqueda por nombre/contacto/teléfono, filtros de saldo/mora/tipo, paginación y saldos con dos decimales. Incluye clientes inactivos para conservar visibilidad de sus deudas.
- `/cartera/:id`: datos del cliente, saldo actual e historial de abonos y remisiones, con enlaces al detalle de cada venta.
- Registro de abonos mediante `registrar_abono`: efectivo, transferencia y Bancolombia; aplicación general o remisión a crédito pendiente del mismo cliente. Se consulta de nuevo el saldo antes de habilitar el formulario; el backend conserva la autoridad final ante cambios concurrentes.
- Se rechazan montos no positivos, de más de dos decimales y superiores al saldo consultado. No se calcula el saldo individual de remisiones porque el contrato no lo expone.
- Confirmación explícita y bloqueo de doble clic. Una petición sin resultado conocido mantiene una marca en sessionStorage por usuario/cliente, incluso al reabrir el formulario en la misma pestaña. Es necesario revisar el historial antes de desbloquearla. La garantía de idempotencia entre pestañas/dispositivos requiere soporte de la RPC.
- Tras confirmar un UUID de abono, las recargas solo vuelven a leer saldos e historial. El frontend no actualiza manualmente saldos, mora ni estados de remisiones.
- No se inventan vencimientos ni edades de deuda; el indicador de mora representa el saldo de clientes marcados `en_mora`.
- Verificación: 21 pruebas de navegador (9 de cartera), compilación y lectura del backend real. Las mutaciones se probaron exclusivamente con respuestas simuladas; no se registraron abonos reales.

## Cuarta entrega: inventario y alertas

- `/inventario`: existencias y mínimos, semáforo del backend, búsqueda por nombre/SKU, filtros por categoría, estado y actividad, y paginación. Incluye referencias inactivas mediante filtro.
- `/inventario/:id`: kardex por producto con entradas, salidas y ajustes, cantidades y stock resultante originales, observaciones y enlaces a las remisiones asociadas.
- Historial paginado en servidor, 20 movimientos por página, con conteo exacto y orden estable. Reintentos de lectura y estados vacíos explícitos.
- Una alerta ausente se muestra como desconocida; una consulta fallida no se interpreta como stock saludable ni como un filtro vacío.
- Módulo de consulta: no registra entradas, ajustes ni anulaciones. No modifica existencias.
- Verificación: 7 pruebas nuevas (28 en total), compilación, revisión visual en escritorio/móvil y consultas reales de kardex y alertas con la cuenta de prueba, sin mutaciones de negocio.

## Quinta entrega: finanzas y gastos

- `/finanzas`, exclusivo para ADMIN: resumen mensual del servidor (ventas, gastos y resultado), presupuesto y señal de exceso. Los vendedores no disparan consultas financieras.
- Historial por mes de referencia, búsqueda de concepto, filtros de categoría/tipo y paginación visual. Un resumen fallido no reemplaza sus importes con ceros.
- Registro de gastos con concepto, categoría, monto positivo de hasta dos decimales, mes y marca recurrente. Autor tomado de la sesión y confirmación previa al envío. La marca recurrente no genera gastos automáticamente.
- Bloqueo de doble envío y persistencia por usuario en sessionStorage cuando no hay confirmación. Revisar el historial antes de habilitar otro intento. No existe garantía de idempotencia entre dispositivos.
- Presupuestos: solo consulta; su edición queda pendiente. El resultado mensual no es el saldo de caja ni el recaudo.
- Validación con 6 pruebas nuevas de navegador, compilación y lectura real del resumen y gastos. Ningún gasto real fue registrado durante la implementación.

## Sexta entrega: resumen de operación

- `/resumen`: cartera actual, conteo de remisiones pendientes, referencias con alerta, últimas cinco remisiones y clientes prioritarios para seguimiento. Accesos a pedidos, inventario, cartera y remisiones.
- ADMIN ve además ventas del mes actual en Colombia, obtenidas de la RPC financiera. VENDEDOR no ejecuta esa consulta ni ve el indicador financiero.
- Los conteos vienen del servidor. La cartera recorre todas las páginas visibles antes de sumar saldos, incluidos clientes inactivos con deuda; no presenta totales parciales como completos.
- Alertas ROJO/AMARILLO según la vista del backend, sin recalcular umbrales. No se interpreta el estado de remisión como saldo individual de deuda.
- Errores por bloque, estados vacíos y actualización manual; no modifica datos. Las consultas no constituyen una instantánea transaccional y pueden reflejar operaciones concurrentes.
- Cinco pruebas nuevas cubren roles, enlaces, conteos, paginación de cartera, fallos parciales, vacíos y móvil. Lecturas reales verificadas sin mutaciones de negocio.

## Séptima entrega: PDF y anulación de remisiones

- Detalle de remisión: descargar PDF y abrirlo en otra pestaña para imprimir mediante el visor del navegador. Se consultan de nuevo el estado, todas las líneas, cliente y nombres; no se recalculan importes.
- PDF A4 con paginación, encabezados de tabla repetidos, totales del backend, fecha de Colombia, identificador y estado en todas las páginas. Las anuladas se identifican explícitamente. No es una factura electrónica ni comprobante de pago. Los datos descriptivos son los actuales, porque el contrato no ofrece una copia histórica.
- Generación local en el navegador con carga diferida de jsPDF/AutoTable. No sube archivos ni actualiza `pdf_url`; la conexión documental con OneDrive sigue pendiente.
- Anulación visible solo para ADMIN y remisiones no anuladas. Consulta previa, confirmación escribiendo consecutivo, bloqueo de doble clic y llamada exclusiva a `anular_remision`.
- Se confirma el estado con una lectura posterior. Un fallo posterior no reenvía la anulación. La marca de envío incierto sobrevive al cierre del panel y recarga de la misma pestaña; se consulta el estado antes de habilitar otro intento.
- **Pendiente backend antes de producción:** la definición local de `anular_remision` es SECURITY DEFINER y no valida ADMIN en su cuerpo. El permiso EXECUTE para authenticated no distingue roles. `backend-patches/anular-remision-admin.sql` contiene una propuesta de corrección (ADMIN activo, control de NULL y permisos), NO aplicada a la base. El frontend no reemplaza esta autorización.
- Los triggers de reversión se mencionan pero no se implementan en el repositorio backend revisado. Verificar en un entorno de pruebas stock, kardex, cartera y remisiones con abonos asociados/generales antes de usar anulación en producción. Anular no representa devolver dinero.
- Ocho pruebas nuevas con respuestas simuladas: confirmación, payload, doble clic, rechazo, respuesta incierta, fallo de recarga, vendedor, PDF fresco/anulado/multipágina, ausencia de líneas e impresión. PDFs de prueba revisados visualmente y por extracción de texto. Ninguna anulación real ejecutada.

## Octava entrega: administración de clientes y precios especiales

- ADMIN: crear clientes desde cartera y administrarlos desde su historial. Nombre, contacto, teléfono, dirección, tipo y actividad. Desactivación conserva historial y saldo; no hay borrado de clientes ni edición de saldo/mora en estos formularios.
- Revisar antes de guardar; payload estricto de campos comerciales. Se comprueba la sesión y el perfil ADMIN activo antes de las escrituras; RLS sigue siendo la autorización efectiva del servidor.
- Crear, editar y quitar precios especiales por producto/cliente. Precios de 0 a 9.999.999.999,99 COP, máximo dos decimales. Quitar un acuerdo restablece la resolución por precio base en ventas futuras. No altera remisiones anteriores.
- El listado de acuerdos recorre páginas del servidor; las actualizaciones/eliminaciones filtran por cliente, identificador y precio anterior para detectar cambios concurrentes. La restricción UNIQUE del backend impide dos acuerdos por producto/cliente.
- Bloqueo de doble clic y marca de envío incierto por usuario en sessionStorage; comprobar el resultado antes de habilitar otro intento. La creación usa un UUID generado antes de enviar para poder consultar ese registro tras perder la respuesta.
- Ocho pruebas nuevas cubren payload comercial, creación, edición/desactivación, precio cero, precisión, eliminación confirmada, rol vendedor, rechazo, respuesta incierta y móvil. Todas las escrituras de prueba son simuladas.

## Novena entrega: identidad visual y subtotal del pedido

- Identidad azul y acuática basada en la referencia: logo original, navegación, resumen, tarjetas y acceso adaptados a escritorio y móvil.
- Alertas con rojo, amarillo y verde de mayor contraste, etiquetas e iconos; estados de remisión diferenciados.
- Subtotal estimado sin IVA antes de confirmar, con precio por línea, tarifa tienda/distribuidor y prioridad del precio especial (incluido cero). Cantidades decimales y redondeo monetario por línea. Si los acuerdos no se pueden verificar, se bloquea la confirmación y se ofrece reintento.
- La vista previa es informativa: el backend sigue resolviendo los importes al ejecutar crear_remision. El payload no incorpora precios ni totales calculados por el cliente.
- PDF con logo original y nombre Distribuciones Ariza, cabecera de marca y encabezado de continuidad. Conserva estado, cifras originales y paginación. Sigue identificado como remisión comercial, no factura electrónica. No se agregan datos fiscales ni de contacto del emisor no proporcionados.

## Décima entrega: administración de productos e imágenes

- Acceso ADMIN desde Catálogo e Inventario → Administrar productos. Listado con búsqueda, filtro de activos/inactivos y paginación; lectura completa por páginas del servidor con conteo verificado.
- Crear y editar SKU, nombre, categoría, origen, precios tienda/distribuidor, IVA (0, 5, 19), stock mínimo y actividad. Precios y umbrales no negativos, máximo dos decimales y límite NUMERIC(12,2). Desactivar conserva historial; no hay eliminación física. El alta usa el stock cero predeterminado por la base; las ediciones no envían stock_actual.
- Revisión y confirmación antes de guardar, validación de administrador activo y políticas RLS como autoridad. La edición compara los campos comerciales originales para detectar modificaciones concurrentes sin impedir movimientos de stock.
- Después del alta se puede cargar o reemplazar la foto con vista previa. JPG/PNG/WebP, hasta 5 MB, 8000 px por lado y 25 megapíxeles; se valida tipo, firma y decodificación. URLs firmadas del bucket privado productos-imagenes.
- Cada foto recibe una ruta única productos/<UUID>/<UUID>.<ext>; primero se sube y luego se asocia condicionalmente sobre la ruta anterior. No se sobrescribe ni elimina la foto anterior. Como Storage y Postgres no forman una transacción, una asociación fallida puede dejar un objeto sin usar; su limpieza requiere un proceso de mantenimiento posterior que verifique referencias antes de borrar.
- Las respuestas inciertas bloquean otro envío, persisten en sessionStorage por usuario y producto, y ofrecen consultar el resultado. Las pruebas de escritura y Storage usan respuestas simuladas, sin crear productos ni subir fotos a la base real. La verificación final de permisos y subida real queda para una base de pruebas configurada con el bucket privado.
- Doce pruebas nuevas cubren altas, edición/desactivación, errores de SKU y permisos, paginación incompleta, precisión, imágenes inválidas/grandes, acceso vendedor, recuperación de respuestas inciertas, asociación fallida, foto visible en catálogo y adaptación móvil.
