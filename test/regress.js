// src-tree の回帰テスト。試験用のプロジェクトを読み込んで決まった操作をし、画面とコピーの中身を記録して expected.json と比べる。
// 長い文字（コピーの中身など）は、長さ・先頭・ハッシュだけを記録する。
(async () => {
  // src-tree は DOMContentLoaded のあとで画面を作るので、それを待つ
  if (document.readyState === 'loading') await new Promise(f => document.addEventListener('DOMContentLoaded', f));
  await new Promise(f => setTimeout(f, 0));
  const root = document.querySelector('.src-tree-tool');
  const q = s => root.querySelector(s);
  const qa = s => [...root.querySelectorAll(s)];
  const wait = ms => new Promise(f => setTimeout(f, ms));
  const log = document.querySelector('.log');
  const result = document.querySelector('.result');

  // FNV-1a（32bit）
  const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
  const long = s => ({ len: s.length, head: s.slice(0, 120), hash: hash(s) });

  const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
  const setFind = async v => { q('.st-find-input').value = v; fire(q('.st-find-input'), 'input'); await wait(350); };
  const setMode = m => { q('.st-find-mode').value = m; fire(q('.st-find-mode'), 'change'); };
  const toggle = async sel => { q(sel).click(); await wait(50); };
  const preview = () => q('.st-preview').value;
  // 「コピー」ボタンを押して、下の欄に出た中身を返す（クリップボードに書けなくても、下の欄には出る）
  const copyOf = async btn => { btn.click(); await wait(100); return preview(); };

  // 画面の状態
  const snap = () => ({
    status: q('.st-status').textContent,
    folder: q('.st-folder').hidden ? null : q('.st-folder').innerText,
    summary: q('.st-summary').textContent,
    findCount: q('.st-find-count').textContent,
    selectAll: q('.st-select-all').textContent,
    selected: q('.st-selected').textContent,
    parts: qa('.st-parts button').map(b => b.textContent),
    copySelectedHidden: q('.st-copy-selected').hidden,
    warn: q('.st-warn').hidden ? null : q('.st-warn').textContent,
    files: qa('.st-file').map(li => li.innerText.replace(/\s+/g, ' ').trim()),
    empty: q('.st-tree .st-empty') ? q('.st-tree .st-empty').textContent : null,
    hits: q('.st-hits').hidden ? null : { summary: q('.st-hits-summary').textContent, lines: qa('.st-hit-line').length, first: (q('.st-hit-line') || {}).innerHTML || '' },
    buttons: ['.st-reload', '.st-clear', '.st-copy-tree', '.st-select-all', '.st-copy-selected', '.st-copy-current', '.st-find-clear']
      .map(s => s + (q(s).hidden ? ':hidden' : '') + (q(s).disabled ? ':disabled' : '')).join(' '),
  });

  const out = {};
  try {
    // 読み込み（.git などの外すフォルダや、.class も含めて渡す）
    const files = window.SAMPLE_FILES.map((f, i) => ({
      path: f.path,
      bytes: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)),
      lastModified: Date.UTC(2026, 9, 5, 5, 20) - i * 60000,
    }));
    out.before = snap();
    await root.srcTreeLoad('sample-project', files);
    out.loaded = snap();
    out.treeText = await copyOf(q('.st-copy-tree'));

    // フォルダを閉じる → tree のコピーに反映される
    q('.st-dir[data-dir="WebContent/WEB-INF"] .st-toggle, .st-dir[data-dir="WebContent"] .st-toggle').click();
    out.treeCollapsed = await copyOf(q('.st-copy-tree'));
    await toggle('.st-collapse');
    out.treeAllCollapsed = await copyOf(q('.st-copy-tree'));
    await toggle('.st-expand');

    // ファイル名を押す → 下に中身
    qa('.st-file').find(li => li.dataset.path.endsWith('DateUtil.java')).querySelector('.st-name').click();
    out.showFile = { preview: long(preview()), name: q('.st-current-name').textContent };
    out.copyCurrent = long(await copyOf(q('.st-copy-current')));

    // すべて選ぶ → 分けてコピー
    await toggle('.st-select-all');
    out.selectAll = snap();
    out.partTexts = [];
    for (const b of qa('.st-parts button')) out.partTexts.push(long(await copyOf(b)));
    // 上限を変える
    q('.st-part-lines').value = '1000'; fire(q('.st-part-lines'), 'change');
    out.limit1000 = snap();
    q('.st-part-lines').value = '2500'; fire(q('.st-part-lines'), 'change');
    // 少しだけ選ぶ → 1回でコピー
    await toggle('.st-select-none');
    qa('.st-file input[data-file]').slice(0, 3).forEach(cb => cb.click());
    out.select3 = snap();
    out.copySelected = long(await copyOf(q('.st-copy-selected')));
    // フォルダのチェック
    q('input[data-dir="src/com/example/order/batch"]').click();
    out.dirCheck = snap();
    await toggle('.st-select-none');

    // ファイル名で探す
    out.find = {};
    for (const t of ['dao', '*Action.java', 'order batch', 'WEB-INF/', 'xyz', 'D?teUtil.java', '*Batch*']) { await setFind(t); out.find[t] = snap(); }
    await setFind('dao');
    out.findHtml = q('.st-tree .st-name mark') ? q('.st-tree .st-name mark').outerHTML : null;
    out.findTreeText = await copyOf(q('.st-copy-tree'));
    await toggle('.st-select-all');
    await setFind('batch');
    out.findHiddenSel = snap();
    q('.st-find-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    out.findEsc = snap();
    await toggle('.st-select-none');

    // 中身で探す（grep）
    setMode('grep');
    out.grep = {};
    for (const t of ['受注', 'order', '令和', 'zzzz', '(']) { await setFind(t); out.grep[t] = snap(); }
    await toggle('.st-grep-case'); await setFind('order'); out.grep['order/case'] = snap(); await toggle('.st-grep-case');
    await toggle('.st-grep-re');
    await setFind('class \\w+ extends'); out.grep['re:class'] = snap();
    await setFind('('); out.grep['re:('] = snap();
    await toggle('.st-grep-re');
    await setFind('令和');
    q('.st-hit-line').click();
    const pv = q('.st-preview');
    out.grepJump = { sel: pv.value.slice(pv.selectionStart, pv.selectionEnd), name: q('.st-current-name').textContent };
    out.grepText = await copyOf(q('.st-copy-grep'));
    out.grepTreeText = await copyOf(q('.st-copy-tree'));
    await setFind('');
    setMode('name');
    out.grepOff = snap();

    // 設定を変える
    q('.st-exclude').value = q('.st-exclude').value.replace('bin, ', ''); fire(q('.st-exclude'), 'change'); await wait(300);
    out.excludeNoBin = snap();
    q('.st-exclude').value = '.git, .svn, bin, build, classes, target, out, .settings, .metadata, .idea, node_modules'; fire(q('.st-exclude'), 'change'); await wait(300);
    q('.st-exts input[value="txt"]').click(); await wait(300);
    out.extTxt = snap();
    q('.st-exts input[value="txt"]').click(); await wait(300);
    q('.st-enc').value = 'utf-8'; fire(q('.st-enc'), 'change'); await wait(300);
    out.encUtf8 = snap();
    q('.st-enc').value = 'auto'; fire(q('.st-enc'), 'change'); await wait(300);
    await toggle('.st-merge');
    out.noMerge = await copyOf(q('.st-copy-tree'));
    await toggle('.st-merge');
    await toggle('.st-show-lines');
    out.noLines = await copyOf(q('.st-copy-tree'));
    await toggle('.st-show-lines');

    // クリア
    await toggle('.st-clear');
    out.cleared = { ...snap(), preview: preview(), findValue: q('.st-find-input').value, findDisabled: q('.st-find-input').disabled };
  } catch (e) {
    out.error = String(e && e.stack || e);
  }

  // 長い文字は要約する
  for (const k of ['treeText', 'treeCollapsed', 'treeAllCollapsed', 'findTreeText', 'grepText', 'grepTreeText', 'noMerge', 'noLines']) if (typeof out[k] === 'string') out[k] = out[k].length > 600 ? long(out[k]) : out[k];

  const json = JSON.stringify(out, null, 2);
  if (location.search.includes('update')) {
    result.textContent = '記録しました。下の JSON を test/expected.json に保存してください。';
    log.textContent = json;
    window.REGRESS = { out };
    return;
  }
  let expected;
  try { expected = await (await fetch('expected.json', { cache: 'reload' })).json(); }
  catch (e) { result.textContent = 'expected.json を読めませんでした。?update を付けて開き、作ってください。'; result.className = 'result ng'; return; }

  // 違うところを並べる
  const diffs = [];
  const walk = (a, b, path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], path + '.' + k);
    } else diffs.push(`${path}\n  期待：${JSON.stringify(a)}\n  結果：${JSON.stringify(b)}`);
  };
  walk(expected, out, '');
  const n = Object.keys(expected).length;
  result.textContent = diffs.length ? `NG：${diffs.length} か所が違います` : `OK：${n} 項目すべて同じです`;
  result.className = 'result ' + (diffs.length ? 'ng' : 'ok');
  log.textContent = diffs.join('\n\n') || json;
  window.REGRESS = { out, diffs };
})();
