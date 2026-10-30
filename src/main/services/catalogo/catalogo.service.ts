import { mkdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { rutaCatalogo } from '../../config'
import { obtenerProductosAPI } from '../api/api.service'
import { normalizarProductos } from './catalogo.utils'
import type { ProductoCatalogo } from './catalogo.utils'

export type { ProductoCatalogo }

export interface EstadoCatalogo {
  productos: ProductoCatalogo[]
  /** Fecha ISO de la última actualización de la copia local. */
  actualizadoEn: string | null
  /** De dónde salen los datos que se están usando. */
  origen: 'api' | 'local'
  descartados: number
  /** Mensaje cuando no se pudo actualizar y se usa la copia local. */
  advertencia?: string
}

async function guardarCatalogo(productos: ProductoCatalogo[]): Promise<void> {
  const ruta = rutaCatalogo()
  const temporal = `${ruta}.tmp`

  await mkdir(dirname(ruta), { recursive: true })

  // Se escribe en un archivo temporal y luego se reemplaza, para que un
  // corte a mitad de escritura no deje el catálogo dañado.
  await writeFile(temporal, JSON.stringify(productos, null, 2), 'utf-8')
  await rename(temporal, ruta)
}

/** Descarga el catálogo desde la API y lo guarda en data/productos.json. */
export async function sincronizarCatalogo(): Promise<EstadoCatalogo> {
  const crudo = await obtenerProductosAPI()
  const { productos, descartados } = normalizarProductos(crudo)

  if (productos.length === 0) {
    throw new Error('La API no devolvió productos activos. Se conserva la copia local anterior.')
  }

  await guardarCatalogo(productos)

  return {
    productos,
    actualizadoEn: new Date().toISOString(),
    origen: 'api',
    descartados
  }
}

/** Lee la copia local del catálogo. Devuelve null si todavía no existe. */
export async function leerCatalogoLocal(): Promise<EstadoCatalogo | null> {
  const ruta = rutaCatalogo()

  let texto: string

  try {
    texto = await readFile(ruta, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  let crudo: unknown

  try {
    crudo = JSON.parse(texto)
  } catch {
    throw new Error('El catálogo local está dañado. Actualízalo desde la API.')
  }

  const { productos, descartados } = normalizarProductos(crudo)
  const { mtime } = await stat(ruta)

  return {
    productos,
    actualizadoEn: mtime.toISOString(),
    origen: 'local',
    descartados
  }
}

function formatearFecha(iso: string | null): string {
  if (!iso) return 'fecha desconocida'

  return new Date(iso).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

/**
 * Intenta actualizar el catálogo desde la API. Si no es posible (sin
 * internet, sesión vencida, etc.) usa la copia local y lo informa.
 */
export async function actualizarCatalogo(): Promise<EstadoCatalogo> {
  try {
    return await sincronizarCatalogo()
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'Error desconocido.'

    const local = await leerCatalogoLocal().catch(() => null)

    if (local && local.productos.length > 0) {
      return {
        ...local,
        advertencia: `No se pudo actualizar el catálogo (${motivo}) Se usa la copia local del ${formatearFecha(local.actualizadoEn)}.`
      }
    }

    throw error
  }
}

/** Refleja un cambio de precio ya confirmado por la API en data/productos.json. */
export async function actualizarPrecioLocal(
  productoId: string,
  precioCompra: number
): Promise<void> {
  const local = await leerCatalogoLocal().catch(() => null)

  if (!local) return

  const productos = local.productos.map((producto) =>
    producto.id === productoId ? { ...producto, precio_compra: precioCompra } : producto
  )

  await guardarCatalogo(productos)
}
