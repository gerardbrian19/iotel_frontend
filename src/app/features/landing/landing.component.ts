import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { PRODUCT_CATEGORIES, ProductCategory } from '../../core/models';
import { BestSellersComponent } from './best-sellers/best-sellers.component';
import { HeroSlideshowComponent } from './hero-slideshow/hero-slideshow.component';

interface CategoryPreview {
  category: ProductCategory;
  icon: string;
  description: string;
}

interface ServicePreview {
  icon: string;
  title: string;
  description: string;
}

interface FeatureHighlight {
  icon: string;
  title: string;
  description: string;
}

/** Short blurbs for the real catalog categories (`core/models/product.model.ts`), shown without live stock/pricing. */
const CATEGORY_DESCRIPTIONS: Record<ProductCategory, { icon: string; description: string }> = {
  Radios: { icon: 'sound', description: 'Handheld and mobile two-way radios from leading brands.' },
  'Radio Accessories': {
    icon: 'appstore',
    description: 'Batteries, chargers, headsets, mics and carry cases.',
  },
  Antennas: {
    icon: 'wifi',
    description: 'Base, mobile and portable antennas for stronger coverage.',
  },
  'Radio Infrastructure': {
    icon: 'database',
    description: 'Repeaters, base stations and system controllers.',
  },
  'Marine & Public Address': {
    icon: 'compass',
    description: 'Marine radios and PA systems for vessels and sites.',
  },
  CCTV: { icon: 'video-camera', description: 'Surveillance cameras and recording equipment.' },
  Networking: { icon: 'cluster', description: 'Switches, routers and networking gear.' },
  'Software & Licenses': {
    icon: 'file-protect',
    description: 'Programming software and licensing.',
  },
};

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, NzIconModule, HeroSlideshowComponent, BestSellersComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {
  readonly categories: CategoryPreview[] = PRODUCT_CATEGORIES.map((category) => ({
    category,
    icon: CATEGORY_DESCRIPTIONS[category].icon,
    description: CATEGORY_DESCRIPTIONS[category].description,
  }));

  readonly services: ServicePreview[] = [
    {
      icon: 'setting',
      title: 'Radio Programming & Configuration',
      description:
        'Professional programming for your frequencies, channels, and organization requirements.',
    },
    {
      icon: 'tool',
      title: 'On-Site Installation',
      description: 'Full on-site installation of base stations, repeaters, and antenna systems.',
    },
    {
      icon: 'thunderbolt',
      title: 'Radio Repair & Maintenance',
      description:
        'Diagnosis and repair covering physical damage, software issues, and component replacement.',
    },
    {
      icon: 'team',
      title: 'System Design & Consultation',
      description:
        'Expert consultation to design the optimal radio communication system for your business.',
    },
    {
      icon: 'calendar',
      title: 'Annual Maintenance Contract',
      description: 'Comprehensive annual maintenance package with priority support.',
    },
  ];

  readonly features: FeatureHighlight[] = [
    {
      icon: 'shop',
      title: 'Product Catalog',
      description:
        'Browse our curated selection of professional-grade two-way radios, repeaters, antennas, accessories, and more.',
    },
    {
      icon: 'tool',
      title: 'Installation & Services',
      description:
        'Schedule on-site installation, system programming, repairs, and preventive maintenance by certified technicians.',
    },
    {
      icon: 'file-text',
      title: 'Order Management',
      description:
        'Track every purchase from placement to delivery, with itemized receipts and status updates.',
    },
    {
      icon: 'message',
      title: 'Support & Messaging',
      description: 'Get real-time assistance from our support team directly within the platform.',
    },
  ];
}
