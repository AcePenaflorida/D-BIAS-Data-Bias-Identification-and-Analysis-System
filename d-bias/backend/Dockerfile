# Use official Python image
FROM python:3.10-slim

# Install system dependencies (Chrome, Kaleido, etc.)
RUN apt-get update && apt-get install -y wget gnupg2 fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libxss1 libxtst6 xdg-utils
RUN wget -O /usr/share/keyrings/google-chrome-keyring.gpg https://dl.google.com/linux/linux_signing_key.pub
RUN echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
RUN apt-get update && apt-get install -y google-chrome-stable

# Set work directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Expose port (adjust if needed)
EXPOSE 5000

# Start the Flask app
CMD ["python", "app.py"]
