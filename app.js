import { MAX_BYTES, decodeUTF8 } from './src/csv.mjs';
import { CsvWorkspace } from './src/workspace.mjs';

const byId = id => document.getElementById(id);
const ids = ['file-input','open-file','open-empty','file-info','file-size','dropzone','empty-title','empty-description','load-demo','settings','rule-count','input-delimiter','output-delimiter','import-hint','trim','remove-empty','remove-duplicates','message','error','summary','input-count','output-count','trim-count','empty-count','duplicate-count','preview-toolbar','tab-result','tab-source','preview-label','table-container','preview','table-foot','limit-note','export-bar','download-name','download','reset'];
const ui = Object.fromEntries(ids.map(id => [id, byId(id)]));
const state = new CsvWorkspace();
let view = 'result';
let loadSequence = 0;
let fileSize = '';
let externalError = '';
let loading = false;
const initialMobile = window.matchMedia('(max-width: 900px)').matches;
ui.settings.open = !initialMobile;

function say(message) { ui.message.textContent = message; }
function outputName() { return state.name.replace(/\.csv$/i, '') + '_clean.csv'; }
function separatorName(value) { return value === ';' ? 'точка с запятой (;)' : 'запятая (,)'; }
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderTable() {
  const available = Boolean(state.result);
  const sourceView = view === 'source';
  for (const name of ['result', 'source']) {
    const tab = ui['tab-' + name];
    tab.classList.toggle('active', view === name);
    tab.setAttribute('aria-selected', String(view === name));
    tab.tabIndex = view === name ? 0 : -1;
  }
  ui['table-container'].setAttribute('aria-labelledby', 'tab-' + view);
  ui['preview-toolbar'].hidden = ui['table-container'].hidden = ui['table-foot'].hidden = !available;
  ui.dropzone.hidden = available;
  const head = ui.preview.querySelector('thead');
  const body = ui.preview.querySelector('tbody');
  head.replaceChildren(); body.replaceChildren();
  if (!available) return;
  const rows = sourceView ? state.source : state.result.rows;
  const rowChanges = state.result.changes;
  const width = Math.min(rows[0].length, 30);
  const header = node('tr');
  const indexHeader = node('th', '№'); indexHeader.scope = 'col'; header.append(indexHeader);
  for (let column = 0; column < width; column++) {
    const value = rows[0][column];
    const th = node('th', value || `Столбец ${column + 1}`);
    th.scope = 'col';
    th.title = value || 'Заголовок пуст';
    if (rowChanges[0].trimmedCells.includes(column)) {
      th.classList.add('changed');
      th.title = `Пробелы по краям: «${state.source[0][column]}» → «${state.result.rows[0][column]}»`;
    }
    header.append(th);
  }
  head.append(header);
  const fragment = document.createDocumentFragment();
  rows.slice(1, 101).forEach((row, index) => {
    const sourceIndex = sourceView ? index + 1 : state.result.sourceIndices[index + 1];
    const change = rowChanges[sourceIndex];
    const tr = node('tr');
    const number = node('td');
    if (change.removed) {
      tr.className = 'row-removed';
      const marker = node('span', '×', 'removed-mark'); marker.setAttribute('aria-hidden', 'true');
      number.append(marker, document.createTextNode(String(sourceIndex + 1)));
      number.title = change.removed === 'empty' ? 'Пустая строка — будет удалена' : `Дубликат записи ${change.duplicateOf + 1} — будет удалён`;
      number.append(node('span', number.title, 'sr-only'));
    } else number.textContent = String(sourceIndex + 1);
    tr.append(number);
    for (let column = 0; column < width; column++) {
      const value = row[column] ?? '';
      const td = node('td', value === '' ? '∅' : value);
      td.title = value === '' ? 'Пустая ячейка' : value;
      if (value === '') { td.className = 'blank'; td.setAttribute('aria-label', 'Пустая ячейка'); }
      if (change.trimmedCells.includes(column)) {
        td.classList.add('changed');
        td.title = `Пробелы по краям: «${state.source[sourceIndex][column]}» → «${state.source[sourceIndex][column].trim()}»`;
        td.append(node('span', ' — изменены пробелы по краям', 'sr-only'));
      }
      tr.append(td);
    }
    fragment.append(tr);
  });
  if (rows.length === 1) {
    const row = node('tr'); const cell = node('td', 'Только заголовки. Строк с данными нет.');
    cell.colSpan = width + 1; row.append(cell); fragment.append(row);
  }
  body.append(fragment);
  ui['preview-label'].textContent = `${Math.min(rows.length - 1, 100)} из ${rows.length - 1} строк · ${width} из ${rows[0].length} столбцов`;
  ui['limit-note'].textContent = rows.length > 101 || rows[0].length > 30 ? 'Предпросмотр ограничен · скачивание включает все данные' : 'UTF-8 · все данные включены в скачивание';
}

function render() {
  const available = Boolean(state.result);
  const hasFile = state.text !== null;
  const error = externalError || state.error;
  ui.error.textContent = error;
  ui.error.hidden = !error;
  ui['file-info'].textContent = hasFile ? state.name : 'Файл не открыт';
  ui['file-info'].title = hasFile ? state.name : '';
  ui['file-size'].textContent = fileSize;
  ui['input-delimiter'].value = state.inputChoice;
  ui['output-delimiter'].value = state.outputDelimiter;
  ui['input-delimiter'].disabled = loading;
  ui['output-delimiter'].disabled = !available || loading;
  ui['input-delimiter'].setAttribute('aria-invalid', String(Boolean(state.error)));
  ui['input-delimiter'].setAttribute('aria-describedby', 'import-hint');
  ui['import-hint'].textContent = state.inputDelimiter ? `Распознано: ${separatorName(state.inputDelimiter)}. Столбцов: ${state.source[0].length}.` : hasFile ? 'Исходный текст сохранён. Уточните разделитель и повторите разбор.' : 'Первая строка — заголовки.';
  ui.summary.hidden = !available;
  ui['export-bar'].hidden = !hasFile;
  ui.download.disabled = !available || loading;
  ui.reset.hidden = !hasFile;
  ui['download-name'].textContent = hasFile ? outputName() : '';
  ui['load-demo'].hidden = ui['open-empty'].hidden = hasFile;
  ui['open-file'].disabled = ui['open-empty'].disabled = ui['load-demo'].disabled = loading;
  ui['empty-title'].textContent = hasFile ? 'Уточните формат исходника' : 'Откройте CSV-выгрузку';
  ui['empty-description'].textContent = hasFile ? 'Выберите разделитель исходного файла в настройках.\nВы также можете открыть другой CSV.' : 'Перетащите файл в эту область.\nUTF-8, запятая или точка с запятой, до 5 МБ.';
  let count = 0;
  for (const [id, key] of [['trim','trim'],['remove-empty','removeEmpty'],['remove-duplicates','removeDuplicates']]) {
    ui[id].checked = state.options[key];
    ui[id].disabled = loading;
    if (state.options[key]) count++;
  }
  ui['rule-count'].textContent = String(count);
  ui['rule-count'].setAttribute('aria-label', `Включено правил: ${count}`);
  if (available) {
    const stats = state.result.stats;
    for (const [id, key] of [['input-count','inputRows'],['output-count','outputRows'],['trim-count','trimmedCells'],['empty-count','removedEmpty'],['duplicate-count','removedDuplicates']]) ui[id].textContent = stats[key].toLocaleString('ru-RU');
  }
  renderTable();
}

function processedMessage() {
  say(state.error ? 'Исправьте настройки импорта. Скачивание пока недоступно.' : `Очистка выполнена. Строк в результате: ${state.result.stats.outputRows}.`);
  if (state.error) ui.settings.open = true;
}

async function loadFile(file) {
  if (!file) return;
  const sequence = ++loadSequence;
  loading = false;
  externalError = '';
  if (!file.name.toLowerCase().endsWith('.csv')) {
    externalError = 'Выберите файл .csv. Таблицу Excel сначала сохраните как CSV UTF-8.'; render(); return;
  }
  if (file.size > MAX_BYTES) {
    externalError = 'Файл больше 5 МБ. Разделите выгрузку на несколько CSV.'; render(); return;
  }
  loading = true; say('Чтение CSV…'); render();
  try {
    const text = decodeUTF8(await file.arrayBuffer());
    if (sequence !== loadSequence) return;
    fileSize = `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(file.size / 1024)} КБ`;
    state.open(text, file.name); view = 'result'; processedMessage();
  } catch (error) {
    if (sequence === loadSequence) {
      externalError = `«${file.name}»: ${error.message}`;
      say(state.text !== null ? `Открытый файл «${state.name}» сохранён. Новый файл не загружен.` : 'Выберите CSV в кодировке UTF-8.');
    }
  } finally { if (sequence === loadSequence) { loading = false; render(); } }
}

for (const id of ['open-file','open-empty']) ui[id].addEventListener('click', () => ui['file-input'].click());
ui['file-input'].addEventListener('change', event => { loadFile(event.target.files[0]); event.target.value = ''; });
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
document.addEventListener('drop', event => {
  if (!event.dataTransfer.files.length) return;
  event.preventDefault(); ui.dropzone.classList.remove('dragging'); loadFile(event.dataTransfer.files[0]);
});
ui.dropzone.addEventListener('dragover', event => { event.preventDefault(); ui.dropzone.classList.add('dragging'); });
ui.dropzone.addEventListener('dragleave', () => ui.dropzone.classList.remove('dragging'));
ui['input-delimiter'].addEventListener('change', () => { externalError = ''; state.setInputDelimiter(ui['input-delimiter'].value); if (state.text !== null) processedMessage(); render(); });
ui['output-delimiter'].addEventListener('change', () => { state.setOutputDelimiter(ui['output-delimiter'].value); say(`Разделитель скачивания: ${separatorName(state.outputDelimiter)}. Таблица сохранена.`); });
for (const [id, key] of [['trim','trim'],['remove-empty','removeEmpty'],['remove-duplicates','removeDuplicates']]) ui[id].addEventListener('change', () => {
  externalError = ''; state.setOptions({ [key]: ui[id].checked });
  if (state.result) processedMessage(); render();
});
function setView(name) { view = name; renderTable(); }
for (const name of ['result', 'source']) {
  const tab = ui['tab-' + name];
  tab.addEventListener('click', () => setView(name));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'result' : event.key === 'End' ? 'source' : view === 'result' ? 'source' : 'result';
    setView(next); ui['tab-' + next].focus();
  });
}
ui['load-demo'].addEventListener('click', async () => {
  if (state.text !== null || loading) return;
  const sequence = ++loadSequence;
  loading = true; externalError = ''; say('Открытие примера…'); render();
  try {
    const response = await fetch('./examples/contacts.csv');
    if (!response.ok) throw new Error('Пример недоступен. Откройте свой CSV.');
    const text = decodeUTF8(await response.arrayBuffer());
    if (sequence !== loadSequence) return;
    state.clear(); state.open(text, 'contacts-demo.csv');
    view = 'result'; fileSize = 'Пример'; processedMessage();
  } catch (error) { if (sequence === loadSequence) { externalError = error.message; say('Выберите файл, чтобы продолжить.'); } }
  finally { if (sequence === loadSequence) { loading = false; render(); } }
});
ui.reset.addEventListener('click', () => {
  loadSequence++; loading = false; state.clear(); fileSize = externalError = ''; view = 'result';
  ui['file-input'].value = ''; say('Откройте CSV или начните с примера.'); render(); ui['open-empty'].focus();
});
ui.download.addEventListener('click', () => {
  if (!state.result || loading) return;
  const blob = new Blob([state.exportCSV()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = node('a'); link.href = url; link.download = outputName();
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  say(`Подготовлен файл «${link.download}» — все ${state.result.stats.outputRows} строк.`);
});
render();
