/**
 * Progreso local de cada factura (README, sección 7).
 *
 * Guarda en disco la extracción de Gemini, las coincidencias y las decisiones
 * del usuario, para poder continuar sin repetir consultas si la aplicación se
 * cierra o Gemini deja de responder. Se identifica por el contenido del XML.
 */
import { createHash } from 'crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { carpetaDatos } from '../../config'

export interface ProgresoFactura {
  version: 1
  archivo: string
  guardadoEn: string
  respuestaGemini: { modelo: string; respuesta: string }
  coincidencias: unknown[]
  incluidas: Record<string, boolean>
  preciosAutorizados: Record<string, boolean>
}

function rutaProgreso(contenidoFactura: string): string {
  const clave = createHash('sha256').update(contenidoFactura).digest('hex').slice(0, 32)

  return join(carpetaDatos(), 'progreso', `${clave}.json`)
}

function esProgresoValido(valor: unknown): valor is ProgresoFactura {
  if (!valor || typeof valor !== 'object') return false

  const datos = valor as Record<string, unknown>
  const gemini = datos.respuestaGemini as Record<string, unknown> | undefined

  return (
    datos.version === 1 &&
    typeof datos.archivo === 'string' &&
    typeof datos.guardadoEn === 'string' &&
    !!gemini &&
    typeof gemini.modelo === 'string' &&
    typeof gemini.respuesta === 'string' &&
    Array.isArray(datos.coincidencias) &&
    !!datos.incluidas &&
    typeof datos.incluidas === 'object' &&
    !!datos.preciosAutorizados &&
    typeof datos.preciosAutorizados === 'object'
  )
}

export async function guardarProgreso(
  contenidoFactura: string,
  datos: Omit<ProgresoFactura, 'version' | 'guardadoEn'>
): Promise<void> {
  if (typeof contenidoFactura !== 'string' || !contenidoFactura) return

  const ruta = rutaProgreso(contenidoFactura)
  const temporal = `${ruta}.tmp`

  const progreso: ProgresoFactura = {
    ...datos,
    version: 1,
    guardadoEn: new Date().toISOString()
  }

  if (!esProgresoValido(progreso)) {
    throw new Error('El progreso de la factura no tiene un formato válido.')
  }

  await mkdir(join(carpetaDatos(), 'progreso'), { recursive: true })

  // Se escribe en un temporal y luego se reemplaza para no dejar archivos a medias.
  await writeFile(temporal, JSON.stringify(progreso), 'utf-8')
  await rename(temporal, ruta)
}

/** Devuelve el progreso guardado de esta factura, o null si no hay o está dañado. */
export async function leerProgreso(contenidoFactura: string): Promise<ProgresoFactura | null> {
  if (typeof contenidoFactura !== 'string' || !contenidoFactura) return null

  try {
    const datos: unknown = JSON.parse(await readFile(rutaProgreso(contenidoFactura), 'utf-8'))

    return esProgresoValido(datos) ? datos : null
  } catch {
    return null
  }
}

export async function borrarProgreso(contenidoFactura: string): Promise<void> {
  if (typeof contenidoFactura !== 'string' || !contenidoFactura) return

  await rm(rutaProgreso(contenidoFactura), { force: true })
}
