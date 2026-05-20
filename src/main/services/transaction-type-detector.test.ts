import { describe, it, expect } from 'vitest';
import { getTransactionType } from './transaction-type-detector';
import { TransactionType } from '../../shared/types';

describe('getTransactionType', () => {
  it('should return null for empty additional_text', () => {
    expect(getTransactionType({ additional_text: '', iban: '', ref_id: '', amt_value: 0, credit_debit_indicator: '', currency: '', booking_date: '', valuta_date: '' })).toBeNull();
    expect(getTransactionType({ additional_text: '', iban: '', ref_id: '', amt_value: 0, credit_debit_indicator: '', currency: '', booking_date: '', valuta_date: '' })).toBeNull();
  });

  it('should detect OWN_ACCOUNT_DEPOSIT', () => {
    const tx = { additional_text: 'EINZAHLUNG AUF EIGENES KONTO CARD-ID: 19 VOM 01.01.2024', iban: '', ref_id: '', amt_value: 100, credit_debit_indicator: 'CRDT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.OWN_ACCOUNT_DEPOSIT);
  });

  it('should detect TRANSFER', () => {
    const tx = { additional_text: 'KONTOUEBERTRAG AUF 12345', iban: '', ref_id: '', amt_value: 50, credit_debit_indicator: 'DBIT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.TRANSFER);
  });

  it('should detect RENT', () => {
    const tx = { additional_text: 'MIETE SHOP KLOTEN', iban: '', ref_id: '', amt_value: 200, credit_debit_indicator: 'DBIT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.RENT);
  });

  it('should detect TWINT', () => {
    const tx = { additional_text: 'TWINT ACQUIRING AG PAYOUT REFERENZEN: 12345', iban: '', ref_id: '', amt_value: 30, credit_debit_indicator: 'CRDT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.TWINT);
  });

  it('should detect CASH_REGISTER_SYSTEM', () => {
    const tx = { additional_text: 'GUTSCHRIFT AUFTRAGGEBER: WORLDLINE SCHWEIZ AG', iban: '', ref_id: '', amt_value: 100, credit_debit_indicator: 'CRDT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.CASH_REGISTER_SYSTEM);
  });

  it('should detect EFT_POS_CREDIT', () => {
    const tx = { additional_text: 'GUTSCHRIFT EFT /POS WARENBEZUG VOM 01.01.2024', iban: '', ref_id: '', amt_value: 50, credit_debit_indicator: 'CRDT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.EFT_POS_CREDIT);
  });

  it('should detect EFT_POS_EXPENSES', () => {
    const tx = { additional_text: 'PREISE FÜR EFT /POS WARENBEZÜGE VOM 01.01.2024', iban: '', ref_id: '', amt_value: 50, credit_debit_indicator: 'DBIT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.EFT_POS_EXPENSES);
  });

  it('should detect CREDIT_ACCOUNT_MANAGEMENT', () => {
    const tx = { additional_text: 'PREIS FUER DIE KONTOFUEHRUNG', iban: '', ref_id: '', amt_value: 5, credit_debit_indicator: 'DBIT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.CREDIT_ACCOUNT_MANAGEMENT);
  });

  it('should detect CREDIT_CASH_DEPOSITS', () => {
    const tx = { additional_text: 'PREIS FUER BAREINZAHLUNGEN EIGENES KONTO KARTEN NR. 1234', iban: '', ref_id: '', amt_value: 2, credit_debit_indicator: 'DBIT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.CREDIT_CASH_DEPOSITS);
  });

  it('should return UNKNOWN for unrecognized text', () => {
    const tx = { additional_text: 'IRGENDWELCHER TEXT', iban: '', ref_id: '', amt_value: 10, credit_debit_indicator: 'CRDT', currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' };
    expect(getTransactionType(tx)).toBe(TransactionType.UNKNOWN);
  });
});
