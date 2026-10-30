
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const appPath = path.join('src', 'renderer', 'src', 'App.tsx');
const cssPath = path.join('src', 'renderer', 'src', 'assets', 'main.css');

function detener(mensaje) {
  console.error('\n' + mensaje);
  process.exit(1);
}

if (!fs.existsSync(appPath) || !fs.existsSync(cssPath)) {
  detener('No encuentro los archivos. Abre la terminal en la carpeta importador-dian.');
}

let app = fs.readFileSync(appPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

// Comprobar los nombres reales del código.
if (!app.includes('async function seleccionarCandidato(')) {
  detener('No encuentro async function seleccionarCandidato() en App.tsx.');
}

if (!app.includes('function renderResultadosCoincidencia()')) {
  detener('No encuentro renderResultadosCoincidencia() en App.tsx.');
}

if (app.includes('TEXTLIST-COINCIDENCIAS')) {
  detener('El TextList ya fue agregado anteriormente.');
}

// Encontrar la lista original.
const regexLista = /^([ \t]*)<ol className="matching-list">/m;
const coincidencia = app.match(regexLista);

if (!coincidencia) {
  detener('No encuentro <ol className="matching-list"> en App.tsx.');
}

const sangria = coincidencia[1];

const listaTexto = [
  `${sangria}{/* TEXTLIST-COINCIDENCIAS */}`,
  `${sangria}{resultadosCoincidencia.some(`,
  `${sangria}  (resultado) => resultado.estado === 'coincidencia_alta'`,
  `${sangria}) && (`,
  `${sangria}  <section className="matching-textlist-section">`,
  `${sangria}    <h3>Productos con coincidencia alta</h3>`,
  `${sangria}    <ul className="matching-textlist">`,
  `${sangria}      {resultadosCoincidencia.map((resultado, index) =>`,
  `${sangria}        resultado.estado === 'coincidencia_alta' ? (`,
  `${sangria}          <li key={index}>`,
  `${sangria}            {resultado.candidatos[0]?.nombre ?? resultado.productoFactura}`,
  `${sangria}          </li>`,
  `${sangria}        ) : null`,
  `${sangria}      )}`,
  `${sangria}    </ul>`,
  `${sangria}  </section>`,
  `${sangria})}`
].join('\n');

// Agregar el TextList antes de la lista original.
app = app.replace(
  regexLista,
  `${listaTexto}\n${sangria}<ol className="matching-list">`
);

// Ocultar las coincidencias altas de la lista original.
// Se conserva el map y los índices originales.
const claseItem = 'className="matching-item"';
const cantidadItems = app.split(claseItem).length - 1;

if (cantidadItems !== 1) {
  detener(`Esperaba encontrar un matching-item y encontré ${cantidadItems}. No modifiqué los archivos.`);
}

app = app.replace(
  claseItem,
  `${claseItem}\n              hidden={resultado.estado === 'coincidencia_alta'}`
);

const estilos = `

/* TEXTLIST-COINCIDENCIAS */
.matching-textlist-section {
  margin: 20px 0;
}

.matching-textlist-section h3 {
  margin-bottom: 10px;
}

.matching-textlist {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding-left: 22px;
}

.matching-textlist li {
  padding-left: 4px;
  font-size: 13px;
  line-height: 1.5;
}
`;

// Respaldo de los dos archivos.
const respaldo = `respaldo-textlist-${Date.now()}`;
fs.mkdirSync(respaldo);

fs.copyFileSync(appPath, path.join(respaldo, 'App.tsx'));
fs.copyFileSync(cssPath, path.join(respaldo, 'main.css'));

try {
  fs.writeFileSync(appPath, app, 'utf8');
  fs.writeFileSync(cssPath, css.trimEnd() + estilos + '\n', 'utf8');

  console.log('TextList agregado. Verificando TypeScript...\n');

  execSync('npm run typecheck', {
    stdio: 'inherit',
    shell: true
  });

  console.log('\nCAMBIOS APLICADOS CORRECTAMENTE.');
  console.log('Respaldo:', respaldo);
  console.log('Ejecuta npm run dev para probar.');

} catch (error) {
  console.error('\nFalló la comprobación. Restaurando archivos...');

  fs.copyFileSync(path.join(respaldo, 'App.tsx'), appPath);
  fs.copyFileSync(path.join(respaldo, 'main.css'), cssPath);

  console.log('Archivos restaurados.');
  process.exitCode = 1;
}
