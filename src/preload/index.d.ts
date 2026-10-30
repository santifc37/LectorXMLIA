
export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface Producto {
  id: string
  nombre: string
  precio_compra: number
}

export interface ArchivoXML {
  nombre: string
  contenido: string
  valido: boolean
  mensaje: string
  tipoDocumento: 'factura' | 'nota_credito' | 'nota_debito' | 'desconocido'
}

export interface CandidatoCoincidencia {
  id: string
  nombre: string
  precio: number | null
  puntuacion: number
  motivo: string
}

export interface ResultadoCoincidencia {
  productoFactura: string
  estado: 'coincidencia_alta' | 'revision_manual' | 'sin_coincidencia'
  puntuacion: number
  motivo: string
  candidatos: CandidatoCoincidencia[]
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

  cerrarSesion: () => Promise<{ ok: boolean }>

  comprobarSesion: () => Promise<{ autenticado: boolean }>

  obtenerProductos: () => Promise<Producto[]>

  seleccionarYLeerXML: () => Promise<ArchivoXML | null>
}

declare global {
  interface Window {
    api: AppAPI
  }
}
