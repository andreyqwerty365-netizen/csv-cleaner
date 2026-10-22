export const MAX_BYTES = 5 * 1024 * 1024;

function checkDelimiter(delimiter) {
  if (delimiter !== ',' && delimiter !== ';') throw new Error('Выберите разделитель: запятая или точка с запятой.');
}

/** A strict CSV state machine. Cell strings are never converted to numbers or dates. */
export function parseCSV(input, delimiter = ',') {
  checkDelimiter(delimiter);
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let state = 'field';
  const quoteError = () => new Error(`Строка ${rows.length + 1}: проверьте кавычки. Внутри ячейки кавычка записывается дважды.`);
  const endRow = () => {
    rows.push([...row, cell]);
    row = [];
    cell = '';
    state = 'field';
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else state = 'closed';
      continue;
    }
    if (state === 'closed' && char !== delimiter && char !== '\r' && char !== '\n') throw quoteError();
    if (char === delimiter) {
      row.push(cell);
      cell = '';
      state = 'field';
    } else if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"') {
      if (cell.length) throw quoteError();
      state = 'quoted';
    } else cell += char;
  }
  if (state === 'quoted') throw quoteError();
  if (row.length || cell.length || state === 'closed') endRow();
  if (!rows.length || rows[0].every(value => value.trim() === '')) {
    throw new Error('CSV пуст или не содержит заголовков. Первая строка должна содержать названия столбцов.');
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length !== rows[0].length && rows[i].some(value => value.trim() !== '')) {
      throw new Error(`Строка ${i + 1}: найдено ${rows[i].length} ячеек, ожидалось ${rows[0].length}. Проверьте разделитель и кавычки.`);
    }
  }
  return rows;
}

export function cleanRows(source, options = {}) {
  const settings = { trim: true, removeEmpty: true, removeDuplicates: true, ...options };
  const stats = { inputRows: source.length - 1, outputRows: 0, removedEmpty: 0, removedDuplicates: 0, trimmedCells: 0 };
  const changes = source.map((_, sourceIndex) => ({ sourceIndex, trimmedCells: [], removed: null, duplicateOf: null }));
  const mapped = source.map((row, rowIndex) => row.map((value, columnIndex) => {
    const next = settings.trim ? value.trim() : value;
    if (next !== value) { stats.trimmedCells++; changes[rowIndex].trimmedCells.push(columnIndex); }
    return next;
  }));
  const rows = [mapped[0]];
  const sourceIndices = [0];
  const seen = new Map();
  for (let index = 1; index < mapped.length; index++) {
    const row = mapped[index];
    if (settings.removeEmpty && row.every(value => value.trim() === '')) { stats.removedEmpty++; changes[index].removed = 'empty'; continue; }
    const key = JSON.stringify(row);
    if (settings.removeDuplicates && seen.has(key)) {
      stats.removedDuplicates++;
      changes[index].removed = 'duplicate';
      changes[index].duplicateOf = seen.get(key);
      continue;
    }
    if (!seen.has(key)) seen.set(key, index);
    rows.push(row);
    sourceIndices.push(index);
  }
  stats.outputRows = rows.length - 1;
  return { rows, stats, changes, sourceIndices };
}

/** Determine structure by parsing both supported formats, never by counting quoted punctuation. */
export function detectDelimiter(text) {
  const candidates = [',', ';'].map(delimiter => {
    try { return { delimiter, rows: parseCSV(text, delimiter) }; }
    catch (error) { return { delimiter, error }; }
  });
  const structured = candidates.filter(candidate => candidate.rows?.[0].length > 1);
  if (structured.length === 1) return structured[0].delimiter;
  if (structured.length > 1) throw new Error('Не удалось однозначно определить столбцы. Выберите разделитель исходного файла: запятую или точку с запятой.');
  let quoted = false;
  const outside = new Set();
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '"') {
      if (quoted && text[index + 1] === '"') { index++; continue; }
      quoted = !quoted;
    } else if (!quoted && [',', ';'].includes(text[index])) outside.add(text[index]);
  }
  // A broken multi-column file must not silently become a successful one-column import.
  const malformed = candidates.find(candidate => candidate.error && outside.has(candidate.delimiter));
  if (malformed) throw malformed.error;
  const valid = candidates.find(candidate => candidate.rows);
  if (valid) return valid.delimiter;
  throw candidates[0].error;
}

export function serializeCSV(rows, delimiter = ',') {
  checkDelimiter(delimiter);
  const escape = value => {
    const text = String(value);
    return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return '\uFEFF' + rows.map(row => row.map(escape).join(delimiter)).join('\r\n') + '\r\n';
}

export function decodeUTF8(bytes) {
  if (bytes.byteLength > MAX_BYTES) throw new Error('Файл больше 5 МБ. Разделите выгрузку на несколько CSV.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Не удалось прочитать UTF-8. Сохраните таблицу в формате CSV UTF-8 и выберите файл снова.'); }
}
