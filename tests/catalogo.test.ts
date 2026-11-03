import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fusionarCatalogo,
  productosNuevos,
  validarProductoNuevo
} from '../src/main/services/catalogo/catalogo.utils.ts'

const LOCAL = [
  { id: 'b', nombre: 'Broca', precio_compra: 3000 },
  { id: 'a', nombre: 'Alicate', precio_compra: 12000 }
]

describe('catálogo: productos nuevos', () => {
  it('solo devuelve los productos de la API que no están en el archivo local', () => {
    const api = [...LOCAL, { id: 'c', nombre: 'Cinta', precio_compra: 5000 }]

    assert.deepEqual(
      productosNuevos(api, LOCAL).map((p) => p.id),
      ['c']
    )
  })

  it('fusionar mantiene el formato, evita repetidos y ordena por nombre', () => {
    const resultado = fusionarCatalogo(LOCAL, [
      { id: 'c', nombre: 'Cinta', precio_compra: 5000 },
      { id: 'a', nombre: 'Nombre distinto', precio_compra: 1 }
    ])

    assert.deepEqual(
      resultado.map((p) => p.id),
      ['a', 'b', 'c']
    )
    // Gana el producto que ya estaba en el archivo.
    assert.equal(resultado[0].nombre, 'Alicate')
    assert.equal(resultado[0].precio_compra, 12000)
  })
})

describe('catálogo: validación de producto nuevo', () => {
  const valido = {
    codigo: ' P-1 ',
    nombre: ' Martillo ',
    categoria_id: 'cat',
    unidad_base_id: 'uni',
    precio_compra: '1000',
    precio_venta: 1500,
    stock_minimo: 0
  }

  it('limpia textos y convierte los números', () => {
    const datos = validarProductoNuevo(valido)

    assert.equal(datos.codigo, 'P-1')
    assert.equal(datos.nombre, 'Martillo')
    assert.equal(datos.precio_compra, 1000)
    assert.equal(datos.codigo_barras, null)
  })

  it('rechaza nombre vacío, categoría faltante y precios negativos', () => {
    assert.throws(() => validarProductoNuevo({ ...valido, nombre: '  ' }), /nombre/i)
    assert.throws(() => validarProductoNuevo({ ...valido, categoria_id: '' }), /categoría/i)
    assert.throws(() => validarProductoNuevo({ ...valido, precio_venta: -1 }), /precio de venta/i)
    assert.throws(() => validarProductoNuevo({ ...valido, stock_minimo: '' }), /stock/i)
  })
})
