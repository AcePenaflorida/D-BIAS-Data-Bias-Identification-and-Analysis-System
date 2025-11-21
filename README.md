<p align="center">
	<img src="https://raw.githubusercontent.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System/main/d-bias/frontend_dashboard/src/assets/logo_ver11.png" alt="D-BIAS Logo" width="180"/>
</p>



# Data Bias Identification and Analysis System (D-BIAS)

D-BIAS is a professional web-based platform designed to help data scientists, ML engineers, and researchers automatically detect, analyze, explain, and visualize biases in datasets before they are used for machine learning. By combining statistical analysis, machine learning, and advanced AI interpretive summaries (powered by Gemini 2.5 Pro), D-BIAS provides actionable insights into dataset fairness and transparency. The backend is built with Flask API for robust and scalable data processing.

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

---


## 🛠 Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
	- Component-based architecture for maintainability
	- Plotly.js and custom chart components for rich visualizations
- **Backend:** Python (Flask)
	- RESTful API endpoints for analysis, upload, and reporting
	- Integration with Gemini 2.5 Pro for AI summaries
- **Database:** Supabase (PostgreSQL)
	- User authentication and analysis history
- **Visualization:** Plotly.js, pdfmake, lucide-react

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
- Gemini 2.5 Pro (AI summaries)
- python-dotenv
- requests

---


## 🔗 APIs Used

- **Gemini 2.5 Pro API:** Generates interpretive summaries and explanations for bias analysis.
- **Supabase API:** Handles user authentication and stores analysis history.

---


## 🚀 Installation

1. **Clone the repository:**
	```sh
	git clone https://github.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System.git
	cd D-BIAS-Data-Bias-Identification-and-Analysis-System
	```

2. **Backend Setup:**
	- Go to `d-bias/backend`
	- Create and activate a Python virtual environment:
	  ```sh
	  python -m venv venv
	  source venv/bin/activate  # On Windows: venv\Scripts\activate
	  ```
	- Install dependencies:
	  ```sh
	  pip install -r requirements.txt
	  ```
	- Configure `.env` with your Gemini API key and Supabase credentials

3. **Frontend Setup:**
	- Go to `d-bias/frontend_dashboard`
	- Install dependencies:
	  ```sh
	  npm install
	  ```
	- Configure `.env.local` with your Supabase keys

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

> _Add screenshots here_

- ![Dashboard Screenshot](screenshots/dashboard.png)
- ![Bias Analysis Screenshot](screenshots/analysis.png)

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---


## 🙏 Acknowledgments

- [Google Gemini 2.5 Pro](https://deepmind.google/technologies/gemini/) for AI-driven summaries
- [Supabase](https://supabase.com/) for authentication and database
- [Plotly](https://plotly.com/javascript/) for data visualizations
- [pdfmake](https://pdfmake.github.io/docs/) for PDF report generation
- All contributors, testers, and users who helped improve D-BIAS
