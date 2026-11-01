import { useEffect, useState, type JSX } from 'react'
import '../assets/importacion.css'

interface FacturaListada {
  id: string
  proveedor_nit: string
  proveedor_nombre: string | null
  numero_original: string
  fecha_emision: string | null
  total_lineas: number
  lineas_importadas: number
  precios_actualizados: number
  creado_en: string
}

interface ItemFactura {
  id: string
  linea: number
  descripcion: string
  cantidad: number | null
  unidad: string | null
  precio_unitario_factura: number | null
  precio_compra_anterior: number | null
  variacion_pct: number | null
  estado_importacion: 'importada' | 'excluida' | 'sin_coincidencia'
  decision_precio: 'actualizado' | 'no_actualizado' | 'no_aplica'
  producto: { nombre: string } | { nombre: string }[] | null
}

interface FacturaDetalle extends FacturaListada {
  items: ItemFactura[]
}

const ESTADO_LINEA = {
  importada: 'Importada',
  excluida: 'Excluida',
  sin_coincidencia: 'Sin coincidencia'
} as const

const DECISION_PRECIO = {
  actualizado: 'Precio actualizado',
  no_actualizado: 'Precio sin cambios',
  no_aplica: '—'
} as const

function formatearPesos(valor: number | null): string {
  if (valor === null) return '—'

  return valor.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

function formatearFecha(iso: string | null): string {
  if (!iso) return '—'

  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function nombreProducto(item: ItemFactura): string {
  const producto = Array.isArray(item.producto) ? item.producto[0] : item.producto

  return producto?.nombre ?? '—'
}

/** Historial de facturas importadas, con el detalle de cada línea y su decisión de precio. */
export function HistorialFacturas(): JSX.Element {
  const [facturas, setFacturas] = useState<FacturaListada[] | null>(null)
  const [detalle, setDetalle] = useState<FacturaDetalle | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true

    window.api
      .listarFacturas()
      .then((respuesta) => {
        if (activo) setFacturas(respuesta.facturas as FacturaListada[])
      })
      .catch((err) => {
        if (activo) {
          setError(err instanceof Error ? err.message : 'No se pudo consultar el historial.')
        }
      })

    return () => {
      activo = false
    }
  }, [])

  async function verDetalle(id: string): Promise<void> {
    try {
      setCargandoDetalle(true)
      setError('')
      setDetalle((await window.api.obtenerFactura(id)) as FacturaDetalle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar la factura.')
    } finally {
      setCargandoDetalle(false)
    }
  }

  if (error && !facturas) {
    return (
      <article className="panel standalone-panel">
        <div className="empty-state">
          <strong>No se pudo cargar el historial</strong>
          <p>{error}</p>
        </div>
      </article>
    )
  }

  if (!facturas) {
    return (
      <article className="panel standalone-panel">
        <div className="empty-state">
          <strong>Cargando historial...</strong>
        </div>
      </article>
    )
  }

  if (detalle) {
    return (
      <article className="panel standalone-panel">
        <div className="panel-heading">
          <div>
            <h3>
              Factura {detalle.numero_original} ·{' '}
              {detalle.proveedor_nombre ?? detalle.proveedor_nit}
            </h3>
            <small className="muted">
              Emitida {detalle.fecha_emision ?? '—'} · importada {formatearFecha(detalle.creado_en)}
            </small>
          </div>

          <button type="button" className="button secondary" onClick={() => setDetalle(null)}>
            ← Volver
          </button>
        </div>

        <div className="table-container">
          <table className="import-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Descripción</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio anterior</th>
                <th>Precio factura</th>
                <th>Estado</th>
                <th>Decisión</th>
              </tr>
            </thead>

            <tbody>
              {detalle.items.map((item) => (
                <tr
                  key={item.id}
                  className={item.estado_importacion === 'importada' ? '' : 'import-row-off'}
                >
                  <td>{item.linea}</td>
                  <td>{item.descripcion}</td>
                  <td>{nombreProducto(item)}</td>
                  <td>
                    {item.cantidad ?? '—'} {item.unidad ?? ''}
                  </td>
                  <td>{formatearPesos(item.precio_compra_anterior)}</td>
                  <td>
                    {formatearPesos(item.precio_unitario_factura)}
                    {item.variacion_pct !== null && (
                      <small className="import-sub">{item.variacion_pct} %</small>
                    )}
                  </td>
                  <td>{ESTADO_LINEA[item.estado_importacion]}</td>
                  <td>{DECISION_PRECIO[item.decision_precio]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    )
  }

  return (
    <article className="panel standalone-panel">
      {error && <div className="import-blocked">{error}</div>}

      <div className="table-container">
        <table className="import-table">
          <thead>
            <tr>
              <th>Importada</th>
              <th>Proveedor</th>
              <th>Factura</th>
              <th>Emisión</th>
              <th>Líneas</th>
              <th>Precios</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {facturas.map((factura) => (
              <tr key={factura.id}>
                <td>{formatearFecha(factura.creado_en)}</td>
                <td>{factura.proveedor_nombre ?? factura.proveedor_nit}</td>
                <td>{factura.numero_original}</td>
                <td>{factura.fecha_emision ?? '—'}</td>
                <td>
                  {factura.lineas_importadas} de {factura.total_lineas}
                </td>
                <td>{factura.precios_actualizados} actualizados</td>
                <td>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={cargandoDetalle}
                    onClick={() => void verDetalle(factura.id)}
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}

            {facturas.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-table">
                  Todavía no se ha importado ninguna factura.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}
