import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

import {
  formatInvoiceMoney,
  type InvoiceColors,
  type InvoiceRenderData,
  type InvoiceTemplateSpec,
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

  const Items = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
      <thead>
        <tr>
          <th style={th}>{L.descr}</th>
          <th style={thR}>{L.qty}</th>
          <th style={th}>{L.unit}</th>
          <th style={thR}>{L.unitPrice}</th>
          <th style={thR}>{L.net}</th>
          <th style={thR}>{L.vatPct}</th>
          <th style={thR}>{L.lineTotal}</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((it, i) => (
          <tr key={i}>
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
            <td style={tdR}>{money(it.net)}</td>
            <td style={tdR}>{it.vatPct}%</td>
            <td style={tdR}>{money(it.lineTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // ── Totals + VAT analysis ──
  const totalsBoxStyle: React.CSSProperties =
    spec.totalsBoxStyle === 'boxed'
      ? { border: `1px solid ${colors.line}`, borderRadius: 4, padding: '10px 12px' }
      : {};
  const grandStyle: React.CSSProperties =
    spec.totalsBoxStyle === 'accent'
      ? { background: colors.accent, color: '#ffffff', borderRadius: 4, padding: '8px 10px', marginTop: 6 }
      : { borderTop: `1.5px solid ${colors.line}`, paddingTop: 6, marginTop: 4 };

  const totalRow = (label: string, value: string, opts: { bold?: boolean; accent?: boolean } = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: opts.bold ? 12 : 10, fontWeight: opts.bold ? 800 : 400, color: opts.accent ? '#ffffff' : (opts.bold ? colors.text : colors.muted), padding: '2px 0' }}>
      <span>{label}</span><span style={{ whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );

  const Totals = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start', marginBottom: 16 }}>
      {/* VAT analysis (left) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {data.vatAnalysis.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>{L.vatAnalysis}</div>
            {data.vatAnalysis.map((v, i) => (
              <div key={i} style={{ fontSize: 9, ...muted }}>
                {L.net} {v.pct}%: {money(v.net)} &nbsp;·&nbsp; {L.vatAmt}: {money(v.vat)}
              </div>
            ))}
          </>
        )}
      </div>
      {/* Totals (right) — #227 universal breakdown: Price / Discount / Price after Discount / VAT / … / Final */}
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
        {totalRow(L.totalVat, money(data.totals.totalVat))}
        {data.totals.extras.map((e, i) => (
          <React.Fragment key={i}>{totalRow(e.label, `${e.negative ? '- ' : ''}${money(e.value)}`)}</React.Fragment>
        ))}
        <div style={grandStyle}>
          {totalRow(L.total, money(data.totals.grand), { bold: true, accent: spec.totalsBoxStyle === 'accent' })}
        </div>
        {data.totals.amountPaid > 0 && (
          <div style={{ marginTop: 4 }}>
            {totalRow(L.paid, `- ${money(data.totals.amountPaid)}`)}
            {totalRow(L.due2, money(data.totals.amountDue), { bold: true })}
          </div>
        )}
      </div>
    </div>
  );

  // ── Payment + bank ──
  const Payment = () => {
    const hasPay = data.payment.method || data.payment.info || data.payment.accounts.length > 0;
    if (!hasPay) return null;
    return (
      <div style={{ marginBottom: 12, fontSize: 9.5, ...muted }}>
        {data.payment.method && <div>{L.paymentMethod}: {data.payment.method}</div>}
        {data.payment.info && <div>{data.payment.info}</div>}
        {data.payment.accounts.map((a, i) => (
          <div key={i}>{i === 0 ? `${L.bank}: ${a}` : a}</div>
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
    if (!data.notes && !data.infoBox) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        {data.notes && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, ...muted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{L.notes}</div>
            <div style={{ fontSize: 9.5, ...muted, whiteSpace: 'pre-wrap' }}>{data.notes}</div>
          </>
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

  return (
    <div style={sheet} data-invoice-template={spec.id}>
      <Header />
      <Customer />
      <Items />
      <Totals />
      <Payment />
      <Shipping />
      <Notes />
      <Fiscal />
    </div>
  );
}

export default InvoiceDocument;
