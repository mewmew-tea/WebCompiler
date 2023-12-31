
# Electronについて、今後このソースを触る人向けのメモ
Electronは、メインプロセス(main.js)とレンダラプロセス(index.html/js)の２つのプロセスで構成されている。  

レンダラプロセス(index.js)では、ダイアログ表示やファイル操作はできない。  
メインプロセス(main.js)で行う必要がある。  

メインプロセスに処理を依頼するには、メインプロセスに対してイベントを送信すればよい。（ipcRenderer.send）

さらにその続きの処理をレンダラプロセス(index.js)で行いたければ、今度は逆にレンダラプロセスに対してイベントを送信すればよい。  
（mainWindow.webContents.send）  


## 例：pdf読み込みボタンでの処理の流れ

※矢印の箇所でイベントが送信されてます。  

html上のボタンクリック。  
自動的にクリックイベントが送信。  

↓

【レンダラプロセス(index.js)】  
クリックイベントを受け取り。  

> **Note**  
> ※事前にdocument.getElementById("pdf-load-button").addEventListener("click", () => { ... });で登録しておいたイベントが呼び出される。  

メインプロセス(main.js)にpdf選択ダイアログ表示イベントを送信。  

↓  

【メインプロセス(main.js)】  
pdf選択ダイアログ表示イベントを受け取り。  
> **Note**  
>  ※事前にipcMain.on('show-open-pdf-dialog', (event, arg) => { ... });で登録しておいたイベントが呼び出される。  

ファイル選択ダイアログを表示する。  
ユーザーによってファイルが選択されたら、ファイルパスとともに、レンダラプロセス(index.js)にイベント送信。  

↓  

【レンダラプロセス(index.js)】  
選択されたファイルパスとともにイベントを受け取り。  

> **Note**  
> ※事前にipcRenderer.on('pdf-selected', (event, arg) => { ... });で登録しておいたイベントが呼び出される。  

ファイルパスを元に、pdfを読み込み処理。  
