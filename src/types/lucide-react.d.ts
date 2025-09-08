declare module 'lucide-react' {
  import { FC, SVGProps } from 'react';
  
  export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
  }
  
  export const Plus: FC<IconProps>;
  export const Edit: FC<IconProps>;
  export const Trash2: FC<IconProps>;
  export const Settings: FC<IconProps>;
  export const ArrowLeft: FC<IconProps>;
  export const Home: FC<IconProps>;
  
  // Add other icons as needed
  export const Search: FC<IconProps>;
  export const User: FC<IconProps>;
  export const Save: FC<IconProps>;
  export const X: FC<IconProps>;
  export const Check: FC<IconProps>;
  export const ChevronDown: FC<IconProps>;
  export const ChevronUp: FC<IconProps>;
  export const ChevronLeft: FC<IconProps>;
  export const ChevronRight: FC<IconProps>;
  export const Menu: FC<IconProps>;
  export const MoreHorizontal: FC<IconProps>;
  export const Upload: FC<IconProps>;
  export const Download: FC<IconProps>;
  export const Eye: FC<IconProps>;
  export const EyeOff: FC<IconProps>;
  export const Lock: FC<IconProps>;
  export const Unlock: FC<IconProps>;
  export const Star: FC<IconProps>;
  export const Heart: FC<IconProps>;
  export const Info: FC<IconProps>;
  export const AlertCircle: FC<IconProps>;
  export const CheckCircle: FC<IconProps>;
  export const XCircle: FC<IconProps>;
  export const Calendar: FC<IconProps>;
  export const Clock: FC<IconProps>;
  export const Mail: FC<IconProps>;
  export const Phone: FC<IconProps>;
  export const MapPin: FC<IconProps>;
  export const Globe: FC<IconProps>;
  export const ExternalLink: FC<IconProps>;
  export const Copy: FC<IconProps>;
  export const Share: FC<IconProps>;
  export const Filter: FC<IconProps>;
  export const Sort: FC<IconProps>;
  export const Refresh: FC<IconProps>;
  export const Loading: FC<IconProps>;
  export const Loader: FC<IconProps>;
  export const Loader2: FC<IconProps>;
  
  // Additional icons for FunctionalPropertySearch
  export const Shield: FC<IconProps>;
  export const Droplets: FC<IconProps>;
  export const Thermometer: FC<IconProps>;
  export const Hammer: FC<IconProps>;
  export const Leaf: FC<IconProps>;
  export const Waves: FC<IconProps>;
  export const Palette: FC<IconProps>;
}