import { useState, type JSX } from 'react'

interface FormularioProductoNuevoProps {
  nombreInicial: string
  precioInicial: number | null
  guardando: boolean
  onGuardar: (nombre: string, precioCompra: number) => void
  onCancelar: () => void
}

/** Alta manual de un producto que no existe en el inventario. */
export function FormularioProductoNuevo({
  nombreInicial,
  precioInicial,
  guardando,
  onGuardar,
  onCancelar
}: FormularioProductoNuevoProps): JSX.Element {
  const [nombre, setNombre] = useState(nombreInicial)
  const [precio, setPrecio] = useState(
    precioInicial !== null ? String(precioInicial) : ''
  )

  const precioNumero = Number(precio.replace(',', '.'))
  const valido =
    nombre.trim().length > 0 && precio.trim() !== '' && Number.isFinite(precioNumero) && precioNumero >= 0

  return (
    <form
      className="new-product-form"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (valido) onGuardar(nombre.trim(), precioNumero)
      }}
    >
      <strong>Agregar producto nuevo al inventario</strong>

      <label>
        Nombre del producto
        <input
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          disabled={guardando}
          autoFocus
        />
      </label>

      <label>
        Precio de compra (COP)
        <input
          inputMode="decimal"
          value={precio}
          onChange={(evento) => setPrecio(evento.target.value)}
          disabled={guardando}
          placeholder="0"
        />
      </label>

      <div className="new-product-actions">
        <button className="button primary" disabled={!valido || guardando}>
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
