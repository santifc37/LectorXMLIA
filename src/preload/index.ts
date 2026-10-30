import { contextBridge, ipcRenderer } from 'electron'

interface Producto {
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

  compararPrecios: (respuestaGemini: string, coincidencias: unknown[]) =>
    ipcRenderer.invoke('precios:comparar', respuestaGemini, coincidencias),

  iniciarSesion: (contrasena: string) =>
    ipcRenderer.invoke('auth:login', contrasena),

  cerrarSesion: () =>
    ipcRenderer.invoke('auth:logout'),

  comprobarSesion: () =>
    ipcRenderer.invoke('auth:me'),

  actualizarCatalogo: () =>
    ipcRenderer.invoke('catalogo:actualizar'),

  actualizarPrecioCompra: (productoId: string, precioCompra: number) =>
    ipcRenderer.invoke('productos:actualizar-precio', productoId, precioCompra),

  crearProducto: (nombre: string, precioCompra: number) =>
    ipcRenderer.invoke('productos:crear', nombre, precioCompra),

  precioLineaFactura: (respuestaGemini: string, indice: number) =>
    ipcRenderer.invoke('precios:linea', respuestaGemini, indice),

  seleccionarYLeerXML: () =>
    ipcRenderer.invoke('xml:seleccionar-y-leer')
}

contextBridge.exposeInMainWorld('api', api)