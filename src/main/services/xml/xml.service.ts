import { readFile } from 'fs/promises'
import { basename } from 'path'

export interface ArchivoXML {
  nombre: string
  contenido: string
  valido: boolean
  mensaje: string
  tipoDocumento: 'factura' | 'nota_credito' | 'nota_debito' | 'desconocido'
}

export async function leerArchivoXML(ruta: string): Promise<ArchivoXML> {
  const contenido = await readFile(ruta, 'utf-8')

  if (!contenido.trim()) {
    throw new Error('El archivo XML está vacío.')
  }

  return {
    nombre: basename(ruta),
    contenido,
    valido: true,
    mensaje: 'Archivo XML recibido correctamente. Pendiente de procesamiento.',
    tipoDocumento: 'desconocido'
  }
}