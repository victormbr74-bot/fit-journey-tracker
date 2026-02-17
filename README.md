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
