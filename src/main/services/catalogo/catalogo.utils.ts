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

/** Productos de la API que todavía no están en la copia local (por ID). */
export function productosNuevos(
  desdeApi: ProductoCatalogo[],
  local: ProductoCatalogo[]
): ProductoCatalogo[] {
  const idsLocales = new Set(local.map((producto) => producto.id))

  return desdeApi.filter((producto) => !idsLocales.has(producto.id))
}

/**
 * Agrega productos a la copia local conservando el mismo formato de
 * data/productos.json: sin repetidos (gana el que ya estaba) y ordenada por nombre.
 */
export function fusionarCatalogo(
  local: ProductoCatalogo[],
  agregar: ProductoCatalogo[]
): ProductoCatalogo[] {
  return normalizarProductos([...local, ...agregar]).productos
}

export interface DatosProductoNuevo {
  codigo: string
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  categoria_id: string
  unidad_base_id: string
  precio_compra: number
  precio_venta: number
  stock_minimo: number
}

function numeroNoNegativo(valor: unknown, etiqueta: string): number {
  const numero = typeof valor === 'string' && valor.trim() ? Number(valor) : valor

  if (typeof numero !== 'number' || !Number.isFinite(numero) || numero < 0) {
    throw new Error(`${etiqueta} debe ser un número no negativo.`)
  }

  return numero
}

function textoObligatorio(valor: unknown, etiqueta: string): string {
  const texto = typeof valor === 'string' ? valor.trim() : ''

  if (!texto) throw new Error(`${etiqueta} es obligatorio.`)

  return texto
}

function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

/** Valida y limpia los datos del formulario antes de enviarlos a la API. */
export function validarProductoNuevo(entrada: unknown): DatosProductoNuevo {
  if (!entrada || typeof entrada !== 'object') {
    throw new Error('Datos del producto no válidos.')
  }

  const datos = entrada as Record<string, unknown>

  return {
    codigo: textoObligatorio(datos.codigo, 'El código'),
    codigo_barras: textoOpcional(datos.codigo_barras),
    nombre: textoObligatorio(datos.nombre, 'El nombre'),
    descripcion: textoOpcional(datos.descripcion),
    categoria_id: textoObligatorio(datos.categoria_id, 'La categoría'),
    unidad_base_id: textoObligatorio(datos.unidad_base_id, 'La unidad base'),
    precio_compra: numeroNoNegativo(datos.precio_compra, 'El precio de compra'),
    precio_venta: numeroNoNegativo(datos.precio_venta, 'El precio de venta'),
    stock_minimo: numeroNoNegativo(datos.stock_minimo, 'El stock mínimo')
  }
}
