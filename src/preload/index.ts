import { contextBridge, ipcRenderer } from 'electron'

interface Producto {
  id: string
  nombre: string
  precio_compra: number
}

const api = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),

  procesarXMLConGemini: (xml: string) =>
    ipcRenderer.invoke('gemini:procesar-xml', xml),

  compararFacturaConCatalogo: (
    respuestaGemini: string,
    catalogo: Producto[]
  ) =>
    ipcRenderer.invoke(
      'matching:comparar-factura',
      respuestaGemini,
      catalogo
    ),

  iniciarSesion: (contrasena: string) =>
    ipcRenderer.invoke('auth:login', contrasena),

  cerrarSesion: () =>
    ipcRenderer.invoke('auth:logout'),

  comprobarSesion: () =>
    ipcRenderer.invoke('auth:me'),

  obtenerProductos: () =>
    ipcRenderer.invoke('catalogo:obtener-productos'),

  seleccionarYLeerXML: () =>
    ipcRenderer.invoke('xml:seleccionar-y-leer')
}

contextBridge.exposeInMainWorld('api', api)