import { TransactionModel, TransactionType } from '../../shared/types';

function safeDecimal(value: any): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

export function parseUnknownTransaction(tx: TransactionModel): TransactionModel {
  tx.transaction_text = ` Unbekannte Transaktion, bitte Prüfen: ${tx.base.additional_text}`;
  tx.debit_credit_amount = tx.base.amt_value;
  return tx;
}

export function parseManualTransaction(tx: TransactionModel): TransactionModel {
  const textToParse = tx.base.additional_text;
  const debitOrCredit = tx.base.credit_debit_indicator === 'CRDT' ? 'Gutschrift' : 'Lastschrift';
  tx.transaction_text = `${debitOrCredit}: ${textToParse}`;
  tx.debit_credit_amount = tx.base.amt_value;
  if (tx.base.amt_value == null) {
    tx.has_error = true;
    tx.error = 'Konnte Betrag nicht extrahieren';
  }
  return tx;
}

export function parseCashRegisterSystemTransaction(tx: TransactionModel): TransactionModel {
  const textToParse = tx.base.additional_text;

  const komMatch = textToParse.match(/KOM\.\s*(\d+\.\d+)\//);
  tx.fee_amount = komMatch ? parseFloat(komMatch[1]) : undefined;

  const datMatch = textToParse.match(/DAT\.(\d{2}\.\d{2}\.\d{4})/);
  tx.text_date = datMatch ? datMatch[1] : undefined;

  const locationMatch = textToParse.match(/\/([^/]+)\s+SPESENBETRAG/);
  if (locationMatch) {
    tx.location = locationMatch[1].trim();
  } else {
    tx.has_error = true;
    tx.error = 'Konnte Ort der Transaktion nicht extrahieren';
  }

  const parts = textToParse.split('/');
  const paymentTypeContent = parts[0]?.trim() ?? '';
  const paymentTypeContentParts = paymentTypeContent.split(' ');
  tx.payment_type = paymentTypeContentParts[paymentTypeContentParts.length - 1];

  const amountContent = parts[1]?.replace(/\s/g, '') ?? '';
  if (amountContent) {
    tx.debit_credit_amount = parseFloat(amountContent);
  } else {
    tx.has_error = true;
    tx.error = 'Konnte Betrag nicht extrahieren';
  }

  tx.transaction_text = `${tx.payment_type} ${tx.location} ${tx.text_date}`;
  if (tx.transaction_text.length > 39) {
    tx.transaction_text = `${tx.payment_type} ${tx.location}`;
    tx.additional_text = tx.text_date;
  }

  return tx;
}

export function parseEftPosCreditTransaction(tx: TransactionModel): TransactionModel {
  // GUTSCHRIFT EFT /POS WARENBEZUG
  const textToParse = tx.base.additional_text;

  // Find date with regex.
  const datMatch = textToParse.match(/VOM\s*(\d{2}\.\d{2}\.\d{4})/);
  tx.text_date = datMatch ? datMatch[1] : undefined;

  const textParts = textToParse.split(' ');
  if (textParts.length >= 2) {
    // Take last two parts as location.
    tx.location = textParts.slice(-2).join(' ').replace('(CH)', '').trim();
  }

  tx.transaction_text = `Postcard ${tx.text_date} ${tx.location}`;
  if (tx.transaction_text.length > 39) {
    tx.transaction_text = `Postcard ${tx.location}`;
    tx.additional_text = tx.text_date;
  }

  tx.debit_credit_amount = tx.base.amt_value;
  tx.payment_type = 'EFT/POS Gutschrift';

  return tx;
}

export function parseEftPosExpensesTransaction(tx: TransactionModel): TransactionModel {
  // PREISE FÜR EFT /POS WARENBEZÜGE
  const textToParse = tx.base.additional_text;

  // Find date with regex.
  const datMatch = textToParse.match(/VOM\s*(\d{2}\.\d{2}\.\d{4})/);
  tx.text_date = datMatch ? datMatch[1] : undefined;

  const textParts = textToParse.split(' ');
  if (textParts.length >= 2) {
    // Take last two parts as location.
    tx.location = textParts.slice(-2).join(' ').replace('(CH)', '').trim();
  } else {
    tx.has_error = true;
    tx.error = 'Konnte Ort der Transaktion nicht extrahieren';
  }

  tx.transaction_text = `Spesen vom ${tx.text_date} ${tx.location}`;
  if (tx.transaction_text.length > 39) {
    tx.transaction_text = `Spesen ${tx.text_date}`;
    tx.additional_text = tx.location;
  }

  tx.debit_credit_amount = tx.base.amt_value;

  return tx;
}

export function parseOwnAccountDepositTransaction(tx: TransactionModel): TransactionModel {
  // EINZAHLUNG AUF EIGENES KONTO
  const textToParse = tx.base.additional_text;

  // Find card-id with regex, example "CARD-ID: 19".
  const cardIdMatch = textToParse.match(/CARD-ID:\s*(\d+)/);
  const cardIdValue = cardIdMatch ? cardIdMatch[1] : undefined;

  const datMatch = textToParse.match(/VOM\s*(\d{2}\.\d{2}\.\d{4})/);
  tx.text_date = datMatch ? datMatch[1] : undefined;

  const messageMatch = textToParse.match(/MITTEILUNGEN:\s*([^\|]+)/);
  if (messageMatch) {
    const message = messageMatch[1].trim();
    tx.additional_text = message.length > 39 ? message.substring(0, 39) : message;
  }

  tx.transaction_text = `CARD-ID: ${cardIdValue} | ${tx.text_date}`;
  tx.debit_credit_amount = tx.base.amt_value;
  // Set card id as location for mapping in future.
  tx.location = `CARD-ID: ${cardIdValue}`;

  return tx;
}

export function parseRentTransaction(tx: TransactionModel): TransactionModel {
  // MIETE SHOP
  const textToParse = tx.base.additional_text;
  const textParts = textToParse.split(' ');

  // Take last two parts as location.
  tx.location = textParts.slice(-2).join(' ').replace('SHOP', '');
  tx.debit_credit_amount = tx.base.amt_value;

  const tText = textParts.slice(-3);
  if (tText.length >= 3) {
    tx.transaction_text = tText.join(' ');
  } else {
    tx.transaction_text = `Miete Shop ${tx.location}`;
  }

  tx.transaction_text = tx.transaction_text.replace('PP', 'MIETE');

  return tx;
}

export function parseTwintTransaction(tx: TransactionModel): TransactionModel {
  // TWINT ACQUIRING AG
  const textToParse = tx.base.additional_text;

  const grossMatch = textToParse.match(/GROSS:\s*(-?\d+(?:\.\d+)?)/);
  if (grossMatch) {
    tx.debit_credit_amount = parseFloat(grossMatch[1]);
  }

  const feesMatch = textToParse.match(/FEES:\s*(-?\d+(?:\.\d+)?)/);
  if (feesMatch) {
    tx.fee_amount = Math.abs(parseFloat(feesMatch[1]));
  }

  const textMatch = textToParse.match(/REFERENZEN:\s*([^-]+)/);
  if (textMatch) {
    tx.transaction_text = textMatch[1].trim();
  }

  // Prüfen, ob der Regex genereller gehalten werden kann:
  // Beispiele: "TWINT OCHSI KLOTEN PAYOUT", "TWINT PRO SHOP WIL PAYOUT",
  // "TWINT SCHLEIFSERVICE ZÜRICH PAYOUT". Bei Orten mit zwei Wörtern ist das heikel.
  const locationMatch = textToParse.match(/TWINT\s+(?:PRO\s*SHOP|SCHLEIFSERVICE|OCHSI)\s+(.+?)\s+PAY\s*OUT/);
  if (locationMatch) {
    tx.location = locationMatch[1].trim();
    tx.transaction_text += ` ${tx.location}`;
  } else {
    tx.has_error = true;
    tx.error = 'Konnte Ort der Transaktion nicht extrahieren';
    tx.additional_text = `${tx.error} \n ${textToParse}`;
  }

  tx.payment_type = 'TWINT';

  return tx;
}

export function parseTransferTransaction(tx: TransactionModel): TransactionModel {
  // KONTOUEBERTRAG AUF
  const textToParse = tx.base.additional_text;

  const parts = textToParse.split(' ');
  tx.text_date = parts[0];
  tx.debit_credit_amount = tx.base.amt_value;

  tx.transaction_text = `Kontoübertrag ${parts[parts.length - 1]}`;
  if (tx.transaction_text.length > 39) {
    tx.transaction_text = `KU ${parts[parts.length - 1]}`;
  }

  return tx;
}

export function parseCreditAccountManagementTransaction(tx: TransactionModel): TransactionModel {
  // PREIS FUER DIE KONTOFUEHRUNG
  tx.transaction_text = 'Preis für Kontoführung';
  tx.debit_credit_amount = tx.base.amt_value;
  tx.location = 'Preise';
  return tx;
}

export function parseCreditCashDepositsTransaction(tx: TransactionModel): TransactionModel {
  // PREIS FUER BAREINZAHLUNGEN EIGENES KONTO KARTEN xxxx
  const textToParse = tx.base.additional_text;

  const matched = textToParse.match(/KARTEN\s*NR\.\s*(\S+).*?URSPRUNGS[- ]KONTONUMMER:\s*(\S+)/s);
  const cardNumber = matched ? matched[1] : undefined;
  const accountNumberLong = matched ? matched[2] : undefined;
  const accountNumberShort = accountNumberLong && accountNumberLong.length >= 4
    ? accountNumberLong.substring(accountNumberLong.length - 4)
    : undefined;

  tx.transaction_text = `Preis Bareinzahlung Karte Nr.: ${cardNumber} Konto: ${accountNumberShort}`;
  if (tx.transaction_text.length > 39) {
    tx.transaction_text = `Karte Nr.: ${cardNumber} Konto: ${accountNumberShort}`;
  }

  tx.debit_credit_amount = tx.base.amt_value;
  tx.location = 'Preise';

  return tx;
}
