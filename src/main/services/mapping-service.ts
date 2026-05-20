import Excel from 'exceljs';
import { AccountMappingModel, PaymentMethodModel } from '../../shared/types';
import { normaliseUmlauts } from '../utils/helper-functions';
import { getReadPath, MAPPING_EXCEL_FOLDER, TEMPLATE_FILE_NAME } from '../utils/path-helper';
import { logger } from '../utils/logger';
import fs from 'fs';

export function convertTextToBoolean(value: any): boolean {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['ja', 'yes', 'true'].includes(v)) return true;
    if (['nein', 'no', 'false'].includes(v)) return false;
  }
  return false;
}

export function cleanAccountValue(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\.0$/, '').trim();
}

function createLocationAccountMapping(df: any[][]): Record<string, AccountMappingModel> {
  const mapping: Record<string, AccountMappingModel> = {};

  for (const row of df) {
    let location = row[0];
    let entryType = row[1];

    if (location != null && String(location).trim().length > 0) {
      location = normaliseUmlauts(String(location)).trim().toUpperCase();
    } else {
      location = null;
    }

    if (entryType != null && String(entryType).trim().length > 0) {
      entryType = normaliseUmlauts(String(entryType)).trim().toUpperCase();
      if (location == null) {
        location = String(entryType);
      }
    }

    if (location == null && entryType == null) continue;

    const accountDetails: AccountMappingModel = {
      location: String(location),
      typ: String(entryType),
      account_debit: cleanAccountValue(row[2]),
      account_credit: cleanAccountValue(row[3]),
      vat_code: cleanAccountValue(row[4]),
      include_cost_center: convertTextToBoolean(row[5])
    };

    if (location != null) {
      mapping[String(location).trim().toUpperCase()] = accountDetails;
    }
  }

  return mapping;
}

function createLocationCostCenterMapping(df: any[][]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const row of df) {
    const location = row[0];
    const costCenter = row[1];

    if (location == null || costCenter == null) continue;
    if (String(location).trim().length === 0 || String(costCenter).trim().length === 0) continue;

    const normalisedLocation = normaliseUmlauts(String(location)).trim().toUpperCase();
    mapping[normalisedLocation] = String(costCenter).trim();
  }

  return mapping;
}

function createPaymentMethodMapping(df: any[][]): Record<string, PaymentMethodModel> {
  const mapping: Record<string, PaymentMethodModel> = {};

  if (df.length === 0) return mapping;

  // In this sheet we expect a matrix:
  // first column: locations, remaining columns: payment methods as headers.
  // For each payment type and location combination, create one mapping entry.
  const header = df[0];
  // Skip first column, which contains locations.
  const paymentMethods = header.slice(1);

  for (let i = 1; i < df.length; i++) {
    const row = df[i];
    let location = row[0];

    if (location == null || String(location).trim().length === 0) continue;
    location = normaliseUmlauts(String(location)).trim().toUpperCase();

    for (let j = 0; j < paymentMethods.length; j++) {
      const accountCredit = row[j + 1];
      if (accountCredit == null || String(accountCredit).trim().length === 0) continue;

      const entryType = String(paymentMethods[j]).trim().toUpperCase();
      const mappingKey = `${location}/${entryType}`;
      mapping[mappingKey] = {
        location: String(location),
        typ: entryType,
        account_credit: cleanAccountValue(accountCredit)
      };
    }
  }

  return mapping;
}

export class MappingExcelHandler {
  locationAccountMapping: Record<string, AccountMappingModel> = {};
  locationCostCenterMapping: Record<string, string> = {};
  paymentMethodMapping: Record<string, PaymentMethodModel> = {};
  private loadPromise: Promise<void>;
  private loadError: unknown = null;

  constructor() {
    this.loadPromise = this.loadMappingTemplate().catch((err) => {
      this.loadError = err;
    });
  }

  async ensureLoaded(): Promise<void> {
    await this.loadPromise;
    if (this.loadError) {
      throw this.loadError;
    }
  }

  private async loadMappingTemplate(): Promise<void> {
    const mappingExcelPath = getReadPath(MAPPING_EXCEL_FOLDER, TEMPLATE_FILE_NAME);

    try {
      // Load template Excel file with all sheets.
      const workbook = new Excel.Workbook();
      const buffer = await fs.promises.readFile(mappingExcelPath);
      await workbook.xlsx.load(buffer as any);

      for (const worksheet of workbook.worksheets) {
        const rows: any[][] = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          // Alle Zellenwerte explizit zu String konvertieren (identisch zu pandas dtype=str)
          const values = (Array.isArray(row.values) ? row.values : []).map((cell: any) => {
            if (cell === null || cell === undefined) return '';
            if (typeof cell === 'number') {
              // Zahlen zu String, aber ohne trailing .0 (wie in Python)
              return Number.isInteger(cell) ? String(cell) : String(cell);
            }
            return String(cell);
          });
          rows.push(values.slice(1));
        });

        const sheetName = worksheet.name.toLowerCase();
        if (sheetName === 'ort_konten') {
          this.locationAccountMapping = createLocationAccountMapping(rows);
        } else if (sheetName === 'kostenstellen') {
          this.locationCostCenterMapping = createLocationCostCenterMapping(rows);
        } else if (sheetName === 'kasse_ort_zahlungsmittel') {
          this.paymentMethodMapping = createPaymentMethodMapping(rows);
        } else {
          logger.warn(`Unbekanntes Sheet '${worksheet.name}' in Mapping-Template, wird ignoriert.`);
        }
      }

      logger.info(`Mapping-Template geladen: ${Object.keys(this.locationAccountMapping).length} Konto-Mappings, ${Object.keys(this.locationCostCenterMapping).length} Kostenstellen, ${Object.keys(this.paymentMethodMapping).length} Zahlungsmittel`);
    } catch (err) {
      logger.error(`Mapping-Template nicht gefunden oder fehlerhaft: ${mappingExcelPath}`);
      throw err;
    }
  }
}
