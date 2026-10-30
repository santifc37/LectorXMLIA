
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const raiz = process.cwd();

const appPath = path.join(
  raiz,
  'src/renderer/src/App.tsx'
);

const cssPath = path.join(
  raiz,
  'src/renderer/src/assets/main.css'
);

const packagePath = path.join(raiz, 'package.json');

function detener(mensaje) {
  console.error('\nERROR: ' + mensaje);
  process.exit(1);
}

// --------------------------------------------------
// 1. VALIDAR PROYECTO Y ARCHIVOS
// --------------------------------------------------

if (!fs.existsSync(packagePath)) {
  detener('No se encontró package.json.');
}

const packageJson = JSON.parse(
  fs.readFileSync(packagePath, 'utf8')
);

if (packageJson.name !== 'importador-dian') {
  detener('Este no parece ser el proyecto importador-dian.');
}

if (!packageJson.scripts?.typecheck) {
  detener('No existe npm run typecheck en package.json.');
}

if (!fs.existsSync(appPath)) {
  detener('No existe src/renderer/src/App.tsx.');
}

if (!fs.existsSync(cssPath)) {
  detener('No existe src/renderer/src/assets/main.css.');
}

let app = fs.readFileSync(appPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

const marcadorApp = '{/* TABLA DE COINCIDENCIAS ALTAS */}';
const marcadorCss = '/* TABLA DE COINCIDENCIAS ALTAS */';

const funcionesNecesarias = [
  'async function seleccionarCandidato(',
  'function renderComparacionPrecio(',
  'function renderResultadosCoincidencia('
];

for (const funcion of funcionesNecesarias) {
  if (!app.includes(funcion)) {
    detener('No se encontró: ' + funcion);
  }
}

if (app.split(marcadorApp).length - 1 !== 1) {
  detener('No se encontró exactamente una tabla de coincidencias altas.');
}

if (css.split(marcadorCss).length - 1 !== 1) {
  detener('No se encontró exactamente una sección de estilos de la tabla.');
}

const inicioTabla = app.indexOf(marcadorApp);

const inicioLista = app.indexOf(
  '<ol className="matching-list">',
  inicioTabla
);

if (inicioLista === -1) {
  detener('No se encontró la lista de revisión manual después de la tabla.');
}

const bloqueTabla = app.slice(inicioTabla, inicioLista);

const estructurasTabla = [
  'matching-high-table',
  'candidatoSeleccionado',
  'seleccionarCandidato(',
  'renderComparacionPrecio(index)'
];

for (const estructura of estructurasTabla) {
  if (!bloqueTabla.includes(estructura)) {
    detener('La tabla no tiene la estructura esperada. Falta: ' + estructura);
  }
}

// Comprobar que la lista de revisión manual conserva sus candidatos.
const bloqueRevision = app.slice(inicioLista);

if (
  !bloqueRevision.includes('resultado.candidatos.map') ||
  !bloqueRevision.includes('seleccionarCandidato(index, candidato.id)')
) {
  detener('No se encontró la estructura original de selección de candidatos.');
}

// Comprobar que no se haya instalado previamente.
if (app.includes('TEXTLIST DESPLEGABLE DE COINCIDENCIAS ALTAS')) {
  detener('La lista desplegable ya parece estar instalada.');
}

// --------------------------------------------------
// 2. CREAR LA NUEVA LISTA DESPLEGABLE
// --------------------------------------------------

const nuevaLista = String.raw`
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
                            {resultado.candidatos.map((candidato) => (
                              <button
                                type="button"
                                className={
                                  'candidate-item candidate-button' +
                                  (resultado.productoSeleccionadoId === candidato.id
                                    ? ' selected'
                                    : '')
                                }
                                key={candidato.id}
                                onClick={() =>
                                  void seleccionarCandidato(index, candidato.id)
                                }
                                disabled={seleccionandoCandidato === index}
                                aria-pressed={
                                  resultado.productoSeleccionadoId === candidato.id
                                }
                              >
                                <div>
                                  <strong>{candidato.nombre}</strong>

                                  {candidato.codigo && (
                                    <small>
                                      Código: {candidato.codigo}
                                    </small>
                                  )}

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

                                <span>
                                  {resultado.productoSeleccionadoId === candidato.id
                                    ? 'Seleccionado'
                                    : candidato.puntuacion + '% · Elegir'}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="matching-reason">
                            No se encontraron productos candidatos.
                          </p>
                        )}

                        {resultado.productoSeleccionadoId && (
                          seleccionandoCandidato === index ? (
                            <p className="matching-reason">
                              Calculando comparación de precios...
                            </p>
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
`;

// --------------------------------------------------
// 3. NUEVOS ESTILOS
// --------------------------------------------------

const nuevosEstilos = String.raw`

/* TEXTLIST DESPLEGABLE DE COINCIDENCIAS ALTAS */

.matching-high-matches {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #eaecf0;
}

.matching-high-matches h3 {
  margin: 0 0 14px;
  color: #344054;
  font-size: 14px;
}

.matching-high-textlist {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.matching-high-entry {
  width: 100%;
  overflow: hidden;
  border: 1px solid #e4e9f2;
  border-radius: 10px;
  background: #fff;
}

.matching-high-details {
  width: 100%;
}

.matching-high-details summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px;
  cursor: pointer;
  list-style: none;
}

.matching-high-details summary::-webkit-details-marker {
  display: none;
}

.matching-high-details summary::before {
  content: '+';
  width: 18px;
  flex-shrink: 0;
  color: #5271ce;
  font-size: 20px;
  font-weight: 600;
  text-align: center;
}

.matching-high-details[open] summary::before {
  content: '−';
}

.matching-high-product-name {
  flex: 1;
  min-width: 0;
  color: #344054;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.matching-high-score {
  flex-shrink: 0;
  color: #667085;
  font-size: 12px;
}

.matching-high-options {
  padding: 14px 15px 16px;
  border-top: 1px solid #eaecf0;
  background: #fcfcfd;
}

.matching-high-instruction {
  margin: 0 0 12px;
  color: #667085;
  font-size: 12px;
}

.matching-high-options .matching-candidates {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.matching-high-options .candidate-item {
  width: 100%;
  text-align: left;
}

.matching-high-options .candidate-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.matching-high-options .candidate-button > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.matching-high-options .candidate-button small {
  overflow-wrap: anywhere;
}

.matching-high-options .candidate-button > span {
  flex-shrink: 0;
}

.matching-high-options .candidate-button.selected {
  border-color: #5271ce;
  background: #edf2ff;
  box-shadow: 0 0 0 1px #5271ce;
}

@media (max-width: 600px) {
  .matching-high-details summary {
    flex-wrap: wrap;
  }

  .matching-high-score {
    margin-left: 30px;
  }

  .matching-high-options .candidate-button {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;

// --------------------------------------------------
// 4. PREPARAR REEMPLAZOS
// --------------------------------------------------

const nuevaApp =
  app.slice(0, inicioTabla) +
  nuevaLista +
  '\n\n        ' +
  app.slice(inicioLista);

const posicionCss = css.indexOf(marcadorCss);
const cssAnterior = css.slice(posicionCss);

// Verificar que la sección CSS encontrada sea realmente la antigua tabla.
if (
  !cssAnterior.includes('.matching-high-table') ||
  !cssAnterior.includes('.matching-high-price-details:empty')
) {
  detener('Los estilos encontrados no coinciden con los de la tabla original.');
}

const nuevoCss = css.slice(0, posicionCss) + nuevosEstilos;

// --------------------------------------------------
// 5. RESPALDO
// --------------------------------------------------

const carpetaRespaldo = path.join(
  raiz,
  'respaldo-textlist-' + Date.now()
);

fs.mkdirSync(carpetaRespaldo, { recursive: true });

const respaldoApp = path.join(carpetaRespaldo, 'App.tsx');
const respaldoCss = path.join(carpetaRespaldo, 'main.css');

fs.copyFileSync(appPath, respaldoApp);
fs.copyFileSync(cssPath, respaldoCss);

console.log('Respaldo creado: ' + carpetaRespaldo);

// --------------------------------------------------
// 6. ESCRIBIR Y COMPROBAR
// --------------------------------------------------

try {
  fs.writeFileSync(appPath, nuevaApp, 'utf8');
  fs.writeFileSync(cssPath, nuevoCss, 'utf8');

  console.log('\nArchivos actualizados:');
  console.log('- src/renderer/src/App.tsx');
  console.log('- src/renderer/src/assets/main.css');

  console.log('\nEjecutando npm run typecheck...\n');

  execSync('npm run typecheck', {
    cwd: raiz,
    stdio: 'inherit'
  });

  console.log('\n======================================');
  console.log('CAMBIOS APLICADOS CORRECTAMENTE');
  console.log('======================================');
  console.log('La tabla fue reemplazada por la lista desplegable.');
  console.log('La lista de revisión manual se conservó.');
  console.log('El respaldo está en: ' + carpetaRespaldo);

} catch (error) {
  console.error('\nFalló la comprobación. Restaurando archivos...');

  fs.copyFileSync(respaldoApp, appPath);
  fs.copyFileSync(respaldoCss, cssPath);

  console.error('Los archivos originales fueron restaurados.');
  process.exit(1);
}
