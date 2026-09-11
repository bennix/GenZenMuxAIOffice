import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Message, PlanStep, Role } from '../types'

const uid = () => Math.random().toString(36).slice(2, 10)

interface ChatState {
  messages: Message[]
  plans: PlanStep[]
  busy: Record<string, boolean> // per-project agent running flag
  addMessage: (
    projectId: string,
    role: Role,
    content: string,
    metadata?: Message['metadata'],
  ) => Message
  messagesFor: (projectId: string) => Message[]
  setPlan: (projectId: string, labels: string[]) => void
  updateStep: (id: string, status: PlanStep['status']) => void
  plansFor: (projectId: string) => PlanStep[]
  setBusy: (projectId: string, v: boolean) => void
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      plans: [],
      busy: {},
      addMessage: (projectId, role, content, metadata) => {
        const msg: Message = { id: uid(), projectId, role, content, metadata }
        set((s) => ({ messages: [...s.messages, msg] }))
        return msg
      },
      messagesFor: (projectId) => get().messages.filter((m) => m.projectId === projectId),
      setPlan: (projectId, labels) =>
        set((s) => ({
          plans: [
            ...s.plans.filter((p) => p.projectId !== projectId),
            ...labels.map((label) => ({ id: uid(), projectId, label, status: 'pending' as const })),
          ],
        })),
      updateStep: (id, status) =>
        set((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, status } : p)) })),
      plansFor: (projectId) => get().plans.filter((p) => p.projectId === projectId),
      setBusy: (projectId, v) => set((s) => ({ busy: { ...s.busy, [projectId]: v } })),
    }),
    {
      name: 'zenoffice_loveart_chat',
      partialize: (s) => ({ messages: s.messages, plans: s.plans }),
    },
  ),
)
