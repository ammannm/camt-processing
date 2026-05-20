import Excel from 'exceljs';
import { FinalExportDataModel } from '../../shared/types';
import { logger } from '../utils/logger';
import { getWritePath, OUTPUT_FOLDER } from '../utils/path-helper';

const TEXT_FORMAT = '@';
const NUMBER_FORMAT = '#0';
const DECIMAL_FORMAT_2 = '#,##0.00';
const DECIMAL_FORMAT_6 = '#,##0.000000';

export class ExportService {
  async export(fileName: string, data: FinalExportDataModel[]): Promise<string> {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Buchungen');

    this.addHeaders(worksheet);

    for (const row of data) {
      worksheet.addRow([
        row.booking_date,
        row.document_number,
        row.document_date,
        row.debit_account,
        row.credit_account,
        row.vat_code,
        row.currency,
        row.amount_foreign_currency,
        row.amount_base_currency,
        row.exchange_rate,
        row.text,
        row.additional_text || '',
        row.profit_center_debit || '',
        row.profit_center_credit || ''
      ]);
    }

    this.applyColumnFormats(worksheet);
    this.autosizeColumns(worksheet);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const outputPath = getWritePath(OUTPUT_FOLDER, fileName);
    await workbook.xlsx.writeFile(outputPath);
    logger.info(`Exported ${data.length} rows to ${outputPath}`);

    return outputPath;
  }

  private addHeaders(ws: Excel.Worksheet): void {
    ws.addRow([
      'Buchungsdatum',
      'Beleg-Nr.',
      'Belegdatum',
      'Konto Soll',
      'Konto Haben',
      'MWSt-Code',
      'Währung',
      'Betrag FW',
      'Betrag BW',
      'Kurs',
      'Text',
      'Zusatztext',
      'PC Soll',
      'PC Haben'
    ]);

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'left' };
  }

  private applyColumnFormats(ws: Excel.Worksheet): void {
    const textColumns = new Set([1, 2, 3, 4, 5, 7, 11, 12, 13, 14]);
    const numberColumns = new Set([6]);
    const decimal2Columns = new Set([8, 9]);
    const decimal6Columns = new Set([10]);

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (textColumns.has(colNumber)) {
          // Entscheidend für Werte wie "0000".
          cell.value = cell.value == null ? '' : String(cell.value);
          cell.numFmt = TEXT_FORMAT;
          cell.alignment = { horizontal: 'left' };
          return;
        }

        if (numberColumns.has(colNumber)) {
          cell.value = this.normalizeNumber(cell.value);
          cell.numFmt = NUMBER_FORMAT;
          cell.alignment = { horizontal: 'right' };
          return;
        }

        if (decimal2Columns.has(colNumber)) {
          cell.numFmt = DECIMAL_FORMAT_2;
          cell.alignment = { horizontal: 'right' };
          return;
        }

        if (decimal6Columns.has(colNumber)) {
          cell.numFmt = DECIMAL_FORMAT_6;
          cell.alignment = { horizontal: 'right' };
        }
      });
    });
  }

  private normalizeNumber(value: Excel.CellValue): number {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isNaN(value) ? 0 : value;
    if (typeof value === 'string' && ['', 'None', 'nan', 'NaN'].includes(value.trim())) return 0;

    const numberValue = Number(value);
    return Number.isNaN(numberValue) ? 0 : numberValue;
  }

  private autosizeColumns(ws: Excel.Worksheet): void {
    ws.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const value = cell.value == null ? '' : String(cell.value);
        maxLength = Math.max(maxLength, value.length + 2);
      });
      column.width = Math.min(Math.max(maxLength, 10), 40);
    });
  }
}
