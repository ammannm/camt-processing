import { describe, it, expect } from 'vitest';
import {
  parseUnknownTransaction,
  parseManualTransaction,
  parseCashRegisterSystemTransaction,
  parseEftPosCreditTransaction,
  parseEftPosExpensesTransaction,
  parseOwnAccountDepositTransaction,
  parseRentTransaction,
  parseTwintTransaction,
  parseTransferTransaction,
  parseCreditAccountManagementTransaction,
  parseCreditCashDepositsTransaction
} from './transaction-parsers';
import { TransactionType } from '../../shared/types';

function createTx(additional_text: string, credit_debit_indicator = 'CRDT', amt_value = 100) {
  return {
    base: { additional_text, iban: 'CH123', ref_id: 'REF1', amt_value, credit_debit_indicator, currency: 'CHF', booking_date: '2024-01-01', valuta_date: '2024-01-01' },
    item_type: TransactionType.UNKNOWN,
    has_error: false
  };
}

describe('parseUnknownTransaction', () => {
  it('should set transaction_text and debit_credit_amount', () => {
    const tx = createTx('Unbekannter Text');
    const result = parseUnknownTransaction(tx);
    expect(result.transaction_text).toContain('Unbekannte Transaktion');
    expect(result.debit_credit_amount).toBe(100);
  });
});

describe('parseManualTransaction', () => {
  it('should set Gutschrift for CRDT', () => {
    const tx = createTx('American Express Zahlung');
    const result = parseManualTransaction(tx);
    expect(result.transaction_text).toContain('Gutschrift');
  });

  it('should set Lastschrift for DBIT', () => {
    const tx = createTx('American Express Zahlung', 'DBIT');
    const result = parseManualTransaction(tx);
    expect(result.transaction_text).toContain('Lastschrift');
  });
});

describe('parseCashRegisterSystemTransaction', () => {
  it('should extract fee_amount, date, location, payment_type', () => {
    const tx = createTx('VISA/VPAY KOM. 2.50/100.00 DAT.01.01.2024 /KLOTEN SPESENBETRAG');
    const result = parseCashRegisterSystemTransaction(tx);
    expect(result.fee_amount).toBe(2.5);
    expect(result.text_date).toBe('01.01.2024');
    expect(result.location).toBe('KLOTEN');
    // payment_type is the last word before the slash in the first part
    expect(result.payment_type).toBe('VISA');
  });

  it('should truncate transaction_text to 39 chars', () => {
    const longText = 'VISA/VPAY KOM. 2.50/100.00 DAT.01.01.2024 /SEHR LANGER ORTNAME SPESENBETRAG';
    const tx = createTx(longText);
    const result = parseCashRegisterSystemTransaction(tx);
    expect(result.transaction_text.length).toBeLessThanOrEqual(39);
  });
});

describe('parseEftPosCreditTransaction', () => {
  it('should extract date and location', () => {
    const tx = createTx('GUTSCHRIFT EFT /POS WARENBEZUG VOM 15.03.2024 KLOTEN (CH)');
    const result = parseEftPosCreditTransaction(tx);
    expect(result.text_date).toBe('15.03.2024');
    expect(result.location).toBe('KLOTEN');
    expect(result.payment_type).toBe('EFT/POS Gutschrift');
  });
});

describe('parseEftPosExpensesTransaction', () => {
  it('should extract date and location', () => {
    const tx = createTx('PREISE FÜR EFT /POS WARENBEZÜGE VOM 15.03.2024 KLOTEN (CH)', 'DBIT');
    const result = parseEftPosExpensesTransaction(tx);
    expect(result.text_date).toBe('15.03.2024');
    expect(result.location).toBe('KLOTEN');
  });
});

describe('parseOwnAccountDepositTransaction', () => {
  it('should extract card_id, date, and set location', () => {
    const tx = createTx('EINZAHLUNG AUF EIGENES KONTO CARD-ID: 42 VOM 01.01.2024 MITTEILUNGEN: Test');
    const result = parseOwnAccountDepositTransaction(tx);
    expect(result.location).toBe('CARD-ID: 42');
    expect(result.text_date).toBe('01.01.2024');
    expect(result.transaction_text).toContain('CARD-ID: 42');
  });
});

describe('parseRentTransaction', () => {
  it('should extract location and set transaction_text', () => {
    const tx = createTx('MIETE PP SHOP KLOTEN JANUAR');
    const result = parseRentTransaction(tx);
    // Location is last 2 parts with SHOP replaced: "KLOTEN JANUAR"
    expect(result.location).toBe('KLOTEN JANUAR');
    // transaction_text is last 3 parts ("SHOP KLOTEN JANUAR"), PP not in this substring so no replacement
    expect(result.transaction_text).toBe('SHOP KLOTEN JANUAR');
  });
});

describe('parseTwintTransaction', () => {
  it('should extract gross, fees, location', () => {
    const tx = createTx('TWINT ACQUIRING AG GROSS: 50.00 FEES: 1.50 REFERENZEN: 12345 TWINT OCHSI KLOTEN PAY OUT');
    const result = parseTwintTransaction(tx);
    expect(result.debit_credit_amount).toBe(50);
    expect(result.fee_amount).toBe(1.5);
    expect(result.location).toBe('KLOTEN');
    expect(result.payment_type).toBe('TWINT');
  });

  it('should set error when location cannot be extracted', () => {
    const tx = createTx('TWINT ACQUIRING AG GROSS: 50.00');
    const result = parseTwintTransaction(tx);
    expect(result.has_error).toBe(true);
    expect(result.error).toContain('Ort der Transaktion');
  });
});

describe('parseTransferTransaction', () => {
  it('should extract date and set transaction_text', () => {
    const tx = createTx('01.01.2024 KONTOUEBERTRAG AUF 12345');
    const result = parseTransferTransaction(tx);
    expect(result.text_date).toBe('01.01.2024');
    expect(result.transaction_text).toBe('Kontoübertrag 12345');
  });

  it('should truncate to KU for long text', () => {
    const tx = createTx('01.01.2024 KONTOUEBERTRAG AUF SEHR LANGE KONTONUMMER 12345678901234567890ABCDEFGHIJKLMNOPQ');
    const result = parseTransferTransaction(tx);
    // "Kontoübertrag SEHR LANGE KONTONUMMER 12345678901234567890ABCDEFGHIJKLMNOPQ" is > 39 chars
    expect(result.transaction_text.length).toBeGreaterThan(39);
    expect(result.transaction_text).toBe('KU 12345678901234567890ABCDEFGHIJKLMNOPQ');
  });
});

describe('parseCreditAccountManagementTransaction', () => {
  it('should set fixed text and location', () => {
    const tx = createTx('PREIS FUER DIE KONTOFUEHRUNG');
    const result = parseCreditAccountManagementTransaction(tx);
    expect(result.transaction_text).toBe('Preis für Kontoführung');
    expect(result.location).toBe('Preise');
  });
});

describe('parseCreditCashDepositsTransaction', () => {
  it('should extract card number and account number', () => {
    const tx = createTx('PREIS FUER BAREINZAHLUNGEN EIGENES KONTO KARTEN NR. 1234567890 URSPRUNGS-KONTONUMMER: 1234567890123456');
    const result = parseCreditCashDepositsTransaction(tx);
    expect(result.transaction_text).toContain('1234567890');
    expect(result.transaction_text).toContain('3456');
    expect(result.location).toBe('Preise');
  });
});
