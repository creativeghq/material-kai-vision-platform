import React from 'react';

import { Button } from '@/components/core/ui/button';

import styles from './Dashboard.module.css';
import { heroConfig, type HeroAction } from './dashboardData';

interface HeroSectionProps {
  onNavigate: (path: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  return (
    <div className="relative overflow-hidden h-full min-h-[280px] sm:min-h-[400px] flex items-center justify-center rounded-xl border border-white/8 bg-card">
      {/* Subtle backdrop gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 p-4 sm:p-8 text-center max-w-2xl mx-auto flex flex-col gap-4 sm:gap-6">
        <div className="flex justify-center animate-float">
          <div className="hero-badge flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-light border border-primary/20">
            <heroConfig.badge.icon className="h-4 w-4" />
            {heroConfig.badge.text}
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tight leading-tight">
          {heroConfig.title}
          <br />
          <span className="text-primary">{heroConfig.subtitle}</span>
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          {heroConfig.description}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-2 sm:mt-4">
          {heroConfig.actions.map((action: HeroAction, index: number) => (
            <Button
              key={index}
              variant={action.type === 'primary' ? 'default' : 'outline'}
              className={`w-full sm:w-auto h-10 sm:h-12 px-6 sm:px-8 text-base sm:text-lg font-light transition-all duration-300 hover:scale-105 ${
                action.type === 'primary'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 border-none'
                  : 'bg-background border-white/10'
              }`}
              onClick={() => onNavigate(action.path)}
            >
              <action.icon className="mr-2 h-5 w-5" />
              {action.text}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
