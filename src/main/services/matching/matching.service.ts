
export interface ProductoCatalogo {
  id: string
  nombre: string
  precio?: number
  precio_compra?: number | null
  codigo?: string | null
  sku?: string | null
  codigo_barras?: string | null
  codigo_interno?: string | null
  codigo_proveedor?: string | null
  referencia?: string | null
}

export interface LineaFactura {
  descripcion: string
  cantidad?: number | null
  codigo_proveedor?: string | null
  codigo_comprador?: string | null
  codigo_barras?: string | null
}

export interface ResultadoCoincidencia {
  productoFactura: string
  estado: 'coincidencia_alta' | 'revision_manual' | 'sin_coincidencia'
  puntuacion: number
  motivo: string
  candidatos: {
    id: string
    nombre: string
    precio: number | null
    puntuacion: number
    motivo: string
    codigo?: string | null
  }[]
  productoSeleccionadoId: string | null
}

interface ProductoPreparado {
  original: ProductoCatalogo
  tokens: string[]
  tokensImportantes: string[]
  caracteristicas: Set<string>
  trigramas: Set<string>
}

const PALABRAS_IGNORABLES = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'o',
  'para', 'por', 'con', 'sin', 'en', 'un', 'una',
  'unos', 'unas', 'tipo', 'referencia', 'ref',
  'producto', 'und', 'unidad', 'unidades'
])

// Variantes frecuentes de marcas y términos comerciales.
const ALIAS: Record<string, string> = {
  'b d': 'blackdecker',
  'bd': 'blackdecker',
  'black decker': 'blackdecker',
  'blackanddecker': 'blackdecker',
  'pvc': 'pvc',
  'inox': 'inoxidable',
  'inoxid': 'inoxidable',
  'p/concreto': 'concreto',
  'p/madera': 'madera',
  'p/metal': 'metal',
  'pulidora': 'esmeriladora',
  'esmeril': 'esmeriladora'
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .replace(/[^a-z0-9./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function aplicarAlias(texto: string): string {
  let resultado = ` ${texto} `

  for (const [alias, reemplazo] of Object.entries(ALIAS)) {
    const patron = new RegExp(
      `\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'g'
    )
    resultado = resultado.replace(patron, ` ${reemplazo} `)
  }

  return resultado.replace(/\s+/g, ' ').trim()
}

function obtenerTokens(texto: string): string[] {
  return aplicarAlias(normalizar(texto))
    .split(' ')
    .filter(token => token.length > 0 && !PALABRAS_IGNORABLES.has(token))
}

function obtenerCaracteristicas(texto: string): Set<string> {
  const normalizado = normalizar(texto)
  const caracteristicas = new Set<string>()

  // Números, medidas y referencias: 1/4, 4.5, 280, 400, 12, etc.
  const numeros = normalizado.match(/\d+(?:\.\d+)?(?:\/\d+)?/g) || []

  for (const numero of numeros) {
    caracteristicas.add(`num:${numero}`)
  }

  // Unidades y características técnicas importantes.
  const unidades = [
    'mm', 'cm', 'm', 'ml', 'l', 'lt', 'kg', 'gr', 'g',
    'w', 'kw', 'v', 'hz', 'pulgadas', 'pulgada',
    'galon', 'galones'
  ]

  const palabras = normalizado.split(' ')

  for (let i = 0; i < palabras.length; i++) {
    const palabra = palabras[i]

    if (unidades.includes(palabra)) {
      caracteristicas.add(`unidad:${palabra}`)
    }

    // Detecta expresiones como 280 ml, 30 w, 1/4 pulgada.
    if (
      /^\d/.test(palabra) &&
      unidades.includes(palabras[i + 1])
    ) {
      caracteristicas.add(`medida:${palabra}:${palabras[i + 1]}`)
    }
  }

  return caracteristicas
}

function obtenerTrigramas(texto: string): Set<string> {
  const limpio = `  ${texto}  `
  const resultado = new Set<string>()

  for (let i = 0; i <= limpio.length - 3; i++) {
    resultado.add(limpio.slice(i, i + 3))
  }

  return resultado
}

function prepararProducto(producto: ProductoCatalogo): ProductoPreparado {
  const tokens = obtenerTokens(producto.nombre)

  return {
    original: producto,
    tokens,
    tokensImportantes: tokens.filter(token => token.length > 1),
    caracteristicas: obtenerCaracteristicas(producto.nombre),
    trigramas: obtenerTrigramas(tokens.join(' '))
  }
}

function similitudConjuntos(
  a: Set<string>,
  b: Set<string>
): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0

  let comunes = 0

  for (const valor of a) {
    if (b.has(valor)) comunes++
  }

  return (2 * comunes) / (a.size + b.size)
}

function similitudTokens(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0

  const conjuntoA = new Set(a)
  const conjuntoB = new Set(b)

  let comunes = 0

  for (const token of conjuntoA) {
    if (conjuntoB.has(token)) comunes++
  }

  // F1: considera tanto cuánto cubre la factura como cuánto cubre el catálogo.
  const precision = comunes / conjuntoB.size
  const cobertura = comunes / conjuntoA.size

  if (precision + cobertura === 0) return 0

  return (2 * precision * cobertura) / (precision + cobertura)
}

function compararCaracteristicas(
  factura: Set<string>,
  catalogo: Set<string>
): { penalizacion: number; motivo: string | null } {
  if (factura.size === 0 || catalogo.size === 0) {
    return { penalizacion: 0, motivo: null }
  }

  const diferencias: string[] = []

  for (const caracteristica of factura) {
    if (!catalogo.has(caracteristica)) {
      diferencias.push(caracteristica)
    }
  }

  // Las diferencias de números o medidas reducen la confianza.
  const numerosFactura = [...factura].filter(x => x.startsWith('num:'))
  const numerosCatalogo = [...catalogo].filter(x => x.startsWith('num:'))

  let penalizacion = 0

  if (numerosFactura.length && numerosCatalogo.length) {
    const iguales = numerosFactura.filter(x => catalogo.has(x)).length

    if (iguales === 0) {
      penalizacion += 35
    } else if (iguales < Math.min(numerosFactura.length, numerosCatalogo.length)) {
      penalizacion += 12
    }
  }

  const medidasFactura = [...factura].filter(x => x.startsWith('medida:'))
  const medidasCatalogo = [...catalogo].filter(x => x.startsWith('medida:'))

  if (medidasFactura.length && medidasCatalogo.length) {
    const iguales = medidasFactura.filter(x => catalogo.has(x)).length

    if (iguales === 0) {
      penalizacion += 30
    }
  }

  const motivo =
    diferencias.length > 0
      ? `Diferencias en características: ${diferencias.join(', ')}`
      : null

  return {
    penalizacion: Math.min(penalizacion, 55),
    motivo
  }
}

function calcularPuntuacion(
  factura: string,
  producto: ProductoPreparado
): { puntuacion: number; motivo: string } {
  const tokensFactura = obtenerTokens(factura)
  const caracteristicasFactura = obtenerCaracteristicas(factura)
  const trigramasFactura = obtenerTrigramas(tokensFactura.join(' '))

  if (!tokensFactura.length || !producto.tokens.length) {
    return { puntuacion: 0, motivo: 'No hay suficientes palabras para comparar.' }
  }

  const tokens = similitudTokens(
    tokensFactura,
    producto.tokensImportantes
  )

  const trigramas = similitudConjuntos(
    trigramasFactura,
    producto.trigramas
  )

  const caracteristicas = compararCaracteristicas(
    caracteristicasFactura,
    producto.caracteristicas
  )

  // La coincidencia de palabras tiene mayor peso que la similitud textual.
  let puntuacion = tokens * 75 + trigramas * 25

  puntuacion -= caracteristicas.penalizacion

  puntuacion = Math.max(0, Math.min(100, Math.round(puntuacion)))

  let motivo = 'Coincidencia basada en similitud de nombres.'

  if (tokens >= 0.85) {
    motivo = 'Coinciden la mayoría de las palabras del producto.'
  } else if (trigramas >= 0.65) {
    motivo = 'Se encontró similitud en la escritura del nombre.'
  }

  if (caracteristicas.motivo) {
    motivo += ` ${caracteristicas.motivo}.`
  }

  return { puntuacion, motivo }
}

function obtenerPrecio(producto: ProductoCatalogo): number | null {
  if (typeof producto.precio === 'number') return producto.precio
  if (typeof producto.precio_compra === 'number') return producto.precio_compra
  return null
}

function normalizarCodigo(valor: unknown): string {
  if (valor === null || valor === undefined) return ''

  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function obtenerCodigosProducto(producto: ProductoCatalogo): string[] {
  return [
    producto.codigo,
    producto.sku,
    producto.codigo_barras,
    producto.codigo_interno,
    producto.codigo_proveedor,
    producto.referencia
  ]
    .map(normalizarCodigo)
    .filter(Boolean)
}

function obtenerCodigoFactura(linea: LineaFactura): string[] {
  return [
    linea.codigo_barras,
    linea.codigo_comprador,
    linea.codigo_proveedor
  ]
    .map(normalizarCodigo)
    .filter(Boolean)
}

function coincidePorCodigo(
  linea: LineaFactura,
  producto: ProductoCatalogo
): boolean {
  const codigosFactura = obtenerCodigoFactura(linea)
  const codigosProducto = obtenerCodigosProducto(producto)

  return codigosFactura.some(codigo => codigosProducto.includes(codigo))
}

function obtenerCodigoVisible(producto: ProductoCatalogo): string | null {
  return (
    producto.codigo_barras ??
    producto.sku ??
    producto.codigo ??
    producto.codigo_interno ??
    producto.codigo_proveedor ??
    producto.referencia ??
    null
  )
}

export function compararProducto(
  linea: LineaFactura,
  catalogo: ProductoCatalogo[]
): ResultadoCoincidencia {
  const preparados = catalogo
    .filter(p => p.id && p.nombre)
    .map(prepararProducto)

  const candidatos = preparados
    .map(producto => {
      const codigoExacto = coincidePorCodigo(linea, producto.original)

      const resultado = codigoExacto
        ? {
            puntuacion: 100,
            motivo: 'Coincidencia exacta por código de producto.'
          }
        : calcularPuntuacion(linea.descripcion, producto)

      return {
        id: producto.original.id,
        nombre: producto.original.nombre,
        precio: obtenerPrecio(producto.original),
        puntuacion: resultado.puntuacion,
        motivo: resultado.motivo,
        codigo: obtenerCodigoVisible(producto.original)
      }
    })
    .sort((a, b) => b.puntuacion - a.puntuacion)
    .slice(0, 8)

  const mejor = candidatos[0]

  if (!mejor || mejor.puntuacion < 45) {
    return {
      productoFactura: linea.descripcion,
      estado: 'sin_coincidencia',
      puntuacion: mejor?.puntuacion ?? 0,
      motivo: 'No se encontró un producto suficientemente parecido.',
      candidatos,
      productoSeleccionadoId: null
    }
  }

  if (mejor.puntuacion >= 88) {
    return {
      productoFactura: linea.descripcion,
      estado: 'coincidencia_alta',
      puntuacion: mejor.puntuacion,
      motivo: mejor.motivo,
      candidatos,
      productoSeleccionadoId: null
    }
  }

  return {
    productoFactura: linea.descripcion,
    estado: 'revision_manual',
    puntuacion: mejor.puntuacion,
    motivo: mejor.motivo,
    candidatos,
    productoSeleccionadoId: null
  }
}

export function compararFacturaConCatalogo(
  lineas: LineaFactura[],
  catalogo: ProductoCatalogo[]
): ResultadoCoincidencia[] {
  return lineas.map(linea => compararProducto(linea, catalogo))
}
