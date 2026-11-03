import { config } from '../../config'
import type { SolicitudImportacion } from '../importacion/importacion.utils'

let cookieSesion: string | null = null

function obtenerUrl(ruta: string): string {
  const apiUrl = config.apiUrl

  if (!apiUrl) {
    throw new Error('No está configurada la variable API_URL en el archivo .env')
  }

  return `${apiUrl}${ruta}`
}

async function solicitar(
  ruta: string,
  opciones: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(opciones.headers)

  if (cookieSesion) {
    headers.set('Cookie', cookieSesion)
  }

  const respuesta = await fetch(obtenerUrl(ruta), {
    ...opciones,
    headers
  })

  if (respuesta.status === 401) {
    cookieSesion = null
  }

  return respuesta
}

export async function iniciarSesion(
  contrasena: string
): Promise<{ autenticado: boolean }> {
  const respuesta = await fetch(obtenerUrl('/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contrasena })
  })

  const datos = await respuesta.json()

  if (!respuesta.ok) {
    throw new Error(datos.error || 'No fue posible iniciar sesión')
  }

  const cookies = respuesta.headers.getSetCookie()
  const cookie = cookies.find((valor) => valor.startsWith('sesion='))

  if (!cookie) {
    throw new Error('La API no devolvió la cookie de sesión')
  }

  cookieSesion = cookie.split(';')[0]

  return { autenticado: true }
}

export async function cerrarSesion(): Promise<{ ok: boolean }> {
  if (cookieSesion) {
    await solicitar('/auth/logout', {
      method: 'POST'
    })
  }

  cookieSesion = null

  return { ok: true }
}

export async function comprobarSesion(): Promise<{ autenticado: boolean }> {
  if (!cookieSesion) {
    return { autenticado: false }
  }

  const respuesta = await solicitar('/auth/me')

  if (!respuesta.ok) {
    return { autenticado: false }
  }

  return await respuesta.json()
}

export async function obtenerProductosAPI(): Promise<unknown> {
  const respuesta = await solicitar('/productos?activo=true')

  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}))
    throw new Error(datos.error || 'No se pudieron obtener los productos')
  }

  return await respuesta.json()
}

// Rutas de la API de Ferretería para las facturas de compra.
const RUTA_FACTURAS = '/facturas-compra'

async function leerErrorAPI(respuesta: Response, mensaje: string): Promise<Error> {
  const datos = await respuesta.json().catch(() => ({}))
  const detalle =
    datos && typeof datos === 'object' && 'error' in datos ? String(datos.error) : ''

  return new Error(detalle || `${mensaje} (HTTP ${respuesta.status}).`)
}

export interface RespuestaImportacionAPI {
  /** true si la factura ya había sido importada: no se registró nada nuevo. */
  duplicada: boolean
  factura_id: string
  ajuste_entrada_id?: string
  lineas_importadas?: number
  precios_actualizados?: number
  importada_en?: string
}

export interface FacturaYaImportada {
  existe: boolean
  factura_id?: string
  numero?: string
  proveedor_nombre?: string | null
  importada_en?: string
}

/**
 * Importa una factura confirmada por el usuario. La API la registra en una sola
 * operación atómica e idempotente: repetir la solicitud no duplica entradas
 * ni cambios de precio (responde 409 con duplicada = true).
 */
export async function importarFacturaAPI(
  solicitud: SolicitudImportacion
): Promise<RespuestaImportacionAPI> {
  const respuesta = await solicitar(RUTA_FACTURAS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(solicitud)
  })

  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>

  // Una factura repetida no es un error: simplemente no se vuelve a registrar.
  if (respuesta.status === 409 && datos.duplicada === true) {
    return {
      duplicada: true,
      factura_id: String(datos.factura_id ?? ''),
      importada_en: typeof datos.importada_en === 'string' ? datos.importada_en : undefined
    }
  }

  if (!respuesta.ok) {
    throw new Error(
      typeof datos.error === 'string' && datos.error
        ? datos.error
        : `No se pudo importar la factura (HTTP ${respuesta.status}).`
    )
  }

  return {
    duplicada: false,
    factura_id: String(datos.factura_id ?? ''),
    ajuste_entrada_id: typeof datos.ajuste_entrada_id === 'string' ? datos.ajuste_entrada_id : undefined,
    lineas_importadas: Number(datos.lineas_importadas ?? 0),
    precios_actualizados: Number(datos.precios_actualizados ?? 0)
  }
}

/** ¿Esta factura (proveedor + número) ya fue importada? */
export async function buscarFacturaAPI(nit: string, numero: string): Promise<FacturaYaImportada> {
  const consulta = `nit=${encodeURIComponent(nit)}&numero=${encodeURIComponent(numero)}`
  const respuesta = await solicitar(`${RUTA_FACTURAS}/existe?${consulta}`)

  if (!respuesta.ok) {
    throw await leerErrorAPI(respuesta, 'No se pudo consultar la factura')
  }

  return (await respuesta.json()) as FacturaYaImportada
}

/** Historial de facturas importadas. */
export async function listarFacturasAPI(): Promise<{ facturas: unknown[]; total: number }> {
  const respuesta = await solicitar(RUTA_FACTURAS)

  if (!respuesta.ok) {
    throw await leerErrorAPI(respuesta, 'No se pudo consultar el historial de facturas')
  }

  return (await respuesta.json()) as { facturas: unknown[]; total: number }
}

/** Detalle de una factura importada, con sus líneas y decisiones de precio. */
export async function obtenerFacturaAPI(id: string): Promise<unknown> {
  const respuesta = await solicitar(`${RUTA_FACTURAS}/${encodeURIComponent(id)}`)

  if (!respuesta.ok) {
    throw await leerErrorAPI(respuesta, 'No se pudo consultar la factura')
  }

  return await respuesta.json()
}

export interface OpcionCatalogo {
  id: string
  nombre: string
  codigo?: string | null
}

async function leerLista(respuesta: Response, mensaje: string): Promise<unknown[]> {
  if (!respuesta.ok) {
    throw await leerErrorAPI(respuesta, mensaje)
  }

  const datos = (await respuesta.json()) as unknown

  if (Array.isArray(datos)) return datos

  if (datos && typeof datos === 'object' && Array.isArray((datos as { datos?: unknown }).datos)) {
    return (datos as { datos: unknown[] }).datos
  }

  throw new Error(`${mensaje}: formato de respuesta no válido.`)
}

function aOpciones(lista: unknown[]): OpcionCatalogo[] {
  return lista
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter((item) => item.activo !== false && typeof item.id === 'string')
    .map((item) => ({
      id: String(item.id),
      nombre: String(item.nombre ?? item.codigo ?? item.id),
      codigo: typeof item.codigo === 'string' ? item.codigo : null
    }))
}

/** Categorías activas, para elegir la del producto nuevo. */
export async function listarCategoriasAPI(): Promise<OpcionCatalogo[]> {
  const respuesta = await solicitar('/categorias')

  return aOpciones(await leerLista(respuesta, 'No se pudieron consultar las categorías'))
}

/** Unidades base disponibles, para elegir la del producto nuevo. */
export async function listarUnidadesAPI(): Promise<OpcionCatalogo[]> {
  const respuesta = await solicitar('/unidades')

  return aOpciones(await leerLista(respuesta, 'No se pudieron consultar las unidades'))
}

/** Crea un producto en el inventario. Devuelve el registro creado por la API. */
export async function crearProductoAPI(datos: unknown): Promise<unknown> {
  const respuesta = await solicitar('/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos)
  })

  if (!respuesta.ok) {
    throw await leerErrorAPI(respuesta, 'No se pudo crear el producto')
  }

  return await respuesta.json()
}
