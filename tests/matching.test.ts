import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compararFacturaConCatalogo,
  compararProducto
} from '../src/main/services/matching/matching.service.ts'

const CATALOGO = [
  {
    id: 'a1',
    nombre: 'Pulidora Black & Decker G720 4.5 pulgadas 820 W',
    precio_compra: 185000,
    codigo_barras: '7701234567890'
  },
  { id: 'b2', nombre: 'Broca para concreto 1/4 pulgada', precio_compra: 3000 },
  { id: 'c3', nombre: 'Broca para concreto 3/8 pulgada', precio_compra: 4500 },
  { id: 'd4', nombre: 'Cinta métrica 5 m Stanley', precio_compra: 22000 }
]

describe('coincidencia de productos', () => {
  it('una coincidencia exacta por código de barras vale 100 y es alta', () => {
    const resultado = compararProducto(
      { descripcion: 'Descripción que no se parece en nada', codigo_barras: '7701234567890' },
      CATALOGO
    )

    assert.equal(resultado.estado, 'coincidencia_alta')
    assert.equal(resultado.puntuacion, 100)
    assert.equal(resultado.candidatos[0].id, 'a1')
  })

  it('los códigos se comparan sin importar mayúsculas, guiones ni espacios', () => {
    const resultado = compararProducto(
      {
        descripcion: 'Otro texto',
        codigo_proveedor: ' 7701-234 567 890 '
      },
      CATALOGO
    )

    assert.equal(resultado.puntuacion, 100)
    assert.equal(resultado.candidatos[0].id, 'a1')
  })

  it('un nombre casi idéntico lo deja como primer candidato', () => {
    const resultado = compararProducto(
      { descripcion: 'PULIDORA BLACK & DECKER G720 4.5 PULGADAS 820 W' },
      CATALOGO
    )

    assert.equal(resultado.candidatos[0].id, 'a1')
    assert.ok(resultado.puntuacion >= 88, `puntuación ${resultado.puntuacion}`)
  })

  it('un producto que no está en el catálogo queda sin coincidencia', () => {
    const resultado = compararProducto({ descripcion: 'Cemento gris 50 kg' }, CATALOGO)

    assert.equal(resultado.estado, 'sin_coincidencia')
    assert.equal(resultado.productoSeleccionadoId, null)
  })

  it('una medida distinta no puede quedar como coincidencia alta', () => {
    const resultado = compararProducto({ descripcion: 'Broca para concreto 1/2 pulgada' }, CATALOGO)

    assert.notEqual(resultado.estado, 'coincidencia_alta')
  })

  it('nunca selecciona un producto por su cuenta', () => {
    const resultados = compararFacturaConCatalogo(
      [
        { descripcion: 'Pulidora Black & Decker G720 4.5 pulgadas 820 W' },
        { descripcion: 'Cinta métrica 5 m Stanley' },
        { descripcion: 'Algo que no existe' }
      ],
      CATALOGO
    )

    assert.equal(resultados.length, 3)
    assert.ok(resultados.every((resultado) => resultado.productoSeleccionadoId === null))
  })

  it('solo propone IDs que existen en el catálogo', () => {
    const ids = new Set(CATALOGO.map((producto) => producto.id))
    const resultado = compararProducto({ descripcion: 'Broca concreto 1/4' }, CATALOGO)

    assert.ok(resultado.candidatos.every((candidato) => ids.has(candidato.id)))
  })
})
