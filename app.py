from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import pickle
import logging
import joblib
import yagmail
from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

app = Flask(__name__)
CORS(app)
load_dotenv()
logging.basicConfig(level=logging.INFO)

# Load model and vectorizer
model = joblib.load("spam_model.pkl")
vectorizer = joblib.load("vectorizer.pkl")

# Gmail API scope
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

# Email credentials
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASS = os.getenv("SENDER_PASS")

def authenticate_gmail():
    creds = None
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)
    return build('gmail', 'v1', credentials=creds)

def send_email(to, subject, body):
    try:
        yag = yagmail.SMTP(SENDER_EMAIL, SENDER_PASS)
        yag.send(to=to, subject=subject, contents=body)
        print(f"✅ Email sent to {to}")
    except Exception as e:
        print(f"❌ Email failed: {e}")

# ========== Route: Predict single message ==========
@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    email = data.get("email", "").strip()
    text = data.get("text", "").strip()[:1000]

    if not email or not text:
        return jsonify({"error": "Email and message text are required."}), 400

    vec_input = vectorizer.transform([text])
    prediction = model.predict(vec_input)[0]
    label = "SPAM" if prediction == 1 else "Not Spam"

    # Send email
    subject = "Spam Scanner - Message Prediction"
    body = f"""
Hi,

You submitted the following message:

{text}

Prediction: {label}

Thank you for using Spam Scanner.
"""
    send_email(email, subject, body)

    return jsonify({"email": email, "prediction": int(prediction), "label": label})


# ========== Route: Scan Gmail inbox ==========
@app.route("/scan-inbox", methods=["POST"])
def scan_inbox():
    data = request.get_json()
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"error": "Email address is required."}), 400

    try:
        service = authenticate_gmail()
        results = service.users().messages().list(userId='me', maxResults=10).execute()
        messages = results.get('messages', [])

        if not messages:
            return jsonify({"message": "No messages found."})

        spam_count = 0
        details = []
        spam_details = []

        for msg in messages:
            msg_data = service.users().messages().get(userId='me', id=msg['id'], format='full').execute()
            snippet = msg_data.get('snippet', '').strip()[:1000]
            headers = msg_data.get("payload", {}).get("headers", [])
            from_header = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")

            vec = vectorizer.transform([snippet])
            prediction = model.predict(vec)[0]
            label = "SPAM" if prediction == 1 else "Not Spam"

            detail = {
                "from": from_header,
                "message": snippet,
                "prediction": int(prediction),
                "label": label
            }
            details.append(detail)

            if prediction == 1:
                spam_count += 1
                spam_details.append(detail)

        # Prepare email body with spam messages only
        spam_text = "\n\n".join(
            [f"From: {msg['from']}\nMessage: {msg['message']}" for msg in spam_details]
        )
        subject = "Spam Scanner - Gmail Inbox Report"
        body = f"""Hi,

We scanned your latest 10 Gmail messages.
Spam detected: {spam_count} message(s).

Details:
{spam_text if spam_count > 0 else "No spam found."}

Thank you for using Spam Scanner.
"""
        send_email(email, subject, body)

        return jsonify({
            "email": email,
            "total_checked": len(details),
            "spam_detected": spam_count,
            "details": spam_details  # Only spam shown
        })

    except Exception as e:
        print(f"❌ Gmail scan failed: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
