# HEIC upload diagnosis, 2026-09-27

User-supplied original was inspected locally; original and decoded pixels remain in ignored local diagnostic files and are not committed or sent to an external image service.

## File and local preparation

Original: HEIC, 7,306,609 bytes, 4284 x 5712 pixels, one 8-bit RGB frame. libheif decoded the complete image successfully. Native HEIC decoding is unavailable in the installed Windows Chromium and Playwright WebKit, so browser measurements used a lossless PNG decoded from the same image. These measurements do not claim to reproduce iOS's native HEIC decoder/JPEG encoder or its exact upload bytes.

| Browser | Prepared JPEG bytes | Thumbnail bytes | Multipart bytes | Dimensions |
| --- | ---: | ---: | ---: | --- |
| chromium | 863727 | 105023 | 969455 | 1200 x 1600 |
| webkit | 863794 | 105019 | 969516 | 1200 x 1600 |

## External request-size boundary

Read-only unauthenticated OPTIONS probes sent Content-Length and Expect: 100-continue headers with no body and no photograph. The public Bike API photo endpoint returned 100 Continue for 1,048,576 bytes and HTTP 413 for 1,048,577 bytes. The rejecting response lacked Access-Control-Allow-Origin, which can hide HTTP 413 behind a generic browser network failure.

This 1 MiB nginx boundary conflicts with both the frontend's separate full/thumbnail budgets (900 KiB + 180 KiB plus multipart overhead) and the API's existing 10 MiB-per-image/21 MiB-multipart contract. It is a verified infrastructure defect. The locally measured particular image is below the boundary, so this measurement alone does not attribute the user's iPhone failure to it. Shared Services owns the narrowly scoped nginx correction and server-log investigation in thread 01a0e32c-5e50-7e10-90f8-7f7ac04270cf. Application runtime remains v1625, uploader engine 1.0.0.

## Server log corroboration

Shared Services found 58 actual photo POST rejections with HTTP 413 and a reported body length of 1,078,552 bytes, exceeding 1 MiB by 29,976 bytes. These were separated from three diagnostic OPTIONS requests; latest matching POST was at 2026-09-27 15:07:54 UTC. This confirms real uploads were rejected by the nginx size gate during the session. Sanitized aggregates do not independently identify the file content of each POST. The iPhone-encoded request size therefore cannot be replaced with the local Windows encoder measurement above.

## Published scoped correction

Shared Services published the nginx-only correction from commit eeaedf54b7321dfa118120814ef17a3dec716d5b, reviewed in https://github.com/Dimok911/bikepacking-api/pull/9. Activation was confirmed at 2026-09-27T15:23:45Z. No application process restart or frontend release was required; application remains v1625 and uploader engine 1.0.0.

- Active vhost SHA-256: bc71bcf3e9ce4f04a5ca524c805e85b2200ed57ea0604278f76af22d1a54a0ed.
- Upload snippet SHA-256: e508b08379e5d77a228ea62aef599f3b32dacc05fa1b41e65a8bc9c65479f90d.
- Recoverable previous config: /root/staging/bike-photo-upload-20260927T152248Z/previous.conf.
- Scope: 21 MiB multipart limit only on the four list/admin photo-upload endpoints. Existing upstream, URI and forwarding headers are preserved.
- Validation: isolated nginx passed 43 size-boundary and 8 proxy-inheritance checks; complete candidate config passed; live API health checks passed. Graceful reload preserved nginx master PID. Automatic rollback timer was disarmed after successful verification.
- GitHub Actions were not used, per the owner's explicit instruction.

Independent external verification from the Bike Packing task used OPTIONS headers only, without a body, photograph or authentication:

| Endpoint class | Content-Length | Response |
| --- | ---: | --- |
| List photo upload | 1078552 | 100 Continue |
| List photo upload | 22020096 (21 MiB) | 100 Continue |
| List photo upload | 22020097 | 413 |
| Ordinary Bike API authorization path | 1048577 | 413 |

This verifies removal of the erroneous proxy gate and preservation of the unrelated route limit. It does not claim an authenticated upload of the user's original from physical iPhone has completed; that final user-device check remains necessary. No original or derived photographs were published or committed.
