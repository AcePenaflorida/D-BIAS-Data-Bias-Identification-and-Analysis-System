<p align="center">
	<img src="https://raw.githubusercontent.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System/main/d-bias/frontend_dashboard/src/assets/logo_ver11.png" alt="D-BIAS Logo" width="180"/>
</p>


# Data Bias Identification and Analysis System

D-BIAS is a professional web-based platform designed to help data scientists, ML engineers, and researchers automatically detect, analyze, explain, and visualize biases in datasets before they are used for machine learning. By combining statistical analysis, machine learning, and advanced AI interpretive summaries (powered by Gemini 3 Pro), D-BIAS provides actionable insights into dataset fairness and transparency. The backend is built with Flask API for robust and scalable data processing.

---


## ✨ Features

- **CSV Dataset Upload:** Easily upload your datasets for analysis.
- **Automated Bias Detection:** Identifies and maps biases using statistical and ML techniques.
- **AI-Powered Summaries:** Generates clear, actionable interpretive summaries using Gemini 2.5 Pro.
- **Interactive Dashboard:** Visualizes bias metrics, distributions, and correlations with charts and heatmaps.
- **PDF Report Generation:** Create and preview professional analysis reports.
- **User Authentication & History:** Secure login and access to previous analyses.
- **Responsive UI:** Modern, mobile-friendly interface built with React and Tailwind CSS.
- **Downloadable Reports:** Export results for sharing or documentation.
- **Distributed Task Processing:** Redis-powered async job queue for scalable analysis operations.
- **Enterprise Security:** CSRF protection, rate limiting, secure cookies, Content Security Policy, HSTS, and additional HTTP security headers.

---


## 🛠 Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
	- Component-based architecture for maintainability
	- Plotly.js and custom chart components for rich visualizations
	- **Deployed on Vercel** for optimal performance and scalability
- **Backend:** Python (Flask)
	- RESTful API endpoints for analysis, upload, and reporting
	- Integration with Gemini API for AI summaries
	- Redis-based distributed task queue (RQ) for async job processing
	- Enterprise-grade security features
	- **Deployed on Railway** for reliable cloud infrastructure
- **Database:** Supabase
	- User authentication and analysis history
- **Visualization:** Plotly.js, pdfmake, lucide-react

---

## 🛡️ Security Features

D-BIAS implements multiple layers of security to protect data and user privacy:

- **CSRF Protection:** Cross-Site Request Forgery protection via Flask-WTF
- **Secure Cookies:** HTTP-only, Secure, and SameSite cookies to prevent XSS and CSRF attacks
- **Content Security Policy (CSP):** Restricts resource loading to prevent injection attacks
- **HTTP Strict Transport Security (HSTS):** Enforces HTTPS connections
- **Security Headers:** X-Frame-Options, X-Content-Type-Options, and Referrer-Policy to prevent common web vulnerabilities
- **Rate Limiting:** Global rate limits (100 requests/hour per IP) to prevent abuse and DoS attacks
- **Secure Configuration:** Environment-based secrets management with python-dotenv

---

## 🔄 Distributed Gemini Request Queue

D-BIAS uses Redis and RQ (Redis Queue) to manage AI analysis requests at scale:

- **Job Queuing:** Analysis requests are queued in Redis, preventing server overload during traffic spikes
- **Asynchronous Processing:** Long-running Gemini API calls are processed in background workers, allowing instant UI feedback
- **Multiple API Key Rotation:** Requests are distributed across multiple Gemini API keys to prevent rate limiting
- **Graceful Fallback:** If a key hits rate limits, the system automatically rotates to the next available key
- **Scalability:** Multiple RQ workers can process jobs in parallel, enabling horizontal scaling
- **Reliability:** Failed jobs can be retried with exponential backoff to ensure task completion

This architecture enables D-BIAS to handle concurrent analysis requests from multiple users without service degradation.

---

## 📦 Libraries & Dependencies


### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Plotly.js
- pdfmake
- lucide-react (icons)
- Supabase JS client

### Backend
- Flask
- pandas
- numpy
- scikit-learn
- Google Generative AI - Gemini 3.0 pro (fallback includes 3.0 flash, 2.5 pro, 2.5 flash)
- python-dotenv
- requests
- Redis (distributed task queue)
- RQ (job queuing)
- Flask-CORS
- Flask-Limiter (rate limiting)
- Flask-WTF (CSRF protection)

---


## 🔗 APIs & Infrastructure

- **Gemini 3 Pro API:** Generates interpretive summaries and explanations for bias analysis.
- **Supabase API:** Handles user authentication and stores analysis history.
- **Redis:** Distributed in-memory data store for task queue management and caching
- **RQ (Redis Queue):** Background job processing for long-running analysis tasks
---


## 🚀 Installation

### Prerequisites
- **Git:** Version control system
- **Python:** 3.8+ for backend
- **Node.js:** 16+ and npm for frontend

### Clone the Repository
```sh
git clone https://github.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System.git
cd D-BIAS-Data-Bias-Identification-and-Analysis-System
```

---

### Windows Installation

#### 1. Backend Setup (Windows)
```powershell
# Navigate to backend directory
cd d-bias\backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

#### 2. Frontend Setup (Windows)
```powershell
# Navigate to frontend directory
cd d-bias\frontend_dashboard

# Install dependencies
npm install
```

#### 3. Configuration (Windows)
- Create `.env` file in `d-bias/backend/` with Gemini API key and Supabase credentials
- Create `.env.local` file in `d-bias/frontend_dashboard/` with Supabase keys

---

### Linux Installation

#### 1. Backend Setup (Linux)
```bash
# Navigate to backend directory
cd d-bias/backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### 2. Frontend Setup (Linux)
```bash
# Navigate to frontend directory
cd d-bias/frontend_dashboard

# Install dependencies
npm install
```

#### 3. Configuration (Linux)
- Create `.env` file in `d-bias/backend/` with Gemini API key and Supabase credentials
- Create `.env.local` file in `d-bias/frontend_dashboard/` with Supabase keys

---


## 💻 How to Run

### Backend (Flask)
```sh
cd d-bias/backend
python app.py
```

### Frontend (React)
```sh
cd d-bias/frontend_dashboard
npm run dev
```

Visit the dashboard at [http://localhost:5173](http://localhost:5173)

---


## 🖼 Screenshots

### Home & Authentication
<p align="center">
	<img src="https://raw.githubusercontent.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System/main/d-bias/_data/program_files/system_ss_1.png" alt="Home Page" width="700"/>
	<br/>
	<em>D-BIAS home page with authentication and dataset upload interface</em>
</p>

### Dataset Upload & Validation
<p align="center">
	<img src="https://raw.githubusercontent.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System/main/d-bias/_data/program_files/system_ss_2.png" alt="Dataset Upload" width="700"/>
	<br/>
	<em>CSV dataset upload with validation and quality checks</em>
</p>

### Bias Detection Analysis
<p align="center">
	<img src="https://raw.githubusercontent.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System/main/d-bias/_data/program_files/system_ss_3.png" alt="Bias Analysis" width="700"/>
	<br/>
	<em>Automated bias detection showing multiple bias types and severity metrics</em>
</p>

### Interactive Dashboard & Visualizations
<p align="center">
	<img src="https://raw.githubusercontent.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System/main/d-bias/_data/program_files/system_ss_4.png" alt="Dashboard Visualizations" width="700"/>
	<br/>
	<em>Interactive dashboard with bias distribution charts and correlation heatmaps</em>
</p>

### AI-Powered Explanations
<p align="center">
	<img src="https://raw.githubusercontent.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System/main/d-bias/_data/program_files/system_ss_5.png" alt="AI Explanations" width="700"/>
	<br/>
	<em>AI-generated summaries and actionable recommendations powered by Gemini</em>
</p>

### PDF Report Generation & Export
<p align="center">
	<img src="https://raw.githubusercontent.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System/main/d-bias/_data/program_files/system_ss_6.png" alt="PDF Report" width="700"/>
	<br/>
	<em>Professional PDF report with analysis results, visualizations, and recommendations</em>
</p>

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---


## 🙏 Acknowledgments

- [Google Gemini 3 Pro](https://deepmind.google/technologies/gemini/) for AI-driven summaries
- [Supabase](https://supabase.com/) for authentication and database
- [Plotly](https://plotly.com/javascript/) for data visualizations
- [pdfmake](https://pdfmake.github.io/docs/) for PDF report generation
- All contributors, testers, and users who helped improve D-BIAS
