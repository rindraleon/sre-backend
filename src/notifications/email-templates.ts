import { SRE_REGION } from "../database/region";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Sanitizes technical errors so no password, token, connection string, or sensitive data ever appears in logs or d. */
export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/(password|passwd|pass|secret|token|authorization|bearer)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\/\/[^/\s@]+@/g, "//[REDACTED]@")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export function formatPortalDateTime(
  date: Date = new Date(),
  timeZone = "Indian/Antananarivo",
): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone,
      dateStyle: "long",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export interface EmailSummaryRow {
  label: string;
  value: string;
}

export interface AdminEventEmailOptions {
  recipientName?: string;
  actionType: string;
  title: string;
  actorName: string;
  actorEmail?: string | null;
  reference?: string | null;
  submittedAt: Date;
  timeZone?: string;
  summaryRows: EmailSummaryRow[];
  contentTitle?: string;
  contentBody?: string;
  adminUrl: string;
  adminLinkLabel?: string;
}

export function buildAdminEventEmail(options: AdminEventEmailOptions): {
  text: string;
  html: string;
} {
  const dateStr = formatPortalDateTime(options.submittedAt, options.timeZone);
  const greeting = options.recipientName
    ? `Bonjour ${options.recipientName},`
    : "Bonjour,";

  const allRows: EmailSummaryRow[] = [
    { label: "Type d'action", value: options.actionType },
    { label: "Expéditeur / Client", value: options.actorName },
    ...(options.actorEmail
      ? [{ label: "Adresse e-mail", value: options.actorEmail }]
      : []),
    ...(options.reference
      ? [{ label: "Référence de suivi", value: options.reference }]
      : []),
    { label: "Date et heure", value: dateStr },
    ...options.summaryRows,
  ];

  const textLines: string[] = [
    greeting,
    "",
    `[Notification Administration SRE · ${SRE_REGION}]`,
    options.title,
    "",
    ...allRows.map((row) => `- ${row.label} : ${row.value}`),
  ];

  if (options.contentBody) {
    textLines.push(
      "",
      `${options.contentTitle ?? "Contenu transmis"} :`,
      options.contentBody,
    );
  }

  if (options.adminUrl) {
    textLines.push(
      "",
      `${options.adminLinkLabel ?? "Consulter dans l'espace administrateur"} : ${options.adminUrl}`,
    );
  }

  textLines.push(
    "",
    `Notification automatique du portail SRE · ${SRE_REGION}.`,
  );

  const htmlRows = allRows
    .map(
      (row) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e3ece7;font-weight:700;color:#314d40;width:38%;vertical-align:top;font-size:13px">${escapeHtml(row.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e3ece7;color:#172e25;font-size:13px">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join("");

  const htmlContentBlock = options.contentBody
    ? `
      <div style="margin:20px 0;padding:16px;background:#f4f7f5;border-left:4px solid #1d6a50;border-radius:6px">
        <strong style="display:block;margin-bottom:8px;color:#172e25;font-size:13px">${escapeHtml(options.contentTitle ?? "Contenu transmis")}</strong>
        <div style="color:#172e25;font-size:14px;line-height:1.6">${options.contentBody
          .split(/\r?\n/)
          .map((line) => escapeHtml(line) || "&nbsp;")
          .join("<br/>")}</div>
      </div>`
    : "";

  const htmlButton = options.adminUrl
    ? `
      <p style="margin:24px 0 16px">
        <a href="${escapeHtml(options.adminUrl)}" style="display:inline-block;background:#1d6a50;color:#ffffff;padding:11px 18px;border-radius:7px;text-decoration:none;font-weight:700;font-size:13px">
          ${escapeHtml(options.adminLinkLabel ?? "Ouvrir dans l'espace administrateur")}
        </a>
      </p>`
    : "";

  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px 12px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#172e25;line-height:1.55">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dce7df;border-radius:12px;overflow:hidden">
    <div style="background:#172e25;color:#ffffff;padding:18px 24px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#89d5ad;font-weight:700">Portail SRE · ${escapeHtml(SRE_REGION)}</div>
      <h1 style="margin:6px 0 0;font-size:18px;font-weight:700;color:#ffffff">${escapeHtml(options.title)}</h1>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;font-size:14px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#314d40">Une nouvelle interaction métier importante a été enregistrée sur le portail et requiert votre attention.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e3ece7;border-radius:8px;overflow:hidden">
        <tbody>${htmlRows}</tbody>
      </table>
      ${htmlContentBlock}
      ${htmlButton}
    </div>
    <div style="padding:14px 24px;background:#f4f7f5;border-top:1px solid #dce7df;font-size:12px;color:#62766a">
      Service Régional des Entreprises (SRE) · Région ${escapeHtml(SRE_REGION)} — Notification administrative automatique.
    </div>
  </div>
</body>
</html>`;

  return { text: textLines.join("\n"), html };
}

export interface AcknowledgmentEmailOptions {
  recipientName: string;
  title: string;
  confirmationIntro: string;
  reference: string;
  actionSummary: string;
  submittedAt: Date;
  timeZone?: string;
  summaryRows: EmailSummaryRow[];
  nextSteps: string[];
  appUrl?: string;
  actionPath?: string;
  actionLabel?: string;
}

export function buildAcknowledgmentEmail(
  options: AcknowledgmentEmailOptions,
): { text: string; html: string } {
  const dateStr = formatPortalDateTime(options.submittedAt, options.timeZone);
  const baseAppUrl = (options.appUrl ?? "").trim().replace(/\/+$/, "");
  const fullActionUrl =
    baseAppUrl && options.actionPath
      ? `${baseAppUrl}/${options.actionPath.replace(/^\/+/, "")}`
      : baseAppUrl;
  const contactUrl = baseAppUrl ? `${baseAppUrl}/accueil#contact` : "";

  const allRows: EmailSummaryRow[] = [
    { label: "Numéro de référence", value: options.reference },
    { label: "Action enregistrée", value: options.actionSummary },
    { label: "Date et heure de soumission", value: dateStr },
    ...options.summaryRows,
  ];

  const textLines: string[] = [
    `Bonjour ${options.recipientName},`,
    "",
    options.title,
    options.confirmationIntro,
    "",
    "Récapitulatif de votre démarche :",
    ...allRows.map((row) => `- ${row.label} : ${row.value}`),
  ];

  if (options.nextSteps.length > 0) {
    textLines.push(
      "",
      "Prochaines étapes :",
      ...options.nextSteps.map((step) => `• ${step}`),
    );
  }

  if (fullActionUrl) {
    textLines.push(
      "",
      `${options.actionLabel ?? "Accéder au portail SRE"} : ${fullActionUrl}`,
    );
  }

  textLines.push(
    "",
    "Coordonnées de l'organisation :",
    `Service Régional des Entreprises (SRE) — Région ${SRE_REGION}`,
    ...(contactUrl ? [`Formulaire de contact : ${contactUrl}`] : []),
    "",
    "Message automatique d'accusé de réception du portail SRE. Ne transmettez jamais votre mot de passe ni vos coordonnées bancaires.",
  );

  const htmlRows = allRows
    .map(
      (row) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e3ece7;font-weight:700;color:#314d40;width:38%;vertical-align:top;font-size:13px">${escapeHtml(row.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e3ece7;color:#172e25;font-size:13px">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join("");

  const htmlNextSteps =
    options.nextSteps.length > 0
      ? `
      <div style="margin:20px 0;padding:15px 18px;background:#eaf4ee;border:1px solid #cbe2d4;border-radius:8px">
        <strong style="display:block;margin-bottom:8px;color:#155440;font-size:13px">Prochaines étapes</strong>
        <ul style="margin:0;padding-left:18px;color:#172e25;font-size:13px;line-height:1.6">
          ${options.nextSteps.map((step) => `<li style="margin-bottom:4px">${escapeHtml(step)}</li>`).join("")}
        </ul>
      </div>`
      : "";

  const htmlButton = fullActionUrl
    ? `
      <p style="margin:22px 0 14px">
        <a href="${escapeHtml(fullActionUrl)}" style="display:inline-block;background:#1d6a50;color:#ffffff;padding:11px 18px;border-radius:7px;text-decoration:none;font-weight:700;font-size:13px">
          ${escapeHtml(options.actionLabel ?? "Consulter mon espace SRE")}
        </a>
      </p>`
    : "";

  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px 12px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#172e25;line-height:1.55">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dce7df;border-radius:12px;overflow:hidden">
    <div style="background:#1d6a50;color:#ffffff;padding:18px 24px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#d6f5e3;font-weight:700">Accusé de réception · Portail SRE ${escapeHtml(SRE_REGION)}</div>
      <h1 style="margin:6px 0 0;font-size:18px;font-weight:700;color:#ffffff">${escapeHtml(options.title)}</h1>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;font-size:14px">Bonjour <strong>${escapeHtml(options.recipientName)}</strong>,</p>
      <p style="margin:0 0 16px;font-size:14px;color:#314d40">${escapeHtml(options.confirmationIntro)}</p>
      <div style="margin:0 0 16px;padding:12px 16px;background:#f4f7f5;border:1px solid #dce7df;border-radius:8px">
        <span style="font-size:12px;color:#62766a;display:block">Référence de suivi</span>
        <strong style="font-size:16px;color:#1d6a50;letter-spacing:0.5px">${escapeHtml(options.reference)}</strong>
      </div>
      <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e3ece7;border-radius:8px;overflow:hidden">
        <tbody>${htmlRows}</tbody>
      </table>
      ${htmlNextSteps}
      ${htmlButton}
      <div style="margin-top:22px;padding-top:14px;border-top:1px solid #e3ece7;font-size:12px;color:#62766a">
        <strong>Coordonnées de contact :</strong><br/>
        Service Régional des Entreprises (SRE) · Région ${escapeHtml(SRE_REGION)}, Madagascar
        ${contactUrl ? `<br/><a href="${escapeHtml(contactUrl)}" style="color:#1d6a50;text-decoration:underline">Contacter l'administration via le portail officiel</a>` : ""}
      </div>
    </div>
    <div style="padding:14px 24px;background:#f4f7f5;border-top:1px solid #dce7df;font-size:11.5px;color:#62766a">
      Cet accusé de réception est généré automatiquement après l'enregistrement de votre action. Ne transmettez jamais votre mot de passe ni vos coordonnées bancaires.
    </div>
  </div>
</body>
</html>`;

  return { text: textLines.join("\n"), html };
}

export interface ContactReplyEmailOptions {
  recipientName: string;
  reference: string;
  originalSubject: string;
  originalMessage: string;
  originalDate: Date;
  replySubject: string;
  replyMessage: string;
  administratorName: string;
  appUrl?: string;
  timeZone?: string;
}

export function buildContactReplyEmail(options: ContactReplyEmailOptions): {
  text: string;
  html: string;
} {
  const originalDateStr = formatPortalDateTime(
    options.originalDate,
    options.timeZone,
  );
  const baseAppUrl = (options.appUrl ?? "").trim().replace(/\/+$/, "");

  const text = [
    `Bonjour ${options.recipientName},`,
    "",
    `Suite à votre message enregistré sous la référence ${options.reference}, voici la réponse de l'administration du Service Régional des Entreprises (${SRE_REGION}) :`,
    "",
    options.replyMessage,
    "",
    `Réponse traitée par : ${options.administratorName}`,
    "---",
    `Rappel de votre message initial (${originalDateStr}) :`,
    `Sujet : ${options.originalSubject}`,
    options.originalMessage,
    "",
    ...(baseAppUrl ? [`Portail officiel SRE : ${baseAppUrl}`] : []),
    `Service Régional des Entreprises (SRE) · Région ${SRE_REGION}`,
  ].join("\n");

  const htmlReply = options.replyMessage
    .split(/\r?\n/)
    .map((line) => escapeHtml(line) || "&nbsp;")
    .join("<br/>");

  const htmlOriginal = options.originalMessage
    .split(/\r?\n/)
    .map((line) => escapeHtml(line) || "&nbsp;")
    .join("<br/>");

  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px 12px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#172e25;line-height:1.55">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dce7df;border-radius:12px;overflow:hidden">
    <div style="background:#172e25;color:#ffffff;padding:18px 24px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#89d5ad;font-weight:700">Service Régional des Entreprises · ${escapeHtml(SRE_REGION)}</div>
      <h1 style="margin:6px 0 0;font-size:18px;font-weight:700;color:#ffffff">${escapeHtml(options.replySubject)}</h1>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;font-size:14px">Bonjour <strong>${escapeHtml(options.recipientName)}</strong>,</p>
      <p style="margin:0 0 16px;font-size:14px;color:#314d40">
        Suite à votre demande enregistrée sous la référence <strong>${escapeHtml(options.reference)}</strong>, veuillez trouver ci-dessous la réponse de notre service :
      </p>
      <div style="margin:18px 0;padding:18px;background:#f4f7f5;border-left:4px solid #1d6a50;border-radius:8px;color:#172e25;font-size:14px;line-height:1.65">
        ${htmlReply}
      </div>
      <p style="margin:14px 0 20px;font-size:12.5px;color:#62766a">
        Réponse transmise par : <strong>${escapeHtml(options.administratorName)}</strong> · Administration SRE ${escapeHtml(SRE_REGION)}
      </p>
      <div style="margin-top:20px;padding:14px 16px;background:#fafcfb;border:1px solid #e3ece7;border-radius:8px;font-size:12.5px;color:#62766a">
        <strong style="display:block;margin-bottom:6px;color:#314d40">Votre message initial (${escapeHtml(originalDateStr)}) — Sujet : ${escapeHtml(options.originalSubject)}</strong>
        <div>${htmlOriginal}</div>
      </div>
      ${
        baseAppUrl
          ? `<p style="margin:20px 0 0;font-size:13px"><a href="${escapeHtml(baseAppUrl)}" style="color:#1d6a50;font-weight:700;text-decoration:underline">Accéder au portail SRE · ${escapeHtml(SRE_REGION)}</a></p>`
          : ""
      }
    </div>
    <div style="padding:14px 24px;background:#f4f7f5;border-top:1px solid #dce7df;font-size:11.5px;color:#62766a">
      Service Régional des Entreprises (SRE) · Région ${escapeHtml(SRE_REGION)}, Madagascar. Ne transmettez jamais votre mot de passe ni vos coordonnées bancaires par courriel.
    </div>
  </div>
</body>
</html>`;

  return { text, html };
}
