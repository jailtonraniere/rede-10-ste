import type { Member, SessionUser } from '../types'

export const demoUser: SessionUser = { id: 'u1', profileId:'p1', nome: 'Marina Costa', email: 'lideranca@rede10.demo', role: 'lideranca', memberId: 'm1', territory: 'Zona Norte' }
export const adminUser: SessionUser = { id: 'u0', profileId:'p0', nome: 'Renata Alves', email: 'admin@rede10.demo', role: 'administrador', memberId: 'm0', territory: 'Todos' }
export const members: Member[] = [
  { id:'m1', nome:'Marina Costa', telefone:'(71) 99999-1001', email:'marina@exemplo.org', bairro:'Liberdade', municipio:'Salvador', status:'mobilizador_ativo', role:'lideranca', joinedAt:'2026-07-18', lastActivity:'2026-08-15', inviteCode:'MARINA10', collectionCode:'MAPMARINA', registrationStatus:'revisado', linkStatus:'confirmado_pessoa', coordinator:'Camila Rocha', source:'Base territorial 2026', contactAuthorized:true, notes:'Liderança comunitária fictícia.', estimatedCapacity:50, agreedGoal:20, goalDeadline:'2026-09-30', confidence:'medio', estimateMethod:'Entrevista com coordenação', lastReview:'2026-08-10', hasLogin:false },
  { id:'m2', nome:'Ana Souza', telefone:'(71) 99999-1002', bairro:'Liberdade', municipio:'Salvador', parentId:'m1', status:'cadastrado', role:'participante', joinedAt:'2026-08-12', lastActivity:'2026-08-14', inviteCode:'ANA10' },
  { id:'m3', nome:'João Lima', telefone:'(71) 99999-1003', bairro:'Curuzu', municipio:'Salvador', parentId:'m1', status:'mobilizador_ativo', role:'mobilizador', joinedAt:'2026-08-08', lastActivity:'2026-08-15', inviteCode:'JOAO10' },
  { id:'m4', nome:'Carla Nunes', telefone:'(71) 99999-1004', bairro:'IAPI', municipio:'Salvador', parentId:'m1', status:'cadastro_iniciado', role:'participante', joinedAt:'2026-08-14', lastActivity:'2026-08-14', inviteCode:'CARLA10' },
  { id:'m5', nome:'Paulo Reis', telefone:'(71) 99999-1005', bairro:'Liberdade', municipio:'Salvador', parentId:'m1', status:'convidado', role:'participante', joinedAt:'2026-08-15', lastActivity:'2026-08-15', inviteCode:'PAULO10' },
  { id:'m6', nome:'Beatriz Melo', telefone:'(71) 99999-1006', bairro:'Curuzu', municipio:'Salvador', parentId:'m1', status:'cadastrado', role:'participante', joinedAt:'2026-08-01', lastActivity:'2026-08-03', inviteCode:'BIA10' },
  { id:'m7', nome:'Lucas Rocha', telefone:'(71) 99999-1007', bairro:'Curuzu', municipio:'Salvador', parentId:'m3', status:'mobilizador_ativo', role:'mobilizador', joinedAt:'2026-08-10', lastActivity:'2026-08-14', inviteCode:'LUCAS10' },
  { id:'m8', nome:'Dora Campos', telefone:'(71) 99999-1008', bairro:'Lapinha', municipio:'Salvador', parentId:'m3', status:'cadastrado', role:'participante', joinedAt:'2026-08-11', lastActivity:'2026-08-12', inviteCode:'DORA10' },
  { id:'m9', nome:'Igor Santos', telefone:'(71) 99999-1009', bairro:'Lapinha', municipio:'Salvador', parentId:'m7', status:'cadastrado', role:'participante', joinedAt:'2026-08-13', lastActivity:'2026-08-13', inviteCode:'IGOR10' },
]

export const statuses: Record<string, string> = { convidado:'Convite pendente', cadastro_iniciado:'Cadastro iniciado', cadastrado:'Confirmado', mobilizador_pendente:'Mobilizador pendente', mobilizador_ativo:'Mobilizador ativo', meta_alcancada:'Meta alcançada', inativo:'Inativo', desligado:'Desligado', bloqueado:'Bloqueado' }
