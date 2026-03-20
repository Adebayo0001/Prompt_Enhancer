import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Search, 
  Code, 
  PenTool, 
  Image as ImageIcon, 
  BarChart, 
  Lightbulb, 
  AlertCircle, 
  ArrowRight, 
  CheckCircle2, 
  BrainCircuit,
  Star,
  Loader2,
  Copy,
  Check,
  LogIn,
  LogOut,
  History,
  X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { analyzePrompt, PromptAnalysis } from './services/geminiService';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, onSnapshot, getDocFromServer, doc } from 'firebase/firestore';

const USE_CASES = [
  { id: 'general', label: 'General', icon: Sparkles },
  { id: 'coding', label: 'Coding', icon: Code },
  { id: 'writing', label: 'Writing', icon: PenTool },
  { id: 'research', label: 'Research', icon: Search },
  { id: 'image', label: 'Image Gen', icon: ImageIcon },
  { id: 'data', label: 'Data Analysis', icon: BarChart },
];

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [input, setInput] = useState('');
  const [useCase, setUseCase] = useState('general');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PromptAnalysis | null>(null);
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    const q = query(
      collection(db, 'analyses'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setHistory(historyData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'analyses');
    });
    return () => unsubscribe();
  }, [user]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
        setIsAuthModalOpen(false);
      } else if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        setIsAuthModalOpen(false);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setAuthError('Please enter your email address');
      return;
    }
    setAuthError('');
    setAuthMessage('');
    setAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      setAuthError(err.message || 'Failed to send reset email');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const analysis = await analyzePrompt(input, useCase);
      setResult(analysis);
      
      if (user) {
        try {
          await addDoc(collection(db, 'analyses'), {
            userId: user.uid,
            originalPrompt: input,
            useCase,
            analysis: JSON.stringify(analysis),
            createdAt: new Date().toISOString()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'analyses');
        }
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Auth Modal */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => setIsAuthModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
                <h2 className="text-xl font-display font-bold">
                  {authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Reset Password'}
                </h2>
                <button onClick={() => setIsAuthModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <div className="p-6">
                {authError && (
                  <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{authError}</p>
                  </div>
                )}
                {authMessage && (
                  <div className="mb-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{authMessage}</p>
                  </div>
                )}
                
                <form onSubmit={authMode === 'reset' ? handleResetPassword : handleEmailAuth} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-hidden"
                      required
                    />
                  </div>
                  {authMode !== 'reset' && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
                      <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-hidden"
                        required
                      />
                    </div>
                  )}
                  
                  <button 
                    type="submit" 
                    disabled={authLoading}
                    className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                    {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Sign Up' : 'Send Reset Link'}
                  </button>
                </form>

                <div className="mt-6 pt-6 border-t border-zinc-100 space-y-4 text-center text-sm">
                  {authMode === 'login' ? (
                    <>
                      <button onClick={() => { setAuthMode('reset'); setAuthError(''); setAuthMessage(''); }} className="text-indigo-600 hover:underline">Forgot password?</button>
                      <p className="text-zinc-500">Don't have an account? <button onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthMessage(''); }} className="text-indigo-600 font-medium hover:underline">Sign up</button></p>
                    </>
                  ) : authMode === 'signup' ? (
                    <p className="text-zinc-500">Already have an account? <button onClick={() => { setAuthMode('login'); setAuthError(''); setAuthMessage(''); }} className="text-indigo-600 font-medium hover:underline">Sign in</button></p>
                  ) : (
                    <p className="text-zinc-500">Remember your password? <button onClick={() => { setAuthMode('login'); setAuthError(''); setAuthMessage(''); }} className="text-indigo-600 font-medium hover:underline">Sign in</button></p>
                  )}
                  
                  <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-zinc-200"></div>
                    <span className="shrink-0 px-4 text-zinc-400 text-xs uppercase tracking-wider">Or continue with</span>
                    <div className="flex-grow border-t border-zinc-200"></div>
                  </div>
                  
                  <button 
                    onClick={async () => {
                      setAuthLoading(true);
                      setAuthError('');
                      try {
                        await loginWithGoogle();
                        setIsAuthModalOpen(false);
                      } catch (err: any) {
                        setAuthError(err.message);
                      } finally {
                        setAuthLoading(false);
                      }
                    }}
                    disabled={authLoading}
                    className="w-full flex items-center justify-center gap-3 py-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors font-medium text-zinc-700 disabled:opacity-50"
                  >
                    {authLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                    Continue with Google
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Sidebar */}
      <AnimatePresence>
        {isHistoryOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 w-full max-w-md h-full bg-white shadow-2xl z-50 overflow-y-auto border-l border-zinc-200"
            >
              <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-200 p-6 flex items-center justify-between z-10">
                <h2 className="text-xl font-display font-bold flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  Your History
                </h2>
                <button onClick={() => setIsHistoryOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                {history.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No history yet. Analyze a prompt to get started!</p>
                ) : (
                  history.map((item) => {
                    let parsedAnalysis;
                    try {
                      parsedAnalysis = JSON.parse(item.analysis);
                    } catch (e) {
                      return null;
                    }
                    return (
                      <div key={item.id} className="bg-zinc-50 rounded-2xl p-5 border border-zinc-200 cursor-pointer hover:border-indigo-300 transition-colors" onClick={() => {
                        setInput(item.originalPrompt);
                        setUseCase(item.useCase);
                        setResult(parsedAnalysis);
                        setIsHistoryOpen(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>
                        <div className="text-xs font-medium text-indigo-600 uppercase tracking-wider mb-2">{item.useCase}</div>
                        <p className="text-sm text-zinc-600 line-clamp-2 mb-3">"{item.originalPrompt}"</p>
                        <div className="bg-white rounded-xl p-3 border border-zinc-100">
                          <p className="text-sm font-medium text-zinc-800 line-clamp-2">{parsedAnalysis.rewrittenPrompt}</p>
                        </div>
                        <div className="mt-3 text-xs text-zinc-400">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-zinc-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-200">
              <BrainCircuit className="text-white w-6 h-6" />
            </div>
            <h1 className="text-2xl font-display font-bold tracking-tight">
              Prompt <span className="gradient-text">Enhancer</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-zinc-500">
            {user ? (
              <>
                <button 
                  onClick={() => setIsHistoryOpen(true)}
                  className="flex items-center gap-2 hover:text-indigo-600 transition-colors"
                >
                  <History className="w-4 h-4" />
                  <span className="hidden sm:inline">History</span>
                </button>
                <div className="flex items-center gap-3 pl-4 border-l border-zinc-200">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-zinc-200" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm border border-indigo-200">
                      {user.email?.[0].toUpperCase() || 'U'}
                    </div>
                  )}
                  <button onClick={logout} className="flex items-center gap-2 hover:text-red-600 transition-colors" title="Logout">
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-5xl font-display font-bold mb-4 tracking-tight"
          >
            Instantly Optimize Your <span className="gradient-text">AI Prompts</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-zinc-500 text-lg max-w-2xl mx-auto"
          >
            Paste your prompt and let Prompt Enhancer transform it into a masterpiece while teaching you the secrets of AI communication.
          </motion.p>
        </div>

        {/* Input Area */}
        <section className="glass rounded-3xl p-8 mb-12 shadow-xl shadow-zinc-200/50">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              Select Use Case
            </label>
            <div className="flex flex-wrap gap-2">
              {USE_CASES.map((uc) => (
                <button
                  key={uc.id}
                  onClick={() => setUseCase(uc.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    useCase === uc.id 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <uc.icon className="w-4 h-4" />
                  {uc.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste your prompt here... (e.g., 'Write a story about a cat')"
              className="w-full h-40 bg-zinc-50 border border-zinc-200 rounded-2xl p-6 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-hidden transition-all resize-none"
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !input.trim()}
              className="absolute bottom-4 right-4 bg-zinc-900 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Analyze Prompt
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </section>

        {/* Results Section */}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="space-y-8"
            >
              {/* Top Grid: Rewritten & Ratings */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {/* Rewritten Prompt */}
                  <div className="bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-display font-bold">Optimized Prompt</h3>
                      </div>
                      <button 
                        onClick={() => copyToClipboard(result.rewrittenPrompt)}
                        className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400 hover:text-zinc-600"
                      >
                        {copied ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                    <div className="bg-zinc-50 rounded-2xl p-6 text-zinc-700 font-mono text-sm leading-relaxed border border-zinc-100">
                      <ReactMarkdown>{result.rewrittenPrompt}</ReactMarkdown>
                    </div>
                  </div>

                  {/* What Changed & Why */}
                  <div className="bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="p-2 bg-indigo-50 rounded-lg">
                        <Lightbulb className="w-5 h-5 text-indigo-600" />
                      </div>
                      <h3 className="text-xl font-display font-bold">What Changed & Why</h3>
                    </div>
                    <ul className="space-y-4">
                      {result.whatChangedAndWhy.map((item, i) => (
                        <li key={i} className="flex gap-3 text-zinc-600">
                          <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Sidebar: Ratings & Interpretation */}
                <div className="space-y-8">
                  {/* Ratings */}
                  <div className="bg-zinc-900 text-white rounded-3xl p-8 shadow-xl">
                    <h3 className="text-lg font-display font-bold mb-6 flex items-center gap-2">
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                      Prompt Score
                    </h3>
                    <div className="space-y-6">
                      {Object.entries(result.ratings).map(([key, value]) => (
                        <div key={key}>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="capitalize text-zinc-400">{key}</span>
                            <span className="font-bold">{value}/10</span>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${value * 10}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className={`h-full rounded-full ${
                                value > 7 ? 'bg-emerald-500' : value > 4 ? 'bg-indigo-500' : 'bg-rose-500'
                              }`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Interpretation */}
                  <div className="bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 bg-zinc-100 rounded-lg">
                        <BrainCircuit className="w-5 h-5 text-zinc-600" />
                      </div>
                      <h3 className="text-lg font-display font-bold">The AI's View</h3>
                    </div>
                    <p className="text-sm text-zinc-600 leading-relaxed italic">
                      "{result.aiInterpretation}"
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Grid: Flaws & Lesson */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* What Was Wrong */}
                <div className="bg-rose-50/50 rounded-3xl p-8 border border-rose-100">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-rose-100 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                    </div>
                    <h3 className="text-xl font-display font-bold text-rose-900">Room for Improvement</h3>
                  </div>
                  <ul className="space-y-4">
                    {result.whatWasWrong.map((item, i) => (
                      <li key={i} className="flex gap-3 text-rose-800/80">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Prompting Lesson */}
                <div className="bg-linear-to-br from-indigo-600 to-violet-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
                  <div className="relative z-10">
                    <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                      Micro-Lesson: {result.promptingLesson.technique}
                    </span>
                    <h3 className="text-2xl font-display font-bold mb-4">{result.promptingLesson.title}</h3>
                    <div className="text-indigo-100 text-sm leading-relaxed prose prose-invert">
                      <ReactMarkdown>{result.promptingLesson.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>

              {/* Training & Limitations Insight */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-zinc-100 rounded-3xl p-8 border border-zinc-200"
              >
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <BrainCircuit className="w-5 h-5 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-display font-bold">Training & Limitations Insight</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-bold text-zinc-700 mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
                      How LLMs are Trained
                    </h4>
                    <p className="text-sm text-zinc-600 leading-relaxed">
                      AI models like this one are trained on vast amounts of text to predict the "next token" (word or part of a word). They don't "know" facts like humans do; they recognize patterns and statistical relationships. This is why being specific helps—it narrows down the statistical paths the AI can take.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-zinc-700 mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-rose-500 rounded-full" />
                      What You Can't Get "Freely"
                    </h4>
                    <p className="text-sm text-zinc-600 leading-relaxed">
                      Without specific tools or grounding, AI cannot access real-time events, private data, or perform complex multi-step logic perfectly in one go. You often have to "guide" it through these limitations using techniques like Chain-of-Thought or providing the context yourself.
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!result && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            {[
              { title: 'Role Prompting', desc: 'Assign a specific persona to the AI for better context.' },
              { title: 'Few-Shot', desc: 'Provide examples to guide the AI towards your desired output.' },
              { title: 'Chain of Thought', desc: 'Ask the AI to explain its reasoning step-by-step.' },
            ].map((item, i) => (
              <div key={i} className="p-6 rounded-2xl border border-zinc-200 bg-white/50 text-center">
                <h4 className="font-bold mb-2">{item.title}</h4>
                <p className="text-sm text-zinc-500">{item.desc}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-20 py-8 border-t border-zinc-200 text-center">
        <p className="text-zinc-500 text-sm">
          Built with ❤️ by{' '}
          <a 
            href="https://www.linkedin.com/in/adebayokareem/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
          >
            Adebayo Kareem
          </a>
        </p>
      </footer>
    </div>
  );
}
