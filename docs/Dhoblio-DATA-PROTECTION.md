# Dhoblio: data protection, retention and account deletion

**Status: PROPOSED. The numbers below are engineering defaults, all configurable by environment variable.
They need business and legal sign-off (tracker X-5) before launch, in particular the financial and audit
retention periods, which depend on Pakistani tax and accounting rules.**

## 1. What personal data we hold

| Data | Where | Sensitivity |
|---|---|---|
| Name, phone, email, locale, referral code | `User` | personal |
| Delivery addresses and map pins | `Address`, order address snapshot | personal, location |
| CNIC number (vendors, riders) | encrypted + hashed fields on `Vendor` / `Rider` | high |
| CNIC photos, shop photos, rider photo, complaint photos | Cloudinary (private) + `VendorDocument` | high |
| Login codes | `OtpCode` (hash only), Redis | short-lived |
| Push device tokens | `DeviceToken` | personal |
| Notification log | `Notification.payload` | may contain names and order numbers |
| Orders, payments, payouts, ledger | `Order`, `Payment`, `Payout`, `LedgerEntry` | financial |
| Reviews and complaints | `Review`, `Complaint` | personal text |
| Audit trail | `AuditLog` | operational evidence |

## 2. Retention periods (all configurable)

| Category | Default | Setting | Action |
|---|---|---|---|
| Login codes | 2 days | `RETENTION_OTP_DAYS` | deleted |
| Sessions | 30 days | `RETENTION_SESSION_DAYS` | deleted |
| Notification log | 180 days | `RETENTION_NOTIFICATION_DAYS` | deleted |
| Webhook events | 90 days | `RETENTION_WEBHOOK_EVENT_DAYS` | deleted |
| Order address details and customer note | 730 days | `RETENTION_ORDER_PII_DAYS` | blanked, amounts kept |
| Documents of rejected vendor/rider applications | 90 days after the decision | `RETENTION_REJECTED_APPLICATION_DAYS` | deleted, including Cloudinary files |
| Financial records (orders, payments, ledger, payouts) | 8 years | `RETENTION_FINANCIAL_YEARS` | **never auto-deleted**; the nightly log reports what is past the limit |
| Audit logs | 7 years | `RETENTION_AUDIT_YEARS` | same: reported, not deleted |

`RETENTION_DRY_RUN=true` makes the nightly clean-up log what it would remove without removing it.

## 3. Account deletion ("delete my account")

Customers, shop owners and riders can request deletion; admins cannot (they are staff accounts).

1. **Request** `POST /me/delete-request` with a fresh login code. Sessions are revoked and the account becomes
   `PENDING_DELETION`. Only the status and cancel endpoints work during the grace period.
2. **Blockers.** The request is refused, with the reasons listed, while the account has open orders, an active
   delivery job, a payout in progress, unsettled COD cash (riders), a vendor balance owed, or an open complaint.
3. **Grace period** of `ACCOUNT_DELETION_GRACE_DAYS` (30). `DELETE /me/delete-request` cancels it.
4. **Anonymisation** runs nightly at 03:15 Pakistan time, in one transaction, so it is safe to re-run. The user row
   stays so orders, payments and the ledger keep their references. Name becomes "Deleted user"; phone, email,
   addresses, device tokens, login codes, notification payloads and CNIC data are removed; Cloudinary assets are
   queued for deletion; reviews and complaints keep their text but lose the identity.
5. **Legal hold.** An admin can place a hold (`DELETE /admin/users/:id/legal-hold` lifts it); held accounts are
   skipped until it is lifted. Admins list requests at `GET /admin/deletion-requests`.
6. **Audit.** Every step is written to the audit log without personal data. Reasons are fixed codes, never free text.

## 4. Access right

`GET /me/export` returns the user's own data as JSON (account, addresses, orders, reviews, complaints, etc.).

## 5. Open decisions for business and legal

- Final financial and audit retention periods (defaults 8 and 7 years).
- Whether a login during the grace period should cancel the request (currently: it does not; the user must cancel).
- Whether reviews should be removed instead of anonymised on deletion.
- Breach notification process and the named data-protection owner (not code).

## 6. Verification checklist before launch

- [ ] Database and backup encryption at rest confirmed with the hosting provider.
- [ ] Log redaction checked on production-like traffic (phone, CNIC, OTP codes never appear in logs).
- [ ] CNIC decryption is admin-only and audited (covered by an existing test; re-check in UAT).
- [ ] One full deletion run on staging with real-looking data, including Cloudinary asset removal.
