
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const raiz = process.cwd();

const archivoApp = path.join(
  raiz,
  'src/renderer/src/App.tsx'
);

const archivoCss = path.join(
  raiz,
  'src/renderer/src/assets/main.css'
);

function detener(mensaje) {
  console.error('\nERROR: ' + mensaje);
  process.exit(1);
}

if (!fs.existsSync(archivoApp) || !fs.existsSync(archivoCss)) {
  detener('No se encontraron los archivos del proyecto.');
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')
);

if (packageJson.name !== 'importador-dian') {
  detener('Ejecuta el script desde la carpeta importador-dian.');
}

const appOriginal = fs.readFileSync(archivoApp, 'utf8');
const cssOriginal = fs.readFileSync(archivoCss, 'utf8');

const inicioFuncion = appOriginal.indexOf(
  'function renderResultadosCoincidencia()'
);

if (inicioFuncion === -1) {
  detener('No se encontró renderResultadosCoincidencia().');
}

const inicioLista = appOriginal.indexOf(
  '<ol className="matching-list">',
  inicioFuncion
);

const cierreLista = appOriginal.indexOf(
  '</ol>',
  inicioLista
);

if (inicioLista === -1 || cierreLista === -1) {
  detener('No se encontró la lista original de resultados.');
}

const listaOriginal = appOriginal.slice(
  inicioLista,
  cierreLista + '</ol>'.length
);

if (!listaOriginal.includes(
  '{resultadosCoincidencia.map((resultado, index) => ('
)) {
  detener('La estructura de la lista no coincide con la esperada.');
}

const regexClase = /className=\{`status-pill \$\{\s*resultado\.estado === 'coincidencia_alta'\s*\? 'success'\s*:\s*resultado\.estado === 'revision_manual'\s*\? 'warning'\s*:\s*''\s*\}`\}/;

const regexTexto = /\{resultado\.estado === 'coincidencia_alta'\s*\? 'Coincidencia alta'\s*:\s*resultado\.estado === 'revision_manual'\s*\? '[^']*'\s*:\s*'Sin coincidencia'\s*\}/;

if (!regexClase.test(listaOriginal) || !regexTexto.test(listaOriginal)) {
  detener('No se pudieron identificar los indicadores de estado originales.');
}

// Conservamos la lista original para revisión manual y sin coincidencia.
// Los índices originales se mantienen para no romper la selección ni los precios.
let listaRevisiones = listaOriginal
  .replace(
    '{resultadosCoincidencia.map((resultado, index) => (',
    `{resultadosCoincidencia
            .map((resultado, index) => ({ resultado, index }))
            .filter(({ resultado }) => resultado.estado !== 'coincidencia_alta')
            .map(({ resultado, index }) => (`
  )
  .replace(
    regexClase,
    "className={`status-pill ${resultado.estado === 'revision_manual' ? 'warning' : ''}`}"
  )
  .replace(
    regexTexto,
    "{resultado.estado === 'revision_manual' ? 'Revisión manual' : 'Sin coincidencia'}"
  );

const nuevaLista = `
        {resultadosCoincidencia.some(
          (resultado) => resultado.estado === 'coincidencia_alta'
        ) && (
          <div className="matching-table-container">
            <h3>Productos con coincidencia alta</h3>

            <table className="matching-table">
              <thead>
                <tr>
                  <th>Producto de factura</th>
                  <th>Producto encontrado</th>
                  <th>Estado</th>
                  <th>Comparación de precio</th>
                </tr>
              </thead>

              <tbody>
                {resultadosCoincidencia.map((resultado, index) =>
                  resultado.estado === 'coincidencia_alta' ? (
                    <tr key={resultado.productoFactura + '-' + index}>
                      <td>{resultado.productoFactura}</td>
                      <td>
                        {(
                          resultado.candidatos.find(
                            (candidato) =>
                              candidato.id === resultado.productoSeleccionadoId
                          ) ?? resultado.candidatos[0]
                        )?.nombre ?? 'Producto identificado'}
                      </td>
                      <td>
                        <span className="matching-status-high">
                          Coincidencia alta
                        </span>
                      </td>
                      <td>
                        {resultado.productoSeleccionadoId
                          ? renderComparacionPrecio(index)
                          : 'Pendiente de selección'}
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          </div>
        )}

        {resultadosCoincidencia.some(
          (resultado) => resultado.estado !== 'coincidencia_alta'
        ) && (
          <div className="matching-review-container">
            <h3>Productos para revisar</h3>
            ${''}
            ${''}
          </div>
        )}

`.replace(
  '            ${\'\'}\n            ${\'\'}\n',
  ''
);

// Insertamos la lista original dentro del bloque de revisión.
const listaFinal = nuevaLista.replace(
  '          <div className="matching-review-container">\n            <h3>Productos para revisar</h3>\n          </div>',
  `          <div className="matching-review-container">
            <h3>Productos para revisar</h3>
            ${listaRevisiones}
          </div>`
);

const appNuevo =
  appOriginal.slice(0, inicioLista) +
  listaFinal +
  appOriginal.slice(cierreLista + '</ol>'.length);

const marcadorCss = '/* TABLA DE COINCIDENCIAS ALTAS */';

if (cssOriginal.includes(marcadorCss)) {
  detener('Los estilos de la tabla ya existen. No se harán cambios.');
}

const estilosCss = `

${marcadorCss}
.matching-table-container,
.matching-review-container {
  width: 100%;
  margin: 20px 0;
}

.matching-table-container h3,
.matching-review-container h3 {
  margin-bottom: 12px;
}

.matching-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.matching-table th,
.matching-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  vertical-align: middle;
}

.matching-table th {
  font-weight: 600;
  background: var(--surface-secondary, #f8fafc);
}

.matching-status-high {
  display: inline-block;
  padding: 5px 9px;
  border-radius: 6px;
  background: #dcfce7;
  color: #166534;
  font-size: 12px;
  font-weight: 600;
}
`;

const cssNuevo = cssOriginal.trimEnd() + '\n' + estilosCss;

const fecha = new Date().toISOString().replace(/[:.]/g, '-');
const carpetaRespaldo = path.join(
  raiz,
  'respaldo-lista-coincidencias-' + fecha
);

fs.mkdirSync(carpetaRespaldo, { recursive: true });

fs.copyFileSync(
  archivoApp,
  path.join(carpetaRespaldo, 'App.tsx')
);

fs.copyFileSync(
  archivoCss,
  path.join(carpetaRespaldo, 'main.css')
);

console.log('Respaldo creado:', carpetaRespaldo);

try {
  fs.writeFileSync(archivoApp, appNuevo, 'utf8');
  fs.writeFileSync(archivoCss, cssNuevo, 'utf8');

  console.log('\nCambios aplicados. Comprobando TypeScript...\n');

  execSync('npm run typecheck', {
    cwd: raiz,
    stdio: 'inherit',
    shell: true
  });

  console.log('\n¡CAMBIOS APLICADOS CORRECTAMENTE!');
  console.log('Ahora ejecuta: npm run dev');

} catch (error) {
  console.error('\nLa comprobación falló. Restaurando archivos...');

  fs.copyFileSync(
    path.join(carpetaRespaldo, 'App.tsx'),
    archivoApp
  );

  fs.copyFileSync(
    path.join(carpetaRespaldo, 'main.css'),
    archivoCss
  );

  console.log('Archivos originales restaurados.');
  process.exitCode = 1;
}
