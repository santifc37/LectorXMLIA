/**
 * Utilidades puras del catálogo (sin dependencias de Electron),
 * para poder probarlas fácilmente.
 */

export interface ProductoCatalogo {
  id: string
  nombre: string
  precio_compra: number | null
  codigo?: string | null
  sku?: string | null
  codigo_barras?: string | null
  codigo_interno?: string | null
  codigo_proveedor?: string | null
  referencia?: string | null
}

export interface ResultadoNormalizacion {
  productos: ProductoCatalogo[]
  /** Registros ignorados: sin ID o nombre, inactivos o repetidos. */
  descartados: number
}

function campoTexto(registro: Record<string, unknown>, campo: string): string | null {
  const valor = registro[campo]

  if (typeof valor !== 'string' && typeof valor !== 'number') return null

  const texto = String(valor).trim()
  return texto || null
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
      precio_compra: aNumero(registro.precio_compra),
      codigo: campoTexto(registro, 'codigo'),
      sku: campoTexto(registro, 'sku'),
      codigo_barras:
        campoTexto(registro, 'codigo_barras') ??
        campoTexto(registro, 'barcode') ??
        campoTexto(registro, 'codigoBarras'),
      codigo_interno:
        campoTexto(registro, 'codigo_interno') ??
        campoTexto(registro, 'codigoInterno'),
      codigo_proveedor: campoTexto(registro, 'codigo_proveedor'),
      referencia:
        campoTexto(registro, 'referencia') ??
        campoTexto(registro, 'ref')
    })
  }

  const productos = [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return { productos, descartados }
}
