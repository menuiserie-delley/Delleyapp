import { generateDocumentPdf, pdfFilename } from './pdf.js';
import { formatDateDE } from './utils.js';
import { openModal } from './ui.js';
import { tr, resolveText } from './i18n.js';

function mailGreeting(customer, lang) {
  const G = tr(lang).greeting;
  if (!customer) return tr(lang).mail.greetingFallback;
  const nachname = customer.nachname || '';
  if (customer.anrede === 'Frau') return G.Frau(nachname).replace(/,$/, '');
  if (customer.anrede === 'Firma') return G.Firma().replace(/,$/, '');
  if (customer.anrede === 'Divers') return G.Divers([customer.vorname, nachname].filter(Boolean).join(' ')).replace(/,$/, '');
  return G.Herr(nachname).replace(/,$/, '');
}

function buildSubjectBody(doc, customer, settings, stage, lang) {
  const M = tr(lang).mail;
  const title = tr(lang).pdf.stageTitle[stage];
  const subject = `${title} ${doc.number} – ${settings.firma}`;
  const anrede = mailGreeting(customer, lang);
  let body = `${anrede},\n\n`;
  if (stage === 'offerte') {
    body += M.bodyIntro.offerte(doc.number, formatDateDE(doc.datum)) + '\n\n';
  } else if (stage === 'auftragsbestaetigung') {
    body += M.bodyIntro.auftragsbestaetigung(doc.number, formatDateDE(doc.datum)) + '\n\n';
  } else {
    body += M.bodyIntro.rechnung(doc.number, formatDateDE(doc.datum), doc.faelligAm ? formatDateDE(doc.faelligAm) : null) + '\n\n';
  }
  body += `${M.bodyOutro}\n\n${resolveText(lang, settings.grussformel, tr(lang).docDefaults.grussformel)}\n${settings.inhaber || ''}\n${settings.firma || ''}`;
  return { subject, body };
}

export async function sendDocumentMail(doc, customer, settings, stage) {
  const lang = doc.lang || settings.sprache || 'de';
  const M = tr(lang).mail;

  if (!customer || !customer.email) {
    openModal({
      title: M.noEmailTitle,
      bodyHtml: `<p style="margin:0">${M.noEmailBody}</p>`,
      footerHtml: `<button class="btn btn-primary" data-close>${M.ok}</button>`,
      onMount: (root, close) => root.querySelector('[data-close]').addEventListener('click', close),
    });
    return;
  }

  const pdf = await generateDocumentPdf(doc, customer, settings, stage);
  const filename = pdfFilename(doc, stage);
  pdf.save(filename);

  const { subject, body } = buildSubjectBody(doc, customer, settings, stage, lang);
  const mailtoUrl = `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  openModal({
    title: M.downloadedTitle,
    width: '480px',
    bodyHtml: `
      <p style="margin-top:0">${M.downloadedBody(filename)}</p>
      <p>${M.instructions(customer.email)}</p>`,
    footerHtml: `
      <button class="btn" data-close>${tr(lang).common.close}</button>
      <button class="btn btn-primary" data-open-mail>${M.openOutlook}</button>`,
    onMount: (root, close) => {
      root.querySelector('[data-close]').addEventListener('click', close);
      root.querySelector('[data-open-mail]').addEventListener('click', () => {
        window.location.href = mailtoUrl;
      });
    },
  });
}
