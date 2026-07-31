export const TASK_EVIDENCE_BUCKET = 'task-evidence'

export const uploadLimits = {
  avatar: 1 * 1024 * 1024,
  evidence: 10 * 1024 * 1024,
  chatAttachment: 5 * 1024 * 1024,
} as const

const evidenceMimeByExtension: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export const taskEvidenceAccept = Object.keys(evidenceMimeByExtension).map((extension) => `.${extension}`).join(',')

function extensionFrom(fileName: string) { return fileName.split('.').pop()?.toLowerCase() ?? '' }

export function sanitizeStorageFileName(fileName: string) {
  const extension = extensionFrom(fileName).replace(/[^a-z0-9]/g, '')
  const baseName = fileName.slice(0, Math.max(0, fileName.length - (extension ? extension.length + 1 : 0)))
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '').slice(0, 100) || 'file'
  return extension ? `${baseName}.${extension}` : baseName
}

export function validateTaskEvidence(file: File) {
  if (file.size <= 0) throw new Error('Choose a non-empty evidence file.')
  if (file.size > uploadLimits.evidence) throw new Error('The maximum evidence file size is 10 MB.')
  const extension = extensionFrom(file.name)
  const mimeType = evidenceMimeByExtension[extension]
  if (!mimeType) throw new Error('This evidence type is not allowed. Upload a PDF, image, text, CSV, Word, or Excel file.')
  if (file.type && file.type !== mimeType && !(extension === 'csv' && file.type === 'application/vnd.ms-excel')) throw new Error('The selected file type does not match its extension.')
  return { mimeType, safeName: sanitizeStorageFileName(file.name) }
}

export function createTaskEvidencePath(organizationId: string, projectId: string, taskId: string, safeName: string) {
  return `${organizationId}/${projectId}/${taskId}/${crypto.randomUUID()}-${safeName}`
}

export function storageErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'The storage request failed.'
}
