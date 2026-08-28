import { describe, expect, it } from 'vitest'
import { memberFromRow, memberPayload, memberSelect, type MemberInput } from './data'

const input = (changes: Partial<MemberInput> = {}): MemberInput => ({
  nome:'Maria da Silva',
  telefone:'(81) 99572-7769',
  email:'maria@example.com',
  municipio:'Recife',
  bairro:'Boa Vista',
  status:'cadastrado',
  role:'lideranca',
  isTeamMember:true,
  registrationStatus:'pendente_revisao',
  linkStatus:'nao_informado',
  needsCandidateMeeting:true,
  estimatedVotes:12,
  estimatedCapacity:25,
  agreedGoal:10,
  indicatedByMemberId:'leader-indicated',
  ...changes,
})

describe('memberPayload', () => {
  it('normaliza o telefone e preserva os campos editáveis da liderança', () => {
    expect(memberPayload(input())).toMatchObject({
      nome:'Maria da Silva',
      telefone_normalizado:'81995727769',
      email:'maria@example.com',
      municipio:'Recife',
      bairro:'Boa Vista',
      member_role:'lideranca',
      needs_candidate_meeting:true,
      estimated_votes:12,
      estimated_capacity:25,
      agreed_goal:10,
      indicated_by_member_id:'leader-indicated',
    })
  })

  it('mantém uma pessoa comum fora da equipe por padrão explícito', () => {
    expect(memberPayload(input({ role:'participante', isTeamMember:false, estimatedVotes:undefined, estimatedCapacity:undefined, agreedGoal:undefined }))).toMatchObject({
      member_role:'participante',
      is_team_member:false,
      needs_candidate_meeting:false,
      estimated_votes:null,
      estimated_capacity:null,
      agreed_goal:null,
    })
  })

  it('desmarcar equipe preserva função e metas históricas da pessoa', () => {
    expect(memberPayload(input({ isTeamMember:false }))).toMatchObject({
      member_role:'lideranca',
      is_team_member:false,
      estimated_capacity:25,
      agreed_goal:10,
    })
  })
})

describe('memberFromRow', () => {
  it('preserva a identificação do membro da equipe que realizou o cadastro', () => {
    const member = memberFromRow({
      id:'member-1', nome:'Pessoa cadastrada', telefone_normalizado:'81999990000',
      municipio:'Recife', bairro:'Centro', status:'cadastrado', member_role:'participante',
      created_at:'2026-08-20T12:00:00Z', created_by_profile_id:'profile-1',
      creator:{ id:'profile-1', nome:'Maria Cadastradora', role:'cadastrador' },
    })

    expect(member).toMatchObject({
      createdByProfileId:'profile-1',
      createdByName:'Maria Cadastradora',
      createdByRole:'cadastrador',
    })
  })

  it('converte a estimativa opcional de votos sem misturá-la com capacidade e meta', () => {
    const member = memberFromRow({
      id:'member-votes', nome:'Pessoa com estimativa', telefone_normalizado:'81999990001',
      municipio:'Recife', bairro:'Centro', status:'cadastrado', member_role:'participante',
      created_at:'2026-08-20T12:00:00Z', estimated_votes:14,
      estimated_capacity:30, agreed_goal:20,
    })

    expect(member).toMatchObject({ estimatedVotes:14, estimatedCapacity:30, agreedGoal:20 })
  })

  it('mantém separadas a indicação declarada e a liderança validada', () => {
    const member = memberFromRow({
      id:'member-referral', nome:'Pessoa indicada', telefone_normalizado:'81999990002',
      municipio:'Recife', bairro:'Centro', status:'cadastrado', member_role:'participante',
      created_at:'2026-08-27T12:00:00Z', indicated_by_member_id:'leader-declared',
      parent_member_id:null, indicated_by:{ id:'leader-declared', nome:'Liderança Declarada' },
    })

    expect(member).toMatchObject({
      indicatedByMemberId:'leader-declared',
      indicatedByName:'Liderança Declarada',
      parentId:undefined,
    })
  })

  it('identifica equipe e ignora login removido sem apagar a pessoa', () => {
    const member = memberFromRow({
      id:'member-2', nome:'Pessoa da equipe', telefone_normalizado:null,
      municipio:'Recife', bairro:'Centro', status:'cadastrado', member_role:'cadastrador',
      is_team_member:true, record_origin:'equipe', profile_id:'profile-2', created_at:'2026-08-20T12:00:00Z',
      access_profile:{ id:'profile-2', telefone:'Não informado', role:'cadastrador', deleted_at:'2026-08-25T12:00:00Z' },
    })

    expect(member).toMatchObject({ isTeamMember:true, recordOrigin:'equipe', telefone:'Não informado', hasLogin:false })
  })
})

describe('memberSelect', () => {
  it('desambigua a autorrelação de indicação pela coluna reconhecida pelo PostgREST', () => {
    expect(memberSelect).toContain('indicated_by:network_members!indicated_by_member_id(id,nome)')
    expect(memberSelect).not.toContain('network_members_indicated_by_member_id_fkey')
  })
})
