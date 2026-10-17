# NSFC check-in kiosk

Sunday check-in app for New Song Fellowship Church. Greeters (or people themselves, via `/self` and QR codes) check people in against the events in the shared NSFC database. Simple PIN login; every database call goes through an API route the signed PIN session protects.

## Configuration

Set these in `.env.local` locally and on the Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — the shared NSFC database (server-side only; nothing talks to Supabase from the browser).
- `APP_PIN` — the PIN greeters enter.
- `MEMBERSHIP_SYNC_SECRET` — shared secret for the CRM's `POST /api/membership/recalculate`. After every check-in, undo, QR check-in or new-visitor add, the kiosk asks the CRM to re-run its membership engine for that person (0 events = new contact, 1–2 = visitor, 3+ = attendee), so regulars stop stalling at "visitor". Must equal `MEMBERSHIP_SYNC_SECRET` on the CRM project. If unset, check-ins still work but statuses are not updated (a warning is logged).
- `CRM_BASE_URL` — optional; defaults to `https://app.newsongtn.cc`.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_PHONE_NUMBER` — optional; sends the carrier-required confirmation text when someone agrees to texts at check-in.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server: 

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
