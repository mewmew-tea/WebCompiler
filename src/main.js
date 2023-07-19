// main.js：メインプロセス。おもにOS側の機能を利用する処理を行う。
// ipcMainなどを通じて、ウィンドウの作成や、ダイアログ表示、ファイルの読み書きなどを行う。
// レンダラープロセスからのイベントを受け取り、OS側の機能を利用して処理を行うこともある。

const { app, BrowserWindow } = require('electron');
const { ipcMain, dialog } = require("electron");
let mainWindow;

ipcMain.handle("showDialog", async (e, message) => {
	dialog.showMessageBox(mainWindow, { message });
});

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1900,
		height: 1080,
		center: true,
		webPreferences: {
			nodeIntegration: true,
			worldSafeExecuteJavaScript: true,
			enableRemoteModule: true,
			contextIsolation: false,
			webSecurity: false
		}
	});
	mainWindow.loadURL(`file://${__dirname}/index.html`);
	// mainWindow.webContents.openDevTools();
	mainWindow.on('closed', function () {
		mainWindow = null;
	});
}


// PDF選択ダイアログの表示イベントの登録
ipcMain.on('show-open-pdf-dialog', (event, arg) => {
	dialog.showOpenDialog(mainWindow, {
		properties: ['openFile'],
		filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
	})
		.then((result) => {
			if (!result.canceled) {
				const pdfPath = result.filePaths[0];

				console.log(pdfPath);

				// レンダラープロセスにパスを送信
				mainWindow.webContents.send('pdf-selected', pdfPath);
			}
		});
});

// zip選択ダイアログの表示イベントの登録
ipcMain.on('show-open-problem-dialog', (event, arg) => {
	dialog.showOpenDialog(mainWindow, {
		properties: ['openFile'],
		filters: [{ name: 'Problem zip Files', extensions: ['zip'] }],
	})
		.then((result) => {
			if (!result.canceled) {
				const zipPath = result.filePaths[0];

				console.log(zipPath);

				// レンダラープロセスにパスを送信
				mainWindow.webContents.send('problem-selected', zipPath);
			}
		});
});

// json選択ダイアログの表示イベントの登録
ipcMain.on('show-open-json-dialog', (event, arg) => {
	dialog.showOpenDialog(mainWindow, {
		properties: ['openFile'],
		filters: [{ name: 'Problem json Files', extensions: ['json'] }],
	})
		.then((result) => {
			if (!result.canceled) {
				const jsonPath = result.filePaths[0];

				console.log(jsonPath);

				// レンダラープロセスにパスを送信
				mainWindow.webContents.send('json-selected', jsonPath);
			}
		});
});

app.on('ready', createWindow);

app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', function () {
	if (mainWindow === null) {
		createWindow();
	}
});

