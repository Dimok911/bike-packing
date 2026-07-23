# Production deployment

Frontend production is published through two independent channels. A release is
complete only when both channels serve the same application version.

## Build artifact

Run the required checks and build from `main`. Upload the contents of:

`www/vniipo-help.ru/bike-packing`

Do not rebuild separately for each destination.

## Destinations

1. Push `main` to GitHub and wait for the `Deploy GitHub Pages` workflow.
   Verify `https://dimok911.github.io/bike-packing/`.
2. Upload the same build artifact through FTP to
   `/www/vniipo-help.ru/bike-packing/` on the hosting that serves
   `https://vniipo-help.ru/bike-packing/`.

The main `vniipo-help.ru` hosting is separate from the VPS used by
`experiment.vniipo-help.ru` and `exp-to-prod.vniipo-help.ru`. Production static
files are uploaded by FTP, not by SSH.

The local FTP connection is configured in the Git-ignored
`.vscode/sftp.json`. Treat the whole file as a secret even though only the
password field is confidential.

For a recoverable update, upload into a new sibling staging directory first
and verify it through HTTPS. Then rename the current `bike-packing` directory
to a versioned backup and rename the verified staging directory to
`bike-packing`. If activation fails, restore the backup immediately.

## Verification

After both deployments:

- open both public URLs and confirm the expected application version;
- inspect each deployed `sw.js` and confirm the expected `CACHE_NAME`;
- confirm the main site's `app.js` and `styles.css` are from the same build;
- do not report the production release as complete if either destination is
  unavailable or still serves the previous version.

FTP credentials and private keys must stay outside the repository,
documentation, shell history, and build archives. Store them only in a secure
local credential store or provide them temporarily for a deployment.
