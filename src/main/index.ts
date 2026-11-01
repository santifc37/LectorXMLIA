import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { procesarXMLConGemini } from './services/gemini/gemini.service'
import { compararFacturaConCatalogo } from './services/matching/matching.service'
import type {
  ProductoCatalogo,
  ResultadoCoincidencia
} from './services/matching/matching.service'
import { compararPrecios } from './services/precios/precios.service'
import { config } from './config'

import {
  iniciarSesion,
  cerrarSesion,
  comprobarSesion,
  buscarFacturaAPI,
  listarFacturasAPI,
  obtenerFacturaAPI
} from './services/api/api.service'

import { actualizarCatalogo } from './services/catalogo/catalogo.service'

import { leerArchivoXML } from './services/xml/xml.service'
import { importarFactura } from './services/importacion/importacion.service'
import type { EntradaImportacion } from './services/importacion/importacion.service'
import {
  borrarProgreso,
  guardarProgreso,
  leerProgreso
} from './services/progreso/progreso.service'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ferreteria.importadordian')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('gemini:procesar-xml', async (_, xml: string) => {
    return await procesarXMLConGemini(xml)
  })

  // Autenticación
  ipcMain.handle('auth:login', async (_, contrasena: string) => {
    return await iniciarSesion(contrasena)
  })

  ipcMain.handle('auth:logout', async () => {
    return await cerrarSesion()
  })

  ipcMain.handle('auth:me', async () => {
    return await comprobarSesion()
  })

  // Catálogo: descarga desde la API y guarda data/productos.json.
  // Si la API no responde, usa la copia local.
  ipcMain.handle('catalogo:actualizar', async () => {
    return await actualizarCatalogo()
  })

  // Importación confirmada por el usuario: valida, recalcula los precios y envía
  // todo a la API en una sola operación atómica e idempotente.
  ipcMain.handle('importacion:confirmar', async (_, entrada: EntradaImportacion) => {
    return await importarFactura(entrada)
  })

  // ¿La factura ya fue importada? Se consulta antes de gastar una llamada a Gemini.
  ipcMain.handle('importacion:existe', async (_, nit: string, numero: string) => {
    if (typeof nit !== 'string' || !nit.trim() || typeof numero !== 'string' || !numero.trim()) {
      throw new Error('El NIT del proveedor y el número de la factura son obligatorios.')
    }

    return await buscarFacturaAPI(nit, numero)
  })

  // Historial de facturas importadas.
  ipcMain.handle('facturas:listar', async () => {
    return await listarFacturasAPI()
  })

  ipcMain.handle('facturas:obtener', async (_, id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Factura no válida.')
    }

    return await obtenerFacturaAPI(id)
  })

  // Progreso local de cada factura, para continuar si se cierra la aplicación.
  ipcMain.handle(
    'progreso:guardar',
    async (_, contenidoFactura: string, datos: Parameters<typeof guardarProgreso>[1]) => {
      if (!datos || typeof datos !== 'object') {
        throw new Error('Progreso no válido.')
      }

      await guardarProgreso(contenidoFactura, datos)
    }
  )

  ipcMain.handle('progreso:leer', async (_, contenidoFactura: string) => {
    return await leerProgreso(contenidoFactura)
  })

  ipcMain.handle('progreso:borrar', async (_, contenidoFactura: string) => {
    await borrarProgreso(contenidoFactura)
  })

  // Comparación de productos de la factura contra el catálogo local
ipcMain.handle(
  'matching:comparar-factura',
  async (
    _,
    respuestaGemini: string,
    catalogo: ProductoCatalogo[]
  ) => {
    let factura

    try {
      factura = JSON.parse(respuestaGemini)
    } catch {
      throw new Error('La respuesta de Gemini no contiene un JSON válido.')
    }

    if (!Array.isArray(factura.productos)) {
      throw new Error('La factura no contiene una lista válida de productos.')
    }

    if (!Array.isArray(catalogo)) {
      throw new Error('No se recibió un catálogo válido.')
    }

    return compararFacturaConCatalogo(
      factura.productos,
      catalogo
    )
  }
)

  // Comparación de precios: precio de la factura vs. precio de compra actual.
  // Se calcula en código; Gemini solo aporta los datos de la factura.
  ipcMain.handle(
    'precios:comparar',
    async (_, respuestaGemini: string, coincidencias: ResultadoCoincidencia[]) => {
      let factura

      try {
        factura = JSON.parse(respuestaGemini)
      } catch {
        throw new Error('La respuesta de Gemini no contiene un JSON válido.')
      }

      if (!Array.isArray(factura.productos)) {
        throw new Error('La factura no contiene una lista válida de productos.')
      }

      if (!Array.isArray(coincidencias)) {
        throw new Error('No se recibieron coincidencias válidas.')
      }

      return compararPrecios(factura.productos, coincidencias, {
        catalogoIncluyeIva: config.precioCompraIncluyeIva
      })
    }
  )

  // Selección y lectura de XML
  ipcMain.handle('xml:seleccionar-y-leer', async () => {
    const resultado = await dialog.showOpenDialog({
      title: 'Seleccionar factura electrónica DIAN',
      buttonLabel: 'Seleccionar XML',
      filters: [
        {
          name: 'Archivos XML',
          extensions: ['xml']
        }
      ],
      properties: ['openFile']
    })

    if (resultado.canceled || resultado.filePaths.length === 0) {
      return null
    }

    return await leerArchivoXML(resultado.filePaths[0])
  })

  // Información de la aplicación
  ipcMain.handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})