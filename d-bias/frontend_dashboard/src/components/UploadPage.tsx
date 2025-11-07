import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Header } from './Header';
import { HomeHistory } from './HomeHistory';
import { PDFPreviewDialog } from './PDFPreviewDialog';
import { Footer } from './Footer';
import type { AnalysisResult } from '../App';

interface UploadPageProps {
  onAnalysisComplete: (result: AnalysisResult) => void;
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
  userHistory: AnalysisResult[];
  onViewHistory: (result: AnalysisResult) => void;
}

export function UploadPage({
  onAnalysisComplete,
  isAuthenticated,
  onLogin,
  onLogout,
  userHistory,
  onViewHistory,
}: UploadPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const validateFile = (file: File): boolean => {
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    
    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
      setError('Invalid file format. Please upload a CSV or XLSX file.');
      return false;
    }

    return true;
  };

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;

    setError('');
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
      // Simulate file preview
      generatePreview(selectedFile);
    }
  };

  const generatePreview = (file: File) => {
    // Simulate CSV preview with mock data
    const mockPreview = [
      ['ID', 'Age', 'Sex', 'Income', 'Education', 'Outcome'],
      ['1', '34', 'Male', '65000', 'Bachelor', 'Approved'],
      ['2', '45', 'Male', '78000', 'Master', 'Approved'],
      ['3', '29', 'Female', '52000', 'Bachelor', 'Denied'],
      ['4', '38', 'Male', '71000', 'PhD', 'Approved'],
      ['5', '51', 'Male', '95000', 'Master', 'Approved'],
    ];
    setPreview(mockPreview);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please upload a file first.');
      return;
    }

    setIsAnalyzing(true);
    setError('');

    // Simulate analysis delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate mock analysis result
    const result: AnalysisResult = {
      id: `analysis-${Date.now()}`,
      datasetName: file.name,
      uploadDate: new Date().toISOString(),
      status: 'complete',
      dataset: {
        rows: 1250,
        columns: 6,
        mean: 67842.5,
        median: 65000,
        mode: 71000,
        max: 125000,
        min: 28000,
        stdDev: 18543.2,
        variance: 343850624,
      },
      fairnessScore: 42,
      fairnessLabel: 'Poor',
      biasRisk: 'High',
      reliabilityLevel: 'Moderate',
      overallMessage: 'Significant bias patterns detected in the dataset. Immediate attention required for fair model deployment.',
      detectedBiases: [
        {
          id: '1',
          bias_type: 'Categorical Imbalance',
          column: 'sex',
          severity: 'High',
          description: "'Male' dominates 78.9% of 'sex' values (entropy=0.74).",
          ai_explanation: 'The dataset shows a severe gender imbalance, with male entries representing nearly 4 out of 5 records. This disparity can lead to models that perform poorly for underrepresented groups and perpetuate existing societal biases. The low entropy score (0.74 out of 1.0) indicates poor diversity in this categorical feature.',
          definition: 'Categorical Imbalance occurs when one or more categories in a feature are significantly overrepresented compared to others, leading to skewed model predictions.',
        },
        {
          id: '2',
          bias_type: 'Outcome Disparity',
          column: 'outcome',
          severity: 'Critical',
          description: 'Approval rate varies dramatically: Male (72.3%) vs Female (31.8%).',
          ai_explanation: 'There is a critical disparity in outcomes between gender groups. Males are approved at more than twice the rate of females, suggesting potential discriminatory patterns in the underlying decision-making process. This could violate fairness regulations and ethical AI standards.',
          definition: 'Outcome Disparity measures differences in decision outcomes across protected groups, indicating potential discrimination or unfair treatment.',
        },
        {
          id: '3',
          bias_type: 'Correlation Bias',
          column: 'education, income',
          severity: 'Moderate',
          description: 'Strong correlation (0.89) between education and income may amplify socioeconomic bias.',
          ai_explanation: 'The high correlation between education and income levels can create compound biases in predictive models. This relationship may disadvantage individuals from lower socioeconomic backgrounds who face systemic barriers to higher education, creating a feedback loop of inequality.',
          definition: 'Correlation Bias occurs when highly correlated features create redundant bias signals, amplifying discrimination effects in model predictions.',
        },
        {
          id: '4',
          bias_type: 'Sample Size Insufficiency',
          column: 'education (PhD)',
          severity: 'Moderate',
          description: 'PhD category has only 42 samples (3.4%), insufficient for reliable analysis.',
          ai_explanation: 'The extremely small sample size for PhD holders makes statistical analysis unreliable for this group. Models trained on this data may produce unstable predictions for higher education levels, leading to unpredictable outcomes for this demographic.',
          definition: 'Sample Size Insufficiency occurs when certain categories have too few examples to draw statistically valid conclusions or train reliable models.',
        },
      ],
      assessment: {
        fairness: 'This dataset exhibits poor fairness characteristics with a score of 42/100. Multiple critical bias patterns have been identified that could lead to discriminatory outcomes if used for model training without remediation.',
        recommendations: [
          'Implement stratified sampling to balance gender representation in the dataset',
          'Apply reweighting techniques to equalize outcome distributions across protected groups',
          'Consider collecting additional data for underrepresented categories (PhD education level)',
          'Perform feature decorrelation analysis between education and income variables',
          'Establish fairness constraints in model training (e.g., demographic parity or equalized odds)',
          'Conduct regular fairness audits using metrics like disparate impact ratio and equal opportunity difference',
        ],
        conclusion: 'The dataset requires significant preprocessing and bias mitigation strategies before it can be responsibly used for machine learning applications. Without intervention, models trained on this data would likely perpetuate and amplify existing inequalities.',
      },
      distributions: [
        { value: 28000, frequency: 12 },
        { value: 35000, frequency: 45 },
        { value: 42000, frequency: 98 },
        { value: 49000, frequency: 156 },
        { value: 56000, frequency: 189 },
        { value: 63000, frequency: 234 },
        { value: 70000, frequency: 198 },
        { value: 77000, frequency: 167 },
        { value: 84000, frequency: 98 },
        { value: 91000, frequency: 34 },
        { value: 98000, frequency: 15 },
        { value: 105000, frequency: 4 },
      ],
    };

    setIsAnalyzing(false);
    onAnalysisComplete(result);
  };

  const [showHistoryPreview, setShowHistoryPreview] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<AnalysisResult | null>(null);


  return (
    <div className="min-h-screen flex flex-col">
      <Header
        isAuthenticated={isAuthenticated}
        onLogin={onLogin}
        onLogout={onLogout}
        userHistory={userHistory}
        onViewHistory={onViewHistory}
      />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="flex gap-8">
          {/* Left: Recent history sidebar (visible on large screens) */}
          {isAuthenticated && (
            <aside className="w-72 hidden lg:block">
              {/* Constrain the sticky history column to the viewport so its internal list can scroll */}
              <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto">
                <HomeHistory
                  history={userHistory}
                  onPreview={(r) => {
                    setSelectedHistory(r);
                    setShowHistoryPreview(true);
                  }}
                  onOpen={(r) => onViewHistory(r)}
                />
              </div>
            </aside>
          )}

          {/* Main content (uploader + preview) centered */}
          <div className="flex-1 max-w-4xl mx-auto">
            {/* Welcome Message */}
            <div className="text-center mb-12">
              <h1 className="text-slate-900 mb-3">D-BIAS</h1>
              <p className="text-slate-600 text-lg">Your data bias detection companion</p>
            </div>

            {/* Upload Area */}
            <Card className="p-8 mb-6">
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-slate-700 mb-2">Drag and drop your dataset here, or</p>
                    <label htmlFor="file-upload">
                      <Button variant="outline" asChild>
                        <span className="cursor-pointer">
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                          Choose File
                        </span>
                      </Button>
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </div>
                  <p className="text-slate-500 text-sm">Supported formats: CSV, XLSX (first sheet only)</p>
                </div>
              </div>

              {file && (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700">
                    <span className="text-slate-500">Selected file:</span> {file.name}
                  </p>
                </div>
              )}
            </Card>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Dataset Preview */}
            {preview.length > 0 && (
              <Card className="p-6 mb-6">
                <h3 className="text-slate-900 mb-4">Dataset Preview</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {preview[0].map((header, idx) => (
                          <th key={idx} className="text-left p-2 text-slate-700">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(1).map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-slate-100">
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} className="p-2 text-slate-600">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Analyze Button */}
            <div className="text-center">
              <Button onClick={handleAnalyze} disabled={!file || isAnalyzing} size="lg" className="px-8">
                {isAnalyzing ? 'Analyzing Dataset...' : 'Analyze / Detect Bias'}
              </Button>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* History preview dialog for home */}
      {selectedHistory && (
        <PDFPreviewDialog isOpen={showHistoryPreview} onClose={() => setShowHistoryPreview(false)} result={selectedHistory} />
      )}
    </div>
  );
}
