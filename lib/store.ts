import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  sql?: string
  timestamp: Date
}

export interface QueryResult {
  id: string
  query: string
  sql: string
  reasoning: string
  data: Record<string, unknown>[]
  columns: string[]
  executionTime: number
  timestamp: Date
  tags: string[]
  analysis?: string
}

export interface DatabaseConnection {
  id: string
  sessionId?: string
  name: string
  host: string
  port: number
  database: string
  username: string
  type: 'postgresql' | 'mysql' | 'sqlite'
  isConnected: boolean
  savedAt: Date
}

export interface TableSchema {
  name: string
  columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[]
  foreignKeys: { column: string; references: { table: string; column: string } }[]
}

interface AppState {
  // Auth
  user: { id: string; email: string; name: string } | null
  setUser: (user: { id: string; email: string; name: string } | null) => void

  // Chat
  messages: Message[]
  addMessage: (message: Message) => void
  clearMessages: () => void
  currentReasoning: string
  setCurrentReasoning: (reasoning: string) => void

  // Database
  connections: DatabaseConnection[]
  activeConnection: DatabaseConnection | null
  addConnection: (connection: DatabaseConnection) => void
  removeConnection: (id: string) => void
  setActiveConnection: (connection: DatabaseConnection | null) => void
  schema: TableSchema[]
  setSchema: (schema: TableSchema[]) => void

  // Results
  results: QueryResult[]
  currentResult: QueryResult | null
  addResult: (result: QueryResult) => void
  setCurrentResult: (result: QueryResult | null) => void
  addTagToResult: (resultId: string, tag: string) => void
  removeTagFromResult: (resultId: string, tag: string) => void

  // UI
  activeTab: 'database' | 'er-diagram' | 'results' | 'about'
  setActiveTab: (tab: 'database' | 'er-diagram' | 'results' | 'about') => void

}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      user: null,
      setUser: (user) => set({ user }),

      // Chat
      messages: [],
      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),
      clearMessages: () => set({ messages: [] }),
      currentReasoning: '',
      setCurrentReasoning: (reasoning) => set({ currentReasoning: reasoning }),

      // Database
      connections: [],
      activeConnection: null,
      addConnection: (connection) =>
        set((state) => ({
          connections: [
            ...state.connections.filter((c) => c.id !== connection.id),
            connection,
          ],
        })),
      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeConnection:
            state.activeConnection?.id === id ? null : state.activeConnection,
        })),
      setActiveConnection: (connection) => set({ activeConnection: connection }),
      schema: [],
      setSchema: (schema) => set({ schema }),

      // Results
      results: [],
      currentResult: null,
      addResult: (result) =>
        set((state) => ({
          results: [result, ...state.results].slice(0, 50),
          currentResult: result,
        })),
      setCurrentResult: (result) => set({ currentResult: result }),
      addTagToResult: (resultId, tag) =>
        set((state) => ({
          results: state.results.map((r) =>
            r.id === resultId ? { ...r, tags: [...new Set([...r.tags, tag])] } : r
          ),
        })),
      removeTagFromResult: (resultId, tag) =>
        set((state) => ({
          results: state.results.map((r) =>
            r.id === resultId
              ? { ...r, tags: r.tags.filter((t) => t !== tag) }
              : r
          ),
        })),

      // UI
      activeTab: 'database',
      setActiveTab: (tab) => set({ activeTab: tab }),

    }),
    {
      name: 'sql-agent-storage',
      partialize: (state) => ({
        connections: state.connections,
        results: state.results,
      }),
    }
  )
)
