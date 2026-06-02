/** Yield so long tasks can interleave with paint and input handling. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/** Run an async handler over items in batches, yielding between batches. */
export async function forEachInBatches<T>(
  items: T[],
  batchSize: number,
  handler: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return
  const size = Math.max(1, batchSize)

  for (let i = 0; i < items.length; i += size) {
    if (i > 0) await yieldToMain()
    const batch = items.slice(i, i + size)
    for (const item of batch) {
      await handler(item)
    }
  }
}
