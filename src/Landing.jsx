import { useEffect, useRef, useState } from 'react';
import './landing.css';

function Icon({ type = 'check' }) {
  const paths = { check: 'm5 12 4 4L19 6', upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', file: 'M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h5', arrow: 'M4 12h16m-6-6 6 6-6 6', shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type]} /></svg>;
}

export default function Landing({ onLogin }) {
  const root = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    root.current.classList.add('lp-reveal-enabled');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: .08 });
    root.current.querySelectorAll('[data-reveal]').forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, []);
  return <div className="landing" ref={root}>
    <a className="lp-skip" href="#landing-main">Skip to content</a>
    <nav className="lp-nav" aria-label="Main navigation">
      <a href="#/" className="lp-brand"><span>g.</span>GST Helper</a>
      <div className={`lp-nav-links ${menuOpen ? 'lp-menu-open' : ''}`} id="landing-nav"><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#integrations" onClick={() => setMenuOpen(false)}>Marketplaces</a><a href="#features" onClick={() => setMenuOpen(false)}>Features</a><a href="#questions" onClick={() => setMenuOpen(false)}>FAQs</a></div>
      <button className="lp-menu-toggle" aria-controls="landing-nav" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(value => !value)} onKeyDown={event => { if (event.key === 'Escape') setMenuOpen(false); }}>{menuOpen ? 'Close ×' : 'Menu ☰'}</button>
      <button className="lp-button lp-button-dark" onClick={onLogin}>Sign in <Icon type="arrow" /></button>
    </nav>
    <main id="landing-main" tabIndex={-1}>
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow"><span className="lp-live-dot" /> THE WORKSPACE FOR YOUR NEXT RETURN</div>
          <h1>Your reports.<br />Your return.<br /><span>A little less work.</span></h1>
          <p className="lp-hero-description">GST filing made easy. Bring your Meesho reports together, keep every client’s month organized, and prepare GSTR-1 JSON with a clearer view of your numbers.</p>
          <div className="lp-hero-actions"><button className="lp-button lp-button-dark lp-button-large" onClick={onLogin}>Start with Meesho <Icon type="arrow" /></button><a href="#how-it-works" className="lp-text-link">Explore the workflow <span>↗</span></a></div>
          <div className="lp-hero-notes"><span><Icon /> Phone OTP sign-in</span><span><Icon /> Your workspace, saved</span></div>
        </div>
        <div className="lp-visual" aria-label="Illustrative preview of the GST Helper workflow">
          <div className="lp-orbit lp-orbit-one" /><div className="lp-orbit lp-orbit-two" />
          <div className="lp-floating lp-report"><span className="lp-mini-icon"><Icon type="upload" /></span><div><strong>Reports in.</strong><small>Meesho · 3 files</small></div></div>
          <div className="lp-preview">
            <div className="lp-preview-top"><span className="lp-preview-brand">g.</span><strong>GST Helper <span className="lp-preview-slash">/</span> Workspace</strong><span className="lp-window-dots">•••</span></div>
            <div className="lp-preview-body"><div className="lp-preview-heading"><div><small>YOUR MONTH, AT A GLANCE</small><h3>Everything in its place.</h3></div><span className="lp-preview-period">Sep 2026 ▾</span></div>
              <div className="lp-mini-stats"><div><small>Uploads</small><strong>3<span>/3</span></strong></div><div><small>Marketplace</small><strong className="lp-stat-name">Meesho</strong></div><div><small>JSON</small><strong className="lp-stat-name">Ready <span>✓</span></strong></div></div>
              <div className="lp-checklist">{['Sales report', 'Sales return report', 'Tax invoice details'].map((label, i) => <div key={label}><span className="lp-file-icon"><Icon type="file" /></span><span>{label}<small>Excel file · uploaded</small></span><span className="lp-check-mark" style={{ animationDelay: `${i * .3}s` }}>✓</span></div>)}</div>
              <div className="lp-preview-footer"><span><span className="lp-live-dot" /> Saved to your workspace</span><span>GSTR-1 JSON ↗</span></div>
            </div>
          </div>
          <div className="lp-floating lp-result"><span className="lp-result-check">✓</span><div><strong>JSON out.</strong><small>Ready to review & download</small></div><span className="lp-spark">✦</span></div>
          <p className="lp-preview-caption">Illustrative preview. Your figures come from your uploaded reports.</p>
        </div>
      </section>
      <section className="lp-integrations" id="integrations" data-reveal>
        <div><span className="lp-section-kicker">STARTING WITH MEESHO</span><h2>One workflow. <br />More marketplaces ahead.</h2></div>
        <div className="lp-marketplaces">
          <div className="lp-marketplace lp-marketplace-live"><div className="lp-marketplace-logo"><img src="/logos/meesho.png" alt="" width="52" height="52" loading="lazy" /></div><strong className="lp-meesho">Meesho</strong><span><i /> Available now</span></div>
          <div className="lp-marketplace"><div className="lp-marketplace-logo lp-marketplace-logo-amazon"><img src="/logos/amazon.svg" alt="" width="76" height="32" loading="lazy" /></div><strong>Amazon</strong><span>Coming soon</span></div>
          <div className="lp-marketplace"><div className="lp-marketplace-logo"><img src="/logos/flipkart.png" alt="" width="52" height="52" loading="lazy" /></div><strong>Flipkart</strong><span>Coming soon</span></div>
          <div className="lp-marketplace"><div className="lp-marketplace-logo lp-marketplace-logo-more"><Icon type="grid" /></div><strong>More platforms</strong><span>Coming soon</span></div>
        </div>
      </section>
      <section className="lp-section" id="how-it-works">
        <div className="lp-section-heading" data-reveal><span className="lp-section-kicker">FROM FILES TO FILING PREP</span><h2>Three steps. A clearer month.</h2><p>Spend less time piecing reports together and more time moving work forward.</p></div>
        <div className="lp-steps">{[
          ['01', 'upload', 'Bring your reports.', 'Choose your client and month. Upload Meesho sales, returns, and tax invoice details.'],
          ['02', 'grid', 'See the whole picture.', 'Review B2CS, HSN, documents, and e-commerce supply summaries in one workspace.'],
          ['03', 'file', 'Generate. Review. Download.', 'Create your GSTR-1 JSON, check your figures, and download a clearly named file.'],
        ].map(([number, icon, title, copy]) => <article className="lp-step" data-reveal key={number}><div className="lp-step-top"><span className="lp-feature-icon"><Icon type={icon} /></span><span>{number}</span></div><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className="lp-feature-section" id="features" data-reveal>
        <div className="lp-feature-intro"><span className="lp-section-kicker">BUILT FOR YOUR EVERYDAY WORK</span><h2>Keep the work moving.<br /><em>Keep the details together.</em></h2><p>For sellers managing their own reports and teams keeping track of multiple clients.</p><button className="lp-button lp-button-dark" onClick={onLogin}>Open your workspace <Icon type="arrow" /></button></div>
        <div className="lp-feature-grid">{[
          ['grid', 'A dashboard with direction', 'Filter by month and see which clients still have work pending.'],
          ['file', 'A place for every month', 'Save uploads and generated output under the right client and period.'],
          ['shield', 'A private cloud workspace', 'Phone sign-in and account-based access to your clients and reports.'],
          ['arrow', 'Made for your keyboard', 'Arrow-key navigation and shortcuts for a faster daily workflow.'],
        ].map(([icon, title, copy]) => <article key={title}><span className="lp-feature-icon"><Icon type={icon} /></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className="lp-faq" id="questions"><div><span className="lp-section-kicker">A FEW THINGS TO KNOW</span><h2>Clear before <br /><em>you begin.</em></h2></div><div className="lp-faq-list">{[
        ['Which marketplaces are supported?', 'Meesho is available now. Amazon, Flipkart, and other marketplace integrations are coming soon.'],
        ['What do I need to upload?', 'Choose your client and filing month, then upload the Meesho sales, sales return, and tax invoice details Excel reports.'],
        ['Does GST Helper file my return for me?', 'GST Helper prepares GSTR-1 JSON and summaries for review. Check your generated data before uploading it to the GST portal.'],
        ['Can I come back to my work later?', 'Yes. Your client records, monthly uploads, and generated output are saved in your signed-in cloud workspace.'],
      ].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="lp-bottom-cta" data-reveal><span className="lp-cta-spark" aria-hidden="true">✳</span><div><span className="lp-section-kicker">MAKE ROOM FOR A CLEARER MONTH</span><h2>Less spreadsheet juggling.<br /><em>More forward motion.</em></h2><p>Your reports. Your clients. One organized workspace.</p></div><button className="lp-button lp-button-dark lp-button-large" onClick={onLogin}>Open your workspace <Icon type="arrow" /></button></section>
    </main>
    <footer className="lp-footer"><a href="#/" className="lp-brand"><span>g.</span>GST Helper</a><p>Filing preparation, with less friction.</p><small>Meesho available now. Other integrations coming soon.<br />Review generated data before uploading it to the GST portal.</small></footer>
  </div>;
}
