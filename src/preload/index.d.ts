
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

export interface OpcionCatalogo {
  id: string
  nombre: string
  codigo?: string | null
}

export interface DatosProductoNuevo {
  codigo: string
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  categoria_id: string
  unidad_base_id: string
  precio_compra: number
  precio_venta: number
  stock_minimo: number
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

export interface EntradaImportacion {
  respuestaGemini: string
  resumen: ResumenFactura | null
  coincidencias: ResultadoCoincidencia[]
  /** Posiciones de las líneas que el usuario dejó marcadas para importar. */
  incluidas: number[]
  /** Posiciones de las líneas con cambio de precio autorizado. */
  preciosAutorizados: number[]
}

export interface RespuestaImportacion {
  /** true si la factura ya estaba importada: no se registró nada nuevo. */
  duplicada: boolean
  factura_id: string
  ajuste_entrada_id?: string
  lineas_importadas?: number
  precios_actualizados?: number
  importada_en?: string
}

export interface FacturaYaImportada {
  existe: boolean
  factura_id?: string
  numero?: string
  proveedor_nombre?: string | null
  importada_en?: string
}

export interface ProgresoFactura {
  version: 1
  archivo: string
  guardadoEn: string
  respuestaGemini: { modelo: string; respuesta: string }
  coincidencias: ResultadoCoincidencia[]
  incluidas: Record<string, boolean>
  preciosAutorizados: Record<string, boolean>
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

  productosNuevosCatalogo: () => Promise<Producto[]>

  agregarProductosCatalogo: (ids: string[]) => Promise<EstadoCatalogo>

  crearProducto: (
    datos: DatosProductoNuevo
  ) => Promise<{ estado: EstadoCatalogo; productoId: string }>

  listarCategorias: () => Promise<OpcionCatalogo[]>

  listarUnidades: () => Promise<OpcionCatalogo[]>

  compararLineaConCatalogo: (
    respuestaGemini: string,
    indice: number,
    catalogo: Producto[]
  ) => Promise<ResultadoCoincidencia>

  confirmarImportacion: (entrada: EntradaImportacion) => Promise<RespuestaImportacion>

  facturaYaImportada: (nit: string, numero: string) => Promise<FacturaYaImportada>

  listarFacturas: () => Promise<{ facturas: unknown[]; total: number }>

  obtenerFactura: (id: string) => Promise<unknown>

  guardarProgreso: (
    contenidoFactura: string,
    datos: Omit<ProgresoFactura, 'version' | 'guardadoEn'>
  ) => Promise<void>

  leerProgreso: (contenidoFactura: string) => Promise<ProgresoFactura | null>

  borrarProgreso: (contenidoFactura: string) => Promise<void>

  seleccionarYLeerXML: () => Promise<ArchivoXML | null>
}

declare global {
  interface Window {
    api: AppAPI
  }
}
