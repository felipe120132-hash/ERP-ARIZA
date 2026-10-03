import { z } from 'zod';
import { supabase } from './supabaseClient';
import { parsearErrorSupabase, type ServiceResponse } from './errorHandler';
import {
  remisionSchema,
  detalleRemisionSchema,
  type Remision,
  type DetalleRemision,
} from '../types/schemas';
import {
  CrearRemisionInputSchema,
  AnularRemisionInputSchema,
  type CrearRemisionInput,
} from '../types/rpcSchemas';

export interface FiltrosRemisiones {
  cliente_id?: string;
  estado?: 'PENDIENTE' | 'PAGADA' | 'ANULADA';
  tipo_pago?: 'CONTADO' | 'CREDITO';
}

export const remisionesService = {
  /**
   * Crea una remisión completa mediante la función RPC `crear_remision`.
   * Valida estrictamente los parámetros de entrada con `CrearRemisionInputSchema` antes de enviar la petición.
   */
  async crearRemision(input: CrearRemisionInput): Promise<ServiceResponse<string>> {
    try {
      const validation = CrearRemisionInputSchema.safeParse(input);
      if (!validation.success) {
        return {
          data: null,
          error: `Validación de entrada fallida: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      const { data, error } = await supabase.rpc('crear_remision', validation.data);

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      if (!data || typeof data !== 'string') {
        return {
          data: null,
          error: 'La función RPC no retornó un identificador de remisión válido.',
        };
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Anula una remisión mediante la función RPC `anular_remision`.
   * Valida el ID con `AnularRemisionInputSchema` antes de invocar la RPC.
   */
  async anularRemision(remisionId: string): Promise<ServiceResponse<boolean>> {
    try {
      const validation = AnularRemisionInputSchema.safeParse({ p_remision_id: remisionId });
      if (!validation.success) {
        return {
          data: null,
          error: `Validación de entrada fallida: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      const { error } = await supabase.rpc('anular_remision', validation.data);

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      return { data: true, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Lista remisiones con filtros opcionales (cliente, estado, tipo de pago).
   */
  async listarRemisiones(
    filtros?: FiltrosRemisiones,
  ): Promise<ServiceResponse<Remision[]>> {
    try {
      let query = supabase
        .from('remisiones')
        .select('*')
        .order('created_at', { ascending: false });

      if (filtros?.cliente_id) {
        query = query.eq('cliente_id', filtros.cliente_id);
      }
      if (filtros?.estado) {
        query = query.eq('estado', filtros.estado);
      }
      if (filtros?.tipo_pago) {
        query = query.eq('tipo_pago', filtros.tipo_pago);
      }

      const { data, error } = await query;

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(remisionSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en remisiones: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Obtiene una remisión por su ID.
   */
  async obtenerRemisionPorId(id: string): Promise<ServiceResponse<Remision>> {
    try {
      const { data, error } = await supabase
        .from('remisiones')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = remisionSchema.safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en remisión: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Obtiene los detalles/líneas de una remisión específica.
   */
  async obtenerDetallesRemision(
    remisionId: string,
  ): Promise<ServiceResponse<DetalleRemision[]>> {
    try {
      const { data, error } = await supabase
        .from('detalles_remision')
        .select('*')
        .eq('remision_id', remisionId);

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(detalleRemisionSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en detalles de remisión: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Actualiza únicamente la columna pdf_url de una remisión existente.
   * Usa la RPC `actualizar_pdf_remision` (SECURITY DEFINER) para que
   * VENDEDORes puedan hacerlo sin necesitar permisos de UPDATE general.
   *
   * @param remisionId  UUID de la remisión a actualizar.
   * @param url         URL de descarga directa del PDF en OneDrive.
   */
  async actualizarPdfUrl(
    remisionId: string,
    url: string,
  ): Promise<ServiceResponse<boolean>> {
    try {
      if (!remisionId || typeof remisionId !== 'string') {
        return { data: null, error: 'El ID de remisión es requerido.' };
      }
      if (!url || typeof url !== 'string' || url.trim() === '') {
        return { data: null, error: 'La URL del PDF no puede estar vacía.' };
      }

      const { error } = await supabase.rpc('actualizar_pdf_remision', {
        p_remision_id: remisionId,
        p_pdf_url:     url.trim(),
      });

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      return { data: true, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },
};
