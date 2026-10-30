import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { procesarXMLConGemini } from './services/gemini/gemini.service'
import { compararFacturaConCatalogo } from './services/matching/matching.service'
import type { ProductoCatalogo } from './services/matching/matching.service'

import {
  iniciarSesion,
  cerrarSesion,
  comprobarSesion,
  obtenerProductosAPI
} from './services/api/api.service'

import { leerArchivoXML } from './services/xml/xml.service'

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

  // Productos
  ipcMain.handle('catalogo:obtener-productos', async () => {
    return await obtenerProductosAPI()
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