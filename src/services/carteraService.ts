import { z } from 'zod';
import { supabase } from './supabaseClient';
import { parsearErrorSupabase, type ServiceResponse } from './errorHandler';
import { abonoCarteraSchema, type AbonoCartera } from '../types/schemas';
import {
  RegistrarAbonoInputSchema,
  type RegistrarAbonoInput,
} from '../types/rpcSchemas';

export interface FiltrosAbonos {
  cliente_id?: string;
  remision_id?: string;
}

export const carteraService = {
  /**
   * Registra un abono a la cartera de un cliente mediante la función RPC `registrar_abono`.
   * Valida la estructura y rangos de datos con `RegistrarAbonoInputSchema`.
   */
  async registrarAbono(input: RegistrarAbonoInput): Promise<ServiceResponse<string>> {
    try {
      const validation = RegistrarAbonoInputSchema.safeParse(input);
      if (!validation.success) {
        return {
          data: null,
          error: `Validación de entrada fallida: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      const { data, error } = await supabase.rpc('registrar_abono', validation.data);

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      if (!data || typeof data !== 'string') {
        return {
          data: null,
          error: 'La función RPC no retornó un identificador de abono válido.',
        };
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Lista el histórico de abonos con filtros opcionales (cliente o remisión).
   */
  async listarAbonos(
    filtros?: FiltrosAbonos,
  ): Promise<ServiceResponse<AbonoCartera[]>> {
    try {
      let query = supabase
        .from('abonos_cartera')
        .select('*')
        .order('fecha', { ascending: false });

      if (filtros?.cliente_id) {
        query = query.eq('cliente_id', filtros.cliente_id);
      }
      if (filtros?.remision_id) {
        query = query.eq('remision_id', filtros.remision_id);
      }

      const { data, error } = await query;

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(abonoCarteraSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en abonos: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },
};
