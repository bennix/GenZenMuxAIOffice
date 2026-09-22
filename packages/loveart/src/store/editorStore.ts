import { create } from 'zustand'

// Tracks which card (if any) is open in the image editor modal. Not persisted.
interface EditorState {
  cardId: string | null
  open: (cardId: string) => void
  close: () => void
}

export const useEditor = create<EditorState>((set) => ({
  cardId: null,
  open: (cardId) => set({ cardId }),
  close: () => set({ cardId: null }),
}))
