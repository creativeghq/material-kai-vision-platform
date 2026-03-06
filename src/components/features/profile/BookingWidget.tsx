import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { BookingModal } from './BookingModal';

interface DateAvailability {
  available_date: string; // "YYYY-MM-DD"
  time_ranges: { start: string; end: string }[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatSlot(slot: string) {
  const [h, m] = slot.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// Expand time ranges into hourly slots
function slotsFromRanges(ranges: { start: string; end: string }[]): string[] {
  const slots: string[] = [];
  for (const { start, end } of ranges) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let minutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    while (minutes < endMinutes) {
      slots.push(`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`);
      minutes += 60;
    }
  }
  return [...new Set(slots)].sort();
}

function groupSlots(slots: string[]) {
  return {
    morning: slots.filter((s) => parseInt(s) < 12),
    afternoon: slots.filter((s) => parseInt(s) >= 12 && parseInt(s) < 17),
    evening: slots.filter((s) => parseInt(s) >= 17),
  };
}

export const BookingWidget: React.FC<{
  profileUserId: string;
  profileName: string;
  services?: { id: string; name: string }[];
}> = ({ profileUserId, profileName, services = [] }) => {
  const [availMap, setAvailMap] = useState<Map<string, DateAvailability>>(new Map());
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    const today = toDateKey(new Date());
    Promise.all([
      supabase.from('user_profiles').select('booking_enabled').eq('user_id', profileUserId).maybeSingle(),
      supabase.from('appointment_availability')
        .select('available_date, time_ranges')
        .eq('user_id', profileUserId)
        .gte('available_date', today)
        .order('available_date', { ascending: true })
        .limit(180),
    ]).then(([profileRes, availRes]) => {
      if (!profileRes.data?.booking_enabled) {
        setLoading(false);
        return;
      }
      const map = new Map<string, DateAvailability>();
      ((availRes.data ?? []) as DateAvailability[]).forEach((row) => {
        if ((row.time_ranges ?? []).length > 0) map.set(row.available_date, row);
      });
      setAvailMap(map);
      setLoading(false);
    });
  }, [profileUserId]);

  const today = new Date(); today.setHours(0,0,0,0);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  const calRows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) calRows.push(cells.slice(i, i + 7));

  const slotsForSelected = selectedDate
    ? slotsFromRanges(availMap.get(toDateKey(selectedDate))?.time_ranges ?? [])
    : [];
  const { morning, afternoon, evening } = groupSlots(slotsForSelected);

  if (loading) return null;
  if (availMap.size === 0) return null;

  return (
    <>
      <div className="rounded-2xl border bg-card shadow-sm p-4 space-y-4 w-full">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Book an Appointment
        </h3>

        {/* 2-column layout: calendar left, slots right */}
        <div className="flex gap-3 items-start">
          {/* Left: compact calendar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{MONTH_NAMES[month]} {year}</span>
              <div className="flex gap-1">
                <button
                  className="p-1 rounded hover:bg-accent transition-colors"
                  onClick={() => { setViewMonth(new Date(year, month - 1, 1)); setSelectedDate(null); setSelectedSlot(null); }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1 rounded hover:bg-accent transition-colors"
                  onClick={() => { setViewMonth(new Date(year, month + 1, 1)); setSelectedDate(null); setSelectedSlot(null); }}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-0.5">{d[0]}</div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="space-y-0.5">
              {calRows.map((row, ri) => (
                <div key={ri} className="grid grid-cols-7 gap-px">
                  {row.map((date, di) => {
                    if (!date) return <div key={di} />;
                    const key = toDateKey(date);
                    const available = date >= today && availMap.has(key);
                    const selected = selectedDate?.toDateString() === date.toDateString();
                    const isToday = date.toDateString() === today.toDateString();
                    return (
                      <button
                        key={di}
                        disabled={!available}
                        onClick={() => { setSelectedDate(date); setSelectedSlot(null); }}
                        className={`
                          h-8 w-full flex items-center justify-center text-xs rounded transition-colors relative
                          ${selected ? 'bg-primary text-primary-foreground font-medium' : ''}
                          ${isToday && !selected ? 'ring-1 ring-primary text-primary' : ''}
                          ${available && !selected ? 'hover:bg-accent cursor-pointer font-medium text-foreground' : ''}
                          ${!available ? 'text-muted-foreground/30 cursor-not-allowed' : ''}
                        `}
                      >
                        {date.getDate()}
                        {available && !selected && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Right: time slots panel */}
          <div className="w-36 shrink-0 min-h-[180px] flex flex-col border-l pl-3">
            {!selectedDate ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground text-center leading-snug">Pick a date to see times</p>
              </div>
            ) : slotsForSelected.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center mt-4">No slots available</p>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-56">
                <p className="text-xs font-medium flex items-center gap-1 text-foreground">
                  <Clock className="h-3 w-3 text-primary" />
                  {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                {[
                  { label: 'Morning', list: morning },
                  { label: 'Afternoon', list: afternoon },
                  { label: 'Evening', list: evening },
                ]
                  .filter(({ list }) => list.length > 0)
                  .map(({ label, list }) => (
                    <div key={label}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
                      <div className="flex flex-col gap-1.5">
                        {list.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`
                              w-full px-2 py-1.5 rounded-md text-xs border transition-colors text-center font-medium
                              ${selectedSlot === slot
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-accent border-border text-foreground'
                              }
                            `}
                          >
                            {formatSlot(slot)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        <Button
          className="w-full rounded-full"
          size="sm"
          disabled={!selectedDate || !selectedSlot}
          onClick={() => setBookingOpen(true)}
        >
          Book Now
        </Button>
      </div>

      {selectedDate && selectedSlot && (
        <BookingModal
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          professionalUserId={profileUserId}
          professionalName={profileName}
          date={selectedDate}
          timeSlot={selectedSlot}
          services={services}
          onBooked={() => {
            setBookingOpen(false);
            setSelectedDate(null);
            setSelectedSlot(null);
          }}
        />
      )}
    </>
  );
};
