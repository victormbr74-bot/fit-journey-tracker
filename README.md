# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Assistant AI Setup (OpenAI + Supabase Edge Function)

The virtual assistant supports a remote AI mode using a Supabase Edge Function.

1. Set your OpenAI secrets in Supabase:

```sh
supabase secrets set OPENAI_API_KEY=your_openai_key
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

2. Deploy the function:

```sh
supabase functions deploy assistant-chat
```

3. Verify project is linked (if needed):

```sh
supabase link --project-ref wwpvogwbiyprtusbiubh
```

If the function is unavailable, the app automatically falls back to local assistant logic.

## FitChat Push Notifications (App Closed)

To enable real push notifications when the app/browser is closed:

1. Generate VAPID keys:

```sh
npx web-push generate-vapid-keys
```

2. Add the public key to frontend `.env`:

```sh
VITE_FITCHAT_WEB_PUSH_PUBLIC_KEY="YOUR_PUBLIC_VAPID_KEY"
```

3. Add secrets to Supabase:

```sh
supabase secrets set FITCHAT_WEB_PUSH_VAPID_PUBLIC_KEY=YOUR_PUBLIC_VAPID_KEY
supabase secrets set FITCHAT_WEB_PUSH_VAPID_PRIVATE_KEY=YOUR_PRIVATE_VAPID_KEY
supabase secrets set FITCHAT_WEB_PUSH_SUBJECT=mailto:seu-email@dominio.com
```

4. Apply migrations and deploy function:

```sh
supabase db push
supabase functions deploy fitchat-push
```

5. Test on mobile:

```txt
- Open the app via HTTPS in a supported browser (Chrome Android recommended).
- Go to FitChat and tap "Ativar notificacoes do FitChat".
- Log in with another account and send a message to this account.
- Close/minimize the app and confirm push delivery.
```

## Pix Payments (Mercado Pago + Manual Fallback)

This project now includes Pix payments with:

- Dynamic Pix (Mercado Pago) via Edge Functions
- Manual Pix fallback (key/copy-paste + proof upload + admin approval)
- Configurable pricing rules (`global`, `professional`, `client_override`)
- Webhook confirmation that activates packages and `client_feature_flags`

### Database / Migrations

Apply migrations (includes tables, RLS, helper functions, storage bucket/policies):

```sh
supabase db push
```

Main objects added:

- `pricing_rules`
- `orders`
- `manual_pix_proofs`
- `client_feature_flags`
- `payment_provider_settings`
- `profiles.is_admin`
- Storage bucket: `manual-pix-proofs`

### Edge Functions to Deploy

```sh
supabase functions deploy create_pix_order
supabase functions deploy pix_webhook
supabase functions deploy admin_approve_manual
```

`pix_webhook` is configured in `supabase/config.toml` with `verify_jwt = false`.

### Required Supabase Secrets / Env Vars (Mercado Pago)

At minimum for automated Pix with Mercado Pago:

```sh
supabase secrets set PIX_PROVIDER=mercadopago
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=YOUR_MP_ACCESS_TOKEN
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=YOUR_MP_WEBHOOK_SECRET
supabase secrets set PIX_WEBHOOK_URL=https://<PROJECT-REF>.functions.supabase.co/pix_webhook
```

Optional:

```sh
supabase secrets set PIX_ORDER_EXPIRATION_MINUTES=30
supabase secrets set PIX_MANUAL_KEY=your-manual-pix-key
supabase secrets set PIX_MANUAL_COPY_PASTE=optional-manual-copy-paste
supabase secrets set PIX_MANUAL_DISPLAY_NAME="SouFit"
supabase secrets set PIX_MANUAL_INSTRUCTIONS="Pague e envie o comprovante para aprovacao."
```

### Mercado Pago Webhook

Configure the webhook/notifications URL in Mercado Pago to point to:

```txt
https://<PROJECT-REF>.functions.supabase.co/pix_webhook?provider=mercadopago
```

Notes:

- The function validates Mercado Pago `x-signature` using `MERCADOPAGO_WEBHOOK_SECRET`.
- Only webhook confirmation marks automated orders as `paid`.
- The webhook fetches payment details from Mercado Pago and applies effects idempotently.

### Manual Pix Fallback

If the provider is not configured (or `PIX_PROVIDER=manual`):

- `create_pix_order` creates `orders.provider = 'manual'` with `status = 'manual_review'`
- Client uploads proof to `manual-pix-proofs`
- Admin approves/rejects in `/pricing` (Admin tab)
- Approval calls `admin_approve_manual` and applies package/feature unlocks

### Admin Setup

Grant admin access by setting `profiles.is_admin = true` for the target user:

```sql
update public.profiles
set is_admin = true
where email = 'admin@example.com';
```

### Frontend Routes

- `/billing`: client payment/subscription page (generate Pix, copy-paste, proof upload, status refresh)
- `/pricing`: professional pricing + admin pricing/provider/proof approval
