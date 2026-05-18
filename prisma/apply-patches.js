/**
 * Idempotent SQLite patches for production DBs created before file-attachment schema.
 * Prisma db push alone may report "in sync" while legacy NOT NULL columns remain.
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`
  )
  return rows.length > 0
}

async function columnNames(table) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`)
  return new Set(rows.map((r) => r.name))
}

async function migrateUploadedFiles() {
  if (!(await tableExists('uploaded_files'))) return

  const cols = await columnNames('uploaded_files')
  if (cols.has('filename') && cols.has('openai_file_id')) {
    console.log('[migrate] uploaded_files already has plaintext columns')
    return
  }

  console.log('[migrate] rebuilding uploaded_files for file attachment support')
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys=OFF')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE uploaded_files_new (
      id TEXT NOT NULL PRIMARY KEY,
      conversation_id TEXT,
      user_id TEXT NOT NULL,
      filename TEXT,
      openai_file_id TEXT,
      filename_enc TEXT,
      content_enc TEXT,
      sealed_key_b64 TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      created_at DATETIME NOT NULL,
      CONSTRAINT uploaded_files_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)

  await prisma.$executeRawUnsafe(`
    INSERT INTO uploaded_files_new (
      id, conversation_id, user_id, filename_enc, content_enc, sealed_key_b64,
      mime_type, size_bytes, created_at
    )
    SELECT
      id, conversation_id, user_id, filename_enc, content_enc, sealed_key_b64,
      mime_type, size_bytes, created_at
    FROM uploaded_files
  `)

  await prisma.$executeRawUnsafe('DROP TABLE uploaded_files')
  await prisma.$executeRawUnsafe('ALTER TABLE uploaded_files_new RENAME TO uploaded_files')
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS uploaded_files_user_id_idx ON uploaded_files(user_id)'
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS uploaded_files_conversation_id_idx ON uploaded_files(conversation_id)'
  )

  await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON')
  console.log('[migrate] uploaded_files migration done')
}

async function migrateMessages() {
  if (!(await tableExists('messages'))) return

  const cols = await columnNames('messages')
  if (!cols.has('citations_enc')) {
    console.log('[migrate] adding messages.citations_enc')
    await prisma.$executeRawUnsafe('ALTER TABLE messages ADD COLUMN citations_enc TEXT')
  }
  if (!cols.has('citations_sealed_key_b64')) {
    console.log('[migrate] adding messages.citations_sealed_key_b64')
    await prisma.$executeRawUnsafe(
      'ALTER TABLE messages ADD COLUMN citations_sealed_key_b64 TEXT'
    )
  }
}

async function migrateMessageAttachments() {
  if (await tableExists('message_attachments')) {
    console.log('[migrate] message_attachments already exists')
    return
  }

  console.log('[migrate] creating message_attachments')
  await prisma.$executeRawUnsafe(`
    CREATE TABLE message_attachments (
      id TEXT NOT NULL PRIMARY KEY,
      message_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      CONSTRAINT message_attachments_message_id_fkey
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT message_attachments_file_id_fkey
        FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX message_attachments_message_id_file_id_key ON message_attachments(message_id, file_id)'
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX message_attachments_message_id_idx ON message_attachments(message_id)'
  )
}

async function main() {
  await migrateUploadedFiles()
  await migrateMessages()
  await migrateMessageAttachments()
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('[migrate] failed:', err)
    prisma.$disconnect().finally(() => process.exit(1))
  })
