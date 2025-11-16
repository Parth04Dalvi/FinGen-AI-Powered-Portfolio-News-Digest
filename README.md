⚡ FinGen Digest: AI-Powered Portfolio News Summarizer

<img width="895" height="699" alt="image" src="https://github.com/user-attachments/assets/2b37f0e0-d4b9-4757-9d17-c6d93f762b6d" />



FinGen Digest is a modern, full-stack application built using React that leverages the Gemini API for structured data extraction and Firebase Firestore for persistent user data. It simulates a crucial workflow for financial analysts by providing instant, AI-driven summaries and sentiment analysis for news relevant to a user's portfolio.

✨ Key Features

AI Structured Summarization: Utilizes the Gemini API to analyze raw text content and generate a strictly valid JSON response, containing:

A concise, 1-2 sentence Summary.

An objective Sentiment classification (POSITIVE, NEGATIVE, NEUTRAL).

An anticipated market Impact rating (Low, Medium, High).

Persistent Portfolio Management: Users can add and remove stock tickers (e.g., GOOG, AAPL) to their personalized portfolio. This data is securely stored and synchronized in real-time using Firebase Firestore.

Real-Time Digest: Generated news digests are stored in Firestore, ensuring persistence across sessions and seamless real-time updates for the user.

Responsive UI: A clean, professional financial interface built with React and styled using Tailwind CSS.

Robust API Handling: Implements an exponentialBackoffFetch utility to ensure reliable communication with the Gemini API, gracefully handling potential rate limiting and network issues.

⚙️ Technology Stack

Category

Technology

Purpose

Frontend

React (Hooks & Functional Components)

Component-based UI development and state management.

Styling

Tailwind CSS (CDN)

Utility-first styling for a professional aesthetic.

AI/ML

Gemini API (gemini-2.5-flash-preview-05-20)

Structured generation of news summaries, sentiment, and impact analysis via JSON Schema.

Database

Firebase Firestore

Real-time persistence for user portfolios and processed news digests.

Authentication

Firebase Auth

Anonymous or Custom Token sign-in for user identity management.

▶️ Workflow & Usage

The application simulates the entire lifecycle of a financial data processing pipeline:

Add Tickers: Use the My Portfolio panel to add tickers (e.g., GOOG, AAPL, MSFT) to your tracking list. The portfolio is saved to Firestore.

Generate Digest: Click the Generate News Digest button.

Processing Layer (Simulated): The app filters the mock news articles to match your portfolio.

AI Analysis: Each article's content is sent to the Gemini API, which returns the structured summary, sentiment, and impact.

Persistence: The complete processed digest is saved back to your private Firestore collection.

Display: The Latest AI Digest section updates automatically via the Firestore real-time listener, displaying the structured, high-value summary cards.

Note on Data: The underlying news data is currently mocked (only articles for GOOG, AAPL, and MSFT exist). However, the entire AI processing and storage pipeline using the Gemini API and Firestore is live and functional.
