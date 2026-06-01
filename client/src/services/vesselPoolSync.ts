import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { apiFetch } from './api.js'

const API_BASE = '/api/auth/vessel-pool'

function isNewer(timeA: string | Date, timeB: string | Date): boolean {
  return new Date(timeA).getTime() > new Date(timeB).getTime()
}

export async function syncVesselPool(): Promise<void> {
  if (!navigator.onLine || !getActiveMasterKey() || !localStorage.getItem('active_userid')) return

  await pushVesselPool()
  await pullVesselPool()
}

async function pushVesselPool(): Promise<void> {
  const pending = (await db.userSyncQueue.toArray()).filter((item) => item.type === 'vessel')
  if (pending.length === 0) return

  try {
    const response = await apiFetch(`${API_BASE}/push`, {
      method: 'POST',
      body: JSON.stringify({ items: pending })
    })
    if (!response.ok) {
      console.warn('Vessel pool push rejected')
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
    console.warn('Vessel pool push failed:', err)
  }
}

async function pullVesselPool(): Promise<void> {
  try {
    const response = await apiFetch(API_BASE, { method: 'GET' })
    if (!response.ok) return

    const { vessels } = await response.json()
    if (!Array.isArray(vessels)) return

    const serverMap = new Map<string, (typeof vessels)[0]>()
    for (const v of vessels) {
      serverMap.set(v.payloadId, v)
      const local = await db.vesselPool.get(v.payloadId)
      if (!local || isNewer(v.updatedAt, local.updatedAt)) {
        await db.vesselPool.put({
          payloadId: v.payloadId,
          encryptedData: v.encryptedData,
          iv: v.iv,
          tag: v.tag,
          updatedAt: v.updatedAt
        })
      }
    }

    const localAll = await db.vesselPool.toArray()
    for (const local of localAll) {
      if (!serverMap.has(local.payloadId)) {
        const pendingCreate = await db.userSyncQueue
          .where({ payloadId: local.payloadId, action: 'create' })
          .first()
        if (!pendingCreate) {
          await db.vesselPool.delete(local.payloadId)
        }
      }
    }
  } catch (err) {
    console.warn('Vessel pool pull failed:', err)
  }
}
