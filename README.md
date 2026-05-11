# Manual Cloud Sync

Manual Cloud Sync is a TauriTavern extension panel for explicit cloud handoff sync.

It supports:

- WebDAV with Basic or Bearer authentication.
- S3-compatible storage with path-style support.
- Manual upload of a full data archive.
- Manual download of the oldest remote item.
- Remote queue display and explicit remote item deletion.

## Requirements

This repository contains the installable frontend extension only. It requires a
TauriTavern build that provides these native commands:

- `cloud_sync_get_config`
- `cloud_sync_save_config`
- `cloud_sync_list_queue`
- `cloud_sync_upload_now`
- `cloud_sync_download_now`
- `cloud_sync_delete_remote_item`

If those commands are missing, the extension will surface the backend error.
There is no mock success path or silent fallback.

## Install

Install this repository from TauriTavern's Extensions panel:

```text
https://github.com/ExAlan7588/ManualCloudSyncPluginPlan
```

The extension installer expects `manifest.json` at the repository root; this
repo is structured for that GitHub install flow.

## Sync Model

Each upload creates a new `sync-MMDDHHMMSS.zip` plus a matching `.json`
manifest. Downloads process the oldest manifest first, verify size and SHA-256,
apply the archive with mirror semantics, then delete the remote zip and
manifest only after a successful import.
