import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compararPrecio } from '../src/main/services/precios/precios.service.ts'
import type { LineaPrecio } from '../src/main/services/precios/precios.service.ts'

const SIN_IVA = { catalogoIncluyeIva: false }
const CON_IVA = { catalogoIncluyeIva: true }

function linea(extra: Partial<LineaPrecio> = {}): LineaPrecio {
  return {
    descripcion: 'Pulidora 4.5"',
    cantidad: 1,
    unidad: 'UND',
    precio_unitario: 200000,
    descuento: 0,
    subtotal: 200000,
    total_linea: 238000,
    impuestos: [{ tipo: 'IVA', porcentaje: 19, valor: 38000 }],
    ...extra
  }
}

function producto(precio: number | null): { id: string; nombre: string; precio: number | null } {
  return { id: 'p1', nombre: 'Pulidora', precio }
}

describe('comparación de precios', () => {
  it('reproduce el ejemplo del README: 185.000 → 200.000 es +15.000 (+8,11 %)', () => {
    const resultado = compararPrecio(linea(), producto(185000), SIN_IVA)

    assert.equal(resultado.estado, 'aumento')
    assert.equal(resultado.precioFactura, 200000)
    assert.equal(resultado.diferencia, 15000)
    assert.equal(resultado.variacionPct, 8.11)
  })

  it('detecta una disminución', () => {
    const resultado = compararPrecio(linea(), producto(250000), SIN_IVA)

    assert.equal(resultado.estado, 'disminucion')
    assert.equal(resultado.diferencia, -50000)
    assert.equal(resultado.variacionPct, -20)
  })

  it('trata como iguales las diferencias de hasta un peso', () => {
    const resultado = compararPrecio(linea({ subtotal: 200000.6 }), producto(200000), SIN_IVA)

    assert.equal(resultado.estado, 'igual')
  })

  it('un precio de inventario en 0 o vacío es "sin referencia"', () => {
    assert.equal(compararPrecio(linea(), producto(0), SIN_IVA).estado, 'sin_referencia')
    assert.equal(compararPrecio(linea(), producto(null), SIN_IVA).estado, 'sin_referencia')
  })

  it('aplica el descuento de la línea usando el subtotal sobre la cantidad', () => {
    const resultado = compararPrecio(
      linea({ cantidad: 4, precio_unitario: 1000, subtotal: 3600, total_linea: 4284 }),
      producto(900),
      SIN_IVA
    )

    assert.equal(resultado.precioFactura, 900)
    assert.equal(resultado.estado, 'igual')
    assert.ok(resultado.alertas.some((alerta) => alerta.includes('descuento')))
  })

  it('compara con IVA cuando el inventario guarda el costo con IVA', () => {
    const resultado = compararPrecio(linea(), producto(238000), CON_IVA)

    assert.equal(resultado.baseComparacion, 'con_iva')
    assert.equal(resultado.precioFactura, 238000)
    assert.equal(resultado.estado, 'igual')
  })

  it('alerta cuando la variación es del 50 % o más', () => {
    const resultado = compararPrecio(linea(), producto(100000), SIN_IVA)

    assert.ok(resultado.alertas.some((alerta) => alerta.includes('Variación')))
  })

  it('alerta cuando la factura vende en una unidad distinta a "unidad"', () => {
    const resultado = compararPrecio(linea({ unidad: 'CJ' }), producto(200000), SIN_IVA)

    assert.ok(resultado.alertas.some((alerta) => alerta.includes('"CJ"')))
  })

  it('avisa si la cantidad no es válida', () => {
    const resultado = compararPrecio(linea({ cantidad: 0 }), producto(200000), SIN_IVA)

    assert.ok(resultado.alertas.some((alerta) => alerta.includes('cantidad')))
  })
})
