# Safetybiz One

The Safetybiz risk assessment platform and client portal.

- **Safetybiz administrators** onboard clients (head office and sites), build risk assessments from the Safetybiz topic library and the hazard and control registers, rate risk on a 5×5 matrix, raise actions, run audits, publish to the client portal and keep every record.
- **Client managers** see every published risk assessment for their company, add their own staff, collect sign-offs (online or in person on a tablet) and export the acknowledgement record.
- **Client staff** see the assessments for their site, read them and sign.
- PDF export of full risk assessments (laid out like the familiar printed format) and of sign-off records with signatures.

Security is enforced by the database itself (Postgres row-level security), not by the browser: a client can never read another client's data, drafts, registers or internal history, and sign-offs, audits and the activity log cannot be edited or deleted by anyone through the app.

## What's in the box

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css`, `*.js`, `*.png` | The web app. Plain static files: no build step. (`supabase.js`, `jspdf*.js` are bundled libraries.) |
| `config.js` | Your Supabase URL and public key go here. |
| `schema.sql` | Database tables, security rules, triggers and functions. |
| `seed.sql` | The Safetybiz starter library: 184 topics, 70 hazards, 317 controls. |
| `topic-library.csv`, `registers.csv` | The library as spreadsheets, for review. |

## Set up (about 20 minutes)

### 1. Create the Supabase project
1. Sign up at [supabase.com](https://supabase.com) and create a new project (choose the London region for UK data).
2. Open **SQL Editor → New query**, paste the whole of `schema.sql` and press **Run**.
3. New query again: paste `seed.sql` and **Run** to load the Safetybiz library.
4. Add yourself as the first administrator (new query, change the email and name):
   ```sql
   insert into public.portal_invites (email, role, full_name)
   values ('you@safetybiz.co.uk', 'admin', 'Your Name');
   ```
   Only emails listed as invites get access. You add everyone else from inside the app.

### 2. Configure sign-in
In Supabase: **Authentication → URL Configuration**
- **Site URL**: the address where you'll host the app, e.g. `https://portal.safetybiz.co.uk`
- **Redirect URLs**: add the same address (and `http://localhost:8080` if you'll test locally).

Supabase's built-in email sender is limited to a few emails an hour, which is fine for testing. Before inviting clients, set up your own email sender under **Authentication → Emails → SMTP settings** (for example Resend, Postmark, SendGrid or your Microsoft 365 / Google Workspace mail). You can also brand the sign-in email under **Email Templates**.

### 3. Connect the app
Supabase → **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `config.js`. The anon key is designed to be public; the database rules protect the data. Never put the `service_role` key in the app.

### 4. Host it
Any static host works. All three of these are free at this size and redeploy automatically when the code in GitHub changes:
- **Netlify**: Add new site → Import from GitHub → pick the repository → publish directory `/` → Deploy.
- **Vercel**: New project → import the repository → Framework "Other" → Deploy.
- **GitHub Pages**: repository Settings → Pages → Deploy from branch `main`, folder `/`.

Then point a domain such as `portal.safetybiz.co.uk` at it from the host's domain settings, and update the Site URL in step 2 to match.

### 5. First run
1. Open the site, enter your email and click the link you receive.
2. **Clients and sites → Onboard client**: company, head office, other sites, and their manager's email.
3. **Risk assessments → Create**: choose the client site and start from a topic in the library.
4. Tailor hazards, controls and the rating, then **Publish and sign-offs → Publish**.
5. Send the client manager the portal address. They sign in with their email, add their staff, and everyone signs.

## Working locally
Serve the folder with any static server, for example `npx serve .` or `python3 -m http.server 8080`, and open `http://localhost:8080`. It talks to your Supabase project.

## How things fit together
- **Topic library → assessment.** A topic copies its description, people exposed, hazards, controls and ratings into a new client assessment. The copy is independent: editing the library later doesn't change existing assessments.
- **Publishing.** Clients only ever see a frozen, published version. Publishing again creates a new version, and staff are asked to sign again. Action status on published assessments is live.
- **Sign-offs.** Each sign-off stores the name, job title, drawn signature, version, time (set by the server) and method (own account or in person). An assessment with sign-offs can't be deleted; archive it instead.
- **History.** Every change, publication, sign-off and portal view is written to the activity log by the database.

## Backups
Supabase's paid plans include daily backups. On the free plan, export regularly from **Database → Backups** or with `pg_dump`.
