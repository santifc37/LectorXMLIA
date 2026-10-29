# Importador de facturas electrónicas DIAN

## 1. Descripción del proyecto

Aplicación local para Windows que permite importar productos de facturas electrónicas colombianas (DIAN) al inventario existente de la ferretería.

La aplicación recibe archivos XML de facturas electrónicas, extrae su información mediante Gemini, identifica los productos que ya existen en el inventario y permite registrar sus cantidades como entradas de inventario.

También permite comparar los precios de compra de la factura con los precios actuales del inventario y, si el usuario lo autoriza, actualizar el precio de compra de los productos.

La aplicación funciona localmente en el computador. No necesita estar desplegada en un servidor, pero requiere conexión a internet para comunicarse con Gemini y con la API existente de la ferretería.

## 2. Objetivos

- Leer y procesar facturas electrónicas XML de la DIAN.
- Extraer la información general de la factura y sus productos.
- Identificar productos de la factura que ya existen en el inventario.
- Evitar la creación automática de productos nuevos.
- Comparar los precios de compra de la factura con los precios actuales.
- Permitir autorizar o rechazar actualizaciones de precios.
- Registrar entradas de inventario mediante la API existente.
- Mantener un historial de las facturas importadas.
- Evitar que una factura se importe dos veces.
- Permitir revisar y corregir coincidencias antes de confirmar una importación.

## 3. Arquitectura general

La aplicación utiliza cuatro componentes principales:

1. **Aplicación local:** interfaz, procesamiento de archivos, validaciones y flujo de importación.
2. **Gemini API:** extracción de información del XML y comparación de productos.
3. **Catálogo JSON:** copia local de los productos existentes en el inventario, utilizada como referencia para las coincidencias.
4. **API de Ferretería:** conexión con el inventario oficial y registro de entradas y actualizaciones autorizadas.

La base de datos de Supabase continúa siendo la fuente oficial de información del inventario. La aplicación no se conecta directamente a Supabase ni almacena claves administrativas de la base de datos.

## 4. Flujo de procesamiento

El procesamiento de cada factura se divide en dos consultas independientes a Gemini.

### Fase 1. Lectura y extracción del XML

El usuario selecciona un archivo XML de una factura electrónica.

La aplicación envía el contenido a Gemini para extraer:

**Información general:**
- Identificación del proveedor.
- Nombre del proveedor.
- Número o referencia de factura.
- Fecha de emisión.

**Información de los productos:**
- Descripción original.
- Código del producto del proveedor, si existe.
- Código del comprador, si existe.
- Código de barras, si existe.
- Cantidad.
- Unidad de medida.
- Precio unitario.
- Descuentos e impuestos relevantes para interpretar el precio.

Gemini devuelve la información estructurada en un JSON.

En esta primera fase no se buscan coincidencias con el inventario.

### Fase 2. Identificación de productos existentes

Una vez extraídos los productos, la aplicación realiza una segunda consulta a Gemini.

Se envían dos elementos:

1. El JSON obtenido durante la primera fase.
2. El catálogo local `productos.json`.

Gemini compara las descripciones de los productos de la factura con los nombres de los productos existentes y devuelve los identificadores de las coincidencias.

La respuesta debe incluir:
- Descripción del producto en la factura.
- ID del producto encontrado.
- Nombre del producto del inventario.
- Indicador de coincidencia.
- Nivel de confianza.
- Justificación breve cuando sea necesario.

**Reglas obligatorias:**
- Gemini solamente puede seleccionar IDs presentes en el catálogo recibido.
- No puede inventar identificadores.
- No puede crear productos.
- Si no encuentra una coincidencia adecuada, debe devolver `producto_id: null`.
- Las coincidencias ambiguas deben quedar pendientes de revisión manual.

La aplicación valida nuevamente que cada ID exista y corresponda a un producto activo antes de permitir la importación.

### Fase 3. Comparación de precios

La comparación de precios no se realiza con Gemini. Se implementa directamente en el código de la aplicación.

Para cada producto identificado se compara:

- Precio de compra actual del inventario.
- Precio unitario de la factura.
- Diferencia absoluta.
- Variación porcentual.

Ejemplo:

| Concepto | Valor |
|---|---:|
| Precio actual | $185.000 |
| Precio de factura | $200.000 |
| Diferencia | +$15.000 |
| Variación | +8,11 % |

La aplicación identifica si el precio:
- Aumentó.
- Disminuyó.
- Se mantuvo igual.
- No tiene un precio anterior de referencia.

La comparación debe utilizar precios equivalentes, teniendo en cuenta unidades de medida, cantidades, descuentos e impuestos cuando correspondan.

**Actualización de precios:**

La aplicación nunca modifica automáticamente el precio de compra.

El usuario puede:
- Registrar la entrada de inventario sin cambiar el precio.
- Autorizar la actualización del precio de compra.
- Rechazar la actualización.
- Revisar manualmente los casos dudosos.

La decisión debe quedar registrada en el historial de importación.

### Fase 4. Revisión de la factura

Antes de registrar cualquier movimiento, la aplicación muestra una vista previa completa.

Se muestran:
- Datos de la factura.
- Proveedor.
- Fecha y número de factura.
- Productos extraídos.
- Productos encontrados en el inventario.
- Coincidencias pendientes de revisión.
- Productos sin coincidencia.
- Cantidades y unidades.
- Precios anteriores y precios de factura.
- Diferencias porcentuales.
- Actualizaciones de precio autorizadas.

El usuario puede corregir manualmente las coincidencias, excluir líneas o resolver productos pendientes.

Los productos sin coincidencia no se crean automáticamente ni generan movimientos de inventario.

La importación solamente se confirma cuando el usuario lo decide expresamente.

### Fase 5. Registro en el inventario

Una vez confirmada la importación:

1. La aplicación envía los datos a la API de Ferretería.
2. La API valida los productos y las cantidades.
3. Se registran las entradas de inventario.
4. Se aplican únicamente las actualizaciones de precio autorizadas.
5. Se conserva el historial de la factura y sus productos.

La base de datos existente continúa utilizando los movimientos de inventario como fuente para calcular las existencias.

## 5. Catálogo local de productos

La aplicación mantiene una copia local del inventario en:

`data/productos.json`

El archivo contiene únicamente los campos necesarios para identificar productos y comparar precios:

- `id`
- `nombre`
- `precio_compra`

Ejemplo ilustrativo:

```json
[
  {
    "id": "uuid-producto-1",
    "nombre": "Pulidora Black & Decker G720 4.5 pulgadas 820 W",
    "precio_compra": 185000
  }
]
```

Los valores anteriores son ejemplos. La aplicación debe descargar los datos reales desde la API.

**Funcionamiento del catálogo:**

- Se descarga desde la API al iniciar la aplicación.
- Se puede actualizar manualmente.
- Se utiliza para la comparación de productos.
- No es la fuente oficial del inventario.
- Los IDs y estados de los productos se validan nuevamente mediante la API antes de confirmar una importación.

El catálogo local no debe utilizarse para modificar directamente la base de datos.

## 6. Integración con Gemini

Gemini se utiliza para dos tareas específicas:

**Primera consulta: extracción del XML.**

Convierte la información de la factura en una estructura JSON organizada.

**Segunda consulta: identificación de productos.**

Compara los productos extraídos con el catálogo local y devuelve los IDs de los productos semejantes.

La lógica de comparación de precios, validación de cantidades, confirmación y registro de inventario pertenece a la aplicación y a la API, no a Gemini.

La clave de Gemini se almacena en la configuración local de la aplicación y nunca debe incluirse en el repositorio.

## 7. Manejo de errores y continuidad

La aplicación debe manejar errores durante las consultas a Gemini y durante la comunicación con la API.

**Errores de Gemini:**
- Errores temporales de conexión.
- Límites de solicitudes.
- Errores del servicio.
- Problemas de cuota o facturación.
- Respuestas inválidas o JSON incompleto.

**Comportamiento esperado:**

- Reintentar automáticamente errores temporales con esperas progresivas.
- Si se alcanza un límite temporal, esperar antes de volver a intentar.
- Si se agota la cuota o el saldo, detener el procesamiento y mostrar el motivo.
- Conservar los resultados que ya se hayan obtenido.
- Permitir continuar manualmente cuando el servicio vuelva a estar disponible.

**Persistencia del progreso:**

La aplicación debe guardar localmente el estado del procesamiento de cada factura.

Por ejemplo:

- XML cargado.
- Extracción completada.
- Identificación de productos completada o pendiente.
- Comparación de precios completada.
- Revisión del usuario pendiente.
- Importación confirmada o cancelada.

Si ocurre un error, al volver a abrir la aplicación debe ser posible continuar desde la última fase completada sin repetir innecesariamente las consultas anteriores.

Una factura pausada por falta de cuota no se importa automáticamente. El usuario debe reanudar el procesamiento cuando se haya restablecido la disponibilidad de Gemini.

## 8. Historial de facturas

La aplicación debe conservar un historial de las facturas procesadas.

### Información general

- Proveedor.
- Número de factura.
- Fecha de emisión.
- Fecha de importación.
- Estado del procesamiento.
- Estado de importación.

### Historial de productos

Por cada línea de factura se debe conservar:

- ID del producto del inventario, cuando exista coincidencia.
- Descripción original de la factura.
- Código del proveedor, si existe.
- Cantidad.
- Unidad de medida.
- Precio unitario original de la factura.
- Precio de compra anterior.
- Diferencia de precio.
- Variación porcentual.
- Estado de coincidencia.
- Estado de importación.
- Decisión sobre la actualización del precio.

Los productos sin coincidencia pueden conservarse en el historial con el ID del producto vacío, sin crear productos ni generar movimientos de inventario.

El historial permite consultar las compras anteriores y observar la evolución de los precios.

## 9. Protección contra importaciones duplicadas

Una misma factura no debe generar entradas de inventario más de una vez.

La protección debe implementarse en la API y en la base de datos, no solamente en la interfaz local.

Se debe identificar una factura mediante información confiable, como el proveedor y su número de factura, y establecer una restricción de unicidad adecuada.

La confirmación de una importación debe ser idempotente: repetir una solicitud por un error de conexión no puede duplicar las entradas ni aplicar dos veces las actualizaciones de precios.

El registro de la factura, sus líneas, los movimientos de inventario y los cambios de precio autorizados deben diseñarse para mantener la consistencia de los datos, evitando importaciones parciales.

## 10. Seguridad

- La aplicación se ejecuta localmente.
- La clave de Gemini se almacena en variables de entorno.
- Las credenciales de la API se manejan de forma segura.
- No se expone la clave `SUPABASE_SERVICE_ROLE_KEY`.
- La aplicación no se conecta directamente a Supabase.
- Las operaciones de inventario pasan por la API existente.
- Los datos recibidos de Gemini se validan antes de utilizarlos.

## 11. Estructura propuesta del proyecto

```text
importador-dian/
│
├── README.md
├── .env.example
├── .gitignore
├── package.json
│
├── data/
│   └── productos.json
│
├── src/
│   ├── interfaz/
│   │
│   ├── xml/
│   │   ├── lector
│   │   └── validador
│   │
│   ├── gemini/
│   │   ├── cliente
│   │   ├── extraccion
│   │   └── coincidencias
│   │
│   ├── catalogo/
│   │   ├── sincronizacion
│   │   └── busqueda
│   │
│   ├── precios/
│   │   └── comparacion
│   │
│   ├── importacion/
│   │   ├── validacion
│   │   ├── confirmacion
│   │   └── registro
│   │
│   ├── progreso/
│   │   └── persistencia
│   │
│   ├── api/
│   │   └── cliente
│   │
│   └── historial/
│       └── consultas
│
└── tests/
```

La estructura es una propuesta inicial y puede ajustarse durante la implementación.

## 12. Variables de entorno

Se utilizarán variables de entorno para configurar las conexiones:

```env
GEMINI_API_KEY=
GEMINI_MODEL=
FERRETERIA_API_URL=
```

Los nombres definitivos se ajustarán a la implementación de la aplicación.

El archivo `.env` debe permanecer fuera del repositorio.

## 13. Alcance y restricciones

La aplicación se limita a procesar facturas electrónicas XML y registrar entradas de productos existentes.

No contempla:

- Crear productos automáticamente.
- Modificar directamente Supabase.
- Reemplazar la aplicación principal de inventario.
- Desplegarse como servicio web público.
- Realizar ventas.
- Modificar precios sin autorización.
- Importar facturas sin revisión y confirmación del usuario.

El PDF de la factura puede utilizarse como referencia visual en una fase futura, pero el XML es la fuente principal de extracción.

## 14. Tecnologías

Las tecnologías definitivas de interfaz y empaquetado se seleccionarán antes de iniciar la implementación.

Componentes previstos:

- Aplicación local para Windows.
- Gemini API para extracción y coincidencia de productos.
- JSON local para el catálogo.
- API existente de Ferretería.
- Supabase como base de datos oficial, mediante la API.

No se requiere Ollama ni Qwen.

## 15. Fases de desarrollo

### Fase 1. Preparación del proyecto
- Crear la estructura de carpetas.
- Configurar variables de entorno.
- Preparar la interfaz inicial.
- Configurar la conexión con la API.

### Fase 2. Catálogo de productos
- Consultar productos desde la API.
- Generar `productos.json`.
- Implementar actualización manual del catálogo.
- Validar productos activos e IDs.

### Fase 3. Lectura de XML
- Cargar archivos XML.
- Validar su estructura.
- Implementar extracción mediante Gemini.
- Obtener JSON estructurado de la factura.

### Fase 4. Coincidencia de productos
- Enviar el JSON extraído y el catálogo a Gemini.
- Obtener IDs de productos semejantes.
- Validar los IDs recibidos.
- Identificar coincidencias ambiguas y productos no encontrados.

### Fase 5. Comparación de precios
- Comparar precios actuales y precios de factura.
- Calcular diferencias y porcentajes.
- Mostrar aumentos, disminuciones y precios iguales.
- Permitir autorizar actualizaciones.

### Fase 6. Continuidad del procesamiento
- Guardar el progreso localmente.
- Implementar reintentos para errores temporales.
- Pausar ante problemas de cuota.
- Permitir reanudar desde la última fase completada.

### Fase 7. Revisión y confirmación
- Crear vista previa de la factura.
- Permitir corregir coincidencias.
- Permitir excluir productos.
- Solicitar confirmación antes de importar.

### Fase 8. Integración con inventario
- Registrar entradas mediante la API.
- Aplicar cambios de precio autorizados.
- Implementar protección contra duplicados.
- Mantener la consistencia de las operaciones.

### Fase 9. Historial y pruebas
- Consultar facturas procesadas.
- Consultar historial de precios.
- Probar facturas con múltiples productos.
- Probar productos sin coincidencia.
- Probar errores de Gemini y de conexión.
- Probar reanudación y prevención de duplicados.

## 16. Principio fundamental

La aplicación debe mantener una separación clara de responsabilidades:

- **Gemini:** interpreta el XML y encuentra semejanzas entre productos.
- **Aplicación local:** administra el proceso, compara precios, permite revisar y solicita confirmación.
- **API de Ferretería:** valida y ejecuta las operaciones autorizadas.
- **Supabase:** conserva la información oficial del inventario, los movimientos y el historial.

Ninguna factura debe modificar el inventario sin revisión y confirmación expresa del usuario.
