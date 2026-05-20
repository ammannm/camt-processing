import { describe, it, expect } from 'vitest';
import { XMLService, NonCamt053Error } from './xml-service';

describe('XMLService', () => {
  const service = new XMLService();

  describe('parse', () => {
    it('should throw NonCamt053Error for non-CAMT.053 XML', () => {
      const xml = '<?xml version="1.0"?><root><data>test</data></root>';
      expect(() => service.parse(xml, 'test.xml')).toThrow(NonCamt053Error);
    });

    it('should throw NonCamt053Error for missing Document element', () => {
      const xml = '<?xml version="1.0"?><NotDocument></NotDocument>';
      expect(() => service.parse(xml, 'test.xml')).toThrow(NonCamt053Error);
    });

    it('should parse valid CAMT.053 XML with namespace', () => {
      const xml = `<?xml version="1.0"?>
        <Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
          <BkToCstmrStmt>
            <Stmt>
              <Id>MSG123</Id>
              <Acct><Id><IBAN>CH1234567890</IBAN></Id></Acct>
              <Ntry>
                <NtryRef>REF001</NtryRef>
                <Amt Ccy="CHF">100.00</Amt>
                <CdtDbtInd>CRDT</CdtDbtInd>
                <BookgDt><Dt>2024-01-15</Dt></BookgDt>
                <ValDt><Dt>2024-01-15</ValDt></ValDt>
                <AddtlNtryInf>EINZAHLUNG AUF EIGENES KONTO</AddtlNtryInf>
                <NtryDtls><TxDtls><Refs><AcctSvcrRef>SVCR123</AcctSvcrRef></Refs></TxDtls></NtryDtls>
              </Ntry>
            </Stmt>
          </BkToCstmrStmt>
        </Document>`;

      const result = service.parse(xml, 'test.xml');
      expect(result.messageId).toBe('MSG123');
      expect(result.account).toBe('CH1234567890');
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].ref_id).toBe('SVCR123');
      expect(result.transactions[0].amt_value).toBe(100);
      expect(result.transactions[0].credit_debit_indicator).toBe('CRDT');
      expect(result.transactions[0].currency).toBe('CHF');
      expect(result.transactions[0].booking_date).toBe('2024-01-15');
      expect(result.transactions[0].additional_text).toBe('EINZAHLUNG AUF EIGENES KONTO');
    });

    it('should handle multiple entries', () => {
      const xml = `<?xml version="1.0"?>
        <Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
          <BkToCstmrStmt>
            <Stmt>
              <Id>MSG123</Id>
              <Acct><Id><IBAN>CH123</IBAN></Id></Acct>
              <Ntry>
                <Amt Ccy="CHF">100</Amt>
                <CdtDbtInd>CRDT</CdtDbtInd>
                <BookgDt><Dt>2024-01-01</Dt></BookgDt>
                <AddtlNtryInf>Text 1</AddtlNtryInf>
              </Ntry>
              <Ntry>
                <Amt Ccy="CHF">200</Amt>
                <CdtDbtInd>DBIT</CdtDbtInd>
                <BookgDt><Dt>2024-01-02</Dt></BookgDt>
                <AddtlNtryInf>Text 2</AddtlNtryInf>
              </Ntry>
            </Stmt>
          </BkToCstmrStmt>
        </Document>`;

      const result = service.parse(xml, 'test.xml');
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].amt_value).toBe(100);
      expect(result.transactions[1].amt_value).toBe(200);
    });

    it('should return empty transactions for no entries', () => {
      const xml = `<?xml version="1.0"?>
        <Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
          <BkToCstmrStmt>
            <Stmt>
              <Id>MSG123</Id>
              <Acct><Id><IBAN>CH123</IBAN></Id></Acct>
            </Stmt>
          </BkToCstmrStmt>
        </Document>`;

      const result = service.parse(xml, 'test.xml');
      expect(result.transactions).toHaveLength(0);
    });
  });
});
