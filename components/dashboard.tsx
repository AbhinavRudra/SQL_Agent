"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { useAppStore } from '@/lib/store'
import { ChatInterface } from '@/components/chat/chat-interface'
import { RightPane } from '@/components/right-pane'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import {
  Database,
  LogOut,
  User,
  Clock,
  Zap,
  ChevronDown,
} from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'

export function Dashboard() {
  const router = useRouter()
  const { isLoading, isAuthenticated, logout } = useAuth()
  const { user, activeConnection, results } = useAppStore()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center animate-pulse">
            <Database className="w-8 h-8 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  // Calculate performance metrics
  const avgExecutionTime = results.length
    ? results.reduce((acc, r) => acc + r.executionTime, 0) / results.length
    : 0

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-primary">SQL Agent</h1>
            <p className="text-xs text-muted-foreground">Natural Language to SQL</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Performance Metrics */}
          <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
            {activeConnection?.isConnected && (
              <>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded-md">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Connected
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Avg: {avgExecutionTime.toFixed(0)}ms</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>{results.length} queries</span>
                </div>
              </>
            )}
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                    {user?.name?.split(' ').map((n) => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:block text-sm font-medium">
                  {user?.name || 'User'}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2">
                <p className="font-medium text-sm">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="w-4 h-4 mr-2" />
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Pane - Chat */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col bg-background">
              <ChatInterface />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Pane - Tabs */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <RightPane />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
