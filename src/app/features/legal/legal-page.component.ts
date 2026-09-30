import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { LEGAL_DOCUMENTS, LegalDocumentId } from '../../core/legal/legal-documents';
import { LegalDocumentComponent } from '../../shared/components/legal-document/legal-document.component';

/** Public, full-page Terms of Service / Privacy Policy (`/legal/terms`, `/legal/privacy`); open to everyone. */
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink, NzIconModule, LegalDocumentComponent],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPageComponent {
  /** From the route's `data` (router input binding). */
  readonly docId = input.required<LegalDocumentId>();
  protected readonly doc = computed(() => LEGAL_DOCUMENTS[this.docId()]);
  protected readonly otherDoc = computed(() =>
    this.docId() === 'terms' ? LEGAL_DOCUMENTS.privacy : LEGAL_DOCUMENTS.terms,
  );
}
