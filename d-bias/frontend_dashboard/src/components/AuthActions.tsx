import { useState } from 'react';
import { LogIn, User, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import type { AnalysisResult } from '../App';
import { signIn, signUp as supaSignUp } from '../services/auth';

interface AuthActionsProps {
  onLogin: () => void;
  onSignUp?: (data?: { name?: string; email?: string; password?: string }) => void;
  userHistory?: AnalysisResult[];
  onViewHistory?: (r: AnalysisResult) => void;
  showHistory?: boolean;
}

export function AuthActions({ onLogin, onSignUp, userHistory = [], onViewHistory, showHistory = true }: AuthActionsProps) {
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showSignUpDialog, setShowSignUpDialog] = useState(false);
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignPassword, setShowSignPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (busy) return;
    setBusy(true);
    try {
      const form = e.target as HTMLFormElement;
      const formData = new FormData(form);
      const email = String(formData.get('email') || '');
      const password = String(formData.get('password') || '');
      await signIn(email, password);
      try { if (remember) localStorage.setItem('d-bias-remember', '1'); else localStorage.removeItem('d-bias-remember'); } catch {}
      onLogin();
      setShowLoginDialog(false);
    } catch (err: any) {
      setLoginError(err?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get('name') || ''),
      email: String(formData.get('email') || ''),
      password: String(formData.get('password') || ''),
    };

    const pwd = payload.password;
    const confirm = String(formData.get('confirm') || '');
    if (!pwd || pwd.length < 6) {
      setSignUpError('Password must be at least 6 characters');
      return;
    }
    if (pwd !== confirm) {
      setSignUpError('Passwords do not match');
      return;
    }
    setSignUpError(null);
    setBusy(true);
    try {
      await supaSignUp(payload);
      onSignUp?.(payload);
      setShowSignUpDialog(false);
      setShowLoginDialog(true);
    } catch (err: any) {
      setSignUpError(err?.message || 'Sign up failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => { setShowSignUpDialog(false); setShowLoginDialog(true); }}>
          <LogIn className="w-4 h-4 mr-2" />
          Login
        </Button>

        <Button variant="default" size="sm" onClick={() => { setShowLoginDialog(false); setShowSignUpDialog(true); }}>
          Sign Up
        </Button>
      </div>

      <Dialog open={showLoginDialog} onOpenChange={(open) => { if (open) setShowSignUpDialog(false); setShowLoginDialog(open); }}>
        <DialogContent>
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Welcome back</h2>
                <p className="text-sm text-slate-500 mt-1">Sign in to continue to D-BIAS</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 mt-6">
              <div className="relative">
                <Label htmlFor="login-email">Email</Label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-slate-400"><User className="w-4 h-4" /></span>
                  <Input id="login-email" name="email" type="email" placeholder="username@gmail.com" required className="flex-1" />
                </div>
              </div>

              <div className="relative">
                <Label htmlFor="login-password">Password</Label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-slate-400"><Lock className="w-4 h-4" /></span>
                  <Input id="login-password" name="password" type={showPassword ? 'text' : 'password'} placeholder="********" required className="flex-1" />
                  <button type="button" className="text-slate-400" onClick={() => setShowPassword(s => !s)} aria-label="Toggle password visibility">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                  <span className="text-sm">Remember me</span>
                </label>
                <button type="button" className="text-sm text-slate-500 hover:underline">Forgot password?</button>
              </div>

              <div>
                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </Button>
              </div>

              {loginError && <div className="text-sm text-red-600 text-center">{loginError}</div>}

              <div className="text-center text-sm text-slate-600">
                New here? <button type="button" className="text-primary font-medium ml-1" onClick={() => { setShowLoginDialog(false); setShowSignUpDialog(true); }}>Create account</button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSignUpDialog} onOpenChange={(open) => { if (open) setShowLoginDialog(false); setShowSignUpDialog(open); }}>
        <DialogContent>
          <div>
            <div>
              <h2 className="text-2xl font-semibold">Create your account</h2>
              <p className="text-sm text-slate-500 mt-1">Start saving analyses and access your history.</p>
            </div>

            <form onSubmit={handleSignUp} className="space-y-4 mt-4">
              <div>
                <Label htmlFor="signup-name">Full name</Label>
                <Input id="signup-name" name="name" type="text" placeholder="Your full name" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" name="email" type="email" placeholder="you@example.com" required className="mt-1" />
              </div>

              <div className="relative">
                <Label htmlFor="signup-password">Password</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input id="signup-password" name="password" type={showSignPassword ? 'text' : 'password'} placeholder="Create a password" required className="flex-1" />
                  <button type="button" className="text-slate-400" onClick={() => setShowSignPassword(s => !s)} aria-label="Toggle password visibility">
                    {showSignPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="relative">
                <Label htmlFor="signup-confirm">Confirm Password</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input id="signup-confirm" name="confirm" type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="flex-1" />
                  <button type="button" className="text-slate-400" onClick={() => setShowConfirmPassword(s => !s)} aria-label="Toggle confirm password visibility">
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {signUpError && <div className="text-sm text-red-600">{signUpError}</div>}

              <div className="flex items-center justify-end gap-3 mt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowSignUpDialog(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!!signUpError || busy}>{busy ? 'Creating…' : 'Create account'}</Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AuthActions;
