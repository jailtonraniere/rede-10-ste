import { describe, expect, it } from 'vitest'
import { descendants, normalizePhone, wouldCreateCycle } from './network'
import { members } from '../data/demo'
describe('regras da rede', () => {
  it('normaliza telefone', () => expect(normalizePhone('(71) 9 9999-1002')).toBe('71999991002'))
  it('conta descendentes em vários níveis', () => expect(descendants(members, 'm1').length).toBe(8))
  it('impede autorreferência e ciclos', () => { expect(wouldCreateCycle(members,'m1','m1')).toBe(true); expect(wouldCreateCycle(members,'m3','m7')).toBe(true) })
})
