export type Role = 'administrador' | 'coordenador' | 'lideranca' | 'mobilizador' | 'participante'
export type Status = 'convidado' | 'cadastro_iniciado' | 'cadastrado' | 'mobilizador_pendente' | 'mobilizador_ativo' | 'meta_alcancada' | 'inativo' | 'desligado' | 'bloqueado'
export type RegistrationStatus = 'importado'|'pendente_revisao'|'revisado'|'pronto_ativacao'|'ativado'|'inativo'|'duplicado'|'desligado'
export type LinkStatus = 'nao_informado'|'informado_lideranca'|'em_validacao'|'confirmado_pessoa'|'recusado'|'encerrado'
export type Confidence = 'baixo'|'medio'|'alto'
export interface Member { id: string; nome: string; telefone: string; email?: string; bairro: string; municipio: string; parentId?: string; status: Status; role: Role; joinedAt: string; lastActivity: string; inviteCode: string; collectionCode?:string; accessUsername?:string; registrationStatus?:RegistrationStatus; linkStatus?:LinkStatus; coordinator?:string; source?:string; contactAuthorized?:boolean; notes?:string; estimatedCapacity?:number; agreedGoal?:number; goalDeadline?:string; confidence?:Confidence; estimateMethod?:string; lastReview?:string; hasLogin?:boolean }
export interface SessionUser { id: string; profileId: string; nome: string; email: string; role: Role; memberId: string; territory: string; mustChangePassword?: boolean }
