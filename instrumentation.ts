export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return

  const { purgeExpiredUploads, FILE_RETENTION_MS } = await import('@/lib/file-retention')

  const intervalMs = Math.min(10 * 60 * 1000, FILE_RETENTION_MS / 2)

  const tick = () => {
    void purgeExpiredUploads().catch((err) => {
      console.error('[files] periodic purge error:', err)
    })
  }

  tick()
  setInterval(tick, intervalMs)
}
