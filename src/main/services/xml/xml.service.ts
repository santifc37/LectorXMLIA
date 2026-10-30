import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import { analizarXML } from './xml.utils'
import type { AnalisisXML } from './xml.utils'

export type { ResumenFactura, TipoDocumento } from './xml.utils'

export interface ArchivoXML extends AnalisisXML {
  nombre: string
  /** Contenido completo del archivo, tal como se seleccionó. */
  contenido: string
}

// Una factura electrónica pesa normalmente unos pocos KB.
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024

export async function leerArchivoXML(ruta: string): Promise<ArchivoXML> {
  const { size } = await stat(ruta)

  if (size > TAMANO_MAXIMO_BYTES) {
    throw new Error('El archivo supera los 10 MB y no parece una factura electrónica.')
  }

  const contenido = await readFile(ruta, 'utf-8')

  if (!contenido.trim()) {
    throw new Error('El archivo XML está vacío.')
  }

  return {
    nombre: basename(ruta),
    contenido,
    ...analizarXML(contenido)
  }
}
