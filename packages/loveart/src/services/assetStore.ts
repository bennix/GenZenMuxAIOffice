// IndexedDB-backed binary asset store — REQUIREMENTS.md §4.4.
// Generated media often comes back as base64 data: URLs. Storing those in localStorage
// (via Zustand persist) blows the ~5MB quota fast, so we keep binary blobs here and persist
// only a small `assetId` on the card. Cards resolve assetId → object URL at render time.

const DB_NAME = 'zenoffice_loveart_assets'
const STORE = 'assets'

const uid = () => Math.random().toString(36).slice(2, 12)

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function putAsset(blob: Blob): Promise<string> {
  const id = uid()
  await tx('readwrite', (s) => s.put(blob, id))
  return id
}

export function getAsset(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(id))
}

export async function deleteAsset(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

// Normalize a generation result into a card media reference. base64 data: URLs are persisted
// to IndexedDB and referenced by assetId; remote https URLs are stored as-is. Returns BOTH
// fields (one undefined) so callers can overwrite card media cleanly.
export async function storeMedia(src: string): Promise<{ url?: string; assetId?: string }> {
  if (!src.startsWith('data:')) return { url: src, assetId: undefined }
  try {
    const blob = await (await fetch(src)).blob()
    const assetId = await putAsset(blob)
    return { url: undefined, assetId }
  } catch (e) {
    // Degraded fallback: keep the data URL so the asset is at least visible this session.
    console.warn('assetStore: IndexedDB unavailable, falling back to data URL', e)
    return { url: src, assetId: undefined }
  }
}
