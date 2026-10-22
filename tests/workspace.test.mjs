import test from 'node:test';
import assert from 'node:assert/strict';
import * as csv from '../src/csv.mjs';

async function workspaceClass() {
  const module = await import('../src/workspace.mjs').catch(() => ({}));
  assert.equal(typeof module.CsvWorkspace, 'function', 'A CSV session must keep import and export settings independent');
  return module.CsvWorkspace;
}

test('detects separators outside quoted cells, including embedded records', () => {
  assert.equal(typeof csv.detectDelimiter, 'function');
  for (const [text, expected] of [
    ['name,note\nАнна,"a;b\nc;d"\n', ','],
    ['\uFEFFname;note\r\nАнна;"a,b"\r\n', ';'],
    ['a;b\n\n1;2\n', ';'],
    ['header\n"a,b;c"\n', ','],
  ]) assert.equal(csv.detectDelimiter(text), expected);
});

test('ambiguous and malformed imports require an explicit choice or correction', () => {
  assert.equal(typeof csv.detectDelimiter, 'function');
  assert.throws(() => csv.detectDelimiter('a,b;c\n1,2;3\n'), /выберите.*разделитель/i);
  assert.throws(() => csv.detectDelimiter('a,b\n"broken'), /кавыч/i);
  assert.throws(() => csv.detectDelimiter(''), /пуст|заголов/i);
});

test('cleaning annotations track original records without changing values', () => {
  const input = [[' Имя ', 'Заметка'], [' Анна ', ' a '], [' ', ''], ['Анна', 'a'], ['Борис', 'b']];
  const original = structuredClone(input);
  const cleaned = csv.cleanRows(input);
  assert.ok(Array.isArray(cleaned.changes));
  assert.deepEqual(cleaned.sourceIndices, [0, 1, 4]);
  assert.deepEqual(cleaned.changes.map(row => row.removed), [null, null, 'empty', 'duplicate', null]);
  assert.deepEqual(cleaned.changes[1].trimmedCells, [0, 1]);
  assert.equal(cleaned.changes[3].duplicateOf, 1);
  assert.deepEqual(input, original);
  const restored = csv.cleanRows(input, { trim: false, removeEmpty: false, removeDuplicates: false });
  assert.deepEqual(restored.rows, input);
  assert.ok(restored.changes.every(row => row.removed === null && row.trimmedCells.length === 0));
});

test('CSV-01: export separator never reparses the imported table', async () => {
  const CsvWorkspace = await workspaceClass();
  const state = new CsvWorkspace();
  state.open('name,note\nАнна,"a,b; c"\n', 'contacts.csv');
  assert.equal(state.error, '');
  assert.equal(state.inputDelimiter, ',');
  const rows = structuredClone(state.result.rows);
  for (const delimiter of [';', ',', ';']) {
    state.setOutputDelimiter(delimiter);
    assert.equal(state.error, '');
    assert.deepEqual(state.source, rows);
    assert.deepEqual(state.result.rows, rows);
    assert.deepEqual(csv.parseCSV(state.exportCSV(), delimiter), rows);
  }
});

test('input errors retain the file for correction and prevent stale downloads', async () => {
  const CsvWorkspace = await workspaceClass();
  const state = new CsvWorkspace();
  const text = 'name,note\nАнна,"a,b"\n';
  state.open(text, 'data.csv');
  state.setInputDelimiter(';');
  assert.match(state.error, /кавыч/);
  assert.equal(state.text, text);
  assert.equal(state.name, 'data.csv');
  assert.equal(state.result, null);
  assert.throws(() => state.exportCSV(), /результат/i);
  state.setInputDelimiter(',');
  assert.equal(state.error, '');
  assert.equal(state.result.stats.outputRows, 1);
});

test('export follows import until explicitly chosen, cleanup is reversible, reset is complete', async () => {
  const CsvWorkspace = await workspaceClass();
  const state = new CsvWorkspace();
  state.open('a;b\n x ;y\n\n x ;y\n', 'one.csv');
  assert.equal(state.outputDelimiter, ';');
  assert.equal(state.result.stats.outputRows, 1);
  state.setOptions({ trim: false, removeEmpty: false, removeDuplicates: false });
  assert.deepEqual(state.result.rows, state.source);
  state.setOutputDelimiter(',');
  state.setInputDelimiter(';');
  assert.equal(state.outputDelimiter, ',');
  state.clear();
  assert.equal(state.text, null);
  assert.equal(state.source, null);
  assert.equal(state.result, null);
  assert.equal(state.name, '');
  state.open('a;b\n1;2\n', 'two.csv');
  assert.equal(state.outputDelimiter, ';');
});
