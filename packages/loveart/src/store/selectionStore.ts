import { create } from 'zustand'

// Canvas marquee selection — which card ids are currently selected. Not persisted.
interface SelectionState {
  ids: string[]
  set: (ids: string[]) => void
  toggle: (id: string) => void
  clear: () => void
  has: (id: string) => boolean
}

export const useSelection = create<SelectionState>((set, get) => ({
  ids: [],
  set: (ids) => set({ ids }),
  toggle: (id) =>
    set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
  clear: () => set({ ids: [] }),
  has: (id) => get().ids.includes(id),
}))
