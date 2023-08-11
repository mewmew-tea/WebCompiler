// index.js：レンダラプロセス。HTMLによるGUIの表示を制御する。
// おもに描画や、ボタンクリックなどのイベントを受け取りをする。
// つまり、やってることはブラウザのJavaScriptとだいたい同じ。
// ダイアログ表示やファイル操作をしたい場合は、メインプロセスにイベントを送信する。(main.jsのipcMain.on()などで定義)

// monaco-editor（コードエディタ）の読み込み＆表示
// inspired by https://github.com/juanpahv/codexl
var editor;

var initialCode = 
`#include <iostream>
using namespace std;

int main() {
	cout << "Hello World!" << endl;
	return 0;
}`;
/*'#include <iostream>\n\
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
}'*/

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
    const path = require('path');
    const amdLoader = require('../node_modules/monaco-editor/min/vs/loader.js');
    const amdRequire = amdLoader.require;
    amdRequire.config({
        baseUrl: uriFromPath(path.join(__dirname, '../node_modules/monaco-editor/min'))
    });
    self.module = undefined;
    amdRequire(['vs/editor/editor.main'], function () {
        editor = monaco.editor.create(document.getElementById('monaco-container'), {
            value: initialCode,
            language: 'cpp',
            // automaticLayout: true,
            theme: "vs-dark",
            fontSize: 16
        });
    });
})();

function setCodeToEditor(code) {
    editor.getModel().setValue(code);
}

const { ipcRenderer } = require("electron");


let timerInterval;
let elapsedTime = 0;

/**
 * タイマーを開始する。
 */
function startTimer() {
  if (!timerInterval) {
    const startTime = Date.now() - elapsedTime;
    timerInterval = setInterval(updateTimer, 1000, startTime);
  }
}

/**
 * タイマーを停止する。
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * タイマーをリセットする。タイマーを停止して、経過時間を0にする。
 */
function resetTimer() {
  stopTimer();
  elapsedTime = 0;
  updateTimer(Date.now());
}

/**
 * タイマーを更新する。現在時間　-　開始時間　で経過時間を計算して表示する。
 * @param {*} startTime 開始時間
 */
function updateTimer(startTime) {
  const currentTime = Date.now();
  elapsedTime = currentTime - startTime;
  const formattedTime = formatTime(elapsedTime);
  document.getElementById("timer").textContent = formattedTime;
}

/**
 * 時間を文字列にフォーマットする
 * @param {*} timeInMillis ミリ秒
 * @returns フォーマットされた文字列
 */
function formatTime(timeInMillis) {
  const padZero = (num) => (num < 10 ? `0${num}` : num);
  const seconds = Math.floor(timeInMillis / 1000) % 60;
  const minutes = Math.floor(timeInMillis / 1000 / 60) % 60;
  const hours = Math.floor(timeInMillis / 1000 / 3600);
  return `経過時間  ${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}

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
 * @param {*} filePath 問題ファイルのパス
 */
async function loadProblem(filePath)
{
    const fsPromises = require('fs').promises;
    const JSZip = require('jszip');

    console.log('prob読み込み');
    const buffer = await fsPromises.readFile(filePath);
    const jsZip = await JSZip.loadAsync(buffer);
    
    // 問題情報jsonファイル取得
    const jsonEntry = jsZip.file('problemInfo.json');
    console.log(jsonEntry.name);
    const jsonText = await jsonEntry.async('text');
    // JSON文字列をパースしてオブジェクトに変換
    const jsonObject = JSON.parse(jsonText);
    testCases = jsonObject.testCases;
    // 誤差許容
    if (jsonObject.errorMargin != null)
    {
        errorMargin = jsonObject.errorMargin;
        isEnableErrorMargin = true;
    }
    else
    {
        errorMargin = 0.0;
        isEnableErrorMargin = false;
    }
    
    // 問題pdfファイル取得
    pdfEntry = jsZip.file('problem.pdf');
    pdfData = await pdfEntry.async('arraybuffer');
    
    console.log('prob読み込みおわり');

    // const path = require('path');
    // const json = loadJson('./problemInfo.json');
    // testCases = json.testCases;
    
    // const pathName = path.join(__dirname,'../problem.pdf');
    // showPdf(pathName);

    initTestCasesView();

    // タイマー開始
    resetTimer();
    startTimer();

    showPdfBlob(pdfData);

    currentProblemFilePath = filePath;

    // コードを初期化
    setCodeToEditor(initialCode);

    // コンパイルボタン有効化
    document.getElementById('buttonCompile').disabled = false;
}

var testCases;
var pdfData;
var currentProblemFilePath;

// 許容する誤差
let errorMargin = 0.0;
// 誤差許容を有効にするか
let isEnableErrorMargin = false;

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

    let currentCaseCnt = 1;
    let collectCasesCnt = 0;
    
    const detailsResponses = await Promise.all(testCases.map(async (testCase) => {
        const input = testCase.input;
        const expect = testCase.expect;

        const url = 'http://api.paiza.io/runners/create';
        const data = {
            'source_code': editor.getModel().getValue(),
            'language': 'cpp',
            'input': input,
            'api_key': 'guest',
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const responseData = await response.json();
        const id = responseData.id;

        await sleep(3000);

        const detailsUrl = `http://api.paiza.io/runners/get_details?id=${id}&api_key=guest`;

        // リクエストを送信
        const detailsResponse = await fetch(detailsUrl);
        return { response: detailsResponse, input, expect }; // オブジェクトを返す
    }));

    for (const details of detailsResponses) { // 各リクエストの結果を順番に処理
        const detailsResponse = details.response;
        const detailsData = await detailsResponse.json();
        const input = details.input;
        const expect = details.expect;

        const buildErrorMsg = detailsData.build_stderr;
        let isCollect = false;
        
        if (isEnableErrorMargin)
        {
            // スペース区切りで分割、すべての要素を数値に変換
            const actual = detailsData.stdout.split(' ').map(Number);
            const expected = expect.split(' ').map(Number);
            
            // 誤差を許容して、期待する出力と一致するか判定。誤差は+-で許容する。
            isCollect = detailsData.build_result === 'success' && actual.every((v, i) => Math.abs(v - expected[i]) <= errorMargin);
        }
        else
        {
            isCollect = detailsData.build_result === 'success' && detailsData.stdout === expect;
        }

        if (isCollect) {
            collectCasesCnt++;
        }

        const successColor = '#5cc991';
        const failColor = '#f88070';

        const outputElement = document.createElement('div');
        outputElement.style.border = `solid 4px ${isCollect ? successColor : failColor}`;
        outputElement.innerText =
`【テストケース${currentCaseCnt}】${isCollect ? '正解！' : '不正解…'} 
（ビルド結果: ${detailsData.build_result}: ${buildErrorMsg} ）
# 標準入力
${input}
# 標準出力
${detailsData.stdout}
# 期待する出力
${expect}`;

        outputsContainer.appendChild(outputElement);

        currentCaseCnt++;
    }

    var isCollectAll = collectCasesCnt >= currentCaseCnt - 1;
    document.getElementById('tests-count').innerHTML = `正解数: ${collectCasesCnt} / ${currentCaseCnt - 1} ・・・ ${
        isCollectAll ? '<b><font color=#20c36f>合格！</font></b>' : '<b><font color=#e9604d>不合格…</font></b>'}`;    
}

/**
 * コンパイル・実行（Wandbox）
 * APIリファレンス：https://github.com/melpon/wandbox/blob/master/kennel/API.md
 * 型情報：https://github.com/melpon/wandbox/blob/master/proto/kennel.proto
 * コンパイラ情報：https://wandbox.org/api/list.json
 */
async function runWithWandbox() {
    // 出力結果を表示するコンテナ
    const outputsContainer = document.getElementById('outputs-container');

    initTestCasesView();

    var currentCaseCnt = 1;
    var collectCasesCnt = 0;
    for (const testCase of testCases) 
    {
        const input = testCase.input;   // 標準入力
        const expect = testCase.expect; // 期待する標準出力

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
                'options': '-std=c++20',    // C++20、GNU拡張なし。
                                            // バージョン変えたければ、ここを変えればよい。
                                            // 例：C++23なら、-std=c++23。（詳細：https://gcc.gnu.org/onlinedocs/gcc/C-Dialect-Options.html）
                                            // GNU拡張（例：-std=gnu++23）は、C++で出来るはずのない書き方出来て学習の妨げになるので使わない。
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

            var isCollect = false;
        
            // 誤差許容
            if (isEnableErrorMargin)
            {
                // スペース区切りで分割、すべての要素を数値に変換
                const actual = responseData.program_output.split(' ').map(Number);
                const expected = expect.split(' ').map(Number);

                // 要素数が一致するか確認
                if (actual.length != expected.length)
                {
                    isCollect = false;
                }
                else
                {
                    // 誤差を許容して、期待する出力と一致するか判定。誤差は+-で許容する。
                    isCollect = successBuild && actual.every((v, i) => Math.abs(v - expected[i]) <= errorMargin);
                }
            }
            else
            {
                isCollect = successBuild && responseData.program_output == expect;
            }

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
# 標準入力
${input}
# 標準出力
${responseData.program_output}
# 期待する出力
${expect}`;

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
 * 問題読み込みボタン
 */
document.getElementById('select-problem-button').addEventListener('click', async (e) => {
    ipcRenderer.send('show-open-problem-dialog');
});

/**
 * メインプロセスからの問題パス受信
 */
ipcRenderer.on('problem-selected', async (event, probPath) => {
    await loadProblem(probPath);
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
    // 誤差許容
    // errorMarginがjosnにあるかどうか
    if (json.errorMargin != null)
    {
        errorMargin = json.errorMargin;
        isEnableErrorMargin = true;
    }
    else
    {
        errorMargin = 0.0;
        isEnableErrorMargin = false;
    }
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

