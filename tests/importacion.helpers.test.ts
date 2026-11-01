import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  esUnidadSimple,
  estaIncluida,
  lineaIncluidaPorDefecto,
  posicionesConPrecioAutorizado,
  posicionesIncluidas,
  puedeActualizarPrecio
} from '../src/renderer/src/components/importacion.helpers.ts'
import type { FilaImportacion } from '../src/renderer/src/components/importacion.helpers.ts'

function fila(indice: number, extra: Partial<FilaImportacion> = {}): FilaImportacion {
  return {
    indice,
    descripcion: `Línea ${indice + 1}`,
    estadoCoincidencia: 'coincidencia_alta',
    productoNombre: 'Producto',
    cantidad: 2,
    unidad: 'UND',
    precioActual: 1000,
    precioFactura: 1200,
    estadoPrecio: 'aumento',
    variacionTexto: '+20 %',
    ...extra
  }
}

describe('unidades', () => {
  it('reconoce los códigos de "unidad" de la DIAN y rechaza otras presentaciones', () => {
    for (const unidad of ['94', 'EA', 'NIU', 'H87', 'und', ' UN ', null]) {
      assert.equal(esUnidadSimple(unidad), true, String(unidad))
    }

    for (const unidad of ['CJ', 'KGM', 'MTR', 'BX']) {
      assert.equal(esUnidadSimple(unidad), false, unidad)
    }
  })
})

describe('qué líneas se importan', () => {
  it('por defecto se marca una línea con producto, cantidad y unidad simple', () => {
    assert.equal(lineaIncluidaPorDefecto(fila(0)), true)
  })

  it('por defecto NO se marca una línea sin producto, sin cantidad o con otra presentación', () => {
    assert.equal(lineaIncluidaPorDefecto(fila(0, { productoNombre: null })), false)
    assert.equal(lineaIncluidaPorDefecto(fila(0, { cantidad: null })), false)
    assert.equal(lineaIncluidaPorDefecto(fila(0, { cantidad: 0 })), false)
    assert.equal(lineaIncluidaPorDefecto(fila(0, { unidad: 'CJ' })), false)
  })

  it('el usuario puede marcar una línea con presentación distinta, pero nunca una sin producto', () => {
    const caja = fila(0, { unidad: 'CJ' })
    const sinProducto = fila(1, { productoNombre: null })

    assert.equal(estaIncluida(caja, {}), false)
    assert.equal(estaIncluida(caja, { 0: true }), true)
    assert.equal(estaIncluida(sinProducto, { 1: true }), false)
  })

  it('el usuario puede desmarcar una línea que venía marcada', () => {
    assert.equal(estaIncluida(fila(0), { 0: false }), false)
  })

  it('devuelve las posiciones de las líneas incluidas', () => {
    const filas = [fila(0), fila(1, { productoNombre: null }), fila(2, { unidad: 'CJ' }), fila(3)]

    assert.deepEqual(posicionesIncluidas(filas, {}), [0, 3])
    assert.deepEqual(posicionesIncluidas(filas, { 2: true, 3: false }), [0, 2])
  })
})

describe('qué precios se actualizan', () => {
  it('solo si hay producto, precio de factura y el precio cambió', () => {
    assert.equal(puedeActualizarPrecio(fila(0)), true)
    assert.equal(puedeActualizarPrecio(fila(0, { estadoPrecio: 'igual' })), false)
    assert.equal(puedeActualizarPrecio(fila(0, { precioFactura: null })), false)
    assert.equal(puedeActualizarPrecio(fila(0, { precioFactura: 0 })), false)
    assert.equal(puedeActualizarPrecio(fila(0, { estadoPrecio: null })), false)
    assert.equal(puedeActualizarPrecio(fila(0, { productoNombre: null })), false)
  })

  it('un precio sin referencia (inventario en 0) sí se puede establecer', () => {
    assert.equal(puedeActualizarPrecio(fila(0, { estadoPrecio: 'sin_referencia' })), true)
  })

  it('una autorización no cuenta si la línea quedó excluida', () => {
    const filas = [fila(0), fila(1), fila(2)]
    const autorizados = { 0: true, 1: true, 2: true }

    assert.deepEqual(posicionesConPrecioAutorizado(filas, {}, autorizados), [0, 1, 2])
    assert.deepEqual(posicionesConPrecioAutorizado(filas, { 1: false }, autorizados), [0, 2])
  })

  it('una autorización no cuenta si el precio no cambió', () => {
    const filas = [fila(0, { estadoPrecio: 'igual' }), fila(1)]

    assert.deepEqual(posicionesConPrecioAutorizado(filas, {}, { 0: true, 1: true }), [1])
  })
})
