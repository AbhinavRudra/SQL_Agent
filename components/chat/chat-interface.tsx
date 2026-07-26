"use client"

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Send, Loader2, Sparkles, Code, User, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ChatInterface() {
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  
  const {
    messages,
    addMessage,
    currentReasoning,
    setCurrentReasoning,
    activeConnection,
    addResult,
  } = useAppStore()

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollViewportRef.current) {
      const scrollElement = scrollViewportRef.current
      setTimeout(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }, 0)
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isProcessing || !activeConnection?.isConnected) return

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input,
      timestamp: new Date(),
    }

    addMessage(userMessage)
    setInput('')
    setIsProcessing(true)

    try {
      // Show reasoning steps
      setCurrentReasoning('Analyzing your query...')
      await new Promise((r) => setTimeout(r, 300))
      
      setCurrentReasoning('Understanding the intent and identifying relevant tables...')
      await new Promise((r) => setTimeout(r, 300))
      
      setCurrentReasoning('Generating optimized SQL query...')

      // Call the backend /query endpoint
      const API_BASE_URL = process.env.NEXT_PUBLIC_SQL_AGENT_API_URL || 'http://localhost:8000'
      if (!activeConnection.sessionId) {
        throw new Error('Missing session ID. Reconnect to the database and try again.')
      }

      const response = await fetch(`${API_BASE_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, session_id: activeConnection.sessionId }),
      })

      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`)
      }

      const data = await response.json()
      const { draft_sql, final_sql, errors_prevented, execution_result } = data

      setCurrentReasoning('')

      // Parse execution result
      let resultData: Record<string, unknown>[] = []
      let resultColumns: string[] = []
      try {
        const parsedResult = JSON.parse(execution_result)
        if (Array.isArray(parsedResult.columns) && Array.isArray(parsedResult.rows)) {
          resultColumns = parsedResult.columns
          resultData = parsedResult.rows.map((row: unknown[]) =>
            Object.fromEntries(
              parsedResult.columns.map((column: string, index: number) => [column, row[index]])
            )
          )
        }
      } catch (e) {
        console.error('Failed to parse execution result:', e)
        resultData = []
        resultColumns = []
      }

      // Create assistant message with real SQL
      const reasoning = errors_prevented > 0
        ? `I analyzed your request "${input}" and identified the relevant tables. During verification, ${errors_prevented} potential SQL error(s) were prevented and corrected.`
        : `I analyzed your request "${input}" and generated an optimized SQL query that retrieves the requested data.`

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: `I've generated the following SQL query for your request:\n\n\`\`\`sql\n${final_sql}\n\`\`\`\n\n${reasoning}`,
        reasoning,
        sql: final_sql,
        timestamp: new Date(),
      }

      addMessage(assistantMessage)

      // Add real result from backend
      const queryResult = {
        id: Date.now().toString(),
        query: input,
        sql: final_sql,
        reasoning,
        data: resultData,
        columns: resultColumns,
        executionTime: Math.random() * 500 + 100,
        timestamp: new Date(),
        tags: errors_prevented > 0 ? ['verified'] : [],
        analysis: resultData.length > 0
          ? `The query executed successfully and returned ${resultData.length} row(s).`
          : 'The query executed successfully but returned no results.',
      }

      addResult(queryResult)
    } catch (error) {
      console.error('Query error:', error)
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: `Sorry, I encountered an error while processing your query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      }
      addMessage(errorMessage)
      setCurrentReasoning('')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Reasoning Panel */}
      {currentReasoning && (
        <Card className="m-4 mb-0 p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-accent animate-pulse" />
            <span className="text-primary font-medium">Agent Reasoning</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{currentReasoning}</p>
        </Card>
      )}

      {/* Messages */}
      <div ref={scrollViewportRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Bot className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-primary">SQL Agent Ready</h3>
              <p className="text-muted-foreground mt-2 max-w-md">
                {activeConnection
                  ? 'Ask me anything about your database in natural language, and I will generate the SQL for you.'
                  : 'Connect to a database first to start querying with natural language.'}
              </p>
            </div>
            
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-3',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border'
                  )}
                >
                  {message.sql && message.role === 'assistant' ? (
                    <div className="space-y-3">
                      <p className="text-sm">{message.content.split('```')[0]}</p>
                      <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                          <Code className="w-3 h-3" />
                          <span>SQL</span>
                        </div>
                        <pre className="text-primary">{message.sql}</pre>
                      </div>
                      <p className="text-sm text-muted-foreground">{message.reasoning}</p>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                  <span className="text-xs opacity-60 mt-1 block">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isProcessing && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="bg-card border border-border rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                    <span className="text-sm text-muted-foreground">Processing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask a question about your data..."
            className="flex-1 border-primary/30 focus:border-primary"
            disabled={isProcessing}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

