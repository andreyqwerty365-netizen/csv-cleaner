import { parseCSV, cleanRows, serializeCSV, detectDelimiter } from './csv.mjs';

/** One in-memory file, with independent import and export controls. No DOM or persistence. */
export class CsvWorkspace {
  constructor() { this.clear(); }

  clear() {
    this.text = null;
    this.name = '';
    this.source = this.result = null;
    this.error = '';
    this.inputChoice = 'auto';
    this.inputDelimiter = null;
    this.outputDelimiter = ',';
    this.outputChosen = false;
    this.options = { trim: true, removeEmpty: true, removeDuplicates: true };
  }

  open(text, name) {
    this.text = text;
    this.name = name;
    this.inputChoice = 'auto';
    this.outputChosen = false;
    this.process();
  }

  process() {
    this.source = this.result = null;
    this.inputDelimiter = null;
    this.error = '';
    if (this.text === null) return;
    try {
      const delimiter = this.inputChoice === 'auto' ? detectDelimiter(this.text) : this.inputChoice;
      this.source = parseCSV(this.text, delimiter);
      this.inputDelimiter = delimiter;
      this.result = cleanRows(this.source, this.options);
      if (!this.outputChosen) this.outputDelimiter = delimiter;
    } catch (error) { this.error = error.message; }
  }

  setInputDelimiter(value) {
    if (!['auto', ',', ';'].includes(value)) throw new Error('Некорректный разделитель исходника.');
    this.inputChoice = value;
    this.process();
  }

  setOutputDelimiter(value) {
    if (![',', ';'].includes(value)) throw new Error('Некорректный разделитель скачивания.');
    this.outputDelimiter = value;
    this.outputChosen = true;
  }

  setOptions(settings) {
    for (const key of ['trim', 'removeEmpty', 'removeDuplicates']) {
      if (key in settings) this.options[key] = Boolean(settings[key]);
    }
    if (this.source) this.result = cleanRows(this.source, this.options);
  }

  exportCSV() {
    if (!this.result) throw new Error('Сначала получите корректный результат очистки.');
    return serializeCSV(this.result.rows, this.outputDelimiter);
  }
}
