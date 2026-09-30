import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { LegalDocument } from '../../../core/legal/legal-documents';

/**
 * Renders a Terms of Service / Privacy Policy document: header, table of contents and numbered sections. Used inside
 * the registration modal and on the public `/legal/*` pages; it has no scroll container of its own, so the contents
 * links scroll whichever container it sits in (modal body or window).
 */
@Component({
  selector: 'app-legal-document',
  standalone: true,
  imports: [DatePipe, NzIconModule],
  templateUrl: './legal-document.component.html',
  styleUrl: './legal-document.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalDocumentComponent {
  readonly doc = input.required<LegalDocument>();
  /** Hides the big title when a surrounding modal already shows it. */
  readonly showTitle = input(true);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected anchor(sectionId: string): string {
    return `${this.doc().id}-${sectionId}`;
  }

  protected scrollTo(sectionId: string): void {
    this.host.nativeElement
      .querySelector(`#${this.anchor(sectionId)}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
