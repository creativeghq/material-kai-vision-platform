import { createContext } from 'react';

export const AssetContext = createContext<(key: string, loading: boolean) => void>(() => undefined);
