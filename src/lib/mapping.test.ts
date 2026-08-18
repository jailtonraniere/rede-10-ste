import { describe,expect,it } from 'vitest'
import { duplicateCandidates,parseCsv,prepareActivation,realization,transferMember,uniquePeople } from './mapping'
import { members } from '../data/demo'
describe('modo mapeamento',()=>{
 it('importa CSV com aspas e vírgula',()=>expect(parseCsv('nome,telefone,observacao\n"Ana, Maria",71999990000,"teste"')[0].nome).toBe('Ana, Maria'))
 it('calcula realização sem confundir capacidade',()=>expect(realization(8,20)).toBe(40))
 it('identifica telefone duplicado normalizado',()=>expect(duplicateCandidates({nome:'X',telefone:'71 99999-1002',bairro:'X'},members)).toHaveLength(1))
 it('conta pessoas únicas',()=>expect(uniquePeople([...members,{...members[1],id:'dup'}]).length).toBe(members.length))
 it('transfere preservando o membro',()=>expect(transferMember(members,'m2','m3').find(m=>m.id==='m2')?.parentId).toBe('m3'))
 it('prepara ativação sem criar login',()=>{const m=prepareActivation(members,'m2').find(x=>x.id==='m2');expect(m?.registrationStatus).toBe('pronto_ativacao');expect(m?.hasLogin).toBe(false)})
})
