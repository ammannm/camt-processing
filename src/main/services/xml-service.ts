import { XMLParser } from 'fast-xml-parser';
import { BaseTransactionModel } from '../../shared/types';

export class NonCamt053Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonCamt053Error';
  }
}

export interface ParsedCamtFile {
  messageId: string;
  account: string;
  transactions: BaseTransactionModel[];
}

export class XMLService {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      parseAttributeValue: true,
      parseTagValue: true
    });
  }

  private extractCamt053Namespace(xmlString: string, root: any): string | null {
    // Prüfe zuerst deklarierte Namespaces am Root oder im Dokumenttext.
    const namespaceMatch = xmlString.match(/xmlns(?::[\w-]+)?=["']([^"']*camt\.053[^"']*)["']/i);
    if (namespaceMatch) {
      return namespaceMatch[1];
    }

    // Fallback: Namespace direkt aus dem Root-Objekt lesen.
    const nsAttr = root['@_xmlns'];
    if (nsAttr && nsAttr.toLowerCase().includes('camt.053')) {
      return nsAttr;
    }

    for (const key of Object.keys(root)) {
      if (key.startsWith('@_xmlns:') && typeof root[key] === 'string') {
        if (root[key].toLowerCase().includes('camt.053')) {
          return root[key];
        }
      }
    }

    return null;
  }

  parse(xmlString: string, fileName: string): ParsedCamtFile {
    const result = this.parser.parse(xmlString);
    const root = result?.Document;
    if (!root) {
      throw new NonCamt053Error(`Datei '${fileName}' ist keine CAMT.053 XML (Document-Element fehlt).`);
    }

    const camtNamespace = this.extractCamt053Namespace(xmlString, root);
    if (!camtNamespace) {
      throw new NonCamt053Error(`Datei '${fileName}' ist keine CAMT.053 XML (Namespace nicht erkannt).`);
    }

    const bankToCustStmt = root.BkToCstmrStmt;
    if (!bankToCustStmt) {
      throw new NonCamt053Error(`Datei '${fileName}' ist keine CAMT.053 XML (BkToCstmrStmt fehlt).`);
    }

    const stmtNode = bankToCustStmt.Stmt;
    const stmt = Array.isArray(stmtNode) ? stmtNode[0] : stmtNode;
    if (!stmt) {
      throw new NonCamt053Error(`Datei '${fileName}' ist keine CAMT.053 XML (Stmt fehlt).`);
    }

    const messageId = stmt.Id ?? 'unknown';
    const account = stmt.Acct?.Id?.IBAN ?? 'unknown';

    const entries = stmt.Ntry;
    if (!entries) {
      return { messageId, account, transactions: [] };
    }

    const entryArray = Array.isArray(entries) ? entries : [entries];
    const transactions: BaseTransactionModel[] = [];

    for (const ntry of entryArray) {
      // Entry-level defaults.
      const ntryDtls = Array.isArray(ntry.NtryDtls) ? ntry.NtryDtls[0] : ntry.NtryDtls;
      const txDtlsNode = ntryDtls?.TxDtls;
      const txDtls = Array.isArray(txDtlsNode) ? txDtlsNode[0] : txDtlsNode;
      const refs = txDtls?.Refs;
      const amt = ntry.Amt;

      const bookDtStr = ntry.BookgDt?.Dt ?? ntry.BookgDt?.DtTm;
      const valutaDtStr = ntry.ValDt?.Dt ?? ntry.ValDt?.DtTm;
      const creditDebitIndicator = ntry.CdtDbtInd ?? 'unknown';

      const refId = refs?.AcctSvcrRef ?? refs?.MsgId ?? refs?.EndToEndId ?? '';

      const amtValue = typeof amt === 'object' ? amt['#text'] ?? 0 : (amt ?? 0);
      const currencyValue = typeof amt === 'object' ? amt['@_Ccy'] ?? 'CHF' : 'CHF';

      const additionalText = ntry.AddtlNtryInf ?? '';

      transactions.push({
        iban: String(ntry.NtryRef ?? ''),
        ref_id: String(refId),
        amt_value: Number(amtValue),
        credit_debit_indicator: String(creditDebitIndicator),
        currency: String(currencyValue),
        booking_date: String(bookDtStr ?? ''),
        valuta_date: String(valutaDtStr ?? ''),
        additional_text: String(additionalText)
      });
    }

    return { messageId, account, transactions };
  }
}
