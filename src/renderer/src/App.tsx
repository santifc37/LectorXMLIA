
import { useEffect, useState } from 'react'
import './assets/main.css'

interface AppInfo {
  name: string
  version: string
  platform: string
}

interface Producto {
  id: string
  nombre: string
  precio_compra: number
}

interface ArchivoXML {
  nombre: string
  contenido: string
  valido: boolean
  mensaje: string
  tipoDocumento: 'factura' | 'nota_credito' | 'nota_debito' | 'desconocido'
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
}

interface ResultadoCoincidencia {
  productoFactura: string
  estado: 'coincidencia_alta' | 'revision_manual' | 'sin_coincidencia'
  puntuacion: number
  motivo: string
  candidatos: CandidatoCoincidencia[]
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

  const [archivoXML, setArchivoXML] = useState<ArchivoXML | null>(null)
  const [procesandoGemini, setProcesandoGemini] = useState(false)
  const [respuestaGemini, setRespuestaGemini] =
    useState<ResultadoGemini | null>(null)

  const [resultadosCoincidencia, setResultadosCoincidencia] =
    useState<ResultadoCoincidencia[]>([])

  const [comparandoProductos, setComparandoProductos] = useState(false)

  useEffect(() => {
    window.api.getAppInfo().then(setAppInfo).catch(() => {})

    window.api.comprobarSesion()
      .then((resultado) => setAutenticado(resultado.autenticado))
      .catch(() => setAutenticado(false))
  }, [])

  async function iniciarSesion(): Promise<void> {
    if (!contrasena.trim()) {
      setError('Ingresa la contraseña.')
      return
    }

    try {
      setCargando(true)
      setError('')

      await window.api.iniciarSesion(contrasena)

      setAutenticado(true)
      setContrasena('')
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
      setProductos([])
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

  async function cargarProductos(): Promise<void> {
    try {
      setCargandoProductos(true)
      setError('')

      const resultado = await window.api.obtenerProductos()

      setProductos(resultado)
      setSeccion('catalogo')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar los productos.'
      )
    } finally {
      setCargandoProductos(false)
    }
  }

  async function seleccionarXML(): Promise<void> {
    try {
      setError('')
      setRespuestaGemini(null)
      setResultadosCoincidencia([])

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

    try {
      setProcesandoGemini(true)
      setComparandoProductos(false)
      setError('')
      setRespuestaGemini(null)
      setResultadosCoincidencia([])

      // 1. Extraer los datos de la factura con Gemini.
      const resultado: ResultadoGemini =
        await window.api.procesarXMLConGemini(archivoXML.contenido)

      setRespuestaGemini(resultado)

      // 2. Comprobar que Gemini devolvió un JSON válido.
      let factura: {
        documento_valido: boolean
        productos: {
          descripcion: string
          cantidad?: number | null
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

      // 3. Obtener el catálogo si todavía no está cargado.
      let catalogo = productos

      if (catalogo.length === 0) {
        setCargandoProductos(true)

        try {
          catalogo = await window.api.obtenerProductos()
          setProductos(catalogo)
        } finally {
          setCargandoProductos(false)
        }
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
        </div>

        {resultadosCoincidencia.map((resultado, index) => (
          <div
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
                {resultado.candidatos.map((candidato) => (
                  <div className="candidate-item" key={candidato.id}>
                    <div>
                      <strong>{candidato.nombre}</strong>

                      <small>
                        {candidato.precio !== null
                          ? Number(candidato.precio).toLocaleString('es-CO', {
                              style: 'currency',
                              currency: 'COP'
                            })
                          : 'Precio no disponible'}
                      </small>

                      {candidato.motivo && (
                        <small>{candidato.motivo}</small>
                      )}
                    </div>

                    <span>{candidato.puntuacion}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
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
            onClick={() => void cargarProductos()}
            disabled={cargandoProductos}
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

                      <span className="status-pill success">Recibido</span>
                    </div>
                  )}
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
                      disabled={!archivoXML || procesandoGemini}
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

              {respuestaGemini && (
                <article className="panel gemini-response-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="step-number">RESULTADO</span>
                      <h3>Respuesta de Gemini</h3>
                    </div>

                    <span className="status-pill success">
                      Respuesta recibida
                    </span>
                  </div>

                  <div className="gemini-response-content">
                    <strong>Modelo: {respuestaGemini.modelo}</strong>
                    <pre>{respuestaGemini.respuesta}</pre>
                  </div>
                </article>
              )}

              {renderResultadosCoincidencia()}

              <article className="panel xml-panel">
                <div className="panel-heading">
                  <div>
                    <span className="step-number">03</span>
                    <h3>Contenido del archivo XML</h3>
                  </div>

                  <span className="status-pill">
                    {archivoXML
                      ? 'Archivo cargado'
                      : 'Esperando archivo'}
                  </span>
                </div>

                <div className="xml-viewer">
                  {archivoXML ? (
                    <pre>{archivoXML.contenido}</pre>
                  ) : (
                    <div className="empty-state">
                      <span>▤</span>
                      <strong>No hay ningún XML seleccionado</strong>
                      <p>El contenido de la factura aparecerá aquí.</p>
                    </div>
                  )}
                </div>
              </article>
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

                      <button
                        className="button primary"
                        onClick={() => void enviarAGemini()}
                        disabled={procesandoGemini}
                      >
                        {procesandoGemini
                          ? 'Procesando...'
                          : 'Procesar factura'}
                      </button>
                    </div>

                    {respuestaGemini && (
                      <div className="gemini-response-content">
                        <strong>
                          Respuesta de Gemini · {respuestaGemini.modelo}
                        </strong>
                        <pre>{respuestaGemini.respuesta}</pre>
                      </div>
                    )}

                    {renderResultadosCoincidencia()}

                    <div className="xml-viewer large">
                      <pre>{archivoXML.contenido}</pre>
                    </div>
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
                  onClick={() => void cargarProductos()}
                  disabled={cargandoProductos}
                >
                  {cargandoProductos ? 'Actualizando...' : 'Actualizar'}
                </button>
              </div>

              <article className="panel catalog-panel">
                <div className="catalog-summary">
                  <strong>{productos.length}</strong>
                  <span>productos encontrados</span>
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
                            {Number(producto.precio_compra).toLocaleString(
                              'es-CO',
                              {
                                style: 'currency',
                                currency: 'COP'
                              }
                            )}
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
