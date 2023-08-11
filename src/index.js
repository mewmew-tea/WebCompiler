// index.js：レンダラプロセス。
// おもにHTMLページのGUIの描画や、ボタンクリックなどのイベントを受け取りをする。

const { ipcRenderer } = require("electron");

//===================================================
// コードエディタ
//===================================================

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

/**
 * パスからURIを生成する
 * @param {*} _path 
 * @returns 
 */
function uriFromPath(_path) {
    const path = require('path');
    var pathName = path.resolve(_path).replace(/\\/g, '/');
    if (pathName.length > 0 && pathName.charAt(0) !== '/') {
        pathName = '/' + pathName;
    }
    console.log(pathName);
    return encodeURI('file://' + pathName);
}

/**
 * エディタの作成。初期化処理。
 * ※無名関数を即時実行している。これにより変数名被りを防ぐ（C++でスコープ使うのと同じ目的）
*/
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

/**
 * エディタにコードをセットする
 * @param {*} code セットするコード
 */
function setCodeToEditor(code) {
    editor.getModel().setValue(code);
}

//===================================================
// タイマー
//===================================================


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

//===================================================
// 問題情報などの読み込み
//===================================================

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
 * 問題情報を読み込む
 * @param {*} jsonData jsonデータ
 */
function readProblemInfoData(jsonData)
{
    if (jsonData == null || jsonData.testCases == null || jsonData.testCases.length == 0)
    {
        return false;
    }

    testCases = jsonData.testCases;
    // 誤差許容
    if (jsonData.errorMargin != null)
    {
        errorMargin = jsonData.errorMargin;
        isEnableErrorMargin = true;
    }
    else
    {
        errorMargin = 0.0;
        isEnableErrorMargin = false;
    }

    return true;
}

/**
 * 問題をロードする
 * @param {*} filePath 問題ファイルのパス
 */
async function loadProblem(filePath)
{
    try {
        // zipファイルを読み込む
        const fsPromises = require('fs').promises;
        const JSZip = require('jszip');

        const buffer = await fsPromises.readFile(filePath);
        const jsZip = await JSZip.loadAsync(buffer);
        
        // 問題情報jsonファイル取得
        const jsonEntry = jsZip.file('problemInfo.json');
        console.log(jsonEntry.name);
        // jsonファイルをテキストとして読み込み＆パース
        const jsonText = await jsonEntry.async('text');
        const jsonObject = JSON.parse(jsonText);
        // 読み込み
        if (readProblemInfoData(jsonObject) == false)
        {
            return false;
        }
        
        // 問題pdfファイル取得
        pdfEntry = jsZip.file('problem.pdf');
        pdfData = await pdfEntry.async('arraybuffer');
        console.log('prob読み込みおわり');
        showPdfBlob(pdfData);
        
        // テストケース表示を初期化
        initTestCasesView();

        // タイマー開始
        resetTimer();
        startTimer();

        // コードを初期化
        setCodeToEditor(initialCode);

        currentProblemFilePath = filePath;

        // コンパイルボタン有効化
        document.getElementById('buttonCompile').disabled = false;
    } catch(e) {
        console.log(e.message)
        return false;
    }

    return true;
}

//===================================================
// テストケースや結果の表示
//===================================================

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
 * 実行結果から正解/不正解判定を行う
 * @param {*} successBuild コンパイル成功したか
 * @param {*} expect 期待する出力
 * @param {*} stdout 標準出力
 * @returns 
 */
function judgeResult(successBuild, expect, stdout)
{
    if (isEnableErrorMargin)
    {
        // スペース区切りで分割、すべての要素を数値に変換
        const actual = stdout.split(' ').map(Number);
        const expected = expect.split(' ').map(Number);
        
        // 誤差を許容して、期待する出力と一致するか判定。誤差は+-で許容する。
        return successBuild && actual.every((v, i) => Math.abs(v - expected[i]) <= errorMargin);
    }
    else
    {
        return successBuild && stdout === expect;
    }
}

/**
 * コンパイルや実行などの結果を表示する
 * @param {*} results 
 */
function showResults(results)
{
    // 出力結果を表示
    const outputsContainer = document.getElementById('outputs-container');
    let index = 1;
    let collectCasesCnt = 0;
    // テストケースごとに結果のHTML要素を作成
    for (const result of results)
    {
        const outputElement = document.createElement('div');
        // 成否によって枠の色を変える
        outputElement.style.border = `solid 4px ${result.isCollect ? '#5cc991' : '#f88070'}`;
        // テストケースごとの結果
        outputElement.innerText =
`【テストケース${index}】${result.isCollect ? '正解！' : '不正解…'} 
（ビルド結果: ${result.successBuild ? '成功' : '失敗'}: ${result.buildErrorMsg} ）
# 標準入力
${result.stdin}
# 標準出力
${result.stdout}
# 期待する出力
${result.expect}
# 標準エラー出力
${result.stderr}`;

        outputsContainer.appendChild(outputElement);

        if (result.isCollect) {
            collectCasesCnt++;
        }
        index++;
    }

    // 正答数と正答数を表示
    var isCollectAll = collectCasesCnt >= testCases.length;
    document.getElementById('tests-count').innerHTML = `正解数: ${collectCasesCnt} / ${testCases.length} ・・・ ${
        isCollectAll ? '<b><font color=#20c36f>合格！</font></b>' : '<b><font color=#e9604d>不合格…</font></b>'}`;    
}

//===================================================
// コンパイル・実行処理（テストケース実行を含む）
//===================================================

// コンパイル・実行をするサービス
var compilerService = 'Wandbox';

/**
 * コンパイル・実行（Paiza.IO）
 */
async function runWithPaizaIO() {
    // テストケース表示を初期化
    initTestCasesView();
    
    // テストケースを並列して実行して、その結果をresultに格納する
    const results = await Promise.all(testCases.map(async (testCase) => {
        const input = testCase.input;
        const expect = testCase.expect;

        // 実行のリクエストをする
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

        // 実行結果を取得する前に少し待つ
        await sleep(3000);

        // 実行結果を取得する
        const detailsUrl = `http://api.paiza.io/runners/get_details?id=${id}&api_key=guest`;
        // リクエストを送信
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();

        var successBuild = detailsData.build_result === 'success';

        // 結果をオブジェクトとして返す（これでresultsのリストに格納される）
        return {
            isCollect: judgeResult(successBuild, expect, detailsData.stdout),
            successBuild: successBuild,
            buildErrorMsg: detailsData.build_stderr,
            expect: expect,
            stdin: input,
            stdout: detailsData.stdout,
            stderr: detailsData.stderr,
        }
    }));

    // 結果を表示
    showResults(results);
}

/**
 * コンパイル・実行（Wandbox）
 * APIリファレンス：https://github.com/melpon/wandbox/blob/master/kennel/API.md
 * 型情報：https://github.com/melpon/wandbox/blob/master/proto/kennel.proto
 * コンパイラ情報：https://wandbox.org/api/list.json
 */
async function runWithWandbox() {
    // テストケース表示を初期化
    initTestCasesView();
    
    // テストケースを並列して実行して、その結果をresultに格納する
    const results = await Promise.all(testCases.map(async (testCase) => {
        const input = testCase.input;
        const expect = testCase.expect;
        
        // コンパイル・実行
        const url = 'https://wandbox.org/api/compile.json';
        const data = {
            'code': editor.getModel().getValue(),
            'compiler': 'gcc-head',
            'options': '-std=c++20',    // C++20、GNU拡張なし。
                                        // バージョン変えたければ、ここを変えればよい。
                                        // 例：C++23なら、-std=c++23。（詳細：https://gcc.gnu.org/onlinedocs/gcc/C-Dialect-Options.html）
                                        // GNU拡張（例：-std=gnu++23）は、C++で出来るはずのない書き方出来て学習の妨げになるので使わない。
            'stdin': input,
        };

        // ソースコードやコマンドライン引数などの情報を送信
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const responseData = await response.json();

        var successBuild = responseData.status == '0';

        // 結果をオブジェクトとして返す（これでresultsのリストに格納される）
        return {
            isCollect: judgeResult(successBuild, expect, responseData.program_output),
            successBuild: successBuild,
            buildErrorMsg: responseData.compiler_error,
            expect: expect,
            stdin: input,
            stdout: responseData.program_output,
            stderr: responseData.program_error,
        }
    }));

    // 結果を表示
    showResults(results);
}

//===================================================
// pdfファイル表示
//===================================================

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

//===================================================
// 各種コールバックのイベント登録
//===================================================

/**
 * PDF読み込みボタンのクリックイベント登録。html上のボタンを押したときに呼ばれる。
 */
document.getElementById('select-pdf-button').addEventListener('click', async (e) => {
    ipcRenderer.send('show-open-pdf-dialog');
});

/**
 * メインプロセスからのPDFパス受信のイベント登録
 */
ipcRenderer.on('pdf-selected', (event, pdfPath) => {
    // 新しいPDFを表示
    showPdf(pdfPath);
});

/**
 * 問題読み込みボタンイベント登録。html上のボタンを押したときに呼ばれる。
 */
document.getElementById('select-problem-button').addEventListener('click', async (e) => {
    ipcRenderer.send('show-open-problem-dialog');
});

/**
 * メインプロセスからの問題パス受信のイベント登録
 */
ipcRenderer.on('problem-selected', async (event, probPath) => {
    await loadProblem(probPath);
});


/**
 * json読み込みボタンのクリックイベント登録。html上のボタンを押したときに呼ばれる。
 */
document.getElementById('select-json-button').addEventListener('click', async (e) => {
    ipcRenderer.send('show-open-json-dialog');
});

/**
 * メインプロセスからのjsonパス受信のイベント登録
 */
ipcRenderer.on('json-selected', async (event, jsonPath) => {
    var json = loadJson(jsonPath);
    
    // 読み込み
    readProblemInfoData(json);
    initTestCasesView();
    
    // コンパイルボタン有効化
    document.getElementById('buttonCompile').disabled = false;
});


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
 * selectで選択したコンパイラに応じてコンパイラ切り替え
*/
document.getElementById('compilerServiceSelect').addEventListener('change', async (e) => {
    compilerService = e.target.value;
});

