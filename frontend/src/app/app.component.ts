import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { AgGridAngular } from "ag-grid-angular";
import {
  CellClickedEvent,
  ColDef,
  GridOptions,
  ICellRendererParams
} from "ag-grid-community";

interface ParsedBookingRow {
  row_id: string;
  amount: string;
  currency: string | null;
  original_booking_text: string;
  booking_date: string | null;
  value_date: string | null;
  account_number: string;
  new_booking_text: string;
  debit_account: string;
  credit_account: string;
  vat_code: string;
  debit_cost_center: string;
  credit_cost_center: string;
  save_state: "idle" | "saving" | "saved" | "error";
}

interface ParsedBookingResponse {
  entries: Array<{
    row_id: string;
    amount: string;
    currency: string | null;
    original_booking_text: string;
    booking_date: string | null;
    value_date: string | null;
    account_number: string;
  }>;
}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: "./app.component.html"
})
export class AppComponent {
  private readonly apiBaseUrl = "http://localhost:8000/api/v1";

  readonly defaultColDef: ColDef<ParsedBookingRow> = {
    editable: false,
    resizable: true,
    sortable: true,
    filter: true
  };

  readonly gridOptions: GridOptions<ParsedBookingRow> = {
    suppressRowClickSelection: true
  };

  readonly columnDefs: ColDef<ParsedBookingRow>[] = [
    {
      headerName: "Betrag",
      valueGetter: (params) =>
        `${params.data?.amount ?? ""} ${params.data?.currency ?? ""}`.trim(),
      width: 150
    },
    {
      field: "original_booking_text",
      headerName: "Buchungstext (Original)",
      minWidth: 260,
      flex: 1
    },
    {
      field: "new_booking_text",
      headerName: "Buchungtext neu",
      editable: true,
      minWidth: 200
    },
    {
      field: "booking_date",
      headerName: "Buchungsdatum (BookgDt)",
      editable: true,
      width: 180
    },
    {
      field: "value_date",
      headerName: "Valuta Datum (ValDt)",
      editable: true,
      width: 170
    },
    {
      field: "debit_account",
      headerName: "Soll Konto",
      editable: true,
      width: 140
    },
    {
      field: "credit_account",
      headerName: "Haben Konto",
      editable: true,
      width: 140
    },
    {
      field: "vat_code",
      headerName: "Mwst. Code",
      editable: true,
      width: 130
    },
    {
      field: "debit_cost_center",
      headerName: "Soll Kostenstelle",
      editable: true,
      width: 170
    },
    {
      field: "credit_cost_center",
      headerName: "Haben Kostenstelle",
      editable: true,
      width: 180
    },
    {
      colId: "actions",
      headerName: "Aktion",
      width: 130,
      pinned: "right",
      cellRenderer: (params: ICellRendererParams<ParsedBookingRow>) => {
        const state = params.data?.save_state ?? "idle";
        if (state === "saving") {
          return `<span class="text-slate-500">Saving...</span>`;
        }
        if (state === "saved") {
          return `<span class="text-emerald-700 font-semibold">Saved</span>`;
        }
        if (state === "error") {
          return `<button class="rounded bg-red-600 px-2 py-1 text-white">Retry</button>`;
        }
        return `<button class="rounded bg-emerald-700 px-2 py-1 text-white">Save</button>`;
      }
    }
  ];

  rowData: ParsedBookingRow[] = [];
  isUploading = false;
  uploadMessage = "Keine Datei geladen.";

  constructor(private readonly http: HttpClient) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    this.isUploading = true;
    this.uploadMessage = "Datei wird verarbeitet...";

    this.http
      .post<ParsedBookingResponse>(`${this.apiBaseUrl}/camt053/parse`, formData)
      .subscribe({
        next: (response) => {
          this.rowData = response.entries.map((entry) => ({
            ...entry,
            new_booking_text: entry.original_booking_text,
            debit_account: "",
            credit_account: "",
            vat_code: "",
            debit_cost_center: "",
            credit_cost_center: "",
            save_state: "idle"
          }));
          this.uploadMessage = `${this.rowData.length} Buchungssaetze geladen.`;
          this.isUploading = false;
        },
        error: () => {
          this.uploadMessage = "Datei konnte nicht gelesen werden.";
          this.isUploading = false;
        }
      });
  }

  onCellClicked(event: CellClickedEvent<ParsedBookingRow>): void {
    if (event.colDef.colId !== "actions" || !event.data) {
      return;
    }
    this.saveRow(event.data);
  }

  private saveRow(row: ParsedBookingRow): void {
    row.save_state = "saving";
    this.rowData = [...this.rowData];

    this.http
      .post(`${this.apiBaseUrl}/booking-entries`, {
        original_booking_text: row.original_booking_text,
        new_booking_text: row.new_booking_text,
        account_number: row.account_number,
        debit_account: row.debit_account || null,
        credit_account: row.credit_account || null,
        vat_code: row.vat_code || null,
        debit_cost_center: row.debit_cost_center || null,
        credit_cost_center: row.credit_cost_center || null
      })
      .subscribe({
        next: () => {
          row.save_state = "saved";
          this.rowData = [...this.rowData];
        },
        error: () => {
          row.save_state = "error";
          this.rowData = [...this.rowData];
        }
      });
  }
}
