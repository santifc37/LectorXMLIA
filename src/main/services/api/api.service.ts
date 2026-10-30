import { config } from '../../config'

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
