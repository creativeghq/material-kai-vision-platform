import React, { createContext, useContext } from 'react';

/**
 * The moodboard a user is actively curating. Set when they arrive at the Agent
 * Hub from a specific moodboard (via `/agent-hub?moodboard=<id>`), so any product
 * they add from the agent lands in that moodboard instead of prompting them to
 * pick one every time.
 */
export interface ActiveMoodboard {
  id: string;
  title: string;
}

interface ActiveMoodboardContextValue {
  activeMoodboard: ActiveMoodboard | null;
  setActiveMoodboard: (moodboard: ActiveMoodboard | null) => void;
}

const ActiveMoodboardContext = createContext<ActiveMoodboardContextValue>({
  activeMoodboard: null,
  setActiveMoodboard: () => {},
});

/** Controlled provider — the parent owns the state. */
export const ActiveMoodboardProvider: React.FC<{
  value: ActiveMoodboard | null;
  onChange: (moodboard: ActiveMoodboard | null) => void;
  children: React.ReactNode;
}> = ({ value, onChange, children }) => (
  <ActiveMoodboardContext.Provider value={{ activeMoodboard: value, setActiveMoodboard: onChange }}>
    {children}
  </ActiveMoodboardContext.Provider>
);

/**
 * Returns the active moodboard context. Outside any provider this is always
 * `{ activeMoodboard: null }`, so consumers (e.g. AddToMoodboardButton used on
 * product cards across the app) safely fall back to their default behaviour.
 */
export const useActiveMoodboard = () => useContext(ActiveMoodboardContext);
