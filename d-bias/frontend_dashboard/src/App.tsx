import { useState } from 'react';
import { UploadPage } from './components/UploadPage';
import { Dashboard } from './components/Dashboard';

export interface AnalysisResult {
  id: string;
  datasetName: string;
  uploadDate: string;
  status: 'complete' | 'failed';
  dataset: {
    rows: number;
    columns: number;
    mean: number;
    median: number;
    mode: number;
    max: number;
    min: number;
    stdDev: number;
    variance: number;
  };
  fairnessScore: number;
  fairnessLabel: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
  biasRisk: 'Low' | 'Moderate' | 'High' | 'Critical';
  reliabilityLevel: 'High' | 'Moderate' | 'Low';
  overallMessage: string;
  detectedBiases: Array<{
    id: string;
    bias_type: string;
    column: string;
    severity: 'Low' | 'Moderate' | 'High' | 'Critical';
    description: string;
    ai_explanation: string;
    definition: string;
  }>;
  assessment: {
    fairness: string;
    recommendations: string[];
    conclusion: string;
  };
  distributions: any[];
}

export default function App() {
  const [currentView, setCurrentView] = useState<'upload' | 'dashboard'>('upload');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userHistory, setUserHistory] = useState<AnalysisResult[]>([]);

  const handleAnalysisComplete = (result: AnalysisResult) => {
    setAnalysisResult(result);
    if (isAuthenticated) {
      setUserHistory(prev => [result, ...prev]);
    }
    setCurrentView('dashboard');
  };

  const handleBackToUpload = () => {
    setCurrentView('upload');
    setAnalysisResult(null);
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  const handleViewHistory = (result: AnalysisResult) => {
    setAnalysisResult(result);
    setCurrentView('dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {currentView === 'upload' ? (
        <UploadPage
          onAnalysisComplete={handleAnalysisComplete}
          isAuthenticated={isAuthenticated}
          onLogin={handleLogin}
          onLogout={handleLogout}
          userHistory={userHistory}
          onViewHistory={handleViewHistory}
        />
      ) : (
        analysisResult && (
          <Dashboard
            result={analysisResult}
            onBackToUpload={handleBackToUpload}
            isAuthenticated={isAuthenticated}
            onLogin={handleLogin}
            onLogout={handleLogout}
            userHistory={userHistory}
            onViewHistory={handleViewHistory}
          />
        )
      )}
    </div>
  );
}