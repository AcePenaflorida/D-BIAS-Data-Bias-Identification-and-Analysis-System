import { Info, Users } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-sm text-slate-600">
          <button className="flex items-center gap-2 hover:text-slate-900 transition-colors">
            <Info className="w-4 h-4" />
            About <span className="font-semibold">D-BIAS</span>
          </button>
          <button className="flex items-center gap-2 hover:text-slate-900 transition-colors">
            <Users className="w-4 h-4" />
            Developers
          </button>
        </div>
        <p className="text-center text-xs text-slate-500 mt-4">
          © 2025 <span className="font-semibold">D-BIAS</span>. Empowering fair and ethical AI.
        </p>
      </div>
    </footer>
  );
}
