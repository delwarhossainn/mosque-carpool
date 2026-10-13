# Mosque Carpool — cPanel Deployment Guide

Everything here runs on plain cPanel shared hosting (PHP + MySQL).
No Node.js, no composer, no build step. ~15 minutes.

---

## Step 1 — Create the database (cPanel)

1. cPanel → **MySQL® Databases**
2. Under *Create New Database*, enter `carpool` → Create.
   Your full DB name will look like `yourcpaneluser_carpool` — **write it down**.
3. Under *MySQL Users → Add New User*, create a user (e.g. `carpool`) with a
   strong password — **write down the full username** (`yourcpaneluser_carpool`)
   **and the password**.
4. Under *Add User To Database*, add that user to the database and tick
   **ALL PRIVILEGES**.

## Step 2 — Import the tables

1. cPanel → **phpMyAdmin**
2. Click your `..._carpool` database on the left.
3. Top menu → **Import** → Choose file → select `schema.sql` from this package → **Go**.
4. You should see 6 tables created and 14 mosques inserted.

## Step 3 — Upload the app files

**Option A — subdomain (recommended):** cPanel → **Subdomains** →
create `carpool` (gives you `carpool.yourdomain.com`, files go in
`public_html/carpool/`).

**Option B — folder:** use `public_html/carpool/` directly
(app lives at `yourdomain.com/carpool/`).

Then: cPanel → **File Manager** → open that folder → **Upload** →
upload the `mosque-carpool-cpanel.zip` → right-click it → **Extract**.
Move the files out of the inner folder if needed so that `index.html`
sits directly in `public_html/carpool/`.

## Step 4 — Connect the app to the database

1. File Manager → open `config.php` → **Edit**.
2. Fill in the three values from Step 1:
   - `DB_NAME` → your full database name
   - `DB_USER` → your full database username
   - `DB_PASS` → the password you created
   - `APP_SECRET` → any long random string (keyboard smash is fine)
3. Save.

## Step 5 — Test it

1. Open `https://carpool.yourdomain.com` (or `yourdomain.com/carpool/`)
   on your phone.
2. Create a **driver** account (tick "I have a car").
3. On a second device/browser, create a **rider** account.
4. Driver: tap **Drive** → choose a mosque → **GO ONLINE**.
5. Rider: choose the same mosque → **Request ride**.
6. Driver sees the request → **Accept** → both sides see the pickup code. ✅

> Tip: on your phone's browser use *Add to Home Screen* — the app then
> opens fullscreen like a native app.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank page / HTTP 500 | cPanel → **Metrics → Errors** to see the message. Usually a typo in `config.php` or PHP < 7.4 (switch via **Software → Select PHP Version**). |
| "Database connection failed" | Recheck DB name/user/password in `config.php` — they must include your cPanel username prefix. |
| Location not working | The app needs HTTPS for GPS. cPanel → **Security → SSL/TLS Status** → run AutoSSL. |
| No drivers found | The driver must be **online for the same mosque** and the rider **same gender** (brothers↔brothers, sisters↔sisters). |

## Files in this package

- `index.html`, `style.css`, `app.js` — the mobile app
- `config.php` — your database credentials (edit this)
- `api/*.php` — the backend (signup, login, matching, trips, notifications)
- `schema.sql` — database tables + 14 verified Winnipeg mosques
