# Mosque Carpool — Railway Deployment Guide

Deploy the PHP + MySQL app on Railway with GitHub auto-deploys.

## 1. Create the Railway project

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select this repository — Railway detects the `Dockerfile` and builds it.

## 2. Add MySQL

1. In the project canvas: **+ New → Database → MySQL**
2. Wait until the MySQL service is running.

## 3. Connect the app to MySQL

1. Click the **web service** (the app) → **Variables** tab.
2. Add these five variables, referencing the MySQL service
   (type them exactly — Railway resolves the `${{...}}` references):

   | Variable | Value |
   |---|---|
   | `MYSQLHOST` | `${{MySQL.MYSQLHOST}}` |
   | `MYSQLPORT` | `${{MySQL.MYSQLPORT}}` |
   | `MYSQLDATABASE` | `${{MySQL.MYSQLDATABASE}}` |
   | `MYSQLUSER` | `${{MySQL.MYSQLUSER}}` |
   | `MYSQLPASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |

3. The service redeploys automatically.

## 4. Create the tables (once)

Connect any MySQL client (DBeaver, TablePlus, MySQL Workbench) to the
Railway MySQL service — use the **public** connection details from the
MySQL service → **Connect** tab — then run `schema.sql`.
(It uses `CREATE TABLE IF NOT EXISTS`, so re-running is safe.)

## 5. Open the app

Railway assigns a domain like `https://<service>.up.railway.app`
(web service → **Settings → Networking → Generate Domain**).
Open it on your phone → **Add to Home Screen** for the app feel.

Every future `git push` to the repo redeploys automatically. ✅

## Notes

- Cost: Railway starts with a $5 free credit, then usage-based
  (typically ~$5–20/month for an app this size).
- The 14 verified Winnipeg mosques are seeded by `schema.sql`.
- `DEPLOY.md` in this repo covers the alternative cPanel path.
