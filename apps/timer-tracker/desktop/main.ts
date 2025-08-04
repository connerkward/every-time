import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { GoogleCalendarService } from './googleCalendarService';
import { TimerService } from './timerService';
import Store from 'electron-store';

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
const store = new Store();
const isDev = !app.isPackaged;

// Services with error handling
let googleCalendarService: GoogleCalendarService;
let timerService: TimerService;

try {
  googleCalendarService = new GoogleCalendarService();
  timerService = new TimerService(store, googleCalendarService);
} catch (error) {
  console.error('Failed to initialize services:', error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('Error details:', errorMessage);
  
  // Show error dialog to user
  dialog.showErrorBox(
    'Initialization Error', 
    `Failed to start Timer Tracker due to missing dependencies.\n\nError: ${errorMessage}\n\nPlease reinstall the application.`
  );
  
  // Exit the app
  app.quit();
  process.exit(1);
}

function createTray(): void {
  // Create tray with empty image - macOS will use the title text
  tray = new Tray(nativeImage.createEmpty());
  
  tray.setToolTip('Timer Tracker');
  tray.setTitle('⏱️'); // This emoji shows in the menu bar

  // Create main window when tray is clicked
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        showMainWindow();
      }
    } else {
      createMainWindow();
    }
  });

  // No context menu - use only click behavior
}

function createMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 320,
    height: 400,
    resizable: false,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    vibrancy: 'sidebar',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  // For now, use index.html until we build main.html
  mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.once('ready-to-show', () => {
    showMainWindow();
  });

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  const trayBounds = tray?.getBounds();
  const windowBounds = mainWindow.getBounds();
  
  if (trayBounds) {
    const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
    const y = Math.round(trayBounds.y + trayBounds.height + 5);
    mainWindow.setPosition(x, y);
  }
  
  mainWindow.show();
  mainWindow.focus();
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 700,
    resizable: true,
    title: 'Timer Tracker Settings',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    parent: mainWindow || undefined
  });

  if (isDev) {
    settingsWindow.loadFile(path.join(__dirname, '../../dist/renderer/settings.html'));
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../../dist/renderer/settings.html'));
  }

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// IPC handlers
ipcMain.handle('get-calendars', async () => {
  return await googleCalendarService.getCalendars();
});

ipcMain.handle('start-auth', async () => {
  return await googleCalendarService.authenticate();
});

ipcMain.handle('get-all-timers', async () => {
  return timerService.getAllTimers();
});

ipcMain.handle('get-active-timers', async () => {
  return timerService.getActiveTimers();
});

ipcMain.handle('add-timer', async (event, name: string, calendarId: string) => {
  return timerService.addTimer(name, calendarId);
});

ipcMain.handle('save-timer', async (event, name: string, calendarId: string) => {
  return timerService.saveTimer(name, calendarId);
});

ipcMain.handle('delete-timer', async (event, name: string) => {
  return timerService.deleteTimer(name);
});

ipcMain.handle('start-stop-timer', async (event, name: string) => {
  return timerService.startStopTimer(name);
});

ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

ipcMain.handle('quit-app', () => {
  app.quit();
});

ipcMain.handle('open-dxt-file', async () => {
  const dxtContent = `{
  "name": "timer-tracker-mcp",
  "description": "MCP server for Timer Tracker integration with Claude Desktop",
  "version": "1.0.0",
  "type": "stdio",
  "command": "node",
  "args": ["${path.join(__dirname, 'mcp-server.js')}"],
  "capabilities": {
    "tools": true,
    "prompts": true
  }
}`;

  const result = await dialog.showSaveDialog({
    title: 'Save Timer Tracker MCP Configuration',
    defaultPath: 'timer-tracker-mcp.dxt',
    filters: [
      { name: 'Desktop Extension Files', extensions: ['dxt'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, dxtContent);
    shell.openExternal(`file://${result.filePath}`);
  }
});

// Data change notifications
ipcMain.on('notify-data-changed', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('data-changed');
  }
});

ipcMain.on('notify-calendar-change', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('data-changed');
  }
});

// App lifecycle
app.whenReady().then(() => {
  try {
    // Configure as menu bar app on all platforms
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
    
    // Completely remove menu on all platforms
    Menu.setApplicationMenu(null);
    
    createTray();
    
    // Initialize services
    timerService.initialize();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Show error dialog to user
    dialog.showErrorBox(
      'App Initialization Error', 
      `Timer Tracker failed to start properly.\n\nError: ${errorMessage}\n\nThe app will now close.`
    );
    
    // Exit the app
    app.quit();
    process.exit(1);
  }
}).catch((error) => {
  console.error('App failed to become ready:', error);
  
  // Show error dialog to user  
  dialog.showErrorBox(
    'Startup Error', 
    `Timer Tracker failed to start.\n\nError: ${error.message}\n\nPlease reinstall the application.`
  );
  
  // Exit the app
  app.quit();
  process.exit(1);
});

app.on('window-all-closed', (e: any) => {
  e.preventDefault(); // Prevent app from quitting
});

app.on('before-quit', () => {
  // Clean up
  timerService.cleanup();
});

// Security
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
});