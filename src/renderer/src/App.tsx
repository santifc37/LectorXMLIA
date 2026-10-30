
import { useEffect, useState, type JSX } from 'react'
import './assets/main.css'
import './assets/precios.css'
import './assets/candidatos.css'
import { ListaCandidatos } from './components/ListaCandidatos'
import { FormularioProductoNuevo } from './components/FormularioProductoNuevo'

interface AppInfo {
  name: string
  version: string
  platform: string
}

interface Producto {
  id: string
  nombre: string
  precio_compra: number | null
  codigo?: string | null
  sku?: string | null
  codigo_barras?: string | null
  codigo_interno?: string | null
  codigo_proveedor?: string | null
  referencia?: string | null
}

interface ResumenFactura {
  numero: string | null
  fecha: string | null
  cufe: string | null
  moneda: string | null
  proveedorNombre: string | null
  proveedorNit: string | null
  compradorNombre: string | null
  compradorNit: string | null
  lineas: number
  total: number | null
  subtotal: number | null
}

interface ArchivoXML {
  nombre: string
  contenido: string
  contenidoFactura: string
  valido: boolean
  mensaje: string
  tipoDocumento: 'factura' | 'nota_credito' | 'nota_debito' | 'desconocido'
  resumen: ResumenFactura | null
}

interface ResultadoGemini {
  modelo: string
  respuesta: string
}

interface CandidatoCoincidencia {
  id: string
  nombre: string
  precio: number | null
  puntuacion: number
  motivo: string
  codigo?: string | null
}

interface ResultadoCoincidencia {
  productoFactura: string
  estado: 'coincidencia_alta' | 'revision_manual' | 'sin_coincidencia'
  puntuacion: number
  motivo: string
  candidatos: CandidatoCoincidencia[]
  productoSeleccionadoId: string | null
}

type EstadoPrecio = 'aumento' | 'disminucion' | 'igual' | 'sin_referencia'

interface ComparacionPrecio {
  productoId: string
  productoNombre: string
  provisional: boolean
  estado: EstadoPrecio
  precioActual: number | null
  precioFactura: number | null
  precioFacturaSinIva: number | null
  precioFacturaConIva: number | null
  tasaIva: number
  baseComparacion: 'sin_iva' | 'con_iva'
  diferencia: number | null
  variacionPct: number | null
  cantidad: number | null
  unidad: string | null
  alertas: string[]
}

type Seccion = 'inicio' | 'xml' | 'catalogo'

function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [contrasena, setContrasena] = useState('')
  const [autenticado, setAutenticado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [seccion, setSeccion] = useState<Seccion>('inicio')

  const [productos, setProductos] = useState<Producto[]>([])
  const [cargandoProductos, setCargandoProductos] = useState(false)
  const [catalogoActualizadoEn, setCatalogoActualizadoEn] =
    useState<string | null>(null)
  const [catalogoOrigen, setCatalogoOrigen] =
    useState<'api' | 'local' | null>(null)

  const [archivoXML, setArchivoXML] = useState<ArchivoXML | null>(null)
  const [procesandoGemini, setProcesandoGemini] = useState(false)
  const [respuestaGemini, setRespuestaGemini] =
    useState<ResultadoGemini | null>(null)

  const [resultadosCoincidencia, setResultadosCoincidencia] =
    useState<ResultadoCoincidencia[]>([])

  const [comparandoProductos, setComparandoProductos] = useState(false)
  const [seleccionandoCandidato, setSeleccionandoCandidato] =
    useState<number | null>(null)

  // Comparación de precios (misma posición que resultadosCoincidencia) y
  // actualizaciones de precio que el usuario autorizó, por posición.
  const [comparacionesPrecio, setComparacionesPrecio] =
    useState<(ComparacionPrecio | null)[]>([])
  const [preciosAutorizados, setPreciosAutorizados] =
    useState<Record<number, boolean>>({})
  const [actualizandoPrecio, setActualizandoPrecio] =
    useState<number | null>(null)

  // Alta manual de un producto que no existe en el inventario.
  const [formularioNuevo, setFormularioNuevo] =
    useState<{ indice: number; precio: number | null } | null>(null)
  const [creandoProducto, setCreandoProducto] = useState(false)

  useEffect(() => {
    window.api.getAppInfo().then(setAppInfo).catch(() => {})

    window.api.comprobarSesion()
      .then((resultado) => {
        setAutenticado(resultado.autenticado)

        if (resultado.autenticado) {
          void cargarCatalogo().catch((err) =>
            setError(
              err instanceof Error
                ? err.message
                : 'No se pudo cargar el catálogo.'
            )
          )
        }
      })
      .catch(() => setAutenticado(false))
  }, [])

  async function iniciarSesion(): Promise<void> {
    if (!contrasena) {
      setError('Ingresa la contraseña.')
      return
    }

    try {
      setCargando(true)
      setError('')

      await window.api.iniciarSesion(contrasena)

      setAutenticado(true)
      setContrasena('')

      // Se descarga el catálogo en segundo plano al iniciar sesión.
      void cargarCatalogo().catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el catálogo.'
        )
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible iniciar sesión.'
      )
    } finally {
      setCargando(false)
    }
  }

  async function cerrarSesion(): Promise<void> {
    try {
      await window.api.cerrarSesion()

      setAutenticado(false)
      setArchivoXML(null)
      setRespuestaGemini(null)
      setResultadosCoincidencia([])
      setComparacionesPrecio([])
      setPreciosAutorizados({})
      setProductos([])
      setCatalogoActualizadoEn(null)
      setCatalogoOrigen(null)
      setSeccion('inicio')
      setError('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cerrar sesión.'
      )
    }
  }

  // Descarga el catálogo desde la API (o usa la copia local si la API no
  // responde) y lo deja disponible para toda la aplicación.
  async function cargarCatalogo(): Promise<Producto[]> {
    try {
      setCargandoProductos(true)

      const estado = await window.api.actualizarCatalogo()

      setProductos(estado.productos)
      setCatalogoActualizadoEn(estado.actualizadoEn)
      setCatalogoOrigen(estado.origen)

      if (estado.advertencia) {
        setError(estado.advertencia)
      }

      return estado.productos
    } finally {
      setCargandoProductos(false)
    }
  }

  async function actualizarCatalogoManual(): Promise<void> {
    try {
      setError('')
      await cargarCatalogo()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el catálogo.'
      )
    }
  }

  async function seleccionarXML(): Promise<void> {
    try {
      setError('')
      setRespuestaGemini(null)
      setResultadosCoincidencia([])
      setComparacionesPrecio([])
      setPreciosAutorizados({})

      const resultado = await window.api.seleccionarYLeerXML()

      if (resultado) {
        setArchivoXML(resultado)
        setSeccion('xml')
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo leer el archivo XML.'
      )
    }
  }

  async function enviarAGemini(): Promise<void> {
    if (!archivoXML) {
      setError('Primero selecciona un archivo XML.')
      return
    }

    if (!archivoXML.valido) {
      setError(archivoXML.mensaje)
      return
    }

    try {
      setProcesandoGemini(true)
      setComparandoProductos(false)
      setError('')
      setRespuestaGemini(null)
      setResultadosCoincidencia([])
      setComparacionesPrecio([])
      setPreciosAutorizados({})

      // 1. Extraer los datos de la factura con Gemini.
      const resultado: ResultadoGemini =
        await window.api.procesarXMLConGemini(archivoXML.contenidoFactura)

      setRespuestaGemini(resultado)

      // 2. Comprobar que Gemini devolvió un JSON válido.
      let factura: {
        documento_valido: boolean
        productos: {
          descripcion: string
          cantidad?: number | null
          subtotal?: number | string | null
        }[]
      }

      try {
        factura = JSON.parse(resultado.respuesta)
      } catch {
        throw new Error('Gemini devolvió un JSON que no es válido.')
      }

      if (!factura.documento_valido) {
        throw new Error(
          'El documento no fue identificado como una factura válida.'
        )
      }

      if (!Array.isArray(factura.productos) || factura.productos.length === 0) {
        throw new Error('La factura no contiene productos para comparar.')
      }

      // Controles cruzados contra el XML (leído localmente): si Gemini omitió
      // líneas, inventó otras o se equivocó en un valor, se detecta aquí.
      const avisos: string[] = []

      if (archivoXML.resumen) {
        const { lineas, subtotal } = archivoXML.resumen

        if (factura.productos.length !== lineas) {
          avisos.push(
            `el XML tiene ${lineas} líneas, pero Gemini extrajo ${factura.productos.length}.`
          )
        }

        const subtotales = factura.productos.map((producto) =>
          producto.subtotal === null || producto.subtotal === undefined
            ? NaN
            : Number(producto.subtotal)
        )

        if (subtotal !== null && subtotales.every(Number.isFinite)) {
          const suma = subtotales.reduce((total, valor) => total + valor, 0)

          if (Math.abs(suma - subtotal) > Math.max(2, subtotal * 0.005)) {
            avisos.push(
              `la suma de los subtotales extraídos (${formatearPesos(suma)}) no coincide con la del XML (${formatearPesos(subtotal)}).`
            )
          }
        }
      }

      if (avisos.length > 0) {
        setError(
          `Atención: ${avisos.join(' Además, ')} Revisa la extracción antes de actualizar precios.`
        )
      }

      // 3. Obtener el catálogo si todavía no está cargado.
      let catalogo = productos

      if (catalogo.length === 0) {
        catalogo = await cargarCatalogo()
      }

      if (catalogo.length === 0) {
        throw new Error(
          'El catálogo está vacío. No hay productos para comparar.'
        )
      }

      // 4. Comparar las líneas de la factura con el catálogo.
      setComparandoProductos(true)

      const coincidencias =
        await window.api.compararFacturaConCatalogo(
          resultado.respuesta,
          catalogo
        )

      setResultadosCoincidencia(coincidencias)

      // 5. Comparar los precios de la factura con los del inventario.
      const precios = await window.api.compararPrecios(
        resultado.respuesta,
        coincidencias
      )

      setComparacionesPrecio(precios)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible procesar y comparar la factura.'
      )
    } finally {
      setProcesandoGemini(false)
      setComparandoProductos(false)
      setCargandoProductos(false)
    }
  }

  async function seleccionarCandidato(
    indice: number,
    productoId: string
  ): Promise<void> {
    if (!respuestaGemini) return

    const resultadosActualizados = resultadosCoincidencia.map(
      (resultado, posicion) =>
        posicion === indice
          ? { ...resultado, productoSeleccionadoId: productoId }
          : resultado
    )

    setResultadosCoincidencia(resultadosActualizados)

    // Se elimina la comparación anterior mientras se calcula la nueva.
    setComparacionesPrecio(actual =>
      actual.map((comparacion, posicion) =>
        posicion === indice ? null : comparacion
      )
    )

    setPreciosAutorizados(actual => {
      const nuevos = { ...actual }
      delete nuevos[indice]
      return nuevos
    })

    try {
      setSeleccionandoCandidato(indice)
      setError('')

      const precios = await window.api.compararPrecios(
        respuestaGemini.respuesta,
        resultadosActualizados
      )

      setComparacionesPrecio(precios)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo comparar el precio del producto seleccionado.'
      )
    } finally {
      setSeleccionandoCandidato(null)
    }
  }

  function etiquetaArchivo(archivo: ArchivoXML): { texto: string; clase: string } {
    if (archivo.valido) return { texto: 'Factura válida', clase: 'success' }

    if (archivo.tipoDocumento === 'nota_credito') {
      return { texto: 'Nota crédito', clase: 'warning' }
    }

    if (archivo.tipoDocumento === 'nota_debito') {
      return { texto: 'Nota débito', clase: 'warning' }
    }

    return { texto: 'No válido', clase: 'warning' }
  }

  function formatearTotal(total: number, moneda: string | null): string {
    // Solo se acepta un código de moneda bien formado; si no, pesos.
    const codigo = moneda && /^[A-Z]{3}$/.test(moneda) ? moneda : 'COP'

    return total.toLocaleString('es-CO', { style: 'currency', currency: codigo })
  }

  function renderResumenArchivo(): JSX.Element | null {
    const resumen = archivoXML?.resumen

    if (!resumen) return null

    return (
      <>
        <div className="matching-summary">
          <span>
            <strong>{resumen.lineas}</strong>
            Líneas
          </span>

          <span>
            <strong>{resumen.numero ?? '—'}</strong>
            Factura
          </span>

          <span>
            <strong>{resumen.fecha ?? '—'}</strong>
            Fecha
          </span>

          <span>
            <strong>
              {resumen.total !== null ? formatearTotal(resumen.total, resumen.moneda) : '—'}
            </strong>
            Total
          </span>
        </div>

        <p className="matching-reason">
          Proveedor: {resumen.proveedorNombre ?? 'Sin nombre'} · NIT{' '}
          {resumen.proveedorNit ?? 'no identificado'}
        </p>
      </>
    )
  }

  function formatearPesos(valor: number): string {
    return valor.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })
  }

  // Los códigos de unidad de la DIAN (UN/CEFACT) se muestran con su nombre
  // común; los que no se conocen se dejan tal cual vienen en la factura.
  function unidadLegible(unidad: string | null): string {
    if (!unidad) return ''

    const equivalencias: Record<string, string> = {
      '94': 'UND',
      EA: 'UND',
      NIU: 'UND',
      H87: 'UND',
      KGM: 'kg',
      GRM: 'g',
      MTR: 'm',
      LTR: 'L'
    }

    return equivalencias[unidad.toUpperCase()] ?? unidad
  }

  function formatearVariacion(comparacion: ComparacionPrecio): string {
    if (comparacion.diferencia === null || comparacion.variacionPct === null) {
      return '—'
    }

    const signo =
      comparacion.diferencia > 0 ? '+' : comparacion.diferencia < 0 ? '−' : ''

    const porcentaje = Math.abs(comparacion.variacionPct).toLocaleString(
      'es-CO',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    )

    return `${signo}${formatearPesos(Math.abs(comparacion.diferencia))} (${signo}${porcentaje} %)`
  }

  function etiquetaPrecio(estado: EstadoPrecio): { texto: string; clase: string } {
    switch (estado) {
      case 'aumento':
        return { texto: 'Precio más alto', clase: 'warning' }
      case 'disminucion':
        return { texto: 'Precio más bajo', clase: 'success' }
      case 'igual':
        return { texto: 'Precio igual', clase: '' }
      default:
        return { texto: 'Sin precio de referencia', clase: '' }
    }
  }

  // Cambia en la base de datos el precio de compra por el de la factura.
  // Solo ocurre cuando el usuario pulsa el botón y lo confirma.
  async function aplicarPrecioFactura(indice: number): Promise<void> {
    const comparacion = comparacionesPrecio[indice]
    const nuevoPrecio = comparacion?.precioFactura ?? null

    if (!comparacion || nuevoPrecio === null || !respuestaGemini) return

    const anterior =
      comparacion.precioActual !== null
        ? formatearPesos(comparacion.precioActual)
        : 'sin precio'

    const confirmado = window.confirm(
      `¿Cambiar el precio de compra de "${comparacion.productoNombre}"?\n\n` +
        `Actual: ${anterior}\nNuevo (factura): ${formatearPesos(nuevoPrecio)}`
    )

    if (!confirmado) return

    try {
      setActualizandoPrecio(indice)
      setError('')

      await window.api.actualizarPrecioCompra(comparacion.productoId, nuevoPrecio)

      setProductos((actual) =>
        actual.map((producto) =>
          producto.id === comparacion.productoId
            ? { ...producto, precio_compra: nuevoPrecio }
            : producto
        )
      )

      const resultadosActualizados = resultadosCoincidencia.map((resultado) => ({
        ...resultado,
        candidatos: resultado.candidatos.map((candidato) =>
          candidato.id === comparacion.productoId
            ? { ...candidato, precio: nuevoPrecio }
            : candidato
        )
      }))

      setResultadosCoincidencia(resultadosActualizados)

      setPreciosAutorizados((actual) => ({ ...actual, [indice]: true }))

      setComparacionesPrecio(
        await window.api.compararPrecios(
          respuestaGemini.respuesta,
          resultadosActualizados
        )
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el precio de compra.'
      )
    } finally {
      setActualizandoPrecio(null)
    }
  }

  async function abrirFormularioNuevo(indice: number): Promise<void> {
    if (!respuestaGemini) return

    let precio: number | null = null

    try {
      setError('')
      const linea = await window.api.precioLineaFactura(respuestaGemini.respuesta, indice)
      precio = linea.precioFactura
    } catch {
      // Sin precio sugerido: el usuario lo escribe a mano.
    }

    setFormularioNuevo({ indice, precio })
  }

  async function crearProductoNuevo(
    indice: number,
    nombre: string,
    precioCompra: number
  ): Promise<void> {
    if (!respuestaGemini) return

    const confirmado = window.confirm(
      `¿Crear el producto "${nombre}" en el inventario con precio de compra ${formatearPesos(precioCompra)}?`
    )

    if (!confirmado) return

    try {
      setCreandoProducto(true)
      setError('')

      const creado = await window.api.crearProducto(nombre, precioCompra)

      // Se refresca el catálogo para que el producto nuevo quede disponible.
      await cargarCatalogo().catch(() => undefined)

      const resultadosActualizados = resultadosCoincidencia.map((resultado, posicion) =>
        posicion === indice
          ? {
              ...resultado,
              productoSeleccionadoId: creado.id,
              candidatos: [
                {
                  id: creado.id,
                  nombre: creado.nombre,
                  precio: creado.precio_compra,
                  puntuacion: 100,
                  motivo: 'Producto creado manualmente.',
                  codigo: null
                },
                ...resultado.candidatos
              ]
            }
          : resultado
      )

      setResultadosCoincidencia(resultadosActualizados)
      setFormularioNuevo(null)

      setComparacionesPrecio(
        await window.api.compararPrecios(
          respuestaGemini.respuesta,
          resultadosActualizados
        )
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo crear el producto.'
      )
    } finally {
      setCreandoProducto(false)
    }
  }

  // Botón o formulario para agregar el producto cuando no existe en el inventario.
  function renderProductoNuevo(
    resultado: ResultadoCoincidencia,
    indice: number
  ): JSX.Element | null {
    if (resultado.productoSeleccionadoId) return null

    if (formularioNuevo?.indice === indice) {
      return (
        <FormularioProductoNuevo
          nombreInicial={resultado.productoFactura}
          precioInicial={formularioNuevo.precio}
          guardando={creandoProducto}
          onGuardar={(nombre, precio) => void crearProductoNuevo(indice, nombre, precio)}
          onCancelar={() => setFormularioNuevo(null)}
        />
      )
    }

    if (resultado.candidatos.length > 0 && resultado.estado !== 'sin_coincidencia') {
      return null
    }

    return (
      <button
        type="button"
        className="button secondary add-product-button"
        onClick={() => void abrirFormularioNuevo(indice)}
      >
        + Agregar como producto nuevo
      </button>
    )
  }

  // Cartel provisional: el precio de la base de datos ya se conoce al elegir
  // el producto; el de la factura llega cuando termina el cálculo.
  function renderCartelCalculando(resultado: ResultadoCoincidencia): JSX.Element {
    const candidato = resultado.candidatos.find(
      (item) => item.id === resultado.productoSeleccionadoId
    )

    return (
      <div className="price-compare">
        <div className="price-banner">
          <div className="price-banner-box">
            <small>Precio de compra en la base de datos</small>
            <strong>
              {candidato && candidato.precio !== null && candidato.precio > 0
                ? formatearPesos(candidato.precio)
                : 'Sin precio'}
            </strong>
          </div>

          <span className="price-banner-arrow" aria-hidden="true">
            →
          </span>

          <div className="price-banner-box invoice">
            <small>Precio en la factura</small>
            <strong>Calculando...</strong>
          </div>
        </div>
      </div>
    )
  }

  function renderComparacionPrecio(indice: number): JSX.Element | null {
    const comparacion = comparacionesPrecio[indice]

    if (!comparacion) return null

    const etiqueta = etiquetaPrecio(comparacion.estado)
    const base = comparacion.baseComparacion === 'con_iva' ? 'con IVA' : 'sin IVA'
    const nuevoPrecio = comparacion.precioFactura

    const puedeAutorizar =
      !comparacion.provisional &&
      comparacion.estado !== 'igual' &&
      nuevoPrecio !== null

    return (
      <div className="price-compare">
        <div className="price-compare-head">
          <small>
            COMPARACIÓN DE PRECIOS{comparacion.provisional ? ' · PROVISIONAL' : ''}
          </small>

          <span className={`status-pill ${etiqueta.clase}`}>{etiqueta.texto}</span>
        </div>

        <div className="price-banner">
          <div className="price-banner-box">
            <small>Precio de compra en la base de datos</small>
            <strong>
              {comparacion.precioActual !== null
                ? formatearPesos(comparacion.precioActual)
                : 'Sin precio'}
            </strong>
          </div>

          <span className="price-banner-arrow" aria-hidden="true">
            →
          </span>

          <div className="price-banner-box invoice">
            <small>Precio en la factura ({base})</small>
            <strong>
              {comparacion.precioFactura !== null
                ? formatearPesos(comparacion.precioFactura)
                : '—'}
            </strong>
          </div>

          <div className={`price-banner-diff price-${comparacion.estado}`}>
            <small>Diferencia</small>
            <strong>{formatearVariacion(comparacion)}</strong>
          </div>
        </div>

        <div className="price-grid">
          <span>
            <small>Factura sin IVA</small>
            <strong>
              {comparacion.precioFacturaSinIva !== null
                ? formatearPesos(comparacion.precioFacturaSinIva)
                : '—'}
            </strong>
          </span>

          <span>
            <small>Factura con IVA</small>
            <strong>
              {comparacion.precioFacturaConIva !== null
                ? formatearPesos(comparacion.precioFacturaConIva)
                : '—'}
            </strong>
          </span>

          <span>
            <small>Cantidad</small>
            <strong>
              {comparacion.cantidad ?? '—'} {unidadLegible(comparacion.unidad)}
            </strong>
          </span>
        </div>

        {comparacion.alertas.length > 0 && (
          <ul className="price-alerts">
            {comparacion.alertas.map((alerta) => (
              <li key={alerta}>{alerta}</li>
            ))}
          </ul>
        )}

        {preciosAutorizados[indice] ? (
          <div className="price-applied">
            ✓ Precio de compra actualizado a{' '}
            {comparacion.precioActual !== null
              ? formatearPesos(comparacion.precioActual)
              : 'el de la factura'}
          </div>
        ) : puedeAutorizar && nuevoPrecio !== null ? (
          <button
            type="button"
            className="button primary price-change-button"
            disabled={actualizandoPrecio === indice}
            onClick={() => void aplicarPrecioFactura(indice)}
          >
            {actualizandoPrecio === indice
              ? 'Actualizando precio...'
              : `${comparacion.estado === 'sin_referencia' ? 'Establecer' : 'Cambiar'} precio de compra por el de la factura (${formatearPesos(nuevoPrecio)})`}
          </button>
        ) : comparacion.provisional ? (
          <small className="muted">
            Confirma el producto en la revisión para poder cambiar el precio.
          </small>
        ) : null}
      </div>
    )
  }

  function renderResultadosCoincidencia(): JSX.Element | null {
    if (comparandoProductos) {
      return (
        <article className="panel">
          <div className="empty-state">
            <strong>Comparando productos...</strong>
            <p>Buscando coincidencias en el catálogo de ferretería.</p>
          </div>
        </article>
      )
    }

    if (resultadosCoincidencia.length === 0) {
      return null
    }

    const altas = resultadosCoincidencia.filter(
      (resultado) => resultado.estado === 'coincidencia_alta'
    ).length

    const revision = resultadosCoincidencia.filter(
      (resultado) => resultado.estado === 'revision_manual'
    ).length

    const sinCoincidencia = resultadosCoincidencia.filter(
      (resultado) => resultado.estado === 'sin_coincidencia'
    ).length

    const preciosMasAltos = comparacionesPrecio.filter(
      (comparacion) => comparacion?.estado === 'aumento'
    ).length

    const preciosMasBajos = comparacionesPrecio.filter(
      (comparacion) => comparacion?.estado === 'disminucion'
    ).length

    const preciosAutorizadosTotal = Object.values(preciosAutorizados).filter(Boolean).length

    return (
      <article className="panel matching-panel">
        <div className="panel-heading">
          <div>
            <span className="step-number">04</span>
            <h3>Comparación con el catálogo</h3>
          </div>

          <span className="status-pill success">
            {resultadosCoincidencia.length} productos comparados
          </span>
        </div>

        <div className="matching-summary">
          <span>
            <strong>{altas}</strong>
            Coincidencias altas
          </span>

          <span>
            <strong>{revision}</strong>
            Para revisar
          </span>

          <span>
            <strong>{sinCoincidencia}</strong>
            Sin coincidencia
          </span>

          <span>
            <strong>{preciosMasAltos}</strong>
            Precios más altos
          </span>

          <span>
            <strong>{preciosMasBajos}</strong>
            Precios más bajos
          </span>

          <span>
            <strong>{preciosAutorizadosTotal}</strong>
            Precios actualizados
          </span>
        </div>


        
        {/* TEXTLIST DESPLEGABLE DE COINCIDENCIAS ALTAS */}
        {resultadosCoincidencia.some(
          (resultado) => resultado.estado === 'coincidencia_alta'
        ) && (
          <section className="matching-high-matches">
            <h3>Productos con coincidencia alta</h3>

            <ul className="matching-high-textlist">
              {resultadosCoincidencia.map((resultado, index) => {
                if (resultado.estado !== 'coincidencia_alta') {
                  return null;
                }

                return (
                  <li
                    className="matching-high-entry"
                    key={resultado.productoFactura + '-' + index}
                  >
                    <details className="matching-high-details">
                      <summary>
                        <span className="matching-high-product-name">
                          {resultado.productoFactura}
                        </span>

                        <span className="matching-high-score">
                          {resultado.puntuacion}% de similitud
                        </span>
                      </summary>

                      <div className="matching-high-options">
                        <p className="matching-high-instruction">
                          Selecciona el producto correcto del inventario:
                        </p>

                        {resultado.candidatos.length > 0 ? (
                          <div className="matching-candidates">
                            <ListaCandidatos
                              candidatos={resultado.candidatos}
                              seleccionadoId={resultado.productoSeleccionadoId}
                              deshabilitado={seleccionandoCandidato === index}
                              onSeleccionar={(candidatoId) =>
                                void seleccionarCandidato(index, candidatoId)
                              }
                            />
                          </div>
                        ) : (
                          <p className="matching-reason">
                            No se encontraron productos candidatos.
                          </p>
                        )}

                        {renderProductoNuevo(resultado, index)}

                        {resultado.productoSeleccionadoId && (
                          seleccionandoCandidato === index ? (
                            renderCartelCalculando(resultado)
                          ) : (
                            renderComparacionPrecio(index)
                          )
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        )}


        <ol className="matching-list">
          {resultadosCoincidencia
            .map((resultado, index) => ({ resultado, index }))
            .filter(({ resultado }) =>
              Boolean(resultado.estado !== 'coincidencia_alta')
            )
            .map(({ resultado, index }) => (
            <li
              className="matching-item"
            key={`${resultado.productoFactura}-${index}`}
          >
            <div className="matching-product-header">
              <div>
                <small>PRODUCTO DE LA FACTURA</small>
                <strong>{resultado.productoFactura}</strong>
              </div>

              <span
                className={`status-pill ${
                  resultado.estado === 'coincidencia_alta'
                    ? 'success'
                    : resultado.estado === 'revision_manual'
                      ? 'warning'
                      : ''
                }`}
              >
                {resultado.estado === 'coincidencia_alta'
                  ? 'Coincidencia alta'
                  : resultado.estado === 'revision_manual'
                    ? 'Revisión manual'
                    : 'Sin coincidencia'}
              </span>
            </div>

            <div className="matching-score">
              Similitud: <strong>{resultado.puntuacion}%</strong>
            </div>

            <p className="matching-reason">{resultado.motivo}</p>

            {resultado.candidatos.length > 0 && (
              <div className="matching-candidates">
                <ListaCandidatos
                  candidatos={resultado.candidatos}
                  seleccionadoId={resultado.productoSeleccionadoId}
                  deshabilitado={seleccionandoCandidato === index}
                  onSeleccionar={(candidatoId) =>
                    void seleccionarCandidato(index, candidatoId)
                  }
                />
              </div>
            )}

            {renderProductoNuevo(resultado, index)}

            {resultado.productoSeleccionadoId ? (
              seleccionandoCandidato === index ? (
                renderCartelCalculando(resultado)
              ) : (
                renderComparacionPrecio(index)
              )
            ) : (
              <p className="selection-hint">
                Selecciona el producto correcto para comparar su precio.
                No se actualizará ningún precio automáticamente.
              </p>
            )}
            </li>
          ))}
        </ol>
      </article>
    )
  }

  if (!autenticado) {
    return (
      <main className="login-screen">
        <form
          className="login-card"
          onSubmit={(event) => {
            event.preventDefault()
            void iniciarSesion()
          }}
        >
          <div className="brand-icon">D</div>

          <h1>Importador DIAN</h1>
          <p>Importación de facturas electrónicas</p>

          <label htmlFor="password">Contraseña de acceso</label>

          <input
            id="password"
            type="password"
            value={contrasena}
            onChange={(event) => setContrasena(event.target.value)}
            placeholder="Ingresa tu contraseña"
            autoFocus
          />

          {error && <div className="error-message">{error}</div>}

          <button className="button primary full" disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>

          <span className="login-version">
            {appInfo?.name || 'Importador DIAN'} · {appInfo?.version || ''}
          </span>
        </form>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon small">D</div>

          <div>
            <h1>Importador DIAN</h1>
            <span>Gestión de facturas electrónicas</span>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="connection-status">
            <span className="status-dot" />
            Sesión activa
          </span>

          <button
            className="button secondary"
            onClick={() => void cerrarSesion()}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <span className="sidebar-label">MENÚ PRINCIPAL</span>

          <button
            className={`nav-button ${seccion === 'inicio' ? 'active' : ''}`}
            onClick={() => setSeccion('inicio')}
          >
            <span>⌂</span> Inicio
          </button>

          <button
            className={`nav-button ${seccion === 'xml' ? 'active' : ''}`}
            onClick={() => setSeccion('xml')}
          >
            <span>▤</span> Archivo XML
          </button>

          <button
            className={`nav-button ${seccion === 'catalogo' ? 'active' : ''}`}
            onClick={() => setSeccion('catalogo')}
          >
            <span>▦</span> Catálogo
          </button>

          <div className="sidebar-bottom">
            <span>Conexión con API</span>
            <strong>
              <span className="status-dot" />
              Disponible
            </strong>
            <small>{appInfo?.name || 'Importador DIAN'}</small>
          </div>
        </aside>

        <section className="main-content">
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => setError('')}>×</button>
            </div>
          )}

          {seccion === 'inicio' && (
            <div className="page-container">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">PANEL PRINCIPAL</span>
                  <h2>Importación de facturas</h2>
                  <p>
                    Selecciona una factura electrónica para comenzar.
                  </p>
                </div>

                <button
                  className="button primary"
                  onClick={() => void seleccionarXML()}
                >
                  + Seleccionar XML
                </button>
              </div>

              <div className="dashboard-grid">
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="step-number">01</span>
                      <h3>Archivo de factura</h3>
                    </div>

                    <span className="panel-icon">▤</span>
                  </div>

                  <div className="upload-area">
                    <div className="upload-icon">↑</div>

                    <strong>Selecciona un archivo XML</strong>

                    <p>
                      Elige una factura electrónica descargada de la DIAN.
                    </p>

                    <button
                      className="button primary"
                      onClick={() => void seleccionarXML()}
                    >
                      Examinar archivos
                    </button>
                  </div>

                  {archivoXML && (
                    <div className="file-summary">
                      <span className="file-icon">XML</span>

                      <div className="file-details">
                        <strong>{archivoXML.nombre}</strong>
                        <small>{archivoXML.mensaje}</small>
                      </div>

                      <span className={`status-pill ${etiquetaArchivo(archivoXML).clase}`}>
                        {etiquetaArchivo(archivoXML).texto}
                      </span>
                    </div>
                  )}

                  {archivoXML && renderResumenArchivo()}
                </article>

                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="step-number">02</span>
                      <h3>Procesamiento con Gemini</h3>
                    </div>

                    <span className="panel-icon">✧</span>
                  </div>

                  <div className="gemini-content">
                    <div className="gemini-icon">✧</div>

                    <strong>Inteligencia artificial</strong>

                    <p>
                      Gemini extraerá los datos de la factura y después
                      compararemos sus productos con el catálogo.
                    </p>

                    <button
                      className="button primary full"
                      onClick={() => void enviarAGemini()}
                      disabled={!archivoXML || !archivoXML.valido || procesandoGemini}
                    >
                      {procesandoGemini
                        ? 'Procesando factura...'
                        : 'Procesar factura'}
                    </button>

                    {!archivoXML && (
                      <small className="muted">
                        Primero debes seleccionar una factura.
                      </small>
                    )}

                    {archivoXML && !archivoXML.valido && (
                      <small className="muted">{archivoXML.mensaje}</small>
                    )}

                    {procesandoGemini && (
                      <small className="muted">
                        {comparandoProductos
                          ? 'Comparando productos con el catálogo...'
                          : 'Extrayendo información con Gemini...'}
                      </small>
                    )}
                  </div>
                </article>
              </div>
{renderResultadosCoincidencia()}

              
            </div>
          )}

          {seccion === 'xml' && (
            <div className="page-container">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">DOCUMENTOS</span>
                  <h2>Archivo XML</h2>
                  <p>
                    Selecciona y consulta el contenido de una factura.
                  </p>
                </div>

                <button
                  className="button primary"
                  onClick={() => void seleccionarXML()}
                >
                  Seleccionar XML
                </button>
              </div>

              <article className="panel standalone-panel">
                {archivoXML ? (
                  <>
                    <div className="file-summary">
                      <span className="file-icon">XML</span>

                      <div className="file-details">
                        <strong>{archivoXML.nombre}</strong>
                        <small>{archivoXML.mensaje}</small>
                      </div>

                      <span className={`status-pill ${etiquetaArchivo(archivoXML).clase}`}>
                        {etiquetaArchivo(archivoXML).texto}
                      </span>

                      <button
                        className="button primary"
                        onClick={() => void enviarAGemini()}
                        disabled={!archivoXML.valido || procesandoGemini}
                      >
                        {procesandoGemini
                          ? 'Procesando...'
                          : 'Procesar factura'}
                      </button>
                    </div>

                    {!archivoXML.valido && (
                      <p className="matching-reason">{archivoXML.mensaje}</p>
                    )}

                    {renderResumenArchivo()}
{renderResultadosCoincidencia()}

                    
                  </>
                ) : (
                  <div className="empty-state">
                    <span>▤</span>
                    <strong>No hay ningún archivo seleccionado</strong>

                    <button
                      className="button primary"
                      onClick={() => void seleccionarXML()}
                    >
                      Seleccionar factura
                    </button>
                  </div>
                )}
              </article>
            </div>
          )}

          {seccion === 'catalogo' && (
            <div className="page-container">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">INVENTARIO</span>
                  <h2>Catálogo de productos</h2>
                  <p>
                    Productos consultados desde la API de Ferretería.
                  </p>
                </div>

                <button
                  className="button secondary"
                  onClick={() => void actualizarCatalogoManual()}
                  disabled={cargandoProductos}
                >
                  {cargandoProductos ? 'Actualizando...' : 'Actualizar'}
                </button>
              </div>

              <article className="panel catalog-panel">
                <div className="catalog-summary">
                  <strong>{productos.length}</strong>
                  <span>productos encontrados</span>

                  {catalogoActualizadoEn && (
                    <span>
                      ·{' '}
                      {catalogoOrigen === 'api'
                        ? 'Actualizado'
                        : 'Copia local del'}{' '}
                      {new Date(catalogoActualizadoEn).toLocaleString('es-CO', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </span>
                  )}
                </div>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>ID</th>
                        <th>Precio de compra</th>
                      </tr>
                    </thead>

                    <tbody>
                      {productos.map((producto) => (
                        <tr key={producto.id}>
                          <td>{producto.nombre}</td>
                          <td>{producto.id}</td>
                          <td>
                            {producto.precio_compra !== null
                              ? producto.precio_compra.toLocaleString('es-CO', {
                                  style: 'currency',
                                  currency: 'COP'
                                })
                              : 'Sin precio'}
                          </td>
                        </tr>
                      ))}

                      {productos.length === 0 && (
                        <tr>
                          <td colSpan={3} className="empty-table">
                            No hay productos para mostrar.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          )}
        </section>
      </div>

      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          Aplicación conectada
        </span>

        <span>
          Importador DIAN · {appInfo?.version || '1.0.0'}
        </span>
      </footer>
    </main>
  )
}

export default App
