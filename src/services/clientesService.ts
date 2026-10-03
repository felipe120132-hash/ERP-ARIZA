import { z } from 'zod';
import { supabase } from './supabaseClient';
import { parsearErrorSupabase, type ServiceResponse } from './errorHandler';
import { clienteSchema, type Cliente } from '../types/schemas';

export const clientesService = {
  /**
   * Obtiene la lista completa de clientes/tiendas ordenados por nombre.
   */
  async listarClientes(): Promise<ServiceResponse<Cliente[]>> {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre_tienda');

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(clienteSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en clientes: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Obtiene únicamente los clientes que se encuentran en estado de mora (en_mora = true).
   */
  async listarClientesEnMora(): Promise<ServiceResponse<Cliente[]>> {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('en_mora', true)
        .order('nombre_tienda');

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(clienteSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en clientes en mora: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Obtiene un cliente por su ID.
   */
  async obtenerClientePorId(id: string): Promise<ServiceResponse<Cliente>> {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = clienteSchema.safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en cliente: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },
};
