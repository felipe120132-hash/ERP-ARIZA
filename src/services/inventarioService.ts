import { z } from 'zod';
import { supabase } from './supabaseClient';
import { parsearErrorSupabase, type ServiceResponse } from './errorHandler';
import {
  MovimientoInventarioInputSchema,
  MovimientoInventarioRespuestaSchema,
  type MovimientoInventarioInput,
  type MovimientoInventarioRespuesta,
} from '../types/rpcSchemas';
import { kardexSchema, type Kardex } from '../types/schemas';

/**
 * Registra una entrada o ajuste de inventario invocando la RPC `registrar_movimiento_inventario`.
 * Valida los datos con `MovimientoInventarioInputSchema` antes del envío y procesa la respuesta
 * con `MovimientoInventarioRespuestaSchema`.
 */
export async function registrarMovimiento(
  input: MovimientoInventarioInput,
): Promise<ServiceResponse<MovimientoInventarioRespuesta>> {
  try {
    const validation = MovimientoInventarioInputSchema.safeParse(input);
    if (!validation.success) {
      return {
        data: null,
        error: `Validación de entrada fallida: ${validation.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ')}`,
      };
    }

    const { data, error } = await supabase.rpc(
      'registrar_movimiento_inventario',
      validation.data,
    );

    if (error) {
      return { data: null, error: parsearErrorSupabase(error) };
    }

    const parseResult = MovimientoInventarioRespuestaSchema.safeParse(data);
    if (!parseResult.success) {
      return {
        data: null,
        error: `Error al procesar la respuesta del servidor: ${parseResult.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ')}`,
      };
    }

    return { data: parseResult.data, error: null };
  } catch (err) {
    return { data: null, error: parsearErrorSupabase(err) };
  }
}

/**
 * Obtiene el historial inmutable de movimientos de kardex de un producto específico,
 * ordenado cronológicamente de forma descendente (el más reciente primero).
 */
export async function listarKardexProducto(
  productoId: string,
): Promise<ServiceResponse<Kardex[]>> {
  try {
    const { data, error } = await supabase
      .from('kardex')
      .select('*')
      .eq('producto_id', productoId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: parsearErrorSupabase(error) };
    }

    const parseResult = z.array(kardexSchema).safeParse(data);
    if (!parseResult.success) {
      return {
        data: null,
        error: `Error de validación en kardex: ${parseResult.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ')}`,
      };
    }

    return { data: parseResult.data, error: null };
  } catch (err) {
    return { data: null, error: parsearErrorSupabase(err) };
  }
}

export const inventarioService = {
  registrarMovimiento,
  listarKardexProducto,
};
