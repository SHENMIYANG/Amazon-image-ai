let clientPromise = null

export function isPersistenceEnabled() {
  return Boolean(String(process.env.DATABASE_URL || '').trim())
}

export async function getDatabaseClient() {
  if (!isPersistenceEnabled()) return null

  if (!clientPromise) {
    clientPromise = import('@prisma/client').then(({ PrismaClient }) => new PrismaClient())
  }

  return clientPromise
}

export async function disconnectDatabaseClient() {
  if (!clientPromise) return

  const client = await clientPromise
  await client.$disconnect()
  clientPromise = null
}
