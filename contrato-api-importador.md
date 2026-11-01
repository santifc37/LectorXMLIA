# Contrato de la API — Importador de facturas de compra

Contrato que usa el importador DIAN. Está tomado del código de la rama `feat/facturas-compra`
(`apps/api/src/routes`, `services`, `utils` y la migración `20261031120000_facturas_compra.sql`).

## Convenciones generales

| Tema | Regla |
|---|---|
| Formato | Todas las rutas reciben y responden JSON. |
| Autenticación | Cookie de sesión `sesion=<JWT>`. Todas las rutas, salvo `POST /auth/login` y `POST /auth/logout`, la exigen. |
| Sin sesión o sesión vencida | `401 { "error": "No autorizado" }` |
| Ruta inexistente | `404 { "error": "Ruta no encontrada" }` |
| Error inesperado | `500 { "error": "mensaje" }` |
| Identificadores | UUID (se validan con formato UUID; si no lo son, `400`). |

Cookie de sesión: `httpOnly`, `sameSite=lax`, `path=/`, duración 30 días, `secure` solo en producción.

---

## 1. Sesión

### `POST /auth/login`

Solicitud:

```json
{ "contrasena": "..." }
```

| Código | Respuesta |
|---|---|
| 200 | `{ "autenticado": true }` y cabecera `Set-Cookie: sesion=...` |
| 400 | `{ "error": "Contraseña requerida" }` (falta o no es texto) |
| 401 | `{ "error": "Credenciales inválidas" }` |

### `GET /auth/me`

| Código | Respuesta |
|---|---|
| 200 | `{ "autenticado": true }` |
| 401 | `{ "error": "No autorizado" }` (no responde `autenticado: false`) |

### `POST /auth/logout`

Borra la cookie. Responde `200 { "ok": true }`.

---

## 2. Catálogo

### `GET /productos?activo=true`

`activo` es opcional: `true`, `false` o se omite (todos). Cualquier otro valor da
`400 { "error": "El parámetro activo debe ser true o false" }`.

Respuesta `200`: arreglo ordenado por nombre (máximo 2000 productos).

```json
[
  {
    "id": "uuid",
    "codigo": "string",
    "codigo_barras": "string | null",
    "nombre": "string",
    "descripcion": "string | null",
    "categoria_id": "uuid",
    "unidad_base_id": "uuid",
    "precio_compra": 185000,
    "precio_venta": 230000,
    "stock_minimo": 5,
    "activo": true,
    "creado_en": "timestamp",
    "actualizado_en": "timestamp"
  }
]
```

---

## 3. Facturas de compra

Prefijo: `/facturas-compra`.

### `GET /facturas-compra/existe?nit=900123456&numero=FE-1001`

Consulta si la factura ya fue importada. `nit` y `numero` son obligatorios; si faltan o están vacíos:
`400 { "error": "El NIT del proveedor y el número de la factura son obligatorios" }`.

Respuesta `200`:

```json
{ "existe": false }
```

```json
{
  "existe": true,
  "factura_id": "uuid",
  "numero": "FE-1001",
  "proveedor_nombre": "Proveedor SAS | null",
  "importada_en": "timestamp"
}
```

`numero` devuelve el número tal como se importó (sin normalizar).

### `POST /facturas-compra` — importar (atómico e idempotente)

Solicitud:

```json
{
  "proveedor_nit": "900123456",
  "proveedor_nombre": "Proveedor SAS",
  "numero": "FE-1001",
  "fecha_emision": "2026-10-30",
  "tipo_documento": "factura",
  "lineas": [
    {
      "linea": 1,
      "producto_id": "uuid",
      "descripcion": "texto original",
      "codigo_proveedor": "ABC-1",
      "cantidad": 3,
      "unidad": "UND",
      "precio_unitario": 185000,
      "estado_coincidencia": "coincidencia_alta",
      "importar": true,
      "actualizar_precio": true,
      "precio_nuevo": 185000
    }
  ]
}
```

Campos de la factura:

| Campo | Tipo | Regla |
|---|---|---|
| `proveedor_nit` | texto | Obligatorio, máx. 40 caracteres. |
| `proveedor_nombre` | texto o `null` | Opcional, máx. 200. |
| `numero` | texto | Obligatorio, máx. 80. |
| `fecha_emision` | `YYYY-MM-DD` o `null` | Opcional; debe ser una fecha real. |
| `tipo_documento` | texto | Debe ser exactamente `"factura"`. |
| `lineas` | arreglo | De 1 a 500 líneas, y al menos una con `importar: true`. |

Campos de cada línea:

| Campo | Tipo | Regla |
|---|---|---|
| `linea` | entero | Obligatorio, ≥ 1, sin repetir dentro de la factura. |
| `producto_id` | UUID o `null` | `null` si no hay coincidencia. Obligatorio si `importar` es `true`. |
| `descripcion` | texto | Obligatoria, máx. 1000. |
| `codigo_proveedor` | texto o `null` | Opcional, máx. 100. |
| `cantidad` | número o `null` | Debe ser > 0 si `importar` es `true`. |
| `unidad` | texto o `null` | Opcional, máx. 30. Informativa: no hay conversión. |
| `precio_unitario` | número o `null` | Precio de la factura; no puede ser negativo. |
| `estado_coincidencia` | texto | `coincidencia_alta`, `revision_manual` o `sin_coincidencia`. |
| `importar` | booleano | Obligatorio. `true` genera la entrada de inventario. |
| `actualizar_precio` | booleano | Obligatorio. Solo puede ser `true` si `importar` es `true`. |
| `precio_nuevo` | número o `null` | Obligatorio y > 0 si `actualizar_precio` es `true`. |

Respuestas:

| Código | Cuerpo |
|---|---|
| 201 | `{ "mensaje": "Factura importada correctamente", "duplicada": false, "factura_id", "ajuste_entrada_id", "lineas_importadas", "precios_actualizados" }` |
| 409 | `{ "error": "Esta factura ya fue importada", "duplicada": true, "factura_id", "importada_en" }` — no se registra nada. |
| 400 | `{ "error": "mensaje claro" }` — datos inválidos (validación de la API o de la base de datos, por ejemplo producto inexistente o inactivo). |
| 401 | `{ "error": "No autorizado" }` |
| 500 | `{ "error": "No fue posible importar la factura" }` |

### `GET /facturas-compra`

Historial de facturas importadas, de la más reciente a la más antigua (máximo 100).

```json
{
  "facturas": [
    {
      "id": "uuid",
      "proveedor_nit": "900123456",
      "proveedor_nombre": "Proveedor SAS | null",
      "numero_original": "FE-1001",
      "fecha_emision": "2026-10-30 | null",
      "total_lineas": 12,
      "lineas_importadas": 10,
      "precios_actualizados": 3,
      "usuario_actor": "importador-dian",
      "creado_en": "timestamp"
    }
  ],
  "total": 1
}
```

### `GET /facturas-compra/:id`

Detalle de una factura. `400` si el `id` no es UUID; `404 { "error": "Factura no encontrada" }` si no existe.

```json
{
  "id": "uuid",
  "proveedor_nit": "900123456",
  "proveedor_nombre": "Proveedor SAS | null",
  "numero_original": "FE-1001",
  "fecha_emision": "2026-10-30 | null",
  "tipo_documento": "factura",
  "ajuste_entrada_id": "uuid",
  "total_lineas": 12,
  "lineas_importadas": 10,
  "precios_actualizados": 3,
  "usuario_actor": "importador-dian",
  "creado_en": "timestamp",
  "items": [
    {
      "id": "uuid",
      "linea": 1,
      "producto_id": "uuid | null",
      "producto": { "id": "uuid", "codigo": "string", "nombre": "string" },
      "descripcion": "texto original",
      "codigo_proveedor": "string | null",
      "cantidad": 3,
      "unidad": "UND | null",
      "precio_unitario_factura": 185000,
      "precio_compra_anterior": 170000,
      "diferencia": 15000,
      "variacion_pct": 8.82,
      "estado_coincidencia": "coincidencia_alta",
      "estado_importacion": "importada | excluida | sin_coincidencia",
      "decision_precio": "actualizado | no_actualizado | no_aplica"
    }
  ]
}
```

`producto` es `null` en las líneas sin coincidencia. Los `items` van ordenados por `linea`.
`precio_compra_anterior`, `diferencia` y `variacion_pct` son `null` si el producto no tenía precio de compra (> 0) o la factura no trae precio.

### `GET /facturas-compra/precios/:productoId`

Evolución del precio de compra de un producto según las facturas importadas (el importador aún no lo usa).
`400` si `productoId` no es UUID.

```json
{
  "historial": [
    {
      "linea": 1,
      "cantidad": 3,
      "unidad": "UND",
      "precio_unitario_factura": 185000,
      "precio_compra_anterior": 170000,
      "diferencia": 15000,
      "variacion_pct": 8.82,
      "decision_precio": "actualizado",
      "estado_importacion": "importada",
      "factura": {
        "id": "uuid",
        "numero_original": "FE-1001",
        "proveedor_nombre": "Proveedor SAS | null",
        "fecha_emision": "2026-10-30 | null",
        "creado_en": "timestamp"
      }
    }
  ],
  "total": 1
}
```

Solo incluye líneas con `estado_importacion = "importada"`, de la más reciente a la más antigua (máximo 200).

---

## 4. Reglas que la API cumple

1. **Duplicados.** `proveedor_nit` y `numero` forman una clave única. Antes de comparar se normalizan: se
   eliminan todos los caracteres que no son letras ni números (guiones, espacios, puntos, barras…) y se
   pasa a mayúsculas. `FE-001 ` y `fe001` son la misma factura. La base guarda el NIT y el número
   normalizados, y el número original aparte (`numero_original`).
2. **Concurrencia e idempotencia.** Dos solicitudes simultáneas de la misma factura se ejecutan una detrás
   de otra (bloqueo por factura). La entrada de inventario usa la clave `dian:<nit>:<numero>`. Repetir la
   solicitud no duplica entradas ni cambios de precio: responde `409`.
3. **Atomicidad.** Entrada de inventario, cambios de precio, cabecera e ítems se guardan en una sola
   transacción. Si algo falla no queda una importación a medias.
4. **Precio anterior.** Lo lee la API de la base de datos (`productos.precio_compra`); el cliente no lo envía.
   Los cambios de precio solo se aplican en líneas con `actualizar_precio: true` y `precio_nuevo` válido.
5. **Unidades.** La cantidad se registra en la unidad base del producto, sin conversión. `unidad` solo se guarda como dato informativo.
6. **Líneas sin producto.** No se crean productos ni movimientos para ellas; quedan registradas como `sin_coincidencia`.
7. **Productos inactivos.** No pueden recibir entradas (`400`).
8. **Usuario registrado.** Todas las importaciones quedan a nombre de `importador-dian`.
9. **Inmutabilidad.** Las facturas y sus ítems no se editan ni se eliminan una vez importados.
10. **Orden de rutas.** `/existe` y `/precios/:productoId` se declaran antes de `/:id`. Ya lo están en el código.

---

## 5. Diferencias con el borrador inicial del contrato

- `GET /auth/me` no devuelve `autenticado: false`: sin sesión responde `401`.
- `POST /auth/login` exitoso responde `{ "autenticado": true }`; los fallos son `400` (falta la contraseña) y `401` (contraseña incorrecta).
- La normalización de duplicados quita **todos** los caracteres no alfanuméricos, no solo guiones y espacios.
- El `409` incluye también el campo `error: "Esta factura ya fue importada"`.
- `GET /facturas-compra/:id` devuelve además `tipo_documento`, `ajuste_entrada_id`, y en cada ítem `id`, `producto_id`, `codigo_proveedor` y `estado_coincidencia`.
