"""Clinical follow-up reminder notification service.

Supports SMTP / email service dispatch with structured, responsive HTML digests
for scheduled patient checkups, abnormal lab re-checks, and medication reviews.
"""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import html
import os
import smtplib


def get_notification_config() -> dict:
    host = os.environ.get("SMTP_SERVER") or os.environ.get("SMTP_HOST") or ""
    port = int(os.environ.get("SMTP_PORT") or "587")
    username = os.environ.get("SMTP_USERNAME") or os.environ.get("SMTP_USER") or ""
    password = os.environ.get("SMTP_PASSWORD") or os.environ.get("SMTP_PASS") or ""
    from_email = os.environ.get("SMTP_FROM") or "no-reply@medreport.local"
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() in {"true", "1", "yes"}

    is_configured = bool(host and username and password)
    return {
        "configured": is_configured,
        "host": host,
        "port": port,
        "username": username,
        "from_email": from_email,
        "use_tls": use_tls,
    }


def build_reminder_email_html(reminders: list[dict], user_name: str | None = None) -> str:
    """Generate responsive HTML for clinical reminder digests."""
    greeting = f"Hello {html.escape(user_name)}," if user_name else "Hello,"

    reminder_rows = ""
    for r in reminders:
        tag = (r.get("tag") or "info").lower()
        tag_color = "#dc2626" if tag == "warning" else "#0f706a" if tag == "success" else "#0284c7"
        tag_bg = "#fee2e2" if tag == "warning" else "#e6f6f4" if tag == "success" else "#e0f2fe"
        title = html.escape(str(r.get("title") or "Clinical Check-up"))
        due = html.escape(str(r.get("due_text") or "Scheduled"))
        patient_name = html.escape(str(r.get("patient_name") or "Unassigned Patient"))
        notes = html.escape(str(r.get("notes") or ""))

        notes_html = f'<p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">{notes}</p>' if notes else ""

        reminder_rows += f"""
        <div style="padding: 14px 16px; margin-bottom: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid {tag_color}; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <strong style="font-size: 15px; color: #0f172a;">{title}</strong>
            <span style="font-size: 11px; font-weight: 700; color: {tag_color}; background: {tag_bg}; padding: 2px 8px; border-radius: 999px; text-transform: uppercase;">{due}</span>
          </div>
          <div style="font-size: 12.5px; color: #334155;"><strong>Patient:</strong> {patient_name}</div>
          {notes_html}
        </div>
        """

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Clinical Follow-Up Reminders</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background: #123b56; color: #ffffff; padding: 24px; border-bottom: 3px solid #0f706a;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">MedReport+ Clinical Reminders</h1>
      <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8;">Automated patient follow-up alerts and review schedule</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 14px; line-height: 1.5;">{greeting}</p>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">You have <strong>{len(reminders)} pending clinical follow-up item(s)</strong> requiring attention:</p>
      <div style="margin: 20px 0;">
        {reminder_rows}
      </div>
      <div style="background: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-size: 12px; color: #64748b; margin-top: 24px; line-height: 1.4;">
        <strong>Educational Aid Disclaimer:</strong> These reminders are generated from your medical report records to help you prepare for physician visits. They do not constitute emergency medical care or autonomous clinical prescriptions.
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; font-size: 12px; color: #94a3b8; text-align: center;">
      MedReport+ · Friendly Health Clarity
    </div>
  </div>
</body>
</html>"""


def send_reminder_email(recipient_email: str, reminders: list[dict], user_name: str | None = None) -> dict:
    """Send an email digest of reminders, or simulate successfully if SMTP is not yet configured."""
    if not recipient_email or not reminders:
        return {"status": "error", "delivered": False, "message": "Recipient email or reminder list missing."}

    cfg = get_notification_config()
    html_content = build_reminder_email_html(reminders, user_name)

    if not cfg["configured"]:
        return {
            "status": "simulated",
            "delivered": False,
            "simulated": True,
            "message": f"SMTP not configured in .env. Reminder notification digest preview prepared for {recipient_email} ({len(reminders)} items).",
            "recipient": recipient_email,
            "count": len(reminders),
            "html": html_content,
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Clinical Follow-Up Reminders ({len(reminders)} Pending)"
        msg["From"] = cfg["from_email"]
        msg["To"] = recipient_email

        plain_text = f"You have {len(reminders)} pending clinical follow-up item(s). Please log in to MedReport+ to review."
        msg.attach(MIMEText(plain_text, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
        if cfg["use_tls"]:
            server.starttls()
        server.login(cfg["username"], os.environ.get("SMTP_PASSWORD") or os.environ.get("SMTP_PASS") or "")
        server.send_message(msg)
        server.quit()

        return {
            "status": "sent",
            "delivered": True,
            "simulated": False,
            "message": f"Clinical reminder digest successfully sent to {recipient_email}.",
            "recipient": recipient_email,
            "count": len(reminders),
            "html": html_content,
        }

    except Exception as err:
        return {
            "status": "error",
            "delivered": False,
            "message": f"Could not send reminder email: {str(err)}",
            "recipient": recipient_email,
        }
