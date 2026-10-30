
export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface Producto {
  id: string
  nombre: string
  precio_compra: number | null
  codigo?: string | null
  sku?: string | null
  codigo_barras?: string | null
  codigo_interno?: string | null
  codigo_proveedor?: string | null
  referencia?: string | null
}

export interface EstadoCatalogo {
  productos: Producto[]
  actualizadoEn: string | null
  origen: 'api' | 'local'
  descartados: number
  advertencia?: string
}

export interface ResumenFactura {
  numero: string | null
  fecha: string | null
  cufe: string | null
  moneda: string | null
  proveedorNombre: string | null
  proveedorNit: string | null
  compradorNombre: string | null
  compradorNit: string | null
  lineas: number
  total: number | null
  subtotal: number | null
}

export interface ArchivoXML {
  nombre: string
  contenido: string
  /** XML de la factura sin el contenedor AttachedDocument de la DIAN. */
  contenidoFactura: string
  /** true solo si es una factura que se puede procesar. */
  valido: boolean
  mensaje: string
  tipoDocumento: 'factura' | 'nota_credito' | 'nota_debito' | 'desconocido'
  resumen: ResumenFactura | null
}

export interface CandidatoCoincidencia {
  id: string
  nombre: string
  precio: number | null
  puntuacion: number
  motivo: string
  codigo?: string | null
}

export interface ResultadoCoincidencia {
  productoFactura: string
  estado: 'coincidencia_alta' | 'revision_manual' | 'sin_coincidencia'
  puntuacion: number
  motivo: string
  candidatos: CandidatoCoincidencia[]
  productoSeleccionadoId: string | null
}

export type EstadoPrecio = 'aumento' | 'disminucion' | 'igual' | 'sin_referencia'

export interface ComparacionPrecio {
  productoId: string
  productoNombre: string
  /** true cuando la coincidencia aún debe confirmarse manualmente. */
  provisional: boolean
  estado: EstadoPrecio
  precioActual: number | null
  precioFactura: number | null
  precioFacturaSinIva: number | null
  precioFacturaConIva: number | null
  tasaIva: number
  baseComparacion: 'sin_iva' | 'con_iva'
  diferencia: number | null
  variacionPct: number | null
  cantidad: number | null
  unidad: string | null
  alertas: string[]
}

export interface AppAPI {
  getAppInfo: () => Promise<AppInfo>

  iniciarSesion: (contrasena: string) =>
    Promise<{ autenticado: boolean }>

  procesarXMLConGemini: (xml: string) => Promise<{
    modelo: string
    respuesta: string
  }>

  compararFacturaConCatalogo: (
    respuestaGemini: string,
    catalogo: Producto[]
  ) => Promise<ResultadoCoincidencia[]>

  compararPrecios: (
    respuestaGemini: string,
    coincidencias: ResultadoCoincidencia[]
  ) => Promise<(ComparacionPrecio | null)[]>

  cerrarSesion: () => Promise<{ ok: boolean }>

  comprobarSesion: () => Promise<{ autenticado: boolean }>

  actualizarCatalogo: () => Promise<EstadoCatalogo>

  actualizarPrecioCompra: (
    productoId: string,
    precioCompra: number
  ) => Promise<{ ok: boolean }>

  seleccionarYLeerXML: () => Promise<ArchivoXML | null>
}

declare global {
  interface Window {
    api: AppAPI
  }
}
