import { config } from '../../config'
import { importarFacturaAPI } from '../api/api.service'
import type { RespuestaImportacionAPI } from '../api/api.service'
import { actualizarPrecioLocal } from '../catalogo/catalogo.service'
import type { ResultadoCoincidencia } from '../matching/matching.service'
import { compararPrecio } from '../precios/precios.service'
import type { LineaPrecio } from '../precios/precios.service'
import { construirSolicitud, validarContraXml } from './importacion.utils'
import type { LineaExtraida, LineaPreparada, ResumenImportacion } from './importacion.utils'

/** Lo que envía la interfaz al confirmar. Los precios se recalculan aquí. */
export interface EntradaImportacion {
  respuestaGemini: string
  resumen: ResumenImportacion | null
  coincidencias: ResultadoCoincidencia[]
  /** Posiciones de las líneas que el usuario dejó marcadas para importar. */
  incluidas: number[]
  /** Posiciones de las líneas con cambio de precio autorizado. */
  preciosAutorizados: number[]
}

type LineaGemini = LineaExtraida & LineaPrecio

function indicesValidos(valor: unknown, total: number): Set<number> {
  if (!Array.isArray(valor)) return new Set()

  return new Set(valor.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < total))
}

/**
 * Importa una factura confirmada por el usuario: valida, recalcula los precios
 * en código, la envía a la API (una sola operación atómica e idempotente) y
 * refleja los precios cambiados en la copia local del catálogo.
 */
export async function importarFactura(
  entrada: EntradaImportacion
): Promise<RespuestaImportacionAPI> {
  if (!entrada || typeof entrada.respuestaGemini !== 'string') {
    throw new Error('No se recibieron los datos de la factura.')
  }

  if (!entrada.resumen) {
    throw new Error('No se pudo leer el resumen de la factura desde el XML.')
  }

  let factura: { documento_valido?: boolean; productos?: LineaGemini[] }

  try {
    factura = JSON.parse(entrada.respuestaGemini)
  } catch {
    throw new Error('La respuesta de Gemini no contiene un JSON válido.')
  }

  if (factura.documento_valido === false) {
    throw new Error('El documento no fue identificado como una factura válida.')
  }

  if (!Array.isArray(factura.productos) || factura.productos.length === 0) {
    throw new Error('La factura no contiene productos.')
  }

  if (
    !Array.isArray(entrada.coincidencias) ||
    entrada.coincidencias.length !== factura.productos.length
  ) {
    throw new Error('Las coincidencias no corresponden a las líneas de la factura.')
  }

  // Control cruzado contra el XML: si no cuadra, no se toca el inventario.
  validarContraXml(factura.productos, entrada.resumen)

  const incluidas = indicesValidos(entrada.incluidas, factura.productos.length)
  const autorizados = indicesValidos(entrada.preciosAutorizados, factura.productos.length)

  const lineas: LineaPreparada[] = factura.productos.map((linea, indice) => {
    const coincidencia = entrada.coincidencias[indice]
    const candidato = coincidencia.candidatos.find(
      (item) => item.id === coincidencia.productoSeleccionadoId
    )

    // El precio de la factura se calcula en código con la misma regla de la
    // comparación; el precio anterior lo toma la API de la base de datos.
    const precio = compararPrecio(
      linea,
      {
        id: candidato?.id ?? '',
        nombre: candidato?.nombre ?? '',
        precio: candidato?.precio ?? null
      },
      { catalogoIncluyeIva: config.precioCompraIncluyeIva }
    )

    return {
      descripcion: typeof linea.descripcion === 'string' ? linea.descripcion : '',
      codigoProveedor: linea.codigo_proveedor ?? null,
      cantidad: precio.cantidad,
      unidad: precio.unidad,
      precioFactura: precio.precioFactura,
      productoId: candidato?.id ?? null,
      estadoCoincidencia: coincidencia.estado,
      incluida: incluidas.has(indice),
      actualizarPrecio: autorizados.has(indice)
    }
  })

  const solicitud = construirSolicitud(entrada.resumen, lineas)
  const respuesta = await importarFacturaAPI(solicitud)

  if (!respuesta.duplicada) {
    // La API ya cambió los precios; se refleja en la copia local.
    for (const linea of solicitud.lineas) {
      if (linea.actualizar_precio && linea.producto_id && linea.precio_nuevo !== null) {
        await actualizarPrecioLocal(linea.producto_id, linea.precio_nuevo).catch(() => undefined)
      }
    }
  }

  return respuesta
}
