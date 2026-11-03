import { useEffect, useState, type JSX } from 'react'

interface FormularioProductoNuevoProps {
  /** Datos con los que se abre el formulario (por ejemplo, la línea de la factura). */
  inicial?: { nombre?: string; precioCompra?: number | null }
  onCreado: (resultado: {
    estado: Awaited<ReturnType<typeof window.api.crearProducto>>['estado']
    productoId: string
  }) => void
  onCancelar: () => void
}

type Opcion = { id: string; nombre: string; codigo?: string | null }

/**
 * Alta de un producto nuevo en el inventario sin salir de la aplicación.
 * Se envía a la API (POST /productos) y, si todo sale bien, el producto queda
 * también en data/productos.json.
 */
export function FormularioProductoNuevo({
  inicial,
  onCreado,
  onCancelar
}: FormularioProductoNuevoProps): JSX.Element {
  const [categorias, setCategorias] = useState<Opcion[]>([])
  const [unidades, setUnidades] = useState<Opcion[]>([])
  const [cargandoOpciones, setCargandoOpciones] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const [codigo, setCodigo] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [descripcion, setDescripcion] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [unidadId, setUnidadId] = useState('')
  const [precioCompra, setPrecioCompra] = useState(
    inicial?.precioCompra != null && inicial.precioCompra > 0 ? String(inicial.precioCompra) : ''
  )
  const [precioVenta, setPrecioVenta] = useState('')
  const [stockMinimo, setStockMinimo] = useState('0')

  useEffect(() => {
    let activo = true

    Promise.all([window.api.listarCategorias(), window.api.listarUnidades()])
      .then(([listaCategorias, listaUnidades]) => {
        if (!activo) return
        setCategorias(listaCategorias)
        setUnidades(listaUnidades)
      })
      .catch((err) => {
        if (!activo) return
        setError(
          err instanceof Error ? err.message : 'No se pudieron cargar las categorías y unidades.'
        )
      })
      .finally(() => {
        if (activo) setCargandoOpciones(false)
      })

    return () => {
      activo = false
    }
  }, [])

  async function guardar(): Promise<void> {
    if (guardando) return

    try {
      setGuardando(true)
      setError('')

      const resultado = await window.api.crearProducto({
        codigo,
        codigo_barras: codigoBarras || null,
        nombre,
        descripcion: descripcion || null,
        categoria_id: categoriaId,
        unidad_base_id: unidadId,
        precio_compra: Number(precioCompra),
        precio_venta: Number(precioVenta),
        stock_minimo: Number(stockMinimo)
      })

      onCreado(resultado)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el producto.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      className="new-product-form"
      onSubmit={(event) => {
        event.preventDefault()
        void guardar()
      }}
    >
      <strong>Nuevo producto en el inventario</strong>

      <label>
        Nombre *
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </label>

      <label>
        Código interno *
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
      </label>

      <label>
        Código de barras
        <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} />
      </label>

      <label>
        Descripción
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>

      <label>
        Categoría *
        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          disabled={cargandoOpciones}
          required
        >
          <option value="">{cargandoOpciones ? 'Cargando...' : 'Selecciona una categoría'}</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </select>
      </label>

      <label>
        Unidad base *
        <select
          value={unidadId}
          onChange={(e) => setUnidadId(e.target.value)}
          disabled={cargandoOpciones}
          required
        >
          <option value="">{cargandoOpciones ? 'Cargando...' : 'Selecciona una unidad'}</option>
          {unidades.map((unidad) => (
            <option key={unidad.id} value={unidad.id}>
              {unidad.nombre}
              {unidad.codigo ? ` (${unidad.codigo})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label>
        Precio de compra *
        <input
          type="number"
          min="0"
          step="any"
          value={precioCompra}
          onChange={(e) => setPrecioCompra(e.target.value)}
          required
        />
      </label>

      <label>
        Precio de venta *
        <input
          type="number"
          min="0"
          step="any"
          value={precioVenta}
          onChange={(e) => setPrecioVenta(e.target.value)}
          required
        />
      </label>

      <label>
        Stock mínimo *
        <input
          type="number"
          min="0"
          step="any"
          value={stockMinimo}
          onChange={(e) => setStockMinimo(e.target.value)}
          required
        />
      </label>

      {error && <p className="matching-reason">{error}</p>}

      <div className="new-product-actions">
        <button type="submit" className="button primary" disabled={guardando || cargandoOpciones}>
          {guardando ? 'Creando...' : 'Crear producto'}
        </button>

        <button
          type="button"
          className="button secondary"
          onClick={onCancelar}
          disabled={guardando}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
