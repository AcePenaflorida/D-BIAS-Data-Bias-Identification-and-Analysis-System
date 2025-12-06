import React, { useEffect, useState } from "react";

const MODAL_KEY = "userConsentGiven";

export default function ConsentModal() {
  const [showModal, setShowModal] = useState(true);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showModal]);

  const handleAgree = () => {
    setShowModal(false);
  };

  const handleDisagree = () => {
    const referrer = document.referrer;
    if (referrer && referrer !== window.location.href) {
      window.location.href = referrer;
    } else {
      window.location.href = "https://www.google.com";
    }
  };

  if (!showModal) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');

        .consent-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: fadeIn 0.3s ease-out;
          font-family: 'Poppins', sans-serif;
        }

        .consent-modal-box {
          background: white;
          border-radius: 14px;
          max-width: 360px;
          width: 95%;
          padding: 1.5rem 1.2rem;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: 'Poppins', sans-serif;
        }

        .consent-modal-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 1rem;
          color: #0f172a;
        }

        .consent-section {
          margin-bottom: 0.9rem;
        }

        .consent-section-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 0.35rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .consent-section-text {
          font-size: 0.85rem;
          color: #475569;
          line-height: 1.55;
          margin: 0;
        }

        .consent-button {
          display: block;
          width: 100%;
          padding: 0.85rem;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          margin-top: 1.1rem;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.18);
        }

        .consent-button:hover {
          background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
          box-shadow: 0 4px 16px rgba(37, 99, 235, 0.22);
          transform: translateY(-2px);
        }

        .consent-button:active {
          transform: translateY(0);
        }

        .consent-button-secondary {
          display: block;
          width: 100%;
          padding: 0.85rem;
          background: #e2e8f0;
          color: #334155;
          border: none;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          margin-top: 0.6rem;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
        }

        .consent-button-secondary:hover {
          background: #cbd5e1;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.10);
          transform: translateY(-2px);
        }

        .consent-button-secondary:active {
          transform: translateY(0);
        }

        @media (max-width: 480px) {
          .consent-modal-box {
            max-width: 98vw;
            padding: 1rem 0.5rem;
          }
          .consent-modal-title {
            font-size: 1rem;
          }
          .consent-section-title,
          .consent-section-text {
            font-size: 0.8rem;
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="consent-modal-overlay">
        <div className="consent-modal-box">
          <div className="consent-modal-title">Data Privacy & Consent</div>

          <div className="consent-section">
            <div className="consent-section-title">Data Collection and Use</div>
            <p className="consent-section-text">
              Any information provided may be collected, stored, and used to improve services, system performance, and support research.
            </p>
          </div>

          <div className="consent-section">
            <div className="consent-section-title">AI-Assisted Analysis</div>
            <p className="consent-section-text">
              Submitted analysis will be securely sent to an AI assistant, Gemini, which will generate explanations and feedback. All data is confidential and not shared with unauthorized parties.
            </p>
          </div>

          <div className="consent-section">
            <div className="consent-section-title">Privacy and Compliance</div>
            <p className="consent-section-text">
              All data handling follows privacy guidelines and applicable regulations. Participation is voluntary and consent can be withdrawn at any time.
            </p>
          </div>

          <button className="consent-button" onClick={handleAgree} autoFocus>
            I Agree
          </button>
          <button className="consent-button-secondary" onClick={handleDisagree}>
            No, I Don't Agree
          </button>
        </div>
      </div>
    </>
  );
}
