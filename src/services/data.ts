import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { normalizePhone } from '../lib/network'
import type { Member, Role, SessionUser } from '../types'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

type MemberRow = Record<string, unknown>

export function memberFromRow(row: MemberRow): Member {
  return {
    id: String(row.id),
    nome: String(row.nome),
    telefone: String(row.telefone_normalizado),
    email: row.email ? String(row.email) : undefined,
    bairro: String(row.bairro),
    municipio: String(row.municipio),
    parentId: row.parent_member_id ? String(row.parent_member_id) : undefined,
    status: row.status as Member['status'],
    role: (row.member_role ?? (row.participation_type === 'mobilizador' ? 'mobilizador' : 'participante')) as Role,
    joinedAt: row.joined_at ? String(row.joined_at).slice(0, 10) : String(row.created_at).slice(0, 10),
    lastActivity: String(row.last_activity_at ?? row.updated_at ?? row.created_at).slice(0, 10),
    inviteCode: String(row.invite_code ?? ''),
    registrationStatus: row.registration_status as Member['registrationStatus'],
    linkStatus: row.link_status as Member['linkStatus'],
    source: row.data_source ? String(row.data_source) : undefined,
    contactAuthorized: Boolean(row.contact_authorized),
    needsCandidateMeeting: Boolean(row.needs_candidate_meeting),
    notes: row.internal_notes ? String(row.internal_notes) : undefined,
    estimatedCapacity: row.estimated_capacity == null ? undefined : Number(row.estimated_capacity),
    agreedGoal: row.agreed_goal == null ? undefined : Number(row.agreed_goal),
    goalDeadline: row.goal_deadline ? String(row.goal_deadline) : undefined,
    confidence: row.estimate_confidence as Member['confidence'],
    estimateMethod: row.estimate_method ? String(row.estimate_method) : undefined,
    lastReview: row.last_reviewed_at ? String(row.last_reviewed_at).slice(0, 10) : undefined,
    hasLogin: Boolean(row.profile_id),
    accessUsername: row.access_username ? String(row.access_username) : undefined,
  }
}

export async function loadSessionUser(user: User): Promise<SessionUser> {
  const client = requireClient()
  const { data: profile, error } = await client.from('profiles').select('id,nome,email,role,territory_id,status').eq('auth_user_id', user.id).single()
  if (error || !profile || profile.status === 'bloqueado') throw new Error('Acesso sem perfil ativo.')
  const [{ data: member }, { data: territory }] = await Promise.all([
    client.from('network_members').select('id').eq('profile_id', profile.id).maybeSingle(),
    profile.territory_id ? client.from('territories').select('nome').eq('id', profile.territory_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return {
    id: user.id,
    profileId: profile.id,
    nome: profile.nome,
    email: profile.email ?? user.email ?? '',
    role: profile.role as Role,
    memberId: member?.id ?? '',
    territory: territory?.nome ?? 'Todos',
    mustChangePassword: user.user_metadata?.must_change_password === true,
  }
}

export async function loadMembers(): Promise<Member[]> {
  const { data, error } = await requireClient().from('network_members').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => memberFromRow(row as MemberRow))
}

type NewMember = Omit<Member, 'id'|'joinedAt'|'lastActivity'|'inviteCode'|'hasLogin'>

function memberPayload(input: NewMember) {
  const role = input.role
  return {
    nome: input.nome.trim(), telefone_normalizado: normalizePhone(input.telefone), email: input.email || null,
    municipio: input.municipio.trim(), bairro: input.bairro.trim(), parent_member_id: input.parentId || null,
    status: input.status, participation_type: role === 'mobilizador' ? 'mobilizador' : 'participante', member_role: role,
    registration_status: input.registrationStatus ?? 'pendente_revisao', link_status: input.linkStatus ?? 'nao_informado',
    data_source: input.source || null, contact_authorized: input.contactAuthorized ?? false, internal_notes: input.notes || null,
    needs_candidate_meeting: input.needsCandidateMeeting ?? false,
    estimated_capacity: input.estimatedCapacity || null, agreed_goal: input.agreedGoal || null, goal_deadline: input.goalDeadline || null,
    estimate_confidence: input.confidence || null, estimate_method: input.estimateMethod || null,
  }
}

export async function createMember(input: NewMember): Promise<Member> {
  const payload = memberPayload(input)
  const { data, error } = await requireClient().from('network_members').insert(payload).select('*').single()
  if (error) throw error
  return memberFromRow(data as MemberRow)
}

export async function updateMember(id: string, changes: Record<string, unknown>): Promise<Member> {
  const { data, error } = await requireClient().from('network_members').update(changes).eq('id', id).select('*').single()
  if (error) throw error
  return memberFromRow(data as MemberRow)
}

export async function bulkCreateMembers(items: NewMember[]): Promise<Member[]> {
  if (!items.length) return []
  const { data, error } = await requireClient().from('network_members').insert(items.map(memberPayload)).select('*')
  if (error) throw error
  return (data ?? []).map((row) => memberFromRow(row as MemberRow))
}

export type DuplicateReview = {
  id: string
  memberAId: string
  memberBId: string
  reasons: string[]
  status: 'pendente'|'unificado'|'separados'|'corrigido'|'transferido'
}

export async function loadDuplicateReviews(): Promise<DuplicateReview[]> {
  const { data, error } = await requireClient().from('duplicate_reviews').select('id,member_a_id,member_b_id,match_reasons,status').eq('status','pendente').order('created_at')
  if (error) throw error
  return (data ?? []).map((row) => ({ id:row.id, memberAId:row.member_a_id, memberBId:row.member_b_id, reasons:Array.isArray(row.match_reasons) ? row.match_reasons.map(String) : [], status:row.status }))
}

export async function resolveDuplicateReview(id: string, status: Exclude<DuplicateReview['status'],'pendente'>, profileId: string, notes: string) {
  const { error } = await requireClient().from('duplicate_reviews').update({ status, resolved_by:profileId, resolution_notes:notes, resolved_at:new Date().toISOString() }).eq('id',id)
  if (error) throw error
}

export type ActivityItem = { id:string; type:string; description?:string; occurredAt:string }

export async function loadActivities(memberId: string): Promise<ActivityItem[]> {
  const { data, error } = await requireClient().from('activities').select('id,activity_type,description,occurred_at').eq('member_id',memberId).order('occurred_at',{ ascending:false })
  if (error) throw error
  return (data ?? []).map((row) => ({ id:row.id, type:row.activity_type, description:row.description ?? undefined, occurredAt:row.occurred_at }))
}

export async function createActivity(memberId: string, profileId: string, description: string): Promise<ActivityItem> {
  const { data, error } = await requireClient().from('activities').insert({ member_id:memberId, activity_type:'contato', description, responsible_profile_id:profileId }).select('id,activity_type,description,occurred_at').single()
  if (error) throw error
  return { id:data.id, type:data.activity_type, description:data.description ?? undefined, occurredAt:data.occurred_at }
}

export async function recordExportAudit(count: number, filters: Record<string, string>) {
  const { error } = await requireClient().rpc('record_members_export', { p_count:count, p_filters:filters })
  if (error) throw error
}

export type TeamUser = { id:string; name:string; email?:string; username?:string; role:'administrador'|'cadastrador'; status:string; createdAt:string }

export async function loadTeamUsers(): Promise<TeamUser[]> {
  const { data, error } = await requireClient().from('profiles').select('id,nome,email,username,role,status,created_at').in('role',['administrador','cadastrador']).order('created_at')
  if (error) throw error
  return (data ?? []).map((row) => ({ id:row.id, name:row.nome, email:row.email ?? undefined, username:row.username ?? undefined, role:row.role, status:row.status, createdAt:row.created_at }))
}

export async function createTeamUser(input: {name:string;login:string;role:'administrador'|'cadastrador'}) {
  const { data, error } = await requireClient().functions.invoke('manage-team-users', { body:{ action:'create', ...input } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as {profileId:string;username:string;temporaryPassword:string;role:'administrador'|'cadastrador'}
}

export async function changeTeamUserRole(profileId:string, role:'administrador'|'cadastrador') {
  const { data, error } = await requireClient().functions.invoke('manage-team-users', { body:{ action:'update-role', profileId, role } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function loadOperatingMode(): Promise<'mapeamento'|'mobilizacao'> {
  const { data, error } = await requireClient().from('app_settings').select('value').eq('key', 'operating_mode').single()
  if (error) throw error
  return data.value?.mode === 'mobilizacao' ? 'mobilizacao' : 'mapeamento'
}

export async function saveOperatingMode(mode: 'mapeamento'|'mobilizacao', profileId: string) {
  const { error } = await requireClient().from('app_settings').upsert({ key:'operating_mode', value:{ mode, invitations_enabled: mode === 'mobilizacao' }, updated_by:profileId, updated_at:new Date().toISOString() })
  if (error) throw error
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
}

export async function createCollectionLink(leaderId: string, profileId: string) {
  const client = requireClient()
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = base64Url(tokenBytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2,'0')).join('')
  await client.from('collection_links').update({ active:false, revoked_at:new Date().toISOString() }).eq('leader_member_id',leaderId).eq('active',true)
  const { error } = await client.from('collection_links').insert({ leader_member_id:leaderId, token_hash:tokenHash, created_by:profileId })
  if (error) throw error
  return token
}

export async function submitCollection(token: string, values: Record<string, string|boolean>) {
  const { data, error } = await requireClient().rpc('submit_collection_member', {
    p_token:token, p_nome:values.nome, p_telefone:values.telefone, p_email:values.email,
    p_municipio:values.municipio, p_bairro:values.bairro, p_observacao:values.notes,
    p_contact_authorized:Boolean(values.contactAuthorized),
  })
  if (error) throw error
  return data as string
}

export async function getCollectionContext(token: string): Promise<{leaderId:string;leaderName:string;expiresAt:string}|null> {
  const { data, error } = await requireClient().rpc('get_collection_link_context', { p_token:token })
  if (error) throw error
  const row = data?.[0]
  return row ? { leaderId:row.leader_id, leaderName:row.leader_name, expiresAt:row.expires_at } : null
}
