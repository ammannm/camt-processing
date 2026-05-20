import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { normaliseUmlauts } from '../utils/helper-functions';
import { partialRatio } from '../utils/fuzzy';
import {
  FILE_FOLDER, OUTPUT_FOLDER, PROCESSED_INPUT_SUBFOLDER, FAILED_INPUT_SUBFOLDER,
  ensureAppDir, getAppDir, getAppDirPath
} from '../utils/path-helper';
import { XMLService, NonCamt053Error } from './xml-service';
import { MappingExcelHandler } from './mapping-service';
import { getTransactionType } from './transaction-type-detector';
import {
  parseUnknownTransaction, parseManualTransaction, parseCashRegisterSystemTransaction,
  parseEftPosCreditTransaction, parseEftPosExpensesTransaction, parseOwnAccountDepositTransaction,
  parseRentTransaction, parseTwintTransaction, parseTransferTransaction,
  parseCreditAccountManagementTransaction, parseCreditCashDepositsTransaction
} from './transaction-parsers';
import { ExportService } from './export-service';
import { BaseTransactionModel, TransactionModel, TransactionType, FinalExportDataModel, AccountMappingModel } from '../../shared/types';

export function formatDateForExport(value: string): string {
  if (!value) return '';

  const datePart = value.includes('T') ? value.split('T')[0] : value;
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  return `${match[3]}.${match[2]}.${match[1]}`;
}

export interface ProcessingProgress {
  phase: string;
  message: string;
  filesTotal: number;
  filesHandled: number;
  filesProcessed: number;
  filesFailed: number;
  filesIgnored: number;
}

export interface ProcessingSummary {
  statusMessage: string;
  inputTotalFiles: number;
  inputProcessedFiles: number;
  inputFailedFiles: number;
  inputIgnoredFiles: number;
  transactionsTotal: number;
  transactionsParsedSuccess: number;
  transactionsParsedFailed: number;
  transactionsParsedManual: number;
  bookingRowsSuccess: number;
  bookingRowsManual: number;
  bookingRowsFailed: number;
  outputFiles: string[];
  outputDirectory: string | null;
  hadError: boolean;
}

export type ProgressCallback = (progress: ProcessingProgress) => void;

export class MainLogic {
  private excelHandler: MappingExcelHandler;
  private xmlService: XMLService;
  private exportService: ExportService;

  constructor() {
    this.excelHandler = new MappingExcelHandler();
    this.xmlService = new XMLService();
    this.exportService = new ExportService();
  }

  private reportProgress(
    callback: ProgressCallback | null,
    { phase, message, summary, filesHandled }: { phase: string; message: string; summary: ProcessingSummary; filesHandled: number }
  ): void {
    if (!callback) return;
    try {
      callback({
        phase,
        message,
        filesTotal: summary.inputTotalFiles,
        filesHandled,
        filesProcessed: summary.inputProcessedFiles,
        filesFailed: summary.inputFailedFiles,
        filesIgnored: summary.inputIgnoredFiles
      });
    } catch (err) {
      logger.error('Progress callback failed');
    }
  }

  async process(progressCallback: ProgressCallback | null = null): Promise<ProcessingSummary> {
    const summary: ProcessingSummary = {
      statusMessage: '',
      inputTotalFiles: 0,
      inputProcessedFiles: 0,
      inputFailedFiles: 0,
      inputIgnoredFiles: 0,
      transactionsTotal: 0,
      transactionsParsedSuccess: 0,
      transactionsParsedFailed: 0,
      transactionsParsedManual: 0,
      bookingRowsSuccess: 0,
      bookingRowsManual: 0,
      bookingRowsFailed: 0,
      outputFiles: [],
      outputDirectory: null,
      hadError: false
    };

    logger.info('Processing data started');
    await this.excelHandler.ensureLoaded();

    const inputDir = getAppDirPath(FILE_FOLDER);
    const inputDirExists = fs.existsSync(inputDir);
    ensureAppDir(FILE_FOLDER);

    if (!inputDirExists) {
      summary.statusMessage = 'Bankdateien Ordner erstellt. Bitte CAMT.053-Dateien einfügen und erneut starten.';
      logger.info(summary.statusMessage);
      this.reportProgress(progressCallback, { phase: 'setup', message: summary.statusMessage, summary, filesHandled: 0 });
      return summary;
    }

    const processedDir = path.join(inputDir, PROCESSED_INPUT_SUBFOLDER);
    const failedDir = path.join(inputDir, FAILED_INPUT_SUBFOLDER);
    fs.mkdirSync(processedDir, { recursive: true });
    fs.mkdirSync(failedDir, { recursive: true });

    const files = fs.readdirSync(inputDir);
    const xmlFiles = files
      .filter(f => f.toLowerCase().endsWith('.xml'))
      .map(f => path.join(inputDir, f))
      .sort();

    summary.inputTotalFiles = xmlFiles.length;

    if (xmlFiles.length === 0) {
      summary.statusMessage = `Keine Bankdateien (XML-Dateien) in '${inputDir}' gefunden.`;
      logger.info(summary.statusMessage);
      this.reportProgress(progressCallback, { phase: 'scan', message: summary.statusMessage, summary, filesHandled: 0 });
      return summary;
    }

    let transactionList: BaseTransactionModel[] = [];
    let handledFileCount = 0;

    this.reportProgress(progressCallback, {
      phase: 'scan',
      message: `${xmlFiles.length} Bankdateien (XML-Dateien) gefunden. Verarbeitung gestartet.`,
      summary,
      filesHandled: 0
    });

    // 1. Parse the CAMT.53 files and collect transactions.
    // 2. Normalize transaction content.
    // 3. Detect transaction type and parse text into normalized models.
    // 4. Split successful, failed and manual-review transactions.
    // 5. Map to final export format and enrich from the mapping Excel file.
    // 6. Export successful, failed and manual-review rows to separate Excel files.
    for (const filePath of xmlFiles) {
      const fileName = path.basename(filePath);
      try {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        const parsed = this.xmlService.parse(data, fileName);
        if (parsed.transactions.length > 0) {
          transactionList.push(...parsed.transactions);
        }

        const movedPath = this.moveFileWithConflictResolution(filePath, processedDir);
        summary.inputProcessedFiles++;
        logger.info(`Processed XML '${fileName}' and moved it to '${movedPath}'`);
        handledFileCount++;
        this.reportProgress(progressCallback, {
          phase: 'parse',
          message: `Datei verarbeitet: ${fileName}`,
          summary,
          filesHandled: handledFileCount
        });
      } catch (err) {
        if (err instanceof NonCamt053Error) {
          summary.inputIgnoredFiles++;
          logger.warn(`Skipping non CAMT.053 XML '${fileName}': ${err.message}`);
          try {
            const movedPath = this.moveFileWithConflictResolution(filePath, failedDir);
            logger.info(`Moved non CAMT.053 XML '${fileName}' to '${movedPath}'`);
          } catch (moveErr) {
            logger.error(`Could not move non CAMT.053 XML '${fileName}'`);
          }
        } else {
          summary.inputFailedFiles++;
          logger.error(`Error while processing XML '${fileName}': ${err}`);
          try {
            const movedPath = this.moveFileWithConflictResolution(filePath, failedDir);
            logger.info(`Moved faulty XML '${fileName}' to '${movedPath}'`);
          } catch (moveErr) {
            logger.error(`Could not move faulty XML '${fileName}'`);
          }
        }
        handledFileCount++;
        this.reportProgress(progressCallback, {
          phase: 'parse',
          message: err instanceof NonCamt053Error ? `Datei ignoriert (kein CAMT.053): ${fileName}` : `Datei fehlerhaft: ${fileName}`,
          summary,
          filesHandled: handledFileCount
        });
      }
    }

    logger.info(`Input file summary: processed=${summary.inputProcessedFiles}, failed=${summary.inputFailedFiles}, ignored=${summary.inputIgnoredFiles}`);

    if (transactionList.length === 0) {
      summary.statusMessage = 'Keine gültigen Transaktionen aus den XML-Dateien gelesen. Export übersprungen.';
      logger.warn(summary.statusMessage);
      this.reportProgress(progressCallback, { phase: 'done', message: summary.statusMessage, summary, filesHandled: handledFileCount });
      return summary;
    }

    transactionList = this.normalizeTransactions(transactionList);

    let successfullyParsed: TransactionModel[] = [];
    let failedParsed: TransactionModel[] = [];
    let manualParsed: TransactionModel[] = [];

    try {
      const result = this.handleTransactions(transactionList);
      successfullyParsed = result.success;
      failedParsed = result.failed;
      manualParsed = result.manual;

      summary.transactionsTotal = transactionList.length;
      summary.transactionsParsedSuccess = successfullyParsed.length;
      summary.transactionsParsedFailed = failedParsed.length;
      summary.transactionsParsedManual = manualParsed.length;
    } catch (err) {
      logger.error(`Error during transaction normalization and parsing: ${err}`);
      summary.hadError = true;
      summary.statusMessage = 'Fehler bei der Normalisierung oder dem Parsing der Transaktionen. Details im Log.';
      this.reportProgress(progressCallback, { phase: 'done', message: summary.statusMessage, summary, filesHandled: handledFileCount });
      return summary;
    }

    this.reportProgress(progressCallback, {
      phase: 'mapping',
      message: 'Transaktionen werden gemappt und exportiert...',
      summary,
      filesHandled: handledFileCount
    });

    try {
      const successTransactions: FinalExportDataModel[] = [];
      const manualTransactions: FinalExportDataModel[] = [];
      const failedTransactions: FinalExportDataModel[] = [];

      // Map successfully parsed transactions and filter out failed ones.
      const [successMapped, failedMapped] = this.mapAndFilterFailed(successfullyParsed, true);
      successTransactions.push(...successMapped);
      failedTransactions.push(...failedMapped);

      // Map manual-review transactions and filter out rows that still fail mapping.
      const [manualMapped, failedManualMapped] = this.mapAndFilterFailed(manualParsed, false);
      manualTransactions.push(...manualMapped);
      failedTransactions.push(...failedManualMapped);

      // Map failed parsed transactions for manual review/export diagnostics.
      const [failedMapped2, failedMapped2Failed] = this.mapAndFilterFailed(failedParsed, false);
      failedTransactions.push(...failedMapped2);
      failedTransactions.push(...failedMapped2Failed);

      const currentDate = new Date();
      // Format: DDMMYYYY_HHMM (identisch zu Python: datetime.now().strftime("%d%m%Y_%H%M"))
      const day = String(currentDate.getDate()).padStart(2, '0');
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const year = String(currentDate.getFullYear());
      const hours = String(currentDate.getHours()).padStart(2, '0');
      const minutes = String(currentDate.getMinutes()).padStart(2, '0');
      const timestamp = `${day}${month}${year}_${hours}${minutes}`;

      const successfulFileName = `${timestamp}_erfolgreich_dt_import.xlsx`;
      const manualFileName = `${timestamp}_zu_prüfen_dt_import.xlsx`;
      const failedFileName = `${timestamp}_fehlgeschlagene_dt_import.xlsx`;

      summary.outputFiles = [];

      // Export mapped transactions to separate Excel files for successful, failed and manual-review rows.
      if (successTransactions.length > 0) {
        const successPath = await this.exportService.export(successfulFileName, successTransactions);
        summary.outputFiles.push(path.basename(successPath));
      }

      if (manualTransactions.length > 0) {
        const manualPath = await this.exportService.export(manualFileName, manualTransactions);
        summary.outputFiles.push(path.basename(manualPath));
      }

      if (failedTransactions.length > 0) {
        const failedPath = await this.exportService.export(failedFileName, failedTransactions);
        summary.outputFiles.push(path.basename(failedPath));
      }

      summary.bookingRowsSuccess = successTransactions.length;
      summary.bookingRowsManual = manualTransactions.length;
      summary.bookingRowsFailed = failedTransactions.length;
      summary.outputDirectory = getAppDir();
      summary.statusMessage = 'Verarbeitung abgeschlossen.';

      this.reportProgress(progressCallback, {
        phase: 'done',
        message: summary.statusMessage,
        summary,
        filesHandled: handledFileCount
      });
    } catch (err) {
      logger.error(`Error during mapping and exporting: ${err}`);
      summary.hadError = true;
      summary.statusMessage = 'Fehler beim Mapping oder Export. Details im Log.';
      this.reportProgress(progressCallback, { phase: 'done', message: summary.statusMessage, summary, filesHandled: handledFileCount });
    }

    return summary;
  }

  private normalizeTransactions(transactions: BaseTransactionModel[]): BaseTransactionModel[] {
    for (const tx of transactions) {
      if (tx.additional_text) {
        // Normalize the additional text: strip leading/trailing whitespace,
        // collapse multiple spaces, uppercase for comparison, then normalise umlauts.
        const normalized = tx.additional_text.split(/\s+/).join(' ').toUpperCase();
        tx.additional_text = normaliseUmlauts(normalized);
      }
    }
    return transactions;
  }

  private moveFileWithConflictResolution(filePath: string, targetDir: string): string {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const fileName = path.basename(filePath);
    let targetPath = path.join(targetDir, fileName);

    if (!fs.existsSync(targetPath)) {
      fs.renameSync(filePath, targetPath);
      return targetPath;
    }

    const stem = path.parse(fileName).name;
    const suffix = path.parse(fileName).ext;
    // Format: YYYYMMDD_HHMMSS (identisch zu Python: datetime.now().strftime("%Y%m%d_%H%M%S"))
    const now = new Date();
    const tsYear = String(now.getFullYear());
    const tsMonth = String(now.getMonth() + 1).padStart(2, '0');
    const tsDay = String(now.getDate()).padStart(2, '0');
    const tsHours = String(now.getHours()).padStart(2, '0');
    const tsMinutes = String(now.getMinutes()).padStart(2, '0');
    const tsSeconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${tsYear}${tsMonth}${tsDay}_${tsHours}${tsMinutes}${tsSeconds}`;

    let counter = 1;
    while (true) {
      targetPath = path.join(targetDir, `${stem}_${timestamp}_${counter}${suffix}`);
      if (!fs.existsSync(targetPath)) {
        fs.renameSync(filePath, targetPath);
        return targetPath;
      }
      counter++;
    }
  }

  private handleTransactions(baseTransactions: BaseTransactionModel[]): { success: TransactionModel[]; failed: TransactionModel[]; manual: TransactionModel[] } {
    const success: TransactionModel[] = [];
    const failed: TransactionModel[] = [];
    const manual: TransactionModel[] = [];

    const parsers: Partial<Record<TransactionType, (tx: TransactionModel) => TransactionModel>> = {
      [TransactionType.UNKNOWN]: parseUnknownTransaction,
      [TransactionType.MANUAL]: parseManualTransaction,
      [TransactionType.OWN_ACCOUNT_DEPOSIT]: parseOwnAccountDepositTransaction,
      [TransactionType.TRANSFER]: parseTransferTransaction,
      [TransactionType.RENT]: parseRentTransaction,
      [TransactionType.TWINT]: parseTwintTransaction,
      [TransactionType.CASH_REGISTER_SYSTEM]: parseCashRegisterSystemTransaction,
      [TransactionType.EFT_POS_CREDIT]: parseEftPosCreditTransaction,
      [TransactionType.EFT_POS_EXPENSES]: parseEftPosExpensesTransaction,
      [TransactionType.CREDIT_ACCOUNT_MANAGEMENT]: parseCreditAccountManagementTransaction,
      [TransactionType.CREDIT_CASH_DEPOSITS]: parseCreditCashDepositsTransaction,
    };

    for (const baseTx of baseTransactions) {
      const txType = getTransactionType(baseTx) ?? TransactionType.UNKNOWN;
      const tx: TransactionModel = {
        base: baseTx,
        item_type: txType,
        currency: baseTx.currency,
        has_error: false
      };

      const parser = parsers[txType];
      if (!parser) {
        failed.push(tx);
        continue;
      }

      const parsed = parser(tx);
      if (!parsed) {
        failed.push(tx);
      } else if (txType === TransactionType.MANUAL || txType === TransactionType.UNKNOWN) {
        manual.push(parsed);
      } else {
        if (parsed.has_error) {
          failed.push(parsed);
        } else {
          success.push(parsed);
        }
      }
    }

    return { success, failed, manual };
  }

  private mapAndFilterFailed(transactionList: TransactionModel[], errorCheck: boolean): [FinalExportDataModel[], FinalExportDataModel[]] {
    const mapped = this.mapAndConvert(transactionList);
    const failed: FinalExportDataModel[] = [];
    const success: FinalExportDataModel[] = [];

    for (const posting of mapped) {
      if (errorCheck && posting.has_error) {
        failed.push(posting);
      } else {
        success.push(posting);
      }
    }

    return [success, failed];
  }

  private mapAndConvert(transactionList: TransactionModel[]): FinalExportDataModel[] {
    const postings: FinalExportDataModel[] = [];

    for (const tx of transactionList) {
      const location = tx.location;
      const bookingDate = tx.base.booking_date;
      const documentNumber = '1';
      const documentDate = tx.base.booking_date;
      let debitAccount: string | undefined;
      let creditAccount: string | undefined;
      let vatCode: string | undefined;
      const currency = tx.currency ?? '';
      const amountForeignCurrency = tx.debit_credit_amount;
      const amountBaseCurrency = tx.debit_credit_amount;
      // Placeholder, should be calculated if necessary.
      const exchangeRate = 1;
      const transactionText = tx.transaction_text ?? '';
      let profitCenterDebit: string | undefined;
      let missingCostCenterError: string | undefined;
      const paymentType = tx.payment_type;

      const accountDetails = this.getAccountMappingFromLocation(tx.item_type, location);
      if (accountDetails) {
        if (accountDetails.include_cost_center) {
          const costCenter = this.getCostCenterFromLocation(location);
          if (costCenter) {
            profitCenterDebit = costCenter;
          }
          if (!costCenter) {
            missingCostCenterError = 'Kostenstelle erforderlich, aber nicht gefunden. Bitte Ort und Kostenstelle im Excel ergänzen.';
          }
        }

        if (accountDetails.account_debit) debitAccount = accountDetails.account_debit;
        if (accountDetails.account_credit) creditAccount = accountDetails.account_credit;
        if (accountDetails.vat_code) vatCode = accountDetails.vat_code;
      }

      if (paymentType) {
        // Try to get credit account from payment method mapping as fallback for cash register system transactions.
        const creditAccountFromPaymentMethod = this.getAccountByPaymentMethod(location ?? '', paymentType);
        if (creditAccountFromPaymentMethod) {
          creditAccount = creditAccountFromPaymentMethod;
        }
        debitAccount = '1005';
        vatCode = '0';
      }

      if (tx.fee_amount != null) {
        // Create second entry for fee amount.
        const accountDetailsForFee = this.getAccountMappingFromLocation(TransactionType.COMMISSION);
        let feeProfitCenterDebit: string | undefined;
        if (accountDetailsForFee?.include_cost_center) {
          const costCenter = this.getCostCenterFromLocation(location);
          if (costCenter) feeProfitCenterDebit = costCenter;
        }

        const feePosting: FinalExportDataModel = {
          booking_date: formatDateForExport(bookingDate),
          document_number: documentNumber,
          document_date: formatDateForExport(documentDate),
          debit_account: accountDetailsForFee?.account_debit ?? '',
          credit_account: accountDetailsForFee?.account_credit ?? '',
          vat_code: vatCode ?? '',
          currency: tx.base.currency,
          amount_foreign_currency: tx.fee_amount,
          amount_base_currency: tx.fee_amount,
          exchange_rate: exchangeRate,
          text: transactionText,
          profit_center_debit: feeProfitCenterDebit,
          has_error: false,
          additional_text: tx.additional_text
        };

        if (tx.item_type === TransactionType.TWINT || tx.item_type === TransactionType.COMMISSION || tx.item_type === TransactionType.CASH_REGISTER_SYSTEM) {
          if (transactionText.length < 32) {
            feePosting.text = 'Spesen ' + transactionText;
          }
        }

        this.checkForErrors(feePosting);
        this.appendPostingError(feePosting, missingCostCenterError);
        if (feePosting.has_error) {
          feePosting.additional_text = feePosting.error;
        }
        postings.push(feePosting);
      }

      const mainPosting: FinalExportDataModel = {
        booking_date: formatDateForExport(bookingDate),
        document_number: documentNumber,
        document_date: formatDateForExport(documentDate),
        debit_account: debitAccount ?? '',
        credit_account: creditAccount ?? '',
        vat_code: vatCode ?? '',
        currency: currency,
        amount_foreign_currency: amountForeignCurrency ?? 0,
        amount_base_currency: amountBaseCurrency ?? 0,
        exchange_rate: exchangeRate,
        text: transactionText,
        profit_center_debit: profitCenterDebit,
        has_error: false,
        additional_text: tx.additional_text
      };

      this.checkForErrors(mainPosting);
      this.appendPostingError(mainPosting, missingCostCenterError);
      if (mainPosting.has_error) {
        mainPosting.additional_text = mainPosting.error;
      }
      postings.push(mainPosting);
    }

    return postings;
  }

  private appendPostingError(posting: FinalExportDataModel, errorMessage: string | undefined): void {
    if (!errorMessage) return;
    posting.has_error = true;
    if (!posting.error) {
      posting.error = errorMessage;
      return;
    }
    if (!posting.error.includes(errorMessage)) {
      posting.error = `${posting.error} | ${errorMessage}`;
    }
  }

  private checkForErrors(posting: FinalExportDataModel): FinalExportDataModel {
    if (!posting.debit_account || !posting.credit_account) {
      posting.has_error = true;
      posting.error = 'Fehlende Konten für Buchung. Bitte manuell prüfen und ggf. Ort und Konten ergänzen im Excel!';
    }
    if (typeof posting.debit_account === 'string' && posting.debit_account.trim().length === 0) {
      posting.has_error = true;
      posting.error = 'Kontonummer nicht gefunden oder leer. Bitte manuell prüfen und ggf. Ort und Konten ergänzen im Excel!';
    }
    if (typeof posting.credit_account === 'string' && posting.credit_account.trim().toLowerCase() in { nan: true, none: true }) {
      posting.has_error = true;
      posting.error = 'Kontonummer nicht gefunden oder leer. Bitte manuell prüfen und ggf. Ort und Konten ergänzen im Excel!';
    }
    return posting;
  }

  private getAccountMappingFromLocation(itemType: TransactionType, location?: string): AccountMappingModel | null {
    const locationAccountMapping = this.excelHandler.locationAccountMapping;
    const availableMappings = Object.keys(locationAccountMapping);

    if (location) {
      location = normaliseUmlauts(location).toUpperCase();
    }

    let searchString = '';
    switch (itemType) {
      case TransactionType.TRANSFER: searchString = 'KONTOUEBERTRAG'; break;
      case TransactionType.COMMISSION: searchString = 'BUCHUNGSSPESEN'; break;
      case TransactionType.EFT_POS_EXPENSES: searchString = 'EFT/POS PREISE'; break;
      case TransactionType.CREDIT_ACCOUNT_MANAGEMENT: searchString = 'PREIS FÜR KONTOFÜHRUNG'; break;
      case TransactionType.CREDIT_CASH_DEPOSITS: searchString = 'PREIS FÜR BAREINZAHLUNG'; break;
      case TransactionType.OWN_ACCOUNT_DEPOSIT:
      case TransactionType.RENT: searchString = location?.toUpperCase() ?? ''; break;
      default:
        logger.debug(`Unknown item type for mapping '${itemType}'`);
        return null;
    }

    searchString = normaliseUmlauts(searchString);

    for (const loc of availableMappings) {
      if (itemType === TransactionType.OWN_ACCOUNT_DEPOSIT) {
        const cleanedSearch = searchString.toUpperCase().replace('CARD-ID: ', '');
        const cleanedLoc = loc.toUpperCase().replace('CARD-ID: ', '');
        if (cleanedSearch === cleanedLoc) return locationAccountMapping[loc];
      } else {
        const value = partialRatio(searchString, loc);
        if (value >= 95) return locationAccountMapping[loc];
      }
    }

    logger.debug(`No account mapping found for location '${searchString}' and item type '${itemType}'`);
    return null;
  }

  private getCostCenterFromLocation(location?: string): string | null {
    const locationCostCenterMapping = this.excelHandler.locationCostCenterMapping;
    const availableMappings = Object.keys(locationCostCenterMapping);

    if (!location) return null;

    location = normaliseUmlauts(location.trim()).toUpperCase();

    const normalizedLocation = location;
    for (const loc of availableMappings) {
      const normalizedLoc = normaliseUmlauts(loc.trim()).toUpperCase();
      if (partialRatio(normalizedLocation, normalizedLoc) > 95) {
        return locationCostCenterMapping[loc];
      }
    }

    return null;
  }

  private getAccountByPaymentMethod(location: string, paymentType: string): string | null {
    const paymentMethodMapping = this.excelHandler.paymentMethodMapping;
    const availableMappings = Object.keys(paymentMethodMapping);

    location = normaliseUmlauts(location.trim()).toUpperCase();
    paymentType = normaliseUmlauts(paymentType.trim()).toUpperCase();

    const searchString = `${location}/${paymentType}`;

    for (const key of availableMappings) {
      // Check for high similarity to avoid wrong matches.
      // If this does not work well, also compare string length differences.
      if (partialRatio(searchString, key) > 99) {
        return paymentMethodMapping[key].account_credit;
      }
    }

    return null;
  }
}
