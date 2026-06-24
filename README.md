# Amazon Price Tracker

This project is a web application that tracks the price of products on Amazon.

## Prerequisites

- Node.js
- npm

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    ```
2.  **Navigate to the project directory:**
    ```bash
    cd amazon-price-bot
    ```
3.  **Install backend dependencies:**
    ```bash
    cd backend
    npm install
    cd ..
    ```
4.  **Install frontend dependencies:**
    ```bash
    cd price-tracker-frontend
    npm install
    cd ..
    ```

## Running the Application

1.  **Start both the frontend and backend concurrently:**
    From the `price-tracker-frontend` directory, run:
    ```bash
    npm run dev
    ```

    This will start the backend server on `http://localhost:3000` and the frontend development server on `http://localhost:5173`.

2.  **Alternatively, you can run them separately:**

    *   **To start the backend server:**
        From the `backend` directory, run:
        ```bash
        node server.js
        ```
        Or, if you have `nodemon` installed globally, you can use:
        ```bash
        nodemon server.js
        ```

    *   **To start the frontend development server:**
        From the `price-tracker-frontend` directory, run:
        ```bash
        npm run dev:frontend
        ```

## Environment Variables

Create a `.env` file in the `backend` directory and add the following:

```env
PORT=5000
MONGO_URI=mongodb+srv://...
EMAIL=your-gmail@gmail.com
PASSWORD=your-gmail-app-password
RECEIVER_EMAIL=recipient-email@gmail.com
SCHEDULE_TIME=0 9 * * *
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
```

---

## Deployment Guide

### Backend (Render)

1. Sign in to [Render](https://render.com/).
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub repository.
4. Render will auto-detect the root `render.yaml` and configure the service.
5. In the creation wizard, fill in the prompted environment variables:
   - `MONGO_URI`: Your MongoDB Cluster URI. If left blank, the app will run in fallback JSON database mode.
   - `EMAIL` & `PASSWORD`: Gmail account and App Password (generated via Google Account settings) for dispatching alerts.
   - `RECEIVER_EMAIL`: Default administrator email for receiving alerts.
   - `SCHEDULE_TIME`: Cron schedule pattern (defaults to `0 9 * * *` for daily checks at 9 AM).
6. Click **Apply** to deploy. Render will automatically download the Chromium binary for Puppeteer and start the service.

### Frontend (Vercel)

1. Sign in to [Vercel](https://vercel.com/).
2. Click **Add New** > **Project** and select your GitHub repository.
3. Keep the Root Directory as default (the root `vercel.json` will automatically orchestrate the build from the `price-tracker-frontend` directory).
4. Under **Environment Variables**, add:
   - `VITE_API_URL`: Set this to your backend API URL deployed on Render (e.g., `https://amazon-price-tracker-api.onrender.com`).
5. Click **Deploy**. Vercel will install dependencies, build the production bundle, and deploy the application.
