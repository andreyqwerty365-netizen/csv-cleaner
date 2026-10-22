import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, cleanRows, serializeCSV, decodeUTF8, MAX_BYTES } from '../src/csv.mjs';

test('reads UTF-8 BOM, semicolon separator and CRLF without phantom final row', () => {
  assert.deepEqual(parseCSV('\uFEFFИмя;Город\r\nАнна;Москва\r\n', ';'), [['Имя', 'Город'], ['Анна', 'Москва']]);
});
test('preserves quoted separators, escaped quotes, embedded CRLF and empty final fields', () => {
  assert.deepEqual(parseCSV('name,note,empty\n"Ли, Анна","Он сказал ""да""\r\nсегодня",\n'),
    [['name', 'note', 'empty'], ['Ли, Анна', 'Он сказал "да"\r\nсегодня', '']]);
});
test('accepts header-only CSV', () => assert.deepEqual(parseCSV('Имя,Email'), [['Имя', 'Email']]));
test('keeps intentional blank rows', () => {
  assert.deepEqual(parseCSV('a,b\n\n,\n1,2\n'), [['a', 'b'], [''], ['', ''], ['1', '2']]);
});
test('rejects empty input and missing headers', () => {
  for (const input of ['', '\uFEFF', '\n', ',\n', '   ']) assert.throws(() => parseCSV(input), /заголов|пуст/i);
});
test('rejects unterminated quotes instead of silently changing values', () => assert.throws(() => parseCSV('a,b\n"one,two'), /кавыч/i));
test('rejects unexpected quotes and trailing characters after closing quote', () => {
  for (const input of ['a,b\nfi"rst,second', 'a,b\n"first"bad,second']) assert.throws(() => parseCSV(input), /кавыч/i);
});
test('rejects ragged nonblank records with a useful row number', () => assert.throws(() => parseCSV('a,b\n1,2,3'), /строка 2/i));
test('rejects unsupported delimiter', () => assert.throws(() => parseCSV('a|b', '|'), /разделител/i));
test('trims before filtering and preserves source and row order', () => {
  const source = [[' Имя ', 'Email'], [' Анна ', 'a@example.test '], [' ', ''], ['Анна', 'a@example.test'], ['Борис', 'b@example.test']];
  const snapshot = structuredClone(source);
  const result = cleanRows(source);
  assert.deepEqual(result.rows, [['Имя', 'Email'], ['Анна', 'a@example.test'], ['Борис', 'b@example.test']]);
  assert.deepEqual(result.stats, { inputRows: 4, outputRows: 2, removedEmpty: 1, removedDuplicates: 1, trimmedCells: 4 });
  assert.deepEqual(source, snapshot);
});
test('each cleanup can be disabled, including preservation of exact whitespace', () => {
  const rows = [['header'], [' a '], ['a'], ['a'], ['']];
  assert.deepEqual(cleanRows(rows, { trim: false, removeEmpty: false, removeDuplicates: false }).rows, rows);
  assert.equal(cleanRows(rows, { trim: false, removeEmpty: true, removeDuplicates: false }).stats.outputRows, 3);
  assert.deepEqual(cleanRows(rows, { trim: true, removeEmpty: false, removeDuplicates: true }).rows, [['header'], ['a'], ['']]);
});
test('deduplicates complete rows, preserves case and does not compare with headers', () => {
  const rows = [['a', 'b'], ['a', 'b'], ['a', 'c'], ['A', 'b'], ['a', 'b']];
  assert.deepEqual(cleanRows(rows).rows, rows.slice(0, 4));
});
test('does not mistake a string zero for an empty row', () => assert.deepEqual(cleanRows([['h'], ['0'], ['']]).rows, [['h'], ['0']]));
test('serializes and parses exact cell values with either delimiter', () => {
  const rows = [['Имя', 'Комментарий'], ['Анна', '  A;B,C "quote"\r\nnext  '], ['', '0'], ['']];
  for (const delimiter of [',', ';']) assert.deepEqual(parseCSV(serializeCSV(rows, delimiter), delimiter), rows);
});
test('export includes BOM and CRLF for spreadsheet compatibility', () => {
  assert.equal(serializeCSV([['a', 'b'], ['1', '2']]), '\uFEFFa,b\r\n1,2\r\n');
});
test('decodes UTF-8 without replacing invalid bytes', () => {
  assert.equal(decodeUTF8(new TextEncoder().encode('\uFEFFПривет')), 'Привет');
  assert.throws(() => decodeUTF8(Uint8Array.of(0xff, 0xfe, 0x61, 0)), /UTF-8/i);
});
test('rejects files larger than 5 MiB', () => assert.throws(() => decodeUTF8(new Uint8Array(MAX_BYTES + 1)), /5 МБ/));
test('does not infer numbers, formulas, dates, or leading zeros', () => {
  const rows = [['code', 'value'], ['00123', '=1+2'], ['2026-01-01', '1,20']];
  assert.deepEqual(parseCSV(serializeCSV(cleanRows(rows).rows)), rows);
});
