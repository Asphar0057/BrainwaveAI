# Twilio SMS OTP implementation

## What changed

- Created the `md files` folder.
- Added the Twilio Python SDK to `backend/requirements.txt`.
- Replaced the former SMS placeholder with a Twilio Messages API sender in `backend/routes/auth.py`.
- Kept the existing SMTP email OTP delivery in place. The same six-digit, database-hashed code is now sent through both email and SMS.
- Added a required phone-number field to the normal registration form. It must be E.164 format, such as `+14155552671`, which Twilio requires.
- Registration now sends its verification code to the submitted email address and phone number. Resends use the saved pending-registration phone number.
- Password reset now accepts either an email address or a linked phone number to locate the account, then sends the code to that account's email and phone number.
- Account deletion continues to require the current password (except Google accounts), then sends the deletion code to the account email and its linked phone number.
- Updated the registration and password-reset UI copy to make the SMS path clear.

## Email verification check

SMTP email OTP support was already present and remains enabled in the code. It uses these environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`

No credentials were changed or exposed.

## Required deployment configuration

Add these values to the backend deployment environment (never commit real values):

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+14155552671
```

Install the updated backend dependencies before deploying:

```bash
pip install -r backend/requirements.txt
```

For a Twilio trial account, recipient phone numbers must be verified in the Twilio console. Production requires a Twilio number capable of sending SMS to the target countries.

## Verification behavior

- OTPs expire after 10 minutes.
- OTP values are hashed in the database; plaintext OTPs are not stored.
- The existing five-attempt limit and endpoint rate limits remain active.
- In production, registration fails safely if either email or SMS cannot be delivered. Existing accounts created before phone registration may still use email-only deletion/reset until they have a linked phone number.
