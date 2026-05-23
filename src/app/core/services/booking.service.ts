import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Booking, Service } from '../models';
import { MOCK_BOOKINGS, MOCK_SERVICES } from '../mocks/mock-data';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly _services = signal<Service[]>([...MOCK_SERVICES]);
  private readonly _bookings = signal<Booking[]>([...MOCK_BOOKINGS]);

  getServices(): Observable<Service[]> {
    return of(this._services());
  }

  getBookings(customerId?: number): Observable<Booking[]> {
    const all = this._bookings();
    return of(customerId ? all.filter(b => b.customerId === customerId) : all);
  }

  create(booking: Omit<Booking, 'id' | 'createdAt'>): Observable<Booking> {
    const newBooking: Booking = {
      ...booking,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    this._bookings.update(list => [...list, newBooking]);
    return of(newBooking);
  }

  cancel(id: number): Observable<void> {
    this._bookings.update(list =>
      list.map(b => (b.id === id ? { ...b, status: 'Cancelled' } : b))
    );
    return of(void 0);
  }
}
