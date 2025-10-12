import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, setDoc, query, orderBy, deleteDoc, getDocs, where } from 'firebase/firestore';
import { Loader2, Plus, Trash2, Zap, Search, ChevronRight, User, ChevronUp, ChevronDown } from 'lucide-react';

// --- CONFIGURATION & UTILITIES ---

// Firebase Configuration (MUST use global variables provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-fingen-app';
const API_KEY = ""; // Placeholder for the actual API key provided by the environment

// Mock News Data - In a real app, this would come from an external News API
const MOCK_NEWS_ARTICLES = [
  {
    symbol: 'GOOG',
    title: 'Google Cloud Unveils New AI-Powered Enterprise Search Features',
    url: 'https://example.com/goog-ai-search',
    source: 'TechCrunch',
    content: "Google Cloud announced major updates to its Vertex AI platform, including new features for enterprise search and data handling. Analysts view this as a strategic move to capture more market share from competitors in the generative AI space. The stock saw a 1.5% bump on the news."
  },
  {
    symbol: 'AAPL',
    title: 'iPhone Sales Expected to Soar After Holiday Quarter',
    url: 'https://example.com/aapl-sales-forecast',
    source: 'Financial Times',
    content: "Despite supply chain constraints easing, analysts are cautious about Q4 results but predict a strong rebound for Apple's iPhone and Services divisions in the following quarter, driven by aggressive pricing strategies in key Asian markets. The outlook remains mixed."
  },
  {
    symbol: 'MSFT',
    title: 'Microsoft Secures Multi-Billion Dollar Government Cloud Contract',
    url: 'https://example.com/msft-contract-win',
    source: 'Reuters',
    content: "Microsoft has signed a massive contract with the Department of Defense to modernize its cloud infrastructure over the next five years. This is a significant win over Amazon and reinforces Microsoft's dominance in the public sector cloud space. This is a clear positive for long-term growth."
  },
];

/**
 * Utility for performing fetch requests with exponential backoff.
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options (method, headers, body, etc.).
 * @param {number} retries - Number of retries remaining.
 */
const exponentialBackoffFetch = async (url, options, retries = 5) => {
    try {
        const response = await fetch(url, options);
        if (response.status === 429 && retries > 0) {
            const delay = Math.pow(2, 5 - retries) * 1000 + Math.random() * 1000;
            console.warn(`Rate limit encountered. Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return exponentialBackoffFetch(url, options, retries - 1);
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        if (retries > 0) {
            const delay = Math.pow(2, 5 - retries) * 1000 + Math.random() * 1000;
            console.error(`Fetch failed. Retrying in ${delay / 1000}s... Error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return exponentialBackoffFetch(url, options, retries - 1);
        }
        throw new Error(`Fetch failed after multiple retries: ${error.message}`);
    }
};

// --- GEMINI API CORE LOGIC ---

/**
 * Calls the Gemini API to summarize an article and extract structured data.
 * @param {string} articleContent - The text of the news article.
 * @returns {Promise<object>} The structured JSON object containing summary, sentiment, and impact.
 */
const summarizeNews = async (articleContent) => {
    const userQuery = `Summarize the following financial news article and extract the required fields as a JSON object: "${articleContent}"`;

    const systemPrompt = `You are a world-class financial analyst. Your task is to process a news article and output a strictly valid JSON object. Do not include any text outside the JSON block.

    The JSON object must strictly adhere to this schema:
    {
      "summary": "A concise, 1-2 sentence summary of the article's core financial news.",
      "sentiment": "POSITIVE, NEGATIVE, or NEUTRAL",
      "impact": "Low, Medium, or High"
    }
    `;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    summary: { type: "STRING", description: "A concise, 1-2 sentence summary of the article's core financial news." },
                    sentiment: { type: "STRING", enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"], description: "The immediate financial sentiment." },
                    impact: { type: "STRING", enum: ["Low", "Medium", "High"], description: "The anticipated market impact." }
                }
            }
        }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

    try {
        const result = await exponentialBackoffFetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonString) {
            return JSON.parse(jsonString);
        }
        throw new Error("Gemini API returned no valid JSON content.");

    } catch (error) {
        console.error("Error during Gemini API call or JSON parsing:", error);
        return {
            summary: "Failed to generate AI summary.",
            sentiment: "NEUTRAL",
            impact: "Low"
        };
    }
};

// --- REACT COMPONENT ---

const FingenApp = () => {
    // Firebase State
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // App State
    const [currentTicker, setCurrentTicker] = useState('');
    const [portfolioTickers, setPortfolioTickers] = useState([]); // Array of strings (tickers)
    const [newsDigest, setNewsDigest] = useState([]); // Array of processed news objects
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeSentimentFilter, setActiveSentimentFilter] = useState('ALL'); // NEW: Added filter state

    // --- FIREBASE INITIALIZATION & AUTH ---
    useEffect(() => {
        if (!firebaseConfig) {
            setError("Firebase configuration is missing. Cannot initialize database.");
            return;
        }

        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authInstance = getAuth(app);

            setDb(firestore);
            setAuth(authInstance);

            // 1. Authenticate user
            const authenticate = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(authInstance, initialAuthToken);
                    } else {
                        await signInAnonymously(authInstance);
                    }
                } catch (e) {
                    console.error("Authentication failed:", e);
                }
            };
            authenticate();

            // 2. Auth state change listener
            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setUserId(user.uid);
                    console.log("User authenticated:", user.uid);
                } else {
                    // Fallback for anonymous or unauthenticated users
                    setUserId(crypto.randomUUID());
                    console.log("Signed in anonymously or using fallback ID.");
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase initialization failed:", e);
            setError("Failed to initialize the application. Check console for details.");
        }
    }, []);

    // --- FIRESTORE DATA LISTENERS ---

    // Listener for Portfolio and News Digest
    useEffect(() => {
        if (!db || !userId) return;

        // Base path for user data
        const userPath = `/artifacts/${appId}/users/${userId}`;

        // 1. Portfolio Listener
        const portfolioCollectionRef = collection(db, `${userPath}/portfolios`);
        const qPortfolio = query(portfolioCollectionRef);

        const unsubscribePortfolio = onSnapshot(qPortfolio, (snapshot) => {
            const tickers = snapshot.docs.map(doc => doc.data().ticker);
            setPortfolioTickers(tickers);
            console.log("Portfolio updated:", tickers);
        }, (err) => {
            console.error("Error listening to portfolio:", err);
            setError("Could not load portfolio data.");
        });


        // 2. News Digest Listener
        const digestCollectionRef = collection(db, `${userPath}/news_digests`);
        // We will query to get the latest digests, sorted by creation timestamp (if implemented)
        const qDigest = query(digestCollectionRef);

        const unsubscribeDigest = onSnapshot(qDigest, (snapshot) => {
            const digests = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort client-side by symbol for consistent grouping
            digests.sort((a, b) => a.symbol.localeCompare(b.symbol));
            setNewsDigest(digests);
            console.log("News Digest updated:", digests.length, "items");
        }, (err) => {
            console.error("Error listening to news digest:", err);
            setError("Could not load news digest data.");
        });


        return () => {
            unsubscribePortfolio();
            unsubscribeDigest();
        };

    }, [db, userId]);


    // --- PORTFOLIO MANAGEMENT HANDLERS ---

    const handleAddTicker = async () => {
        if (!db || !userId || !currentTicker.trim()) return;

        const ticker = currentTicker.trim().toUpperCase();
        if (portfolioTickers.includes(ticker)) {
            setError(`Ticker ${ticker} is already in your portfolio.`);
            return;
        }

        try {
            setLoading(true);
            const portfolioRef = doc(db, `/artifacts/${appId}/users/${userId}/portfolios`, ticker);
            await setDoc(portfolioRef, { ticker, addedAt: new Date().toISOString() });
            setCurrentTicker('');
            setError(null);
        } catch (e) {
            console.error("Error adding ticker:", e);
            setError("Failed to add ticker to portfolio.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTicker = async (ticker) => {
        if (!db || !userId) return;

        try {
            setLoading(true);
            // 1. Delete the ticker from the portfolio collection
            const portfolioRef = doc(db, `/artifacts/${appId}/users/${userId}/portfolios`, ticker);
            await deleteDoc(portfolioRef);

            // 2. (Optional but good practice) Clear any existing digests for this ticker
            const digestQuery = query(
                collection(db, `/artifacts/${appId}/users/${userId}/news_digests`),
                where('symbol', '==', ticker)
            );
            const snapshot = await getDocs(digestQuery);
            snapshot.docs.forEach(async (d) => {
                await deleteDoc(doc(db, `/artifacts/${appId}/users/${userId}/news_digests`, d.id));
            });

            setError(null);
        } catch (e) {
            console.error("Error deleting ticker:", e);
            setError("Failed to delete ticker.");
        } finally {
            setLoading(false);
        }
    };

    // --- MAIN DATA PROCESSING HANDLER ---

    const fetchAndSummarizeNews = async () => {
        if (!db || !userId || portfolioTickers.length === 0) {
            setError("Portfolio is empty. Add a ticker first.");
            return;
        }
        if (loading) return;

        setLoading(true);
        setError(null);

        // 1. Filter Mock News to only include articles for tracked tickers
        const articlesToProcess = MOCK_NEWS_ARTICLES.filter(article =>
            portfolioTickers.includes(article.symbol)
        );

        if (articlesToProcess.length === 0) {
            setError("No mock news found for your current portfolio. Try adding GOOG, AAPL, or MSFT.");
            setLoading(false);
            return;
        }

        // 2. Clear previous digest entries (to simulate a fresh run)
        try {
             const digestCollectionRef = collection(db, `/artifacts/${appId}/users/${userId}/news_digests`);
             const snapshot = await getDocs(digestCollectionRef);
             const deletePromises = snapshot.docs.map(d => deleteDoc(doc(digestCollectionRef, d.id)));
             await Promise.all(deletePromises);
        } catch(e) {
            console.error("Could not clear old digests:", e);
            // Non-critical error, continue processing
        }


        // 3. Process articles one by one using the Gemini API
        for (const article of articlesToProcess) {
            try {
                // Call the AI summarization
                const aiResult = await summarizeNews(article.content);

                // Combine original article data with AI-generated data
                const processedDigest = {
                    symbol: article.symbol,
                    title: article.title,
                    url: article.url,
                    source: article.source,
                    createdAt: new Date().toISOString(),
                    summary: aiResult.summary,
                    sentiment: aiResult.sentiment,
                    impact: aiResult.impact,
                };

                // Store the result in Firestore
                const newDigestRef = doc(collection(db, `/artifacts/${appId}/users/${userId}/news_digests`));
                await setDoc(newDigestRef, processedDigest);

            } catch (e) {
                console.error(`Failed to process article for ${article.symbol}:`, e);
                // Continue to next article if one fails
            }
        }

        setLoading(false);
    };

    // --- UI RENDERING HELPERS ---

    const getSentimentStyles = (sentiment) => {
        switch (sentiment) {
            case 'POSITIVE':
                return 'bg-emerald-100 text-emerald-800 border-emerald-400';
            case 'NEGATIVE':
                return 'bg-rose-100 text-rose-800 border-rose-400';
            case 'NEUTRAL':
            default:
                return 'bg-gray-100 text-gray-800 border-gray-400';
        }
    };

    const SentimentTag = ({ sentiment, impact }) => (
        <div className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full border ${getSentimentStyles(sentiment)}`}>
            <Zap className="w-3 h-3 mr-1" />
            {sentiment} / {impact} Impact
        </div>
    );

    const NewsCard = ({ news }) => (
        <div className="bg-white p-5 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-bold text-gray-900">{news.symbol}</h3>
                <SentimentTag sentiment={news.sentiment} impact={news.impact} />
            </div>
            <a href={news.url} target="_blank" rel="noopener noreferrer" className="block">
                <p className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 transition duration-150 mb-2">
                    {news.title}
                </p>
            </a>
            <p className="text-sm text-gray-500 mb-4 italic">Source: {news.source}</p>

            <div className="border-l-4 border-indigo-400 pl-4 py-1 bg-indigo-50 rounded-sm">
                <p className="text-gray-700 font-medium">
                    <span className="font-bold text-indigo-700">AI Summary:</span> {news.summary}
                </p>
            </div>
        </div>
    );

    // NEW: Function to compute sentiment counts for the filter bar
    const getSentimentCounts = () => {
        return newsDigest.reduce((acc, news) => {
            acc[news.sentiment] = (acc[news.sentiment] || 0) + 1;
            return acc;
        }, { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, ALL: newsDigest.length });
    };

    // NEW: Filtered digest based on the active filter state
    const filteredNewsDigest = newsDigest.filter(news => {
        if (activeSentimentFilter === 'ALL') return true;
        return news.sentiment === activeSentimentFilter;
    });

    // NEW: Component for the Sentiment Filter Bar
    const SentimentFilterBar = ({ activeFilter, setActiveFilter, counts }) => {
        const filters = [
            { key: 'ALL', label: 'All', icon: Search, color: 'gray', count: counts.ALL, inactiveClass: 'text-gray-700 border-gray-200 hover:bg-gray-100' },
            { key: 'POSITIVE', label: 'Positive', icon: Zap, color: 'emerald', count: counts.POSITIVE, inactiveClass: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50' },
            { key: 'NEUTRAL', label: 'Neutral', icon: Zap, color: 'gray', count: counts.NEUTRAL, inactiveClass: 'text-gray-700 border-gray-200 hover:bg-gray-100' },
            { key: 'NEGATIVE', label: 'Negative', icon: Zap, color: 'rose', count: counts.NEGATIVE, inactiveClass: 'text-rose-700 border-rose-200 hover:bg-rose-50' },
        ];

        return (
            <div className="flex flex-wrap gap-2 mb-4 p-2 bg-gray-50 rounded-xl border border-gray-200">
                {filters.map(filter => {
                    const isActive = activeFilter === filter.key;
                    const baseClass = `flex items-center text-sm font-medium px-4 py-2 rounded-lg transition duration-150 transform active:scale-95 shadow-sm`;
                    const activeClass = `bg-${filter.color}-600 text-white shadow-lg`;
                    const inactiveClass = `bg-white border ${filter.inactiveClass}`;

                    return (
                        <button
                            key={filter.key}
                            onClick={() => setActiveFilter(filter.key)}
                            className={`${baseClass} ${isActive ? activeClass : inactiveClass}`}
                            disabled={filter.count === 0 && !isActive}
                        >
                            <filter.icon className="w-4 h-4 mr-2" />
                            {filter.label} ({filter.count})
                        </button>
                    );
                })}
            </div>
        );
    };

    // NEW: Component for Mock Portfolio Performance Widget
    const PerformanceWidget = () => {
        // Mock data for visualization—this is where you would integrate real API data later
        const mockReturn = '+12.5%';
        const mockValue = '$15,840';
        const isPositive = mockReturn.startsWith('+');

        return (
            <div className="p-6 bg-white rounded-xl shadow-md border-t-4 border-emerald-400">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Portfolio Performance</h3>
                <div className="flex justify-between items-center mb-3 border-b pb-2">
                    <p className="text-sm text-gray-500">Total Value</p>
                    <p className="text-sm text-gray-500">1-Day Return</p>
                </div>
                <div className="flex justify-between items-end mb-4">
                    <span className="text-3xl font-extrabold text-gray-900">{mockValue}</span>
                    <span className={`text-2xl font-extrabold flex items-center ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? <ChevronUp className="w-6 h-6 mr-1" /> : <ChevronDown className="w-6 h-6 mr-1" />}
                        {mockReturn}
                    </span>
                </div>
                {/* Simple mock line chart representation (Data Visualization skill showcase) */}
                <div className="h-24 bg-gray-50 p-2 rounded-lg border border-gray-200">
                    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-full h-full">
                        <polyline
                            fill="none"
                            stroke={isPositive ? "rgb(52, 211, 153)" : "rgb(251, 113, 133)"}
                            strokeWidth="1.5"
                            points="0,20 10,10 20,15 30,5 40,12 50,8 60,18 70,10 80,14 90,6 100,8"
                        />
                    </svg>
                </div>
                <p className="text-xs text-gray-400 mt-3 text-right">Visualization Mockup</p>
            </div>
        );
    };


    // --- MAIN RENDER ---
    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mr-3" />
                <p className="text-lg font-medium text-gray-700">Initializing FinGen...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans p-4 sm:p-8">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
                body { font-family: 'Inter', sans-serif; }
            `}</style>
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 p-6 bg-white rounded-xl shadow-md border-b-4 border-indigo-600">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2 flex items-center">
                        <Zap className="w-8 h-8 text-indigo-600 mr-3" />
                        FinGen <span className="text-indigo-600 ml-2">Digest</span>
                    </h1>
                    <p className="text-gray-500">
                        AI-Powered Portfolio News Summarizer. User ID:
                        <span className="font-mono text-xs ml-2 p-1 bg-gray-100 rounded text-gray-600">{userId}</span>
                    </p>
                </header>

                {error && (
                    <div className="p-4 mb-6 text-sm font-medium text-red-800 bg-red-100 rounded-lg border border-red-400" role="alert">
                        {error}
                    </div>
                )}

                {/* Portfolio Management Panel & Performance Widget (Now a responsive grid) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* Portfolio Management */}
                    <div className="lg:col-span-2 p-6 bg-white rounded-xl shadow-md">
                        <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
                            <User className="w-5 h-5 text-indigo-500 mr-2" />
                            My Portfolio
                        </h2>

                        <div className="flex flex-col sm:flex-row gap-3 mb-4">
                            <input
                                type="text"
                                placeholder="Add Ticker (e.g., GOOG, AAPL)"
                                value={currentTicker}
                                onChange={(e) => setCurrentTicker(e.target.value.toUpperCase())}
                                className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 shadow-sm"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddTicker();
                                }}
                                disabled={loading}
                            />
                            <button
                                onClick={handleAddTicker}
                                disabled={loading || !currentTicker.trim()}
                                className="flex-shrink-0 flex items-center justify-center px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 transition duration-150 disabled:bg-indigo-300 transform active:scale-95"
                            >
                                <Plus className="w-5 h-5 mr-2" />
                                Add Ticker
                            </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 min-h-[40px] items-start">
                            {portfolioTickers.length === 0 ? (
                                <p className="text-gray-500 italic">No tickers added yet. Try GOOG, AAPL, or MSFT.</p>
                            ) : (
                                portfolioTickers.map(ticker => (
                                    <div key={ticker} className="flex items-center bg-indigo-50 text-indigo-700 text-sm font-medium pr-1 pl-3 py-1 rounded-full border border-indigo-200">
                                        {ticker}
                                        <button
                                            onClick={() => handleDeleteTicker(ticker)}
                                            className="ml-2 p-1 rounded-full hover:bg-indigo-200 transition duration-150"
                                            disabled={loading}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Performance Widget */}
                    <PerformanceWidget />
                </div>


                {/* Action and Loading */}
                <div className="mb-8 flex flex-col items-center">
                    <button
                        onClick={fetchAndSummarizeNews}
                        disabled={loading || portfolioTickers.length === 0}
                        className="flex items-center justify-center w-full sm:w-auto px-8 py-3 bg-green-500 text-white font-bold rounded-lg shadow-xl hover:bg-green-600 transition duration-200 disabled:bg-gray-400 transform hover:scale-[1.01] active:scale-95"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-3" />
                                Generating Digest...
                            </>
                        ) : (
                            <>
                                <Search className="w-5 h-5 mr-3" />
                                Generate News Digest
                            </>
                        )}
                    </button>
                    <p className="text-sm text-gray-500 mt-2">
                        (Simulates the scheduled data processing layer)
                    </p>
                </div>


                {/* News Digest Display */}
                <div className="p-6 bg-white rounded-xl shadow-md">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
                        <ChevronRight className="w-5 h-5 text-indigo-500" />
                        Latest AI Digest
                    </h2>
                    
                    {/* Sentiment Filter Bar */}
                    <SentimentFilterBar
                        activeFilter={activeSentimentFilter}
                        setActiveFilter={setActiveSentimentFilter}
                        counts={getSentimentCounts()}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        {filteredNewsDigest.length === 0 ? (
                            <p className="text-gray-500 italic md:col-span-2">
                                {newsDigest.length > 0 && activeSentimentFilter !== 'ALL' ? 
                                    `No ${activeSentimentFilter.toLowerCase()} news found in the current digest.` : 
                                    'Run the digest generation process above to see the personalized financial summary.'
                                }
                            </p>
                        ) : (
                            filteredNewsDigest.map(news => (
                                <NewsCard key={news.id} news={news} />
                            ))
                        )}
                    </div>
                </div>

                <footer className="mt-10 text-center text-sm text-gray-400">
                    FinGen: A Full-Stack AI project leveraging React, Firestore, and the Gemini API.
                </footer>
            </div>
        </div>
    );
};

export default FingenApp;
