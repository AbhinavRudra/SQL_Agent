"use client"
import { useState } from 'react'
import { useAppStore, DatabaseConnection } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Database, Plug, Unplug, Trash2, Check, Loader2, Plus, Server } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_BASE_URL = process.env.NEXT_PUBLIC_SQL_AGENT_API_URL ?? 'http://localhost:8000'

type SchemaForeignKey = {
  column: string
  references: { table: string; column: string }
}

type SchemaColumn = {
  name: string
  type: string
  nullable: boolean
  primaryKey: boolean
}

type SchemaTable = {
  name: string
  columns: SchemaColumn[]
  foreignKeys: SchemaForeignKey[]
}

type ConnectDatabaseResponse = {
  status?: string
  message?: string
  schema?: SchemaTable[]
  schema_path?: string
  session_id?: string
}

function buildDatabaseUrl(connection: DatabaseConnection, password: string) {
  const encodedUsername = encodeURIComponent(connection.username)
  const encodedPassword = encodeURIComponent(password)

  if (connection.type === 'sqlite') {
    return `sqlite:///${connection.database}`
  }

  const credentials = encodedPassword
    ? `${encodedUsername}:${encodedPassword}@`
    : `${encodedUsername}@`

  return `${connection.type}://${credentials}${connection.host}:${connection.port}/${connection.database}`
}

export function DatabaseTab() {
  const [showForm, setShowForm] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: '5432',
    database: '',
    username: '',
    password: '',
    type: 'postgresql' as const,
  })

  const {
    connections,
    activeConnection,
    addConnection,
    removeConnection,
    setActiveConnection,
    setSchema,
  } = useAppStore()

  const handleConnect = async (connection: DatabaseConnection) => {
    setIsConnecting(true)
    setConnectionError('')

    try {
      const response = await fetch(`${API_BASE_URL}/connect-db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          db_url: buildDatabaseUrl(connection, formData.password),
        }),
      })

      const data = (await response.json()) as ConnectDatabaseResponse & { detail?: string }

      if (!response.ok || data.status === 'error') {
        throw new Error(data.detail ?? data.message ?? 'Failed to connect to the database')
      }

      const connectedConnection = { ...connection, isConnected: true }
      connectedConnection.sessionId = data.session_id
      addConnection(connectedConnection)
      setActiveConnection(connectedConnection)
      setSchema(data.schema ?? [])

      setShowForm(false)
      setFormData({
        name: '',
        host: '',
        port: '5432',
        database: '',
        username: '',
        password: '',
        type: 'postgresql',
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database connection failed'
      setConnectionError(message)
      return false
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = () => {
    if (activeConnection) {
      const disconnected = { ...activeConnection, isConnected: false }
      addConnection(disconnected)
      setActiveConnection(null)
      setSchema([])
    }
  }

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()

    const newConnection: DatabaseConnection = {
      id: Date.now().toString(),
      name: formData.name || `${formData.type}://${formData.host}:${formData.port}`,
      host: formData.host,
      port: parseInt(formData.port),
      database: formData.database,
      username: formData.username,
      type: formData.type,
      isConnected: false,
      savedAt: new Date(),
    }

    await handleConnect(newConnection)
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Connection Status */}
        <Card className={cn(
          'border-2 transition-colors',
          activeConnection?.isConnected ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' : 'border-muted'
        )}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center',
                activeConnection?.isConnected ? 'bg-green-500' : 'bg-muted'
              )}>
                <Database className={cn(
                  'w-6 h-6',
                  activeConnection?.isConnected ? 'text-white' : 'text-muted-foreground'
                )} />
              </div>
              <div>
                <CardTitle className="text-lg">
                  {activeConnection?.isConnected ? 'Connected' : 'Not Connected'}
                </CardTitle>
                <CardDescription>
                  {activeConnection?.isConnected
                    ? activeConnection.name
                    : 'Connect to a database to start querying'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          {activeConnection?.isConnected && (
            <CardContent className="pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="text-destructive hover:text-destructive"
              >
                <Unplug className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Add New Connection */}
        {!showForm ? (
          <Button
            onClick={() => setShowForm(true)}
            className="w-full bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Connection
          </Button>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New Connection</CardTitle>
            </CardHeader>
            <CardContent>
              {connectionError && (
                <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {connectionError}
                </p>
              )}
              <form onSubmit={handleSubmitForm} className="space-y-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel>Connection Name (optional)</FieldLabel>
                    <Input
                      placeholder="My Database"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Database Type</FieldLabel>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value as 'postgresql' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="postgresql">PostgreSQL</SelectItem>
                        <SelectItem value="mysql">MySQL</SelectItem>
                        <SelectItem value="sqlite">SQLite</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field className="col-span-2">
                      <FieldLabel>Host</FieldLabel>
                      <Input
                        placeholder="localhost"
                        value={formData.host}
                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Port</FieldLabel>
                      <Input
                        placeholder="5432"
                        value={formData.port}
                        onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                        required
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel>Database</FieldLabel>
                    <Input
                      placeholder="my_database"
                      value={formData.database}
                      onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Username</FieldLabel>
                    <Input
                      placeholder="admin"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Password</FieldLabel>
                    <Input
                      type="password"
                      placeholder="********"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                  </Field>
                </FieldGroup>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isConnecting} className="flex-1">
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Plug className="w-4 h-4 mr-2" />
                        Connect
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Saved Connections */}
        {/*
        {connections.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Saved Connections
            </h3>
            {connections.map((conn) => (
              <Card
                key={conn.id}
                className={cn(
                  'cursor-pointer transition-all hover:border-primary/50',
                  activeConnection?.id === conn.id && conn.isConnected && 'border-primary bg-primary/5'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Server className={cn(
                        'w-5 h-5',
                        conn.isConnected ? 'text-green-500' : 'text-muted-foreground'
                      )} />
                      <div>
                        <p className="font-medium text-sm">{conn.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {conn.type} - {conn.host}:{conn.port}/{conn.database}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {conn.isConnected ? (
                        <div className="flex items-center gap-1 text-green-500 text-xs">
                          <Check className="w-3 h-3" />
                          Connected
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleConnect(conn)}
                          disabled={isConnecting}
                        >
                          <Plug className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeConnection(conn.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        */}
      </div>
    </ScrollArea>
  )
}
