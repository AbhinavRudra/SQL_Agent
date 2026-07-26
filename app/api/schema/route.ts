import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const liveSchemaPath = path.join(process.cwd(), '_schema', 'schema_extracted_fixed.json')
  const fallbackSchemaPath = path.join(
    process.cwd(),
    'sql_agent',
    'schema',
    'schema_extracted_fixed.json'
  )

  const schemaPath = await fs.promises
    .access(liveSchemaPath)
    .then(() => liveSchemaPath)
    .catch(() => fallbackSchemaPath)

  try {
    const data = await fs.promises.readFile(schemaPath, 'utf8')
    return new NextResponse(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Schema file not found' }, { status: 404 })
  }
}
