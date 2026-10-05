// src-tree：ローカルのプロジェクトのフォルダを選ぶと、解析に必要なファイルだけの tree を表示し、
// tree やソースを、チャット型 AI（Copilot など）に貼りやすい形でコピーする。
// 置き方：<div class="src-tree-tool"></div> のあとで src-tree.js を読み込む。画面の部品はこの JS が箱の中に作る。
// ファイルはブラウザの中で読むだけで、どこにも送らない。
(() => {
  // 初期設定
  const EXTS = ['java', 'jsp', 'xml', 'properties', 'sql', 'sh', 'bat', 'js', 'html', 'css', 'tld', 'xsl', 'gradle', 'txt'];
  const EXTS_ON = ['java', 'jsp', 'xml', 'properties', 'sql', 'sh', 'bat'];
  const EXCLUDE = '.git, .svn, bin, build, classes, target, out, .settings, .metadata, .idea, node_modules';
  const PART_LINES = 2500;            // 1回にコピーする行数の上限（Copilot は 3000 行くらいまで貼れた）
  const MAX_BYTES = 2 * 1024 * 1024;  // これより大きいファイルは読み込まない
  // コードの囲みに付ける言語の名前
  const LANG = { java: 'java', jsp: 'jsp', xml: 'xml', properties: 'properties', sql: 'sql', sh: 'bash', bat: 'bat', js: 'javascript', html: 'html', css: 'css', tld: 'xml', xsl: 'xml', gradle: 'groovy', txt: 'text' };

  function init(root){
    const canPickDir = typeof window.showDirectoryPicker === 'function';   // Chrome・Edge
    root.innerHTML = `
      <div class="st-grid">
        <section class="st-card">
          <div class="st-head"><span class="st-title">1. フォルダを選ぶ</span></div>
          <div class="st-row" style="margin-top:0">
            <button type="button" class="st-pick st-primary st-big">フォルダを選ぶ</button>
            <button type="button" class="st-reload" hidden title="git pull などでファイルが変わったら、選び直さずに読み込み直せます">読み込み直し</button>
            <button type="button" class="st-clear" hidden title="読み込んだファイルを、このページから消します（設定はそのまま）">クリア</button>
          </div>
          <input type="file" class="st-dir-input" webkitdirectory multiple hidden>
          <p class="st-note">ファイルはこのブラウザの中で読むだけで、どこにも送りません。${canPickDir ? '' : 'ブラウザによっては「アップロードしますか」と聞かれますが、実際には送りません。'}</p>
          <progress class="st-progress" hidden></progress>
          <div class="st-status"></div>

          <div class="st-group">
            <div class="st-legend">対象の拡張子</div>
            <div class="st-exts">${EXTS.map(e => `<label><input type="checkbox" value="${e}"${EXTS_ON.includes(e) ? ' checked' : ''}> .${e}</label>`).join('')}</div>
            <div style="margin-top:6px"><input type="text" class="st-ext-more" placeholder="ほかの拡張子（カンマ区切り。例：vm, ftl, conf）"></div>
          </div>
          <div class="st-group">
            <div class="st-legend">外すフォルダ（カンマ区切り）</div>
            <input type="text" class="st-exclude" value="${EXCLUDE}">
          </div>
          <details>
            <summary>そのほかの設定</summary>
            <div class="st-row">
              <label>文字コード <select class="st-enc">
                <option value="auto">自動（UTF-8・Shift_JIS・EUC-JP を判定）</option>
                <option value="utf-8">UTF-8</option><option value="shift_jis">Shift_JIS</option><option value="euc-jp">EUC-JP</option>
              </select></label>
            </div>
            <div class="st-row">
              <label><input type="checkbox" class="st-merge" checked> 中身が1つのフォルダをまとめて書く（com/example/… のように）</label>
              <label><input type="checkbox" class="st-show-lines" checked> tree に行数を書く</label>
            </div>
            <div class="st-row">
              <label>1回にコピーする上限 <input type="number" class="st-part-lines" min="100" max="100000" step="100" value="${PART_LINES}"> 行</label>
            </div>
            <p class="st-note">上限を超えると、何回かに分けてコピーします（ファイルの途中では切りません。1つのファイルだけで上限を超えるときは、そのファイルを行で区切ります）。</p>
          </details>
        </section>

        <section class="st-card">
          <div class="st-head"><span class="st-title">2. tree とソース</span><span class="st-meta st-summary"></span></div>
          <div class="st-find">
            <input type="text" class="st-find-input" placeholder="ファイル名で探す（例：OrderDao、*Action.java、order dao、batch/）" disabled>
            <button type="button" class="st-find-clear" hidden title="絞り込みをやめる">×</button>
            <span class="st-meta st-find-count"></span>
          </div>
          <div class="st-tools">
            <button type="button" class="st-copy-tree st-primary" disabled title="画面で見えているとおりにコピーします（閉じているフォルダは、中身を省いて1行にします）">tree をコピー</button>
            <button type="button" class="st-select-all" disabled>すべて選ぶ</button>
            <button type="button" class="st-select-none" disabled>選択を解除</button>
            <button type="button" class="st-expand" disabled>すべて開く</button>
            <button type="button" class="st-collapse" disabled>すべて閉じる</button>
          </div>
          <div class="st-tree"><div class="st-empty">フォルダを選ぶと、ここに tree が出ます。<br>ファイルにチェックを付けると、そのソースをまとめてコピーできます。ファイル名を押すと、下に中身が出ます。</div></div>
          <div class="st-row">
            <span class="st-selected">選んだファイル：なし</span>
            <button type="button" class="st-copy-selected st-primary" disabled>選んだファイルをコピー</button>
          </div>
          <div class="st-parts"></div>
          <div class="st-warn" hidden></div>
          <textarea class="st-preview" readonly spellcheck="false" placeholder="コピーした内容や、押したファイルの中身がここに出ます"></textarea>
          <div class="st-row"><button type="button" class="st-copy-current" disabled>このファイルをコピー</button><span class="st-meta st-current-name"></span></div>
        </section>
      </div>`;

    const q = s => root.querySelector(s);
    const el = {
      pick: q('.st-pick'), reload: q('.st-reload'), clear: q('.st-clear'), dirInput: q('.st-dir-input'), progress: q('.st-progress'), status: q('.st-status'),
      exts: [...root.querySelectorAll('.st-exts input')], extMore: q('.st-ext-more'), exclude: q('.st-exclude'), enc: q('.st-enc'),
      merge: q('.st-merge'), showLines: q('.st-show-lines'), partLines: q('.st-part-lines'),
      summary: q('.st-summary'), copyTree: q('.st-copy-tree'), selectAll: q('.st-select-all'), selectNone: q('.st-select-none'),
      expand: q('.st-expand'), collapse: q('.st-collapse'), tree: q('.st-tree'), selected: q('.st-selected'), copySelected: q('.st-copy-selected'),
      parts: q('.st-parts'), warn: q('.st-warn'), preview: q('.st-preview'), copyCurrent: q('.st-copy-current'), currentName: q('.st-current-name'),
      findInput: q('.st-find-input'), findClear: q('.st-find-clear'), findCount: q('.st-find-count'),
    };

    let rootName = '';      // 選んだフォルダの名前
    let dirHandle = null;   // File System Access API で選んだときのフォルダ（読み込み直しに使う）
    let allRefs = [];       // 外すフォルダ以外の、すべてのファイル { path, ext, size, getFile }
    let entries = [];       // 対象の拡張子に絞ったファイル { path, ext, text, lines, enc, skipped }
    const cache = new Map();     // path → { text, lines, enc, lastModified }（設定を変えても読み直さないため）
    const selected = new Set();  // 選んだファイルの path
    const collapsed = new Set(); // 閉じているフォルダの path（作り直しても開け閉めを保つ。tree のコピーにも使う）
    let current = null;          // ファイル名を押して中身を表示しているファイル
    let findQuery = '';          // 「ファイル名で探す」に入れた文字

    // ---------- ファイル名で探す ----------
    // 空白で区切ると「かつ」。* と ? が使える（* があるときはファイル名全体で比べる）。/ を含むとパス全体で探す。大文字・小文字は区別しない
    const findTerms = () => findQuery.trim().split(/\s+/).filter(Boolean);
    function termRegex(t){
      const wild = /[*?]/.test(t);
      const body = t.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp(wild && !t.includes('/') ? '^' + body + '$' : body, 'i');
    }
    function matches(e){
      return findTerms().every(t => termRegex(t).test(t.includes('/') ? e.path : e.path.split('/').pop()));
    }
    const visibleEntries = () => findQuery.trim() ? entries.filter(matches) : entries;
    // 探している間は、閉じたフォルダも開いて見せる（見つかったものが隠れないように）
    const isCollapsed = path => !findQuery.trim() && collapsed.has(path);

    // ---------- フォルダを選ぶ ----------
    el.pick.onclick = async () => {
      if (canPickDir) {
        try { dirHandle = await window.showDirectoryPicker({ mode: 'read' }); }
        catch (e) { if (e.name !== 'AbortError') setStatus('フォルダを開けませんでした：' + e.message); return; }
        cache.clear(); selected.clear(); collapsed.clear(); current = null;
        await readFromHandle();
      } else {
        el.dirInput.value = '';
        el.dirInput.click();
      }
    };
    el.reload.onclick = () => readFromHandle();
    // クリア：読み込んだファイルの中身をこのページから消して、最初の状態に戻す（拡張子などの設定はそのまま）
    el.clear.onclick = () => {
      rootName = ''; dirHandle = null; allRefs = []; entries = [];
      cache.clear(); selected.clear(); collapsed.clear(); current = null;
      el.findInput.value = ''; findQuery = ''; el.findClear.hidden = true; el.findInput.disabled = true;
      el.findCount.textContent = ''; el.selectAll.textContent = 'すべて選ぶ';
      el.dirInput.value = ''; el.preview.value = ''; el.currentName.textContent = ''; el.copyCurrent.disabled = true;
      el.reload.hidden = true; el.clear.hidden = true;
      renderTree();
      setStatus('クリアしました。');
    };
    el.dirInput.onchange = async () => {
      const files = [...el.dirInput.files];
      if (!files.length) return;
      cache.clear(); selected.clear(); collapsed.clear(); current = null;
      rootName = files[0].webkitRelativePath.split('/')[0];
      const ex = excludeSet();
      allRefs = files
        .map(f => ({ path: f.webkitRelativePath.split('/').slice(1).join('/'), size: f.size, getFile: async () => f }))
        .filter(r => r.path && !r.path.split('/').slice(0, -1).some(d => ex.has(d.toLowerCase())))
        .map(r => ({ ...r, ext: extOf(r.path) }));
      await applyFilter();
    };

    // Chrome・Edge：フォルダをたどる。外すフォルダには入らない（.git や node_modules をたどると時間がかかるため）
    async function readFromHandle(){
      if (!dirHandle) return;
      rootName = dirHandle.name;
      el.reload.hidden = false;
      busy(true, 'フォルダをたどっています…');
      const ex = excludeSet();
      const refs = [];
      async function walk(dir, prefix){
        for await (const [name, h] of dir.entries()) {
          if (h.kind === 'directory') {
            if (!ex.has(name.toLowerCase())) await walk(h, prefix + name + '/');
          } else {
            refs.push({ path: prefix + name, ext: extOf(name), getFile: () => h.getFile() });
          }
        }
      }
      try { await walk(dirHandle, ''); }
      catch (e) { busy(false); setStatus('フォルダを読めませんでした：' + e.message); return; }
      allRefs = refs;
      await applyFilter();
    }

    // ---------- 絞り込みと読み込み ----------
    function excludeSet(){ return new Set(el.exclude.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)); }
    function extSet(){
      const s = new Set(el.exts.filter(c => c.checked).map(c => c.value));
      el.extMore.value.split(',').map(x => x.trim().replace(/^\./, '').toLowerCase()).filter(Boolean).forEach(x => s.add(x));
      return s;
    }
    const extOf = p => { const m = p.match(/\.([^./]+)$/); return m ? m[1].toLowerCase() : ''; };

    async function applyFilter(){
      const exts = extSet(), ex = excludeSet();
      const targets = allRefs
        .filter(r => exts.has(r.ext) && !r.path.split('/').slice(0, -1).some(d => ex.has(d.toLowerCase())))
        .sort((a, b) => a.path.localeCompare(b.path));
      busy(true, `ファイルを読み込んでいます…（0 / ${targets.length}）`);
      el.progress.max = targets.length || 1;
      const out = [];
      let i = 0;
      for (const r of targets) {
        out.push(await readEntry(r));
        if (++i % 20 === 0) { el.progress.value = i; setStatus(`ファイルを読み込んでいます…（${i} / ${targets.length}）`); }
      }
      entries = out;
      el.clear.hidden = false;
      for (const p of [...selected]) if (!entries.some(e => e.path === p)) selected.delete(p);
      busy(false);
      const total = entries.reduce((s, e) => s + e.lines, 0);
      const sjis = entries.filter(e => e.enc === 'Shift_JIS').length;
      const euc = entries.filter(e => e.enc === 'EUC-JP').length;
      const skipped = entries.filter(e => e.skipped).length;
      setStatus(`「${rootName}」を読み込みました。ファイル ${entries.length} 個、合計 ${total.toLocaleString()} 行` +
        (sjis || euc ? `（${[sjis && `Shift_JIS ${sjis} 個`, euc && `EUC-JP ${euc} 個`].filter(Boolean).join('、')}）` : '') + (skipped ? `。大きすぎて読み込まなかったファイル ${skipped} 個` : ''));
      renderTree();
    }

    async function readEntry(r){
      const f = await r.getFile();
      const hit = cache.get(r.path);
      if (hit && hit.lastModified === f.lastModified && hit.encSetting === el.enc.value) return { path: r.path, ext: r.ext, ...hit };
      let rec;
      if (f.size > MAX_BYTES) rec = { text: '', lines: 0, enc: '', skipped: true };
      else {
        const { text, enc } = decode(await f.arrayBuffer());
        rec = { text, lines: text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0, enc, skipped: false };
      }
      rec.lastModified = f.lastModified; rec.encSetting = el.enc.value;
      cache.set(r.path, rec);
      return { path: r.path, ext: r.ext, ...rec };
    }

    // 文字コード：古い Java のソースは Shift_JIS（MS932）のことが多く、まれに EUC-JP もある。
    // 自動のときは、UTF-8 として正しく読めれば UTF-8。だめなら Shift_JIS と EUC-JP のうち、正しく読めるほうにする
    function decode(buf){
      const setting = el.enc.value;
      const strip = s => s.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      const NAME = { 'utf-8': 'UTF-8', shift_jis: 'Shift_JIS', 'euc-jp': 'EUC-JP' };
      if (setting !== 'auto') return { text: strip(new TextDecoder(setting).decode(buf)), enc: NAME[setting] };
      const tryFatal = label => { try { return new TextDecoder(label, { fatal: true }).decode(buf); } catch (e) { return null; } };
      const u = tryFatal('utf-8');
      if (u !== null) return { text: strip(u), enc: 'UTF-8' };
      const enc = guessJapanese(new Uint8Array(buf), tryFatal('shift_jis'), tryFatal('euc-jp'));
      return { text: strip(new TextDecoder(enc).decode(buf)), enc: NAME[enc] };
    }

    // Shift_JIS か EUC-JP か。
    // EUC-JP は日本語の文字にほぼ 0xA1〜0xFE しか使わず、0x80〜0xA0 は（0x8E・0x8F を除いて）使わない。
    // Shift_JIS はひらがな・カタカナの1バイト目が 0x82・0x83 なので、日本語の文章ならこの範囲のバイトがほぼ必ずある
    function guessJapanese(bytes, sjisText, eucText){
      if (sjisText !== null && eucText === null) return 'shift_jis';
      if (eucText !== null && sjisText === null) return 'euc-jp';
      let sjisOnly = 0;
      for (const b of bytes) if (b >= 0x80 && b <= 0xA0 && b !== 0x8E && b !== 0x8F) sjisOnly++;
      if (sjisOnly > 0) return 'shift_jis';
      if (eucText !== null) return 'euc-jp';
      // どちらも正しく読めないとき：読んだ結果の「日本語らしさ」で選ぶ（ひらがな・カタカナ・漢字が多く、半角カナや読めない文字が少ないほう）
      const score = t => (t.match(/[\u3041-\u3096\u30A1-\u30FA\u4E00-\u9FFF]/g) || []).length
        - 3 * (t.match(/[\uFF61-\uFF9F\uFFFD]/g) || []).length;
      const sj = new TextDecoder('shift_jis').decode(bytes), eu = new TextDecoder('euc-jp').decode(bytes);
      return score(eu) > score(sj) ? 'euc-jp' : 'shift_jis';
    }

    // 設定を変えたら、選び直さずに作り直す（外すフォルダを変えたら、Chrome・Edge ではフォルダをたどり直す）
    el.exts.forEach(c => c.onchange = () => allRefs.length && applyFilter());
    el.extMore.onchange = () => allRefs.length && applyFilter();
    el.exclude.onchange = () => { if (dirHandle) readFromHandle(); else if (allRefs.length) applyFilter(); };
    el.enc.onchange = () => allRefs.length && applyFilter();
    el.merge.onchange = renderTree;
    el.findInput.oninput = () => { findQuery = el.findInput.value; el.findClear.hidden = !findQuery; renderTree(); };
    el.findInput.onkeydown = e => { if (e.key === 'Escape') { el.findInput.value = ''; el.findInput.oninput(); } };
    el.findClear.onclick = () => { el.findInput.value = ''; el.findInput.oninput(); el.findInput.focus(); };
    el.showLines.onchange = renderTree;
    el.partLines.onchange = updateSelection;

    // ---------- tree ----------
    // path の一覧から、フォルダの入れ子を作る。node = { name, path, dirs: Map, files: [] }
    function buildTree(){
      const top = { name: rootName, path: '', dirs: new Map(), files: [] };
      for (const e of visibleEntries()) {
        const parts = e.path.split('/');
        let node = top;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { name: parts[i], path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [] });
          node = node.dirs.get(parts[i]);
        }
        node.files.push(e);
      }
      return top;
    }
    // 中身が1つのフォルダだけのフォルダは、名前をつなげてまとめる（src/com/example/ のように）
    function merged(node){
      let n = node, name = node.name;
      while (el.merge.checked && n.files.length === 0 && n.dirs.size === 1) { n = [...n.dirs.values()][0]; name += '/' + n.name; }
      return { node: n, name };
    }
    const filesUnder = node => [...node.files, ...[...node.dirs.values()].flatMap(filesUnder)];
    const sortedDirs = node => [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));

    function renderTree(){
      const has = entries.length > 0;
      [el.copyTree, el.selectAll, el.selectNone, el.expand, el.collapse].forEach(b => b.disabled = !has);
      if (!has) {
        el.tree.innerHTML = `<div class="st-empty">${allRefs.length ? '対象のファイルがありません。左の「対象の拡張子」や「外すフォルダ」を確かめてください。' : 'フォルダを選ぶと、ここに tree が出ます。'}</div>`;
        el.summary.textContent = '';
        updateSelection();
        return;
      }
      el.findInput.disabled = false;
      const shown = visibleEntries();
      const finding = !!findQuery.trim();
      el.selectAll.textContent = finding ? '見つかったものを選ぶ' : 'すべて選ぶ';
      el.findCount.textContent = finding ? `${shown.length} 個見つかりました` : '';
      if (finding && !shown.length) {
        el.tree.innerHTML = `<div class="st-empty">「${findQuery.trim().replace(/</g, '&lt;')}」に一致するファイルはありません。</div>`;
        [el.copyTree, el.selectAll, el.expand, el.collapse].forEach(b => b.disabled = true);
        updateSelection();
        return;
      }
      const top = buildTree();
      const total = entries.reduce((s, e) => s + e.lines, 0);
      el.summary.textContent = `ファイル ${entries.length} 個、${total.toLocaleString()} 行`;
      const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const plain = findTerms().filter(t => !/[*?\/]/.test(t)).map(t => t.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
      const highlight = name => {
        if (!plain.length) return esc(name);
        return name.split(new RegExp(`(${plain.join('|')})`, 'gi')).map((part, i) => i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)).join('');
      };
      const fileLi = e => `<li class="st-file${current === e.path ? ' st-current' : ''}" data-path="${esc(e.path)}"><span class="st-node"><span class="st-toggle"></span>` +
        `<input type="checkbox" data-file="${esc(e.path)}"${selected.has(e.path) ? ' checked' : ''}>` +
        `<span class="st-name">${highlight(e.path.split('/').pop())}</span>` +
        `<span class="st-meta">${e.skipped ? '（大きすぎるので読み込まない）' : `(${e.lines.toLocaleString()}行)`}</span>` +
        (e.enc === 'Shift_JIS' ? '<span class="st-sjis" title="Shift_JIS で読みました">SJIS</span>' : e.enc === 'EUC-JP' ? '<span class="st-sjis" title="EUC-JP で読みました">EUC</span>' : '') + '</span></li>';
      const dirLi = (node, label) => {
        const { node: n, name } = merged(node);
        const shown = label ?? name;
        const closed = isCollapsed(n.path);
        return `<li class="st-dir${closed ? ' st-collapsed' : ''}" data-dir="${esc(n.path)}"><span class="st-node"><span class="st-toggle">${closed ? '▸' : '▾'}</span>` +
          `<input type="checkbox" data-dir="${esc(n.path)}">` +
          `<span class="st-name">${esc(shown)}/</span><span class="st-meta">${filesUnder(n).length} 個</span></span>` +
          `<ul>${sortedDirs(n).map(d => dirLi(d)).join('')}${n.files.map(fileLi).join('')}</ul></li>`;
      };
      el.tree.innerHTML = `<ul>${dirLi(top)}</ul>`;
      syncDirChecks();
      updateSelection();
    }

    // フォルダのチェックの状態を、中のファイルに合わせる（全部選んでいればチェック、一部なら「－」）
    function syncDirChecks(){
      el.tree.querySelectorAll('input[data-dir]').forEach(cb => {
        const li = cb.closest('li');
        const files = [...li.querySelectorAll('input[data-file]')].map(x => x.dataset.file);
        const n = files.filter(p => selected.has(p)).length;
        cb.checked = files.length > 0 && n === files.length;
        cb.indeterminate = n > 0 && n < files.length;
      });
    }

    el.tree.addEventListener('click', e => {
      const t = e.target;
      if (t.classList.contains('st-toggle')) {
        const li = t.closest('.st-dir');
        if (li) setCollapsed(li, !li.classList.contains('st-collapsed'));
        return;
      }
      if (t.matches('input[data-file]')) { t.checked ? selected.add(t.dataset.file) : selected.delete(t.dataset.file); syncDirChecks(); updateSelection(); return; }
      if (t.matches('input[data-dir]')) {
        t.closest('li').querySelectorAll('input[data-file]').forEach(x => { x.checked = t.checked; t.checked ? selected.add(x.dataset.file) : selected.delete(x.dataset.file); });
        syncDirChecks(); updateSelection(); return;
      }
      if (t.classList.contains('st-name') && t.closest('.st-file')) showFile(t.closest('.st-file').dataset.path);
    });
    el.selectAll.onclick = () => { visibleEntries().forEach(e => !e.skipped && selected.add(e.path)); renderTree(); };
    el.selectNone.onclick = () => { selected.clear(); renderTree(); };
    function setCollapsed(li, on){
      li.classList.toggle('st-collapsed', on);
      li.querySelector('.st-toggle').textContent = on ? '▸' : '▾';
      on ? collapsed.add(li.dataset.dir) : collapsed.delete(li.dataset.dir);
    }
    el.expand.onclick = () => el.tree.querySelectorAll('.st-dir').forEach(li => setCollapsed(li, false));
    // 「すべて閉じる」は、一番上（プロジェクト）の直下のフォルダを閉じる（一番上まで閉じると何も見えなくなるため）
    el.collapse.onclick = () => el.tree.querySelectorAll('.st-dir').forEach((li, i) => { if (i > 0) setCollapsed(li, true); });

    // tree の文字（チャットに貼る用）
    function treeText(){
      const { node: top, name: topName } = merged(buildTree());
      const lines = [topName + '/'];
      const walk = (node, prefix) => {
        const items = [...sortedDirs(node).map(d => ({ d })), ...node.files.map(f => ({ f }))];
        items.forEach((it, i) => {
          const last = i === items.length - 1;
          const branch = prefix + (last ? '└─ ' : '├─ ');
          if (it.d) {
            const { node: n, name } = merged(it.d);
            if (isCollapsed(n.path)) {
              // 画面で閉じているフォルダは、中身を省いて1行にする（画面で見えているとおりにコピーする）
              const fs = filesUnder(n);
              lines.push(branch + name + `/  … (ファイル ${fs.length} 個、${fs.reduce((s, e) => s + e.lines, 0).toLocaleString()} 行)`);
            } else {
              lines.push(branch + name + '/');
              walk(n, prefix + (last ? '    ' : '│   '));
            }
          } else {
            const f = it.f;
            lines.push(branch + f.path.split('/').pop() + (el.showLines.checked ? (f.skipped ? ' (読み込まず)' : ` (${f.lines}行)`) : ''));
          }
        });
      };
      if (isCollapsed(top.path)) lines[0] += `  … (ファイル ${entries.length} 個)`;   // 一番上まで閉じているとき
      else walk(top, '');
      const total = entries.reduce((s, e) => s + e.lines, 0);
      lines.push('', `（ファイル ${entries.length} 個、合計 ${total.toLocaleString()} 行）`);
      if (findQuery.trim()) lines.push(`（「${findQuery.trim()}」で絞り込み：${visibleEntries().length} 個を表示）`);
      return lines.join('\n');
    }
    el.copyTree.onclick = async () => { const t = treeText(); el.preview.value = t; await copy(t, el.copyTree, 'tree をコピー'); };

    // ---------- ソースのコピー ----------
    // コードの囲み。ソースの中に ``` があっても壊れないよう、それより長い ` で囲む
    function block(e, from, to){
      const ls = e.text.split('\n');
      if (ls[ls.length - 1] === '') ls.pop();
      const body = ls.slice(from, to).join('\n');
      const longest = Math.max(2, ...(body.match(/`+/g) || []).map(s => s.length));
      const fence = '`'.repeat(longest + 1);
      const range = from === 0 && to >= ls.length ? `（${e.lines}行）` : `（${from + 1}〜${Math.min(to, ls.length)}行目／全${e.lines}行）`;
      return `### ${e.path}${range}\n${fence}${LANG[e.ext] || ''}\n${body}\n${fence}`;
    }

    // 選んだファイルを、上限の行数ごとに分ける。ファイルの途中では切らない。1つで上限を超えるファイルは行で区切る
    function buildParts(){
      const limit = Math.max(100, Number(el.partLines.value) || PART_LINES);
      const files = entries.filter(e => selected.has(e.path) && !e.skipped);
      const pieces = [];   // { e, from, to, lines }
      for (const e of files) {
        if (e.lines <= limit) pieces.push({ e, from: 0, to: e.lines, lines: e.lines });
        else for (let s = 0; s < e.lines; s += limit) pieces.push({ e, from: s, to: Math.min(s + limit, e.lines), lines: Math.min(limit, e.lines - s) });
      }
      const parts = [];
      let cur = [];
      let n = 0;
      for (const p of pieces) {
        if (cur.length && n + p.lines > limit) { parts.push(cur); cur = []; n = 0; }
        cur.push(p); n += p.lines;
      }
      if (cur.length) parts.push(cur);
      return { files, parts, limit, big: files.filter(e => e.lines > limit) };
    }
    function partText(part, i, count){
      const lines = part.reduce((s, p) => s + p.lines, 0);
      const names = new Set(part.map(p => p.e.path));
      const head = `【src-tree】${rootName} のソース` + (count > 1 ? ` ${i + 1}/${count}` : '') + `（ファイル ${names.size} 個、${lines.toLocaleString()} 行）`;
      return head + '\n\n' + part.map(p => block(p.e, p.from, p.to)).join('\n\n') + '\n';
    }

    function updateSelection(){
      const { files, parts, limit, big } = buildParts();
      const lines = files.reduce((s, e) => s + e.lines, 0);
      const hiddenSel = findQuery.trim() ? files.filter(e => !matches(e)).length : 0;
      el.selected.textContent = files.length ? `選んだファイル：${files.length} 個、${lines.toLocaleString()} 行` + (parts.length > 1 ? ` → ${parts.length} 回に分けてコピー` : '') +
        (hiddenSel ? `（うち ${hiddenSel} 個は絞り込みで見えていない）` : '') : '選んだファイル：なし';
      el.copySelected.disabled = !files.length;
      el.copySelected.hidden = parts.length > 1;
      el.parts.innerHTML = parts.length > 1 ? parts.map((_, i) => `<button type="button" data-part="${i}" class="st-primary">${i + 1}/${parts.length} をコピー</button>`).join('') : '';
      el.warn.hidden = !big.length;
      el.warn.textContent = big.length ? `上限（${limit.toLocaleString()} 行）を超えるファイルは、行で区切ってコピーします：${big.map(e => e.path.split('/').pop()).join('、')}` : '';
    }
    el.copySelected.onclick = async () => {
      const { parts } = buildParts();
      if (parts.length !== 1) return;
      const t = partText(parts[0], 0, 1);
      el.preview.value = t;
      await copy(t, el.copySelected, '選んだファイルをコピー');
    };
    el.parts.addEventListener('click', async e => {
      const b = e.target.closest('button[data-part]');
      if (!b) return;
      const { parts } = buildParts();
      const i = Number(b.dataset.part);
      const t = partText(parts[i], i, parts.length);
      el.preview.value = t;
      await copy(t, b, `${i + 1}/${parts.length} をコピー`);
      b.classList.add('st-done');   // どこまでコピーしたか分かるように
    });

    // ファイル名を押したら、中身を下に表示する
    function showFile(path){
      const e = entries.find(x => x.path === path);
      if (!e) return;
      current = path;
      el.tree.querySelectorAll('.st-file').forEach(li => li.classList.toggle('st-current', li.dataset.path === path));
      el.preview.value = e.skipped ? '（大きすぎるので読み込んでいません）' : block(e, 0, e.lines);
      el.currentName.textContent = `${path}（${e.lines.toLocaleString()}行${e.enc ? '、' + e.enc : ''}）`;
      el.copyCurrent.disabled = e.skipped;
    }
    el.copyCurrent.onclick = async () => {
      const e = entries.find(x => x.path === current);
      if (!e) return;
      const t = block(e, 0, e.lines);
      el.preview.value = t;
      await copy(t, el.copyCurrent, 'このファイルをコピー');
    };

    // ---------- 共通 ----------
    async function copy(text, button, label){
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'コピーしました';
      } catch (e) {
        el.preview.focus(); el.preview.select();
        button.textContent = 'コピーできませんでした（下の欄から選んでコピー）';
      }
      setTimeout(() => button.textContent = label, 1800);
    }
    function setStatus(msg){ el.status.textContent = msg; }
    function busy(on, msg){
      el.pick.disabled = on; el.reload.disabled = on; el.clear.disabled = on;
      el.progress.hidden = !on;
      if (on) { el.progress.removeAttribute('value'); if (msg) setStatus(msg); }
    }

    // 試験用：ファイルの一覧を直接渡して読み込む（{ path, text, lastModified? } の配列）
    root.srcTreeLoad = async (name, list) => {
      rootName = name; dirHandle = null; cache.clear(); selected.clear(); collapsed.clear(); current = null;
      allRefs = list.map(x => ({ path: x.path, ext: extOf(x.path), getFile: async () => new File([x.bytes || x.text], x.path.split('/').pop(), { lastModified: x.lastModified || 1 }) }));
      await applyFilter();
    };
  }

  const start = () => document.querySelectorAll('.src-tree-tool').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
