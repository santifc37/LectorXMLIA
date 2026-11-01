/**
 * Reglas de la revisión final antes de importar una factura.
 * Código puro de la interfaz (sin React) para mantener ordenado el componente.
 */

export type EstadoPrecioFila = 'aumento' | 'disminucion' | 'igual' | 'sin_referencia'

export interface FilaImportacion {
  /** Posición de la línea en la factura (0, 1, 2...). */
  indice: number
  descripcion: string
  estadoCoincidencia: 'coincidencia_alta' | 'revision_manual' | 'sin_coincidencia'
  /** Producto del inventario elegido por el usuario; null si no hay. */
  productoNombre: string | null
  cantidad: number | null
  unidad: string | null
  precioActual: number | null
  precioFactura: number | null
  estadoPrecio: EstadoPrecioFila | null
  variacionTexto: string
}

// Códigos de unidad que equivalen a "unidad" (DIAN / UN-ECE). La API registra
// las cantidades en la unidad base del producto y no convierte unidades.
const UNIDADES_SIMPLES = new Set(['94', 'EA', 'NIU', 'H87', 'UND', 'UN', 'UNID', 'UNIDAD'])

export function esUnidadSimple(unidad: string | null): boolean {
  return !unidad || UNIDADES_SIMPLES.has(unidad.trim().toUpperCase())
}

/** Una línea se marca sola solo si tiene producto, cantidad y una unidad simple. */
export function lineaIncluidaPorDefecto(fila: FilaImportacion): boolean {
  return fila.productoNombre !== null && esUnidadSimple(fila.unidad) && (fila.cantidad ?? 0) > 0
}

/** El usuario puede cambiar la marca; si no la tocó, vale la regla por defecto. */
export function estaIncluida(fila: FilaImportacion, incluidas: Record<number, boolean>): boolean {
  if (fila.productoNombre === null) return false

  return incluidas[fila.indice] ?? lineaIncluidaPorDefecto(fila)
}

/** Solo tiene sentido autorizar el precio si hay precio de factura y cambia algo. */
export function puedeActualizarPrecio(fila: FilaImportacion): boolean {
  return (
    fila.productoNombre !== null &&
    fila.precioFactura !== null &&
    fila.precioFactura > 0 &&
    fila.estadoPrecio !== null &&
    fila.estadoPrecio !== 'igual'
  )
}

export function posicionesIncluidas(
  filas: FilaImportacion[],
  incluidas: Record<number, boolean>
): number[] {
  return filas.filter((fila) => estaIncluida(fila, incluidas)).map((fila) => fila.indice)
}

export function posicionesConPrecioAutorizado(
  filas: FilaImportacion[],
  incluidas: Record<number, boolean>,
  autorizados: Record<number, boolean>
): number[] {
  return filas
    .filter(
      (fila) =>
        estaIncluida(fila, incluidas) && puedeActualizarPrecio(fila) && autorizados[fila.indice]
    )
    .map((fila) => fila.indice)
}
