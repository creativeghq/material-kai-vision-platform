/**
 * Profile → Schedule → Availability: the days and hours a client may book you for.
 *
 * It used to be an eleventh card three quarters of the way down the Profile tab, between the
 * supplier-verification form and the featured moodboard — while the bookings it produces lived
 * two tabs away under Appointments, and the meetings you keep lived a third tab away under
 * Calendar. Three surfaces, one subject: your time. They are one rail now (`SchedulePanel`), and
 * this is the section that decides whether the other two ever have anything in them.
 *
 * The saved-but-not-saved hazard is why every write here is checked: supabase-js RESOLVES on an
 * RLS denial rather than throwing, so the four writes below once ran under an unconditional
 * "Availability saved" toast. A rejected write left the user believing their calendar was
 * published while clients either could not book at all or could still book slots that had been
 * removed (#347 audit).
 */
import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { toLocalISODate } from '@/utils/datetime';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TimeRange { start: string; end: string; }
type DateMap = Map<string, TimeRange[]>;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const CAL_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// 7:00 AM – 9:00 PM, 30-min steps
const TIME_OPTIONS: string[] = [];
for (let h = 7; h <= 21; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 21) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`);
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * The calendar cell's key, and the value stored in `appointment_availability.available_date`.
 * `toLocalISODate` and NOT `.toISOString().slice(0,10)`: this is the OPERATOR's calendar day, and
 * a Greek professional clicking a date before 02:00 local would otherwise publish availability
 * for the day before (CLAUDE.md §1b).
 */
const dateKey = (d: Date) => toLocalISODate(d);

export function AvailabilitySettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [availability, setAvailability] = useState<DateMap>(new Map());
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('user_profiles').select('booking_enabled').eq('user_id', user.id).maybeSingle(),
      supabase.from('appointment_availability').select('available_date, time_ranges').eq('user_id', user.id),
    ]).then(([profileRes, availRes]) => {
      setBookingEnabled(profileRes.data?.booking_enabled ?? false);
      const map: DateMap = new Map();
      ((availRes.data ?? []) as { available_date: string; time_ranges: TimeRange[] }[])
        .forEach((row) => map.set(row.available_date, row.time_ranges ?? []));
      setAvailability(map);
      setLoaded(true);
    });
  }, [user]);

  const setDateRanges = (key: string, ranges: TimeRange[]) => {
    setAvailability((prev) => {
      const next = new Map(prev);
      if (ranges.length === 0) next.delete(key);
      else next.set(key, ranges);
      return next;
    });
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error: flagErr } = await supabase.from('user_profiles')
        .update({ booking_enabled: bookingEnabled }).eq('user_id', user.id);
      if (flagErr) throw flagErr;

      const entries = Array.from(availability.entries());
      if (entries.length > 0) {
        const { error: upsertErr } = await supabase.from('appointment_availability').upsert(
          entries.map(([date, ranges]) => ({ user_id: user.id, available_date: date, time_ranges: ranges })),
          { onConflict: 'user_id,available_date' },
        );
        if (upsertErr) throw upsertErr;
      }

      // Delete removed dates (fetch existing and diff)
      const { data: existing, error: readErr } = await supabase
        .from('appointment_availability').select('available_date').eq('user_id', user.id);
      if (readErr) throw readErr;
      const toDelete = (existing ?? [])
        .map((r: { available_date: string }) => r.available_date)
        .filter((d) => !availability.has(d));
      if (toDelete.length > 0) {
        // A failure here is the dangerous direction: the slot stays bookable after the user
        // removed it, so they get booked for a time they said they were unavailable.
        const { error: delErr } = await supabase.from('appointment_availability')
          .delete().eq('user_id', user.id).in('available_date', toDelete);
        if (delErr) throw delErr;
      }
      toast({ title: 'Availability saved' });
    } catch (err) {
      toast({
        title: 'Could not save availability',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // A whole pane, not a card in a stack: rendering nothing while it loads would read as a broken
  // section rather than a slow one.
  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Calendar grid
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />Appointment Availability
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Accept bookings</span>
            <Switch checked={bookingEnabled} onCheckedChange={setBookingEnabled} />
          </div>
        </div>
      </CardHeader>

      {!bookingEnabled ? (
        // The switch is off, so there is nothing to configure — but "nothing here" with no reason
        // given is how a professional concludes the feature is broken rather than switched off.
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Bookings are off, so your public profile shows no “Book a time” option and the
            Appointments section stays empty. Turn Accept bookings on to publish the hours clients
            may reserve.
          </p>
        </CardContent>
      ) : (
        <CardContent className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Click a future date to set your available time windows. Dates with availability are highlighted.
          </p>

          {/* ── 2-column grid: calendar | editor ───────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: calendar */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm">{MONTH_NAMES[month]} {year}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    className="p-1 rounded-md hover:bg-accent transition-colors"
                    onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    className="p-1 rounded-md hover:bg-accent transition-colors"
                    onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {CAL_DAYS.map((d) => (
                  <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-1">
                {cells.map((date, i) => {
                  if (!date) return <div key={i} />;
                  const past = date < today;
                  const key = dateKey(date);
                  const hasAvail = availability.has(key);
                  const isEditing = editingDate === key;
                  const isToday = date.toDateString() === today.toDateString();
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={past}
                      onClick={() => setEditingDate(isEditing ? null : key)}
                      className={`
                        aspect-square flex items-center justify-center text-sm rounded-lg mx-0.5 relative transition-colors
                        ${isEditing ? 'bg-primary text-primary-foreground font-medium' : ''}
                        ${hasAvail && !isEditing ? 'bg-primary/15 text-primary font-medium' : ''}
                        ${isToday && !isEditing && !hasAvail ? 'ring-1 ring-primary text-primary' : ''}
                        ${!past && !isEditing ? 'hover:bg-accent cursor-pointer' : ''}
                        ${past ? 'text-muted-foreground/30 cursor-not-allowed' : ''}
                      `}
                    >
                      {date.getDate()}
                      {hasAvail && !isEditing && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: time range editor or placeholder */}
            <div className="border rounded-xl p-4 flex flex-col min-h-[260px]">
              {editingDate ? (
                <TimeRangeEditor
                  dateKey={editingDate}
                  ranges={availability.get(editingDate) ?? []}
                  onChange={(ranges) => setDateRanges(editingDate, ranges)}
                  onClose={() => setEditingDate(null)}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Select a date</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Click any future date on the calendar to configure available hours</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Availability'}
            </Button>
            {availability.size > 0 && (
              <span className="text-xs text-muted-foreground">
                {availability.size} date{availability.size !== 1 ? 's' : ''} configured
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Time range editor for a single date ─────────────────────────────────────
function TimeRangeEditor({
  dateKey: key,
  ranges,
  onChange,
  onClose,
}: {
  dateKey: string;
  ranges: TimeRange[];
  onChange: (r: TimeRange[]) => void;
  onClose: () => void;
}) {
  const [d, m, y] = [
    parseInt(key.split('-')[2]),
    parseInt(key.split('-')[1]) - 1,
    parseInt(key.split('-')[0]),
  ];
  const label = new Date(y, m, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const addRange = () => onChange([...ranges, { start: '09:00', end: '17:00' }]);
  const removeRange = (i: number) => onChange(ranges.filter((_, idx) => idx !== i));
  const updateRange = (i: number, field: 'start' | 'end', val: string) => {
    onChange(ranges.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Set available hours for this day</p>
        </div>
        <button type="button" aria-label="Close the day editor" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>

      {ranges.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No time windows yet — add one below.</p>
      )}

      <div className="space-y-2">
        {ranges.map((range, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg p-2">
            <Select value={range.start} onValueChange={(v) => updateRange(i, 'start', v)}>
              <SelectTrigger className="flex-1 min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>{fmtTime(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground shrink-0">to</span>
            <Select value={range.end} onValueChange={(v) => updateRange(i, 'end', v)}>
              <SelectTrigger className="flex-1 min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.filter((t) => t > range.start).map((t) => (
                  <SelectItem key={t} value={t}>{fmtTime(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              aria-label="Remove this time window"
              onClick={() => removeRange(i)}
              className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRange}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add time window
      </button>

      {ranges.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Clients can book 1-hour slots within these windows.
        </p>
      )}
    </div>
  );
}

export default AvailabilitySettings;
