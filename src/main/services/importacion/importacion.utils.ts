/**
 * Preparación de la solicitud de importación que se envía a la API.
 *
 * Es código puro (sin Electron ni red) para poder probarlo. Reglas:
 *  - El NIT, el número y la fecha salen del XML leído localmente, no de Gemini.
 *  - Solo se importan las líneas con producto confirmado y marcadas por el usuario.
 *  - El precio solo se actualiza en líneas importadas y autorizadas.
 *  - Si lo extraído por Gemini no cuadra con el XML, la importación se detiene.
 */
import type { ResultadoCoincidencia } from '../matching/matching.service'

export type EstadoCoincidencia = ResultadoCoincidencia['estado']

/** Línea tal como la devuelve la extracción de Gemini. */
export interface LineaExtraida {
  descripcion?: string | null
  codigo_proveedor?: string | null
  cantidad?: number | string | null
  unidad?: string | null
  subtotal?: number | string | null
}

/** Datos de la factura leídos del XML (no de Gemini). */
export interface ResumenImportacion {
  numero: string | null
  fecha: string | null
  proveedorNombre: string | null
  proveedorNit: string | null
  lineas: number
  subtotal: number | null
}

/** Línea ya cruzada con la elección del usuario y con el cálculo de precios. */
export interface LineaPreparada {
  descripcion: string
  codigoProveedor: string | null
  cantidad: number | null
  unidad: string | null
  /** Precio unitario de la factura en la misma base del inventario. */
  precioFactura: number | null
  productoId: string | null
  estadoCoincidencia: EstadoCoincidencia
  /** El usuario dejó marcada la línea para importar. */
  incluida: boolean
  /** El usuario autorizó cambiar el precio de compra. */
  actualizarPrecio: boolean
}

export interface LineaSolicitud {
  linea: number
  producto_id: string | null
  descripcion: string
  codigo_proveedor: string | null
  cantidad: number | null
  unidad: string | null
  precio_unitario: number | null
  estado_coincidencia: EstadoCoincidencia
  importar: boolean
  actualizar_precio: boolean
  precio_nuevo: number | null
}

export interface SolicitudImportacion {
  proveedor_nit: string
  proveedor_nombre: string | null
  numero: string
  fecha_emision: string | null
  tipo_documento: 'factura'
  lineas: LineaSolicitud[]
}

function aNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null

  if (typeof valor === 'string' && valor.trim() !== '') {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  }

  return null
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales
  return Math.round((valor + Number.EPSILON) * factor) / factor
}

function recortar(valor: string | null | undefined, max: number): string | null {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  return texto ? texto.slice(0, max) : null
}

/** Acepta "2026-10-30" o "2026-10-30T10:00:00" y devuelve AAAA-MM-DD, o null. */
export function normalizarFecha(valor: string | null | undefined): string | null {
  const coincidencia = typeof valor === 'string' ? valor.trim().match(/^(\d{4}-\d{2}-\d{2})/) : null

  if (!coincidencia) return null

  const fecha = new Date(`${coincidencia[1]}T00:00:00Z`)

  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === coincidencia[1]
    ? coincidencia[1]
    : null
}

/**
 * Comprueba que la extracción de Gemini coincide con el XML: mismo número
 * de líneas y misma suma de subtotales. Si no, lanza un error explicativo.
 */
export function validarContraXml(
  lineas: LineaExtraida[],
  resumen: Pick<ResumenImportacion, 'lineas' | 'subtotal'>
): void {
  if (lineas.length !== resumen.lineas) {
    throw new Error(
      `El XML tiene ${resumen.lineas} líneas, pero la extracción tiene ${lineas.length}. ` +
        'Vuelve a procesar la factura antes de importar.'
    )
  }

  if (resumen.subtotal === null) return

  const subtotales = lineas.map((linea) => aNumero(linea.subtotal))

  // Si alguna línea no trae subtotal no se puede comprobar la suma.
  if (subtotales.some((valor) => valor === null)) return

  const suma = (subtotales as number[]).reduce((total, valor) => total + valor, 0)

  if (Math.abs(suma - resumen.subtotal) > Math.max(2, resumen.subtotal * 0.005)) {
    throw new Error(
      `La suma de los subtotales extraídos (${redondear(suma, 2)}) no coincide con la del XML ` +
        `(${resumen.subtotal}). Vuelve a procesar la factura antes de importar.`
    )
  }
}

/** Arma la solicitud para POST /facturas-compra. Lanza un error claro si algo falta. */
export function construirSolicitud(
  resumen: Pick<ResumenImportacion, 'numero' | 'fecha' | 'proveedorNombre' | 'proveedorNit'>,
  lineas: LineaPreparada[]
): SolicitudImportacion {
  const nit = recortar(resumen.proveedorNit, 40)
  const numero = recortar(resumen.numero, 80)

  if (!nit || !numero) {
    throw new Error(
      'No se identificó el NIT del proveedor o el número de la factura en el XML. ' +
        'Son necesarios para evitar importaciones duplicadas.'
    )
  }

  const resultado: LineaSolicitud[] = []
  let porImportar = 0

  lineas.forEach((linea, posicion) => {
    const etiqueta = `La línea ${posicion + 1}`
    const importar = linea.incluida && linea.productoId !== null
    const cantidad = linea.cantidad !== null ? redondear(linea.cantidad, 3) : null
    const precio = linea.precioFactura !== null ? redondear(linea.precioFactura, 2) : null

    if (importar) {
      if (cantidad === null || !Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error(`${etiqueta} ("${linea.descripcion}") no tiene una cantidad válida.`)
      }

      porImportar++
    }

    const actualizar = importar && linea.actualizarPrecio

    if (actualizar && (precio === null || precio <= 0)) {
      throw new Error(
        `${etiqueta} ("${linea.descripcion}") autoriza un cambio de precio, ` +
          'pero no se pudo calcular el precio de la factura.'
      )
    }

    resultado.push({
      linea: posicion + 1,
      producto_id: linea.productoId,
      descripcion: recortar(linea.descripcion, 1000) ?? `Línea ${posicion + 1}`,
      codigo_proveedor: recortar(linea.codigoProveedor, 100),
      cantidad,
      unidad: recortar(linea.unidad, 30),
      precio_unitario: precio,
      estado_coincidencia: linea.estadoCoincidencia,
      importar,
      actualizar_precio: actualizar,
      precio_nuevo: actualizar ? precio : null
    })
  })

  if (porImportar === 0) {
    throw new Error('Selecciona al menos una línea con producto confirmado para importar.')
  }

  return {
    proveedor_nit: nit,
    proveedor_nombre: recortar(resumen.proveedorNombre, 200),
    numero,
    fecha_emision: normalizarFecha(resumen.fecha),
    tipo_documento: 'factura',
    lineas: resultado
  }
}
