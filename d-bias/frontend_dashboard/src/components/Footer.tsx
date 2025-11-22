export function Footer() {
  return (
    <footer className="bg-card/50 border-t border-border mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h4 className="font-semibold text-foreground mb-4">About D-BIAS</h4>
            <p className="text-sm text-muted-foreground">
              A web-based and AI-powered platform that automatically detects, analyzes, explains, and visualizes biases within datasets before they are used for machine learning applications. The system combines statistical analysis, machine learning techniques, and AI-driven interpretive summaries to evaluate dataset fairness and transparency.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">API Reference</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-4">Developers</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://github.com/AcePenaflorida/D-BIAS-Data-Bias-Identification-and-Analysis-System"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li><a href="#" className="hover:text-foreground transition-colors">Support</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border pt-8 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">© 2025 D-BIAS. All rights reserved.</p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
