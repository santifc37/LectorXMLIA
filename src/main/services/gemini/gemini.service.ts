import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { config } from '../../config'

const API_KEY = config.geminiApiKey
const MODEL = config.geminiModel

export interface ProductoFactura {
  descripcion: string
  codigo_proveedor: string | null
  codigo_comprador: string | null
  codigo_barras: string | null
  cantidad: number | null
  unidad: string | null
  precio_unitario: number | null
  descuento: number | null
  subtotal: number | null
  impuestos: {
    tipo: string
    porcentaje: number | null
    valor: number | null
  }[]
  total_linea: number | null
}

export interface FacturaExtraida {
  documento_valido: boolean
  tipo_documento: string | null
  proveedor: {
    nombre: string | null
    nit: string | null
  }
  factura: {
    numero: string | null
    fecha: string | null
    moneda: string | null
  }
  productos: ProductoFactura[]
  observaciones: string[]
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function esErrorTemporal(error: unknown): boolean {
  const mensaje =
    error instanceof Error ? error.message : String(error)

  return /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|500|502|504/i.test(mensaje)
}

export async function procesarXMLConGemini(
  xml: string
): Promise<{ modelo: string; respuesta: string }> {
  if (!API_KEY) {
    throw new Error('No está configurada GEMINI_API_KEY en el archivo .env')
  }

  if (!xml.trim()) {
    throw new Error('No se recibió contenido XML.')
  }

  const ai = new GoogleGenAI({
    apiKey: API_KEY
  })

  const prompt = `
Eres un sistema especializado en leer facturas electrónicas
de Colombia emitidas bajo los estándares de la DIAN.

Tu tarea es extraer información del XML proporcionado.

REGLAS OBLIGATORIAS:

1. Analiza el XML completo.
2. No inventes información.
3. No completes datos que no estén presentes.
4. Si un campo no aparece o no puede identificarse, utiliza null.
5. Conserva los códigos originales, incluyendo ceros iniciales.
6. No confundas el código del proveedor con el código del comprador.
7. Extrae cada producto como una línea independiente.
8. No agrupes productos aunque tengan la misma descripción.
9. Conserva las cantidades y los precios numéricos.
10. No confundas el precio unitario con el subtotal.
11. Identifica los impuestos por producto cuando estén disponibles.
12. Si el documento es una nota crédito o débito, identifícalo.
13. Si el XML no corresponde a una factura o documento relacionado,
    indica documento_valido como false.
14. No utilices información externa al XML.

DEVUELVE ÚNICAMENTE UN JSON VÁLIDO CON ESTA ESTRUCTURA:

{
  "documento_valido": true,
  "tipo_documento": "factura",
  "proveedor": {
    "nombre": "Nombre del proveedor",
    "nit": "NIT del proveedor"
  },
  "factura": {
    "numero": "Número de factura",
    "fecha": "Fecha del documento",
    "moneda": "COP"
  },
  "productos": [
    {
      "descripcion": "Descripción original del producto",
      "codigo_proveedor": null,
      "codigo_comprador": null,
      "codigo_barras": null,
      "cantidad": 1,
      "unidad": "UND",
      "precio_unitario": 1000,
      "descuento": 0,
      "subtotal": 1000,
      "impuestos": [
        {
          "tipo": "IVA",
          "porcentaje": 19,
          "valor": 190
        }
      ],
      "total_linea": 1190
    }
  ],
  "observaciones": []
}

Si no hay productos, devuelve un arreglo vacío.
Si algún dato no existe, utiliza null.
Si no hay impuestos identificables, devuelve un arreglo vacío.

IMPORTANTE:
El ejemplo anterior solo representa la estructura.
No copies sus valores en la respuesta.

XML DE LA FACTURA:

${xml}
`

  let resultado

for (let intento = 1; intento <= 3; intento++) {
  try {
    resultado = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MEDIUM
        }
      }
    })

    break
  } catch (error) {
    if (!esErrorTemporal(error) || intento === 3) {
      throw new Error(
        intento === 3 && esErrorTemporal(error)
          ? 'Gemini sigue experimentando alta demanda. Intenta nuevamente dentro de unos minutos.'
          : error instanceof Error
            ? error.message
            : 'Error al comunicarse con Gemini.',
        { cause: error }
      )
    }

    await esperar(intento * 3000)
  }
}

if (!resultado) {
  throw new Error('No se pudo obtener una respuesta de Gemini.')
}

  const texto = resultado.text

  if (!texto) {
    throw new Error('Gemini no devolvió información.')
  }

  let datos: FacturaExtraida

  try {
    datos = JSON.parse(texto) as FacturaExtraida
  } catch {
    throw new Error('Gemini devolvió una respuesta que no es JSON válido.')
  }

  if (
    typeof datos.documento_valido !== 'boolean' ||
    !Array.isArray(datos.productos) ||
    !Array.isArray(datos.observaciones)
  ) {
    throw new Error('La estructura de datos devuelta por Gemini no es válida.')
  }

  return {
    modelo: MODEL,
    respuesta: JSON.stringify(datos, null, 2)
  }
}
