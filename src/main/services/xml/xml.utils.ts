/**
 * Análisis local de facturas electrónicas DIAN (UBL 2.1).
 * No usa Gemini y no depende de Electron, para poder probarlo fácilmente.
 *
 * Reconoce tres formas de archivo:
 *   - Invoice / CreditNote / DebitNote directamente.
 *   - AttachedDocument: contenedor que entrega la DIAN, con la factura
 *     real incrustada como texto dentro del XML.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser'

export type TipoDocumento = 'factura' | 'nota_credito' | 'nota_debito' | 'desconocido'

export interface ResumenFactura {
  numero: string | null
  fecha: string | null
  /** Identificador único del documento (CUFE). */
  cufe: string | null
  moneda: string | null
  proveedorNombre: string | null
  proveedorNit: string | null
  compradorNombre: string | null
  compradorNit: string | null
  /** Cantidad de líneas de producto que trae el XML. */
  lineas: number
  total: number | null
  /** Suma de las líneas, con descuentos de línea y sin impuestos. */
  subtotal: number | null
}

export interface AnalisisXML {
  /** true solo si es una factura que se puede procesar. */
  valido: boolean
  mensaje: string
  tipoDocumento: TipoDocumento
  /** XML de la factura en sí (sin el contenedor AttachedDocument). */
  contenidoFactura: string
  resumen: ResumenFactura | null
}

type Nodo = Record<string, unknown>

const RAICES: Record<string, TipoDocumento> = {
  Invoice: 'factura',
  CreditNote: 'nota_credito',
  DebitNote: 'nota_debito'
}

const ETIQUETA_LINEA: Record<string, string> = {
  factura: 'InvoiceLine',
  nota_credito: 'CreditNoteLine',
  nota_debito: 'DebitNoteLine'
}

const NOMBRES_DE_LINEA = Object.values(ETIQUETA_LINEA)

const NOMBRE_DOCUMENTO: Record<string, string> = {
  nota_credito: 'una nota crédito',
  nota_debito: 'una nota débito'
}

// Se conservan los valores como texto para no perder ceros iniciales
// en NIT, números de factura y códigos.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (nombre) => NOMBRES_DE_LINEA.includes(nombre)
})

function esNodo(valor: unknown): valor is Nodo {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null
  if (typeof valor === 'number') return String(valor)
  if (Array.isArray(valor)) return texto(valor[0])
  if (esNodo(valor)) return texto(valor['#text'])
  return null
}

function numero(valor: unknown): number | null {
  const contenido = texto(valor)

  if (!contenido) return null

  const resultado = Number(contenido)

  return Number.isFinite(resultado) ? resultado : null
}

/** Recorre una ruta de etiquetas ("A", "B", "C") tomando el primer elemento si hay varios. */
function hijo(nodo: unknown, ...ruta: string[]): unknown {
  let actual: unknown = nodo

  for (const etiqueta of ruta) {
    if (Array.isArray(actual)) actual = actual[0]
    if (!esNodo(actual)) return undefined
    actual = actual[etiqueta]
  }

  return actual
}

function datosParte(parte: unknown): { nombre: string | null; nit: string | null } {
  const nombre =
    texto(hijo(parte, 'Party', 'PartyTaxScheme', 'RegistrationName')) ??
    texto(hijo(parte, 'Party', 'PartyLegalEntity', 'RegistrationName')) ??
    texto(hijo(parte, 'Party', 'PartyName', 'Name'))

  const nit =
    texto(hijo(parte, 'Party', 'PartyTaxScheme', 'CompanyID')) ??
    texto(hijo(parte, 'Party', 'PartyLegalEntity', 'CompanyID'))

  return { nombre, nit }
}

/** Quita el marcador BOM del inicio (si lo hay) y los espacios sobrantes. */
function limpiarTexto(valor: string): string {
  const sinBom = valor.charCodeAt(0) === 0xfeff ? valor.slice(1) : valor

  return sinBom.trim()
}

const PATRON_DOCUMENTO = /^(<\?xml[^>]*\?>\s*)?<(\w+:)?(Invoice|CreditNote|DebitNote)[\s>]/

/** Busca, dentro del contenedor, un texto que sea a su vez un XML de factura. */
function buscarXmlIncrustado(nodo: unknown, profundidad = 0): string | null {
  if (profundidad > 12) return null

  if (typeof nodo === 'string') {
    const contenido = limpiarTexto(nodo)
    return PATRON_DOCUMENTO.test(contenido) ? contenido : null
  }

  const hijos = Array.isArray(nodo) ? nodo : esNodo(nodo) ? Object.values(nodo) : []

  for (const elemento of hijos) {
    const encontrado = buscarXmlIncrustado(elemento, profundidad + 1)
    if (encontrado) return encontrado
  }

  return null
}

function invalido(
  mensaje: string,
  tipoDocumento: TipoDocumento = 'desconocido',
  contenidoFactura = '',
  resumen: ResumenFactura | null = null
): AnalisisXML {
  return { valido: false, mensaje, tipoDocumento, contenidoFactura, resumen }
}

function comprobarFormato(xml: string): string | null {
  const resultado = XMLValidator.validate(xml)

  if (resultado === true) return null

  return `El archivo no es un XML válido (línea ${resultado.err.line}): ${resultado.err.msg}`
}

export function analizarXML(contenido: string): AnalisisXML {
  const xml = limpiarTexto(contenido)

  if (!xml) return invalido('El archivo está vacío.')

  const errorFormato = comprobarFormato(xml)
  if (errorFormato) return invalido(errorFormato)

  let arbol: Nodo

  try {
    arbol = parser.parse(xml) as Nodo
  } catch {
    return invalido('No se pudo leer la estructura del XML.')
  }

  let xmlFactura = xml
  let raizNombre = Object.keys(arbol).find((clave) => clave in RAICES)

  // La DIAN suele entregar la factura dentro de un AttachedDocument.
  if (!raizNombre && 'AttachedDocument' in arbol) {
    const incrustado = buscarXmlIncrustado(arbol.AttachedDocument)

    if (!incrustado) {
      return invalido(
        'El archivo es un contenedor de la DIAN (AttachedDocument), pero no incluye la factura dentro.'
      )
    }

    const errorIncrustado = comprobarFormato(incrustado)
    if (errorIncrustado)
      return invalido(`La factura incluida en el contenedor es inválida. ${errorIncrustado}`)

    try {
      arbol = parser.parse(incrustado) as Nodo
    } catch {
      return invalido('No se pudo leer la factura incluida en el contenedor.')
    }

    xmlFactura = incrustado
    raizNombre = Object.keys(arbol).find((clave) => clave in RAICES)
  }

  if (!raizNombre) {
    return invalido(
      'No parece una factura electrónica de la DIAN (no se encontró Invoice, CreditNote ni DebitNote).'
    )
  }

  const tipoDocumento = RAICES[raizNombre]
  const raiz = arbol[raizNombre]

  const lineas = hijo(raiz, ETIQUETA_LINEA[tipoDocumento])

  const proveedor = datosParte(hijo(raiz, 'AccountingSupplierParty'))
  const comprador = datosParte(hijo(raiz, 'AccountingCustomerParty'))

  const resumen: ResumenFactura = {
    numero: texto(hijo(raiz, 'ID')),
    fecha: texto(hijo(raiz, 'IssueDate')),
    cufe: texto(hijo(raiz, 'UUID')),
    moneda: texto(hijo(raiz, 'DocumentCurrencyCode')),
    proveedorNombre: proveedor.nombre,
    proveedorNit: proveedor.nit,
    compradorNombre: comprador.nombre,
    compradorNit: comprador.nit,
    lineas: Array.isArray(lineas) ? lineas.length : 0,
    total:
      numero(hijo(raiz, 'LegalMonetaryTotal', 'PayableAmount')) ??
      numero(hijo(raiz, 'RequestedMonetaryTotal', 'PayableAmount')),
    subtotal:
      numero(hijo(raiz, 'LegalMonetaryTotal', 'LineExtensionAmount')) ??
      numero(hijo(raiz, 'RequestedMonetaryTotal', 'LineExtensionAmount'))
  }

  if (tipoDocumento !== 'factura') {
    return invalido(
      `El documento es ${NOMBRE_DOCUMENTO[tipoDocumento]}. Este importador solo procesa facturas y no registra entradas con este tipo de documento.`,
      tipoDocumento,
      xmlFactura,
      resumen
    )
  }

  if (!resumen.numero || !resumen.proveedorNit) {
    return invalido(
      'No se pudo identificar el proveedor o el número de la factura. Son necesarios para evitar importaciones duplicadas.',
      tipoDocumento,
      xmlFactura,
      resumen
    )
  }

  if (resumen.lineas === 0) {
    return invalido(
      'La factura no contiene líneas de productos.',
      tipoDocumento,
      xmlFactura,
      resumen
    )
  }

  return {
    valido: true,
    mensaje: `Factura ${resumen.numero} de ${resumen.proveedorNombre ?? resumen.proveedorNit}: ${resumen.lineas} ${resumen.lineas === 1 ? 'línea' : 'líneas'}.`,
    tipoDocumento,
    contenidoFactura: xmlFactura,
    resumen
  }
}
