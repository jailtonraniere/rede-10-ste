import { describe, expect, it } from 'vitest'
import { memberFromRow, memberPayload, type MemberInput } from './data'

const input = (changes: Partial<MemberInput> = {}): MemberInput => ({
  nome:'Maria da Silva',
  telefone:'(81) 99572-7769',
  email:'maria@example.com',
  municipio:'Recife',
  bairro:'Boa Vista',
  status:'cadastrado',
  role:'lideranca',
  registrationStatus:'pendente_revisao',
  linkStatus:'nao_informado',
  needsCandidateMeeting:true,
  estimatedCapacity:25,
  agreedGoal:10,
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
      estimated_capacity:25,
      agreed_goal:10,
    })
  })

  it('limpa os campos exclusivos de liderança ao editar como apoiador', () => {
    expect(memberPayload(input({ role:'participante' }))).toMatchObject({
      member_role:'participante',
      needs_candidate_meeting:false,
      estimated_capacity:null,
      agreed_goal:null,
      goal_deadline:null,
      estimate_confidence:null,
      estimate_method:null,
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
})
