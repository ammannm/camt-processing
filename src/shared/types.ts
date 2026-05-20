// Generated from Python models.py
export enum TransactionType {
  CASH_REGISTER_SYSTEM = 0,
  EFT_POS_CREDIT = 1,
  EFT_POS_EXPENSES = 2,
  OWN_ACCOUNT_DEPOSIT = 3,
  TRANSFER = 4,
  COMMISSION = 5,
  RENT = 6,
  TWINT = 7,
  MANUAL = 8,
  CREDIT_ACCOUNT_MANAGEMENT = 9,
  CREDIT_CASH_DEPOSITS = 10,
  UNKNOWN = 100,
}

export interface BaseTransactionModel {
  iban: string;
  ref_id: string;
  amt_value: number; // Decimal -> number
  credit_debit_indicator: string;
  currency: string;
  booking_date: string; // ISO date
  valuta_date: string; // ISO date
  additional_text: string;
}

export interface TransactionModel {
  base: BaseTransactionModel;
  // Buchungseintrag-Typ
  item_type: TransactionType;
  // Ort der Filiale oder des Geschäfts
  location?: string;
  // Zahlungsart
  payment_type?: string;
  // Kostenstelle
  cost_center?: string;
  // Datum innerhalb des Textes, z.B. "Miete 01.01.2024"
  text_date?: string;
  // Finaler Text für die Buchung, z.B. "Miete Januar 2024"
  transaction_text?: string;
  additional_text?: string;
  // Gebührenbetrag, z.B. bei Twint
  fee_amount?: number; // Decimal
  // Betrag für Soll/Haben
  debit_credit_amount?: number;
  // Währung
  currency?: string;
  // Flag, ob ein Fehler beim Parsen aufgetreten ist
  has_error: boolean;
  // Fehlerbeschreibung, falls die Transaktion nicht korrekt geparst werden konnte
  error?: string;
}

export interface AccountMappingModel {
  location: string;
  typ: string;
  // Konto Soll
  account_debit: string;
  // Konto Haben
  account_credit: string;
  // MWSt-Code
  vat_code: string;
  // Kostenstelle einbeziehen (Ja/Nein)
  include_cost_center: boolean;
}

export interface PaymentMethodModel {
  location: string;
  typ: string;
  // Konto Haben
  account_credit: string;
}

export interface FinalExportDataModel {
  // Buchungsdatum
  booking_date: string;
  // Beleg-Nr.
  document_number: string;
  // Belegdatum
  document_date: string;
  // Konto Soll
  debit_account: string;
  // Konto Haben
  credit_account: string;
  // MWSt-Code
  vat_code: string;
  // Währung
  currency: string;
  // Betrag FW
  amount_foreign_currency: number; // Decimal
  // Betrag BW
  amount_base_currency: number;
  // Kurs
  exchange_rate: number;
  // Text
  text: string;
  // Zusatztext
  additional_text?: string;
  // PC Soll
  profit_center_debit?: string;
  // PC Haben
  profit_center_credit?: string;
  // Flag, ob ein Fehler beim Parsen aufgetreten ist
  has_error: boolean;
  // Fehlerbeschreibung, falls die Transaktion nicht korrekt geparst werden konnte
  error?: string;
}
