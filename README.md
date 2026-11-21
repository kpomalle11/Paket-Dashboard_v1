# Paket Chicago production dashboard

Internal dashboard and scheduler for Paket Corporation's Chicago plant.

Two pages share one Firebase project (`paket-production-dashboard-v1`):

- `index.html` is the efficiency and downtime dashboard. An admin uploads the daily shift-report Excel. The page cleans it and saves the result.
- `scheduler.html` is the Gantt planner. It reads an Open Order report in the browser and can save the board.

People sign in with their Paket Microsoft 365 account. The database only answers signed-in users. Only admins can upload a shift report or save a schedule.

The site is hosted on Firebase Hosting (Spark, the free plan), not GitHub Pages. GitHub Free cannot serve a private repository with GitHub Pages.

## What lives where

```
index.html                  Dashboard
scheduler.html              Scheduler
js/paket-config.js          Tenant ID and Firebase web config (Kevin edits the tenant ID)
js/paket-firebase.js        Shared sign-in and database connection
js/escape-html.js           Escapes text before it is shown on the page
database.rules.json         Who can read and write
firebase.json               Hosting + rules deploy config
.firebaserc                 Firebase project id
scripts/extract-historical-seed.py
                            One-time export of the old embedded history
.github/workflows/firebase-deploy.yml
                            Deploy on push to main
```

Firebase web config in `js/paket-config.js` is not a secret. The Microsoft client secret is not in this repo. It goes in the Firebase console only.

Production rows are not in the HTML anymore. They live in Realtime Database:

- `paket-dashboard/latest` — latest cleaned shift report
- `paket-scheduler/latest` — saved schedule
- `admins/{uid}` — `true` (boolean) for each person who may upload or save

Anything else is denied. A person who is signed in can read both trees. They cannot write unless their user id is on the admin list. The admin list itself cannot be edited from the website. Kevin adds admins in the Firebase console.

Line codes such as `BLT#2` cannot be stored as raw database keys (`#` is not allowed). The pages encode those characters when saving and show the original name when loading.

## What Kevin does, in order

Do these yourself. The agent cannot sign in to Azure or Firebase as you.

### 1. Make the GitHub repository private

1. Open the repository on GitHub.
2. Settings → General.
3. Danger zone → Change visibility → Private.

GitHub Free allows a private repository. It does not allow GitHub Pages for that private repository, which is why hosting moves to Firebase.

### 2. Create the Microsoft Entra app

Paket staff sign in with Microsoft. Firebase needs an app registration in your tenant.

1. Open [https://entra.microsoft.com](https://entra.microsoft.com) (or the Azure portal) while signed in as a Paket admin.
2. Microsoft Entra ID → Overview. Copy the **Tenant ID**. It looks like `12345678-1234-1234-1234-123456789abc`.
3. App registrations → New registration.
   - Name: `Paket Production Dashboard`
   - Supported account types: **Accounts in this organizational directory only** (single tenant). This is what stops other companies from signing in. Do not choose "any organization" or "personal accounts".
   - Redirect URI: platform **Web**, value exactly
     `https://paket-production-dashboard-v1.firebaseapp.com/__/auth/handler`
4. Register.
5. Copy the **Application (client) ID**.
6. Certificates & secrets → New client secret. Copy the **Value** immediately. You cannot see it again. This secret does not go in git.
7. API permissions: Microsoft Graph `User.Read` is enough (it is usually added for you). Grant admin consent if the page asks.

### 3. Turn on Microsoft sign-in in Firebase

1. Open [https://console.firebase.google.com/project/paket-production-dashboard-v1/authentication/providers](https://console.firebase.google.com/project/paket-production-dashboard-v1/authentication/providers).
2. Sign-in method → Add provider → Microsoft.
3. Enable it. Paste the Application (client) ID and the client secret from step 2.
4. Save.
5. Authentication → Settings → Authorized domains. These are already there and should stay:
   - `localhost`
   - `paket-production-dashboard-v1.firebaseapp.com`
   - `paket-production-dashboard-v1.web.app`
   Add a custom domain later only if you actually serve the site from one.

### 4. Paste the tenant ID into the repo

Edit `js/paket-config.js`. Replace `YOUR_PAKET_TENANT_ID` with the Tenant ID from step 2.

Optional: set `allowedEmailDomain` to your email domain, for example `paket.com`, if every Paket account uses that domain. Leave it as `""` to accept every account in the tenant.

Commit that change and push it to `main`. Do not put the client secret in this file.

### 5. Deploy hosting and database rules

On your own computer, once, after [installing the Firebase CLI](https://firebase.google.com/docs/cli) and Node.js:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting,database --project paket-production-dashboard-v1
```

That publishes the pages and replaces the open "test mode" database rules. After this, the old public read/write access stops. Unsigned visitors get nothing. Firebase's insecure-rules emails should stop once these rules are live.

The site is then:

- https://paket-production-dashboard-v1.web.app
- https://paket-production-dashboard-v1.firebaseapp.com

Later deploys can be automatic. GitHub Free includes Actions minutes on private repositories.

1. Firebase console → Project settings → Service accounts → Generate new private key. A JSON file downloads. Keep it private.
2. GitHub → this repository → Settings → Secrets and variables → Actions → New repository secret.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: the entire JSON file.
3. Push to `main`, or run Actions → Deploy to Firebase → Run workflow.

The workflow file is `.github/workflows/firebase-deploy.yml`. It deploys hosting and database rules. It does not print the secret.

### 6. Make yourself an admin

1. Open the deployed site and choose **Sign in with Microsoft**. Use your Paket account.
2. The header shows your **user id**. Choose **Copy**.
3. Firebase console → Realtime Database → Data.
4. Add a child of the root named `admins` if it is not there.
5. Under `admins`, add a child whose **key** is that user id and whose **value** is the boolean `true` (not the word true in quotes). The console has a type toggle; pick boolean.
6. Refresh the dashboard. The admin upload panel appears.

Repeat for anyone else who should upload shift reports or save the scheduler. Everyone else at Paket can still sign in and look. They cannot change stored data.

You cannot add the first admin from the website. The rules block that on purpose, so a signed-in person cannot grant themselves write access.

### 7. Put the history back, once

The old pages had the production history hardcoded in the HTML. That copy was removed from the current files so it is not served to the internet. It is still in git history. To load it into Firebase:

```bash
python3 scripts/extract-historical-seed.py
```

That writes `data/historical-seed.json` on your computer. That file is listed in `.gitignore`. Do not commit it, and do not email it around.

Sign in as an admin, open the dashboard, and choose **Import historical seed (.json)**. Pick the file you just created. Then delete the file from your computer.

After that, the normal update is the shift-report upload in the admin panel. Each upload replaces `paket-dashboard/latest` (it does not keep older uploads as separate versions).

### 8. Turn off GitHub Pages

Repository → Settings → Pages → Source → **None** (or Disable).

If Pages stays on, GitHub will try to publish the site. On a private free repository that publish fails or, if the repository is flipped back to public, the pages would be on the internet again. The database would still require Microsoft sign-in, but there is no reason to keep Pages.

### 9. Tell the plant the new address

Send people https://paket-production-dashboard-v1.web.app (or the `.firebaseapp.com` address). They use **Sign in with Microsoft**. The old shared password no longer works.

The scheduler is linked from the dashboard header, and the dashboard is linked from the scheduler.

## Check it on your own machine

```bash
npm install
npm test
```

That starts the Firebase emulators and checks the rules and both pages. It does not talk to the live project.

To click around locally:

```bash
npm run emulators
```

Then open http://127.0.0.1:5000/index.html?emulators=1

The `?emulators=1` flag works only on your own computer. It simulates Microsoft sign-in. It does nothing on the public Firebase address. The real site always uses Microsoft.

## Roll back

If a deploy looks wrong:

```bash
firebase hosting:rollback --project paket-production-dashboard-v1
```

That restores the previous hosted files. Database rules are not rolled back by that command. To put the previous rules back, check out the older commit and run `firebase deploy --only database` again.

To undo the code:

```bash
git revert <commit>
git push
```

Do not turn the Realtime Database back to test mode. That would make operator names, downtime notes, customer names, and PO numbers readable without signing in, which is the problem these rules close.

Do not turn GitHub Pages back on as a substitute. The password screen that used to be in the HTML did not protect the database.

The old admin password is still in git history. Making the repository private hides that history from the public. If that password was reused anywhere else, change it there. Rewriting git history is not required and would not help copies that already exist.

## Definitions

| Metric | Meaning | Target |
| --- | --- | --- |
| Efficiency | Actual output / expected output | 85% or better |
| Lost minutes | Downtime recorded on the shift report | Lower is better |
| UPM | Units per minute actually run | Depends on the SKU |

## Ideas for a later pass

Not done in this lockdown:

- OEE and downtime-by-cause views, instead of only the current efficiency charts.
- Keep each upload as its own version instead of overwriting `paket-dashboard/latest`, so a bad file can be undone without losing the previous day.
- Finish the Gantt scheduler: shift capacity, drag constraints, and a real compounding flow, with history still coming from Firebase rather than a copy baked into the page.
