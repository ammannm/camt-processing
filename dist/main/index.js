//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let electron = require("electron");
let path = require("path");
path = __toESM(path);
let fs = require("fs");
fs = __toESM(fs);
let winston = require("winston");
let fuzzball = require("fuzzball");
let fast_xml_parser = require("fast-xml-parser");
let exceljs = require("exceljs");
exceljs = __toESM(exceljs);
//#region src/main/utils/logger.ts
var logDir = path.default.join(process.cwd(), "logs");
fs.default.mkdirSync(logDir, { recursive: true });
var logger = (0, winston.createLogger)({
	level: "info",
	format: winston.format.combine(winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)),
	transports: [new winston.transports.Console(), new winston.transports.File({
		filename: path.default.join(logDir, "app.log"),
		maxsize: 5 * 1024 * 1024,
		maxFiles: 5
	})]
});
//#endregion
//#region src/main/utils/helper-functions.ts
function normaliseUmlauts(text) {
	if (!text) return "";
	const umlautMap = {
		"Ä": "AE",
		"Ö": "OE",
		"Ü": "UE",
		"ä": "ae",
		"ö": "oe",
		"ü": "ue",
		"ß": "ss"
	};
	let result = text;
	for (const [umlaut, replacement] of Object.entries(umlautMap)) result = result.split(umlaut).join(replacement);
	return result;
}
function normalizeText(text) {
	return text.toUpperCase().replace(/\s+/g, " ").replace(/EFT \/POS/g, "EFT/POS").trim();
}
//#endregion
//#region src/main/utils/fuzzy.ts
function partialRatio(first, second) {
	return (0, fuzzball.partial_ratio)(first, second, {
		full_process: false,
		force_ascii: false
	});
}
//#endregion
//#region src/main/utils/path-helper.ts
var OUTPUT_FOLDER = "ausgabe";
var FILE_FOLDER = "bankdateien";
var MAPPING_EXCEL_FOLDER = "excel";
var TEMPLATE_FILE_NAME = "template.xlsx";
var PROCESSED_INPUT_SUBFOLDER = "verarbeitet";
var FAILED_INPUT_SUBFOLDER = "fehlerhaft";
function getAppRoot() {
	const electronProcess = process;
	if (process.env.NODE_ENV === "development" || electronProcess.defaultApp) {
		if (path.default.basename(process.cwd()) === "Electron") return path.default.dirname(process.cwd());
		return process.cwd();
	}
	return path.default.dirname(process.execPath);
}
function getReadPath(directory, filename) {
	const appRoot = getAppRoot();
	const externalCandidate = path.default.join(appRoot, directory, filename);
	if (fs.default.existsSync(externalCandidate)) return externalCandidate;
	return path.default.join(appRoot, directory, filename);
}
function getWritePath(directory, filename) {
	const targetDir = path.default.join(getAppRoot(), directory);
	if (!fs.default.existsSync(targetDir)) fs.default.mkdirSync(targetDir, { recursive: true });
	return path.default.join(targetDir, filename);
}
function getAppDir() {
	return getAppRoot();
}
function getAppDirPath(directory, filename) {
	const basePath = path.default.join(getAppRoot(), directory);
	return filename ? path.default.join(basePath, filename) : basePath;
}
function ensureAppDir(directory) {
	const targetPath = path.default.join(getAppRoot(), directory);
	if (!fs.default.existsSync(targetPath)) fs.default.mkdirSync(targetPath, { recursive: true });
	return targetPath;
}
//#endregion
//#region src/main/services/xml-service.ts
var NonCamt053Error = class extends Error {
	constructor(message) {
		super(message);
		this.name = "NonCamt053Error";
	}
};
var XMLService = class {
	constructor() {
		this.parser = new fast_xml_parser.XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			removeNSPrefix: true,
			parseAttributeValue: true,
			parseTagValue: true
		});
	}
	extractCamt053Namespace(xmlString, root) {
		const namespaceMatch = xmlString.match(/xmlns(?::[\w-]+)?=["']([^"']*camt\.053[^"']*)["']/i);
		if (namespaceMatch) return namespaceMatch[1];
		const nsAttr = root["@_xmlns"];
		if (nsAttr && nsAttr.toLowerCase().includes("camt.053")) return nsAttr;
		for (const key of Object.keys(root)) if (key.startsWith("@_xmlns:") && typeof root[key] === "string") {
			if (root[key].toLowerCase().includes("camt.053")) return root[key];
		}
		return null;
	}
	parse(xmlString, fileName) {
		const root = this.parser.parse(xmlString)?.Document;
		if (!root) throw new NonCamt053Error(`Datei '${fileName}' ist keine CAMT.053 XML (Document-Element fehlt).`);
		if (!this.extractCamt053Namespace(xmlString, root)) throw new NonCamt053Error(`Datei '${fileName}' ist keine CAMT.053 XML (Namespace nicht erkannt).`);
		const bankToCustStmt = root.BkToCstmrStmt;
		if (!bankToCustStmt) throw new NonCamt053Error(`Datei '${fileName}' ist keine CAMT.053 XML (BkToCstmrStmt fehlt).`);
		const stmtNode = bankToCustStmt.Stmt;
		const stmt = Array.isArray(stmtNode) ? stmtNode[0] : stmtNode;
		if (!stmt) throw new NonCamt053Error(`Datei '${fileName}' ist keine CAMT.053 XML (Stmt fehlt).`);
		const messageId = stmt.Id ?? "unknown";
		const account = stmt.Acct?.Id?.IBAN ?? "unknown";
		const entries = stmt.Ntry;
		if (!entries) return {
			messageId,
			account,
			transactions: []
		};
		const entryArray = Array.isArray(entries) ? entries : [entries];
		const transactions = [];
		for (const ntry of entryArray) {
			const txDtlsNode = (Array.isArray(ntry.NtryDtls) ? ntry.NtryDtls[0] : ntry.NtryDtls)?.TxDtls;
			const refs = (Array.isArray(txDtlsNode) ? txDtlsNode[0] : txDtlsNode)?.Refs;
			const amt = ntry.Amt;
			const bookDtStr = ntry.BookgDt?.Dt ?? ntry.BookgDt?.DtTm;
			const valutaDtStr = ntry.ValDt?.Dt ?? ntry.ValDt?.DtTm;
			const creditDebitIndicator = ntry.CdtDbtInd ?? "unknown";
			const refId = refs?.AcctSvcrRef ?? refs?.MsgId ?? refs?.EndToEndId ?? "";
			const amtValue = typeof amt === "object" ? amt["#text"] ?? 0 : amt ?? 0;
			const currencyValue = typeof amt === "object" ? amt["@_Ccy"] ?? "CHF" : "CHF";
			const additionalText = ntry.AddtlNtryInf ?? "";
			transactions.push({
				iban: String(ntry.NtryRef ?? ""),
				ref_id: String(refId),
				amt_value: Number(amtValue),
				credit_debit_indicator: String(creditDebitIndicator),
				currency: String(currencyValue),
				booking_date: String(bookDtStr ?? ""),
				valuta_date: String(valutaDtStr ?? ""),
				additional_text: String(additionalText)
			});
		}
		return {
			messageId,
			account,
			transactions
		};
	}
};
//#endregion
//#region src/main/services/mapping-service.ts
function convertTextToBoolean(value) {
	if (typeof value === "string") {
		const v = value.trim().toLowerCase();
		if ([
			"ja",
			"yes",
			"true"
		].includes(v)) return true;
		if ([
			"nein",
			"no",
			"false"
		].includes(v)) return false;
	}
	return false;
}
function cleanAccountValue(value) {
	if (value === null || value === void 0) return "";
	return String(value).replace(/\.0$/, "").trim();
}
function createLocationAccountMapping(df) {
	const mapping = {};
	for (const row of df) {
		let location = row[0];
		let entryType = row[1];
		if (location != null && String(location).trim().length > 0) location = normaliseUmlauts(String(location)).trim().toUpperCase();
		else location = null;
		if (entryType != null && String(entryType).trim().length > 0) {
			entryType = normaliseUmlauts(String(entryType)).trim().toUpperCase();
			if (location == null) location = String(entryType);
		}
		if (location == null && entryType == null) continue;
		const accountDetails = {
			location: String(location),
			typ: String(entryType),
			account_debit: cleanAccountValue(row[2]),
			account_credit: cleanAccountValue(row[3]),
			vat_code: cleanAccountValue(row[4]),
			include_cost_center: convertTextToBoolean(row[5])
		};
		if (location != null) mapping[String(location).trim().toUpperCase()] = accountDetails;
	}
	return mapping;
}
function createLocationCostCenterMapping(df) {
	const mapping = {};
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
function createPaymentMethodMapping(df) {
	const mapping = {};
	if (df.length === 0) return mapping;
	const paymentMethods = df[0].slice(1);
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
var MappingExcelHandler = class {
	constructor() {
		this.locationAccountMapping = {};
		this.locationCostCenterMapping = {};
		this.paymentMethodMapping = {};
		this.loadError = null;
		this.loadPromise = this.loadMappingTemplate().catch((err) => {
			this.loadError = err;
		});
	}
	async ensureLoaded() {
		await this.loadPromise;
		if (this.loadError) throw this.loadError;
	}
	async loadMappingTemplate() {
		const mappingExcelPath = getReadPath(MAPPING_EXCEL_FOLDER, TEMPLATE_FILE_NAME);
		try {
			const workbook = new exceljs.default.Workbook();
			const buffer = await fs.default.promises.readFile(mappingExcelPath);
			await workbook.xlsx.load(buffer);
			for (const worksheet of workbook.worksheets) {
				const rows = [];
				worksheet.eachRow({ includeEmpty: false }, (row) => {
					const values = Array.isArray(row.values) ? row.values : [];
					rows.push(values.slice(1));
				});
				const sheetName = worksheet.name.toLowerCase();
				if (sheetName === "ort_konten") this.locationAccountMapping = createLocationAccountMapping(rows);
				else if (sheetName === "kostenstellen") this.locationCostCenterMapping = createLocationCostCenterMapping(rows);
				else if (sheetName === "kasse_ort_zahlungsmittel") this.paymentMethodMapping = createPaymentMethodMapping(rows);
				else logger.warn(`Unbekanntes Sheet '${worksheet.name}' in Mapping-Template, wird ignoriert.`);
			}
			logger.info(`Mapping-Template geladen: ${Object.keys(this.locationAccountMapping).length} Konto-Mappings, ${Object.keys(this.locationCostCenterMapping).length} Kostenstellen, ${Object.keys(this.paymentMethodMapping).length} Zahlungsmittel`);
		} catch (err) {
			logger.error(`Mapping-Template nicht gefunden oder fehlerhaft: ${mappingExcelPath}`);
			throw err;
		}
	}
};
//#endregion
//#region src/shared/types.ts
var TransactionType = /* @__PURE__ */ function(TransactionType) {
	TransactionType[TransactionType["CASH_REGISTER_SYSTEM"] = 0] = "CASH_REGISTER_SYSTEM";
	TransactionType[TransactionType["EFT_POS_CREDIT"] = 1] = "EFT_POS_CREDIT";
	TransactionType[TransactionType["EFT_POS_EXPENSES"] = 2] = "EFT_POS_EXPENSES";
	TransactionType[TransactionType["OWN_ACCOUNT_DEPOSIT"] = 3] = "OWN_ACCOUNT_DEPOSIT";
	TransactionType[TransactionType["TRANSFER"] = 4] = "TRANSFER";
	TransactionType[TransactionType["COMMISSION"] = 5] = "COMMISSION";
	TransactionType[TransactionType["RENT"] = 6] = "RENT";
	TransactionType[TransactionType["TWINT"] = 7] = "TWINT";
	TransactionType[TransactionType["MANUAL"] = 8] = "MANUAL";
	TransactionType[TransactionType["CREDIT_ACCOUNT_MANAGEMENT"] = 9] = "CREDIT_ACCOUNT_MANAGEMENT";
	TransactionType[TransactionType["CREDIT_CASH_DEPOSITS"] = 10] = "CREDIT_CASH_DEPOSITS";
	TransactionType[TransactionType["UNKNOWN"] = 100] = "UNKNOWN";
	return TransactionType;
}({});
//#endregion
//#region src/main/services/transaction-type-detector.ts
function getTransactionType(transaction) {
	if (!transaction.additional_text || transaction.additional_text.length === 0) return null;
	const text = normalizeText(transaction.additional_text);
	if (partialRatio("EINZAHLUNG AUF EIGENES KONTO", text) > 95) return TransactionType.OWN_ACCOUNT_DEPOSIT;
	if (partialRatio("KONTOUEBERTRAG AUF", text) > 95) return TransactionType.TRANSFER;
	if (partialRatio("MIETE SHOP", text) > 96) return TransactionType.RENT;
	if (partialRatio("MIETE PP SHOP", text) > 95) return TransactionType.RENT;
	if (partialRatio("TWINT ACQUIRING AG", text) > 95) return TransactionType.TWINT;
	if (partialRatio("GUTSCHRIFT AUFTRAGGEBER: WORLDLINE SCHWEIZ AG", text) > 95) return TransactionType.CASH_REGISTER_SYSTEM;
	if (partialRatio("AMERICAN EXPRES", text) > 95) return TransactionType.MANUAL;
	if (partialRatio("EFT/POS", text) > 95) return transaction.credit_debit_indicator === "CRDT" ? TransactionType.EFT_POS_CREDIT : TransactionType.EFT_POS_EXPENSES;
	if (partialRatio("PREIS FUER DIE KONTOFUEHRUNG", text) > 96) return TransactionType.CREDIT_ACCOUNT_MANAGEMENT;
	if (partialRatio("PREIS FUER BAREINZAHLUNGEN EIGENES KONTO KARTEN", text) > 96) return TransactionType.CREDIT_CASH_DEPOSITS;
	return TransactionType.UNKNOWN;
}
//#endregion
//#region src/main/services/transaction-parsers.ts
function parseUnknownTransaction(tx) {
	tx.transaction_text = ` Unbekannte Transaktion, bitte Prüfen: ${tx.base.additional_text}`;
	tx.debit_credit_amount = tx.base.amt_value;
	return tx;
}
function parseManualTransaction(tx) {
	const textToParse = tx.base.additional_text;
	tx.transaction_text = `${tx.base.credit_debit_indicator === "CRDT" ? "Gutschrift" : "Lastschrift"}: ${textToParse}`;
	tx.debit_credit_amount = tx.base.amt_value;
	if (tx.base.amt_value == null) {
		tx.has_error = true;
		tx.error = "Konnte Betrag nicht extrahieren";
	}
	return tx;
}
function parseCashRegisterSystemTransaction(tx) {
	const textToParse = tx.base.additional_text;
	const komMatch = textToParse.match(/KOM\.\s*(\d+\.\d+)\//);
	tx.fee_amount = komMatch ? parseFloat(komMatch[1]) : void 0;
	const datMatch = textToParse.match(/DAT\.(\d{2}\.\d{2}\.\d{4})/);
	tx.text_date = datMatch ? datMatch[1] : void 0;
	const locationMatch = textToParse.match(/\/([^/]+)\s+SPESENBETRAG/);
	if (locationMatch) tx.location = locationMatch[1].trim();
	else {
		tx.has_error = true;
		tx.error = "Konnte Ort der Transaktion nicht extrahieren";
	}
	const parts = textToParse.split("/");
	const paymentTypeContentParts = (parts[0]?.trim() ?? "").split(" ");
	tx.payment_type = paymentTypeContentParts[paymentTypeContentParts.length - 1];
	const amountContent = parts[1]?.replace(/\s/g, "") ?? "";
	if (amountContent) tx.debit_credit_amount = parseFloat(amountContent);
	else {
		tx.has_error = true;
		tx.error = "Konnte Betrag nicht extrahieren";
	}
	tx.transaction_text = `${tx.payment_type} ${tx.location} ${tx.text_date}`;
	if (tx.transaction_text.length > 39) {
		tx.transaction_text = `${tx.payment_type} ${tx.location}`;
		tx.additional_text = tx.text_date;
	}
	return tx;
}
function parseEftPosCreditTransaction(tx) {
	const textToParse = tx.base.additional_text;
	const datMatch = textToParse.match(/VOM\s*(\d{2}\.\d{2}\.\d{4})/);
	tx.text_date = datMatch ? datMatch[1] : void 0;
	const textParts = textToParse.split(" ");
	if (textParts.length >= 2) tx.location = textParts.slice(-2).join(" ").replace("(CH)", "").trim();
	tx.transaction_text = `Postcard ${tx.text_date} ${tx.location}`;
	if (tx.transaction_text.length > 39) {
		tx.transaction_text = `Postcard ${tx.location}`;
		tx.additional_text = tx.text_date;
	}
	tx.debit_credit_amount = tx.base.amt_value;
	tx.payment_type = "EFT/POS Gutschrift";
	return tx;
}
function parseEftPosExpensesTransaction(tx) {
	const textToParse = tx.base.additional_text;
	const datMatch = textToParse.match(/VOM\s*(\d{2}\.\d{2}\.\d{4})/);
	tx.text_date = datMatch ? datMatch[1] : void 0;
	const textParts = textToParse.split(" ");
	if (textParts.length >= 2) tx.location = textParts.slice(-2).join(" ").replace("(CH)", "");
	else {
		tx.has_error = true;
		tx.error = "Konnte Ort der Transaktion nicht extrahieren";
	}
	tx.transaction_text = `Spesen vom ${tx.text_date} ${tx.location}`;
	if (tx.transaction_text.length > 39) {
		tx.transaction_text = `Spesen ${tx.text_date}`;
		tx.additional_text = tx.location;
	}
	tx.debit_credit_amount = tx.base.amt_value;
	return tx;
}
function parseOwnAccountDepositTransaction(tx) {
	const textToParse = tx.base.additional_text;
	const cardIdMatch = textToParse.match(/CARD-ID:\s*(\d+)/);
	const cardIdValue = cardIdMatch ? cardIdMatch[1] : void 0;
	const datMatch = textToParse.match(/VOM\s*(\d{2}\.\d{2}\.\d{4})/);
	tx.text_date = datMatch ? datMatch[1] : void 0;
	const messageMatch = textToParse.match(/MITTEILUNGEN:\s*([^\|]+)/);
	if (messageMatch) {
		const message = messageMatch[1].trim();
		tx.additional_text = message.length > 39 ? message.substring(0, 39) : message;
	}
	tx.transaction_text = `CARD-ID: ${cardIdValue} | ${tx.text_date}`;
	tx.debit_credit_amount = tx.base.amt_value;
	tx.location = `CARD-ID: ${cardIdValue}`;
	return tx;
}
function parseRentTransaction(tx) {
	const textParts = tx.base.additional_text.split(" ");
	tx.location = textParts.slice(-2).join(" ").replace("SHOP", "");
	tx.debit_credit_amount = tx.base.amt_value;
	const tText = textParts.slice(-3);
	if (tText.length >= 3) tx.transaction_text = tText.join(" ");
	else tx.transaction_text = `Miete Shop ${tx.location}`;
	tx.transaction_text = tx.transaction_text.replace("PP", "MIETE");
	return tx;
}
function parseTwintTransaction(tx) {
	const textToParse = tx.base.additional_text;
	const grossMatch = textToParse.match(/GROSS:\s*(-?\d+(?:\.\d+)?)/);
	if (grossMatch) tx.debit_credit_amount = parseFloat(grossMatch[1]);
	const feesMatch = textToParse.match(/FEES:\s*(-?\d+(?:\.\d+)?)/);
	if (feesMatch) tx.fee_amount = Math.abs(parseFloat(feesMatch[1]));
	const textMatch = textToParse.match(/REFERENZEN:\s*([^-]+)/);
	if (textMatch) tx.transaction_text = textMatch[1].trim();
	const locationMatch = textToParse.match(/TWINT\s+(?:PRO\s*SHOP|SCHLEIFSERVICE|OCHSI)\s+(.+?)\s+PAY\s*OUT/);
	if (locationMatch) {
		tx.location = locationMatch[1].trim();
		tx.transaction_text += ` ${tx.location}`;
	} else {
		tx.has_error = true;
		tx.error = "Konnte Ort der Transaktion nicht extrahieren";
		tx.additional_text = `${tx.error} \n ${textToParse}`;
	}
	tx.payment_type = "TWINT";
	return tx;
}
function parseTransferTransaction(tx) {
	const parts = tx.base.additional_text.split(" ");
	tx.text_date = parts[0];
	tx.debit_credit_amount = tx.base.amt_value;
	tx.transaction_text = `Kontoübertrag ${parts[parts.length - 1]}`;
	if (tx.transaction_text.length > 39) tx.transaction_text = `KU ${parts[parts.length - 1]}`;
	return tx;
}
function parseCreditAccountManagementTransaction(tx) {
	tx.transaction_text = "Preis für Kontoführung";
	tx.debit_credit_amount = tx.base.amt_value;
	tx.location = "Preise";
	return tx;
}
function parseCreditCashDepositsTransaction(tx) {
	const matched = tx.base.additional_text.match(/KARTEN\s*NR\.\s*(\S+).*?URSPRUNGS[- ]KONTONUMMER:\s*(\S+)/s);
	const cardNumber = matched ? matched[1] : void 0;
	const accountNumberLong = matched ? matched[2] : void 0;
	const accountNumberShort = accountNumberLong && accountNumberLong.length >= 4 ? accountNumberLong.substring(accountNumberLong.length - 4) : void 0;
	tx.transaction_text = `Preis Bareinzahlung Karte Nr.: ${cardNumber} Konto: ${accountNumberShort}`;
	if (tx.transaction_text.length > 39) tx.transaction_text = `Karte Nr.: ${cardNumber} Konto: ${accountNumberShort}`;
	tx.debit_credit_amount = tx.base.amt_value;
	tx.location = "Preise";
	return tx;
}
//#endregion
//#region src/main/services/export-service.ts
var TEXT_FORMAT = "@";
var NUMBER_FORMAT = "#0";
var DECIMAL_FORMAT_2 = "#,##0.00";
var DECIMAL_FORMAT_6 = "#,##0.000000";
var ExportService = class {
	async export(fileName, data) {
		const workbook = new exceljs.default.Workbook();
		const worksheet = workbook.addWorksheet("Buchungen");
		this.addHeaders(worksheet);
		for (const row of data) worksheet.addRow([
			row.booking_date,
			row.document_number,
			row.document_date,
			row.debit_account,
			row.credit_account,
			row.vat_code,
			row.currency,
			row.amount_foreign_currency,
			row.amount_base_currency,
			row.exchange_rate,
			row.text,
			row.additional_text || "",
			row.profit_center_debit || "",
			row.profit_center_credit || ""
		]);
		this.applyColumnFormats(worksheet);
		this.autosizeColumns(worksheet);
		worksheet.views = [{
			state: "frozen",
			ySplit: 1
		}];
		const outputPath = getWritePath(OUTPUT_FOLDER, fileName);
		await workbook.xlsx.writeFile(outputPath);
		logger.info(`Exported ${data.length} rows to ${outputPath}`);
		return outputPath;
	}
	addHeaders(ws) {
		ws.addRow([
			"Buchungsdatum",
			"Beleg-Nr.",
			"Belegdatum",
			"Konto Soll",
			"Konto Haben",
			"MWSt-Code",
			"Währung",
			"Betrag FW",
			"Betrag BW",
			"Kurs",
			"Text",
			"Zusatztext",
			"PC Soll",
			"PC Haben"
		]);
		const headerRow = ws.getRow(1);
		headerRow.font = { bold: true };
		headerRow.alignment = { horizontal: "left" };
	}
	applyColumnFormats(ws) {
		const textColumns = new Set([
			1,
			2,
			3,
			4,
			5,
			7,
			11,
			12,
			13,
			14
		]);
		const numberColumns = new Set([6]);
		const decimal2Columns = new Set([8, 9]);
		const decimal6Columns = new Set([10]);
		ws.eachRow((row, rowNumber) => {
			if (rowNumber === 1) return;
			row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
				if (textColumns.has(colNumber)) {
					cell.value = cell.value == null ? "" : String(cell.value);
					cell.numFmt = TEXT_FORMAT;
					cell.alignment = { horizontal: "left" };
					return;
				}
				if (numberColumns.has(colNumber)) {
					cell.value = this.normalizeNumber(cell.value);
					cell.numFmt = NUMBER_FORMAT;
					cell.alignment = { horizontal: "right" };
					return;
				}
				if (decimal2Columns.has(colNumber)) {
					cell.numFmt = DECIMAL_FORMAT_2;
					cell.alignment = { horizontal: "right" };
					return;
				}
				if (decimal6Columns.has(colNumber)) {
					cell.numFmt = DECIMAL_FORMAT_6;
					cell.alignment = { horizontal: "right" };
				}
			});
		});
	}
	normalizeNumber(value) {
		if (value == null) return 0;
		if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
		if (typeof value === "string" && [
			"",
			"None",
			"nan",
			"NaN"
		].includes(value.trim())) return 0;
		const numberValue = Number(value);
		return Number.isNaN(numberValue) ? 0 : numberValue;
	}
	autosizeColumns(ws) {
		ws.columns.forEach((column) => {
			let maxLength = 10;
			column.eachCell?.({ includeEmpty: true }, (cell) => {
				const value = cell.value == null ? "" : String(cell.value);
				maxLength = Math.max(maxLength, value.length + 2);
			});
			column.width = Math.min(Math.max(maxLength, 10), 40);
		});
	}
};
//#endregion
//#region src/main/services/main-logic.ts
function formatDateForExport(value) {
	if (!value) return "";
	const match = (value.includes("T") ? value.split("T")[0] : value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return value;
	return `${match[3]}.${match[2]}.${match[1]}`;
}
var MainLogic = class {
	constructor() {
		this.excelHandler = new MappingExcelHandler();
		this.xmlService = new XMLService();
		this.exportService = new ExportService();
	}
	reportProgress(callback, { phase, message, summary, filesHandled }) {
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
			logger.error("Progress callback failed");
		}
	}
	async process(progressCallback = null) {
		const summary = {
			statusMessage: "",
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
		logger.info("Processing data started");
		await this.excelHandler.ensureLoaded();
		const inputDir = getAppDirPath(FILE_FOLDER);
		const inputDirExists = fs.default.existsSync(inputDir);
		ensureAppDir(FILE_FOLDER);
		if (!inputDirExists) {
			summary.statusMessage = "Bankdateien Ordner erstellt. Bitte CAMT.053-Dateien einfügen und erneut starten.";
			logger.info(summary.statusMessage);
			this.reportProgress(progressCallback, {
				phase: "setup",
				message: summary.statusMessage,
				summary,
				filesHandled: 0
			});
			return summary;
		}
		const processedDir = path.default.join(inputDir, PROCESSED_INPUT_SUBFOLDER);
		const failedDir = path.default.join(inputDir, FAILED_INPUT_SUBFOLDER);
		fs.default.mkdirSync(processedDir, { recursive: true });
		fs.default.mkdirSync(failedDir, { recursive: true });
		const xmlFiles = fs.default.readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".xml")).map((f) => path.default.join(inputDir, f)).sort();
		summary.inputTotalFiles = xmlFiles.length;
		if (xmlFiles.length === 0) {
			summary.statusMessage = `Keine Bankdateien (XML-Dateien) in '${inputDir}' gefunden.`;
			logger.info(summary.statusMessage);
			this.reportProgress(progressCallback, {
				phase: "scan",
				message: summary.statusMessage,
				summary,
				filesHandled: 0
			});
			return summary;
		}
		let transactionList = [];
		let handledFileCount = 0;
		this.reportProgress(progressCallback, {
			phase: "scan",
			message: `${xmlFiles.length} Bankdateien (XML-Dateien) gefunden. Verarbeitung gestartet.`,
			summary,
			filesHandled: 0
		});
		for (const filePath of xmlFiles) {
			const fileName = path.default.basename(filePath);
			try {
				const data = await fs.default.promises.readFile(filePath, "utf-8");
				const parsed = this.xmlService.parse(data, fileName);
				if (parsed.transactions.length > 0) transactionList.push(...parsed.transactions);
				const movedPath = this.moveFileWithConflictResolution(filePath, processedDir);
				summary.inputProcessedFiles++;
				logger.info(`Processed XML '${fileName}' and moved it to '${movedPath}'`);
				handledFileCount++;
				this.reportProgress(progressCallback, {
					phase: "parse",
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
					phase: "parse",
					message: err instanceof NonCamt053Error ? `Datei ignoriert (kein CAMT.053): ${fileName}` : `Datei fehlerhaft: ${fileName}`,
					summary,
					filesHandled: handledFileCount
				});
			}
		}
		logger.info(`Input file summary: processed=${summary.inputProcessedFiles}, failed=${summary.inputFailedFiles}, ignored=${summary.inputIgnoredFiles}`);
		if (transactionList.length === 0) {
			summary.statusMessage = "Keine gültigen Transaktionen aus den XML-Dateien gelesen. Export übersprungen.";
			logger.warn(summary.statusMessage);
			this.reportProgress(progressCallback, {
				phase: "done",
				message: summary.statusMessage,
				summary,
				filesHandled: handledFileCount
			});
			return summary;
		}
		transactionList = this.normalizeTransactions(transactionList);
		let successfullyParsed = [];
		let failedParsed = [];
		let manualParsed = [];
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
			summary.statusMessage = "Fehler bei der Normalisierung oder dem Parsing der Transaktionen. Details im Log.";
			this.reportProgress(progressCallback, {
				phase: "done",
				message: summary.statusMessage,
				summary,
				filesHandled: handledFileCount
			});
			return summary;
		}
		this.reportProgress(progressCallback, {
			phase: "mapping",
			message: "Transaktionen werden gemappt und exportiert...",
			summary,
			filesHandled: handledFileCount
		});
		try {
			const successTransactions = [];
			const manualTransactions = [];
			const failedTransactions = [];
			const [successMapped, failedMapped] = this.mapAndFilterFailed(successfullyParsed, true);
			successTransactions.push(...successMapped);
			failedTransactions.push(...failedMapped);
			const [manualMapped, failedManualMapped] = this.mapAndFilterFailed(manualParsed, false);
			manualTransactions.push(...manualMapped);
			failedTransactions.push(...failedManualMapped);
			const [failedMapped2, failedMapped2Failed] = this.mapAndFilterFailed(failedParsed, false);
			failedTransactions.push(...failedMapped2);
			failedTransactions.push(...failedMapped2Failed);
			const currentDate = /* @__PURE__ */ new Date();
			const timestamp = `${currentDate.toLocaleDateString("de-CH").replace(/\./g, "").replace(/,/g, "_")}_${currentDate.toLocaleTimeString("de-CH").replace(/:/g, "")}`;
			const successfulFileName = `${timestamp}_erfolgreich_dt_import.xlsx`;
			const manualFileName = `${timestamp}_zu_prüfen_dt_import.xlsx`;
			const failedFileName = `${timestamp}_fehlgeschlagene_dt_import.xlsx`;
			summary.outputFiles = [];
			if (successTransactions.length > 0) {
				const successPath = await this.exportService.export(successfulFileName, successTransactions);
				summary.outputFiles.push(path.default.basename(successPath));
			}
			if (manualTransactions.length > 0) {
				const manualPath = await this.exportService.export(manualFileName, manualTransactions);
				summary.outputFiles.push(path.default.basename(manualPath));
			}
			if (failedTransactions.length > 0) {
				const failedPath = await this.exportService.export(failedFileName, failedTransactions);
				summary.outputFiles.push(path.default.basename(failedPath));
			}
			summary.bookingRowsSuccess = successTransactions.length;
			summary.bookingRowsManual = manualTransactions.length;
			summary.bookingRowsFailed = failedTransactions.length;
			summary.outputDirectory = getAppDir();
			summary.statusMessage = "Verarbeitung abgeschlossen.";
			this.reportProgress(progressCallback, {
				phase: "done",
				message: summary.statusMessage,
				summary,
				filesHandled: handledFileCount
			});
		} catch (err) {
			logger.error(`Error during mapping and exporting: ${err}`);
			summary.hadError = true;
			summary.statusMessage = "Fehler beim Mapping oder Export. Details im Log.";
			this.reportProgress(progressCallback, {
				phase: "done",
				message: summary.statusMessage,
				summary,
				filesHandled: handledFileCount
			});
		}
		return summary;
	}
	normalizeTransactions(transactions) {
		for (const tx of transactions) if (tx.additional_text) tx.additional_text = normaliseUmlauts(tx.additional_text.split(/\s+/).join(" ").toUpperCase());
		return transactions;
	}
	moveFileWithConflictResolution(filePath, targetDir) {
		if (!fs.default.existsSync(targetDir)) fs.default.mkdirSync(targetDir, { recursive: true });
		const fileName = path.default.basename(filePath);
		let targetPath = path.default.join(targetDir, fileName);
		if (!fs.default.existsSync(targetPath)) {
			fs.default.renameSync(filePath, targetPath);
			return targetPath;
		}
		const stem = path.default.parse(fileName).name;
		const suffix = path.default.parse(fileName).ext;
		const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").substring(0, 19);
		let counter = 1;
		while (true) {
			targetPath = path.default.join(targetDir, `${stem}_${timestamp}_${counter}${suffix}`);
			if (!fs.default.existsSync(targetPath)) {
				fs.default.renameSync(filePath, targetPath);
				return targetPath;
			}
			counter++;
		}
	}
	handleTransactions(baseTransactions) {
		const success = [];
		const failed = [];
		const manual = [];
		const parsers = {
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
			[TransactionType.CREDIT_CASH_DEPOSITS]: parseCreditCashDepositsTransaction
		};
		for (const baseTx of baseTransactions) {
			const txType = getTransactionType(baseTx) ?? TransactionType.UNKNOWN;
			const tx = {
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
			if (!parsed) failed.push(tx);
			else if (txType === TransactionType.MANUAL || txType === TransactionType.UNKNOWN) manual.push(parsed);
			else if (parsed.has_error) failed.push(parsed);
			else success.push(parsed);
		}
		return {
			success,
			failed,
			manual
		};
	}
	mapAndFilterFailed(transactionList, errorCheck) {
		const mapped = this.mapAndConvert(transactionList);
		const failed = [];
		const success = [];
		for (const posting of mapped) if (errorCheck && posting.has_error) failed.push(posting);
		else success.push(posting);
		return [success, failed];
	}
	mapAndConvert(transactionList) {
		const postings = [];
		for (const tx of transactionList) {
			const location = tx.location;
			const bookingDate = tx.base.booking_date;
			const documentNumber = "1";
			const documentDate = tx.base.booking_date;
			let debitAccount;
			let creditAccount;
			let vatCode;
			const currency = tx.currency ?? "";
			const amountForeignCurrency = tx.debit_credit_amount;
			const amountBaseCurrency = tx.debit_credit_amount;
			const exchangeRate = 1;
			const transactionText = tx.transaction_text ?? "";
			let profitCenterDebit;
			let missingCostCenterError;
			const paymentType = tx.payment_type;
			const accountDetails = this.getAccountMappingFromLocation(tx.item_type, location);
			if (accountDetails) {
				if (accountDetails.include_cost_center) {
					const costCenter = this.getCostCenterFromLocation(location);
					if (costCenter) profitCenterDebit = costCenter;
					if (!costCenter) missingCostCenterError = "Kostenstelle erforderlich, aber nicht gefunden. Bitte Ort und Kostenstelle im Excel ergänzen.";
				}
				if (accountDetails.account_debit) debitAccount = accountDetails.account_debit;
				if (accountDetails.account_credit) creditAccount = accountDetails.account_credit;
				if (accountDetails.vat_code) vatCode = accountDetails.vat_code;
			}
			if (paymentType) {
				const creditAccountFromPaymentMethod = this.getAccountByPaymentMethod(location ?? "", paymentType);
				if (creditAccountFromPaymentMethod) creditAccount = creditAccountFromPaymentMethod;
				debitAccount = "1005";
				vatCode = "0";
			}
			if (tx.fee_amount != null) {
				const accountDetailsForFee = this.getAccountMappingFromLocation(TransactionType.COMMISSION);
				let feeProfitCenterDebit;
				if (accountDetailsForFee?.include_cost_center) {
					const costCenter = this.getCostCenterFromLocation(location);
					if (costCenter) feeProfitCenterDebit = costCenter;
				}
				const feePosting = {
					booking_date: formatDateForExport(bookingDate),
					document_number: documentNumber,
					document_date: formatDateForExport(documentDate),
					debit_account: accountDetailsForFee?.account_debit ?? "",
					credit_account: accountDetailsForFee?.account_credit ?? "",
					vat_code: vatCode ?? "",
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
					if (transactionText.length < 32) feePosting.text = "Spesen " + transactionText;
				}
				this.checkForErrors(feePosting);
				this.appendPostingError(feePosting, missingCostCenterError);
				if (feePosting.has_error) feePosting.additional_text = feePosting.error;
				postings.push(feePosting);
			}
			const mainPosting = {
				booking_date: formatDateForExport(bookingDate),
				document_number: documentNumber,
				document_date: formatDateForExport(documentDate),
				debit_account: debitAccount ?? "",
				credit_account: creditAccount ?? "",
				vat_code: vatCode ?? "",
				currency,
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
			if (mainPosting.has_error) mainPosting.additional_text = mainPosting.error;
			postings.push(mainPosting);
		}
		return postings;
	}
	appendPostingError(posting, errorMessage) {
		if (!errorMessage) return;
		posting.has_error = true;
		if (!posting.error) {
			posting.error = errorMessage;
			return;
		}
		if (!posting.error.includes(errorMessage)) posting.error = `${posting.error} | ${errorMessage}`;
	}
	checkForErrors(posting) {
		if (!posting.debit_account || !posting.credit_account) {
			posting.has_error = true;
			posting.error = "Fehlende Konten für Buchung. Bitte manuell prüfen und ggf. Ort und Konten ergänzen im Excel!";
		}
		if (typeof posting.debit_account === "string" && posting.debit_account.trim().length === 0) {
			posting.has_error = true;
			posting.error = "Kontonummer nicht gefunden oder leer. Bitte manuell prüfen und ggf. Ort und Konten ergänzen im Excel!";
		}
		if (typeof posting.credit_account === "string" && posting.credit_account.trim().toLowerCase() in {
			nan: true,
			none: true
		}) {
			posting.has_error = true;
			posting.error = "Kontonummer nicht gefunden oder leer. Bitte manuell prüfen und ggf. Ort und Konten ergänzen im Excel!";
		}
		return posting;
	}
	getAccountMappingFromLocation(itemType, location) {
		const locationAccountMapping = this.excelHandler.locationAccountMapping;
		const availableMappings = Object.keys(locationAccountMapping);
		if (location) location = normaliseUmlauts(location).toUpperCase();
		let searchString = "";
		switch (itemType) {
			case TransactionType.TRANSFER:
				searchString = "KONTOUEBERTRAG";
				break;
			case TransactionType.COMMISSION:
				searchString = "BUCHUNGSSPESEN";
				break;
			case TransactionType.EFT_POS_EXPENSES:
				searchString = "EFT/POS PREISE";
				break;
			case TransactionType.CREDIT_ACCOUNT_MANAGEMENT:
				searchString = "PREIS FÜR KONTOFÜHRUNG";
				break;
			case TransactionType.CREDIT_CASH_DEPOSITS:
				searchString = "PREIS FÜR BAREINZAHLUNG";
				break;
			case TransactionType.OWN_ACCOUNT_DEPOSIT:
			case TransactionType.RENT:
				searchString = location?.toUpperCase() ?? "";
				break;
			default:
				logger.debug(`Unknown item type for mapping '${itemType}'`);
				return null;
		}
		searchString = normaliseUmlauts(searchString);
		for (const loc of availableMappings) if (itemType === TransactionType.OWN_ACCOUNT_DEPOSIT) {
			if (searchString.toUpperCase().replace("CARD-ID: ", "") === loc.toUpperCase().replace("CARD-ID: ", "")) return locationAccountMapping[loc];
		} else if (partialRatio(searchString, loc) >= 95) return locationAccountMapping[loc];
		logger.debug(`No account mapping found for location '${searchString}' and item type '${itemType}'`);
		return null;
	}
	getCostCenterFromLocation(location) {
		const locationCostCenterMapping = this.excelHandler.locationCostCenterMapping;
		const availableMappings = Object.keys(locationCostCenterMapping);
		if (!location) return null;
		location = normaliseUmlauts(location.trim()).toUpperCase();
		const normalizedLocation = location;
		for (const loc of availableMappings) if (partialRatio(normalizedLocation, normaliseUmlauts(loc.trim()).toUpperCase()) > 95) return locationCostCenterMapping[loc];
		return null;
	}
	getAccountByPaymentMethod(location, paymentType) {
		const paymentMethodMapping = this.excelHandler.paymentMethodMapping;
		const availableMappings = Object.keys(paymentMethodMapping);
		location = normaliseUmlauts(location.trim()).toUpperCase();
		paymentType = normaliseUmlauts(paymentType.trim()).toUpperCase();
		const searchString = `${location}/${paymentType}`;
		for (const key of availableMappings) if (partialRatio(searchString, key) > 99) return paymentMethodMapping[key].account_credit;
		return null;
	}
};
//#endregion
//#region src/main/index.ts
var mainWindow = null;
var mainLogic = null;
async function getInputFileStatus() {
	const inputFolder = ensureAppDir(FILE_FOLDER);
	const xmlFiles = (await fs.default.promises.readdir(inputFolder, { withFileTypes: true })).filter((entry) => entry.isFile() && path.default.extname(entry.name).toLowerCase() === ".xml").map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
	return {
		inputFolder: getAppDirPath(FILE_FOLDER),
		xmlFileCount: xmlFiles.length,
		xmlFiles,
		checkedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function createWindow() {
	mainWindow = new electron.BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			preload: path.default.join(__dirname, "..", "preload", "index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	});
	mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	if (process.env.NODE_ENV === "development") {
		mainWindow.loadURL("http://localhost:5173");
		mainWindow.webContents.openDevTools();
	} else mainWindow.loadFile(path.default.join(__dirname, "..", "renderer", "index.html"));
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}
electron.app.whenReady().then(() => {
	electron.session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
		callback(false);
	});
	if (process.env.NODE_ENV !== "development") electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({ responseHeaders: {
			...details.responseHeaders,
			"Content-Security-Policy": ["default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"]
		} });
	});
	ensureAppDir(OUTPUT_FOLDER);
	ensureAppDir(FILE_FOLDER);
	ensureAppDir(MAPPING_EXCEL_FOLDER);
	mainLogic = new MainLogic();
	createWindow();
	electron.app.on("activate", () => {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") electron.app.quit();
});
electron.ipcMain.handle("get-input-file-status", async () => getInputFileStatus());
electron.ipcMain.handle("start-processing", async (_event, request) => {
	if (!mainLogic) return {
		success: false,
		message: "MainLogic nicht initialisiert."
	};
	try {
		const summary = await mainLogic.process((progress) => {
			mainWindow?.webContents.send("processing-progress", {
				processed: progress.filesHandled,
				total: progress.filesTotal,
				currentFile: progress.message
			});
		});
		const result = {
			success: !summary.hadError,
			message: summary.statusMessage,
			summary: {
				filesProcessed: summary.inputProcessedFiles,
				transactionsParsed: summary.transactionsTotal,
				transactionsMapped: summary.transactionsParsedSuccess,
				transactionsExported: summary.bookingRowsSuccess,
				errors: summary.inputFailedFiles + summary.bookingRowsFailed
			},
			outputFiles: summary.outputFiles
		};
		mainWindow?.webContents.send("processing-result", result);
		return result;
	} catch (e) {
		logger.error(`Processing failed: ${e}`);
		const errorResult = {
			success: false,
			message: String(e)
		};
		mainWindow?.webContents.send("processing-result", errorResult);
		return errorResult;
	}
});
//#endregion
