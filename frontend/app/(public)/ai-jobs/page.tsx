import { STATIC_MASTERS } from '../../../lib/data/staticMasters'

const MASTER_KEY = 'mst_ai_jobs'

export const revalidate = 3600

async function fetchMasterRows() {
  const backendBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ''

  if (backendBase) {
    try {
      const apiUrl = new URL(`/master/${MASTER_KEY}`, backendBase)
      const response = await fetch(apiUrl.toString(), {
        next: { revalidate: 3600, tags: ['master:mst_ai_jobs'] },
        headers: { Accept: 'application/json' },
      })

      if (response.ok) {
        const payload = await response.json()
        if (Array.isArray(payload?.rows)) {
          return payload.rows as any[]
        }
      }
    } catch (error) {
      // Ignore and fall back to static data defined in the repo
    }
  }

  return (STATIC_MASTERS[MASTER_KEY]?.rows as any[]) || []
}

export default async function AiJobsPage() {
  const rows = await fetchMasterRows()
  return (
    <main style={{ padding: 24 }}>
      <h1>AI Jobs Master</h1>
      <p>Total: {rows.length}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.name}</strong>
            {row.role_summary ? ` — ${row.role_summary}` : ''}
          </li>
        ))}
      </ul>
    </main>
  )
}
