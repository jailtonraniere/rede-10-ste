import { describe, expect, it } from 'vitest'
import { memberPayload, type MemberInput } from './data'

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
