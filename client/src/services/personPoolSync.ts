import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { apiFetch } from './api.js'

const API_BASE = '/api/auth/person-pool'

function isNewer(timeA: string | Date, timeB: string | Date): boolean {
  return new Date(timeA).getTime() > new Date(timeB).getTime()
}

export async function syncPersonPool(): Promise<void> {
  if (!navigator.onLine || !getActiveMasterKey() || !localStorage.getItem('active_userid')) return

  await pushPersonPool()
  await pullPersonPool()
}

async function pushPersonPool(): Promise<void> {
  const pending = await db.userSyncQueue.toArray()
  if (pending.length === 0) return

  try {
    const response = await apiFetch(`${API_BASE}/push`, {
      method: 'POST',
      body: JSON.stringify({ items: pending })
    })
    if (!response.ok) {
      console.warn('Person pool push rejected')
      return
    }

    const { results } = await response.json()
    for (let i = 0; i < results.length; i++) {
      const res = results[i]
      const item = pending[i]
      if (!item) continue
      if (res.status === 'success' && item.id !== undefined) {
        await db.userSyncQueue.delete(item.id)
      }
    }
  } catch (err) {
    console.warn('Person pool push failed:', err)
  }
}

async function pullPersonPool(): Promise<void> {
  try {
    const response = await apiFetch(API_BASE, { method: 'GET' })
    if (!response.ok) return

    const { persons } = await response.json()
    if (!Array.isArray(persons)) return

    const serverMap = new Map<string, (typeof persons)[0]>()
    for (const p of persons) {
      serverMap.set(p.payloadId, p)
      const local = await db.personPool.get(p.payloadId)
      if (!local || isNewer(p.updatedAt, local.updatedAt)) {
        await db.personPool.put({
          payloadId: p.payloadId,
          encryptedData: p.encryptedData,
          iv: p.iv,
          tag: p.tag,
          updatedAt: p.updatedAt
        })
      }
    }

    const localAll = await db.personPool.toArray()
    for (const local of localAll) {
      if (!serverMap.has(local.payloadId)) {
        const pendingCreate = await db.userSyncQueue
          .where({ payloadId: local.payloadId, action: 'create' })
          .first()
        if (!pendingCreate) {
          await db.personPool.delete(local.payloadId)
        }
      }
    }
  } catch (err) {
    console.warn('Person pool pull failed:', err)
  }
}
