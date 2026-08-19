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

## Exact FTP topology

The FTP connection root and the production directory are different levels:

- `.vscode/sftp.json` must keep `protocol: "ftp"` and `remotePath: "/"`;
- `remotePath: "/"` means the FTP account root; it is not the public
  bike-packing directory;
- the production directory relative to that FTP root is fixed as
  `/www/vniipo-help.ru/bike-packing/`;
- FTP `/www/vniipo-help.ru/bike-packing/index.html` maps to public
  `https://vniipo-help.ru/bike-packing/index.html`;
- staging and backup directories are siblings below FTP
  `/www/vniipo-help.ru/`, so directory-swap deployment is available;
- never upload application files directly to FTP `/`, and never derive the
  production path from `remotePath` alone.

Use the project deployment script instead of composing FTP commands manually:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-production-ftp.ps1 -ExpectedVersion vNNN
```

The script reads `.vscode/sftp.json` without printing it, passes credentials to
the approved `C:\Windows\System32\curl.exe` through UTF-8 stdin, refuses any
`remotePath` other than `/`, and always targets the fixed production path
`/www/vniipo-help.ru/bike-packing/`. The transport is explicit FTPS on port 21
in passive mode. Curl connects with the canonical hostname `vniipo-help.ru`,
uses `88.212.206.188` as the fixed fallback address, requires TLS, and verifies
the hosting server with its pinned SPKI public key. The legacy hosting
certificate is self-signed and has a different certificate name, so the SPKI
pin is the trust anchor; changing it requires a separately verified hosting
certificate rotation. The script performs this recoverable sequence:

1. upload the build to a unique sibling staging directory below FTP
   `/www/vniipo-help.ru/`;
2. download it back and compare every file with the local artifact by SHA-256;
3. verify staging `index.html`, `app.js`, `styles.css`, and `sw.js` through its
   public HTTPS sibling URL;
4. rename production to a unique backup and staging to `bike-packing`;
5. download production back and compare every artifact file by SHA-256;
6. verify `index.html`, `app.js`, `styles.css`, and `sw.js` through production
   HTTPS;
7. automatically restore and verify the previous directory if activation or
   public verification fails.

The versioned backup is intentionally retained for manual recovery. A failed
release directory is also retained if a post-activation rollback was needed;
never delete deployment directories using an unvalidated wildcard.

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
