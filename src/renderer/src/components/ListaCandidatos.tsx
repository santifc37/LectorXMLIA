import type { JSX } from 'react'

export interface CandidatoLista {
  id: string
  nombre: string
  precio: number | null
  puntuacion: number
  codigo?: string | null
}

interface ListaCandidatosProps {
  candidatos: CandidatoLista[]
  seleccionadoId: string | null
  deshabilitado?: boolean
  onSeleccionar: (candidatoId: string) => void
}

function formatearPesos(valor: number): string {
  return valor.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

/**
 * Lista de productos parecidos del inventario. Cada tarjeta es un botón:
 * al pulsarla se elige ese producto y se devuelve su ID (nunca el objeto).
 */
export function ListaCandidatos({
  candidatos,
  seleccionadoId,
  deshabilitado = false,
  onSeleccionar
}: ListaCandidatosProps): JSX.Element {
  return (
    <ul className="candidate-list" role="radiogroup" aria-label="Productos parecidos">
      {candidatos.map((candidato) => {
        const seleccionado = candidato.id === seleccionadoId

        return (
          <li key={candidato.id}>
            <button
              type="button"
              role="radio"
              aria-checked={seleccionado}
              className={`candidate-card ${seleccionado ? 'selected' : ''}`}
              disabled={deshabilitado}
              onClick={() => onSeleccionar(candidato.id)}
            >
              <span className="candidate-radio" aria-hidden="true" />

              <span className="candidate-info">
                <span className="candidate-name">{candidato.nombre}</span>

                <span className="candidate-meta">
                  {candidato.codigo && (
                    <span className="candidate-code">{candidato.codigo}</span>
                  )}

                  <span className="candidate-price">
                    {candidato.precio !== null && candidato.precio > 0
                      ? `Compra: ${formatearPesos(candidato.precio)}`
                      : 'Sin precio de compra'}
                  </span>
                </span>
              </span>

              <span className="candidate-score">{candidato.puntuacion}%</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
