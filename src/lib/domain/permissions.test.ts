import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS } from './permissions'

describe('matriz de permissões', () => {
  it('é igual à semeada na base de dados (migração 004)', () => {
    const fromSql: Record<string, string[]> = {}
    for (const f of ['20260101000004_reference_data.sql', '20260101000006_inspections.sql']) {
      const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations', f), 'utf8')
      const start = sql.indexOf('insert into public.role_permissions')
      const block = sql.slice(start, sql.indexOf(';', start))
      for (const m of block.matchAll(/\('([a-z_]+)',\s*'([a-z._]+)'\)/g)) (fromSql[m[1]] ??= []).push(m[2])
    }
    expect(Object.keys(fromSql).sort()).toEqual(Object.keys(ROLE_PERMISSIONS).sort())
    for (const role of Object.keys(fromSql)) expect([...ROLE_PERMISSIONS[role]].sort()).toEqual([...fromSql[role]].sort())
  })
})
