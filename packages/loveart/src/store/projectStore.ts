import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project } from '../types'

const uid = () => Math.random().toString(36).slice(2, 10)

interface ProjectState {
  projects: Project[]
  createProject: (name: string) => Project
  removeProject: (id: string) => void
  get: (id: string) => Project | undefined
}

export const useProjects = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      createProject: (name) => {
        const project: Project = {
          id: uid(),
          name: name.slice(0, 60) || 'Untitled',
          createdAt: Date.now(),
        }
        set((s) => ({ projects: [project, ...s.projects] }))
        return project
      },
      removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
      get: (id) => get().projects.find((p) => p.id === id),
    }),
    { name: 'zenoffice_loveart_projects' },
  ),
)
