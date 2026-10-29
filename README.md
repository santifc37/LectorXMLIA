# Importador DIAN — Ferretería

Aplicación local para Windows que permite importar facturas electrónicas de proveedores en formato XML y registrar las entradas de inventario correspondientes en la base de datos existente de Ferretería.

El sistema utiliza Gemini para extraer los datos de la factura, Qwen ejecutado localmente mediante Ollama para identificar los productos existentes y la API de Ferretería para registrar las entradas de inventario en Supabase.

La aplicación se ejecuta localmente y no necesita estar desplegada en una plataforma de alojamiento. Sí requiere conexión a internet para utilizar Gemini, consultar la API y actualizar el inventario en Supabase.

---

## 1. Objetivo del proyecto

Simplificar el registro de compras de inventario a partir de facturas electrónicas, reduciendo la digitación manual y evitando crear productos duplicados.

El sistema debe:

- Permitir cargar facturas electrónicas XML de la DIAN.
- Extraer la información relevante de la factura.
- Identificar los productos mediante un catálogo local.
- Relacionar los artículos de la factura con productos existentes en el inventario.
- Mostrar una vista previa para revisar y corregir las coincidencias.
- Registrar las entradas de inventario después de la confirmación.
- Mantener un historial de las facturas importadas.
- Evitar importar dos veces una misma factura.
- Conservar la trazabilidad de los productos y las cantidades recibidas.

## 2. Alcance y restricciones

### Funcionalidades incluidas

- Aplicación de escritorio o interfaz local para Windows.
- Lectura de archivos XML de facturas electrónicas.
- Extracción de datos mediante Gemini.
- Búsqueda y comparación de productos mediante Qwen local.
- Catálogo local de productos en formato JSON.
- Vista previa y revisión manual de coincidencias.
- Registro de entradas mediante la API existente.
- Historial de importaciones y control de duplicados.
- Gestión de errores y validación de los datos antes de confirmar.

### Funcionalidades excluidas

- Crear productos automáticamente.
- Modificar los nombres o identificadores de los productos existentes.
- Reemplazar la aplicación principal de inventario.
- Crear una segunda base de datos para administrar el stock.
- Modificar directamente el stock almacenado, si el inventario se calcula mediante movimientos.
- Desplegar la interfaz del importador en la nube.
- Registrar automáticamente productos con coincidencias dudosas.

**Regla fundamental:** el importador solamente puede aumentar el inventario de productos que ya existan y estén habilitados para recibir entradas.

Si un artículo no tiene coincidencia, se muestra **«Producto no encontrado»**. No se crea ningún producto nuevo.

## 3. Arquitectura general

```text
┌──────────────────────────────────────┐
│       Aplicación local Windows       │
│                                      │
│  Cargar XML                          │
│  Vista previa                        │
│  Revisar coincidencias               │
│  Confirmar importación               │
└──────────────────┬───────────────────┘
                   │
          ┌────────┴─────────┐
          │                  │
          ▼                  ▼
┌─────────────────┐  ┌─────────────────────┐
│ Gemini API      │  │ Catálogo local JSON │
│                 │  │                     │
│ Extraer datos   │  │ ID y nombre         │
│ del XML         │  │ de los productos    │
└────────┬────────┘  └──────────┬──────────┘
         │                      │
         │                      ▼
         │             ┌───────────────────┐
         │             │ Qwen mediante     │
         │             │ Ollama local      │
         │             │                   │
         │             │ Comparar nombres  │
         │             │ y sugerir ID      │
         │             └─────────┬─────────┘
         │                       │
         └──────────┬────────────┘
                    ▼
         ┌──────────────────────┐
         │ Revisión del usuario │
         │ y confirmación       │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │ API Ferretería       │
         │ existente            │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │ Supabase             │
         │ Inventario oficial   │
         └──────────────────────┘
```

### Responsabilidades

| Componente | Responsabilidad |
|---|---|
| Aplicación local | Interfaz, selección de XML, revisión y confirmación |
| Gemini | Interpretar el XML y extraer los datos necesarios |
| `productos.json` | Proporcionar un catálogo local para buscar productos |
| Qwen + Ollama | Comparar descripciones y sugerir coincidencias |
| API Ferretería | Validar productos y registrar las entradas |
| Supabase | Mantener el inventario oficial y su trazabilidad |

La aplicación local no debe conectarse directamente a Supabase utilizando una clave privilegiada. Las modificaciones del inventario deben realizarse mediante la API existente.

## 4. Tecnologías

- **Lenguaje y framework de la aplicación:** por definir antes de iniciar la implementación.
- **Formato de entrada:** XML de factura electrónica.
- **Extracción de información:** Gemini API.
- **Modelo local:** Qwen3:1.7B mediante Ollama.
- **Catálogo local:** JSON.
- **API de inventario:** API existente del proyecto InventarioFerrehaymar.
- **Base de datos:** Supabase.
- **Sistema operativo objetivo:** Windows.

La tecnología definitiva para la interfaz y la persistencia local del historial se seleccionará durante la fase de diseño técnico, sin reconstruir los componentes que ya existen.

## 5. Catálogo local de productos

El proyecto tendrá una copia local de los productos existentes para que Qwen pueda comparar nombres sin consultar la base de datos por cada artículo.

Archivo previsto:

```text
data/
└── productos.json
```

Ejemplo ilustrativo:

```json
[
  {
    "id": "uuid-real-del-producto",
    "nombre": "Pulidora Black & Decker G720 4.5 pulgadas 820 W"
  },
  {
    "id": "uuid-real-del-producto-2",
    "nombre": "Disco de corte para metal 4.5 pulgadas"
  }
]
```

Los identificadores anteriores son ilustrativos. El catálogo real debe utilizar los IDs devueltos por la API.

### Reglas del catálogo

1. El catálogo se genera o actualiza desde la API de Ferretería.
2. Solo contiene el identificador y el nombre de cada producto.
3. Se puede actualizar al iniciar la aplicación o mediante una acción manual.
4. No es una fuente oficial del stock.
5. Un ID encontrado en el JSON debe validarse nuevamente en el servidor antes de registrar una entrada.
6. Si la copia está desactualizada, la API debe rechazar productos inexistentes o inactivos.

## 6. Extracción de la factura mediante Gemini

Gemini procesa el XML y devuelve datos estructurados para que la aplicación no tenga que depender de texto libre.

La información que se intentará extraer incluye:

### Datos de la factura

- Número o referencia.
- Fecha de emisión.
- Identificación o nombre del proveedor.
- Moneda, cuando esté disponible.

### Datos de cada línea

- Descripción original del artículo.
- Código de identificación del proveedor, si existe.
- Código de barras, si existe.
- Cantidad facturada.
- Unidad de medida.
- Precio unitario.
- Impuestos u otros datos necesarios para interpretar correctamente el precio, cuando corresponda.

Los campos opcionales pueden faltar. La aplicación debe validar el resultado de Gemini y no asumir que todos los XML incluyen códigos de barras, marcas o referencias de producto.

La información extraída se conservará separada de la información del producto del inventario.

## 7. Identificación de productos mediante Qwen

Qwen comparará los artículos extraídos de la factura con los productos del catálogo local.

### Orden de búsqueda

1. Comparación exacta de códigos, si están disponibles.
2. Comparación del nombre normalizado.
3. Comparación de palabras relevantes: marca, modelo, medida, potencia y otras características presentes.
4. Uso de la descripción como información adicional.

El nombre será el criterio principal cuando no existan códigos útiles.

### Resultados posibles

| Resultado | Comportamiento |
|---|---|
| Coincidencia clara | Proponer el producto existente y su ID |
| Varias coincidencias posibles | Solicitar revisión manual |
| Coincidencia insuficiente | Mostrar «Producto no encontrado» |
| ID inexistente o producto inactivo | No registrar la entrada |

Qwen debe devolver una respuesta estructurada que incluya el resultado de la comparación, el ID sugerido, la confianza y una explicación breve.

El modelo no debe inventar identificadores ni decidir por sí solo que una coincidencia dudosa es válida.

## 8. Flujo de importación

### Paso 1. Seleccionar el XML

El usuario selecciona una factura electrónica desde el computador.

### Paso 2. Validar y extraer

La aplicación valida que el archivo sea legible y solicita a Gemini la extracción de los datos.

### Paso 3. Buscar productos

La aplicación compara las líneas de la factura con `productos.json` mediante Qwen.

### Paso 4. Mostrar la vista previa

Antes de modificar el inventario, se presentan:

- Número y fecha de factura.
- Proveedor.
- Descripción original de cada artículo.
- Producto sugerido del inventario.
- ID del producto.
- Cantidad y unidad.
- Precio unitario.
- Estado de la coincidencia.
- Acciones para corregir o excluir líneas.

Los artículos sin coincidencia deben permanecer identificados como no encontrados. Nunca se crearán automáticamente.

### Paso 5. Revisar y confirmar

El usuario confirma los productos que deben ingresar al inventario.

No se deben enviar entradas al servidor mientras el usuario esté revisando la factura.

Si hay líneas sin resolver, deben quedar identificadas y excluirse explícitamente de la entrada de stock, o resolverse antes de confirmar. La aplicación debe informar qué líneas quedarán sin registrar.

### Paso 6. Registrar la importación

La API valida los IDs, las cantidades y las unidades, y registra las entradas utilizando las operaciones existentes del inventario.

El registro de la factura, su historial y los movimientos de inventario deben diseñarse para que un fallo no deje una importación parcialmente registrada.

### Paso 7. Mostrar el resultado

La aplicación informa si la operación se completó, qué productos ingresaron, qué líneas no se importaron y si hubo errores.

## 9. Prevención de duplicados y consistencia

La aplicación debe evitar que una misma factura incremente dos veces el inventario.

Para ello:

- Identificar las facturas por proveedor y número o referencia normalizada.
- Definir una restricción de unicidad en la base de datos para impedir importaciones duplicadas.
- Validar la duplicidad nuevamente en el servidor.
- Registrar los movimientos y el historial de la factura de manera atómica.
- Si la misma solicitud se reintenta debido a un fallo de conexión, no volver a sumar las cantidades.
- No considerar una factura importada hasta que la operación se haya confirmado correctamente.

La prevención de duplicados debe existir en el servidor y en la base de datos, no solamente en la interfaz local.

## 10. Historial de importaciones

Se debe conservar un historial mínimo que permita rastrear el origen de cada entrada.

### Cabecera de factura

- Identificador interno.
- Proveedor.
- Número o referencia.
- Fecha de emisión.
- Fecha de importación.
- Estado de procesamiento.

### Detalle de factura

- Factura relacionada.
- ID del producto del inventario, cuando se haya encontrado.
- Descripción original del XML.
- Código del proveedor, si existe.
- Cantidad y unidad facturadas.
- Precio unitario.
- Estado de coincidencia o importación.

Las líneas no encontradas pueden conservarse con el ID del producto vacío, para dejar constancia de que estaban presentes en la factura sin crear productos nuevos.

El diseño definitivo de las tablas debe verificarse contra el esquema existente antes de aplicar cambios a Supabase.

## 11. Seguridad

- No guardar claves API dentro del código fuente.
- Mantener las credenciales de Gemini en configuración local protegida.
- No exponer la clave privilegiada de Supabase a la interfaz.
- Utilizar la autenticación existente de la API de Ferretería.
- Validar nuevamente en el servidor cada producto seleccionado.
- Validar cantidades, unidades, precios y estructura de los datos.
- No confiar en los IDs devueltos por Qwen sin verificarlos.
- No registrar movimientos sin una confirmación explícita del usuario.

## 12. Estructura prevista del proyecto

La estructura inicial se definirá antes de implementar el código. Como referencia:

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
│   ├── xml/
│   ├── gemini/
│   ├── catalogo/
│   ├── qwen/
│   ├── importacion/
│   ├── api/
│   └── historial/
│
└── tests/
```

Esta estructura es una propuesta inicial, no una lista de archivos ya implementados. Los archivos definitivos y sus responsabilidades se documentarán antes de desarrollar cada fase.

## 13. Plan de desarrollo por fases

### Fase 1. Revisar y documentar

- Confirmar la estructura del XML de ejemplo.
- Revisar los endpoints existentes de productos y entradas de inventario.
- Verificar las unidades admitidas por la API.
- Confirmar cómo se registra una entrada y cómo se protege contra duplicados.
- Definir la tecnología de la aplicación local.
- Documentar la estructura de archivos.

**Resultado esperado:** diseño técnico validado sin modificar el inventario.

### Fase 2. Crear la aplicación local

- Preparar el proyecto.
- Crear la interfaz inicial.
- Permitir seleccionar un XML.
- Mostrar los datos básicos de la factura.

**Resultado esperado:** aplicación local funcional para cargar y visualizar archivos.

### Fase 3. Integrar Gemini

- Configurar la clave mediante variables de entorno.
- Enviar el XML para extracción.
- Validar la respuesta estructurada.
- Gestionar errores y campos faltantes.

**Resultado esperado:** datos de la factura disponibles en un formato consistente.

### Fase 4. Crear y sincronizar el catálogo JSON

- Consultar los productos existentes mediante la API.
- Generar `productos.json`.
- Implementar la actualización manual del catálogo.
- Validar el formato y los identificadores.

**Resultado esperado:** catálogo local actualizado con IDs y nombres reales.

### Fase 5. Integrar Qwen con Ollama

- Consultar el catálogo local.
- Comparar las descripciones de la factura.
- Devolver IDs existentes y nivel de confianza.
- Detectar coincidencias ambiguas y productos no encontrados.

**Resultado esperado:** sugerencias de coincidencia sin crear ni modificar productos.

### Fase 6. Implementar la vista previa

- Mostrar todos los artículos de la factura.
- Permitir revisar y corregir coincidencias.
- Permitir excluir artículos no resueltos.
- Validar los datos antes de confirmar.

**Resultado esperado:** ninguna entrada se registra sin confirmación.

### Fase 7. Integrar el registro de entradas

- Reutilizar la API existente.
- Validar IDs, cantidades y unidades.
- Implementar la protección contra duplicados.
- Garantizar que la importación y sus movimientos no queden parcialmente registrados.

**Resultado esperado:** las entradas confirmadas se reflejan correctamente en Supabase.

### Fase 8. Historial y pruebas

- Guardar la referencia de la factura y sus líneas.
- Registrar los artículos no encontrados.
- Probar XML válidos e inválidos.
- Probar coincidencias exactas, ambiguas y ausentes.
- Simular reintentos y errores de conexión.
- Comprobar que una factura no pueda duplicar entradas.

**Resultado esperado:** importador probado y con trazabilidad.

## 14. Criterios de aceptación

El proyecto se considerará listo cuando:

- La aplicación funcione localmente en Windows.
- Pueda leer XML reales de facturas electrónicas.
- Gemini extraiga los datos relevantes correctamente.
- Qwen encuentre productos existentes usando el catálogo local.
- Los productos no encontrados no se creen.
- Las coincidencias ambiguas requieran revisión.
- La vista previa permita corregir y excluir líneas.
- El inventario se actualice mediante la API existente.
- No se pueda duplicar una importación confirmada.
- El historial permita identificar la factura que originó cada entrada.
- Los errores no produzcan movimientos parciales ni incrementos duplicados.
- Las credenciales se mantengan fuera del código fuente.

---

## 15. Principio de desarrollo

El proyecto se construirá de forma incremental, una fase a la vez.

Antes de escribir código para una fase, se definirán los archivos que se van a crear o modificar, la responsabilidad de cada archivo y sus dependencias. Se probará cada fase antes de avanzar a la siguiente.

No se reconstruirá el sistema de inventario, no se crearán productos automáticamente y no se modificarán las reglas existentes de stock sin una necesidad comprobada.

**Fuente oficial del inventario:** Supabase, mediante la API existente de Ferretería.

**Función del importador:** interpretar la factura, identificar productos existentes, permitir la revisión y registrar las entradas confirmadas.
