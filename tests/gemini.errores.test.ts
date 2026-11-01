import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ErrorRespuestaGemini,
  clasificarError,
  mensajeFinal
} from '../src/main/services/gemini/gemini.errores.ts'

describe('errores de Gemini', () => {
  it('la cuota diaria o el saldo agotado no se reintentan', () => {
    const diaria = new Error(
      '429 RESOURCE_EXHAUSTED: quota metric GenerateRequestsPerDayPerProjectPerModel-FreeTier exceeded'
    )
    const saldo = new Error('429: your prepayment credits are depleted. Check billing.')

    assert.equal(clasificarError(diaria).tipo, 'cuota')
    assert.equal(clasificarError(saldo).tipo, 'cuota')
    assert.match(mensajeFinal(diaria), /cuota o el saldo/)
  })

  it('un 429 por minuto es un límite temporal y respeta la espera que indica Gemini', () => {
    const limite = clasificarError(new Error('429 RESOURCE_EXHAUSTED. Please retry in 12.3s.'))
    const json = clasificarError(new Error('429 {"retryDelay":"7s"}'))

    assert.equal(limite.tipo, 'limite')
    assert.equal(limite.esperaMs, 12300)
    assert.equal(json.esperaMs, 7000)
    assert.equal(clasificarError(new Error('429 RESOURCE_EXHAUSTED')).esperaMs, null)
  })

  it('los errores de servicio y de conexión son temporales', () => {
    for (const mensaje of ['503 UNAVAILABLE', '500 INTERNAL', 'fetch failed', 'read ECONNRESET']) {
      assert.equal(clasificarError(new Error(mensaje)).tipo, 'temporal', mensaje)
    }
  })

  it('un número parecido a un código HTTP dentro de otro número no cuenta', () => {
    assert.equal(clasificarError(new Error('Valor 15003 no permitido')).tipo, 'otro')
  })

  it('una respuesta inválida se clasifica aparte y conserva su mensaje', () => {
    const error = new ErrorRespuestaGemini('Gemini devolvió una respuesta que no es JSON válido.')

    assert.equal(clasificarError(error).tipo, 'respuesta')
    assert.equal(mensajeFinal(error), 'Gemini devolvió una respuesta que no es JSON válido.')
  })

  it('un error desconocido se muestra tal cual', () => {
    assert.equal(mensajeFinal(new Error('API key not valid')), 'API key not valid')
  })
})
