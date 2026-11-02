/* eslint-disable @typescript-eslint/no-explicit-any */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** Lê todas as páginas (o Supabase devolve no máximo 1000 linhas por pedido). */
export async function fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>, page = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < page) break
  }
  return out
}

/** Remove caracteres que alterariam a sintaxe de filtros .or() do PostgREST. */
export const cleanTerm = (s: string) => s.replace(/[%,()*\\"']/g, ' ').trim()
