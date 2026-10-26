# Importación de facturas XML de proveedores al inventario

> **Estado:** documento inicial de análisis  
> **Objetivo:** definir el comportamiento esperado antes de escribir código.  
> **Última actualización:** 2026-10-26

## 1. Propósito

Crear un importador local para Windows que lea facturas XML y facilite ingresar al inventario las cantidades compradas. El alcance es operativo, no contable: extraer únicamente la referencia de la factura, fecha, nombre del proveedor y los datos de cada producto necesarios para identificarlo y registrar su entrada.

El importador debe reducir la digitación manual, pero **no debe modificar el inventario hasta que la persona revise y confirme la importación**. El stock debe actualizarse mediante el mecanismo de movimientos de inventario existente, nunca escribiendo directamente un campo de stock.

Este documento es una base de trabajo. Se irá ampliando y corrigiendo por etapas antes de comenzar la implementación.

## 2. Hallazgos de los XML revisados

Se revisaron dos XML de ejemplo:

- Una factura de **Cacharrería Mundial S.A.S.**, número `MNAL381257`, fecha `2026-10-19`, con 4 líneas de productos.
- Una factura de **MEICO S.A.**, número `QV5O71126799`, fecha `2026-10-24`, con 8 líneas de productos.

### 2.1 Estructura general

Ambos archivos siguen el patrón general de un documento UBL de tipo `AttachedDocument`, que contiene la factura (`Invoice`) embebida como texto CDATA dentro de:

`cac:Attachment/cac:ExternalReference/cbc:Description`

Por eso, el importador no debe asumir que el archivo raíz es directamente `Invoice`. Primero debe reconocer el tipo de documento y, cuando corresponda, extraer y analizar la factura embebida.

Los dos ejemplos comparten una estructura general compatible, pero eso **no demuestra que todos los XML de todos los proveedores sean idénticos**. Pueden existir diferencias legítimas en campos opcionales, identificadores, unidades, impuestos y estructura del documento.

### 2.2 Campos identificados en las líneas

| Dato | Ruta o elemento XML observado | Uso previsto |
|---|---|---|
| Descripción del producto | `cac:InvoiceLine/cac:Item/cbc:Description` | Mostrar el producto y ayudar a identificarlo |
| Cantidad facturada | `cac:InvoiceLine/cbc:InvoicedQuantity` | Proponer la cantidad de entrada |
| Código del proveedor | `cac:InvoiceLine/cac:Item/cac:SellersItemIdentification/cbc:ID` | Identificar el artículo dentro del catálogo del proveedor |
| Código asignado por el comprador | `cac:InvoiceLine/cac:Item/cac:BuyersItemIdentification/cbc:ID` | Posible vínculo con un código interno, si el proveedor lo incluye |
| Identificación estándar/declarada | `cac:InvoiceLine/cac:Item/cac:StandardItemIdentification/cbc:ID` | Identificador adicional; interpretar junto con sus atributos, especialmente `schemeID` |
| Precio unitario | `cac:InvoiceLine/cac:Price/cbc:PriceAmount` | Mostrar el precio informado y apoyar la revisión |
| Total de línea | `cac:InvoiceLine/cbc:LineExtensionAmount` | Comparación y validación de la línea |
| Número de factura | `cbc:ID` de `Invoice` | Identificar la factura y prevenir importaciones duplicadas |
| Fecha de emisión | `cbc:IssueDate` de `Invoice` | Registrar la fecha de la factura |
| Proveedor | Datos de `cac:AccountingSupplierParty` | Identificar al proveedor, incluyendo su identificación tributaria cuando esté disponible |

**Nota:** los nombres de ruta anteriores describen los elementos observados en los XML de ejemplo. La implementación debe manejar namespaces XML correctamente y no depender de prefijos literales, porque los prefijos pueden variar aunque el namespace sea el mismo.

## 3. Diferencias encontradas entre los ejemplos

### Cacharrería Mundial

- Incluye código del vendedor (`SellersItemIdentification`).
- Incluye código del comprador (`BuyersItemIdentification`).
- Incluye identificación estándar (`StandardItemIdentification`).
- Tiene 4 líneas de productos.

### MEICO

- Incluye código del vendedor (`SellersItemIdentification`).
- Incluye identificación estándar (`StandardItemIdentification`).
- En las líneas revisadas no aparece `BuyersItemIdentification`.
- Tiene 8 líneas de productos.
- Algunas identificaciones estándar tienen `schemeID="999"`. No se debe asumir que esos valores son códigos de barras GTIN/EAN.
- Dos referencias distintas de pintura comparten el valor de identificación estándar `7707300305`, pero tienen códigos de vendedor diferentes (`71682` y `71689`) y descripciones distintas.

### Consecuencias para el diseño

1. Los códigos deben tratarse como campos distintos y no como si todos fueran el mismo tipo de identificador.
2. No se debe depender de que exista `BuyersItemIdentification`.
3. No se debe asumir que `StandardItemIdentification` siempre es un código de barras.
4. La referencia del proveedor puede repetirse o no ser suficiente para identificar un producto por sí sola.
5. La descripción ayuda a revisar coincidencias, pero no debe ser el único criterio automático para decidir que dos artículos son iguales.

## 4. Objetivo funcional

La función principal será importar una factura XML y convertir sus líneas en una **propuesta de entrada de inventario**. Solo se necesitan los datos mínimos para identificar la factura y sus productos; no se necesita reconstruir todos los datos fiscales o comerciales de la factura.

Flujo preliminar:

1. El usuario selecciona o arrastra un archivo XML.
2. El sistema valida que el archivo se pueda leer y reconoce el tipo de documento.
3. Si es un `AttachedDocument`, extrae la factura `Invoice` embebida cuando exista y sea válida.
4. Lee los datos generales de la factura y sus líneas.
5. Extrae la referencia o número de factura, fecha, nombre del proveedor y las líneas de productos.
6. Busca cada producto en el inventario usando identificadores confiables y la relación entre proveedor y código del proveedor.
7. Muestra una vista previa de coincidencias, productos nuevos o casos dudosos.
8. El usuario confirma o corrige las relaciones y cantidades.
9. Si el producto ya existe, registra la cantidad recibida como una entrada que se suma al stock calculado.
10. Si no existe, lo presenta como producto nuevo pendiente de revisión; no inventa categoría, precio de venta ni otros datos ausentes.
11. Solo después de confirmar, registra los movimientos de inventario y guarda la referencia de la factura para evitar duplicados.

Los pasos son una propuesta de diseño; deben validarse y detallarse antes de implementar.

## 5. Reglas de identificación y relación de productos

### 5.1 Regla inicial para buscar coincidencias

La estrategia preferida es utilizar la combinación de:

- Identificación del proveedor (idealmente su NIT).
- Código del artículo asignado por ese proveedor.

Esa combinación permite mantener una relación entre un artículo del catálogo del proveedor y un producto del inventario interno.

Como apoyo, se pueden mostrar:

- Código asignado por el comprador, si existe.
- Identificación estándar y su `schemeID`.
- Descripción del artículo.
- Referencias o códigos adicionales que ya estén registrados en el inventario.

### 5.2 Qué evitar

- No unir productos automáticamente solo porque tienen la misma descripción.
- No unir productos automáticamente solo porque comparten una identificación estándar.
- No asumir que un código numérico es un código de barras.
- No crear un producto nuevo automáticamente ante cualquier coincidencia dudosa.
- No permitir que una coincidencia ambigua se resuelva silenciosamente.

### 5.3 Resolución manual

Si no existe una coincidencia segura, la interfaz debería permitir que el usuario:

- Seleccione un producto existente.
- Marque la línea para crear un producto nuevo, si esa función se aprueba.
- Deje la línea pendiente y no confirme la importación hasta resolverla, si así se define como regla.

Cuando el usuario relacione por primera vez una línea con un producto interno, se debería estudiar guardar esa relación para facilitar las importaciones futuras del mismo proveedor.

## 6. Prevención de duplicados y trazabilidad

El diseño debe contemplar:

- Detectar si la misma factura ya fue importada.
- No registrar dos veces las cantidades de una misma factura por un doble clic, reintento o nueva carga del archivo.
- Conservar datos suficientes para identificar el documento de origen.
- Relacionar cada entrada de inventario con la factura que la originó, según las capacidades del esquema actual de la base de datos.
- Informar claramente si el XML no se puede leer, está incompleto o ya fue procesado.

La forma exacta de detectar duplicados —por ejemplo, proveedor más número de factura, junto con otros datos disponibles— queda pendiente de diseño y debe considerar las particularidades reales de los documentos.

## 7. Validaciones necesarias

- Cantidad y unidad de medida presentes y comprensibles.
- Costo unitario extraído sin confundirlo con el total de la línea. Si el XML usa una cantidad base de precio distinta de 1 o el costo no es claro, mostrar advertencia para revisión.
- Códigos conservados como texto, incluyendo ceros iniciales.
- Un identificador estándar no se considera automáticamente código de barras. Si se declara como GTIN, validar longitud y dígito de control antes de usarlo como código de barras.
- Si faltan datos o hay una coincidencia dudosa, pedir revisión en lugar de inventar o asociar el producto incorrecto.
- Detectar facturas ya importadas antes de registrar entradas.
- Rechazar o dejar pendientes documentos que no sean facturas de compra compatibles, XML dañados o líneas que no se puedan interpretar de forma fiable.
- Mantener la precisión decimal que admita el inventario y respetar sus unidades de medida.

No se requiere extraer forma de pago, medio de pago, datos del comprador, correos, dirección del proveedor, desglose fiscal por línea ni totales fiscales, porque no son necesarios para ingresar productos al inventario.

## 8. Alcance inicial sugerido

Para la primera versión:

- Importar XML de facturas de compra compatibles.
- Extraer solo referencia de factura, fecha, nombre del proveedor y por cada línea: descripción, códigos disponibles, cantidad, unidad de medida y costo unitario.
- Identificar productos existentes con coincidencias seguras.
- Sumar cantidades mediante movimientos de entrada para productos existentes.
- Mostrar productos desconocidos para revisión y completar manualmente los datos de catálogo que falten.
- Mostrar una vista previa y exigir confirmación.
- Prevenir la doble importación.
- No guardar datos innecesarios de pago, comprador o impuestos.
- Mostrar errores concretos cuando el documento no sea compatible.

## 9. Criterios de aceptación iniciales

- [ ] Puede leer los dos XML de ejemplo revisados, incluyendo `AttachedDocument` con `Invoice` embebida.
- [ ] Extrae referencia de factura, fecha, proveedor y todas las líneas de productos.
- [ ] Cada línea incluye descripción, códigos disponibles, cantidad, unidad y costo unitario cuando esté disponible.
- [ ] No extrae ni exige información de pago, comprador o impuestos detallados.
- [ ] No inventa datos ausentes ni usa identificadores dudosos para emparejar productos.
- [ ] Los productos existentes reciben una entrada por la cantidad facturada.
- [ ] Los productos no reconocidos quedan pendientes de revisión antes de crearlos.
- [ ] No cambia el inventario antes de la confirmación.
- [ ] Una factura ya importada no puede volver a sumar las mismas cantidades.

## 10. Plan de trabajo antes de programar

Avanzar por etapas pequeñas y no escribir código hasta que el diseño esté suficientemente definido.

### Fase 1 — Requisitos y ejemplos

- [x] Revisar dos XML reales de proveedores distintos.
- [x] Identificar la estructura general y los campos de producto observados.
- [ ] Revisar más XML de proveedores diferentes.
- [ ] Confirmar qué tipos de documentos se deben aceptar.

### Fase 2 — Reglas de negocio

- [ ] Definir cómo se identifica un proveedor.
- [ ] Definir la regla exacta de coincidencia entre línea facturada y producto interno.
- [ ] Definir qué pasa con productos desconocidos.
- [ ] Definir unidades, cantidades, costos y descuentos.
- [ ] Definir cómo prevenir duplicados y registrar trazabilidad.

### Fase 3 — Diseño de interfaz y datos

- [ ] Diseñar la vista de carga y vista previa.
- [ ] Diseñar la resolución de coincidencias.
- [ ] Revisar el esquema de base de datos existente y decidir si requiere cambios.
- [ ] Definir estados de importación y mensajes de error.

### Fase 4 — Preparación de pruebas

- [ ] Crear una colección de XML de prueba de distintos proveedores.
- [ ] Documentar el resultado esperado de cada archivo.
- [ ] Incluir documentos válidos, incompletos, duplicados y no compatibles.

### Fase 5 — Implementación

**No iniciada.** Empezar cuando las fases de requisitos, reglas y diseño tengan decisiones suficientes para evitar rehacer el trabajo.

## 11. Principios del proyecto

- Primero definir y documentar; después programar.
- Trabajar por fases pequeñas y revisables.
- No agregar funcionalidades fuera del alcance acordado.
- No asumir que todos los proveedores generan XML idénticos.
- No alterar el inventario sin confirmación explícita.
- Priorizar trazabilidad, prevención de duplicados y revisión humana.
- Si una regla no está definida, documentarla como pendiente en vez de inventar una solución.

## 12. Arquitectura propuesta: importador local con IA por internet

### Decisión inicial

El importador se ejecutará en un computador con Windows y se abrirá únicamente cuando sea necesario procesar facturas. No se requiere desplegar esta herramienta como una página o servicio público en internet.

Como sí habrá conexión a internet, el programa podrá consultar una API de inteligencia artificial para interpretar los XML y conectarse a Supabase para guardar las entradas confirmadas.

### Flujo propuesto

1. El usuario abre el programa local.
2. Selecciona el XML de la factura.
3. El programa extrae el contenido XML necesario y lo envía a la API de IA configurada para su interpretación.
4. La IA devuelve los datos en el esquema JSON definido por el proyecto.
5. El programa valida el resultado y consulta en Supabase los productos y las relaciones existentes con ese proveedor.
6. Se presenta una vista previa para revisar coincidencias, cantidades y precios.
7. El usuario confirma la importación.
8. El programa registra la entrada en Supabase mediante operaciones controladas por el backend o por un componente seguro de acceso a datos.
9. Se guarda la referencia de la factura procesada para prevenir duplicados.

### Qué necesita internet

- Consultar la API de IA.
- Consultar productos y relaciones guardadas en Supabase.
- Registrar las entradas de inventario y la trazabilidad en Supabase.

El análisis local del archivo y la interfaz pueden ejecutarse en el computador, pero las funciones que dependen de la IA en la nube y de Supabase requieren conexión a internet.

### Seguridad

- La clave de la API de IA debe guardarse en variables de entorno locales y no escribirse directamente en el código ni compartirse en GitHub.
- La clave `SUPABASE_SERVICE_ROLE_KEY` no debe incluirse en el frontend ni distribuirse dentro de un programa local que pueda copiarse o inspeccionarse.
- Antes de conectar el importador a la base de datos, se debe decidir cómo proteger el acceso de escritura. Una opción es que el programa local llame a un endpoint privado del backend existente en Render; otra es crear un mecanismo limitado y seguro para esta función.
- No se deben guardar movimientos en Supabase hasta que el usuario confirme la vista previa.
- Las claves y credenciales reales no deben incluirse en este README.

### Decisiones pendientes

- [ ] Confirmar el proveedor/modelo de IA para la extracción.
- [ ] Decidir si el programa será una interfaz web local o una aplicación de escritorio.
- [ ] Definir cómo autenticará el importador sus solicitudes de escritura al backend.
- [x] Definir un esquema JSON mínimo y estable para la IA; ver el prompt de la sección 13.
- [ ] Establecer límites de tamaño del XML y manejo de errores de API o conexión.

### Alcance de esta decisión

Esta arquitectura es una propuesta de diseño, no una implementación. La extracción debe mantenerse enfocada en la entrada de inventario. No se incluirá la clave `SUPABASE_SERVICE_ROLE_KEY` dentro del programa local; las escrituras deben pasar por un backend seguro.


## 13. Prompt definitivo de extracción XML a JSON

Este prompt se usa para extraer únicamente los datos necesarios para ingresar productos al inventario. El resultado de la IA es una propuesta: el programa debe validarlo y pedir confirmación antes de registrar movimientos.

```text
Actúa como un extractor preciso de facturas electrónicas de compra en XML, especialmente documentos UBL 2.1 / DIAN de Colombia. Tu única tarea es extraer los datos mínimos necesarios para ingresar los productos de una factura al inventario. No hagas análisis contable ni fiscal.

El XML puede ser una factura Invoice directa o un AttachedDocument que contenga una Invoice embebida en cac:Attachment/cac:ExternalReference/cbc:Description, incluso como CDATA. Reconoce namespaces XML aunque cambien los prefijos. Extrae todas las líneas de productos una sola vez.

Devuelve exclusivamente un JSON válido con esta estructura exacta:
{
  "factura": {
    "numero": null,
    "fecha": null,
    "proveedor": null
  },
  "productos": [
    {
      "numero_linea": null,
      "descripcion": null,
      "codigo_proveedor": null,
      "codigo_comprador": null,
      "identificacion_estandar": {
        "codigo": null,
        "esquema": null
      },
      "codigo_barras": null,
      "cantidad": null,
      "unidad_medida": null,
      "costo_unitario": null
    }
  ],
  "advertencias": [],
  "errores": []
}

Reglas obligatorias:
1. Extrae únicamente el número o referencia de factura, fecha de emisión, nombre del proveedor y los datos de cada línea incluidos en el esquema. No incluyas NIT, datos del comprador, correos, direcciones, forma o medio de pago, impuestos, totales fiscales, CUFE ni otros campos.
2. Conserva los códigos como texto, incluyendo ceros iniciales. No combines codigo_proveedor, codigo_comprador, identificacion_estandar y codigo_barras: son campos distintos.
3. Copia identificacion_estandar.codigo y su atributo schemeID en identificacion_estandar.esquema exactamente como aparecen en el XML. No asumas que cualquier identificación estándar es un código de barras.
4. Rellena codigo_barras solo cuando el XML dé evidencia suficiente de que es un GTIN/código de barras y el código supere la validación de longitud y dígito de control aplicable. Si no se puede confirmar, usa null. No descartes el identificador original: consérvalo en identificacion_estandar y agrega una advertencia si es inválido o sospechoso.
5. Extrae cantidad y unidad de medida de la línea. Conserva números como números y códigos/unidades como texto. No redondees cantidades.
6. costo_unitario debe corresponder al precio por unidad de producto, no al subtotal ni al total de línea. Si el XML declara una cantidad base de precio distinta de 1, o no es posible establecer con seguridad el costo por unidad, devuelve null y explica la situación en advertencias. No inventes ni calcules valores que no se puedan establecer con certeza.
7. Si un campo no aparece o no puede determinarse con seguridad, usa null. No inventes descripciones, códigos, cantidades, unidades, costos, fechas ni proveedor.
8. No combines ni elimines líneas por tener descripciones o códigos parecidos. Conserva el número de línea original cuando exista.
9. No decidas si un producto debe crearse ni modifiques inventario. Eso lo resolverá el programa después de mostrar la vista previa.
10. Usa advertencias para datos ausentes, códigos inválidos, precios ambiguos o inconsistencias. Usa errores cuando el XML no pueda leerse o no se encuentre una factura de compra interpretable. Si no hay advertencias o errores, devuelve arrays vacíos.
11. No incluyas explicaciones, Markdown ni texto fuera del JSON. Respeta exactamente los nombres y tipos de campos del esquema.

XML de entrada:
[EL PROGRAMA INSERTARÁ AQUÍ EL CONTENIDO DEL XML]
```

### Ejemplo del JSON esperado

El ejemplo muestra una sola línea para ilustrar el formato; la IA debe incluir todas las líneas reales del XML. Los valores son solo ilustrativos.

```json
{
  "factura": {
    "numero": "MNAL381257",
    "fecha": "2026-10-19",
    "proveedor": "CACHARRERIA MUNDIAL S.A.S."
  },
  "productos": [
    {
      "numero_linea": "1",
      "descripcion": "PULIDORA 4 1/2PUL 820W BLACK DECKER G720",
      "codigo_proveedor": "6447265",
      "codigo_comprador": "6447265",
      "identificacion_estandar": {
        "codigo": "0028877362755",
        "esquema": "010"
      },
      "codigo_barras": "0028877362755",
      "cantidad": 2,
      "unidad_medida": "94",
      "costo_unitario": 131332
    }
  ],
  "advertencias": [],
  "errores": []
}
```

**Importante:** el JSON de la IA no es una orden directa para modificar el inventario. El programa debe comprobar duplicados, validar los campos, resolver coincidencias con productos existentes y solicitar confirmación. La cantidad recibida se registra mediante el sistema de movimientos de inventario existente; no se actualiza un campo de stock directamente.
