import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { AgGridAngular } from "ag-grid-angular";
import { ColDef } from "ag-grid-community";

interface ItemRow {
  id: number;
  name: string;
  status: "new" | "processing" | "done";
}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: "./app.component.html"
})
export class AppComponent {
  readonly columnDefs: ColDef<ItemRow>[] = [
    { field: "id", headerName: "ID", width: 100 },
    { field: "name", headerName: "Name", flex: 1 },
    { field: "status", headerName: "Status", width: 140 }
  ];

  readonly rowData: ItemRow[] = [
    { id: 1, name: "Import CAMT.053", status: "new" },
    { id: 2, name: "Normalize transactions", status: "processing" },
    { id: 3, name: "Export summary", status: "done" }
  ];
}

