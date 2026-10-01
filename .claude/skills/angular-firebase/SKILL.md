---
name: angular-firebase
description: Angular 21 conventions for this repo and how to integrate Firebase (modular SDK — Firestore, Auth, Storage, emulators, security rules) into its signal-based service layer. Use when writing or changing Angular components/services/guards/routes here, or when replacing the mock services with Firebase.
---

# Angular + Firebase in the IOTEL frontend

Read [CLAUDE.md](../../../CLAUDE.md) first for architecture. This skill covers the rules to follow when writing Angular code here and the recipe for moving the mock data layer onto Firebase.

## Part 1 — Angular rules for this codebase

- **Components**: standalone, `ChangeDetectionStrategy.OnPush`, `inject()` for DI, `templateUrl` + `styleUrl` (SCSS), selector prefix `app-`. Never NgModules, never constructor injection.
- **State**: `signal()` / `computed()` / `effect()`. Derive with `computed`, don't duplicate state. Update immutably (`.update(list => [...list, x])`), never mutate the array inside a signal. No `BehaviorSubject` for UI state.
- **Templates**: `@if` / `@for (x of xs(); track x.id)` / `@switch` / `@empty`. Keep logic out of templates; use `computed`.
- **Routing**: lazy `loadChildren` per role, `loadComponent` per page, functional guards only. New page = add route in `features/<role>/<role>.routes.ts` + component folder with `.ts/.html/.scss`.
- **Forms**: reactive forms (`FormBuilder` via `inject`) for checkout, login, product/address forms; a plain bound signal is fine for a search box.
- **Data access lives in `core/services/` only.** Components never touch `HttpClient`, Firestore, Auth, or Storage directly.
- **Service contract to preserve**: state exposed as `readonly x = this._x.asReadonly()` signals; mutations return `Observable<T>` (components `.subscribe()` on them). Keep both when swapping implementations so no component changes.
- **UI**: ng-zorro for complex widgets, Tailwind for layout, SCSS for overrides; hex colors only (`#1A1A1A`, `#CC2020`, `#C9A84C`, `#FFFFFF`, `#F5F5F5`). Register any new `nz-icon` in `provideNzIcons` in `app.config.ts`.
- **Tests**: there is no test setup in this repo (removed on purpose). Don't write specs.
- Check the Angular MCP server (`.vscode/mcp.json` → `npx @angular/cli mcp`) or angular.dev before using an API you're unsure about; Angular 21 moves fast.

## Part 2 — Firebase integration

The SDK and Firestore token are set up (section 1); services still use mocks. Continue in order, and confirm with the user before touching a real Firebase project (deploying rules, seeding data, `firebase login`).

### 1. Current state (already done)
- `firebase` (modular SDK, v12) is installed. **`@angular/fire` is not used**: stable 20.x peers Angular 20, and 21 is only `21.0.0-rc.0`. Re-check with `npm view @angular/fire dist-tags peerDependencies` before ever adding it; until then use the SDK directly.
- `src/environments/environment.ts` holds the `firebase` web config (project `iotel-e9a72`) and `useEmulators`. There is one environment file, no `fileReplacements`; add a second only if dev/prod projects diverge.
- `src/app/core/firebase/firebase.ts` provides root-scoped `FIREBASE_APP`, `FIREBASE_AUTH` and `FIRESTORE` tokens. Add `FIREBASE_STORAGE` there in the same style (emulator connect behind `environment.useEmulators`). Nothing needs registering in `app.config.ts`.
- Firebase web config is not a secret; **security rules are the protection**.
- The app is zoneless, so SDK promises/listeners don't trigger change detection by themselves: push results into `signal`s (`signal.set(...)` inside `onSnapshot` callbacks, or `toSignal` on an Observable wrapper).

### 2. Reading and writing with the plain SDK
```ts
private readonly db = inject(FIRESTORE);
private readonly _products = signal<Product[]>([]);
readonly products = this._products.asReadonly();

constructor() {
  // realtime read → signal; unsubscribe on destroy for non-root services
  onSnapshot(query(collection(this.db, 'products'), orderBy('name')), snap =>
    this._products.set(snap.docs.map(d => ({ ...(d.data() as Omit<Product, 'id'>), id: d.id }) as Product)),
  );
}
add(p: Omit<Product, 'id'>): Observable<void> {
  return from(addDoc(collection(this.db, 'products'), p)).pipe(map(() => void 0));
}
```
Use `withConverter` (or a mapper) to turn `Timestamp` into ISO strings; models use `string` dates. Write `serverTimestamp()` for `createdAt`/`sentAt`.

### 3. Auth (done — see `AuthService`, `UserService`, `firestore.rules`)
- Firebase Auth email/password + a `users/{uid}` profile doc (`name`, `email`, `role`, `createdAt`). The role is stored in the profile doc and enforced by `firestore.rules` (users can't change their own role; only admins create staff/admin accounts or change roles). The role is not a custom claim; the only custom claim is `otpAuthTime`, set by the `verifyLoginCode` function for the two-step sign-in (see CLAUDE.md).
- Guards stay synchronous because `provideAppInitializer(() => inject(AuthService).ready)` restores the session before routing. Client guards are UX only; rules are the enforcement.
- Sign-up is always `customer`. Admin-created accounts use a throwaway secondary Firebase app (`UserService.createAccount`) so the admin's own session isn't replaced.
- Forms use `shared/utils/validators.ts` (`emailFormat`, `personName`, `strongPassword`, `matchesControl`, `requiredTrimmed`) and `authErrorMessage()` for Firebase errors.
- Race-proofing: `AuthService` bumps a `version` on every auth event so a slow profile read can't overwrite a newer state.
- Done since: two-step sign-in (emailed code / TOTP), email verification via the code, password reset. Not done: disabling or deleting accounts (would go in `functions/`).

### 4. Firestore data modelling (replaces `MOCK_*` + `of(...)`)
- Keep the same `readonly` signal names services already expose, and the same Observable return types for writes (see section 2).
- **Ids**: Firestore ids are strings. `User`, `Product`, `Conversation`, `CartItem.productId` are numeric today, so change the models in `core/models/` (and the mock data) together, or keep a numeric `sku`/legacy field deliberately. Do this as one deliberate refactor, not piecemeal.
- **Orders**: place an order and decrement stock in one `runTransaction` (all reads before writes; fail if any `stock < qty`). Don't derive order numbers from list length (`ORD-2026-NNNN` today) — use a counter doc updated in the same transaction, or a Cloud Function.
- **Messages**: model as `conversations/{id}` + `conversations/{id}/messages/{msgId}` rather than the embedded `messages: Message[]`; listen with `onSnapshot` ordered by `sentAt`. Keep `lastMessage`, `lastMessageAt`, `unreadCount` denormalized on the conversation doc.
- Cart stays client-side (`CartService`) until checkout; persist to `localStorage` if needed, not Firestore.
- Add composite indexes as Firestore prompts for them (`firestore.indexes.json`).

### 5. Security rules (`firestore.rules`, `storage.rules`)
`firestore.rules` currently covers `users` only and denies everything else; extend it as each collection migrates. Derive from the role matrix in CLAUDE.md / `copilot-instructions.md`:
- customer: read `products`/`services`; read/create own `orders` (`resource.data.customerId == request.auth.uid`), no status changes; read/write own conversations and addresses.
- staff: read all orders, update status only; read `products`, update stock only; read/write conversations.
- admin: full access to products/orders/inventory/conversations.
Never ship `allow read, write: if true` (or the test-mode 30-day default). Test rules with the emulator.

### 6. Emulators and dev
- `firebase.json` (rules + emulator ports) and `.firebaserc` (`iotel-e9a72`) exist. The Firestore emulator needs Java, which isn't installed here, so rules can't be tested locally yet.
- Flip `environment.useEmulators` to `true` locally; the Auth and Firestore token factories connect to the emulators (add Storage the same way).
- Seed demo users (with `users/{uid}` profile docs) and sample products into the emulators with a script so the app is usable locally; run `firebase emulators:start` + `npm start`.

### 7. Migration order (smallest safe steps)
1. ~~SDK, environment, tokens, firebase.json/.firebaserc~~ (done).
2. ~~Auth + profiles + role rules~~ (done).
3. `ProductService` (read-mostly, unblocks catalog/admin/staff inventory).
4. `OrderService` with the stock transaction; then `MessageService`, `BookingService`.
5. Delete `core/mocks/mock-data.ts` usage (keep a seed script instead), tighten rules.
