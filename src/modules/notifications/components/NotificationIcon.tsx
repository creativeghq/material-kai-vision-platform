import React from 'react';
import {
  Bell, Inbox, Calendar, Star, Bot, Sparkles, FileText, Building2,
  Globe, Video, Layers, Cpu, Download, CreditCard, XCircle, UserPlus, CheckCircle,
  Megaphone,
} from 'lucide-react';

const TYPE_ICON: Record<string, React.ReactNode> = {
  hire_me:                <Inbox className="h-4 w-4 text-primary" />,
  appointment_booked:     <Calendar className="h-4 w-4 text-amber-500" />,
  appointment_confirmed:  <Calendar className="h-4 w-4 text-green-500" />,
  appointment_cancelled:  <Calendar className="h-4 w-4 text-destructive" />,
  review_received:        <Star className="h-4 w-4 text-amber-400" />,
  agent_completed:        <Bot className="h-4 w-4 text-primary" />,
  material_alert:         <Sparkles className="h-4 w-4 text-primary" />,
  quote_updated:          <FileText className="h-4 w-4 text-violet-500" />,
  preferred_factory:      <Building2 className="h-4 w-4 text-blue-500" />,
  vr_world_ready:         <Globe className="h-4 w-4 text-emerald-500" />,
  vr_world_failed:        <Globe className="h-4 w-4 text-destructive" />,
  video_ready:            <Video className="h-4 w-4 text-emerald-500" />,
  video_failed:           <Video className="h-4 w-4 text-destructive" />,
  staging_ready:          <Layers className="h-4 w-4 text-emerald-500" />,
  agent_run_done:         <Cpu className="h-4 w-4 text-emerald-500" />,
  agent_run_failed:       <Cpu className="h-4 w-4 text-destructive" />,
  pdf_ready:              <Download className="h-4 w-4 text-violet-500" />,
  svbrdf_ready:           <Sparkles className="h-4 w-4 text-emerald-500" />,
  factory_approved:       <CheckCircle className="h-4 w-4 text-green-500" />,
  factory_rejected:       <XCircle className="h-4 w-4 text-destructive" />,
  quote_accepted:         <FileText className="h-4 w-4 text-green-500" />,
  quote_rejected:         <FileText className="h-4 w-4 text-destructive" />,
  new_follower:           <UserPlus className="h-4 w-4 text-blue-500" />,
  payment_success:        <CreditCard className="h-4 w-4 text-green-500" />,
  payment_failed:         <CreditCard className="h-4 w-4 text-destructive" />,
  changelog_published:    <Megaphone className="h-4 w-4 text-primary" />,
};

export const NotificationIcon: React.FC<{ type: string }> = ({ type }) => (
  <>{TYPE_ICON[type] ?? <Bell className="h-4 w-4 text-muted-foreground" />}</>
);
