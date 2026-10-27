import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { Booking, Order } from '../../../../core/models';
import {
  REPORT_METHOD_FILTERS,
  REPORT_PERIODS,
  ReportMethodFilter,
  ReportPeriod,
  reportCsv,
  reportFilename,
  salesReport,
} from '../../../../core/payments/sales-report';
import { reportPrintHtml, reportWorkbook } from '../../../../core/payments/sales-report-files';
import { XLSX_MIME } from '../../../../shared/utils/xlsx-writer';

/**
 * Dashboard card: sales & revenue for a chosen day, week (Mon–Sun) or month, split into GCash, bank transfer and their
 * combined total, with the transactions behind them. Downloads as Excel (.xlsx), CSV, or a printable page to save as
 * PDF, all from the same report. Built from the orders and bookings the dashboard already streams (no extra reads);
 * the rules are in `core/payments/sales-report.ts`.
 */
@Component({
  selector: 'app-sales-report',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    NzButtonModule,
    NzCardModule,
    NzDatePickerModule,
    NzDropDownModule,
    NzIconModule,
    NzRadioModule,
    NzSelectModule,
    NzTableModule,
  ],
  templateUrl: './sales-report.component.html',
  styleUrl: './sales-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesReportComponent {
  private readonly msg = inject(NzMessageService);

  readonly orders = input.required<readonly Order[]>();
  readonly bookings = input.required<readonly Booking[]>();

  readonly periods = REPORT_PERIODS;
  readonly methodFilters = REPORT_METHOD_FILTERS;

  readonly period = signal<ReportPeriod>('day');
  readonly anchor = signal<Date>(new Date());
  readonly filter = signal<ReportMethodFilter>('all');

  readonly report = computed(() =>
    salesReport(this.orders(), this.bookings(), this.period(), this.anchor(), this.filter()),
  );

  /** No reports for days that haven't happened yet. */
  readonly disabledDate = (d: Date): boolean => {
    const today = new Date();
    return d > new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  };

  setAnchor(value: Date | null): void {
    if (value) this.anchor.set(value);
  }

  /** Excel workbook: a Summary sheet and a Transactions sheet. */
  downloadExcel(): void {
    const report = this.report();
    this.save(
      new Blob([reportWorkbook(report)], { type: XLSX_MIME }),
      reportFilename(report, 'xlsx'),
    );
  }

  /** Plain CSV for any spreadsheet or accounting tool. */
  downloadCsv(): void {
    const report = this.report();
    this.save(
      new Blob([reportCsv(report)], { type: 'text/csv;charset=utf-8' }),
      reportFilename(report, 'csv'),
    );
  }

  /** Opens the report as a printable page; the browser's print dialog saves it as PDF. */
  print(): void {
    const url = URL.createObjectURL(
      new Blob([reportPrintHtml(this.report())], { type: 'text/html;charset=utf-8' }),
    );
    const opened = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (!opened) this.msg.error('Allow pop-ups for this site to open the printable report.');
  }

  private save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.msg.success(`Downloaded ${filename}`);
  }
}
