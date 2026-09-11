import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Card, CanvasEdge, CanvasViewport, HumanScene } from '../types'
import { useSettings } from './settingsStore'

const uid = () => Math.random().toString(36).slice(2, 10)

interface CanvasState {
  cards: Card[]
  edges: CanvasEdge[]
  humanScenes: HumanScene[]
  viewports: Record<string, CanvasViewport>
  addCard: (c: Omit<Card, 'id'>) => string
  updateCard: (id: string, patch: Partial<Card>) => void
  removeCard: (id: string) => void
  duplicateCard: (id: string) => void
  cardsFor: (projectId: string) => Card[]
  addEdge: (edge: Omit<CanvasEdge, 'id'>) => string
  updateEdge: (id: string, patch: Partial<CanvasEdge>) => void
  removeEdge: (id: string) => void
  edgesFor: (projectId: string) => CanvasEdge[]
  addHumanScene: (scene: Omit<HumanScene, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateHumanScene: (id: string, patch: Partial<Omit<HumanScene, 'id' | 'createdAt'>>) => void
  removeHumanScene: (id: string) => void
  duplicateHumanScene: (id: string) => string
  humanScenesFor: (projectId: string) => HumanScene[]
  createBranchDraft: (sourceCardId: string, target: { x: number; y: number }) => string
  attachEdgeTarget: (edgeId: string, targetCardId: string) => void
  setViewport: (projectId: string, v: CanvasViewport) => void
  // Simple flow layout: next free slot near canvas center for a project.
  nextSlot: (projectId: string, w: number, h: number) => { x: number; y: number }
}

export const useCanvas = create<CanvasState>()(
  persist(
    (set, get) => ({
      cards: [],
      edges: [],
      humanScenes: [],
      viewports: {},
      addCard: (c) => {
        const id = uid()
        set((s) => ({ cards: [...s.cards, { ...c, id }] }))
        return id
      },
      updateCard: (id, patch) =>
        set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCard: (id) =>
        set((s) => ({
          cards: s.cards.filter((c) => c.id !== id),
          edges: (s.edges ?? [])
            .filter((edge) => edge.sourceCardId !== id)
            .map((edge) =>
              edge.targetCardId === id
                ? { ...edge, targetCardId: undefined, status: 'draft' }
                : edge,
            ),
        })),
      duplicateCard: (id) =>
        set((s) => {
          const src = s.cards.find((c) => c.id === id)
          if (!src) return s
          return { cards: [...s.cards, { ...src, id: uid(), x: src.x + 24, y: src.y + 24 }] }
        }),
      cardsFor: (projectId) => get().cards.filter((c) => c.projectId === projectId),
      addEdge: (edge) => {
        const id = uid()
        set((s) => ({ edges: [...(s.edges ?? []), { ...edge, id }] }))
        return id
      },
      updateEdge: (id, patch) =>
        set((s) => ({
          edges: (s.edges ?? []).map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)),
        })),
      removeEdge: (id) => set((s) => ({ edges: (s.edges ?? []).filter((edge) => edge.id !== id) })),
      edgesFor: (projectId) => (get().edges ?? []).filter((edge) => edge.projectId === projectId),
      addHumanScene: (scene) => {
        const id = uid()
        const now = Date.now()
        set((s) => ({
          humanScenes: [...(s.humanScenes ?? []), { ...scene, id, createdAt: now, updatedAt: now }],
        }))
        return id
      },
      updateHumanScene: (id, patch) =>
        set((s) => ({
          humanScenes: (s.humanScenes ?? []).map((scene) =>
            scene.id === id ? { ...scene, ...patch, updatedAt: Date.now() } : scene,
          ),
        })),
      removeHumanScene: (id) =>
        set((s) => ({
          humanScenes: (s.humanScenes ?? []).filter((scene) => scene.id !== id),
          cards: s.cards.map((card) =>
            card.humanSceneId === id ? { ...card, humanSceneId: undefined } : card,
          ),
          edges: (s.edges ?? []).map((edge) =>
            edge.humanSceneId === id
              ? { ...edge, humanSceneId: null, useHumanSceneReference: false }
              : edge,
          ),
        })),
      duplicateHumanScene: (id) => {
        const source = get().humanScenes.find((scene) => scene.id === id)
        if (!source) throw new Error(`Cannot duplicate missing human scene: ${id}`)

        const duplicateId = uid()
        const now = Date.now()
        set((s) => ({
          humanScenes: [
            ...(s.humanScenes ?? []),
            {
              ...source,
              id: duplicateId,
              name: `${source.name} copy`,
              people: source.people.map((person) => ({
                ...person,
                joints: { ...person.joints },
              })),
              createdAt: now,
              updatedAt: now,
            },
          ],
        }))
        return duplicateId
      },
      humanScenesFor: (projectId) =>
        (get().humanScenes ?? []).filter((scene) => scene.projectId === projectId),
      createBranchDraft: (sourceCardId, target) => {
        const source = get().cards.find((card) => card.id === sourceCardId)
        if (!source) throw new Error(`Cannot create branch draft for missing card: ${sourceCardId}`)

        return get().addEdge({
          projectId: source.projectId,
          sourceCardId,
          prompt: '',
          outputMode: 'image',
          model: useSettings.getState().defaultModel('image')?.id,
          useSourceAsReference: true,
          sourceAnchor: 'right',
          targetX: target.x,
          targetY: target.y,
          status: 'draft',
        })
      },
      attachEdgeTarget: (edgeId, targetCardId) =>
        set((s) => ({
          edges: (s.edges ?? []).map((edge) =>
            edge.id === edgeId ? { ...edge, targetCardId } : edge,
          ),
        })),
      setViewport: (projectId, v) =>
        set((s) => ({ viewports: { ...s.viewports, [projectId]: v } })),
      nextSlot: (projectId, w, h) => {
        const existing = get().cards.filter((c) => c.projectId === projectId)
        const cols = 3
        const gap = 32
        const i = existing.length
        const col = i % cols
        const row = Math.floor(i / cols)
        return { x: 80 + col * (w + gap), y: 80 + row * (h + gap) }
      },
    }),
    { name: 'zenoffice_loveart_canvas' },
  ),
)
