import { db } from '@/lib/supabase'
import type { AppNotification } from '@/lib/domain/types'
import { unwrap } from './core'

export const listNotifications = async (limit = 100) => unwrap(await db.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)) as AppNotification[]
export async function unreadCount(userId: string) {
  const r = await db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)
  return r.count ?? 0
}
export const markRead = async (id: string) => unwrap(await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id))
export const markAllRead = async (userId: string) => unwrap(await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null))

export interface Pref { type: string; in_app: boolean; email: boolean }
export const getPrefs = async (userId: string) => unwrap(await db.from('notification_preferences').select('*').eq('user_id', userId)) as Pref[]
export const setPref = async (userId: string, type: string, in_app: boolean, email: boolean) =>
  unwrap(await db.from('notification_preferences').upsert({ user_id: userId, type, in_app, email }, { onConflict: 'user_id,type' }))
