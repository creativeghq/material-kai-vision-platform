import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { round2 as r2 } from '@/utils/decimal';
import { Home, ClipboardList, User, Truck } from 'lucide-react';

import {
  formatInvoiceMoney,
  type InvoiceColors,
  type InvoiceRenderData,
  type InvoiceTemplateSpec,
  type VatAnalysisRow,
} from '../invoice-templates';

/**
 * On-screen HTML invoice that mirrors the pdf-lib output. Renders an A4 paper sheet
 * (always light "paper" regardless of app theme) driven by the same template spec +
 * colors + normalized render data the PDF uses, so the two stay visually similar.
 */
export function InvoiceDocument({
  spec,
  colors,
  data,
}: {
  spec: InvoiceTemplateSpec;
  colors: InvoiceColors;
  data: InvoiceRenderData;
}) {
  const L = data.labels;
  const money = (n: number) => formatInvoiceMoney(n, data.currency, data.lang);

  const sheet: React.CSSProperties = {
    width: '210mm',
    minHeight: '297mm',
    background: '#ffffff',
    color: colors.text,
    fontFamily: '"Open Sans", "Noto Sans", system-ui, sans-serif',
    fontSize: 11,
    lineHeight: 1.45,
    boxSizing: 'border-box',
    padding: '14mm',
    margin: '0 auto',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
  };

  const muted: React.CSSProperties = { color: colors.muted };
  const hr = (thick = 1) => (
    <div style={{ borderTop: `${thick}px solid ${colors.line}`, width: '100%' }} />
  );

  const Issuer = ({ compact = false }: { compact?: boolean }) => (
    <div style={{ minWidth: 0 }}>
      {data.issuer.logoUrl && (
        <img
          src={data.issuer.logoUrl}
          alt=""
          style={{ maxHeight: 46, maxWidth: 160, objectFit: 'contain', marginBottom: 6, display: 'block' }}
        />
      )}
      <div style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: spec.headerStyle === 'band' ? colors.headerText : colors.text }}>
        {data.issuer.name}
      </div>
      <div style={{ marginTop: 2, fontSize: 9, ...(spec.headerStyle === 'band' ? { color: colors.headerText, opacity: 0.85 } : muted) }}>
        {data.issuer.lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );

  const titleSize = spec.titleStyle === 'left-xl' ? 40 : spec.headerStyle === 'minimal' ? 44 : 24;
  const titleColor = spec.headerStyle === 'band' ? colors.headerText : (spec.titleStyle === 'left-xl' ? colors.text : colors.accent);
  const Title = () => (
    <div style={{ fontSize: titleSize, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: titleColor }}>
      {data.title}
    </div>
  );

  const Meta = ({ align = 'right' as 'right' | 'left' }) => (
    <table style={{ borderCollapse: 'collapse', fontSize: 9.5, marginLeft: align === 'right' ? 'auto' : undefined }}>
      <tbody>
        {data.meta.map((m, i) => (
          <tr key={i}>
            <td style={{ ...muted, padding: '1px 10px 1px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>{m.label}</td>
            <td style={{ fontWeight: 700, padding: '1px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>{m.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // ── Header variants ──
  const Header = () => {
    if (spec.headerStyle === 'band') {
      return (
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: colors.headerBg, color: colors.headerText, padding: '16px 18px', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <Issuer />
            <div style={{ textAlign: 'right' }}><Title /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><Meta /></div>
        </div>
      );
    }
    if (spec.headerStyle === 'minimal') {
      return (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <Title />
            <Meta />
          </div>
          <div style={{ marginTop: 14 }}><Issuer compact /></div>
        </div>
      );
    }
    // split (classic / modern). Title placement depends on titleStyle.
    if (spec.titleStyle === 'left-xl') {
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div><Title /><div style={{ height: 12 }} /><Issuer compact /></div>
          <div style={{ textAlign: 'right' }}><Meta /></div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <Issuer />
        <div style={{ textAlign: 'right' }}><Title /><div style={{ height: 10 }} /><Meta /></div>
      </div>
    );
  };

  // ── Customer ──
  const Customer = () => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{L.customer}</div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3 }}>{data.customer.name}</div>
      <div style={{ fontSize: 9.5, marginTop: 2, ...muted }}>
        {data.customer.lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );

  // Where the goods GO, when that is not where the bill goes. Rendered only when the document
  // names a sub-unit — that unit is also the myDATA branch number on the transmitted envelope,
  // so an invoice re-addressed for AADE no longer prints the head office to the customer.
  const Delivery = () => {
    if (!data.delivery) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{L.deliveryInfo}</div>
        {data.delivery.name && <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3 }}>{data.delivery.name}</div>}
        <div style={{ fontSize: 9.5, marginTop: 2, ...muted }}>
          {data.delivery.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    );
  };

  // ── Items table ──
  const th: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
    padding: '7px 8px', textAlign: 'left',
    background: spec.tableHeaderFill ? colors.tableHeaderBg : 'transparent',
    borderBottom: spec.tableHeaderFill ? 'none' : `1.5px solid ${colors.line}`,
  };
  const thR: React.CSSProperties = { ...th, textAlign: 'right' };
  const td: React.CSSProperties = { fontSize: 10, padding: '7px 8px', verticalAlign: 'top', borderBottom: `1px solid ${colors.line}` };
  const tdR: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };

  // A column appears when the document actually carries that data. The reference prints a wall
  // of 0,00 for every charge column on every line; showing the column only when a line uses it
  // keeps an ordinary 24%-on-everything invoice readable and still discloses the full myDATA
  // breakdown the moment one is present.
  const anyDiscount = data.items.some((it) => it.discount > 0);
  const anyOtherTaxes = data.items.some((it) => it.otherTaxes > 0);
  const exemptionMarker = (code: number | null | undefined) =>
    (code ? data.vatExemptions.find((e) => e.code === code)?.marker ?? '' : '');

  const Items = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
      <thead>
        <tr>
          <th style={{ ...th, width: 18 }}>{L.lineNo}</th>
          <th style={th}>{L.descr}</th>
          <th style={thR}>{L.qty}</th>
          <th style={th}>{L.unit}</th>
          <th style={thR}>{L.unitPrice}</th>
          {anyDiscount && <th style={thR}>{L.lineDiscount}</th>}
          <th style={thR}>{L.net}</th>
          <th style={thR}>{L.vatPct}</th>
          <th style={thR}>{L.vatAmt}</th>
          {anyOtherTaxes && <th style={thR}>{L.lineOtherTaxes}</th>}
          <th style={thR}>{L.totalValue}</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((it, i) => (
          <tr key={i}>
            <td style={{ ...td, ...muted }}>{i + 1}</td>
            <td style={td}>
              <div style={{ fontWeight: 600 }}>{it.description}</div>
              {(it.sku || it.detail) && (
                <div style={{ fontSize: 8.5, ...muted }}>
                  {[it.sku, it.detail].filter(Boolean).join(' · ')}
                </div>
              )}
            </td>
            <td style={tdR}>{it.qty}</td>
            <td style={td}>{it.unit}</td>
            <td style={tdR}>{money(it.unitPrice)}</td>
            {anyDiscount && <td style={tdR}>{it.discount > 0 ? `- ${money(it.discount)}` : '—'}</td>}
            <td style={tdR}>{money(it.net)}</td>
            <td style={tdR}>
              {it.vatPct}%
              {it.exemptionCode ? <sup style={{ ...muted, fontSize: 7 }}>{exemptionMarker(it.exemptionCode)}</sup> : null}
            </td>
            <td style={tdR}>{money(it.vatAmount)}</td>
            {anyOtherTaxes && <td style={tdR}>{it.otherTaxes > 0 ? money(it.otherTaxes) : '—'}</td>}
            <td style={tdR}>{money(it.lineTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // The legal ground for charging no VAT. Required on the document itself — we have stored and
  // transmitted the myDATA exemption category all along and never printed it.
  const Exemptions = () =>
    data.vatExemptions.length === 0 ? null : (
      <div style={{ marginBottom: 12, fontSize: 8.5, ...muted }}>
        {data.vatExemptions.map((e) => (
          <div key={e.code}>{e.marker} {L.exemptionNote}: {e.label}</div>
        ))}
      </div>
    );

  // ── Totals + VAT analysis ──
  const totalsBoxStyle: React.CSSProperties =
    spec.totalsBoxStyle === 'boxed'
      ? { border: `1px solid ${colors.line}`, borderRadius: 4, padding: '10px 12px' }
      : {};
  const grandStyle: React.CSSProperties =
    spec.totalsBoxStyle === 'accent'
      ? { background: colors.accent, color: '#ffffff', borderRadius: 4, padding: '8px 10px', marginTop: 6 }
      : spec.totalsBoxStyle === 'accent-text'
      ? { borderTop: `1.5px solid ${colors.accent}`, paddingTop: 6, marginTop: 4 }
      : { borderTop: `1.5px solid ${colors.line}`, paddingTop: 6, marginTop: 4 };

  const totalRow = (label: string, value: string, opts: { bold?: boolean; accent?: boolean; accentText?: boolean } = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: opts.bold ? 12 : 10, fontWeight: opts.bold ? 800 : 400, color: opts.accent ? '#ffffff' : opts.accentText ? colors.accent : (opts.bold ? colors.text : colors.muted), padding: '2px 0' }}>
      <span>{label}</span><span style={{ whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );

  // The per-rate VAT table. It used to be two lines of 9px grey text, on a document whose whole
  // purpose is letting a reader verify the VAT — so it is a table now, and it foots.
  const VatAnalysisTable = () => {
    if (data.vatAnalysis.length === 0) return null;
    const vth: React.CSSProperties = { fontSize: 8, fontWeight: 700, ...muted, textAlign: 'right', padding: '3px 6px', borderBottom: `1px solid ${colors.line}` };
    const vtd: React.CSSProperties = { fontSize: 9, textAlign: 'right', padding: '3px 6px', whiteSpace: 'nowrap' };
    const vtdSum: React.CSSProperties = { ...vtd, fontWeight: 700, borderTop: `1px solid ${colors.line}` };
    const sum = (pick: (r: VatAnalysisRow) => number) =>
      r2(data.vatAnalysis.reduce((a, v) => a + pick(v), 0));
    return (
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>{L.vatAnalysis}</div>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...vth, textAlign: 'left' }}>{L.vatPct}</th>
              <th style={vth}>{L.net}</th>
              <th style={vth}>{L.vatAmt}</th>
              <th style={vth}>{L.totalValue}</th>
            </tr>
          </thead>
          <tbody>
            {data.vatAnalysis.map((v, i) => (
              <tr key={i}>
                <td style={{ ...vtd, textAlign: 'left' }}>{v.pct}%</td>
                <td style={vtd}>{money(v.net)}</td>
                <td style={vtd}>{money(v.vat)}</td>
                <td style={vtd}>{money(v.total)}</td>
              </tr>
            ))}
            {data.vatAnalysis.length > 1 && (
              <tr>
                <td style={{ ...vtdSum, textAlign: 'left' }}>{'\u03a3'}</td>
                <td style={vtdSum}>{money(sum((v) => v.net))}</td>
                <td style={vtdSum}>{money(sum((v) => v.vat))}</td>
                <td style={vtdSum}>{money(sum((v) => v.total))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // Charges block — the fees / stamp / other taxes / deductions / withholding this document
  // carries, listed together instead of buried in the running total.
  const Charges = () =>
    data.totals.extras.length === 0 ? null : (
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>{L.charges}</div>
        {data.totals.extras.map((e, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 9, ...muted, padding: '1px 0' }}>
            <span>{e.negative ? '(-)' : '(+)'} {e.label}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{money(e.value)}</span>
          </div>
        ))}
      </div>
    );

  // Net effect of the charges on the total: additions positive, deductions/withholding negative.
  const chargesNet = r2(data.totals.extras.reduce((t, e) => t + (e.negative ? -e.value : e.value), 0));

  // The payable bar earns its place when it says something the grand total does not — either the
  // template gives the total no visual weight of its own, or part of it is already paid so the
  // two numbers genuinely differ. On `commercial` (24pt amount) and `accent` (filled box) with
  // nothing paid it would just be the same figure twice in a row.
  const templateEmphasisesTotal = spec.headerStyle === 'commercial' || spec.totalsBoxStyle === 'accent';
  const showPayableBar = !templateEmphasisesTotal || data.totals.amountPaid > 0;

  const PayableBar = () =>
    !showPayableBar ? null : (
      <div style={{ background: colors.accent, color: '#ffffff', borderRadius: 3, padding: '6px 10px', marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700 }}>{L.payable}</span>
        <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>{money(data.totals.amountDue)}</span>
      </div>
    );

  const Summary = () => (
    <div style={{ width: 260, ...totalsBoxStyle }}>
      {data.totals.discount > 0 ? (
        <>
          {totalRow(L.price, money(data.totals.subtotalNet))}
          {totalRow(L.discount, `- ${money(data.totals.discount)}`)}
          {totalRow(L.priceAfterDiscount, money(data.totals.priceAfterDiscount))}
        </>
      ) : (
        totalRow(L.subtotalNet, money(data.totals.subtotalNet))
      )}
      {totalRow(L.currency, data.currency)}
      {data.fx && totalRow(L.fxRate, `1 ${data.currency} = ${data.fx.rate} ${data.fx.base}`)}
      {totalRow(L.totalVat, money(data.totals.totalVat))}
      {/* One line, because the Charges block beside it already itemises them. */}
      {chargesNet !== 0 && totalRow(L.charges, `${chargesNet < 0 ? '- ' : ''}${money(Math.abs(chargesNet))}`)}
      <div style={grandStyle}>
        {totalRow(L.total, money(data.totals.grand), { bold: true, accent: spec.totalsBoxStyle === 'accent', accentText: spec.totalsBoxStyle === 'accent-text' })}
      </div>
      {data.totals.amountPaid > 0 && (
        <div style={{ marginTop: 4 }}>
          {totalRow(L.paid, `- ${money(data.totals.amountPaid)}`)}
          {/* The payable bar below carries the balance; a "Balance" row here would be the same
              figure one line apart. Templates that suppress the bar still need the row. */}
          {!showPayableBar && totalRow(L.due2, money(data.totals.amountDue), { bold: true })}
        </div>
      )}
      <PayableBar />
      <PriorBalance />
    </div>
  );

  const Totals = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 20, flex: 1, minWidth: 0 }}>
        <Charges />
        <VatAnalysisTable />
      </div>
      <Summary />
    </div>
  );

  // Carry-forward block (previous balance / credit + total outstanding). Never feeds `grand`.
  const PriorBalance = () => {
    if (data.priorBalance == null) return null;
    const due = data.totals.amountDue;
    return (
      <div style={{ marginTop: 4, borderTop: `1px solid ${colors.line}`, paddingTop: 4 }}>
        {data.priorBalance > 0 ? (
          <>
            {totalRow(L.prevBalance, money(data.priorBalance))}
            {totalRow(L.totalWithPrev, money(r2(due + data.priorBalance)), { bold: true })}
          </>
        ) : (
          <>
            {totalRow(L.prevCredit, `- ${money(Math.abs(data.priorBalance))}`)}
            {totalRow(L.totalWithPrev, money(Math.max(0, r2(due + data.priorBalance))), { bold: true })}
          </>
        )}
      </div>
    );
  };

  // Pay / view online — QR + link to the hosted /pay/{token} page.
  const PayOnline = () => {
    if (!data.payUrl) return null;
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, padding: '10px 12px', border: `1px solid ${colors.line}`, borderRadius: 6 }}>
        <QRCodeSVG value={data.payUrl} size={64} level="M" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.accent }}>{L.payOnline}</div>
          <div style={{ fontSize: 8.5, ...muted, wordBreak: 'break-all' }}>{data.payUrl}</div>
          <div style={{ fontSize: 7.5, ...muted, marginTop: 2 }}>{L.scanToPay}</div>
        </div>
      </div>
    );
  };

  const VatSuspended = () =>
    data.vatSuspended ? (
      <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.accent, marginBottom: 10 }}>{L.vatSuspended}</div>
    ) : null;

  // ── Payment + bank ──
  const Payment = () => {
    const hasPay = data.payment.method || data.payment.info || data.payment.accounts.length > 0;
    if (!hasPay) return null;
    // Sidebar (Modern) renders bank details in the accent color, like the design reference.
    const bankStyle: React.CSSProperties = spec.headerStyle === 'sidebar'
      ? { color: colors.accent, fontWeight: 600 } : {};
    return (
      <div style={{ marginBottom: 12, fontSize: 9.5, ...muted }}>
        {data.payment.method && <div>{L.paymentMethod}: {data.payment.method}</div>}
        {data.payment.info && <div>{data.payment.info}</div>}
        {data.payment.accounts.map((a, i) => (
          <div key={i} style={bankStyle}>{i === 0 ? `${L.bank}: ${a}` : a}</div>
        ))}
      </div>
    );
  };

  const Shipping = () => {
    if (!data.shipping) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        {hr(0.5)}
        <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.03em', margin: '8px 0 4px' }}>{L.movement}</div>
        {data.shipping.rows.map((r, i) => <div key={i} style={{ fontSize: 9.5, ...muted }}>{r}</div>)}
      </div>
    );
  };

  const Notes = () => {
    if (!data.notes && !data.orderNotes && !data.infoBox) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        {data.notes && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{L.notes}</div>
            <div style={{ fontSize: 9.5, ...muted, whiteSpace: 'pre-wrap' }}>{data.notes}</div>
          </>
        )}
        {data.orderNotes && (
          <div style={{ marginTop: data.notes ? 6 : 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{L.orderNotes}</div>
            <div style={{ fontSize: 9.5, ...muted, whiteSpace: 'pre-wrap' }}>{data.orderNotes}</div>
          </div>
        )}
        {data.infoBox && <div style={{ fontSize: 9, ...muted, marginTop: 4, whiteSpace: 'pre-wrap' }}>{data.infoBox}</div>}
      </div>
    );
  };

  const Fiscal = () => {
    if (!data.fiscal) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, ...muted }}>{L.mark}</div>
          <div style={{ fontSize: 11, fontWeight: 700 }}>{data.fiscal.mark}</div>
          {data.fiscal.authCode && <div style={{ fontSize: 9, ...muted }}>{L.authCode}: {data.fiscal.authCode}</div>}
          {data.fiscal.uid && <div style={{ fontSize: 9, ...muted }}>{L.uid}: {data.fiscal.uid}</div>}
        </div>
        {data.fiscal.qrUrl && (
          <div style={{ textAlign: 'center' }}>
            <QRCodeSVG value={data.fiscal.qrUrl} size={86} level="M" />
            <div style={{ fontSize: 7.5, ...muted, marginTop: 2 }}>{L.verify}</div>
          </div>
        )}
      </div>
    );
  };

  const Body = () => (
    <>
      <Header />
      {data.isPreInvoice && (
        <div style={{ fontSize: 9.5, ...muted, marginBottom: 12 }}>{L.preInvoiceNote}</div>
      )}
      <Customer />
      <Delivery />
      <Items />
      <Exemptions />
      <Totals />
      <VatSuspended />
      <Payment />
      <Shipping />
      <Notes />
      <PayOnline />
      <Fiscal />
    </>
  );

  // Commercial: Greek delivery-style receipt — logo left / QR right, three icon party
  // columns (order · bill-to · ship-to), code+comment line items, large amount-due.
  if (spec.headerStyle === 'commercial') {
    const badge = (icon: React.ReactNode) => (
      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${colors.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
    );
    const cth: React.CSSProperties = { fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', padding: '6px 6px', textAlign: 'left', background: colors.tableHeaderBg };
    const cthR: React.CSSProperties = { ...cth, textAlign: 'right' };
    const ctd: React.CSSProperties = { fontSize: 9, padding: '6px 6px', verticalAlign: 'top', borderBottom: `1px solid ${colors.line}` };
    const ctdR: React.CSSProperties = { ...ctd, textAlign: 'right', whiteSpace: 'nowrap' };
    const columns = [
      { icon: <ClipboardList size={12} color={colors.accent} />, header: L.orderDetails, name: '', lines: data.meta.map((m) => `${m.label}: ${m.value}`) },
      { icon: <User size={12} color={colors.accent} />, header: L.billTo, name: data.customer.name, lines: data.customer.lines },
      {
        icon: <Truck size={12} color={colors.accent} />,
        header: data.delivery ? L.deliveryInfo : L.shipTo,
        name: data.delivery?.name ?? '',
        lines: data.delivery?.lines ?? data.shipping?.rows ?? data.customer.lines,
      },
    ];
    return (
      <div style={sheet} data-invoice-template={spec.id}>
        {/* Header: logo left, title + QR right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            {data.issuer.logoUrl && (
              <img src={data.issuer.logoUrl} alt="" style={{ maxHeight: 54, maxWidth: 180, objectFit: 'contain', display: 'block' }} />
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: colors.accent }}>{data.title}</div>
            {data.fiscal?.qrUrl && (
              <div style={{ marginTop: 6, display: 'inline-block' }}>
                <QRCodeSVG value={data.fiscal.qrUrl} size={72} level="M" />
                <div style={{ fontSize: 7, ...muted }}>{L.verify}</div>
              </div>
            )}
          </div>
        </div>
        {/* Issuer identity with home badge */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
          {badge(<Home size={13} color={colors.accent} />)}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{data.issuer.name}</div>
            <div style={{ fontSize: 9, ...muted }}>{data.issuer.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
          </div>
        </div>
        <div style={{ borderTop: `0.8px solid ${colors.line}`, margin: '10px 0 14px' }} />
        {data.isPreInvoice && (
          <div style={{ fontSize: 9, ...muted, marginBottom: 12 }}>{L.preInvoiceNote}</div>
        )}
        {/* Three party columns */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          {columns.map((c, i) => (
            <div key={i} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                {badge(c.icon)}
                <div style={{ fontSize: 8.5, fontWeight: 700, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{c.header}</div>
              </div>
              {c.name && <div style={{ fontSize: 9.5, fontWeight: 700, marginBottom: 2 }}>{c.name}</div>}
              {c.lines.map((l, j) => <div key={j} style={{ fontSize: 8.5, ...muted }}>{l}</div>)}
            </div>
          ))}
        </div>
        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr>
              <th style={cth}>{L.itemCode}</th>
              <th style={cth}>{L.itemDescr}</th>
              <th style={cth}>{L.itemComment}</th>
              <th style={cthR}>{L.unitPrice}</th>
              <th style={cthR}>{L.qty}</th>
              <th style={cth}>{L.unit}</th>
              {anyDiscount && <th style={cthR}>{L.lineDiscount}</th>}
              <th style={cthR}>{L.net}</th>
              <th style={cthR}>{L.vatPct}</th>
              <th style={cthR}>{L.vatAmt}</th>
              {anyOtherTaxes && <th style={cthR}>{L.lineOtherTaxes}</th>}
              <th style={cthR}>{L.totalValue}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i}>
                <td style={{ ...ctd, ...muted }}>{it.sku ?? '—'}</td>
                <td style={ctd}>{it.description}</td>
                <td style={{ ...ctd, ...muted }}>{it.detail ?? ''}</td>
                <td style={ctdR}>{money(it.unitPrice)}</td>
                <td style={ctdR}>{it.qty}</td>
                <td style={ctd}>{it.unit}</td>
                {anyDiscount && <td style={ctdR}>{it.discount > 0 ? `- ${money(it.discount)}` : '—'}</td>}
                <td style={ctdR}>{money(it.net)}</td>
                <td style={ctdR}>
                  {it.vatPct}%
                  {it.exemptionCode ? <sup style={{ ...muted, fontSize: 6.5 }}>{exemptionMarker(it.exemptionCode)}</sup> : null}
                </td>
                <td style={ctdR}>{money(it.vatAmount)}</td>
                {anyOtherTaxes && <td style={ctdR}>{it.otherTaxes > 0 ? money(it.otherTaxes) : '—'}</td>}
                <td style={ctdR}>{money(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Exemptions />
        {/* Notes + VAT analysis (left) + totals with large amount-due (right) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
              <Charges />
              <VatAnalysisTable />
            </div>
            {data.notes && (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{L.notes}</div>
                <div style={{ fontSize: 9, ...muted, whiteSpace: 'pre-wrap' }}>{data.notes}</div>
              </>
            )}
            {data.orderNotes && (
              <div style={{ marginTop: data.notes ? 8 : 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{L.orderNotes}</div>
                <div style={{ fontSize: 9, ...muted, whiteSpace: 'pre-wrap' }}>{data.orderNotes}</div>
              </div>
            )}
          </div>
          <div style={{ width: 250 }}>
            {data.totals.discount > 0 ? (
              <>
                {totalRow(L.price, money(data.totals.subtotalNet))}
                {totalRow(L.discount, `- ${money(data.totals.discount)}`)}
                {totalRow(L.priceAfterDiscount, money(data.totals.priceAfterDiscount))}
              </>
            ) : (
              totalRow(L.subtotalNet, money(data.totals.subtotalNet))
            )}
            {totalRow(L.currency, data.currency)}
            {data.fx && totalRow(L.fxRate, `1 ${data.currency} = ${data.fx.rate} ${data.fx.base}`)}
            {totalRow(L.totalVat, money(data.totals.totalVat))}
            {chargesNet !== 0 && totalRow(L.charges, `${chargesNet < 0 ? '- ' : ''}${money(Math.abs(chargesNet))}`)}
            <div style={{ borderTop: `0.8px solid ${colors.line}`, marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700 }}>{L.total}</span>
              <span style={{ fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap' }}>{money(data.totals.grand)}</span>
            </div>
            {data.totals.amountPaid > 0 && (
              <div style={{ marginTop: 4 }}>
                {totalRow(L.paid, `- ${money(data.totals.amountPaid)}`)}
                {!showPayableBar && totalRow(L.due2, money(data.totals.amountDue), { bold: true })}
              </div>
            )}
            <PayableBar />
            <PriorBalance />
          </div>
        </div>
        <VatSuspended />
        <Payment />
        <PayOnline />
        {data.fiscal && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, ...muted }}>{L.mark}</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{data.fiscal.mark}</div>
            {data.fiscal.authCode && <div style={{ fontSize: 9, ...muted }}>{L.authCode}: {data.fiscal.authCode}</div>}
            {data.fiscal.uid && <div style={{ fontSize: 9, ...muted }}>{L.uid}: {data.fiscal.uid}</div>}
          </div>
        )}
      </div>
    );
  }

  // Sidebar (Modern): a narrow left gutter holding the vertical accent wordmark, body to its right.
  if (spec.headerStyle === 'sidebar') {
    return (
      <div style={sheet} data-invoice-template={spec.id}>
        <div style={{ display: 'flex', gap: '7mm' }}>
          <div style={{ flexShrink: 0, width: 24 }}>
            <div
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: '0.05em',
                color: colors.accent,
                whiteSpace: 'nowrap',
              }}
            >
              {data.issuer.name}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Body />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={sheet} data-invoice-template={spec.id}>
      <Body />
    </div>
  );
}

export default InvoiceDocument;
