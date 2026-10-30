import { app } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'

export interface Producto {
  id: string
  nombre: string
  precio_compra: number
}

export async function obtenerProductos(): Promise<Producto[]> {
  const ruta = app.isPackaged
    ? join(process.resourcesPath, 'data', 'productos.json')
    : join(app.getAppPath(), 'data', 'productos.json')

  const contenido = await readFile(ruta, 'utf-8')
  const productos: unknown = JSON.parse(contenido)

  if (!Array.isArray(productos)) {
    throw new Error('El catálogo de productos no tiene un formato válido.')
  }

  return productos as Producto[]
}