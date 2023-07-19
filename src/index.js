// index.js：レンダラプロセス。HTMLによるGUIの表示を制御する。
// おもに描画や、ボタンクリックなどのイベントを受け取りをする。
// つまり、やってることはブラウザのJavaScriptとだいたい同じ。
// ダイアログ表示やファイル操作をしたい場合は、メインプロセスにイベントを送信する。(main.jsのipcMain.on()などで定義)

// monaco-editor（コードエディタ）の読み込み＆表示
var editor;
// ※無名関数を即時実行して、変数名被りを防ぐ（C++でスコープ使うのと同じ目的）
(function () {
    // inspired by https://github.com/juanpahv/codexl
    const path = require('path');
    const amdLoader = require('../node_modules/monaco-editor/min/vs/loader.js');
    const amdRequire = amdLoader.require;

    function uriFromPath(_path) {
        var pathName = path.resolve(_path).replace(/\\/g, '/');
        if (pathName.length > 0 && pathName.charAt(0) !== '/') {
            pathName = '/' + pathName;
        }
        console.log(pathName);
        return encodeURI('file://' + pathName);
    }
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
 * コンパイル・実行ボタンのコールバック
 */
document.getElementById('buttonCompile').addEventListener('click', async (e) => {
    // ボタンを無効化
    buttonCompile.disabled = true;

    const testCases = [['100 200 300', '600\n'],
    ['1 2 3', '6\n'],
    ['10 20 30', '60\n'],
    ['1000 2000 3000', '6000\n'],];

    var currentCaseCnt = 1;
    await testCases.forEach(async function (testCase) {

        var id;     // コンパイル・実行のリクエストID
        const input = testCase[0];    // 標準入力
        const except = testCase[1];           // 期待する標準出力
        // 以前のPDFを削除
        const outputsContainer = document.getElementById('outputs-container');
        while (outputsContainer.firstChild) {
            outputsContainer.removeChild(outputsContainer.firstChild);
        }

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

            // 出力結果を表示
            const outputElement = document.createElement('div');
            outputElement.style.border = 'solid 1px #ccc';
            outputElement.innerText =
                `【テストケース${currentCaseCnt}】${isCollect ? '正解！' : '不正解…'}
（ビルド結果: ${responseData.build_result} ${buildErrorMsg} ）
標準入力: ${input}
標準出力: ${responseData.stdout}
期待する出力: ${except}`;

            outputsContainer.appendChild(outputElement);
            
            currentCaseCnt++;
        })();

    });

    // ボタンを有効化
    buttonCompile.disabled = false;
});


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
    // 新たにiframe要素を作成、表示する
    const iframe = document.createElement('iframe');
    iframe.src = `file://${pdfPath}#view=FitH&toolbar=0&navpanes=0`;
    iframe.width = '100%';
    iframe.height = '900px';
    iframe.border = 'none';
    iframe.style.border = 'none';

    pdfContainer.appendChild(iframe);
}
