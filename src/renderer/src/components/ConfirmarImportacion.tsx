import type { JSX } from 'react'
import '../assets/importacion.css'
import {
  esUnidadSimple,
  estaIncluida,
  posicionesConPrecioAutorizado,
  posicionesIncluidas,
  puedeActualizarPrecio
} from './importacion.helpers'
import type { FilaImportacion } from './importacion.helpers'

interface ConfirmarImportacionProps {
  filas: FilaImportacion[]
  incluidas: Record<number, boolean>
  preciosAutorizados: Record<number, boolean>
  importando: boolean
  /** Si no es null, la importación está bloqueada y se muestra el motivo. */
  bloqueo: string | null
  onAlternarIncluida: (indice: number) => void
  onAlternarPrecio: (indice: number) => void
  onConfirmar: () => void
}

function formatearPesos(valor: number): string {
  return valor.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

const ETIQUETA_COINCIDENCIA = {
  coincidencia_alta: 'Coincidencia alta',
  revision_manual: 'Revisión manual',
  sin_coincidencia: 'Sin coincidencia'
} as const

/**
 * Revisión final: qué líneas entran al inventario y en cuáles se cambia el
 * precio de compra. Nada se envía hasta pulsar "Confirmar importación".
 */
export function ConfirmarImportacion({
  filas,
  incluidas,
  preciosAutorizados,
  importando,
  bloqueo,
  onAlternarIncluida,
  onAlternarPrecio,
  onConfirmar
}: ConfirmarImportacionProps): JSX.Element {
  const totalIncluidas = posicionesIncluidas(filas, incluidas).length
  const totalPrecios = posicionesConPrecioAutorizado(filas, incluidas, preciosAutorizados).length
  const sinProducto = filas.filter((fila) => fila.productoNombre === null).length
  const excluidas = filas.length - totalIncluidas - sinProducto

  return (
    <article className="panel import-panel">
      <div className="panel-heading">
        <div>
          <span className="step-number">05</span>
          <h3>Revisión y confirmación</h3>
        </div>

        <span className="status-pill success">{filas.length} líneas en la factura</span>
      </div>

      <div className="matching-summary">
        <span>
          <strong>{totalIncluidas}</strong>
          Entran al inventario
        </span>

        <span>
          <strong>{totalPrecios}</strong>
          Precios a actualizar
        </span>

        <span>
          <strong>{excluidas}</strong>
          Excluidas
        </span>

        <span>
          <strong>{sinProducto}</strong>
          Sin producto
        </span>
      </div>

      <p className="import-hint">
        Las líneas sin producto confirmado no generan movimientos ni crean productos. Las cantidades
        se registran en la unidad base del producto; si la factura vende en otra presentación (caja,
        paquete, kg...) la línea queda sin marcar para que la revises.
      </p>

      <div className="table-container">
        <table className="import-table">
          <thead>
            <tr>
              <th>Importar</th>
              <th>Línea de la factura</th>
              <th>Producto del inventario</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th>Actualizar precio</th>
            </tr>
          </thead>

          <tbody>
            {filas.map((fila) => {
              const incluida = estaIncluida(fila, incluidas)
              const sinProductoFila = fila.productoNombre === null
              const unidadRara = !esUnidadSimple(fila.unidad)
              const puedePrecio = incluida && puedeActualizarPrecio(fila)

              return (
                <tr key={fila.indice} className={incluida ? '' : 'import-row-off'}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Importar la línea ${fila.indice + 1}`}
                      checked={incluida}
                      disabled={sinProductoFila || importando}
                      onChange={() => onAlternarIncluida(fila.indice)}
                    />
                  </td>

                  <td>
                    <strong>{fila.descripcion}</strong>
                    <small className="import-sub">
                      {ETIQUETA_COINCIDENCIA[fila.estadoCoincidencia]}
                    </small>
                  </td>

                  <td>
                    {fila.productoNombre ?? (
                      <small className="import-sub">
                        Elige un producto arriba para poder importarla.
                      </small>
                    )}
                  </td>

                  <td>
                    {fila.cantidad ?? '—'} {fila.unidad ?? ''}
                    {unidadRara && (
                      <small className="import-sub import-warning">
                        Unidad distinta a &quot;unidad&quot;: verifica la presentación.
                      </small>
                    )}
                  </td>

                  <td>
                    {fila.precioFactura !== null ? formatearPesos(fila.precioFactura) : '—'}
                    <small className="import-sub">
                      Antes:{' '}
                      {fila.precioActual !== null && fila.precioActual > 0
                        ? formatearPesos(fila.precioActual)
                        : 'sin precio'}{' '}
                      · {fila.variacionTexto}
                    </small>
                  </td>

                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Actualizar el precio de la línea ${fila.indice + 1}`}
                      checked={Boolean(preciosAutorizados[fila.indice]) && puedePrecio}
                      disabled={!puedePrecio || importando}
                      onChange={() => onAlternarPrecio(fila.indice)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {bloqueo && <div className="import-blocked">{bloqueo}</div>}

      <div className="import-actions">
        <button
          type="button"
          className="button primary"
          disabled={importando || totalIncluidas === 0 || bloqueo !== null}
          onClick={onConfirmar}
        >
          {importando
            ? 'Importando...'
            : `Confirmar importación (${totalIncluidas} ${totalIncluidas === 1 ? 'línea' : 'líneas'})`}
        </button>

        <small className="muted">
          Se registra en una sola operación. Si falla la conexión puedes repetirla sin riesgo: la
          factura no se importa dos veces.
        </small>
      </div>
    </article>
  )
}
