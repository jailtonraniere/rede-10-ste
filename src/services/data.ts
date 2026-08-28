import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { normalizePhone } from '../lib/network'
import type { Member, Role, SessionUser } from '../types'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

type MemberRow = Record<string, unknown>
const memberSelect = '*,creator:profiles!network_members_created_by_profile_id_fkey(id,nome,role),access_profile:profiles!network_members_profile_id_fkey(id,nome,telefone,email,municipio,bairro,role,status,deleted_at,username),indicated_by:network_members!network_members_indicated_by_member_id_fkey(id,nome)'

export function memberFromRow(row: MemberRow): Member {
  const relatedCreator = Array.isArray(row.creator) ? row.creator[0] : row.creator
  const creator = relatedCreator && typeof relatedCreator === 'object' ? relatedCreator as MemberRow : undefined
  const relatedAccessProfile = Array.isArray(row.access_profile) ? row.access_profile[0] : row.access_profile
  const accessProfile = relatedAccessProfile && typeof relatedAccessProfile === 'object' ? relatedAccessProfile as MemberRow : undefined
  const relatedIndicatedBy = Array.isArray(row.indicated_by) ? row.indicated_by[0] : row.indicated_by
  const indicatedBy = relatedIndicatedBy && typeof relatedIndicatedBy === 'object' ? relatedIndicatedBy as MemberRow : undefined
  const accessDeleted = Boolean(accessProfile?.deleted_at)
  return {
    id: String(row.id),
    nome: String(row.nome ?? accessProfile?.nome ?? ''),
    telefone: String(row.telefone_normalizado ?? accessProfile?.telefone ?? ''),
    email: row.email ? String(row.email) : accessProfile?.email ? String(accessProfile.email) : undefined,
    bairro: String(row.bairro ?? accessProfile?.bairro ?? ''),
    municipio: String(row.municipio ?? accessProfile?.municipio ?? ''),
    parentId: row.parent_member_id ? String(row.parent_member_id) : undefined,
    indicatedByMemberId: row.indicated_by_member_id ? String(row.indicated_by_member_id) : undefined,
    indicatedByName: indicatedBy?.nome ? String(indicatedBy.nome) : undefined,
    status: row.status as Member['status'],
    role: (row.member_role ?? (row.participation_type === 'mobilizador' ? 'mobilizador' : 'participante')) as Role,
    isTeamMember: Boolean(row.is_team_member),
    recordOrigin: row.record_origin as Member['recordOrigin'],
    joinedAt: row.joined_at ? String(row.joined_at).slice(0, 10) : String(row.created_at).slice(0, 10),
    lastActivity: String(row.last_activity_at ?? row.updated_at ?? row.created_at).slice(0, 10),
    inviteCode: String(row.invite_code ?? ''),
    registrationStatus: row.registration_status as Member['registrationStatus'],
    linkStatus: row.link_status as Member['linkStatus'],
    source: row.data_source ? String(row.data_source) : undefined,
    contactAuthorized: Boolean(row.contact_authorized),
    needsCandidateMeeting: Boolean(row.needs_candidate_meeting),
    notes: row.internal_notes ? String(row.internal_notes) : undefined,
    estimatedVotes: row.estimated_votes == null ? undefined : Number(row.estimated_votes),
    estimatedCapacity: row.estimated_capacity == null ? undefined : Number(row.estimated_capacity),
    agreedGoal: row.agreed_goal == null ? undefined : Number(row.agreed_goal),
    goalDeadline: row.goal_deadline ? String(row.goal_deadline) : undefined,
    confidence: row.estimate_confidence as Member['confidence'],
    estimateMethod: row.estimate_method ? String(row.estimate_method) : undefined,
    lastReview: row.last_reviewed_at ? String(row.last_reviewed_at).slice(0, 10) : undefined,
    hasLogin: Boolean(row.profile_id) && !accessDeleted,
    accessUsername: row.access_username ? String(row.access_username) : accessProfile?.username ? String(accessProfile.username) : undefined,
    accessRole: accessProfile?.role as Role | undefined,
    createdByProfileId: row.created_by_profile_id ? String(row.created_by_profile_id) : undefined,
    createdByName: creator?.nome ? String(creator.nome) : undefined,
    createdByRole: creator?.role as Role | undefined,
  }
}

export async function loadSessionUser(user: User): Promise<SessionUser> {
  const client = requireClient()
  const { data: profile, error } = await client.from('profiles').select('id,nome,email,role,territory_id,status,is_super_admin,deleted_at').eq('auth_user_id', user.id).single()
  if (error || !profile || profile.status === 'bloqueado' || profile.deleted_at) throw new Error('Acesso sem perfil ativo.')
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
    isSuperAdmin: profile.is_super_admin === true,
  }
}

export async function loadMembers(): Promise<Member[]> {
  const { data, error } = await requireClient()
    .from('network_members')
    .select(memberSelect)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => memberFromRow(row as MemberRow))
}

export type MemberInput = Omit<Member, 'id'|'joinedAt'|'lastActivity'|'inviteCode'|'hasLogin'|'collectionCode'|'accessUsername'>

export function memberPayload(input: MemberInput) {
  const role = input.role
  const normalizedPhone = normalizePhone(input.telefone)
  const source = input.source?.toLocaleLowerCase('pt-BR') ?? ''
  const recordOrigin = input.recordOrigin ?? (source.includes('import') ? 'importacao' : source.includes('autocadastro') ? 'autocadastro' : 'base')
  return {
    nome: input.nome.trim(), telefone_normalizado: normalizedPhone || null, email: input.email || null,
    municipio: input.municipio.trim(), bairro: input.bairro.trim(), parent_member_id: input.parentId || null,
    indicated_by_member_id: input.indicatedByMemberId || null,
    status: input.status, participation_type: role === 'mobilizador' ? 'mobilizador' : 'participante', member_role: role,
    is_team_member: input.isTeamMember ?? false, record_origin:recordOrigin,
    registration_status: input.registrationStatus ?? 'pendente_revisao', link_status: input.linkStatus ?? 'nao_informado',
    data_source: input.source || null, contact_authorized: input.contactAuthorized ?? false, internal_notes: input.notes || null,
    needs_candidate_meeting: role === 'lideranca' && (input.needsCandidateMeeting ?? false),
    estimated_votes: input.estimatedVotes ?? null,
    estimated_capacity: input.estimatedCapacity || null,
    agreed_goal: input.agreedGoal || null,
    goal_deadline: input.goalDeadline || null,
    estimate_confidence: input.confidence || null,
    estimate_method: input.estimateMethod || null,
  }
}

export async function createMember(input: MemberInput): Promise<Member> {
  const payload = memberPayload(input)
  const { data, error } = await requireClient().from('network_members').insert(payload).select(memberSelect).single()
  if (error) throw error
  return memberFromRow(data as MemberRow)
}

export async function updateMember(id: string, changes: Record<string, unknown>): Promise<Member> {
  const { data, error } = await requireClient().from('network_members').update(changes).eq('id', id).select(memberSelect).single()
  if (error) throw error
  return memberFromRow(data as MemberRow)
}

export async function updateMemberDetails(id: string, input: MemberInput): Promise<Member> {
  const { data, error } = await requireClient().from('network_members').update(memberPayload(input)).eq('id', id).select(memberSelect).single()
  if (error) throw error
  return memberFromRow(data as MemberRow)
}

export async function deleteMember(id: string): Promise<void> {
  const { data, error } = await requireClient()
    .from('network_members')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Você não tem permissão para excluir este cadastro.')
}

export async function bulkCreateMembers(items: MemberInput[]): Promise<Member[]> {
  if (!items.length) return []
  const { data, error } = await requireClient().from('network_members').insert(items.map(memberPayload)).select(memberSelect)
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

export type TeamUser = { id:string; memberId:string; name:string; email?:string; username?:string; role:Role; memberRole:Role; status:string; createdAt:string; isSuperAdmin:boolean; isTeamMember:boolean }

export async function loadTeamUsers(): Promise<TeamUser[]> {
  const { data, error } = await requireClient().from('network_members').select('id,nome,member_role,is_team_member,profile:profiles!network_members_profile_id_fkey(id,nome,email,username,role,status,created_at,is_super_admin,deleted_at)').not('profile_id','is',null).order('created_at')
  if (error) throw error
  return (data ?? []).flatMap((row) => {
    const related = Array.isArray(row.profile) ? row.profile[0] : row.profile
    if (!related || related.deleted_at) return []
    return [{ id:related.id, memberId:row.id, name:row.nome, email:related.email ?? undefined, username:related.username ?? undefined, role:related.role as Role, memberRole:row.member_role as Role, status:related.status, createdAt:related.created_at, isSuperAdmin:related.is_super_admin === true, isTeamMember:row.is_team_member === true }]
  })
}

export async function createTeamMemberAccess(input: {memberId:string;login:string;role:Role}) {
  const { data, error } = await requireClient().functions.invoke('manage-team-users', { body:{ action:'create-access', ...input } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as {profileId:string;username:string;temporaryPassword:string;role:Role}
}

export async function changeTeamUserRole(profileId:string, role:Role) {
  const { data, error } = await requireClient().functions.invoke('manage-team-users', { body:{ action:'update-role', profileId, role } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function setTeamUserActive(profileId:string, active:boolean) {
  const { data, error } = await requireClient().functions.invoke('manage-team-users', { body:{ action:'set-status', profileId, active } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function deleteTeamUser(profileId:string) {
  const { data, error } = await requireClient().functions.invoke('manage-team-users', { body:{ action:'delete', profileId } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function resetTeamUserPassword(profileId:string) {
  const { data, error } = await requireClient().functions.invoke('manage-team-users', { body:{ action:'reset-password', profileId } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as {username:string;temporaryPassword:string}
}

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown }
        if (typeof payload.error === 'string' && payload.error) return payload.error
      } catch {
        // A resposta pode não ser JSON; nesse caso usamos a mensagem do cliente.
      }
    }
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export async function createLeadershipAccess(memberId: string) {
  const { data, error } = await requireClient().functions.invoke('create-leadership-access', { body:{ memberId } })
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível gerar o acesso.'))
  if (data?.error) throw new Error(String(data.error))
  if (!data?.username || !data?.temporaryPassword) throw new Error('O acesso foi criado sem retornar as credenciais.')
  return data as { username:string;temporaryPassword:string;authUserId:string }
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

async function createHashedToken() {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = base64Url(tokenBytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2,'0')).join('')
  return { token, tokenHash }
}

export async function createCollectionLink(leaderId: string) {
  const client = requireClient()
  const { token, tokenHash } = await createHashedToken()
  const { data, error } = await client.rpc('rotate_collection_link', { p_leader_member_id:leaderId, p_token_hash:tokenHash })
  if (error) throw error
  if (!data) throw new Error('O banco não confirmou a criação do link.')
  return token
}

export async function createExternalRegistrationLink() {
  const client = requireClient()
  const { token, tokenHash } = await createHashedToken()
  const { data, error } = await client.rpc('rotate_external_registration_link', { p_token_hash:tokenHash })
  if (error) throw error
  if (!data) throw new Error('O banco não confirmou a criação do link externo.')
  return token
}

export async function submitCollection(token: string, values: Record<string, string|boolean|undefined>) {
  const { data, error } = await requireClient().rpc('submit_collection_member', {
    p_token:token, p_nome:values.nome, p_telefone:values.telefone, p_email:values.email,
    p_municipio:values.municipio, p_bairro:values.bairro, p_observacao:values.notes,
    p_treatment_authorized:Boolean(values.treatmentAuthorized),
    p_contact_authorized:Boolean(values.contactAuthorized),
    p_indicated_by_member_id:values.indicatedByMemberId || null,
  })
  if (error) throw error
  return data as string
}

export type ExternalRegistrationContext = {
  kind:'general'|'leadership'
  defaultLeaderId?:string
  defaultLeaderName?:string
  expiresAt:string
  allowsLeaderChoice:boolean
}

export type PublicReferralLeader = {
  id:string
  name:string
  municipality:string
  role:'lideranca'|'mobilizador'
}

export async function getExternalRegistrationContext(token: string): Promise<ExternalRegistrationContext|null> {
  const { data, error } = await requireClient().rpc('get_external_registration_context', { p_token:token })
  if (error) throw error
  const row = data?.[0]
  return row ? {
    kind:row.link_kind,
    defaultLeaderId:row.default_leader_id ?? undefined,
    defaultLeaderName:row.default_leader_name ?? undefined,
    expiresAt:row.expires_at,
    allowsLeaderChoice:Boolean(row.allows_leader_choice),
  } : null
}

export async function searchPublicReferralLeaders(token:string, query:string): Promise<PublicReferralLeader[]> {
  const { data, error } = await requireClient().rpc('search_public_referral_leaders', { p_token:token, p_query:query })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id:String(row.leader_id),
    name:String(row.leader_name),
    municipality:String(row.municipality),
    role:row.leader_role as PublicReferralLeader['role'],
  }))
}

export async function getCollectionContext(token: string): Promise<{leaderId:string;leaderName:string;expiresAt:string}|null> {
  const { data, error } = await requireClient().rpc('get_collection_link_context', { p_token:token })
  if (error) throw error
  const row = data?.[0]
  return row ? { leaderId:row.leader_id, leaderName:row.leader_name, expiresAt:row.expires_at } : null
}
