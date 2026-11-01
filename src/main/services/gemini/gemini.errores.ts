/**
 * Clasificación de los errores de Gemini (README, sección 7).
 * Código puro (sin red ni Electron) para poder probarlo.
 */

export type TipoErrorGemini = 'cuota' | 'limite' | 'temporal' | 'respuesta' | 'otro'

/** La respuesta llegó, pero no sirve (vacía, sin JSON o con otra estructura). */
export class ErrorRespuestaGemini extends Error {}

/**
 * Decide qué hacer con un error:
 *  - cuota: se agotó el saldo o la cuota diaria; reintentar no sirve.
 *  - limite: demasiadas solicitudes por minuto; se espera y se reintenta.
 *  - temporal: servicio caído o con alta demanda; se espera y se reintenta.
 *  - respuesta: JSON incompleto o inválido; se reintenta una vez.
 *  - otro: error desconocido; se muestra tal cual.
 */
export function clasificarError(error: unknown): {
  tipo: TipoErrorGemini
  esperaMs: number | null
} {
  if (error instanceof ErrorRespuestaGemini) return { tipo: 'respuesta', esperaMs: null }

  const mensaje = error instanceof Error ? error.message : String(error)

  if (/PerDay|billing|prepayment|credits?.*(depleted|exhausted)|insufficient/i.test(mensaje)) {
    return { tipo: 'cuota', esperaMs: null }
  }

  if (/429|RESOURCE_EXHAUSTED/i.test(mensaje)) {
    // Gemini suele indicar cuánto esperar: "Please retry in 12.3s" o "retryDelay":"12s".
    const indicado = mensaje.match(/retry(?:Delay"?:\s*"?| in )\s*(\d+(?:\.\d+)?)\s*s/i)

    return { tipo: 'limite', esperaMs: indicado ? Math.ceil(Number(indicado[1]) * 1000) : null }
  }

  if (
    /\b(500|502|503|504)\b|UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(
      mensaje
    )
  ) {
    return { tipo: 'temporal', esperaMs: null }
  }

  return { tipo: 'otro', esperaMs: null }
}

/** Mensaje para el usuario cuando se agotaron los reintentos. */
export function mensajeFinal(error: unknown): string {
  switch (clasificarError(error).tipo) {
    case 'cuota':
      return (
        'Se agotó la cuota o el saldo de Gemini. Revisa tu plan y la facturación en Google AI Studio; ' +
        'cuando se restablezca, vuelve a procesar la factura.'
      )
    case 'limite':
      return 'Gemini alcanzó el límite de solicitudes. Espera unos minutos y vuelve a procesar la factura.'
    case 'temporal':
      return 'Gemini sigue experimentando alta demanda. Intenta nuevamente dentro de unos minutos.'
    default:
      return error instanceof Error ? error.message : 'Error al comunicarse con Gemini.'
  }
}
