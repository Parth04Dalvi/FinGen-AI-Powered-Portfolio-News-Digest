FinGen: AI-Powered Portfolio News Digest
FinGen is a robust, full-stack application designed to cut through financial market noise. It tracks a user-defined portfolio of stocks, automatically fetches relevant news, and employs Generative AI (Gemini API) to produce concise, structured news summaries, sentiment analysis, and impact ratings.

This project is a demonstration of real-time data integration, scalable cloud persistence, and advanced front-end development, showcasing expertise developed in previous projects like Fibucks and the REAL TIME AUDIO ENABLED SYSTEM.

✨ Core Features Implemented
AI-Driven Summarization: Leverages the Gemini API with structured output (JSON schema) to transform raw financial articles into standardized summaries, sentiment scores (Positive, Negative, Neutral), and impact ratings (Low, Medium, High).

Persistent Portfolio Management: Uses Google Firestore for real-time tracking of user-defined stock tickers, ensuring data persistence across sessions.

Interactive Sentiment Filtering: Implements client-side logic to filter the news digest by sentiment (Positive, Negative, Neutral, All), showcasing data interpretation and responsive UI development.

Data Visualization Mockup: Includes a responsive Portfolio Performance Widget with a line chart mockup (built with inline SVG) to display value and daily return, demonstrating strong Data Visualization skills.

Responsive Full-Stack Design: Built as a single-page application using React and Tailwind CSS for a clean, mobile-first user experience.

💻 Technical Stack
Component

Technology

Rationale & Resume Relevance

Frontend

React, TypeScript, Tailwind CSS

Demonstrates expertise in modern web development frameworks and responsive design (aligns with React, Next.js, and Application Developer roles).

Data Persistence

Google Firestore (via Firebase)

Showcases proficiency in cloud services, real-time data listeners (onSnapshot), and building scalable, user-specific data structures.

AI / NLP

Google Gemini API (gemini-2.5-flash)

Core focus. Used for complex text processing, summarization, and extracting structured analytical data (directly relates to Gemini API experience on resume).

Architecture

Single-Page Application (SPA)

Clean, modular component architecture using React functional components and hooks.

🛠️ Setup and How to Run
This is a single-file, self-contained React application.

Prerequisites
Node.js and npm/yarn.

Access to a Firebase project for configuration variables (__firebase_config, __initial_auth_token, __app_id).

A Gemini API Key (for the summarizeNews function).

Local Execution
Since this app uses global environment variables for Firebase configuration, the simplest way to run and test the full functionality is within a Canvas or similar development environment.

Key Endpoints:

The core functionality (fetching and summarizing news) is exposed via the "Generate News Digest" button, which triggers the following sequence:

Reads the list of tickers from the Firestore portfolios collection.

Iterates through mock news articles related to those tickers.

Calls the Gemini API with the article content and a strict JSON output schema.

Persists the structured output (Summary, Sentiment, Impact) to the Firestore news_digests collection, triggering a real-time update on the dashboard.

🚀 Future Roadmap & Enhancements
To demonstrate continued feature development and deep technical skills:

Backend Integration (Node/Express): Decouple the AI logic into a dedicated Node.js/Express backend service, showcasing proficiency in REST APIs and server-side logic (aligns with Node/Express/Backend skills).

Real-time Data Source: Replace the MOCK_NEWS_ARTICLES array with integration of a live, third-party financial news API (e.g., using a Cloud Function for scheduled data ingestion).

Advanced Deployment: Define infrastructure using Docker and create CI/CD pipelines (e.g., GitHub Actions) to automate deployment, directly leveraging the CI/CD and Docker skills listed in the resume.

Author: Parth Samir Dalvi | [LinkedIn] | [Portfolio] | [GitHub]
