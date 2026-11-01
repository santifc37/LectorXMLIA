import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  construirSolicitud,
  normalizarFecha,
  validarContraXml
} from '../src/main/services/importacion/importacion.utils.ts'
import type { LineaPreparada } from '../src/main/services/importacion/importacion.utils.ts'

const PRODUCTO = '11111111-1111-4111-8111-111111111111'

const RESUMEN = {
  numero: 'FE-1001',
  fecha: '2026-10-30',
  proveedorNombre: 'Proveedor SAS',
  proveedorNit: '900123456'
}

function linea(extra: Partial<LineaPreparada> = {}): LineaPreparada {
  return {
    descripcion: 'Pulidora 4.5"',
    codigoProveedor: 'P-1',
    cantidad: 3,
    unidad: 'UND',
    precioFactura: 185000,
    productoId: PRODUCTO,
    estadoCoincidencia: 'coincidencia_alta',
    incluida: true,
    actualizarPrecio: false,
    ...extra
  }
}

describe('solicitud de importación', () => {
  it('arma la solicitud con los datos del XML', () => {
    const solicitud = construirSolicitud(RESUMEN, [linea()])

    assert.equal(solicitud.proveedor_nit, '900123456')
    assert.equal(solicitud.numero, 'FE-1001')
    assert.equal(solicitud.fecha_emision, '2026-10-30')
    assert.equal(solicitud.tipo_documento, 'factura')
    assert.equal(solicitud.lineas[0].importar, true)
    assert.equal(solicitud.lineas[0].actualizar_precio, false)
    assert.equal(solicitud.lineas[0].precio_nuevo, null)
  })

  it('el precio solo se actualiza si el usuario lo autorizó', () => {
    const solicitud = construirSolicitud(RESUMEN, [
      linea({ actualizarPrecio: true }),
      linea({ productoId: PRODUCTO, actualizarPrecio: false })
    ])

    assert.equal(solicitud.lineas[0].actualizar_precio, true)
    assert.equal(solicitud.lineas[0].precio_nuevo, 185000)
    assert.equal(solicitud.lineas[1].actualizar_precio, false)
    assert.equal(solicitud.lineas[1].precio_nuevo, null)
  })

  it('una línea excluida no se importa ni cambia el precio, aunque tuviera autorización', () => {
    const solicitud = construirSolicitud(RESUMEN, [
      linea(),
      linea({ incluida: false, actualizarPrecio: true })
    ])

    assert.equal(solicitud.lineas[1].importar, false)
    assert.equal(solicitud.lineas[1].actualizar_precio, false)
    assert.equal(solicitud.lineas[1].precio_nuevo, null)
  })

  it('una línea sin producto no se importa, pero se conserva para el historial', () => {
    const solicitud = construirSolicitud(RESUMEN, [
      linea(),
      linea({ productoId: null, estadoCoincidencia: 'sin_coincidencia' })
    ])

    assert.equal(solicitud.lineas.length, 2)
    assert.equal(solicitud.lineas[1].importar, false)
    assert.equal(solicitud.lineas[1].producto_id, null)
  })

  it('exige NIT y número de factura', () => {
    assert.throws(
      () => construirSolicitud({ ...RESUMEN, proveedorNit: null }, [linea()]),
      /NIT del proveedor/
    )
    assert.throws(
      () => construirSolicitud({ ...RESUMEN, numero: '  ' }, [linea()]),
      /número de la factura/
    )
  })

  it('exige al menos una línea para importar', () => {
    assert.throws(
      () => construirSolicitud(RESUMEN, [linea({ incluida: false })]),
      /al menos una línea/
    )
  })

  it('rechaza cantidades no válidas en líneas que se importan', () => {
    assert.throws(() => construirSolicitud(RESUMEN, [linea({ cantidad: 0 })]), /cantidad válida/)
    assert.throws(() => construirSolicitud(RESUMEN, [linea({ cantidad: null })]), /cantidad válida/)
  })

  it('rechaza autorizar un precio que no se pudo calcular', () => {
    assert.throws(
      () => construirSolicitud(RESUMEN, [linea({ actualizarPrecio: true, precioFactura: null })]),
      /precio de la factura/
    )
  })

  it('redondea cantidad a 3 decimales y precio a 2, y recorta textos largos', () => {
    const solicitud = construirSolicitud(RESUMEN, [
      linea({ cantidad: 1.23456, precioFactura: 100.456, descripcion: 'x'.repeat(2000) })
    ])

    assert.equal(solicitud.lineas[0].cantidad, 1.235)
    assert.equal(solicitud.lineas[0].precio_unitario, 100.46)
    assert.equal(solicitud.lineas[0].descripcion.length, 1000)
  })
})

describe('fecha de emisión', () => {
  it('acepta fechas con o sin hora y descarta las inválidas', () => {
    assert.equal(normalizarFecha('2026-10-30'), '2026-10-30')
    assert.equal(normalizarFecha('2026-10-30T10:15:00-05:00'), '2026-10-30')
    assert.equal(normalizarFecha('2026-02-31'), null)
    assert.equal(normalizarFecha('30/10/2026'), null)
    assert.equal(normalizarFecha(null), null)
  })
})

describe('control cruzado contra el XML', () => {
  it('pasa cuando coinciden las líneas y la suma de subtotales', () => {
    assert.doesNotThrow(() =>
      validarContraXml([{ subtotal: 1000 }, { subtotal: '500' }], { lineas: 2, subtotal: 1500 })
    )
  })

  it('falla si Gemini omitió o inventó líneas', () => {
    assert.throws(
      () => validarContraXml([{ subtotal: 1000 }], { lineas: 2, subtotal: 1000 }),
      /2 líneas.*1/
    )
  })

  it('falla si la suma de subtotales no cuadra', () => {
    assert.throws(
      () =>
        validarContraXml([{ subtotal: 1000 }, { subtotal: 900 }], { lineas: 2, subtotal: 1500 }),
      /no coincide/
    )
  })

  it('tolera diferencias de redondeo de hasta 2 pesos', () => {
    assert.doesNotThrow(() =>
      validarContraXml([{ subtotal: 1000 }, { subtotal: 500.9 }], { lineas: 2, subtotal: 1500 })
    )
  })

  it('no puede comprobar la suma si falta algún subtotal, pero sí el número de líneas', () => {
    assert.doesNotThrow(() =>
      validarContraXml([{ subtotal: 1000 }, { subtotal: null }], { lineas: 2, subtotal: 1500 })
    )
  })
})
