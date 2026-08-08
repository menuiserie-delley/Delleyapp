import { getOne, put } from './db.js';

const SETTINGS_ID = 'main';

export const DEFAULT_SETTINGS = {
  id: SETTINGS_ID,
  firma: 'Menuiserie Delley',
  inhaber: 'Benjamin Gerber',
  adresse: 'Haselweg 10',
  plzOrt: '2553 Safnern',
  telefon: '078 829 74 77',
  email: 'info@menuiserie-delley.ch',
  website: 'www.menuiserie-delley.ch',
  bankName: 'PostFinance',
  iban: 'CH74 0900 0000 4042 8530 8',
  kontoinhaber: 'Benjamin Gerber',
  mwstSatz: 8.1,
  zahlungsfristTage: 14,
  gueltigkeitTage: 30,
  naechsteNummer: 1501,
  einheiten: ['Std', 'Stk', 'm²', 'm³', 'lfm', '%', 'Set', 'Paar', 'kg', 't', 'Liter', 'Pack', 'Rolle', 'Sack', 'Gebinde', 'Palette', 'Beutel', 'Bund'],
  farbe: '#2e5254',
  sprache: 'de',

  textOfferteEinleitung:
    'Besten Dank für Ihre Anfrage und das damit verbundene Interesse an unseren Leistungen. Gerne unterbreiten wir Ihnen nachfolgend unser Angebot inklusive der entsprechenden Liefer- und Montagebedingungen:',
  textOfferteSchluss:
    'Wir freuen uns, Ihnen dieses Angebot unterbreiten zu dürfen und stehen Ihnen für die Ausführung des beschriebenen Projekts gerne zur Verfügung. Für Rückfragen oder ergänzende Auskünfte sind wir jederzeit gerne für Sie da.\nSämtliche Preise verstehen sich exklusive Mehrwertsteuer und basieren auf den angegebenen Mengen und Leistungen.\n\nPreis- und Konditionsänderungen seitens unserer Lieferanten bleiben ausdrücklich vorbehalten. Änderungen oder Erweiterungen des Leistungsumfangs sowie Abweichungen der vorgesehenen Mengen werden zusätzlich nach effektivem Zeit- und Materialaufwand verrechnet.\n\nFür Lieferverzögerungen, die durch unsere Lieferanten verursacht werden, übernehmen wir keine Haftung.\n\nSofern dieses Angebot Ihren Vorstellungen entspricht, bitten wir Sie, uns eine unterzeichnete Ausfertigung zur Bestätigung zu retournieren.',

  textAbEinleitung:
    'Besten Dank für Ihren Auftrag und das damit verbundene Vertrauen. Gerne bestätigen wir Ihnen nachfolgend die vereinbarten Leistungen gemäss unserer Offerte inklusive der entsprechenden Liefer- und Montagebedingungen:',
  textAbSchluss:
    'Wir freuen uns über Ihren Auftrag und werden die beschriebenen Arbeiten wie vereinbart ausführen. Für Rückfragen oder ergänzende Auskünfte sind wir jederzeit gerne für Sie da.\nSämtliche Preise verstehen sich exklusive Mehrwertsteuer und basieren auf den bestätigten Mengen und Leistungen.\n\nPreis- und Konditionsänderungen seitens unserer Lieferanten bleiben ausdrücklich vorbehalten. Änderungen oder Erweiterungen des Leistungsumfangs sowie Abweichungen der vorgesehenen Mengen werden zusätzlich nach effektivem Zeit- und Materialaufwand verrechnet.\n\nFür Lieferverzögerungen, die durch unsere Lieferanten verursacht werden, übernehmen wir keine Haftung.\n\nBitte prüfen Sie diese Auftragsbestätigung. Sollten Angaben nicht Ihren Vorstellungen entsprechen, bitten wir um Rückmeldung innerhalb von 5 Arbeitstagen.',

  textRechnungEinleitung:
    'Besten Dank für den geschätzten Auftrag und das entgegengebrachte Vertrauen. Gerne stellen wir Ihnen für die ausgeführten Arbeiten folgende Rechnung.\nFür Fragen stehen wir Ihnen jederzeit gerne zur Verfügung und freuen uns auf eine weiterhin angenehme Zusammenarbeit.',
  textRechnungZahlung:
    'Bitte überweisen Sie den Gesamtbetrag innerhalb von {frist} Tagen nach Rechnungsdatum auf das folgende Konto:',
  textRechnungSchluss:
    'Wir danken Ihnen, dass Sie uns die Möglichkeit gegeben haben, die oben genannte Bestellung / Auftrag auszuführen. Bei Fragen zu dieser Rechnung stehen wir Ihnen gerne zur Verfügung. Diese Rechnung ist ohne Unterschrift gültig und innerhalb von {frist} Tagen zahlbar.',

  grussformel: 'Mit freundlichen Grüßen,',
};

export async function loadSettings() {
  const existing = await getOne('settings', SETTINGS_ID);
  if (existing) {
    // Fehlende neue Felder mit Defaults auffüllen (Update-sicher)
    return { ...DEFAULT_SETTINGS, ...existing };
  }
  await put('settings', DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings) {
  const toSave = { ...settings, id: SETTINGS_ID };
  await put('settings', toSave);
  return toSave;
}
