# Dynamic QR Check-in V2: real-device acceptance

This checklist is intentionally manual. Browser Smoke uses local Chromium fixtures and does not substitute for physical-device camera acceptance.

## iPhone Safari — NOT RUN

- [ ] Open the member check-in page over HTTPS and explicitly start the camera.
- [ ] Confirm the iOS permission prompt and rear-camera selection.
- [ ] Scan a current QR, then confirm the camera stops before the server result appears.
- [ ] Confirm distinct success, expired, already-checked-in, and temporary-retry messages.
- [ ] Background the page and confirm the camera indicator stops; return and start a new scan deliberately.
- [ ] Deny permission and confirm the manager-manual recovery instruction is usable.
- [ ] Check 200% text/OS accessibility size: scanner, QR, status, close, rotate, and manual controls remain reachable.

## Android Chrome — NOT RUN

- [ ] Open the member check-in page over HTTPS and explicitly start the camera.
- [ ] Confirm the Android permission prompt and rear-camera selection.
- [ ] Scan a current QR, then confirm the camera stops before the server result appears.
- [ ] Confirm distinct success, expired, already-checked-in, and temporary-retry messages.
- [ ] Background the page and confirm the camera indicator stops; return and start a new scan deliberately.
- [ ] Deny permission and confirm the manager-manual recovery instruction is usable.
- [ ] Check large system text: scanner, QR, status, close, rotate, and manual controls remain reachable.

No real device, hosted environment, real member, LINE provider, or production credential is used by this PR.
