# Email deliverability — setup checklist for when the domain arrives

`auth-service` is fully config-driven for outbound email (see `MAIL_*` vars in
`.env.example` and `application.properties`). Right now, with those vars
unset, the password-reset OTP simply fails to send (a clean error, not a
crash — see `UserService.generatePasswordResetOtp`). Nothing below requires
another code change; it's all config + DNS + ESP dashboard work, which
Claude Code has no access to do on its own.

## 1. Pick the ESP and verify the domain

Once the student-pack domain exists, sign up for **Mailgun or SendGrid**
(both free tiers in the GitHub Student Developer Pack) and add the domain
there. The ESP will ask you to prove you own it — that's steps 2–4 below.

## 2. Add the SPF record

The ESP's domain-verification page gives you a TXT record, typically:

```
v=spf1 include:<esp-provided-value> ~all
```

Add it as a **TXT** record on the domain's root (`@`) in your registrar's DNS
settings. If a `v=spf1` record already exists (some registrars add a default
one), merge the `include:` into the existing record instead of adding a
second SPF record — two SPF TXT records on the same name is invalid and
breaks SPF entirely.

## 3. Add the DKIM record(s)

The ESP gives you one or two CNAME or TXT records (Mailgun typically gives 2
CNAMEs; SendGrid gives 3). Add exactly what the dashboard shows, at the exact
host it specifies (often something like `mailo._domainkey.yourdomain.com` or
`s1._domainkey.yourdomain.com`) — don't improvise the record name.

## 4. Add a DMARC record

Add a **TXT** record at `_dmarc.yourdomain.com`:

```
v=DMARC1; p=none; rua=mailto:you@yourdomain.com
```

Start with `p=none` (monitor-only) — don't jump to `p=quarantine`/`p=reject`
until you've confirmed SPF and DKIM are both passing (step 6), or you risk
your own legitimate email getting rejected before it's proven the setup
works.

## 5. Update the env vars

Email is sent via Brevo's **HTTP API** (`POST https://api.brevo.com/v3/smtp/email`),
not SMTP — Railway blocks outbound SMTP (ports 465/587/2525) on non-Pro plans,
which silently timed out every send regardless of ESP/credentials. The HTTP
API has no such restriction, and this is a settled decision, not an open
choice between ESPs anymore — `MailService` speaks Brevo's API directly.

| Var | Value |
|---|---|
| `BREVO_API_KEY` | Brevo dashboard → Settings → **SMTP & API** → **API Keys** tab → generate a key. **Not** the SMTP password from the SMTP tab — that's a different credential and won't work here. |
| `MAIL_FROM_ADDRESS` | `noreply@yourdomain.com` |
| `MAIL_FROM_NAME` | `Tally` |

Leave `MAIL_REPLY_TO` unset unless you want a different reply address than
`MAIL_FROM_ADDRESS`.

Set these in **two places**:
- Local: `tally-backend/auth-service/src/main/resources/application-local.properties` (gitignored).
- Railway: `auth-service`'s Variables tab.

Once real email works, set `OTP_DEBUG_EXPOSE=false` (or just leave it unset)
on Railway so the OTP is never included in the API response — email becomes
the only channel. Locally, leave `OTP_DEBUG_EXPOSE=true` if MailHog (or
whatever you're testing against) isn't a real inbox you can check.

## 6. Send a real test email and check the raw headers

Trigger `POST /api/auth/forgot-password` against a real email address you
control (Gmail is easiest to inspect). In Gmail: open the email → the
3-dot menu → **Show original**. Look for:

```
Authentication-Results: mx.google.com;
       spf=pass ...
       dkim=pass ...
       dmarc=pass ...
```

All three need to say `pass`, not just that the email arrived — an email
can land in the inbox on sender reputation alone even with SPF/DKIM
misconfigured, which would silently rot over time. If any of them fail:

- **SPF fails** — the TXT record isn't propagated yet (DNS can take up to
  24–48h, though it's often much faster) or the `include:` value is wrong.
- **DKIM fails** — the CNAME/TXT record host or value doesn't match exactly
  what the ESP dashboard shows, or hasn't propagated.
- **DMARC fails** — almost always downstream of an SPF or DKIM failure above;
  fix those first and DMARC alignment usually follows.

Only move DMARC from `p=none` to `p=quarantine` once all three have shown
`pass` consistently across a few real test sends.
