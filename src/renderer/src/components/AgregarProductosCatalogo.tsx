import { useState, type JSX } from 'react'
import { FormularioProductoNuevo } from './FormularioProductoNuevo'

type Estado = Awaited<ReturnType<typeof window.api.agregarProductosCatalogo>>
type Nuevo = Awaited<ReturnType<typeof window.api.productosNuevosCatalogo>>[number]

interface AgregarProductosCatalogoProps {
  /** Recibe el catálogo ya actualizado (productos.json) para refrescar la pantalla. */
  onCatalogoActualizado: (estado: Estado) => void
}

const TODOS = '__todos__'

/**
 * Panel del catálogo para mantener productos.json al día sin descargarlo todo:
 * - Select con los productos de la API que aún no están en el archivo.
 * - Botón para crear un producto nuevo en el inventario, en la misma pantalla.
 */
export function AgregarProductosCatalogo({
  onCatalogoActualizado
}: AgregarProductosCatalogoProps): JSX.Element {
  const [nuevos, setNuevos] = useState<Nuevo[] | null>(null)
  const [seleccion, setSeleccion] = useState(TODOS)
  const [buscando, setBuscando] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  async function buscarNuevos(): Promise<void> {
    try {
      setBuscando(true)
      setError('')
      setMensaje('')

      const lista = await window.api.productosNuevosCatalogo()

      setNuevos(lista)
      setSeleccion(TODOS)

      if (lista.length === 0) {
        setMensaje('productos.json ya tiene todos los productos activos del inventario.')
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudieron consultar los productos nuevos.'
      )
    } finally {
      setBuscando(false)
    }
  }

  async function agregar(): Promise<void> {
    if (!nuevos || nuevos.length === 0) return

    const ids = seleccion === TODOS ? nuevos.map((producto) => producto.id) : [seleccion]

    try {
      setAgregando(true)
      setError('')
      setMensaje('')

      const estado = await window.api.agregarProductosCatalogo(ids)

      onCatalogoActualizado(estado)
      setNuevos((actual) => (actual ?? []).filter((producto) => !ids.includes(producto.id)))
      setSeleccion(TODOS)
      setMensaje(
        ids.length === 1
          ? 'Producto agregado a productos.json.'
          : `${ids.length} productos agregados a productos.json.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar productos.json.')
    } finally {
      setAgregando(false)
    }
  }

  return (
    <article className="panel catalog-panel">
      <div className="catalog-summary">
        <strong>Actualizar productos.json</strong>
        <span>Agrega productos nuevos del inventario sin volver a descargar todo.</span>
      </div>

      <div className="new-product-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => void buscarNuevos()}
          disabled={buscando || agregando}
        >
          {buscando ? 'Buscando...' : 'Buscar productos nuevos'}
        </button>

        <button
          type="button"
          className="button primary"
          onClick={() => setCreando((actual) => !actual)}
        >
          {creando ? 'Cerrar formulario' : 'Nuevo producto'}
        </button>
      </div>

      {nuevos && nuevos.length > 0 && (
        <div className="new-product-actions" style={{ marginTop: 12 }}>
          <select
            value={seleccion}
            onChange={(event) => setSeleccion(event.target.value)}
            disabled={agregando}
            aria-label="Productos nuevos del inventario"
          >
            <option value={TODOS}>Todos los productos nuevos ({nuevos.length})</option>
            {nuevos.map((producto) => (
              <option key={producto.id} value={producto.id}>
                {producto.nombre}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="button primary"
            onClick={() => void agregar()}
            disabled={agregando}
          >
            {agregando ? 'Agregando...' : 'Agregar a productos.json'}
          </button>
        </div>
      )}

      {mensaje && <p className="matching-reason">{mensaje}</p>}
      {error && <p className="matching-reason">{error}</p>}

      {creando && (
        <FormularioProductoNuevo
          onCancelar={() => setCreando(false)}
          onCreado={({ estado }) => {
            onCatalogoActualizado(estado)
            setCreando(false)
            setMensaje('Producto creado en el inventario y agregado a productos.json.')
          }}
        />
      )}
    </article>
  )
}
