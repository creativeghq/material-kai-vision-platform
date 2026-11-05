import {
  Building2,
  Contact,
  FileMinus,
  FileText,
  FolderKanban,
  Handshake,
  Home,
  Landmark,
  Package,
  Palette,
  Receipt,
  ScrollText,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { SPEC_BY_KIND, type GlobalSearchKind } from '@/config/searchKinds';
import { creditNoteUrl, deliveryNoteUrl } from '@/modules/finance/routes';

export type LinkedRecordKind =
  | 'invoice'
  | 'quote'
  | 'order'
  | 'credit_note'
  | 'delivery_note'
  | 'supplier_bill'
  | 'project'
  | 'deal'
  | 'property'
  | 'contract'
  | 'moodboard'
  | 'company'
  | 'contact'
  | 'asset'
  | 'property_sale'
  | 'rent_charge'
  | 'payment';

export interface LinkedRecordKindSpec {
  label: string;
  plural: string;
  icon: LucideIcon;
  route: ((id: string) => string) | null;
}

function viaSearchRoute(kind: GlobalSearchKind): (id: string) => string {
  return (id) =>
    SPEC_BY_KIND.get(kind)!.route(
      { kind, id, title: '', subtitle: null, badge: null, matchRank: 0 },
      { isPlatformOperator: false, isWorkspaceManager: false },
    );
}

export const LINKED_RECORD_KINDS: Record<LinkedRecordKind, LinkedRecordKindSpec> = {
  invoice: { label: 'Invoice', plural: 'Invoices', icon: Receipt, route: viaSearchRoute('invoice') },
  quote: { label: 'Quote', plural: 'Quotes', icon: FileText, route: viaSearchRoute('quote') },
  order: { label: 'Order', plural: 'Orders', icon: ShoppingCart, route: viaSearchRoute('order') },
  credit_note: { label: 'Credit Note', plural: 'Credit Notes', icon: FileMinus, route: creditNoteUrl },
  delivery_note: { label: 'Delivery Note', plural: 'Delivery Notes', icon: Truck, route: deliveryNoteUrl },
  supplier_bill: { label: 'Supplier Bill', plural: 'Supplier Bills', icon: Receipt, route: null },
  project: { label: 'Project', plural: 'Projects', icon: FolderKanban, route: viaSearchRoute('project') },
  deal: { label: 'Deal', plural: 'Deals', icon: Handshake, route: viaSearchRoute('deal') },
  property: { label: 'Property', plural: 'Properties', icon: Home, route: viaSearchRoute('property') },
  contract: { label: 'Contract', plural: 'Contracts', icon: ScrollText, route: null },
  moodboard: { label: 'Moodboard', plural: 'Moodboards', icon: Palette, route: viaSearchRoute('moodboard') },
  company: { label: 'Company', plural: 'Companies', icon: Building2, route: viaSearchRoute('company') },
  contact: { label: 'Contact', plural: 'Contacts', icon: Contact, route: viaSearchRoute('contact') },
  asset: { label: 'Installed Equipment', plural: 'Installed Equipment', icon: Package, route: null },
  property_sale: { label: 'Property Sale', plural: 'Property Sales', icon: Landmark, route: null },
  rent_charge: { label: 'Rent Charge', plural: 'Rent charges', icon: Landmark, route: null },
  payment: { label: 'Payment', plural: 'Payments', icon: Wallet, route: null },
};

export function isLinkedRecordKind(kind: string): kind is LinkedRecordKind {
  return kind in LINKED_RECORD_KINDS;
}
