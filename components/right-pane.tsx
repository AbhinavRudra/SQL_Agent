"use client"

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { DatabaseTab } from '@/components/tabs/database-tab'
import { ERDiagramTab } from '@/components/tabs/er-diagram-tab'
import { ResultsTab } from '@/components/tabs/results-tab'
import { AboutTab } from '@/components/tabs/about-tab'
import { Database, GitBranch, Layers, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'database', label: 'Database', icon: Database },
  { id: 'er-diagram', label: 'ER Diagram', icon: GitBranch },
  { id: 'results', label: 'Results', icon: Layers },
  { id: 'about', label: 'About', icon: Users },
] as const

export function RightPane() {
  const { activeTab, setActiveTab, activeConnection } = useAppStore()

  return (
    <div className="h-full flex">
      {/* Vertical Tab Bar */}
      <div className="w-14 bg-primary flex flex-col items-center py-4 gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const isDbTab = tab.id === 'database'
          const isConnected = activeConnection?.isConnected

          return (
            <Button
              key={tab.id}
              variant="ghost"
              size="icon"
              className={cn(
                'w-10 h-10 rounded-lg transition-all',
                isActive
                  ? 'bg-primary-foreground text-primary'
                  : 'text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10',
                isDbTab && !isConnected && 'opacity-50'
              )}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              <Icon className="w-5 h-5" />
              {isDbTab && isConnected && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full" />
              )}
            </Button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 bg-card overflow-hidden">
        {activeTab === 'database' && <DatabaseTab />}
        {activeTab === 'er-diagram' && <ERDiagramTab />}
        {activeTab === 'results' && <ResultsTab />}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}
