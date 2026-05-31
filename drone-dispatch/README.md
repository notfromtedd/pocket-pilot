This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Create a local environment file before starting the app:

```bash
cp .env.local.example .env.local
```

Then set the Supabase values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

Supabase also still supports legacy anon JWT keys. If your project uses a legacy key, place it in `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. Apply `schema.sql` in your Supabase SQL editor before using the app so the `products`, `orders`, `tickets`, `customers`, and `drone_telemetry` tables exist.

## Email Verification Setup

Customer sign-in uses Supabase email OTP codes. In Supabase Dashboard, enable email auth and update the auth email template so it contains the 6-digit token:

```html
<p>Your Pocket Pilot verification code is {{ .Token }}</p>
```

Supabase sends a magic link by default unless the Magic Link email template contains `{{ .Token }}`. If the template still only contains `{{ .ConfirmationURL }}`, users will receive a link instead of the code shown by this app.

Supabase's default email service is only suitable for dashboard organization members. To email normal users or testers outside the Supabase organization, configure Auth > SMTP Settings in Supabase. You can use any SMTP provider; if you want Google-hosted mail, configure Supabase custom SMTP with the Google Workspace/Gmail SMTP credentials and set the From address there.

For existing databases created with the older phone-login schema, run this once in the Supabase SQL editor:

```sql
ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique ON customers(email) WHERE email IS NOT NULL;
```

## SMS Setup

The app sends delivery proximity notifications through `app/api/send-sms/route.ts`. If no real provider is configured, the route returns a successful mock response and logs the SMS on the server.

For Africa's Talking, set:

```bash
SMS_PROVIDER=africastalking
SMS_DEFAULT_COUNTRY_CODE=254
AT_ENV=sandbox
AT_API_KEY=your-africas-talking-api-key
AT_USERNAME=sandbox
AT_SENDER_ID=
```

Use `AT_ENV=live` and your live app username when you are ready to send production SMS. `AT_SENDER_ID` is optional and should be a sender ID or shortcode registered to your Africa's Talking app.

For Twilio, set:

```bash
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE=+15551234567
```

With `SMS_PROVIDER=auto`, the app tries Africa's Talking first, then Twilio, then mock logging. Check the current server-side SMS configuration with:

```bash
curl http://localhost:3000/api/send-sms
```

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
