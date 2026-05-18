import { prisma } from '@/lib/prisma'
import { getOpenAI } from '@/lib/openai/client'
import type { UploadedFile } from '@prisma/client'

/** Uploaded files are removed from our DB and OpenAI after this age. */
export const FILE_RETENTION_MS = 60 * 60 * 1000

export function fileRetentionCutoff(): Date {
  return new Date(Date.now() - FILE_RETENTION_MS)
}

export async function deleteUploadedFileRecord(file: Pick<UploadedFile, 'id' | 'openaiFileId'>) {
  if (file.openaiFileId) {
    try {
      const openai = getOpenAI()
      await openai.files.del(file.openaiFileId)
    } catch (err) {
      console.warn('[files] OpenAI delete failed:', file.openaiFileId, (err as Error).message)
    }
  }

  await prisma.uploadedFile.delete({ where: { id: file.id } })
}

const PURGE_BATCH_SIZE = 50
let purgeInFlight: Promise<{ deleted: number }> | null = null

/** Delete uploads older than FILE_RETENTION_MS from OpenAI and the database. */
export async function purgeExpiredUploads(): Promise<{ deleted: number }> {
  if (purgeInFlight) return purgeInFlight

  purgeInFlight = (async () => {
    const cutoff = fileRetentionCutoff()
    const expired = await prisma.uploadedFile.findMany({
      where: { createdAt: { lt: cutoff } },
      take: PURGE_BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    })

    for (const file of expired) {
      try {
        await deleteUploadedFileRecord(file)
      } catch (err) {
        console.error('[files] purge failed for', file.id, err)
      }
    }

    if (expired.length > 0) {
      console.info(`[files] purged ${expired.length} expired upload(s)`)
    }

    return { deleted: expired.length }
  })().finally(() => {
    purgeInFlight = null
  })

  return purgeInFlight
}

/** Fire-and-forget purge for request handlers (never throws to caller). */
export function schedulePurgeExpiredUploads() {
  void purgeExpiredUploads().catch((err) => {
    console.error('[files] scheduled purge error:', err)
  })
}
