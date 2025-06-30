import React, { useState } from "react";
import axios from "axios";
import jsPDF from "jspdf";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import "./App.css";

ChartJS.register(ArcElement, Tooltip, Legend);

function App() {
  const [method, setMethod] = useState("single");
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");

  const handleMethodChange = (e) => {
    setMethod(e.target.value);
    setResult(null);
    setText("");
    setEmail("");
    setEmailStatus("");
  };

  const handleCheckMessage = async () => {
    setLoading(true);
    setEmailStatus("");
    try {
      const response = await axios.post("http://localhost:5000/predict", {
        email,
        text,
      });
      setResult(response.data);
      setText("");
      setEmail("");
      setEmailStatus("📧 A summary has been sent to your email!");
    } catch (error) {
      setResult({ error: "Prediction failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleScanInbox = async () => {
    setLoading(true);
    setEmailStatus("");
    try {
      const response = await axios.post("http://localhost:5000/scan-inbox", {
        email,
      });
      setResult(response.data);
      setEmail("");
      setEmailStatus("📧 A spam report has been sent to your email!");
    } catch (error) {
      setResult({ error: "Inbox scan failed." });
    } finally {
      setLoading(false);
    }
  };

  const downloadAsPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Spam Scan Report", 10, 10);
    doc.setFontSize(12);
    doc.text(`Email: ${result.email || "N/A"}`, 10, 20);

    if (result.details && Array.isArray(result.details)) {
      const spamMessages = result.details.filter((msg) => msg.label === "SPAM");

      if (spamMessages.length === 0) {
        doc.text("No spam messages detected. 🎉", 10, 30);
      } else {
        doc.text(`Detected ${spamMessages.length} SPAM messages:`, 10, 30);
        let y = 40;

        spamMessages.forEach((msg, i) => {
          doc.setFontSize(11);
          doc.text(`(${i + 1}) From: ${msg.from}`, 10, y);
          y += 6;
          doc.text(`Message: ${msg.message.slice(0, 100)}...`, 10, y);
          y += 10;
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
        });
      }
    } else {
      doc.text(`Prediction: ${result.label || "N/A"}`, 10, 30);
    }

    doc.save("spam_result.pdf");
  };

  const downloadAsCSV = () => {
    const csv = `Email,Prediction\n${result.email},${result.label}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spam_result.csv";
    a.click();
  };

  return (
    <div className={`app ${darkMode ? "dark" : ""}`}>
      <h1>📧 Spam Detector</h1>

      <div className="toggle-mode">
        <label>
          <input
            type="checkbox"
            checked={darkMode}
            onChange={() => setDarkMode(!darkMode)}
          />
          🌙 Dark Mode
        </label>
      </div>

      <div className="method-select">
        <label>
          <input
            type="radio"
            value="single"
            checked={method === "single"}
            onChange={handleMethodChange}
          />
          ✍️ Check a Single Message
        </label>
        <label>
          <input
            type="radio"
            value="inbox"
            checked={method === "inbox"}
            onChange={handleMethodChange}
          />
          📥 Scan Gmail Inbox
        </label>
      </div>

      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {method === "single" && (
        <textarea
          rows="6"
          placeholder="Enter your message here"
          value={text}
          onChange={(e) => setText(e.target.value)}
        ></textarea>
      )}

      {loading ? (
        <div className="spinner">🔄 Loading...</div>
      ) : method === "single" ? (
        <button onClick={handleCheckMessage} disabled={!email || !text}>
          ✅ Check Message
        </button>
      ) : (
        <button onClick={handleScanInbox} disabled={!email}>
          🔍 Scan Inbox
        </button>
      )}

      {emailStatus && (
        <p style={{ color: "green", marginTop: "10px" }}>{emailStatus}</p>
      )}

      {result && (
        <div className="result fade-in">
          {result.error ? (
            <p>❌ {result.error}</p>
          ) : (
            <>
              <p><strong>📧 Email:</strong> {result.email}</p>
              {result.label && (
                <p>
                  <strong>🧪 Prediction:</strong>{" "}
                  {result.label === "SPAM" ? (
                    <span style={{ color: "red", fontWeight: "bold" }}>⚠️ SPAM</span>
                  ) : (
                    <span style={{ color: "green", fontWeight: "bold" }}>✅ Not Spam</span>
                  )}
                </p>
              )}

              <div className="export-buttons">
                <button onClick={downloadAsPDF}>📄 Download PDF</button>
                <button onClick={downloadAsCSV}>📁 Download CSV</button>
              </div>

              {Array.isArray(result.details) && result.details.some(msg => msg.label === "SPAM") && (
                <div className="chart-container">
                  <h3>📊 Spam Distribution</h3>
                  <Pie
                    data={{
                      labels: ["SPAM", "Not Spam"],
                      datasets: [
                        {
                          data: [
                            result.details.filter((d) => d.label === "SPAM").length,
                            result.details.filter((d) => d.label === "Not Spam").length,
                          ],
                          backgroundColor: ["#ff4d4d", "#4CAF50"],
                          hoverOffset: 6,
                        },
                      ],
                    }}
                  />
                </div>
              )}

              {Array.isArray(result.details) && (
                <div className="spam-details">
                  <h3>⚠️ Detected Spam Messages</h3>
                  {result.details.filter(msg => msg.label === "SPAM").length === 0 ? (
                    <p>No spam messages detected. 🎉</p>
                  ) : (
                    result.details
                      .filter((msg) => msg.label === "SPAM")
                      .map((msg, idx) => (
                        <div key={idx} className="spam-message spam">
                          <p><strong>From:</strong> {msg.from}</p>
                          <p><strong>Message:</strong> {msg.message}</p>
                          <p><strong>Status:</strong> ⚠️ SPAM</p>
                        </div>
                      ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
