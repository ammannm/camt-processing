/**
 * Boundary reader: CAMT.053 XML → RawRow[].
 *
 * This is one of the few legitimate places where a specific input format is
 * handled. The reader's output is generic (RawRow with a FieldBag). The
 * engine downstream does not know it came from CAMT.
 *
 * Conventional field names produced (referenced by YAML, not by the engine):
 *
 *   source_text   — AddtlNtryInf, the main text the classifier inspects
 *   ref_id        — best-effort transaction reference
 *   booking_date  — YYYY-MM-DD
 *   value_date    — YYYY-MM-DD (optional)
 *   amount        — number (positive)
 *   currency      — ISO 4217 code
 *   direction     — "CRDT" | "DBIT"
 *
 * A different reader (e.g. a CSV importer for a non-bank use case) can
 * populate completely different field names; the engine adapts via the
 * YAML's `from_field` and `match_against` settings.
 *
 * Spec: ../../../../GENERIC_PRIMITIVES.md (boundary IO, not part of any
 * engine section)
 */

import { XMLParser } from 'fast-xml-parser';
import type { RawRow } from '../../shared/types';

export class NonCamt053Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonCamt053Error';
  }
}

export interface ParsedCamtFile {
  messageId: string;
  account: string;
  rows: RawRow[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseAttributeValue: true,
  parseTagValue: true
});

export function readCamt053(xmlString: string, fileName: string): ParsedCamtFile {
  const result = xmlParser.parse(xmlString) as { Document?: Record<string, unknown> };
  const root = result.Document;
  if (!root) {
    throw new NonCamt053Error(`'${fileName}': Document element missing.`);
  }
  if (!isCamt053(xmlString, root)) {
    throw new NonCamt053Error(`'${fileName}': camt.053 namespace not recognised.`);
  }

  const bankToCustStmt = root.BkToCstmrStmt as Record<string, unknown> | undefined;
  if (!bankToCustStmt) throw new NonCamt053Error(`'${fileName}': BkToCstmrStmt missing.`);

  const stmt = asArray(bankToCustStmt.Stmt)[0] as Record<string, unknown> | undefined;
  if (!stmt) throw new NonCamt053Error(`'${fileName}': Stmt missing.`);

  const messageId = String(stmt.Id ?? 'unknown');
  const acct = stmt.Acct as Record<string, unknown> | undefined;
  const acctId = acct?.Id as Record<string, unknown> | undefined;
  const account = String(acctId?.IBAN ?? acctId?.Othr ?? 'unknown');

  const rows: RawRow[] = [];
  for (const ntry of asArray(stmt.Ntry) as Record<string, unknown>[]) {
    rows.push(toRawRow(ntry));
  }
  return { messageId, account, rows };
}

// ---------- internals ----------

function isCamt053(xmlString: string, root: Record<string, unknown>): boolean {
  if (/xmlns(?::[\w-]+)?=["'][^"']*camt\.053[^"']*["']/i.test(xmlString)) return true;
  const ns = root['@_xmlns'];
  if (typeof ns === 'string' && ns.toLowerCase().includes('camt.053')) return true;
  for (const [k, v] of Object.entries(root)) {
    if (k.startsWith('@_xmlns:') && typeof v === 'string' && v.toLowerCase().includes('camt.053')) {
      return true;
    }
  }
  return false;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function toRawRow(ntry: Record<string, unknown>): RawRow {
  const ntryDtls = asArray(ntry.NtryDtls)[0] as Record<string, unknown> | undefined;
  const txDtls = asArray(ntryDtls?.TxDtls)[0] as Record<string, unknown> | undefined;
  const refs = txDtls?.Refs as Record<string, unknown> | undefined;

  const amt = ntry.Amt;
  const amountValue =
    typeof amt === 'object' && amt !== null
      ? (amt as Record<string, unknown>)['#text'] ?? 0
      : (amt ?? 0);
  const currency =
    typeof amt === 'object' && amt !== null
      ? String((amt as Record<string, unknown>)['@_Ccy'] ?? 'CHF')
      : 'CHF';

  const bookgDt = ntry.BookgDt as Record<string, unknown> | undefined;
  const valDt = ntry.ValDt as Record<string, unknown> | undefined;
  const cdi = ntry.CdtDbtInd;
  const direction: 'CRDT' | 'DBIT' = cdi === 'DBIT' ? 'DBIT' : 'CRDT';

  const refId = String(refs?.AcctSvcrRef ?? refs?.MsgId ?? refs?.EndToEndId ?? '');

  return {
    fields: {
      source_text: String(ntry.AddtlNtryInf ?? ''),
      ref_id: refId,
      booking_date: String(bookgDt?.Dt ?? bookgDt?.DtTm ?? ''),
      value_date: String(valDt?.Dt ?? valDt?.DtTm ?? ''),
      amount: Number(amountValue),
      currency,
      direction
    },
    raw: ntry
  };
}
