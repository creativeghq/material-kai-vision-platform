import React from 'react';

import { Button } from '@/components/core/ui/button';

import styles from './Dashboard.module.css';
import { heroConfig, type HeroAction } from './dashboardData';

interface HeroSectionProps {
  onNavigate: (path: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  return (
    <div className="glass-panel relative overflow-hidden h-full min-h-[400px] flex items-center justify-center">
      {/* Subtle backdrop gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 p-8 text-center max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex justify-center animate-float">
          <div className="hero-badge flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
            <heroConfig.badge.icon className="h-4 w-4" />
            {heroConfig.badge.text}
          </div>
        </div>

        <h1 className="text-5xl font-black tracking-tight leading-tight">
          {heroConfig.title}
          <br />
          <span className="text-primary">{heroConfig.subtitle}</span>
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed">
          {heroConfig.description}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
          {heroConfig.actions.map((action: HeroAction, index: number) => (
            <Button
              key={index}
              variant={action.type === 'primary' ? 'default' : 'outline'}
              className={`h-12 px-8 text-lg font-semibold transition-all duration-300 hover:scale-105 ${
                action.type === 'primary' 
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 border-none' 
                  : 'bg-background/50 backdrop-blur-sm border-white/30'
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
