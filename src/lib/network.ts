import type { Member } from '../types'
export const directMembers = (all: Member[], id: string) => all.filter((m) => m.parentId === id)
export function descendants(all: Member[], root: string): Member[] {
  const result: Member[] = []; const seen = new Set([root]); const queue = [root]
  while (queue.length) { const id = queue.shift()!; for (const child of directMembers(all, id)) { if (!seen.has(child.id)) { seen.add(child.id); result.push(child); queue.push(child.id) } } }
  return result
}
export const confirmed = (m: Member) => ['cadastrado','mobilizador_ativo','meta_alcancada'].includes(m.status)
export function normalizePhone(value: string) { return value.replace(/\D/g, '').replace(/^0+/, '') }
export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  const areaCode = digits.slice(0, 2)
  const number = digits.slice(2)
  if (number.length <= 4) return `(${areaCode}) ${number}`
  const prefixLength = number.length > 8 ? 5 : 4
  return `(${areaCode}) ${number.slice(0, prefixLength)}-${number.slice(prefixLength)}`
}
export function wouldCreateCycle(all: Member[], memberId: string, newParentId: string) { return memberId === newParentId || descendants(all, memberId).some((m) => m.id === newParentId) }
