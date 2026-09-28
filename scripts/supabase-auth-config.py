#!/usr/bin/env python3
"""Setzt die Supabase-Auth-Einstellungen über die Management-API.

Jeder Block wird einzeln gesendet, damit ein abgelehnter Teil (z. B. E-Mail-
Vorlagen ohne eigenes SMTP) die anderen nicht blockiert. Fehler werden mit
der Antwort von Supabase ausgegeben.

Umgebung: SUPABASE_ACCESS_TOKEN, SITE_URL, optional GOOGLE_CLIENT_ID/SECRET,
SMTP_HOST/PORT/USER/PASS/SENDER. Projekt-Ref kommt aus .env.production.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

env = open(".env.production", encoding="utf-8").read()
ref = re.search(r"VITE_SUPABASE_URL=https://([^.]+)\.", env).group(1)
token = os.environ["SUPABASE_ACCESS_TOKEN"]
site = os.environ["SITE_URL"].rstrip("/")
url = f"https://api.supabase.com/v1/projects/{ref}/config/auth"


def patch(label: str, body: dict) -> bool:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        method="PATCH",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
            print(f"✔ {label}")
            return True
    except urllib.error.HTTPError as e:
        print(f"✘ {label}: HTTP {e.code} – {e.read().decode(errors='replace')[:500]}")
        return False


ok = patch(
    "Website-URL & Anmeldung ohne Bestätigungsmail",
    {"site_url": site, "uri_allow_list": f"{site}/**", "mailer_autoconfirm": True},
)

smtp = all(os.environ.get(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS"))
if smtp:
    patch(
        "Eigener Mailversand (SMTP)",
        {
            "smtp_host": os.environ["SMTP_HOST"],
            "smtp_port": os.environ.get("SMTP_PORT") or "587",
            "smtp_user": os.environ["SMTP_USER"],
            "smtp_pass": os.environ["SMTP_PASS"],
            "smtp_admin_email": os.environ.get("SMTP_SENDER") or os.environ["SMTP_USER"],
            "smtp_sender_name": "GymPact",
            "rate_limit_email_sent": 30,
        },
    )

button = (
    '<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;'
    'background:#0fcb84;color:#0a0b0f;border-radius:12px;text-decoration:none;font-weight:600">{label}</a></p>'
)
templates_ok = patch(
    "Deutsche E-Mail-Vorlagen",
    {
        "mailer_subjects_recovery": "GymPact: Passwort zurücksetzen",
        "mailer_templates_recovery_content": "<h2>Passwort zurücksetzen</h2>"
        "<p>Tippe auf den Button, um ein neues Passwort für GymPact festzulegen.</p>"
        + button.replace("{label}", "Neues Passwort festlegen")
        + "<p>Wenn du das nicht angefordert hast, ignoriere diese E-Mail einfach.</p>",
        "mailer_subjects_confirmation": "GymPact: E-Mail bestätigen",
        "mailer_templates_confirmation_content": "<h2>Willkommen bei GymPact</h2>"
        "<p>Bitte bestätige deine E-Mail-Adresse.</p>" + button.replace("{label}", "E-Mail bestätigen"),
    },
)
if not templates_ok and not smtp:
    print("  Hinweis: Supabase erlaubt eigene Vorlagen meist erst mit eigenem SMTP (Secrets SMTP_*).")

if os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"):
    patch(
        "Google-Login",
        {
            "external_google_enabled": True,
            "external_google_client_id": os.environ["GOOGLE_CLIENT_ID"],
            "external_google_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        },
    )

sys.exit(0 if ok else 1)
