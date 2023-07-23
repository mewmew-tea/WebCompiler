// index.js：レンダラプロセス。HTMLによるGUIの表示を制御する。
// おもに描画や、ボタンクリックなどのイベントを受け取りをする。
// つまり、やってることはブラウザのJavaScriptとだいたい同じ。
// ダイアログ表示やファイル操作をしたい場合は、メインプロセスにイベントを送信する。(main.jsのipcMain.on()などで定義)

// monaco-editor（コードエディタ）の読み込み＆表示
var editor;


function uriFromPath(_path) {
    const path = require('path');
    var pathName = path.resolve(_path).replace(/\\/g, '/');
    if (pathName.length > 0 && pathName.charAt(0) !== '/') {
        pathName = '/' + pathName;
    }
    console.log(pathName);
    return encodeURI('file://' + pathName);
}
// ※無名関数を即時実行して、変数名被りを防ぐ（C++でスコープ使うのと同じ目的）
(function () {
    // inspired by https://github.com/juanpahv/codexl
    const path = require('path');
    const amdLoader = require('../node_modules/monaco-editor/min/vs/loader.js');
    const amdRequire = amdLoader.require;
    amdRequire.config({
        baseUrl: uriFromPath(path.join(__dirname, '../node_modules/monaco-editor/min'))
    });
    self.module = undefined;
    amdRequire(['vs/editor/editor.main'], function () {
        editor = monaco.editor.create(document.getElementById('monaco-container'), {
            value: [
                '#include <iostream>\n\
using namespace std;\n\
\n\
int main()\n\
{\n\
    int a, b, c;\n\
    cin >> a >> b >> c;\n\
    \n\
    int sum = a + b + c;\n\
    cout << sum << endl;\n\
    return 0;\n\
}'
            ].join('\n'),
            language: 'cpp',
            // automaticLayout: true,
            theme: "vs-dark",
            fontSize: 16
        });
    });
})();

const { ipcRenderer } = require("electron");

/**
 * 一定時間停止する（非同期処理）
 * @param {*} ms 停止する時間（ミリ秒）
 * @returns Promiseオブジェクト
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Jsonファイルを読み込む
 * @param {*} jsonPath 読み込みJsonファイルのパス
 * @returns 読み込み結果
 */
function loadJson(jsonPath)
{
    const fs = require('fs');
    const json = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(json);
}

/**
 * 問題をロードする
 * @param {*} filePath 問題zipファイルのパス
 */
async function loadProblem(filePath)
{
    const fsPromises = require('fs').promises;
    const JSZip = require('jszip');

    console.log('zip読み込み');
    const buffer = await fsPromises.readFile(filePath);
    const jsZip = await JSZip.loadAsync(buffer);
    
    // 問題情報jsonファイル取得
    const jsonEntry = jsZip.file('problemInfo.json');
    console.log(jsonEntry.name);
    const jsonText = await jsonEntry.async('text');
    // JSON文字列をパースしてオブジェクトに変換
    const jsonObject = JSON.parse(jsonText);
    testCases = jsonObject.testCases;
    
    // 問題pdfファイル取得
    pdfEntry = jsZip.file('problem.pdf');
    pdfData = await pdfEntry.async('arraybuffer');
    
    console.log('zip読み込みおわり');

    // const path = require('path');
    // const json = loadJson('./problemInfo.json');
    // testCases = json.testCases;
    
    // const pathName = path.join(__dirname,'../problem.pdf');
    // showPdf(pathName);

    initTestCasesView();

    showPdfBlob(pdfData);

    currentProblemFilePath = filePath;

    // コンパイルボタン有効化
    document.getElementById('buttonCompile').disabled = false;
}

/**
 * テストケース表示を初期化する
 */
function initTestCasesView()
{
    document.getElementById('tests-count').innerText = 
        `正解数: - / ${testCases.length}`;
        
    // 以前のテストケース結果を削除
    const outputsContainer = document.getElementById('outputs-container');
    while (outputsContainer.firstChild) {
        outputsContainer.removeChild(outputsContainer.firstChild);
    }
}

var testCases;
var pdfData;
var currentProblemFilePath;

/**
 * コンパイル・実行ボタンのコールバック
 */
document.getElementById('buttonCompile').addEventListener('click', async (e) => {
    
    if (testCases == null || testCases.length == 0)
    {
        return;
    }
    
    // ボタンを無効化
    buttonCompile.disabled = true;
    buttonCompile.innerText = '実行中…';
    document.getElementById('select-problem-button').disabled = true;
    document.getElementById('select-json-button').disabled = true;

    // 実行
    switch (compilerService)
    {
        case 'Wandbox':
            await runWithWandbox();
            break;
        case 'Paiza.IO':
            await runWithPaizaIO();
            break;
    }

    // ボタンを有効化
    buttonCompile.disabled = false;
    buttonCompile.innerText = 'コンパイル・実行';
    document.getElementById('select-problem-button').disabled = false;
    document.getElementById('select-json-button').disabled = false;
});

/**
 * コンパイル・実行（Paiza.IO）
 */
async function runWithPaizaIO() {
    // 出力結果を表示するコンテナ
    const outputsContainer = document.getElementById('outputs-container');

    initTestCasesView();

    var currentCaseCnt = 1;
    var collectCasesCnt = 0;
    for (const testCase of testCases) {
        var id;     // コンパイル・実行のリクエストID
        const input = testCase.input;   // 標準入力
        const except = testCase.except; // 期待する標準出力

        //-----------------------------
        // コンパイル・実行のリクエスト
        //-----------------------------
        // ※無名関数を即時実行して、変数名被りを防ぐ（C++でスコープ使うのと同じ目的）
        await (async () => {
            const url = 'http://api.paiza.io/runners/create';

            console.log(editor.getModel().getValue());

            const data = {
                'source_code': editor.getModel().getValue(),
                'language': 'cpp',
                'input': input,
                'api_key': 'guest',
            };

            // コンパイル・実行
            // ソースコードやコマンドライン引数などの情報を送信
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            // if (response.ok) {
            //     console.log("正常です");
            // }
            const responseData = await response.json();
            id = responseData.id;
            console.log(id);
        })();


        await sleep(3000); // 3秒待つ

        //-----------------------------
        // コンパイル・実行結果の取得
        //-----------------------------
        // ※無名関数を即時実行して、変数名被りを防ぐ（C++でスコープ使うのと同じ目的）
        await (async () => {
            const url = `http://api.paiza.io/runners/get_details?id=${id}&api_key=guest`;

            // 出力結果をHTTP通信（GET）で取得
            const response = await fetch(url);
            const responseData = await response.json();
            console.log(responseData);
            console.log(responseData.stdout);

            var buildErrorMsg = responseData.build_stderr;

            var isCollect = responseData.build_result == 'success' && responseData.stdout == except;

            if (isCollect) {
                collectCasesCnt++;
            }

            // 出力結果を表示

            var successColor = '#5cc991';
            var failColor = '#f88070';

            const outputElement = document.createElement('div');
            outputElement.style.border = `solid 4px ${isCollect ? successColor : failColor}`;
            outputElement.innerText =
                `【テストケース${currentCaseCnt}】${isCollect ? '正解！' : '不正解…'}
（ビルド結果: ${responseData.build_result} ${buildErrorMsg} ）
標準入力: ${input}
標準出力: ${responseData.stdout}
期待する出力: ${except}`;

            outputsContainer.appendChild(outputElement);

            currentCaseCnt++;
        })();
    }

    var isCollectAll = collectCasesCnt >= currentCaseCnt - 1;
    document.getElementById('tests-count').innerHTML = `正解数: ${collectCasesCnt} / ${currentCaseCnt - 1} ・・・ ${
        isCollectAll ? '<b><font color=#20c36f>合格！</font></b>' : '<b><font color=#e9604d>不合格…</font></b>'}`;    
}

/**
 * コンパイル・実行（Wandbox）
 */
async function runWithWandbox() {
    // 出力結果を表示するコンテナ
    const outputsContainer = document.getElementById('outputs-container');

    initTestCasesView();

    var currentCaseCnt = 1;
    var collectCasesCnt = 0;
    for (const testCase of testCases) 
    {
        var id;     // コンパイル・実行のリクエストID
        const input = testCase.input;   // 標準入力
        const except = testCase.except; // 期待する標準出力

        //-----------------------------
        // コンパイル・実行のリクエスト
        //-----------------------------
        // ※無名関数を即時実行して、変数名被りを防ぐ（C++でスコープ使うのと同じ目的）
        await (async () => {
            const url = 'https://wandbox.org/api/compile.json';

            console.log(editor.getModel().getValue());

            const data = {
                'code': editor.getModel().getValue(),
                'compiler': 'gcc-head',
                'options': '-std=gnu++2b',
                'stdin': input,
            };

            // コンパイル・実行
            // ソースコードやコマンドライン引数などの情報を送信
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            // if (response.ok) {
            //     console.log("正常です");
            // }
            const responseData = await response.json();

            var buildErrorMsg = responseData.compiler_error;

            var successBuild = responseData.status == '0';

            var isCollect = successBuild && responseData.program_output == except;

            if (isCollect) {
                collectCasesCnt++;
            }

            var successColor = '#5cc991';
            var failColor = '#f88070';

            // 出力結果を表示
            const outputElement = document.createElement('div');
            outputElement.style.border = `solid 4px ${isCollect ? successColor : failColor}`;
            outputElement.innerText =
                `【テストケース${currentCaseCnt}】${isCollect ? '正解！' : '不正解…'}
（${successBuild ? 'ビルド成功' :  'ビルド失敗'}:  ${buildErrorMsg} ）
標準入力: ${input}
標準出力: ${responseData.program_output}
期待する出力: ${except}`;

            outputsContainer.appendChild(outputElement);

            currentCaseCnt++;
        })();
    }
    
    var isCollectAll = collectCasesCnt >= currentCaseCnt - 1;
    document.getElementById('tests-count').innerHTML = `正解数: ${collectCasesCnt} / ${currentCaseCnt - 1} ・・・ ${
        isCollectAll ? '<b><font color=#20c36f>合格！</font></b>' : '<b><font color=#e9604d>不合格…</font></b>'}`;    
}

/**
 * PDF読み込みボタン
 * ボタン押す（select-pdf-buttonのclickイベント発火）
 *  -> show-open-pdf-dialogイベント発火（main.jsのipcMain.on('show-open-pdf-dialog')が実行）
 *  -> pdf-selectedイベント発火（ipcRenderer.on('pdf-selected'...)が実行）
 *  -> showPdf関数実行
 */
document.getElementById('select-pdf-button').addEventListener('click', async (e) => {
    ipcRenderer.send('show-open-pdf-dialog');
});

/**
 * メインプロセスからのPDFパス受信
 */
ipcRenderer.on('pdf-selected', (event, pdfPath) => {
    // 新しいPDFを表示
    showPdf(pdfPath);
});

/**
 * PDF表示
 * @param {*} pdfPath 表示するPDFのパス
 */
function showPdf(pdfPath) {
    // 以前のPDFを削除
    const pdfContainer = document.getElementById('pdf-container');
    while (pdfContainer.firstChild) {
        pdfContainer.removeChild(pdfContainer.firstChild);
    }
        console.log(pdfPath);
        // 新たにiframe要素を作成、表示する
    const iframe = document.createElement('iframe');
    iframe.src = `file://${pdfPath}#view=FitH&toolbar=0&navpanes=0`;
    iframe.width = '100%';
    iframe.height = '900px';
    iframe.border = 'none';
    iframe.style.border = 'none';

    pdfContainer.appendChild(iframe);
}

/**
 * PDFをバイナリから読み込んで表示
 * @param {*} pdfData PDFのバイナリデータ
 */
function showPdfBlob(pdfData) {
    // 以前のPDFを削除
    const pdfContainer = document.getElementById('pdf-container');
    while (pdfContainer.firstChild) {
        pdfContainer.removeChild(pdfContainer.firstChild);
    }
    
    // 新たにiframe要素を作成、表示する
    const iframe = document.createElement('iframe');
    iframe.src = `${URL.createObjectURL(new Blob([pdfData], { type: 'application/pdf' }))}#view=FitH&toolbar=0&navpanes=0`;
    iframe.width = '100%';
    iframe.height = '800px';
    iframe.border = 'none';
    iframe.style.border = 'none';

    pdfContainer.appendChild(iframe);
}

/**
 * 問題zip読み込みボタン
 */
document.getElementById('select-problem-button').addEventListener('click', async (e) => {
    ipcRenderer.send('show-open-problem-dialog');
});

/**
 * メインプロセスからの問題zipパス受信
 */
ipcRenderer.on('problem-selected', async (event, zipPath) => {
    await loadProblem(zipPath);
});


/**
 * json読み込みボタン
 */
document.getElementById('select-json-button').addEventListener('click', async (e) => {
    ipcRenderer.send('show-open-json-dialog');
});

/**
 * メインプロセスからのjsonパス受信
 */
ipcRenderer.on('json-selected', async (event, jsonPath) => {
    var json = loadJson(jsonPath);
    if (json == null || json.testCases == null || json.testCases.length == 0)
    {
        return;
    }
    testCases = json.testCases;
    initTestCasesView();
    
    // コンパイルボタン有効化
    document.getElementById('buttonCompile').disabled = false;
});



/**
 * selectで選択したコンパイラに応じてコンパイラ切り替え
*/
var compilerService = 'Wandbox';
document.getElementById('compilerServiceSelect').addEventListener('change', async (e) => {
    compilerService = e.target.value;
});

