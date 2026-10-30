
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const raiz = process.cwd()
const appPath = path.join(raiz, 'src/renderer/src/App.tsx')
const cssPath = path.join(raiz, 'src/renderer/src/assets/main.css')
const packagePath = path.join(raiz, 'package.json')

function detener(mensaje) {
  console.error(`\nERROR: ${mensaje}`)
  process.exit(1)
}

if (!fs.existsSync(packagePath)) {
  detener('Ejecuta el script desde la raíz de LectorXMLIA.')
}

const paquete = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

if (paquete.name !== 'importador-dian') {
  detener('El proyecto no coincide con Importador DIAN.')
}

if (!fs.existsSync(appPath) || !fs.existsSync(cssPath)) {
  detener('No se encontraron los archivos del dashboard.')
}

const appOriginal = fs.readFileSync(appPath, 'utf8')
const cssOriginal = fs.readFileSync(cssPath, 'utf8')

const inicio = appOriginal.indexOf(
  '  function renderResultadosCoincidencia()'
)

const fin = appOriginal.indexOf(
  '\n  if (!autenticado) {',
  inicio
)

if (inicio === -1 || fin === -1) {
  detener('No se encontró la función de resultados esperada.')
}

const funcionOriginal = appOriginal.slice(inicio, fin)

if (
  !funcionOriginal.includes('resultadosCoincidencia.map') ||
  !funcionOriginal.includes('renderComparacionPrecio(index)')
) {
  detener('La función actual tiene una estructura diferente. No se modificó nada.')
}

const nuevaFuncion = `  function renderResultadosCoincidencia(): JSX.Element | null {
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

    if (resultadosCoincidencia.length === 0) return null

    const altas = resultadosCoincidencia.filter(
      (r) => r.estado === 'coincidencia_alta'
    ).length

    const revision = resultadosCoincidencia.filter(
      (r) => r.estado === 'revision_manual'
    ).length

    const sinCoincidencia = resultadosCoincidencia.filter(
      (r) => r.estado === 'sin_coincidencia'
    ).length

    const preciosMasAltos = comparacionesPrecio.filter(
      (p) => p?.estado === 'aumento'
    ).length

    const preciosMasBajos = comparacionesPrecio.filter(
      (p) => p?.estado === 'disminucion'
    ).length

    const preciosAutorizadosTotal =
      Object.values(preciosAutorizados).filter(Boolean).length

    return (
      <article className="panel matching-panel">
        <div className="panel-heading matching-heading">
          <div>
            <span className="step-number">04 · REVISIÓN</span>
            <h3>Productos de la factura</h3>
            <p className="matching-intro">
              Revisa los productos encontrados y confirma que correspondan
              con los artículos de tu inventario.
            </p>
          </div>

          <span className="status-pill success">
            {resultadosCoincidencia.length} productos
          </span>
        </div>

        <div className="matching-summary">
          <span className="summary-high">
            <strong>{altas}</strong>
            Coincidencias altas
          </span>
          <span className="summary-review">
            <strong>{revision}</strong>
            Para revisar
          </span>
          <span className="summary-missing">
            <strong>{sinCoincidencia}</strong>
            Sin coincidencia
          </span>
          <span className="summary-price-up">
            <strong>{preciosMasAltos}</strong>
            Precios más altos
          </span>
          <span className="summary-price-down">
            <strong>{preciosMasBajos}</strong>
            Precios más bajos
          </span>
          <span className="summary-authorized">
            <strong>{preciosAutorizadosTotal}</strong>
            Cambios autorizados
          </span>
        </div>

        <ol className="matching-list">
          {resultadosCoincidencia.map((resultado, index) => (
            <li
              className={\`matching-item matching-\${resultado.estado}\`}
              key={\`\${resultado.productoFactura}-\${index}\`}
            >
              <div className="matching-item-top">
                <span className="matching-item-number">
                  PRODUCTO {String(index + 1).padStart(2, '0')}
                </span>

                <span
                  className={\`status-pill matching-status matching-status-\${resultado.estado}\`}
                >
                  {resultado.estado === 'coincidencia_alta'
                    ? 'Coincidencia alta'
                    : resultado.estado === 'revision_manual'
                      ? 'Revisión manual'
                      : 'Sin coincidencia'}
                </span>
              </div>

              <div className="matching-product-header">
                <div>
                  <small>DESCRIPCIÓN EN LA FACTURA</small>
                  <strong>{resultado.productoFactura}</strong>
                </div>
              </div>

              <div className="matching-detail">
                <div className="matching-score">
                  <span>Similitud encontrada</span>
                  <strong>{resultado.puntuacion}%</strong>
                </div>

                <div
                  className="matching-progress"
                  role="progressbar"
                  aria-valuenow={resultado.puntuacion}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Porcentaje de similitud"
                >
                  <div
                    className="matching-progress-fill"
                    style={{
                      width: \`\${Math.max(0, Math.min(100, resultado.puntuacion))}%\`
                    }}
                  />
                </div>

                <p className="matching-reason">{resultado.motivo}</p>
              </div>

              {resultado.candidatos.length > 0 ? (
                <div className="matching-candidates-section">
                  <strong className="matching-section-title">
                    {resultado.estado === 'coincidencia_alta'
                      ? 'Producto encontrado en el inventario'
                      : 'Productos similares encontrados'}
                  </strong>

                  <ul className="matching-candidates">
                    {resultado.candidatos.map((candidato) => (
                      <li className="candidate-item" key={candidato.id}>
                        <div className="candidate-info">
                          <strong>{candidato.nombre}</strong>

                          <small>
                            Precio de compra:{' '}
                            {candidato.precio !== null
                              ? Number(candidato.precio).toLocaleString(
                                  'es-CO',
                                  {
                                    style: 'currency',
                                    currency: 'COP'
                                  }
                                )
                              : 'No disponible'}
                          </small>

                          {candidato.motivo && (
                            <small>{candidato.motivo}</small>
                          )}
                        </div>

                        <span className="candidate-score">
                          {candidato.puntuacion}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="matching-no-candidate">
                  No se encontraron productos similares en el inventario.
                </div>
              )}

              {renderComparacionPrecio(index)}
            </li>
          ))}
        </ol>

        <div className="matching-legend">
          <strong>¿Qué significan los estados?</strong>
          <div>
            <span className="legend-dot legend-green" />
            <span>
              <b>Coincidencia alta:</b> el sistema encontró un producto muy
              similar en tu inventario.
            </span>
          </div>
          <div>
            <span className="legend-dot legend-orange" />
            <span>
              <b>Revisión manual:</b> debes comprobar si el producto es el correcto.
            </span>
          </div>
          <div>
            <span className="legend-dot legend-red" />
            <span>
              <b>Sin coincidencia:</b> no se encontró un producto equivalente.
            </span>
          </div>
        </div>
      </article>
    )
  }`

const appNuevo =
  appOriginal.slice(0, inicio) +
  nuevaFuncion +
  appOriginal.slice(fin)

const estilosNuevos = `

/* =====================================================
   REDISEÑO DE RESULTADOS DE COINCIDENCIA
   ===================================================== */

.matching-panel {
  padding: 24px;
}

.matching-heading {
  align-items: flex-start;
}

.matching-intro {
  color: #667085;
  font-size: 12px;
  line-height: 1.6;
  margin: 8px 0 0;
  max-width: 620px;
}

.matching-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 18px 0 22px;
}

.matching-summary span {
  min-width: 0;
  padding: 13px 15px;
  border: 1px solid #eaecf0;
  border-radius: 11px;
  background: #f8fafc;
}

.matching-summary span strong {
  font-size: 24px;
}

.matching-summary .summary-high {
  background: #ecfdf3;
  border-color: #abefc6;
  color: #067647;
}

.matching-summary .summary-high strong {
  color: #067647;
}

.matching-summary .summary-review {
  background: #fffaeb;
  border-color: #fedf89;
  color: #b54708;
}

.matching-summary .summary-review strong {
  color: #b54708;
}

.matching-summary .summary-missing {
  background: #fef3f2;
  border-color: #fecdca;
  color: #b42318;
}

.matching-summary .summary-missing strong {
  color: #b42318;
}

.matching-summary .summary-price-up {
  background: #fff4ed;
  border-color: #ffcead;
  color: #c4320a;
}

.matching-summary .summary-price-up strong {
  color: #c4320a;
}

.matching-summary .summary-price-down {
  background: #eff8ff;
  border-color: #b2ddff;
  color: #175cd3;
}

.matching-summary .summary-price-down strong {
  color: #175cd3;
}

.matching-summary .summary-authorized {
  background: #f4f3ff;
  border-color: #d9d6fe;
  color: #5925dc;
}

.matching-summary .summary-authorized strong {
  color: #5925dc;
}

.matching-list {
  display: flex;
  flex-direction: column;
  gap: 17px;
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: matching;
}

.matching-list > .matching-item {
  position: relative;
  min-width: 0;
  padding: 20px;
  border: 1px solid #e4e7ec;
  border-left: 5px solid #98a2b3;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 2px 7px rgb(16 24 40 / 3%);
}

.matching-list > .matching-coincidencia_alta {
  border-left-color: #12b76a;
  background: linear-gradient(110deg, #f6fef9 0%, #fff 35%);
}

.matching-list > .matching-revision_manual {
  border-left-color: #f79009;
  background: linear-gradient(110deg, #fffcf5 0%, #fff 35%);
}

.matching-list > .matching-sin_coincidencia {
  border-left-color: #f04438;
  background: linear-gradient(110deg, #fff8f7 0%, #fff 35%);
}

.matching-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 17px;
}

.matching-item-number {
  color: #667085;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
}

.matching-status-coincidencia_alta {
  background: #dcfae6;
  color: #067647;
}

.matching-status-revision_manual {
  background: #fef0c7;
  color: #b54708;
}

.matching-status-sin_coincidencia {
  background: #fee4e2;
  color: #b42318;
}

.matching-product-header {
  margin-bottom: 14px;
}

.matching-product-header small {
  color: #667085;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .5px;
}

.matching-product-header strong {
  color: #101828;
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.matching-detail {
  padding: 13px 15px;
  border: 1px solid #eaecf0;
  border-radius: 9px;
  background: rgb(255 255 255 / 80%);
}

.matching-score {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 0 8px;
  color: #475467;
  font-size: 12px;
}

.matching-score strong {
  color: #344054;
  font-size: 14px;
}

.matching-progress {
  height: 7px;
  overflow: hidden;
  border-radius: 20px;
  background: #eaecf0;
}

.matching-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: #12b76a;
  transition: width .25s ease;
}

.matching-revision_manual .matching-progress-fill {
  background: #f79009;
}

.matching-sin_coincidencia .matching-progress-fill {
  background: #f04438;
}

.matching-detail .matching-reason {
  margin: 10px 0 0;
  line-height: 1.55;
}

.matching-candidates-section {
  margin-top: 17px;
}

.matching-section-title {
  display: block;
  margin-bottom: 10px;
  color: #344054;
  font-size: 12px;
}

.matching-candidates {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.matching-candidates .candidate-item {
  padding: 13px 15px;
  background: #fff;
  border: 1px solid #d0d5dd;
  border-radius: 9px;
}

.candidate-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.candidate-info strong {
  color: #344054;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.candidate-info small {
  line-height: 1.45;
}

.candidate-score {
  flex-shrink: 0;
  padding: 6px 9px;
  border-radius: 7px;
  background: #eff8ff;
  color: #175cd3;
  font-size: 12px;
  font-weight: 750;
}

.matching-no-candidate {
  margin-top: 13px;
  padding: 13px 15px;
  border: 1px dashed #fda29b;
  border-radius: 9px;
  background: #fff8f7;
  color: #b42318;
  font-size: 12px;
}

.matching-item .price-compare {
  margin-top: 18px;
  padding: 16px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e4e7ec;
}

.matching-legend {
  display: flex;
  flex-direction: column;
  gap: 11px;
  margin-top: 22px;
  padding: 17px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #eaecf0;
}

.matching-legend > strong {
  color: #344054;
  font-size: 12px;
}

.matching-legend > div {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: #667085;
  font-size: 11px;
  line-height: 1.5;
}

.matching-legend b {
  color: #344054;
}

.legend-dot {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  margin-top: 3px;
  border-radius: 50%;
}

.legend-green {
  background: #12b76a;
}

.legend-orange {
  background: #f79009;
}

.legend-red {
  background: #f04438;
}

@media (max-width: 1000px) {
  .matching-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 650px) {
  .matching-panel {
    padding: 14px;
  }

  .matching-summary {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .matching-list > .matching-item {
    padding: 14px;
  }

  .matching-item-top {
    align-items: flex-start;
  }

  .matching-candidates .candidate-item {
    align-items: flex-start;
  }
}
`

if (cssOriginal.includes('REDISEÑO DE RESULTADOS DE COINCIDENCIA')) {
  detener('El rediseño ya parece estar aplicado. No se modificó nada.')
}

const respaldo = path.join(
  raiz,
  `respaldo-dashboard-${Date.now()}`
)

fs.mkdirSync(respaldo, { recursive: true })
fs.copyFileSync(appPath, path.join(respaldo, 'App.tsx'))
fs.copyFileSync(cssPath, path.join(respaldo, 'main.css'))

try {
  fs.writeFileSync(appPath, appNuevo, 'utf8')
  fs.writeFileSync(cssPath, cssOriginal + estilosNuevos, 'utf8')

  console.log('\nDiseño actualizado. Ejecutando TypeScript...\n')

  const resultado = spawnSync(
    'npm',
    ['run', 'typecheck'],
    {
      cwd: raiz,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    }
  )

  if (resultado.status !== 0) {
    throw new Error('Falló la comprobación de TypeScript.')
  }

  console.log('\n¡Dashboard actualizado correctamente!')
  console.log(`Respaldo: ${respaldo}`)
} catch (error) {
  fs.writeFileSync(appPath, appOriginal, 'utf8')
  fs.writeFileSync(cssPath, cssOriginal, 'utf8')

  console.error('\nSe restauraron los archivos originales.')
  console.error(error.message)
  process.exit(1)
}
