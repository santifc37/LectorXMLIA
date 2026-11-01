/*Este es el contrato que usa el importador. Todas las rutas exigen la cookie de sesión (sesion=) y responden JSON. Está tomado del código de la rama feat/facturas-compra.

text
SESIÓN
POST /auth/login            recibe  { "contrasena": "..." }
                            devuelve cookie "sesion=..."  (si falla: { "error" })
GET  /auth/me               devuelve { "autenticado": true|false }
POST /auth/logout           devuelve { "ok": true }

CATÁLOGO
GET  /productos?activo=true devuelve [ { id, nombre, precio_compra, codigo,
                              codigo_barras, activo, ... } ]

FACTURAS DE COMPRA
GET  /facturas-compra/existe?nit=900123456&numero=FE-1001
     devuelve { "existe": false }
          o   { "existe": true, "factura_id", "numero",
                "proveedor_nombre", "importada_en" }

POST /facturas-compra       (importar; atómico e idempotente)
     recibe {
       "proveedor_nit": "900123456",
       "proveedor_nombre": "Proveedor SAS" | null,
       "numero": "FE-1001",
       "fecha_emision": "2026-10-30" | null,
       "tipo_documento": "factura",
       "lineas": [ {
         "linea": 1,                      // consecutivo, sin repetir
         "producto_id": "uuid" | null,    // null si no hay coincidencia
         "descripcion": "texto original",
         "codigo_proveedor": "..." | null,
         "cantidad": 3 | null,
         "unidad": "UND" | null,
         "precio_unitario": 185000 | null,
         "estado_coincidencia": "coincidencia_alta" | "revision_manual"
                                | "sin_coincidencia",
         "importar": true,                // entra al inventario
         "actualizar_precio": true,       // autorizado por el usuario
         "precio_nuevo": 185000 | null    // obligatorio si actualizar_precio
       } ]
     }
     201 { "mensaje", "duplicada": false, "factura_id", "ajuste_entrada_id",
           "lineas_importadas", "precios_actualizados" }
     409 { "error", "duplicada": true, "factura_id", "importada_en" }
         (ya estaba importada: no se registra nada)
     400 { "error": "mensaje claro" }     (datos inválidos)
     500 { "error" }

GET  /facturas-compra       devuelve { "facturas": [ { id, proveedor_nit,
                              proveedor_nombre, numero_original, fecha_emision,
                              total_lineas, lineas_importadas,
                              precios_actualizados, usuario_actor, creado_en } ],
                              "total" }
GET  /facturas-compra/:id   devuelve la factura + "items": [ { linea, producto,
                              descripcion, cantidad, unidad,
                              precio_unitario_factura, precio_compra_anterior,
                              diferencia, variacion_pct, estado_importacion,
                              decision_precio } ]   (404 si no existe)
GET  /facturas-compra/precios/:productoId
                            devuelve { "historial": [...], "total" }
                            (evolución de precios; el importador aún no lo usa)

Reglas que la API debe cumplir:

Duplicados: proveedor_nit y numero son únicos, y se normalizan quitando guiones, espacios y mayúsculas.
Precio anterior: lo lee la API de la base de datos, no lo manda el cliente.
Unidades: la cantidad se registra en la unidad base del producto, sin conversión.
Orden de rutas: /existe y /precios/:id deben ir antes de /:id. Ya lo están en el código.*/