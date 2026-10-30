/**
 * Utilidades puras del catálogo (sin dependencias de Electron),
 * para poder probarlas fácilmente.
 */

export interface ProductoCatalogo {
  id: string
  nombre: string
  /** null cuando la API no informa un precio de compra válido. */
  precio_compra: number | null
}

export interface ResultadoNormalizacion {
  productos: ProductoCatalogo[]
  /** Registros ignorados: sin ID o nombre, inactivos o repetidos. */
  descartados: number
}

function aNumero(valor: unknown): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null
  }

  if (typeof valor === 'string') {
    const texto = valor.trim()

    if (!texto) return null

    const numero = Number(texto)

    return Number.isFinite(numero) ? numero : null
  }

  return null
}

function extraerLista(crudo: unknown): unknown[] {
  if (Array.isArray(crudo)) return crudo

  if (crudo && typeof crudo === 'object') {
    const objeto = crudo as Record<string, unknown>

    if (Array.isArray(objeto.productos)) return objeto.productos
    if (Array.isArray(objeto.data)) return objeto.data
  }

  throw new Error('La API devolvió un formato de productos no válido.')
}

/**
 * Convierte la respuesta de la API (o un archivo local) en una lista limpia:
 * IDs y nombres válidos, solo productos activos, sin repetidos, precios
 * numéricos y ordenada por nombre.
 */
export function normalizarProductos(crudo: unknown): ResultadoNormalizacion {
  const lista = extraerLista(crudo)
  const porId = new Map<string, ProductoCatalogo>()
  let descartados = 0

  for (const item of lista) {
    if (!item || typeof item !== 'object') {
      descartados++
      continue
    }

    const registro = item as Record<string, unknown>

    const id =
      typeof registro.id === 'string' || typeof registro.id === 'number'
        ? String(registro.id).trim()
        : ''

    const nombre = typeof registro.nombre === 'string' ? registro.nombre.trim() : ''

    if (!id || !nombre || registro.activo === false || porId.has(id)) {
      descartados++
      continue
    }

    porId.set(id, {
      id,
      nombre,
      precio_compra: aNumero(registro.precio_compra)
    })
  }

  const productos = [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return { productos, descartados }
}
