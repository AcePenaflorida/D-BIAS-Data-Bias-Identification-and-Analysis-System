import { useState } from 'react';
import Logo from '../assets/d-bias-logo.svg';
import { User, LogIn, LogOut, History } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import type { AnalysisResult } from '../App';

interface HeaderProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
  userHistory?: AnalysisResult[];
  onViewHistory?: (result: AnalysisResult) => void;
  showHistory?: boolean;
}

export function Header({
  isAuthenticated,
  onLogin,
  onLogout,
  userHistory = [],
  onViewHistory,
  showHistory = true,
}: HeaderProps) {
  // If the user is authenticated, hide the global header per request.
  if (isAuthenticated) return null;
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin();
    setShowLoginDialog(false);
  };

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={Logo} alt="D-BIAS" className="w-8 h-8 object-contain" />
              <span className="text-slate-900 font-semibold">D-BIAS</span>
            </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-full w-10 h-10 p-0">
                    <User className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-2">
                    <p className="text-sm text-slate-900">User Account</p>
                    <p className="text-xs text-slate-500">user@example.com</p>
                  </div>
                  {showHistory && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowHistoryDialog(true)}>
                        <History className="w-4 h-4 mr-2" />
                        Analysis History
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowLoginDialog(true)}>
                <LogIn className="w-4 h-4 mr-2" />
                Login
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Login Dialog */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login to D-BIAS</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="user@example.com" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" required />
            </div>
            <div className="flex gap-3">
              <Button type="submit" className="flex-1">
                Login
              </Button>
              <Button type="button" variant="outline" className="flex-1">
                Sign Up
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Analysis History</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {userHistory.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No analysis history yet</p>
            ) : (
              userHistory.map((result) => (
                <div
                  key={result.id}
                  className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => {
                    onViewHistory?.(result);
                    setShowHistoryDialog(false);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-slate-900">{result.datasetName}</h4>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        result.status === 'complete'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {result.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-2">
                    {new Date(result.uploadDate).toLocaleDateString()} at{' '}
                    {new Date(result.uploadDate).toLocaleTimeString()}
                  </p>
                  <div className="flex gap-4 text-sm">
                    <span className="text-slate-600">
                      Fairness: <span className="text-slate-900">{result.fairnessScore}/100</span>
                    </span>
                    <span className="text-slate-600">
                      Risk: <span className="text-slate-900">{result.biasRisk}</span>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
