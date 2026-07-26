"use client"

import { useState } from 'react'
import { useAppStore, QueryResult } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Copy,
  Download,
  Clock,
  Database,
  Code,
  Brain,
  BarChart3,
  FileText,
  Tag,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Papa from 'papaparse'

export function ResultsTab() {
  const { results, currentResult, setCurrentResult, addTagToResult, removeTagFromResult } = useAppStore()
  const [tagInput, setTagInput] = useState('')
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set())
  const [filterTag, setFilterTag] = useState<string | null>(null)

  const getTableMaxHeight = (rowCount: number) => {
    const estimatedRowHeight = 44
    const tableChromeHeight = 92
    const minHeight = 140
    const maxHeight = 420

    return `${Math.min(maxHeight, Math.max(minHeight, rowCount * estimatedRowHeight + tableChromeHeight))}px`
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const downloadCSV = (result: QueryResult) => {
    const csv = Papa.unparse(result.data)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-result-${result.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddTag = (resultId: string) => {
    if (tagInput.trim()) {
      addTagToResult(resultId, tagInput.trim())
      setTagInput('')
    }
  }

  const toggleExpanded = (resultId: string) => {
    const newExpanded = new Set(expandedResults)
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId)
    } else {
      newExpanded.add(resultId)
    }
    setExpandedResults(newExpanded)
  }

  const allTags = [...new Set(results.flatMap((r) => r.tags))]
  const filteredResults = filterTag
    ? results.filter((r) => r.tags.includes(filterTag))
    : results

  if (results.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-primary mb-2">No Results Yet</h3>
          <p className="text-muted-foreground text-sm">
            Execute queries using the chat interface to see results here.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Current Result */}
      {currentResult && (
        <div className="flex-none p-4 border-b border-border">
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  Current Result
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(JSON.stringify(currentResult.data))}>
                    <Copy className="w-3 h-3 mr-1" />
                    Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadCSV(currentResult)}>
                    <Download className="w-3 h-3 mr-1" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {currentResult.executionTime.toFixed(0)}ms
                </span>
                <span>{currentResult.data.length} rows</span>
              </div>
              <div
                className="overflow-auto rounded-md"
                style={{ maxHeight: getTableMaxHeight(currentResult.data.length) }}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      {currentResult.columns.map((col) => (
                        <TableHead key={col} className="text-primary font-semibold">
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentResult.data.map((row, i) => (
                      <TableRow key={i}>
                        {currentResult.columns.map((col) => (
                          <TableCell key={col} className="font-mono text-xs">
                            {String(row[col] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tags Filter */}
      {allTags.length > 0 && (
        <div className="flex-none px-4 pt-4 flex items-center gap-2 flex-wrap">
          <Tag className="w-4 h-4 text-muted-foreground" />
          <Button
            size="sm"
            variant={filterTag === null ? 'default' : 'outline'}
            onClick={() => setFilterTag(null)}
            className="text-xs h-6"
          >
            All
          </Button>
          {allTags.map((tag) => (
            <Button
              key={tag}
              size="sm"
              variant={filterTag === tag ? 'default' : 'outline'}
              onClick={() => setFilterTag(tag)}
              className="text-xs h-6"
            >
              {tag}
            </Button>
          ))}
        </div>
      )}

      {/* Results Stack */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Execution History ({filteredResults.length})
          </h3>
          {filteredResults.map((result) => (
            <Card
              key={result.id}
              className={cn(
                'cursor-pointer transition-all',
                currentResult?.id === result.id && 'border-primary'
              )}
              onClick={() => setCurrentResult(result)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate text-primary">
                      {result.query}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {result.executionTime.toFixed(0)}ms
                      </span>
                      <span>{result.data.length} rows</span>
                      <span>{new Date(result.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleExpanded(result.id)
                    }}
                  >
                    {expandedResults.has(result.id) ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Tags */}
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  {result.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeTagFromResult(result.id, tag)
                        }}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag(result.id)}
                      placeholder="Add tag"
                      className="h-6 w-20 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => handleAddTag(result.id)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedResults.has(result.id) && (
                  <div className="mt-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                    <Tabs defaultValue="data" className="w-full">
                      <TabsList className="grid w-full grid-cols-4 h-8">
                        <TabsTrigger value="data" className="text-xs">
                          <Database className="w-3 h-3 mr-1" />
                          Data
                        </TabsTrigger>
                        <TabsTrigger value="sql" className="text-xs">
                          <Code className="w-3 h-3 mr-1" />
                          SQL
                        </TabsTrigger>
                        <TabsTrigger value="reasoning" className="text-xs">
                          <Brain className="w-3 h-3 mr-1" />
                          Reasoning
                        </TabsTrigger>
                        <TabsTrigger value="analysis" className="text-xs">
                          <FileText className="w-3 h-3 mr-1" />
                          Analysis
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="data" className="mt-2">
                        <div
                          className="overflow-auto rounded-md"
                          style={{ maxHeight: getTableMaxHeight(result.data.length) }}
                        >
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {result.columns.map((col) => (
                                  <TableHead key={col}>{col}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.data.map((row, i) => (
                                <TableRow key={i}>
                                  {result.columns.map((col) => (
                                    <TableCell key={col} className="font-mono text-xs">
                                      {String(row[col] ?? '')}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>

                      <TabsContent value="sql" className="mt-2">
                        <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs">
                          <pre className="whitespace-pre-wrap">{result.sql}</pre>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => copyToClipboard(result.sql)}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy SQL
                        </Button>
                      </TabsContent>

                      <TabsContent value="reasoning" className="mt-2">
                        <p className="text-sm text-muted-foreground">{result.reasoning}</p>
                      </TabsContent>

                      <TabsContent value="analysis" className="mt-2">
                        <p className="text-sm text-muted-foreground">
                          {result.analysis || 'No analysis available for this result.'}
                        </p>
                      </TabsContent>
                    </Tabs>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(JSON.stringify(result.data))}>
                        <Copy className="w-3 h-3 mr-1" />
                        Copy Data
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadCSV(result)}>
                        <Download className="w-3 h-3 mr-1" />
                        Download CSV
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
