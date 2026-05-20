import { BaseTransactionModel, TransactionType } from '../../shared/types';
import { normalizeText } from '../utils/helper-functions';
import { partialRatio } from '../utils/fuzzy';

export function getTransactionType(transaction: BaseTransactionModel): TransactionType | null {
  // Check based on known keywords in the additional text.
  if (!transaction.additional_text || transaction.additional_text.length === 0) {
    return null;
  }

  const text = normalizeText(transaction.additional_text);

  if (partialRatio('EINZAHLUNG AUF EIGENES KONTO', text) > 95) {
    return TransactionType.OWN_ACCOUNT_DEPOSIT;
  }

  if (partialRatio('KONTOUEBERTRAG AUF', text) > 95) {
    return TransactionType.TRANSFER;
  }

  if (partialRatio('MIETE SHOP', text) > 96) {
    return TransactionType.RENT;
  }

  if (partialRatio('MIETE PP SHOP', text) > 95) {
    return TransactionType.RENT;
  }

  if (partialRatio('TWINT ACQUIRING AG', text) > 95) {
    return TransactionType.TWINT;
  }

  if (partialRatio('GUTSCHRIFT AUFTRAGGEBER: WORLDLINE SCHWEIZ AG', text) > 95) {
    return TransactionType.CASH_REGISTER_SYSTEM;
  }

  if (partialRatio('AMERICAN EXPRES', text) > 95) {
    return TransactionType.MANUAL;
  }

  if (partialRatio('EFT/POS', text) > 95) {
    return transaction.credit_debit_indicator === 'CRDT'
      ? TransactionType.EFT_POS_CREDIT
      : TransactionType.EFT_POS_EXPENSES;
  }

  if (partialRatio('PREIS FUER DIE KONTOFUEHRUNG', text) > 96) {
    return TransactionType.CREDIT_ACCOUNT_MANAGEMENT;
  }

  if (partialRatio('PREIS FUER BAREINZAHLUNGEN EIGENES KONTO KARTEN', text) > 96) {
    return TransactionType.CREDIT_CASH_DEPOSITS;
  }

  return TransactionType.UNKNOWN;
}
