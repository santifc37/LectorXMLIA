import { app } from 'electron'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

/**
 * Configuración central de la aplicación.
 *
 * El archivo .env se busca, en este orden (el primero que defina una
 * variable gana):
 *   1. Junto al ejecutable (aplicación instalada).
 *   2. En la carpeta de datos del usuario (aplicación instalada).
 *   3. En la raíz del proyecto (desarrollo).
 *
 * Nota: el .env no se empaqueta dentro de la aplicación, por eso en
 * Windows debe estar junto al .exe o en la carpeta de datos del usuario.
 */
function rutasEnv(): string[] {
  const rutas: string[] = []

  if (app.isPackaged) {
    rutas.push(join(dirname(process.execPath), '.env'))
    rutas.push(join(app.getPath('userData'), '.env'))
  }

  rutas.push(join(app.getAppPath(), '.env'))

  return rutas
}

function cargarEnv(): void {
  for (const ruta of rutasEnv()) {
    if (existsSync(ruta)) {
      dotenv.config({ path: ruta, quiet: true })
    }
  }
}

cargarEnv()

function limpiar(valor: string | undefined): string | undefined {
  const texto = valor?.trim()
  return texto ? texto : undefined
}

export const config = {
  /** URL base de la API de la ferretería, sin barra final. */
  get apiUrl(): string | undefined {
    const url = limpiar(process.env.API_URL) ?? limpiar(process.env.FERRETERIA_API_URL)

    return url?.replace(/\/+$/, '')
  },

  get geminiApiKey(): string | undefined {
    return limpiar(process.env.GEMINI_API_KEY)
  },

  get geminiModel(): string {
    return limpiar(process.env.GEMINI_MODEL) ?? 'gemini-3.6-flash'
  },

  /**
   * true si el precio de compra guardado en el inventario ya incluye IVA.
   * Por defecto se asume que NO lo incluye.
   */
  get precioCompraIncluyeIva(): boolean {
    const valor = limpiar(process.env.PRECIO_COMPRA_INCLUYE_IVA)?.toLowerCase()

    return valor === 'true' || valor === '1' || valor === 'si' || valor === 'sí'
  }
}

/**
 * Carpeta donde se guardan los datos locales (catálogo, progreso, historial).
 * - Desarrollo: carpeta "data" del proyecto.
 * - Instalada: carpeta de datos del usuario (la aplicación empaquetada es de
 *   solo lectura).
 */
export function carpetaDatos(): string {
  return app.isPackaged ? join(app.getPath('userData'), 'data') : join(app.getAppPath(), 'data')
}

export function rutaCatalogo(): string {
  return join(carpetaDatos(), 'productos.json')
}
