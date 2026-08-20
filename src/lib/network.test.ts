import { describe, expect, it } from 'vitest'
import { brazilianPhonePattern, descendants, formatPhone, normalizePhone, wouldCreateCycle } from './network'
import { members } from '../data/demo'
describe('regras da rede', () => {
  it('normaliza telefone', () => expect(normalizePhone('(71) 9 9999-1002')).toBe('71999991002'))
  it('aplica máscara e limita o telefone a 11 dígitos', () => {
    expect(formatPhone('81999999999')).toBe('(81) 99999-9999')
    expect(formatPhone('8133334444')).toBe('(81) 3333-4444')
    expect(formatPhone('819999999999999')).toBe('(81) 99999-9999')
  })
  it('aceita no campo o telefone celular formatado', () => {
    const browserPattern = new RegExp(`^(?:${brazilianPhonePattern})$`)
    expect(browserPattern.test('(81) 99572-7769')).toBe(true)
    expect(browserPattern.test('(81) 3572-7769')).toBe(true)
    expect(browserPattern.test('(81) 99572-776')).toBe(false)
  })
  it('conta descendentes em vários níveis', () => expect(descendants(members, 'm1').length).toBe(8))
  it('impede autorreferência e ciclos', () => { expect(wouldCreateCycle(members,'m1','m1')).toBe(true); expect(wouldCreateCycle(members,'m3','m7')).toBe(true) })
})
