/**
 * Comparación de precios de compra: factura vs. inventario.
 *
 * Es código puro (sin Gemini ni Electron). Gemini solo aporta los datos
 * de la factura; los cálculos se hacen aquí.
 *
 * Criterio de comparación:
 *  - El precio de la factura es el valor NETO por unidad: subtotal de la
 *    línea (ya con descuento, sin impuestos) dividido entre la cantidad.
 *  - Si el precio de compra del inventario se guarda sin IVA se compara
 *    contra ese neto; si se guarda con IVA, se le suma el IVA de la línea.
 *    Se controla con la variable PRECIO_COMPRA_INCLUYE_IVA del .env.
 *  - Un precio de inventario vacío o en 0 se considera "sin referencia".
 */
import type { ResultadoCoincidencia } from '../matching/matching.service'

export type EstadoPrecio = 'aumento' | 'disminucion' | 'igual' | 'sin_referencia'

export interface ImpuestoLinea {
  tipo?: string | null
  porcentaje?: number | null
  valor?: number | null
}

/** Datos de una línea de la factura, tal como los devuelve la extracción. */
export interface LineaPrecio {
  descripcion: string
  cantidad?: number | null
  unidad?: string | null
  precio_unitario?: number | null
  descuento?: number | null
  subtotal?: number | null
  impuestos?: ImpuestoLinea[] | null
}

export interface OpcionesPrecios {
  /** true si el precio de compra del inventario ya incluye IVA. */
  catalogoIncluyeIva: boolean
}

export interface ComparacionPrecio {
  productoId: string
  productoNombre: string
  /** true cuando la coincidencia aún debe confirmarse manualmente. */
  provisional: boolean
  estado: EstadoPrecio
  /** Precio de compra actual en el inventario. */
  precioActual: number | null
  /** Precio de la factura en la misma base que el inventario. */
  precioFactura: number | null
  precioFacturaSinIva: number | null
  precioFacturaConIva: number | null
  /** Porcentaje de IVA de la línea (0 si no se identificó). */
  tasaIva: number
  baseComparacion: 'sin_iva' | 'con_iva'
  /** precioFactura - precioActual */
  diferencia: number | null
  /** Variación porcentual respecto al precio actual, con 2 decimales. */
  variacionPct: number | null
  cantidad: number | null
  unidad: string | null
  alertas: string[]
}

/** Diferencias de hasta 1 peso se consideran precios iguales (redondeos). */
const TOLERANCIA_PESOS = 1

/** Variaciones iguales o mayores a este porcentaje generan una alerta. */
const UMBRAL_ALERTA_PCT = 50

/** Códigos de unidad que equivalen a "unidad" (DIAN / UN-ECE). */
const UNIDADES_SIMPLES = new Set(['94', 'EA', 'NIU', 'H87', 'UND', 'UN', 'UNID', 'UNIDAD'])

function aNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null

  if (typeof valor === 'string' && valor.trim() !== '') {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  }

  return null
}

function redondear(valor: number, decimales = 2): number {
  const factor = 10 ** decimales
  return Math.round((valor + Number.EPSILON) * factor) / factor
}

function esIva(impuesto: ImpuestoLinea): boolean {
  const tipo = (impuesto.tipo ?? '').toString().trim().toLowerCase()
  return tipo === '01' || tipo.includes('iva')
}

/** Porcentaje de IVA de la línea; si solo viene el valor, se deduce del subtotal. */
function tasaDeIva(linea: LineaPrecio, subtotal: number | null): number {
  const impuestos = Array.isArray(linea.impuestos) ? linea.impuestos.filter(esIva) : []

  for (const impuesto of impuestos) {
    const porcentaje = aNumero(impuesto.porcentaje)
    if (porcentaje !== null && porcentaje >= 0) return porcentaje
  }

  for (const impuesto of impuestos) {
    const valor = aNumero(impuesto.valor)
    if (valor !== null && valor > 0 && subtotal !== null && subtotal > 0) {
      return redondear((valor / subtotal) * 100)
    }
  }

  return 0
}

function formatearPesos(valor: number): string {
  return valor.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

/**
 * Compara el precio de una línea de la factura con el precio de compra
 * de un producto del inventario.
 */
export function compararPrecio(
  linea: LineaPrecio,
  producto: { id: string; nombre: string; precio: number | null },
  opciones: OpcionesPrecios,
  provisional = false
): ComparacionPrecio {
  const alertas: string[] = []

  const cantidad = aNumero(linea.cantidad)
  const precioLista = aNumero(linea.precio_unitario)
  const subtotal = aNumero(linea.subtotal)
  const descuento = aNumero(linea.descuento)
  const unidad =
    typeof linea.unidad === 'string' && linea.unidad.trim() ? linea.unidad.trim() : null

  if (cantidad === null || cantidad <= 0) {
    alertas.push('La cantidad de la línea no es válida.')
  }

  // Precio neto por unidad: subtotal (con descuento, sin impuestos) / cantidad.
  let neto: number | null = null

  if (subtotal !== null && subtotal > 0 && cantidad !== null && cantidad > 0) {
    neto = subtotal / cantidad

    if (precioLista !== null && precioLista > 0) {
      const diferenciaLista = Math.abs(neto - precioLista) / precioLista

      if (diferenciaLista > 0.005) {
        alertas.push(
          `Se aplicó el descuento de la línea: precio de lista ${formatearPesos(precioLista)}, neto ${formatearPesos(redondear(neto))}.`
        )
      }
    }
  } else if (precioLista !== null && precioLista > 0) {
    neto = precioLista

    if (descuento !== null && descuento > 0) {
      alertas.push('La línea trae descuento pero no subtotal: el precio no incluye el descuento.')
    }
  }

  const tasaIva = tasaDeIva(linea, subtotal)
  const precioSinIva = neto !== null ? redondear(neto) : null
  const precioConIva = neto !== null ? redondear(neto * (1 + tasaIva / 100)) : null

  const base = opciones.catalogoIncluyeIva ? 'con_iva' : 'sin_iva'
  const precioFactura = base === 'con_iva' ? precioConIva : precioSinIva

  if (base === 'con_iva' && precioFactura !== null && tasaIva === 0) {
    alertas.push('No se identificó IVA en la línea; el precio con IVA puede estar subestimado.')
  }

  if (unidad && !UNIDADES_SIMPLES.has(unidad.toUpperCase())) {
    alertas.push(
      `La factura vende por "${unidad}". Verifica que coincida con la unidad del inventario.`
    )
  }

  const precioActual = producto.precio !== null && producto.precio > 0 ? producto.precio : null

  let estado: EstadoPrecio = 'sin_referencia'
  let diferencia: number | null = null
  let variacionPct: number | null = null

  if (precioActual !== null && precioFactura !== null) {
    diferencia = redondear(precioFactura - precioActual)
    variacionPct = redondear((diferencia / precioActual) * 100)

    if (Math.abs(diferencia) <= TOLERANCIA_PESOS) {
      estado = 'igual'
    } else {
      estado = diferencia > 0 ? 'aumento' : 'disminucion'
    }

    if (Math.abs(variacionPct) >= UMBRAL_ALERTA_PCT) {
      alertas.push(
        `Variación de ${variacionPct} %. Revisa la unidad, la presentación o un posible error en la factura.`
      )
    }
  } else if (precioFactura === null) {
    alertas.push('No se pudo determinar el precio de la línea en la factura.')
  }

  return {
    productoId: producto.id,
    productoNombre: producto.nombre,
    provisional,
    estado,
    precioActual,
    precioFactura,
    precioFacturaSinIva: precioSinIva,
    precioFacturaConIva: precioConIva,
    tasaIva,
    baseComparacion: base,
    diferencia,
    variacionPct,
    cantidad,
    unidad,
    alertas
  }
}

/**
 * Compara los precios de todas las líneas. `lineas` y `coincidencias` deben
 * estar en el mismo orden. Para cada línea se usa el mejor candidato; si no
 * hubo coincidencia el resultado es null.
 */
export function compararPrecios(
  lineas: LineaPrecio[],
  coincidencias: ResultadoCoincidencia[],
  opciones: OpcionesPrecios
): (ComparacionPrecio | null)[] {
  if (lineas.length !== coincidencias.length) {
    throw new Error(
      `La factura tiene ${lineas.length} líneas y se recibieron ${coincidencias.length} coincidencias.`
    )
  }

  return lineas.map((linea, indice) => {
    const coincidencia = coincidencias[indice]
    const candidato = coincidencia.candidatos[0]

    if (coincidencia.estado === 'sin_coincidencia' || !candidato) return null

    return compararPrecio(
      linea,
      { id: candidato.id, nombre: candidato.nombre, precio: candidato.precio },
      opciones,
      coincidencia.estado !== 'coincidencia_alta'
    )
  })
}
