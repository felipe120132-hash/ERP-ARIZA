import { z } from 'zod';
import { supabase } from './supabaseClient';
import { parsearErrorSupabase, type ServiceResponse } from './errorHandler';
import { documentoSchema, type Documento } from '../types/schemas';

export interface FiltrosDocumentos {
  cliente_id?: string;
  remision_id?: string;
  tipo_documento?: Documento['tipo_documento'];
}

export const documentosService = {
  /**
   * Lista los documentos registrados en el sistema con filtros opcionales por cliente, remisión o tipo.
   */
  async listarDocumentos(
    filtros?: FiltrosDocumentos,
  ): Promise<ServiceResponse<Documento[]>> {
    try {
      let query = supabase
        .from('documentos')
        .select('*')
        .order('created_at', { ascending: false });

      if (filtros?.cliente_id) {
        query = query.eq('cliente_id', filtros.cliente_id);
      }
      if (filtros?.remision_id) {
        query = query.eq('remision_id', filtros.remision_id);
      }
      if (filtros?.tipo_documento) {
        query = query.eq('tipo_documento', filtros.tipo_documento);
      }

      const { data, error } = await query;

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(documentoSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en documentos: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Obtiene un documento por su ID.
   */
  async obtenerDocumentoPorId(id: string): Promise<ServiceResponse<Documento>> {
    try {
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = documentoSchema.safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en documento: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },
};
