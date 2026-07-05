/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Presentation, ArrowLeft, ArrowRight, Download, RefreshCw, X, Shield, Sparkles } from 'lucide-react';

interface BoardroomProps {
  onExit: () => void;
  orgName: string;
}

export default function Boardroom({ onExit, orgName }: BoardroomProps) {
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [report, setReport] = useState<string>('');
  const [loadingReport, setLoadingReport] = useState<boolean>(false);

  const slides = [
    {
      title: 'Strategic Horizon',
      subtitle: 'AUTONOMOUS OPERATIONS OVERVIEW',
      content: 'Atlas OS orchestrates specialized AI Executive loops across Finance, Sales, and Marketing. By storing institutional history directly inside an isolated Central Memory vector model, our workforce learns continuously, driving operational latency to under 3 minutes.',
      metrics: [
        { label: 'Workforce Efficiency', value: '98.4%' },
        { label: 'Avg Process Latency', value: '< 3m' },
        { label: 'CEO Strategic Vetoes', value: '1 / 18' },
      ],
    },
    {
      title: 'Financial Margin Safety',
      subtitle: 'TREASURY & CASH FLOW ALLOCATION',
      content: 'Aurelia (Finance AI) manages cash cycles, tracks account balances, and monitors margins. Outbound invoice templates sync with qualified Sales metrics to protect company runway and minimize manual bookkeeping.',
      metrics: [
        { label: 'ARR Forecast', value: '$418,000' },
        { label: 'Active Subscriptions', value: '12 / 12' },
        { label: 'Runway Buffer', value: '14 Months' },
      ],
    },
    {
      title: 'Pipeline Lead Velocity',
      subtitle: 'QUALIFICATION & PIPELINE CONVERSION',
      content: 'Zephyr (Sales AI) pipeline automation receives inbound accounts, scores company size profiles with Gemini, and structures commercial proposals. Approved deal templates email to prospective clients immediately upon CEO approval.',
      metrics: [
        { label: 'Qualified Pipeline', value: '$241,000' },
        { label: 'Lead Conversion Fit', value: '82%' },
        { label: 'Avg Response Speed', value: '47 seconds' },
      ],
    },
  ];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, slides.length]);

  // Load Report
  useEffect(() => {
    const fetchReport = async () => {
      setLoadingReport(true);
      try {
        const response = await fetch('/api/v1/boardroom/report');
        const data = await response.json();
        setReport(data.markdownReport || '');
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingReport(false);
      }
    };
    fetchReport();
  }, []);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/v1/boardroom/export', { method: 'POST' });
      const data = await response.json();
      if (data.success && data.downloadLink) {
        // Direct download trigger in new tab
        window.open(data.downloadLink, '_blank');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1c1b1b] text-white flex flex-col justify-between p-8 md:p-16 select-none font-sans overflow-hidden">
      {/* Absolute slide ambient grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-800/20 via-neutral-900 to-black pointer-events-none" />

      {/* Header Boardroom controls */}
      <header className="flex items-center justify-between z-10 border-b border-neutral-800 pb-4">
        <div className="flex items-center space-x-3">
          <Presentation className="w-5 h-5 text-brand-bronze" />
          <div>
            <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">BOARDROOM SESSION</span>
            <h1 className="text-xs font-semibold uppercase tracking-wider">{orgName || 'Atlas OS'} Executive Report</h1>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-neutral-800 text-neutral-200 text-xs font-semibold hover:bg-neutral-700 disabled:opacity-30 transition-all cursor-pointer border border-neutral-700"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Assembling PDF Briefing...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Export Briefing</span>
              </>
            )}
          </button>

          <button
            onClick={onExit}
            className="p-2 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer border border-neutral-800"
            title="Exit Boardroom Mode (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Slide body */}
      <main className="flex-1 max-w-5xl w-full mx-auto flex items-center justify-center my-12 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full items-center"
          >
            {/* Core textual slide content */}
            <div className="md:col-span-2 space-y-6">
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest leading-none">
                  {slides[currentSlide].subtitle}
                </span>
                <h2 className="text-3xl md:text-5xl font-sans font-bold tracking-tight leading-none text-white">
                  {slides[currentSlide].title}
                </h2>
              </div>
              <p className="text-sm md:text-base text-neutral-300 leading-relaxed font-sans max-w-2xl font-light">
                {slides[currentSlide].content}
              </p>
            </div>

            {/* Slide Statistics panel */}
            <div className="space-y-4">
              <h3 className="text-[9px] font-mono text-neutral-500 font-bold uppercase tracking-widest">Slide Metrics</h3>
              <div className="grid grid-cols-1 gap-3">
                {slides[currentSlide].metrics.map((metric, i) => (
                  <div key={i} className="p-4 bg-neutral-900 border border-neutral-800/80 rounded-xl space-y-1">
                    <p className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">{metric.label}</p>
                    <p className="text-xl font-mono font-bold text-brand-bronze">{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Boardroom Footer Controls */}
      <footer className="flex justify-between items-center z-10 border-t border-neutral-800 pt-4 text-xs font-mono text-neutral-500">
        <div className="flex items-center space-x-3">
          <Shield className="w-4 h-4 text-brand-bronze" />
          <span>CEILING CONTROLS: ENCRYPTED PORT BOUNDARY</span>
        </div>

        {/* Navigation Arrows */}
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
            disabled={currentSlide === 0}
            className="p-2 hover:bg-neutral-800 hover:text-white rounded-lg disabled:opacity-20 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span>
            {currentSlide + 1} / {slides.length}
          </span>
          <button
            onClick={() => setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1))}
            disabled={currentSlide === slides.length - 1}
            className="p-2 hover:bg-neutral-800 hover:text-white rounded-lg disabled:opacity-20 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
