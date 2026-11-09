# ParcelHub

**All your deliveries, one dashboard.**

Save a tracking number once and keep your parcels from different Indonesian couriers together. See the latest saved status, check the delivery history, and keep notes without opening a separate website for every shipment.

ParcelHub runs on your own computer or server. You can organize parcels without a paid tracking subscription; automatic courier updates require a compatible tracking provider.

![ParcelHub dashboard showing clearly labeled demo shipments](docs/screenshots/desktop.png)

## What you can do

- Save parcels with a name, courier, tracking number, store, notes, and tags.
- Follow shipping updates and view the original courier event descriptions.
- Search and filter parcels, then archive completed deliveries.
- Import several tracking numbers at once and review duplicates before saving.
- View saved tracking information and add or edit parcels while offline.
- Choose a light or dark theme and English or Bahasa Indonesia.
- Export your parcels and make full backups.
- Install ParcelHub from a supported browser for quicker access.

## Start ParcelHub

You need [Node.js](https://nodejs.org/en/download) **24.10 or later**. Node 24 LTS is supported. Internet access is needed for the initial installation.

Get the project by [downloading the ZIP](https://github.com/0xAldoLim/ParcelHub/archive/refs/heads/main.zip) and extracting it, or by cloning this repository.

### Windows

1. Open the extracted **ParcelHub** folder containing `Start-ParcelHub.ps1`.
2. Open PowerShell in that folder.
3. Run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-ParcelHub.ps1
   ```

4. Wait until the terminal says ParcelHub is running.
5. Open **[http://127.0.0.1:3001](http://127.0.0.1:3001)** in your browser.

The launcher handles setup and starts the app. If npm is missing, it downloads a local copy into the project folder. Keep the terminal open while using ParcelHub. Press **Ctrl+C** to stop it; run the same command to start it again. Your saved parcels remain available after restarting.

### macOS, Linux, or manual installation

Open a terminal in the ParcelHub folder. For the first installation, run:

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if installing manually.

Open **[http://127.0.0.1:3001](http://127.0.0.1:3001)**. After the first setup, start it again with `npm start`. Keep the terminal open while the app is running.

### Docker

Copy `.env.example` to `.env` and set `PARCELHUB_AUTH_TOKEN` to a random access token of at least 24 characters. The [self-hosting guide](docs/deployment.md#docker) includes a command to generate one.

```sh
docker compose up --build -d
```

Open **[http://127.0.0.1:3001](http://127.0.0.1:3001)** and sign in with that token. Docker keeps the app running in the background, so you can close the terminal.

To stop it, run `docker compose down`. Your data stays in its persistent volume. Do not add `-v` unless you intend to delete that data.

## Track your first parcel

1. Click **Add parcel**.
2. Enter your tracking number and select the courier. Check any suggested courier against your receipt.
3. Add a name, such as “Running shoes,” so it is easier to find later.
4. Choose a tracking source and save.

**Automatic** uses an eligible provider you have configured. **Manual** keeps your tracking number and notes available, with an official courier link where one has been verified. **Mock** creates synthetic delivery events for trying the app; it does not track a real shipment.

Use **Refresh** to check for an update without entering the number again. The parcel card shows its tracking source, last successful update, and any refresh problem. If an update fails, the last valid status and history stay visible.

For several parcels, choose **Bulk import**. Enter one tracking number per line, review duplicates, and select a courier for any uncertain entry before importing.

## Couriers

You can save and organize tracking numbers for JNE Express, J&T Express, TIKI, Shopee Express, SiCepat, AnterAja, Ninja Xpress, POS Indonesia, Lion Parcel, ID Express, SAP Express, and Lazada Logistics.

Automatic tracking depends on your provider and account access. Open **Couriers** to see which connections are configured and which parcels need manual tracking. Not every provider supports every courier, and some couriers require recipient phone verification.

## Turn on automatic tracking

No provider account is needed to save numbers, organize parcels, or use manual tracking. If you want automatic updates:

1. Choose a provider using the [provider guide](docs/provider-comparison.md).
2. Add its API key to the `.env` file on the computer running ParcelHub, then restart the app.
3. Open **Settings → API providers**, enable that provider, and test its connection.
4. Under **Request budgets**, set your limits, enable real API calls, and click **Save settings**.
5. Refresh a parcel saved with **Automatic** tracking.

Real API calls start disabled. The default estimated spending cap is **Rp50,000 per month**; you can change it in Settings. **API usage** shows requests and estimated costs. Your provider's billing may differ from these estimates.

Klik Resi and RajaOngkir/Komerce adapters are available. Biteship tracking requires the tracking ID from a shipment created through your Biteship account; an external marketplace tracking number alone is insufficient. The provider guide explains setup and restrictions.

Automatic refresh normally runs every four hours while ParcelHub is running. Delivered and archived parcels stop automatic polling.

## Offline access and notifications

Visit the running app at least once before going offline. ParcelHub can then show saved tracking information, labeled as cached, and keep parcel additions or edits on your device until it reconnects. If an edit conflicts with the server, use **Review changes** to choose what to keep. Export pending changes before clearing your browser data.

In a supported browser, choose **Install ParcelHub** when offered, or use the browser's install-app menu. Installation gives you an app shortcut and offline access; your computer or server must still be running for new courier updates.

Enable browser notifications in **Settings → Notifications** and choose which delivery events matter to you. Notifications currently work while the app is open; they are not guaranteed when every device is closed or offline.

## Keep your data

In **Settings**, use **Export JSON** for a portable parcel file or **Backup SQLite** for a full backup. **Import JSON** adds new parcels and skips duplicates. **Restore SQLite** replaces the current database, so make a backup before restoring. ParcelHub also saves a safety copy before replacement.

A normal local installation stores parcels in the `data/` folder. Keep that folder and your `.env` file when updating or moving the app. Backups contain personal shipping information, so keep them private.

On a shared computer, signing out keeps the offline browser cache. Clear the site's browser data when you no longer want it stored on that device.

## Open it on another device or on the internet

The default address works only on the computer running ParcelHub. On a phone, `127.0.0.1` refers to the phone itself.

To use ParcelHub over your home network or at a public web address, follow the [self-hosting guide](docs/deployment.md#remote-or-lan-access). That setup requires authentication. Use HTTPS for remote access and installation on devices outside localhost.

This GitHub repository contains the application; it is not a hosted ParcelHub website. A shared web address needs a computer or server that stays running.

## Having trouble opening it?

- **The page will not load:** start ParcelHub and wait for the running message. Check that its terminal is still open, or that its Docker container is running.
- **You are using port 5173:** that is the optional development server. The normal app opens on **port 3001**.
- **You see an old design:** use the **Update app** prompt when shown, then reload the page.
- **Your parcels look missing:** use the same browser address and profile as before. `localhost` and `127.0.0.1` have separate offline caches. Check that the app is using the same `data/` folder.
- **A parcel has no new tracking events:** check its source and provider error. Saving a number does not guarantee a courier has supplied tracking data.

For more help, see [self-hosting and recovery](docs/deployment.md) or [provider setup](docs/provider-comparison.md). Contributors can find commands and project details in the [development guide](docs/development.md).
