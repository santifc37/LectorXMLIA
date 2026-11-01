import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { config } from '../../config'
import { ErrorRespuestaGemini, clasificarError, mensajeFinal } from './gemini.errores'

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

  const MAX_INTENTOS = 4
  let ultimoError: unknown

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      const resultado = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM
          }
        }
      })

      return {
        modelo: MODEL,
        respuesta: JSON.stringify(validarRespuesta(resultado.text), null, 2)
      }
    } catch (error) {
      ultimoError = error

      const { tipo, esperaMs } = clasificarError(error)

      // Sin cuota, o ante un error desconocido, reintentar no sirve. Una
      // respuesta inválida se repite una sola vez.
      if (tipo === 'cuota' || tipo === 'otro') break
      if (tipo === 'respuesta' && intento >= 2) break
      if (intento === MAX_INTENTOS) break

      // Espera progresiva (3 s, 6 s, 9 s) o la que indique Gemini, hasta 60 s.
      await esperar(Math.min(esperaMs ?? intento * 3000, 60000))
    }
  }

  throw new Error(mensajeFinal(ultimoError), { cause: ultimoError })
}

function validarRespuesta(texto: string | undefined): FacturaExtraida {
  if (!texto) {
    throw new ErrorRespuestaGemini('Gemini no devolvió información.')
  }

  let datos: FacturaExtraida

  try {
    datos = JSON.parse(texto) as FacturaExtraida
  } catch {
    throw new ErrorRespuestaGemini('Gemini devolvió una respuesta que no es JSON válido.')
  }

  if (
    typeof datos.documento_valido !== 'boolean' ||
    !Array.isArray(datos.productos) ||
    !Array.isArray(datos.observaciones)
  ) {
    throw new ErrorRespuestaGemini('La estructura de datos devuelta por Gemini no es válida.')
  }

  return datos
}
