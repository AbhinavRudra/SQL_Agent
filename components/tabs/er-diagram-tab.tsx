"use client"

import { useCallback, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeProps,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Database, Key, Link2 } from 'lucide-react'

interface TableNodeData {
  label: string
  columns: { name: string; type: string; primaryKey: boolean }[]
  onTableClick: (tableName: string) => void
}

interface NormalizedTable {
  name: string
  columns: { name: string; type: string; primaryKey: boolean }[]
  foreignKeys: { column: string; references: { table: string; column: string } }[]
}

function normalizeSchemaTables(schema: unknown): NormalizedTable[] {
  if (Array.isArray(schema)) {
    return schema
  }

  if (!schema || typeof schema !== 'object') {
    return []
  }

  const schemaObject = schema as {
    tables?: Record<
      string,
      {
        columns?: Record<string, { type?: string; not_null?: boolean }>
        primary_keys?: string[]
        foreign_keys?: Array<{
          column?: string
          references_table?: string
          references_column?: string
        }>
      }
    >
  }

  return Object.entries(schemaObject.tables ?? {}).map(([name, table]) => {
    const primaryKeys = new Set(table.primary_keys ?? [])

    return {
      name,
      columns: Object.entries(table.columns ?? {}).map(([columnName, columnData]) => ({
        name: columnName,
        type: columnData.type ?? '',
        primaryKey: primaryKeys.has(columnName),
      })),
      foreignKeys: (table.foreign_keys ?? []).map((foreignKey) => ({
        column: foreignKey.column ?? '',
        references: {
          table: foreignKey.references_table ?? '',
          column: foreignKey.references_column ?? '',
        },
      })),
    }
  })
}

function TableNode({ data }: NodeProps<TableNodeData>) {
  return (
    <div
      className="bg-card border-2 border-primary rounded-lg shadow-lg min-w-[200px] cursor-pointer hover:border-accent transition-colors"
      onClick={() => data.onTableClick(data.label)}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-t-md flex items-center gap-2">
        <Database className="w-4 h-4" />
        <span className="font-semibold">{data.label}</span>
      </div>
      <div className="p-2 space-y-1">
        {data.columns.map((col, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/50 text-sm"
          >
            <div className="flex items-center gap-2">
              {col.primaryKey && <Key className="w-3 h-3 text-accent" />}
              <span className={col.primaryKey ? 'font-medium' : ''}>{col.name}</span>
            </div>
            <Badge variant="secondary" className="text-xs font-mono">
              {col.type}
            </Badge>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  )
}

const nodeTypes = { tableNode: TableNode }
export function ERDiagramTab() {
  const { schema, activeConnection, addMessage } = useAppStore()

  const tables = useMemo<NormalizedTable[]>(() => normalizeSchemaTables(schema), [schema])


  const handleTableClick = useCallback(
    (tableName: string) => {
      const query = `Show all records from ${tableName}`
      addMessage({
        id: Date.now().toString(),
        role: 'user',
        content: query,
        timestamp: new Date(),
      })
    },
    [addMessage]
  )

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: Node[] = tables.map((table, i) => ({
      id: table.name,
      type: 'tableNode',
      position: { x: (i % 2) * 350 + 50, y: Math.floor(i / 2) * 300 + 50 },
      data: {
        label: table.name,
        columns: table.columns,
        onTableClick: handleTableClick,
      },
    }))

    const edges: Edge[] = []
    tables.forEach((table) => {
      table.foreignKeys.forEach((fk) => {
        edges.push({
          id: `${table.name}-${fk.references.table}`,
          source: table.name,
          target: fk.references.table,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#E64833', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#E64833',
          },
          label: (
            <div className="flex items-center gap-1 text-xs bg-card px-2 py-1 rounded border">
              <Link2 className="w-3 h-3" />
              {fk.column}
            </div>
          ),
        })
      })
    })

    return { nodes, edges }
  }, [tables, handleTableClick])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  if (!activeConnection?.isConnected) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-primary mb-2">No Database Connected</h3>
          <p className="text-muted-foreground text-sm">
            Connect to a database to view the ER diagram and explore table relationships.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Controls className="!bg-card !border-border !shadow-lg" />
        <Background color="#90AEAD" gap={20} />
      </ReactFlow>
      <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border rounded-lg p-3 text-xs text-muted-foreground">
        <p>Click on a table to auto-generate a query</p>
        <p>Drag to pan, scroll to zoom</p>
      </div>
    </div>
  )
}
