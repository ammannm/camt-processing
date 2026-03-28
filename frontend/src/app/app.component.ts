import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { AgGridAngular } from "ag-grid-angular";
import {
  CellClickedEvent,
  CellValueChangedEvent,
  ColDef,
  GridOptions,
  ICellRendererParams
} from "ag-grid-community";

interface ParsedBookingRow {
  backend_id: number | null;
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
  save_state: "idle" | "saving" | "error";
  is_dirty: boolean;
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

interface BookingEntryApiResponse {
  id: number;
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
        const row = params.data;
        if (!row) {
          return "";
        }
        const state = row.save_state;
        const label = this.getActionLabel(row);
        const disabled = !this.canSaveRow(row);

        if (state === "saving") {
          return `<button class="rounded bg-slate-500 px-2 py-0.5 text-xs text-white opacity-80" disabled>Saving...</button>`;
        }

        if (state === "error") {
          return `<button class="rounded bg-red-600 px-2 py-0.5 text-xs text-white">Retry</button>`;
        }

        const isUpdate = Boolean(row.backend_id);
        const enabledClasses = isUpdate
          ? "rounded bg-emerald-600 px-2 py-0.5 text-xs text-white"
          : "rounded bg-sky-600 px-2 py-0.5 text-xs text-white";
        const disabledClasses = isUpdate
          ? "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 cursor-not-allowed"
          : "rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-700 cursor-not-allowed";
        const classes = disabled ? disabledClasses : enabledClasses;
        const disabledAttr = disabled ? "disabled" : "";
        return `<button class="${classes}" ${disabledAttr}>${label}</button>`;
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
            backend_id: null,
            ...entry,
            new_booking_text: "",
            debit_account: "",
            credit_account: "",
            vat_code: "",
            debit_cost_center: "",
            credit_cost_center: "",
            save_state: "idle",
            is_dirty: true
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
    if (!this.canSaveRow(event.data)) {
      return;
    }
    this.saveRow(event.data);
  }

  onCellValueChanged(event: CellValueChangedEvent<ParsedBookingRow>): void {
    if (!event.data) {
      return;
    }
    event.data.is_dirty = true;
    if (event.data.save_state !== "saving") {
      event.data.save_state = "idle";
    }
    this.rowData = [...this.rowData];
  }

  private saveRow(row: ParsedBookingRow): void {
    row.save_state = "saving";
    this.rowData = [...this.rowData];

    const payload = {
      original_booking_text: row.original_booking_text,
      new_booking_text: row.new_booking_text,
      account_number: row.account_number,
      debit_account: row.debit_account || null,
      credit_account: row.credit_account || null,
      vat_code: row.vat_code || null,
      debit_cost_center: row.debit_cost_center || null,
      credit_cost_center: row.credit_cost_center || null
    };

    const request$ = row.backend_id
      ? this.http.put<BookingEntryApiResponse>(
          `${this.apiBaseUrl}/booking-entries/${row.backend_id}`,
          payload
        )
      : this.http.post<BookingEntryApiResponse>(
          `${this.apiBaseUrl}/booking-entries`,
          payload
        );

    request$.subscribe({
      next: (saved) => {
        row.backend_id = saved.id;
        row.save_state = "idle";
        row.is_dirty = false;
        this.rowData = [...this.rowData];
      },
      error: () => {
        row.save_state = "error";
        this.rowData = [...this.rowData];
      }
    });
  }

  private getActionLabel(row: ParsedBookingRow): string {
    if (row.save_state === "saving") {
      return "Saving...";
    }
    return row.backend_id ? "Update" : "Save";
  }

  private canSaveRow(row: ParsedBookingRow): boolean {
    if (row.save_state === "saving") {
      return false;
    }
    if (!row.backend_id) {
      return true;
    }
    return row.is_dirty;
  }
}
